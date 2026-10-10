import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

// Active background quest runners map
const activeQuestRunners = new Map();

function fmtDate(s) {
    try { 
        const d = new Date(s); 
        return isNaN(d.getTime()) ? new Date().toLocaleDateString('en-US') : d.toLocaleDateString('en-US'); 
    } catch { 
        return new Date().toLocaleDateString('en-US'); 
    }
}

const PUBLISHER_MAP = {
    'risk of rain 2': 'Gearbox Publishing',
    'march of giants': 'Ubisoft',
    'aion 2': 'NCSoft',
    'melon sandbox': 'Discord',
    'vision': 'Discord',
    'monopoly go': 'Scopely',
    'deadzone': 'Prophecy Games',
    'arc raiders': 'Embark',
    'empires & puzzles': 'Take-Two Interactive',
    'discord': 'Discord'
};

function getReal(q) {
    const cfg = q.config || q;
    const app = cfg.application || {};
    const us = q.user_status || {};
    
    const game = cfg.messages?.game_title || cfg.messages?.gameTitle || app.name || 'AION 2';
    let publisher = cfg.messages?.publisher || cfg.messages?.publisherName || app.publisher || null;
    
    if (!publisher) {
        const low = (game + ' ' + (cfg.messages?.quest_name || cfg.messages?.questName || '')).toLowerCase();
        for (const [k, v] of Object.entries(PUBLISHER_MAP)) {
            if (low.includes(k)) { publisher = v; break; }
        }
        if (!publisher) publisher = 'NC';
    }
    
    const questName = cfg.messages?.quest_name || cfg.messages?.questName || game;
    
    // Robust Banner Resolution for Discord Quests
    let banner = cfg.assets?.hero || cfg.assets?.heroVideo || cfg.assets?.gameTile || app.assets?.hero || null;
    if (banner && !banner.startsWith('http')) {
        // Construct Discord CDN quest asset URL if it's a hash/filename
        banner = `https://cdn.discordapp.com/quests/${q.id \vert{}\vert{} cfg.id}/${banner}.png`;
    } else if (!banner && cfg.application?.id) {
        banner = `https://cdn.discordapp.com/app-icons/${cfg.application.id}/${app.icon || 'icon'}.png`;
    }
    if (!banner && game.toLowerCase().includes('risk of rain')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/632360/header.jpg';
    }

    const rewards = cfg.rewards || cfg.reward_store_listing || [];
    const rewardCount = rewards[0]?.count || rewards[0]?.reward?.amount || 700;
    
    const taskCfg = cfg.task_config || cfg.taskConfig || {};
    const task = Object.values(taskCfg.tasks || {})[0] || {};
    const minutes = Math.round((task.target || 900) / 60);
    
    let enrolled = us.enrolled_at || new Date().toISOString();
    const expires = cfg.expires_at || cfg.expiresAt;
    let progress = us.progress ? Math.round(us.progress * 100) : (us.completed_at ? 100 : 0);
    
    return { game, publisher, questName, banner, rewardCount, minutes, enrolled, expires, progress, questId: String(q.id || cfg.id || 'default_quest') };
}

function build(quest, allQuests, logStatus, opts = {}) {
    const d = getReal(quest);
    const progress = opts.progress ?? d.progress;
    const desktop = opts.desktop ?? progress;
    const main = new ContainerBuilder().setAccentColor(0x5865F2);
    
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🛡️ Quest Solver\n\n• **Game:** ${d.game}\n• **Publisher:** ${d.publisher}\n• **Quest Name:** ${d.questName}\n• **Enrolled At:** ${fmtDate(opts.enrolledAt || d.enrolled)}\n• **Expires At:** ${fmtDate(opts.expiresAt \vert{}\vert{} d.expires)}\n• **Progress:**\n${progress>=100?'✅':'⏳'} ${progress}\%\n${progress>=100?'✅':'💻'} Desktop: ${desktop}\%\n\n### Rewards:\n• ${d.rewardCount} Orbs 💠\n\n### Tasks:\n• Play On Desktop for ${d.minutes}m`
    ));
    
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    // Dynamic Banner Renderer with strict validation
    const bUrl = opts.bannerUrl || d.banner;
    if (bUrl && typeof bUrl === 'string' && bUrl.startsWith('http')) {
        try { 
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bUrl))); 
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)); 
        } catch {}
    }
    
    // Select Menu Dropdown with crystal clear selected quest indicators, rewards & progress
    const placeholder = `🎮 Select Quest (${allQuests.length} available)`;
    const selectOptions = (Array.isArray(allQuests) ? allQuests : [quest]).slice(0, 25).map(q => {
        const rd = getReal(q);
        const isSel = rd.questId === d.questId;
        return { 
            label: `${rd.game}:${rd.questName}`.slice(0, 100), 
            value: rd.questId || 'default_val', 
            description: `${rd.rewardCount} Orbs | Progress: ${rd.progress}\%${isSel ? ' • [SELECTED]' : ''}`.slice(0, 100), 
            emoji: isSel ? { name: '✅' } : { name: '🎮' }, 
            default: isSel 
        };
    });

    const select = new StringSelectMenuBuilder()
        .setCustomId('quest_select_menu')
        .setPlaceholder(placeholder.slice(0, 100))
        .addOptions(selectOptions);
        
    main.addActionRowComponents(row => row.addComponents(select));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setEmoji({name:'▶️'}).setDisabled(progress>=100),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link).setEmoji({name:'🔗'})
    ));
    
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logStatus}\n\`\`\``));
    
    return { components: [main, logs], flags: MessageFlags.IsComponentsV2 };
}

function buildLink() {
    const c = new ContainerBuilder().setAccentColor(0xFF0000);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Not Linked\nUse \`/link\` first`));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver'),
    prefix: 'quest',
    
    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLink()); return; }
        try {
            const qc = new QuestClient(token);
            const mgr = await qc.fetchQuests();
            const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000); 
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests available`)); 
                await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await interaction.followUp(build(valid[0], valid, '🧭 Quest selected\n📝 Enrolled'));
        } catch (e) { 
            console.error(e); 
            const c = new ContainerBuilder().setAccentColor(0xFF0000); 
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``)); 
            await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
        }
    },

    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await message.channel.send(buildLink()); return; }
        try {
            const qc = new QuestClient(token);
            const mgr = await qc.fetchQuests();
            const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000); 
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests available`)); 
                await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await message.channel.send(build(valid[0], valid, '🧭 Quest selected\n📝 Enrolled'));
        } catch (e) { 
            console.error(e); 
        }
    },

    async handleSelectMenu(interaction, client) {
        if (interaction.customId !== 'quest_select_menu') return;
        await interaction.deferUpdate().catch(()=>{});
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;
        try {
            const qc = new QuestClient(token);
            const mgr = await qc.fetchQuests();
            const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
            const sel = valid.find(q => String(q.id || q.config?.id) === interaction.values[0]) || valid[0];
            await interaction.editReply(build(sel, valid, '🧭 Quest switched from menu\n📝 Enrolled')).catch(()=>{});
        } catch(e) {
            console.error('Select menu error:', e);
        }
    },

    async handleButton(interaction, client) {
        if (!interaction.customId.startsWith('quest_')) return;
        await interaction.deferUpdate().catch(()=>{});
        
        const without = interaction.customId.replace('quest_', '');
        const sep = without.indexOf('_');
        if (sep === -1) return;
        
        const action = without.slice(0, sep);
        const qId = without.slice(sep + 1);
        const userId = interaction.user.id;
        
        const token = await client.tokenStore.get(userId);
        if (!token) return;
        
        const qc = new QuestClient(token);
        const mgr = await qc.fetchQuests();
        const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
        const quest = valid.find(q => String(q.id || q.config?.id) === qId) || valid[0];
        
        if (action === 'start') {
            await interaction.editReply(build(quest, valid, `▶️ Starting ${getReal(quest).questName}...`, {progress: 0, desktop: 0})).catch(()=>{});
            
            activeQuestRunners.set(`${userId}_${qId}`, qc);

            setImmediate(async () => {
                try {
                    let lastProgress = 0;
                    await qc.doingQuest(quest, (done, total) => {
                        const p = Math.round((done / total) * 100);
                        if (p - lastProgress >= 5 || p === 100) {
                            lastProgress = p;
                            const freshList = valid.map(q => String(q.id || q.config?.id) === qId ? {...q, user_status:{progress: p/100}} : q);
                            interaction.editReply(build({...quest, user_status:{progress: p/100}}, freshList, `▶️ Running ${p}% • ${getReal(quest).game}`, {progress: p, desktop: p})).catch(()=>{});
                        }
                    });
                    
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    await interaction.editReply(build({...quest, user_status:{progress: 1, completed_at: new Date().toISOString()}}, valid, `✅ Completed! ${getReal(quest).questName}`, {progress: 100, desktop: 100})).catch(()=>{});
                } catch(err) { 
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    await interaction.editReply(build(quest, valid, `❌ Failed: ${err.message}`)).catch(()=>{}); 
                }
            });
        } else if (action === 'stop') {
            const runnerKey = `${userId}_${qId}`;
            const activeInstance = activeQuestRunners.get(runnerKey) || qc;
            if (typeof activeInstance.abort === 'function') {
                activeInstance.abort();
            }
            activeQuestRunners.delete(runnerKey);
            await interaction.editReply(build(quest, valid, '⏹️ Stopped by user')).catch(()=>{});
        } else if (action === 'refresh') {
            const fresh = await qc.fetchQuests();
            const fValid = fresh.filterQuestsValid ? fresh.filterQuestsValid() : (fresh.quests || fresh.all || []);
            const fQuest = fValid.find(q => String(q.id || q.config?.id) === qId) || fValid[0];
            const fd = getReal(fQuest);
            await interaction.editReply(build(fQuest, fValid, `🔄 Refreshed - Progress: ${fd.progress}%`, {progress: fd.progress, desktop: fd.progress})).catch(()=>{});
        }
    }
};

export { build as buildFixed, getReal as getRealData };
