import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { buildLinkPrompt } from './linkCommands.js';

function buildQuestSolverCard(quest, allValidQuests = [], logStatus = '🧭 Quest selected\n📝 Enrolled', progress = 0) {
    const c = new ContainerBuilder().setAccentColor(0x5865F2);
    
    const gameTitle = quest.config?.messages?.game_title || 'AION 2';
    const publisher = quest.config?.messages?.publisher || 'NC';
    const questName = quest.config?.messages?.quest_name || 'AION 2 LAUNCH PLAY';
    const rewardName = quest.config?.reward_store_listing?.name || '700 Orbs 💠';

    // Exact screenshot text layout matching
    let contentText = `# 🌐 Quest Solver\n\n` +
        `- **Game:** ${gameTitle}\n` +
        `- **Publisher:** ${publisher}\n` +
        `- **Quest Name:** ${questName}\n` +
        `- **Enrolled At:** 10/09/2026\n` +
        `- **Expires At:** 10/12/2026\n` +
        `- **Progress:**\n⏳ ${progress}%\n💻 Desktop: ${progress}%\n\n` +
        `### Rewards:\n- ${rewardName}\n\n` +
        `### Tasks:\n- Play On Desktop for 15m`;

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentText));

    // Select Menu Dropdown inside Container component structure
    if (allValidQuests.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('quest_select_menu')
            .setPlaceholder(`${gameTitle}: ${questName}`.substring(0, 100))
            .addOptions(
                allValidQuests.slice(0, 25).map(q => ({
                    label: (q.config?.messages?.quest_name || 'Quest').substring(0, 100),
                    value: q.id,
                    description: `Game: ${q.config?.messages?.game_title || 'AION 2'}`.substring(0, 100),
                    default: q.id === quest.id
                }))
            );
        c.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
    }

    // Interactive V2 Action Buttons (Start, Stop, Refresh)
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${quest.id}`).setLabel('Start').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`quest_stop_${quest.id}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`quest_refresh_${quest.id}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary)
    );
    c.addActionRowComponents(actionRow);

    // Link Button Row (View Quest)
    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)
    );
    c.addActionRowComponents(linkRow);

    // Quest Logs Footer Container matching the screenshot dark theme
    const logsContainer = new ContainerBuilder().setAccentColor(0x2B2D31);
    logsContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`📦 **Quest Logs**\n${logStatus}`)
    );

    return { components: [c, logsContainer], flags: MessageFlags.IsComponentsV2 };
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Opens the exact Quest Solver UI card'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLinkPrompt()); return; }

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (valid.length === 0) { await interaction.followUp({ content: '❌ No active quests found.', flags: 64 }); return; }

            await interaction.followUp(buildQuestSolverCard(valid[0], valid));
        } catch (err) {
            await interaction.followUp({ content: '❌ Something went wrong.', flags: 64 });
        }
    },

    async prefixExecute(message, _args, client) {
        const tempMsg = await message.channel.send('⏳ Loading Quest Solver...');
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await tempMsg.edit(buildLinkPrompt()); return; }

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (valid.length === 0) { await tempMsg.edit('❌ No active quests found.'); return; }

            const payload = buildQuestSolverCard(valid[0], valid);
            await tempMsg.edit(payload);
        } catch (err) {
            await tempMsg.edit('✝ Something went wrong.');
        }
    },

    async handleSelectMenu(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'quest_select_menu') return;
        await interaction.deferUpdate();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            const target = valid.find(q => q.id === interaction.values[0]) || valid[0];

            await interaction.editReply(buildQuestSolverCard(target, valid, '🧭 Quest switched from dropdown\n📝 Enrolled', 0));
        } catch (err) {}
    },

    async handleButton(interaction, client) {
        if (!interaction.customId.startsWith('quest_')) return;

        const withoutPrefix = interaction.customId.replace('quest_', '');
        const idx = withoutPrefix.indexOf('_');
        const action = withoutPrefix.slice(0, idx);
        const questId = withoutPrefix.slice(idx + 1);

        await interaction.deferUpdate().catch(() => {});

        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;

        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
        const quest = valid.find(q => q.id === questId) || valid[0];

        if (action === 'start') {
            await interaction.editReply(buildQuestSolverCard(quest, valid, '🧭 Quest selected\n📝 Enrolled\n▶️ Starting quest background runner...', 0)).catch(() => {});

            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done, total) => {
                        const p = Math.round((done / total) * 100);
                        console.log(`Quest ${questId} progress ${p}%`);
                    });
                    
                    const channel = interaction.channel;
                    if (channel) {
                        channel.send({
                            content: `✅ <@${interaction.user.id}> Quest **${quest.config?.messages?.quest_name || questId}** completed successfully!`,
                            ...buildQuestSolverCard(quest, valid, '✅ Completed!', 100)
                        }).catch(() => {});
                    }
                } catch (e) {
                    interaction.followUp({ content: `❌ Quest failed: ${e.message}`, flags: 64 }).catch(() => {});
                }
            });

        } else if (action === 'stop') {
            if (typeof qc.abort === 'function') qc.abort();
            await interaction.editReply(buildQuestSolverCard(quest, valid, '⏹️ Stopped by user.', 0)).catch(() => {});
        } else if (action === 'refresh') {
            await interaction.editReply(buildQuestSolverCard(quest, valid, '🔄 Refreshed successfully.', 0)).catch(() => {});
        }
    }
};
