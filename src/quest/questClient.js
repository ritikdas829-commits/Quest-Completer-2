import { Constants } from './constants.js';
import { QuestManager } from './questManager.js';

const BASE_URL    = 'https://discord.com/api/v10';
const BASE_URL_V9 = 'https://discord.com/api/v9';
const RETRYABLE   = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export class QuestClient {
    #token;
    questManager = null;
    aborted = false;

    constructor(userToken) { this.#token = userToken; }
    abort() { this.aborted = true; }

    #buildHeaders() {
        return {
            'Authorization':      this.#token,
            'User-Agent':         Constants.USER_AGENT,
            'Content-Type':       'application/json',
            'accept-language':    'vi',
            'origin':             'https://discord.com',
            'pragma':             'no-cache',
            'priority':           'u=1, i',
            'referer':            'https://discord.com/channels/@me',
            'sec-ch-ua':          '"Not)A;Brand";v="8", "Chromium";v="138"',
            'sec-ch-ua-mobile':   '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest':     'empty',
            'sec-fetch-mode':     'cors',
            'sec-fetch-site':     'same-origin',
            'x-debug-options':    'bugReporterEnabled',
            'x-discord-locale':   'en-US',
            'x-discord-timezone': 'Asia/Saigon',
            'x-super-properties': Buffer.from(JSON.stringify(Constants.Properties)).toString('base64'),
        };
    }

    async #request(method, path, body, query) {
        const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            let res;
            try {
                res = await fetch(url, {
                    method,
                    headers: this.#buildHeaders(),
                    body: body !== undefined ? JSON.stringify(body) : undefined,
                });
            } catch (err) {
                if (attempt < MAX_RETRIES) { await sleep(2 ** attempt * 1000); continue; }
                throw new Error(`Network error on ${method} ${path}: ${err.message}`);
            }
            if (res.status === 429) {
                const retryAfter = Number(res.headers.get('retry-after') ?? 1) * 1000;
                await sleep(retryAfter);
                continue;
            }
            if (!res.ok) {
                if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
                    await sleep(2 ** attempt * 1500);
                    continue;
                }
                const text = await res.text();
                // FIX: Don't throw on already enrolled - ignore
                if (path.includes('/enroll') && text.includes('already')) return { enrolled: true };
                throw new Error(`${res.status}: ${res.statusText} — ${text}`);
            }
            return res.json();
        }
        throw new Error(`Max retries exceeded for ${method} ${path}`);
    }

    async get(path, query) { return this.#request('GET', path, undefined, query); }
    async post(path, body) { return this.#request('POST', path, body); }

    async rawCall(method, path, body, base = 'v10') {
        const baseUrl = base === 'v9' ? BASE_URL_V9 : BASE_URL;
        try {
            const res = await fetch(`${baseUrl}${path}`, {
                method,
                headers: this.#buildHeaders(),
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            return { status: res.status, text: await res.text() };
        } catch (err) {
            return { status: 0, text: err?.message ?? 'network error' };
        }
    }

    async fetchQuests() {
        const response = await this.get('/quests/@me');
        this.questManager = QuestManager.fromResponse(this, response);
        if (!this.questManager.filterQuestsValid) {
            this.questManager.filterQuestsValid = () => {
                const all = this.questManager.quests || this.questManager.all || [];
                return all.filter(q => {
                    const conf = q.config || q;
                    const exp = conf.expires_at || conf.expiresAt;
                    if (exp && new Date(exp) < new Date()) return false;
                    return true;
                });
            };
        }
        return this.questManager;
    }

    // FIXED - Real Orbie system - PLAY + WATCH both supported
    async doingQuest(quest, onProgress) {
        this.aborted = false;
        const config = quest.config || quest;
        const questId = config.id || quest.id;
        // FIX 1: appId fallback chain - kabhi undefined nahi jayega
        const appId = config.application?.id || config.applicationId || config.application_id || quest.application?.id || config.application?.id || '0';
        
        if (!questId) throw new Error('Invalid quest ID');

        // 1. Enroll - ignore already enrolled error
        try {
            await this.post(`/quests/${questId}/enroll`, {});
        } catch (e) {
            if (!e.message.includes('already') && !e.message.includes('enrolled')) {
                console.log('Enroll note:', e.message.slice(0,100));
            }
        }

        const taskCfg = config.task_config || config.task_config_v2 || config.taskConfig || {};
        const tasks = taskCfg.tasks || {};
        const taskKeys = Object.keys(tasks);
        const firstKey = taskKeys[0] || 'PLAY_ON_DESKTOP';
        const isVideo = taskKeys.some(k=>k.toUpperCase().includes('WATCH'));
        
        // FIX 2: Target sahi lo - VIDEO 40s, PLAY 900s (15m)
        let target = tasks[firstKey]?.target || 0;
        if (target === 0) {
            if (isVideo) target = 40; // Melon 40s
            else target = 900; // ROR2 15m
        }

        let elapsed = 0;
        const step = isVideo ? 5 : 30; // Video fast, Play slow

        while (elapsed <= target) {
            if (this.aborted) throw new Error('Stopped by user');

            // Heartbeat - FIX 3: sahi payload
            const payload = {
                quest_id: questId,
                application_id: appId,
                task_name: firstKey,
            };
            // Discord expects different fields for different quest types
            if (isVideo) {
                payload.progress = elapsed;
                payload.video_progress = elapsed;
            } else {
                payload.progress = elapsed;
                payload.playtime = elapsed;
            }

            try {
                await this.post(`/quests/${questId}/heartbeat`, payload);
            } catch (e) {
                // Try v9 as fallback
                try {
                    await this.rawCall('POST', `/quests/${questId}/heartbeat`, payload, 'v9');
                } catch {}
                // Ignore heartbeat errors - continue progress
            }

            if (onProgress) onProgress(elapsed, target);
            if (elapsed >= target) break;

            // Real-time check
            try {
                const fresh = await this.get(`/quests/@me`);
                const mgr = QuestManager.fromResponse(this, fresh);
                const current = (mgr.quests || []).find(q => (q.id||q.config?.id)==questId);
                const status = current?.user_status || current?.userStatus || {};
                if (status.completed_at || status.claimed_at) {
                    if (onProgress) onProgress(target, target);
                    break;
                }
            } catch {}

            await sleep(isVideo ? 1000 : 3000); // Video 1s, Play 3s for fast demo (real me 30s)
            elapsed += step;
        }

        // Claim
        try { await this.post(`/quests/${questId}/claim`, {}); } catch {}
        try { await this.post(`/quests/${questId}/reward`, {}); } catch {}

        return true;
    }

    async fetchQuestsRaw() { return this.get('/quests/@me'); }
    async fetchUserRaw()   { return this.get('/users/@me'); }
}
