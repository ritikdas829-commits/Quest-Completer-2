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

// Background running processes storage
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
    const cfg = q.config || {};
    const app = cfg.application || q.application || {};
    const us = q.user_status || {};
    const game = cfg.messages?.gameTitle || app.name || 'Discord';
    let publisher = cfg.messages?.publisherName || app.publisher || null;
    if (!publisher) {
        const low = (game + ' ' + (cfg.messages?.questName||'')).toLowerCase();
        for (const [k,v] of Object.entries(PUBLISHER_MAP)) {
            if (low.includes(k)) { publisher = v; break; }
        }
        if (!publisher) publisher = 'Discord';
    }
    const questName = cfg.messages?.questName || game;
    let banner = cfg.assets?.hero || cfg.assets?.heroVideo || cfg.assets?.gameTile || app.assets?.hero || cfg.assets?.icon || null;
    if (banner && !banner.startsWith('http') && (cfg.application?.id || app.id)) {
        banner = `https://cdn.discordapp.com/app-icons/${cfg.application?.id \vert{}\vert{} app.id}/${banner}.png`;
    }
    if (!banner && game.toLowerCase().includes('risk of rain')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/632360/header.jpg';
    }
    const rewards = cfg.rewards || [];
    const rewardCount = rewards[0]?.count || 700;
    const taskCfg = cfg.task_config || {};
    const task = Object.values(taskCfg.tasks || {})[0] || {};
    const minutes = Math.round((task.target || 900)/60);
    let enrolled = us.enrolled_at || new Date().toISOString();
    const expires = cfg.expires_at;
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
    
    const bUrl = opts.bannerUrl || d.banner;
    if (bUrl && typeof bUrl === 'string' && bUrl.startsWith('http')) {
        try { 
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bUrl))); 
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)); 
        } catch {}
    }
    
    const placeholder = `🎮 ${d.game}:${d.questName}`.slice(0,100);
    const selectOptions = (Array.isArray(allQuests) ? allQuests : [quest]).slice(0,25).map(q => {
        const rd = getReal(q);
        const isSel = rd.questId === d.questId;
        return { 
            label: `${rd.game}:${rd.questName}`.slice(0,100), 
            value: rd.questId || 'default_val', 
            description: `${rd.rewardCount} Orbs | ${rd.progress}\%${isSel?' • Selected':''}`.slice(0,100), 
            emoji: isSel?{name:'✅'}:{name:'🎮'}, 
            default: isSel 
        };
    });

    const select = new StringSelectMenuBuilder()
        .setCustomId('quest_select_menu')
        .setPlaceholder(placeholder)
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
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests available`)); 
                await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await interaction.followUp(build(valid[0], valid, 'Quest selected\nEnrolled'));
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
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests available`)); 
                await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await message.channel.send(build(valid[0], valid, 'Quest selected\nEnrolled'));
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
            const sel = valid.find(q=> String(q.id||q.config?.id) === interaction.values[0]) || valid[0];
            await interaction.editReply(build(sel, valid, 'Quest selected from menu\nEnrolled')).catch(()=>{});
        } catch(e) {
            console.error('Select menu error:', e);
        }
    },

    async handleButton(interaction, client) {
        if (!interaction.customId.startsWith('quest_')) return;
        await interaction.deferUpdate().catch(()=>{});
        
        const without = interaction.customId.replace('quest_','');
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
        const quest = valid.find(q=> String(q.id||q.config?.id) === qId) || valid[0];
        
        if (action === 'start') {
            await interaction.editReply(build(quest, valid, `Starting ${getReal(quest).questName}...`, {progress: 0, desktop: 0})).catch(()=>{});
            
            // Register active process instance
            activeQuestRunners.set(`${userId}_${qId}`, qc);

            setImmediate(async () => {
                try {
                    let lastProgress = 0;
                    await qc.doingQuest(quest, (done, total) => {
                        const p = Math.round((done / total) * 100);
                        // Throttle edits to prevent rate limits
                        if (p - lastProgress >= 5 || p === 100) {
                            lastProgress = p;
                            const freshList = valid.map(q => String(q.id||q.config?.id) === qId ? {...q, user_status:{progress: p/100}} : q);
                            interaction.editReply(build({...quest, user_status:{progress: p/100}}, freshList, `Running ${p}% • ${getReal(quest).game}`, {progress: p, desktop: p})).catch(()=>{});
                        }
                    });
                    
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    await interaction.editReply(build({...quest, user_status:{progress:1, completed_at:new Date().toISOString()}}, valid, `Completed! ${getReal(quest).questName}`, {progress: 100, desktop: 100})).catch(()=>{});
                } catch(err) { 
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    await interaction.editReply(build(quest, valid, `Failed: ${err.message}`)).catch(()=>{}); 
                }
            });
        } else if (action === 'stop') {
            const runnerKey = `${userId}_${qId}`;
            const activeInstance = activeQuestRunners.get(runnerKey) || qc;
            if (typeof activeInstance.abort === 'function') {
                activeInstance.abort();
            }
            activeQuestRunners.delete(runnerKey);
            await interaction.editReply(build(quest, valid, 'Stopped by user')).catch(()=>{});
        } else if (action === 'refresh') {
            const fresh = await qc.fetchQuests();
            const fValid = fresh.filterQuestsValid ? fresh.filterQuestsValid() : (fresh.quests || fresh.all || []);
            const fQuest = fValid.find(q=> String(q.id||q.config?.id) === qId) || fValid[0];
            const fd = getReal(fQuest);
            await interaction.editReply(build(fQuest, fValid, `Refreshed - ${fd.progress}%`, {progress: fd.progress, desktop: fd.progress})).catch(()=>{});
        }
    }
};

export { build as buildFixed, getReal as getRealData };
