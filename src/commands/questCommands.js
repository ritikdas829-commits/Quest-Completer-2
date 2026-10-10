import { 
    SlashCommandBuilder, 
    ContainerBuilder, 
    TextDisplayBuilder, 
    MediaGalleryBuilder, 
    MediaGalleryItemBuilder, 
    SeparatorBuilder, 
    SeparatorSpacingSize, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    MessageFlags 
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

function fmtDate(d) {
    if (!d) return '-';
    try { const date = new Date(d); if (isNaN(date.getTime())) return '-'; return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`; } catch { return '-'; }
}

// V1 REBUILT - EXACT ORBIE BANNER LOGIC - FIXES POOP, SHOWS COOL THUMBNAIL LIKE PHOTO
function resolveBanner(cfg) {
    const app = cfg.application || {};
    const assets = cfg.assets || {};
    const appId = app.id || '';
    if (!appId) return null;
    const tasks = cfg.task_config?.tasks || {};
    const isVideo = Object.keys(tasks).some(k=>k.toUpperCase().includes('WATCH'));
    const getUrl = (hash, folder) => {
        if(!hash) return null;
        if(typeof hash==='string' && hash.startsWith('http')) return hash;
        if(typeof hash!=='string' || hash.length < 10) return null;
        return `https://cdn.discordapp.com/app-assets/${appId}/${folder}/${hash}.png`;
    };
    // EXACT LIKE PHOTO - Melon Sandbox uses game_tile which has Google Play + App Store
    if(isVideo){
        return getUrl(assets.game_tile, 'quest-assets') || getUrl(assets.hero, 'store') || getUrl(assets.quest_tile, 'quest-assets') || getUrl(assets.hero_video, 'quest-assets');
    } else {
        return getUrl(assets.hero, 'store') || getUrl(assets.game_tile, 'quest-assets') || getUrl(assets.quest_tile, 'quest-assets');
    }
}

function parseTasks(taskObj) {
    const tasks = taskObj || {};
    let list = [];
    for (const [key, val] of Object.entries(tasks)) {
        const target = val.target || 0;
        const k = key.toUpperCase();
        if (k.includes('PLAY_ON_DESKTOP')) {
            list.push({ label: 'Desktop', icon: '⬜', taskText: `Play On Desktop for ${target===0?`0m`:`${Math.ceil(target/60)}m`}`, target, key });
        } else if (k.includes('PLAY_ON_XBOX')) {
            list.push({ label: 'Xbox', icon: '🟩', taskText: `Play On Xbox ${target} times`, target, key });
        } else if (k.includes('PLAY_ON_PLAYSTATION')) {
            list.push({ label: 'PlayStation', icon: '🟦', taskText: `Play On Playstation ${target} times`, target, key });
        } else if (k.includes('WATCH') && k.includes('MOBILE')) {
            list.push({ label: 'Mobile', icon: '📱', taskText: `Watch Video On Mobile for ${target===0?'0m':`${target}s`}`, target, key });
        } else if (k.includes('WATCH')) {
            list.push({ label: 'Web/Desktop', icon: '🎬', taskText: `Watch Video for ${target===0?'0m':`${target}s`}`, target, key });
        } else {
            list.push({ label: 'Desktop', icon: '⬜', taskText: `Play On Desktop for ${target===0?'0m':`${Math.ceil(target/60)}m`}`, target, key });
        }
    }
    const seen=new Set(); const unique=[]; for(const p of list){ if(!seen.has(p.taskText)){ seen.add(p.taskText); unique.push(p);} }
    return unique.length?unique:[{label:'Web/Desktop', icon:'🎬', taskText:'Watch Video for 0m', target:0, key:'WATCH_VIDEO'}];
}

function getData(q) {
    const cfg = q.config || q;
    const msgs = cfg.messages || {};
    const app = cfg.application || {};
    const us = q.user_status || {};
    const rewards = cfg.rewards_config?.rewards || [];
    const taskCfg = cfg.task_config ?? cfg.task_config_v2 ?? {};
    
    const game = msgs.game_title || app.name || 'Discord Quest';
    const questName = msgs.quest_name || cfg.title || game;
    const publisher = msgs.game_publisher || 'Unknown';
    
    let rewardLines = rewards.length ? rewards.map(r => r.messages?.name || r.name || `${r.orb_quantity} Orbs`) : ['200 Orbs'];
    rewardLines = [...new Set(rewardLines)].filter(Boolean);
    
    const parsed = parseTasks(taskCfg.tasks || {});
    let overall = typeof us.progress === 'number' ? Math.round(us.progress * 100) : 0;
    if (us.completed_at) overall = 100;
    
    return {
        game, publisher, questName,
        banner: resolveBanner(cfg),
        rewardLines, taskList: parsed.map(p => p.taskText), progressList: parsed,
        overall, enrolled: us.enrolled_at ? fmtDate(us.enrolled_at) : '-', expires: cfg.expires_at ? fmtDate(cfg.expires_at) : '-',
        questId: String(q.id || ''), completed: !!us.completed_at, isEnrolled: !!us.enrolled_at
    };
}

function buildV1(d, all, logText) {
    const main = new ContainerBuilder().setAccentColor(d.completed ? 0x57F287 : 0x2B2D31);
    
    // EXACT LIKE PHOTO - Progress with icons
    let prog = '';
    const pct = d.overall || 0;
    const isVideo = d.progressList.some(p=>p.label==='Web/Desktop'||p.label==='Mobile');
    
    if (d.completed) {
        if(isVideo){
            prog = `✅ 100%\n🎬 Web/Desktop: 100%\n📱 Mobile: 100%`;
        } else {
            prog = `✅ 100%\n` + d.progressList.map(p=>`${p.icon} ${p.label}: 100%`).join('\n');
        }
    } else {
        if(isVideo){
            prog = `🔄 ${pct}%\n🎬 Web/Desktop: ${pct}%\n📱 Mobile: ${pct}%`;
            if(!d.isEnrolled) prog = `🔄 0%\n🎬 Web/Desktop: 0%\n📱 Mobile: 0%`;
        } else {
            prog = `🔄 ${pct}%\n` + d.progressList.map(p=>`${p.icon} ${p.label}: ${pct}%`).join('\n');
            if(!d.isEnrolled) prog = `🔄 0%\n` + d.progressList.map(p=>`${p.icon} ${p.label}: 0%`).join('\n');
        }
    }

    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🌀 Quest Solver\n\n` +
        `• **Game:** ${d.game}\n` +
        `• **Publisher:** ${d.publisher}\n` +
        `• **Quest Name:** ${d.questName}\n` +
        `• **Enrolled At:** ${d.enrolled}\n` +
        `• **Expires At:** ${d.expires}\n` +
        `• **Progress:**\n${prog}\n\n` +
        `### Rewards:\n` + d.rewardLines.map(r => `• ${r}`).join('\n') + `\n\n` +
        `### Tasks:\n` + d.taskList.map(t => `• ${t}`).join('\n')
    ));
    
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

    // COOL THUMBNAIL - EXACT LIKE PHOTO - Melon with Google Play/App Store
    if (d.banner) {
        try {
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        } catch {}
    }

    const opts = (all || []).slice(0, 25).map(q => {
        const rd = getData(q);
        const firstTask = rd.progressList[0];
        const tVal = firstTask?.target || 0;
        const dStr = tVal === 0 ? '0m' : (tVal < 60 ? `${tVal}s` : `${Math.ceil(tVal / 60)}m`);
        return {
            label: `${rd.game}: ${rd.questName}`.slice(0, 100),
            value: rd.questId,
            description: `${rd.rewardLines[0].slice(0,20)} | ${dStr} | ${rd.overall}%`.slice(0, 100),
            default: rd.questId === d.questId
        };
    });

    main.addActionRowComponents(r => r.addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('quest_select_menu')
            .setPlaceholder(`${d.game}: ${d.questName}`.slice(0, 100))
            .addOptions(opts)
    ));
    
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    // EXACT BUTTONS LIKE PHOTO - Start / Stop / Refresh
    main.addActionRowComponents(r => r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setEmoji({ name: '▶️' }).setDisabled(d.completed),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({ name: '⏹️' }),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({ name: '🔄' })
    ));
    
    main.addActionRowComponents(r => r.addComponents(
        new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)
    ));

    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logText}\n\`\`\``));

    return { components: [main, logs], flags: MessageFlags.IsComponentsV2 };
}

function buildLink() { 
    const c = new ContainerBuilder().setAccentColor(0xFEE75C); 
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required\nUse \`/link\` first.`)); 
    return { components: [c], flags: MessageFlags.IsComponentsV2 }; 
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver V1 Rebuilt Exact'),
    prefix: 'quest',
    async execute(i, c) {
        await i.deferReply();
        const t = await c.tokenStore.get(i.user.id);
        if (!t) { await i.followUp(buildLink()); return; }
        try {
            const { QuestClient } = await import('../quest/questClient.js');
            const qc = new QuestClient(t);
            const m = await qc.fetchQuests();
            const v = m.filterQuestsValid ? m.filterQuestsValid() : m.quests || [];
            if (!v.length) { 
                const cc = new ContainerBuilder().setAccentColor(0x4F545C); 
                cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests Available`)); 
                await i.followUp({ components: [cc], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            const rd=getData(v[0]);
            await i.followUp(buildV1(rd, v, `🧭 Quest selected\n📝 Enrolled`));
        } catch (e) {
            const cc = new ContainerBuilder().setAccentColor(0xED4245); 
            cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0, 500)}`)); 
            await i.followUp({ components: [cc], flags: MessageFlags.IsComponentsV2 });
        }
    },
    async prefixExecute(m, a, c) {
        const t = await c.tokenStore.get(m.author.id);
        if (!t) { await m.channel.send(buildLink()); return; }
        try {
            const { QuestClient } = await import('../quest/questClient.js');
            const qc = new QuestClient(t);
            const mm = await qc.fetchQuests();
            const v = mm.filterQuestsValid ? mm.filterQuestsValid() : mm.quests || [];
            if (!v.length) return;
            const rd=getData(v[0]);
            await m.channel.send(buildV1(rd, v, `🧭 Quest selected\n📝 Enrolled`));
        } catch {}
    },
    async handleSelectMenu(i, c) {
        if (i.customId !== 'quest_select_menu') return;
        try { await i.deferUpdate(); } catch {}
        try {
            const t = await c.tokenStore.get(i.user.id);
            const { QuestClient } = await import('../quest/questClient.js');
            const qc = new QuestClient(t);
            const m = await qc.fetchQuests();
            const v = m.filterQuestsValid ? m.filterQuestsValid() : m.quests || [];
            const sel = v.find(q => String(q.id) === i.values[0]) || v[0];
            const rd=getData(sel);
            await i.editReply(buildV1(rd, v, `🧭 Quest selected\n📝 Enrolled`)).catch(() => {});
        } catch {}
    },
    async handleButton(i, c) {
        if (!i.customId.startsWith('quest_')) return;
        const w = i.customId.replace('quest_', ''); 
        const sep = w.indexOf('_'); 
        if (sep === -1) return; 
        const act = w.slice(0, sep); 
        const qId = w.slice(sep + 1);
        
        try { await i.deferUpdate(); } catch {}
        const t = await c.tokenStore.get(i.user.id); 
        if (!t) return;
        
        const { QuestClient } = await import('../quest/questClient.js');
        const qc = new QuestClient(t);
        const m = await qc.fetchQuests();
        const v = m.filterQuestsValid ? m.filterQuestsValid() : m.quests || [];
        let quest = v.find(q => String(q.id) === qId) || v[0];
        
        if (act === 'start') {
            let rd = getData(quest);
            if (!rd.isEnrolled) {
                try {
                    await qc.enrollQuest?.(quest);
                    const freshEnroll = await qc.fetchQuests();
                    const fv = freshEnroll.filterQuestsValid ? freshEnroll.filterQuestsValid() : freshEnroll.quests || [];
                    quest = fv.find(q => String(q.id) === qId) || fv[0];
                    rd = getData(quest);
                    await i.editReply(buildV1(rd, fv, `🧭 Quest selected\n📝 Enrolled At: ${rd.enrolled}\n▶️ Solving started...`)).catch(()=>{});
                } catch (err) {
                    await i.editReply(buildV1(rd, v, `❌ Enroll failed: ${err.message}`)).catch(()=>{}); return;
                }
            } else {
                await i.editReply(buildV1(rd, v, `🧭 Quest selected\n▶️ Solving started...`)).catch(()=>{});
            }

            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done, total) => {
                        const p = Math.round((done / total) * 100);
                        const upd = { ...quest, config: quest.config, user_status: { ...quest.user_status, progress: p / 100, enrolled_at: quest.user_status?.enrolled_at || new Date().toISOString() } };
                        const fresh = v.map(x => String(x.id) === qId ? upd : x);
                        const ud = getData(upd);
                        const bar = '█'.repeat(Math.floor(p / 10)) + '░'.repeat(10 - Math.floor(p / 10));
                        const log = `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Progress -> ${ud.questName} [${p}%] [${bar}]`;
                        i.editReply(buildV1(ud, fresh, log)).catch(() => {});
                    });
                    const doneQ = { ...quest, config: quest.config, user_status: { progress: 1, completed_at: new Date().toISOString(), enrolled_at: quest.user_status?.enrolled_at || new Date().toISOString() } };
                    const dd = getData(doneQ);
                    await i.editReply(buildV1(dd, v, `Completed! ${dd.rewardLines[0]} claimed!`)).catch(() => {});
                } catch (err) {
                    await i.editReply(buildV1(getData(quest), v, `❌ Error: ${err.message}`)).catch(() => {});
                }
            });
        } else if (act === 'stop') {
            await i.editReply(buildV1(getData(quest), v, `🧭 Quest selected\n⏹️ Stopped`)).catch(() => {});
        } else if (act === 'refresh') {
            const fresh = await qc.fetchQuests(); const fv = fresh.filterQuestsValid ? fresh.filterQuestsValid() : fresh.quests || []; const fq = fv.find(q => String(q.id) === qId) || fv[0]; const rd=getData(fq);
            await i.editReply(buildV1(rd, fv, `🧭 Quest selected\n📝 Enrolled`)).catch(() => {});
        }
    }
};
