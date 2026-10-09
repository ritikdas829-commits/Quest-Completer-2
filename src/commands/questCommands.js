
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

function fmtDateReal(s) {
    if (!s) return 'N/A';
    try { return new Date(s).toLocaleDateString('en-US'); } catch { return 'N/A'; }
}

// REAL parser - Orbie style
function getRealData(q) {
    const config = q.config || q;
    const app = config.application || q.application || {};
    const userStatus = q.user_status || q.userStatus || {};

    const game = config.messages?.gameTitle || app.name || 'Unknown Game';
    const publisher = config.messages?.publisherName || config.publisherName || app.publisher || 'Unknown';
    const questName = config.messages?.questName || config.messages?.quest_name || 'PLAY QUEST';
    
    // REAL banner - Orbie gets it from here
    const banner = config.assets?.hero || config.assets?.heroVideo || config.assets?.gameTile || null;
    
    const rewards = config.rewards || [];
    const rewardCount = rewards[0]?.count || 700;
    const taskCfg = config.task_config || config.taskConfig || {};
    const task = Object.values(taskCfg.tasks || {})[0] || {};
    const minutes = Math.round((task.target || 900)/60);
    
    const enrolled = userStatus.enrolled_at || userStatus.enrolledAt;
    const expires = config.expires_at || config.expiresAt;
    const progress = userStatus.progress ? Math.round(userStatus.progress * 100) : 0;
    const isCompleted = !!userStatus.completed_at || progress >= 100;
    
    return { game, publisher, questName, banner, rewardCount, minutes, enrolled, expires, progress, isCompleted, questId: q.id || config.id, raw: q };
}

function buildOrbieReal(quest, allQuests = [], logStatus = 'Quest selected\nEnrolled', opts = {}) {
    const d = getRealData(quest);
    const progress = opts.progress ?? d.progress;
    const isCompleted = progress >= 100 || d.isCompleted;
    const desktop = opts.desktop ?? progress;

    const main = new ContainerBuilder().setAccentColor(0x2B2D31);

    // Orbie exact format - like screenshot
    const progressIcon = isCompleted ? '✅' : '⏳';
    const desktopIcon = isCompleted ? '✅' : '💻';

    main.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## <:wreath:1390000000000000000> Quest Solver\n\n` +
            `• **Game:** ${d.game}\n` +
            `• **Publisher:** ${d.publisher}\n` +
            `• **Quest Name:** ${d.questName}\n` +
            `• **Enrolled At:** ${fmtDateReal(opts.enrolledAt || d.enrolled)}\n` +
            `• **Expires At:** ${fmtDateReal(opts.expiresAt || d.expires)}\n` +
            `• **Progress:**\n` +
            `${progressIcon} ${progress}%\n` +
            `${desktopIcon} Desktop: ${desktop}%\n\n` +
            `### Rewards:\n` +
            `• ${d.rewardCount} Orbs 💠\n\n` +
            `### Tasks:\n` +
            `• Play On Desktop for ${d.minutes}m`
        )
    );

    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

    // REAL banner - like Orbie shows March of Giants image
    const bannerUrl = opts.bannerUrl || d.banner;
    if (bannerUrl && bannerUrl.startsWith('http')) {
        try {
            main.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
            );
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        } catch {}
    }

    // Select menu - if multiple quests
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
                    emoji: rd.isCompleted ? { name: '✅' } : { name: '🎮' }
                };
            }));
        main.addActionRowComponents(row => row.addComponents(select));
        main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }

    // Bottom button like Orbie - with check if completed
    const bottomLabel = `${d.game}: ${d.questName}`.slice(0, 80);
    const bottomEmoji = isCompleted ? { name: '✅' } : { name: '🎮' };
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setCustomId(`quest_title_${d.questId}`).setLabel(bottomLabel).setStyle(ButtonStyle.Secondary).setEmoji(bottomEmoji)
    ));

    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setEmoji({ name: '▶️' }).setDisabled(isCompleted),
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
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver - Orbie Exact Real'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLink()); return; }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests`));
                await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); return;
            }
            // REAL - first quest with real banner
            await interaction.followUp(buildOrbieReal(valid[0], valid));
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
            const valid = manager.filterQuestsValid();
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No quests`));
                await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); return;
            }
            await message.channel.send(buildOrbieReal(valid[0], valid));
        } catch (e) {
            console.error(e);
            const c = new ContainerBuilder().setAccentColor(0xFF0000);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``));
            await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleSelectMenu(interaction, client) {
        if (interaction.customId !== 'quest_select_menu') return;
        await interaction.deferUpdate().catch(()=>{});
        const token = await client.tokenStore.get(interaction.user.id);
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        const selected = valid.find(q=> (q.id||q.config?.id)===interaction.values[0]);
        if (!selected) return;
        await interaction.editReply(buildOrbieReal(selected, valid, 'Quest selected from dropdown\nEnrolled')).catch(()=>{});
    },

    async handleButton(interaction, client) {
        const id = interaction.customId;
        if (!id.startsWith('quest_')) return;
        const without = id.replace('quest_', '');
        const sep = without.indexOf('_');
        if (sep === -1) return;
        const action = without.slice(0, sep);
        const questId = without.slice(sep+1);

        await interaction.deferUpdate().catch(()=>{});
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        const quest = valid.find(q=> (q.id||q.config?.id)===questId) || valid[0];
        if (!quest) return;

        if (action === 'title') {
            await interaction.editReply(buildOrbieReal(quest, valid, `Selected: ${getRealData(quest).questName}\nEnrolled`)).catch(()=>{});
            return;
        }

        if (action === 'start') {
            await interaction.editReply(buildOrbieReal(quest, valid, 'Quest selected\nEnrolled\nStarting...', { status: 'running', progress: 0, desktop: 0 })).catch(()=>{});
            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        interaction.editReply(buildOrbieReal(quest, valid, `Quest selected\nEnrolled\nRunning ${p}%`, { progress: p, desktop: p })).catch(()=>{});
                    });
                    await interaction.editReply(buildOrbieReal(quest, valid, 'Quest selected\nEnrolled\nCompleted! Reward claimed', { progress: 100, desktop: 100 })).catch(()=>{});
                } catch(err) {
                    await interaction.editReply(buildOrbieReal(quest, valid, `Failed: ${err.message}`)).catch(()=>{});
                }
            });
        } else if (action === 'stop') {
            qc.abort();
            await interaction.editReply(buildOrbieReal(quest, valid, 'Quest selected\nEnrolled\nStopped')).catch(()=>{});
        } else if (action === 'refresh') {
            const freshManager = await qc.fetchQuests();
            const freshValid = freshManager.filterQuestsValid();
            const freshQuest = freshValid.find(q=> (q.id||q.config?.id)===questId) || freshValid[0];
            const freshData = getRealData(freshQuest);
            await interaction.editReply(buildOrbieReal(freshQuest, freshValid, `Refreshed - Progress ${freshData.progress}%`, { progress: freshData.progress, desktop: freshData.progress })).catch(()=>{});
        }
    }
};

export { buildOrbieReal, getRealData };
