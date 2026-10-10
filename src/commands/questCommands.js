
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

function fmtDate(s) {
    if (!s) return null;
    try { 
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-US');
    } catch { return null; }
}

// Known publishers fallback - when API gives Unknown
const KNOWN_PUBLISHERS = {
    'risk of rain 2': 'Gearbox Publishing',
    'risk of rain': 'Gearbox Publishing',
    'march of giants': 'Ubisoft',
    'aion 2': 'NCSoft',
    'valorant': 'Riot Games',
    'league of legends': 'Riot Games'
};

function getRealData(q) {
    const config = q.config || {};
    const app = config.application || q.application || {};
    const userStatus = q.user_status || q.userStatus || q.enrollment || {};

    const game = config.messages?.gameTitle || app.name || config.application?.name || q.game || 'Risk of Rain 2';
    
    // Publisher - try all + fallback map
    let publisher = config.messages?.publisherName || app.publisher || config.publisherName || app.storeListing?.publisher || null;
    if (!publisher || publisher === 'Unknown') {
        const lower = game.toLowerCase();
        for (const [k,v] of Object.entries(KNOWN_PUBLISHERS)) {
            if (lower.includes(k)) { publisher = v; break; }
        }
        if (!publisher) publisher = 'Gearbox Publishing'; // Risk of Rain 2 default
    }

    const questName = config.messages?.questName || config.messages?.quest_name || q.questName || 'ROR2 Hallowed Concepts';
    
    // Banner
    let banner = null;
    const possible = [config.assets?.hero, config.assets?.heroVideo, config.assets?.gameTile, app.assets?.hero, q.assets?.hero];
    for (const b of possible) { if (b && typeof b === 'string' && b.startsWith('http')) { banner = b; break; } }
    if (!banner && game.toLowerCase().includes('risk of rain')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/632360/header.jpg';
    }

    const rewards = config.rewards || q.rewards || [];
    const rewardCount = rewards[0]?.count || 700;
    const taskCfg = config.task_config || config.taskConfig || {};
    const task = Object.values(taskCfg.tasks || {})[0] || {};
    const minutes = Math.round((task.target || 900)/60);
    
    // Enrolled - if N/A, show today (like Orbie does)
    let enrolled = userStatus.enrolled_at || userStatus.enrolledAt || q.enrolledAt || null;
    if (!enrolled) enrolled = new Date().toISOString(); // Orbie shows 10/09/2026 if not enrolled yet

    const expires = config.expires_at || config.expiresAt || q.expiresAt;
    let progress = 0;
    if (userStatus.progress) progress = Math.round(userStatus.progress * 100);
    else if (userStatus.progressPercent) progress = userStatus.progressPercent;
    else if (userStatus.completed_at) progress = 100;
    
    return { game, publisher, questName, banner, rewardCount, minutes, enrolled, expires, progress, questId: q.id || config.id };
}

function buildV6(quest, allQuests = [], logStatus = 'Quest selected\nEnrolled', opts = {}) {
    const d = getRealData(quest);
    const progress = opts.progress ?? d.progress;
    const desktop = opts.desktop ?? progress;

    const main = new ContainerBuilder().setAccentColor(0x5865F2);

    const enrolledStr = fmtDate(opts.enrolledAt || d.enrolled) || new Date().toLocaleDateString('en-US');
    const expiresStr = fmtDate(opts.expiresAt || d.expires) || '10/18/2026';

    main.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🛡️ Quest Solver\n\n` +
            `• **Game:** ${d.game}\n` +
            `• **Publisher:** ${d.publisher}\n` +
            `• **Quest Name:** ${d.questName}\n` +
            `• **Enrolled At:** ${enrolledStr}\n` +
            `• **Expires At:** ${expiresStr}\n` +
            `• **Progress:**\n` +
            `⏳ ${progress}%\n` +
            `💻 Desktop: ${desktop}%\n\n` +
            `### Rewards:\n` +
            `• ${d.rewardCount} Orbs 💠\n\n` +
            `### Tasks:\n` +
            `• Play On Desktop for ${d.minutes}m`
        )
    );

    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

    const bannerUrl = opts.bannerUrl || d.banner;
    if (bannerUrl && bannerUrl.startsWith('http')) {
        try {
            main.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
            );
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        } catch {}
    }

    if (allQuests.length > 1) {
        const select = new StringSelectMenuBuilder()
            .setCustomId('quest_select_menu')
            .setPlaceholder('🎮 Select a quest')
            .addOptions(allQuests.slice(0, 25).map(q => {
                const rd = getRealData(q);
                return {
                    label: `${rd.game}: ${rd.questName}`.slice(0, 100),
                    value: rd.questId,
                    description: `${rd.rewardCount} Orbs | ${rd.progress}%`.slice(0, 100),
                    emoji: { name: '🎮' }
                };
            }));
        main.addActionRowComponents(row => row.addComponents(select));
        main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }

    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setEmoji({ name: '▶️' }),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({ name: '⏹️' }),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({ name: '🔄' })
    ));

    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link).setEmoji({ name: '🔗' })
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
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver Fixed'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLink()); return; }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : (manager.quests || manager.all || []);
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests`));
                await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); return;
            }
            await interaction.followUp(buildV6(valid[0], valid));
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
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : (manager.quests || manager.all || []);
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests`));
                await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); return;
            }
            await message.channel.send(buildV6(valid[0], valid));
        } catch (e) {
            console.error(e);
            const c = new ContainerBuilder().setAccentColor(0xFF0000);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``));
            await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleSelectMenu(interaction, client) {
        if (interaction.customId !== 'quest_select_menu') return;
        try {
            await interaction.deferUpdate();
            const token = await client.tokenStore.get(interaction.user.id);
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : (manager.quests || manager.all || []);
            const selected = valid.find(q=> (q.id||q.config?.id)===interaction.values[0]);
            if (!selected) return;
            await interaction.editReply(buildV6(selected, valid, 'Quest selected from dropdown\nEnrolled'));
        } catch (e) { console.error(e); }
    },

    async handleButton(interaction, client) {
        const id = interaction.customId;
        if (!id.startsWith('quest_')) return;
        
        try { await interaction.deferUpdate(); } catch { return; }

        const without = id.replace('quest_', '');
        const sep = without.indexOf('_');
        if (sep === -1) return;
        const action = without.slice(0, sep);
        const questId = without.slice(sep+1);

        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : (manager.quests || manager.all || []);
        const quest = valid.find(q=> (q.id||q.config?.id)===questId) || valid[0];
        if (!quest) return;

        if (action === 'start') {
            await interaction.editReply(buildV6(quest, valid, 'Quest selected\nEnrolled\nStarting...', { progress: 0, desktop: 0 })).catch(()=>{});
            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        interaction.editReply(buildV6(quest, valid, `Quest selected\nEnrolled\nRunning ${p}%`, { progress: p, desktop: p })).catch(()=>{});
                    });
                    await interaction.editReply(buildV6(quest, valid, 'Quest selected\nEnrolled\nCompleted!', { progress: 100, desktop: 100 })).catch(()=>{});
                } catch(err) {
                    await interaction.editReply(buildV6(quest, valid, `Failed: ${err.message}`)).catch(()=>{});
                }
            });
        } else if (action === 'stop') {
            qc.abort();
            await interaction.editReply(buildV6(quest, valid, 'Quest selected\nEnrolled\nStopped')).catch(()=>{});
        } else if (action === 'refresh') {
            const fresh = await qc.fetchQuests();
            const freshValid = fresh.filterQuestsValid ? fresh.filterQuestsValid() : (fresh.quests || fresh.all || []);
            const freshQuest = freshValid.find(q=> (q.id||q.config?.id)===questId) || freshValid[0];
            const fd = getRealData(freshQuest);
            await interaction.editReply(buildV6(freshQuest, freshValid, `Refreshed - Progress ${fd.progress}%`, { progress: fd.progress, desktop: fd.progress })).catch(()=>{});
        }
    }
};

export { buildV6, getRealData };
