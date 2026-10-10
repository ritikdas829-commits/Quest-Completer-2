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

const activeQuestRunners = new Map();

function fmtDate(s) {
    try { const d = new Date(s); return isNaN(d.getTime()) ? new Date().toLocaleDateString('en-US') : d.toLocaleDateString('en-US'); } catch { return new Date().toLocaleDateString('en-US'); }
}

const PUBLISHER_MAP = {
    'risk of rain 2': 'Gearbox Publishing',
    'march of giants': 'Ubisoft',
    'aion 2': 'NCSoft',
    'melon sandbox': 'Discord',
    'vision': 'Discord',
    'monopoly go': 'Scopely',
    'deadzone': 'Prophecy Games',
    'arc raiders': 'Embark Studios',
    'empires & puzzles': 'Take-Two Interactive',
    'discord': 'Discord'
};

function getReal(q) {
    const cfg = q.config || q;
    const app = cfg.application || q.application || {};
    const us = q.user_status || q.userStatus || {};
    
    let game = cfg.messages?.gameTitle || cfg.messages?.game_title || app.name || 'Discord';
    let questName = cfg.messages?.questName || cfg.messages?.quest_name || cfg.messages?.name || '';
    
    // FIX: Agar dono Discord:Discord hai toh real name dhoondo
    if ((!questName || questName === 'Discord' || questName === game) && game === 'Discord') {
        // Try other fields
        questName = cfg.messages?.quest_name || cfg.title || cfg.config?.messages?.questName || q.id?.slice(0,20) || 'Discord Quest';
        // Agar abhi bhi Discord hai toh game bhi change karo
        if (questName !== 'Discord' && questName.length > 3) {
            // questName real hai, game ko bhi wahi rakho for display
        }
    }
    if (!questName) questName = game;
    
    let publisher = cfg.messages?.publisherName || cfg.messages?.publisher || app.publisher || null;
    if (!publisher) {
        const low = (game + ' ' + questName).toLowerCase();
        for (const [k,v] of Object.entries(PUBLISHER_MAP)) if (low.includes(k)) { publisher = v; break; }
        if (!publisher) publisher = 'Discord';
    }
    
    const qId = q.id || cfg.id || '';
    let banner = cfg.assets?.hero || cfg.assets?.heroVideo || cfg.assets?.gameTile || null;
    
    // FIX: Banner logic - pehle hero, phir icon sahi URL se
    if (!banner) {
        const icon = cfg.assets?.icon || app.icon || cfg.application?.icon || null;
        if (icon) {
            if (icon.startsWith('http')) banner = icon;
            else if (cfg.application?.id || app.id) {
                const appId = cfg.application?.id || app.id;
                banner = `https://cdn.discordapp.com/app-icons/${appId}/${icon}.png?size=512`;
            }
        }
    }
    // Fallback for ROR2
    if (!banner && game.toLowerCase().includes('risk of rain')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/632360/header.jpg';
    }
    if (!banner && game.toLowerCase().includes('march of giants')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/1999170/header.jpg';
    }

    const rewards = cfg.rewards || [];
    const rewardCount = rewards[0]?.count || 700;
    
    const taskCfg = cfg.task_config || cfg.taskConfig || {};
    const tasksMap = taskCfg.tasks || {};
    const firstTask = Object.values(tasksMap)[0] || {};
    const minutes = Math.round((firstTask.target || 900)/60);
    const tasksFormatted = `• Play On Desktop for ${minutes}m`;

    let enrolled = us.enrolled_at || us.enrolledAt || new Date().toISOString();
    let expires = cfg.expires_at || cfg.expiresAt || null;
    let progress = 0;
    if (us.progress) progress = Math.round(us.progress * 100);
    if (us.completed_at || us.completedAt) progress = 100;
    
    return { game, publisher, questName, banner, rewardCount, tasksFormatted, enrolled, expires, progress, questId: String(qId) };
}

function build(quest, allQuests, logStatus, opts = {}) {
    const d = getReal(quest);
    const progress = opts.progress ?? d.progress;
    const isCompleted = progress >= 100;
    const main = new ContainerBuilder().setAccentColor(0x5865F2);
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🛡️ Quest Solver\n\n• **Game:** ${d.game}\n• **Publisher:** ${d.publisher}\n• **Quest Name:** ${d.questName}\n• **Enrolled At:** ${fmtDate(opts.enrolledAt || d.enrolled)}\n• **Expires At:** ${fmtDate(opts.expiresAt || d.expires) || '10/20/2026'}\n• **Progress:**\n${isCompleted?'✅':'⏳'} ${progress}%\n💻 Desktop: ${progress}%\n\n### Rewards:\n• ${d.rewardCount} Orbs 💠\n\n### Tasks:\n${d.tasksFormatted}`
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    const bUrl = opts.bannerUrl || d.banner;
    // FIX: Only show if valid http and not broken
    if (bUrl && typeof bUrl === 'string' && bUrl.startsWith('http') && bUrl.length > 15) {
        try { 
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bUrl))); 
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)); 
        } catch {}
    }
    const placeholder = `${d.game}: ${d.questName}`.slice(0,100);
    const selectOptions = (Array.isArray(allQuests) ? allQuests : [quest]).slice(0,25).map(q => {
        const rd = getReal(q);
        const isSel = rd.questId === d.questId;
        return { label: `${rd.game}: ${rd.questName}`.slice(0,100), value: rd.questId, description: `${rd.rewardCount} Orbs | ${rd.progress}%${isSel?' • Selected':''}`.slice(0,100), emoji: isSel?{name:'✅'}:{name:'🎮'}, default: isSel };
    });
    const select = new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(placeholder).addOptions(selectOptions);
    main.addActionRowComponents(row => row.addComponents(select));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setEmoji({name:'▶️'}).setDisabled(isCompleted),
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
            if (!valid.length) { const c = new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests`)); await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); return; }
            await interaction.followUp(build(valid[0], valid, '🧭 Quest selected\n📝 Enrolled'));
        } catch (e) { console.error(e); const c = new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``)); await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); }
    },
    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await message.channel.send(buildLink()); return; }
        try {
            const qc = new QuestClient(token);
            const mgr = await qc.fetchQuests();
            const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
            if (!valid.length) { const c = new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests`)); await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); return; }
            await message.channel.send(build(valid[0], valid, '🧭 Quest selected\n📝 Enrolled'));
        } catch (e) { console.error(e); }
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
            await interaction.editReply(build(sel, valid, '🧭 Quest switched\n📝 Enrolled')).catch(()=>{});
        } catch(e) { console.error(e); }
    },
    async handleButton(interaction, client) {
        if (!interaction.customId.startsWith('quest_')) return;
        await interaction.deferUpdate().catch(()=>{});
        const without = interaction.customId.replace('quest_','');
        const sep = without.indexOf('_');
        if (sep===-1) return;
        const action = without.slice(0,sep);
        const qId = without.slice(sep+1);
        const userId = interaction.user.id;
        const token = await client.tokenStore.get(userId);
        if (!token) return;
        const qc = new QuestClient(token);
        const mgr = await qc.fetchQuests();
        const valid = mgr.filterQuestsValid ? mgr.filterQuestsValid() : (mgr.quests || mgr.all || []);
        const quest = valid.find(q => String(q.id || q.config?.id) === qId) || valid[0];
        if (action==='start') {
            await interaction.editReply(build(quest, valid, `▶️ Starting ${getReal(quest).questName}...`, {progress:0})).catch(()=>{});
            activeQuestRunners.set(`${userId}_${qId}`, qc);
            setImmediate(async ()=>{
                try {
                    let last = 0;
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        if (p-last>=5 || p===100) {
                            last=p;
                            const fresh = valid.map(q=> String(q.id||q.config?.id)===qId ? {...q, user_status:{progress:p/100}} : q);
                            interaction.editReply(build({...quest, user_status:{progress:p/100}}, fresh, `▶️ Running ${p}% • ${getReal(quest).game}`, {progress:p})).catch(()=>{});
                        }
                    });
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    await interaction.editReply(build({...quest, user_status:{progress:1, completed_at:new Date().toISOString()}}, valid, `✅ Completed! ${getReal(quest).questName}`, {progress:100})).catch(()=>{});
                } catch(err) { activeQuestRunners.delete(`${userId}_${qId}`); await interaction.editReply(build(quest, valid, `❌ Failed: ${err.message}`)).catch(()=>{}); }
            });
        } else if (action==='stop') {
            const run = activeQuestRunners.get(`${userId}_${qId}`) || qc;
            if (typeof run.abort==='function') run.abort();
            activeQuestRunners.delete(`${userId}_${qId}`);
            await interaction.editReply(build(quest, valid, '⏹️ Stopped')).catch(()=>{});
        } else if (action==='refresh') {
            const fresh = await qc.fetchQuests();
            const fValid = fresh.filterQuestsValid ? fresh.filterQuestsValid() : (fresh.quests || fresh.all || []);
            const fQuest = fValid.find(q=> String(q.id||q.config?.id)===qId) || fValid[0];
            const fd = getReal(fQuest);
            await interaction.editReply(build(fQuest, fValid, `🔄 Refreshed - ${fd.progress}%`, {progress:fd.progress})).catch(()=>{});
        }
    }
};
export { build as buildFixed, getReal as getRealData };
