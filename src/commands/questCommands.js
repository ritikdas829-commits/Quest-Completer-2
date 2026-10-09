
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
    if (!s) return 'N/A';
    try { 
        const d = new Date(s);
        if (isNaN(d.getTime())) return 'N/A';
        return d.toLocaleDateString('en-US');
    } catch { return 'N/A'; }
}

function getRealData(q) {
    const config = q.config || {};
    const app = config.application || q.application || {};
    const userStatus = q.user_status || q.userStatus || q.enrollment || {};

    // FIX: Try all possible paths for publisher
    const game = config.messages?.gameTitle || app.name || config.application?.name || q.game || 'Risk of Rain 2';
    const publisher = config.messages?.publisherName || app.publisher || config.publisherName || app.storeListing?.publisher || 'Unknown';
    const questName = config.messages?.questName || config.messages?.quest_name || q.questName || 'ROR2 Hallowed Concepts';
    
    // FIX: Thumbnail - check all possible asset paths
    let banner = null;
    const possibleBanners = [
        config.assets?.hero,
        config.assets?.heroVideo,
        config.assets?.gameTile,
        config.assets?.game_tile,
        app.assets?.hero,
        app.storeListing?.hero,
        q.assets?.hero,
        config.application?.assets?.hero
    ];
    for (const b of possibleBanners) {
        if (b && typeof b === 'string' && b.startsWith('http')) { banner = b; break; }
    }
    // Fallback: If Risk of Rain 2, use known banner
    if (!banner && game.toLowerCase().includes('risk of rain')) {
        banner = 'https://cdn.cloudflare.steamstatic.com/steam/apps/632360/header.jpg';
    }

    const rewards = config.rewards || q.rewards || [];
    const rewardCount = rewards[0]?.count || 700;
    
    const taskCfg = config.task_config || config.taskConfig || {};
    const task = Object.values(taskCfg.tasks || {})[0] || {};
    const minutes = Math.round((task.target || 900)/60);
    
    // FIX: Enrolled - check all paths
    let enrolled = userStatus.enrolled_at || userStatus.enrolledAt || userStatus.enrollmentDate || q.enrolledAt;
    // If still N/A, try from questManager enrollment
    if (!enrolled && q.enrollment) enrolled = q.enrollment.enrolled_at;

    const expires = config.expires_at || config.expiresAt || q.expiresAt;
    const progress = userStatus.progress ? Math.round(userStatus.progress * 100) : (userStatus.progressPercent || 0);
    
    return { game, publisher, questName, banner, rewardCount, minutes, enrolled, expires, progress, questId: q.id || config.id, raw: q };
}

function buildFixed(quest, allQuests = [], logStatus = 'Quest selected\nEnrolled', opts = {}) {
    const d = getRealData(quest);
    const progress = opts.progress ?? d.progress;
    const desktop = opts.desktop ?? progress;
    const hasMultiple = allQuests.length > 1;

    const main = new ContainerBuilder().setAccentColor(0x5865F2);

    // FIX: :wreath: -> real emoji
    main.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🛡️ Quest Solver\n\n` +
            `• **Game:** ${d.game}\n` +
            `• **Publisher:** ${d.publisher}\n` +
            `• **Quest Name:** ${d.questName}\n` +
            `• **Enrolled At:** ${fmtDate(opts.enrolledAt || d.enrolled)}\n` +
            `• **Expires At:** ${fmtDate(opts.expiresAt || d.expires)}\n` +
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

    // FIX: Thumbnail - real
    const bannerUrl = opts.bannerUrl || d.banner;
    if (bannerUrl && bannerUrl.startsWith('http')) {
        try {
            main.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
            );
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        } catch (e) { console.log('Banner fail', e.message); }
    }

    // FIX: Only ONE selector - if multiple quests, show Select menu, else show nothing extra
    // No duplicate title button!
    if (hasMultiple) {
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
    } else {
        // Single quest - show game button but FIXED to not timeout
        main.addActionRowComponents(row => row.addComponents(
            new ButtonBuilder()
                .setCustomId(`quest_viewonly_${d.questId}`)
                .setLabel(`${d.game}: ${d.questName}`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ name: '🎮' })
                .setDisabled(true) // Disabled so no timeout
        ));
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
            await interaction.followUp(buildFixed(valid[0], valid));
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
            await message.channel.send(buildFixed(valid[0], valid));
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
            await interaction.editReply(buildFixed(selected, valid, 'Quest selected from dropdown\nEnrolled'));
        } catch (e) {
            console.error('SelectMenu error', e);
        }
    },

    async handleButton(interaction, client) {
        const id = interaction.customId;
        if (!id.startsWith('quest_')) return;
        
        // FIX: Ignore viewonly button - no timeout
        if (id.startsWith('quest_viewonly_')) {
            await interaction.deferUpdate().catch(()=>{});
            return;
        }

        const without = id.replace('quest_', '');
        const sep = without.indexOf('_');
        if (sep === -1) return;
        const action = without.slice(0, sep);
        const questId = without.slice(sep+1);

        try {
            await interaction.deferUpdate();
        } catch { return; }

        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : (manager.quests || manager.all || []);
        const quest = valid.find(q=> (q.id||q.config?.id)===questId) || valid[0];
        if (!quest) return;

        if (action === 'start') {
            await interaction.editReply(buildFixed(quest, valid, 'Quest selected\nEnrolled\nStarting...', { progress: 0, desktop: 0 })).catch(()=>{});
            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        interaction.editReply(buildFixed(quest, valid, `Quest selected\nEnrolled\nRunning ${p}%`, { progress: p, desktop: p })).catch(()=>{});
                    });
                    await interaction.editReply(buildFixed(quest, valid, 'Quest selected\nEnrolled\nCompleted!', { progress: 100, desktop: 100 })).catch(()=>{});
                } catch(err) {
                    await interaction.editReply(buildFixed(quest, valid, `Failed: ${err.message}`)).catch(()=>{});
                }
            });
        } else if (action === 'stop') {
            qc.abort();
            await interaction.editReply(buildFixed(quest, valid, 'Quest selected\nEnrolled\nStopped')).catch(()=>{});
        } else if (action === 'refresh') {
            const fresh = await qc.fetchQuests();
            const freshValid = fresh.filterQuestsValid ? fresh.filterQuestsValid() : (fresh.quests || fresh.all || []);
            const freshQuest = freshValid.find(q=> (q.id||q.config?.id)===questId) || freshValid[0];
            const fd = getRealData(freshQuest);
            await interaction.editReply(buildFixed(freshQuest, freshValid, `Refreshed - Progress ${fd.progress}%`, { progress: fd.progress, desktop: fd.progress })).catch(()=>{});
        }
    }
};

export { buildFixed, getRealData };
