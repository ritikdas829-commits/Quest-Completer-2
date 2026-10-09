import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { buildLinkPrompt } from './linkCommands.js';

function buildQuestSolverCard(quest, logStatus = '🧭 Quest selected\n📝 Enrolled') {
    const c = new ContainerBuilder().setAccentColor(0x5865F2);
    
    // Dynamic game title, publisher, and quest name from the selected quest object
    const gameTitle = quest.config?.messages?.game_title || 'AION 2';
    const publisher = quest.config?.messages?.publisher || 'NC';
    const questName = quest.config?.messages?.quest_name || 'Active Quest';
    const rewardName = quest.config?.reward_store_listing?.name || '700 Orbs 💠';

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🛡️ Quest Solver\n\n` +
            `- **Game:** ${gameTitle}\n` +
            `- **Publisher:** ${publisher}\n` +
            `- **Quest Name:** ${questName}\n` +
            `- **Enrolled At:** ${new Date().toLocaleDateString()}\n` +
            `- **Progress:**\n⏳ 0%\n💻 Desktop: 0%\n\n` +
            `### Rewards:\n- ${rewardName}\n\n` +
            `### Tasks:\n- Play On Desktop for 15m`
        )
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_start_${quest.id}`)
            .setLabel('Start')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`quest_stop_${quest.id}`)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`quest_refresh_${quest.id}`)
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('View Quest')
            .setURL('https://discord.com/quests')
            .setStyle(ButtonStyle.Link)
    );

    const logsContainer = new ContainerBuilder().setAccentColor(0x2B2D31);
    logsContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `📦 **Quest Logs**\n${logStatus}`
        )
    );

    return { 
        components: [c, actionRow, linkRow, logsContainer], 
        flags: MessageFlags.IsComponentsV2 
    };
}

export const questCmd = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Handles dynamic quest selection and solver UI'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLinkPrompt()); return; }

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            if (valid.length === 0) { await interaction.followUp({ content: '❌ No active quests found.', flags: 64 }); return; }

            // Default to the first valid quest
            await interaction.followUp(buildQuestSolverCard(valid[0]));
        } catch (err) {
            await interaction.followUp({ content: '❌ Something went wrong.', flags: 64 });
        }
    },

    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await message.channel.send(buildLinkPrompt()); return; }

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            if (valid.length === 0) { await message.channel.send('❌ No active quests found.'); return; }

            await message.channel.send(buildQuestSolverCard(valid[0]));
        } catch (err) {
            await message.channel.send('✝ Something went wrong.');
        }
    },

    // 🎯 Select Menu Handler: Jab user dropdown se koi quest select karega
    async handleSelectMenu(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'quest_select_menu') return;

        await interaction.deferUpdate();
        const userId = interaction.user.id;
        const token = await client.tokenStore.get(userId);
        if (!token) { await interaction.followUp(buildLinkPrompt()); return; }

        const selectedQuestId = interaction.values[0];
        const qc = new QuestClient(token);

        try {
            const manager = await qc.fetchQuests();
            const validQuests = manager.filterQuestsValid();
            const targetQuest = validQuests.find(q => q.id === selectedQuestId);

            if (!targetQuest) {
                await interaction.followUp({ content: '❌ Selected quest is no longer available.', flags: 64 });
                return;
            }

            // Update the UI card dynamically with the selected quest's details
            const updatedCard = buildQuestSolverCard(targetQuest, '🧭 Quest selected from dropdown\n📝 Enrolled');
            await interaction.editReply(updatedCard);
        } catch (err) {
            console.error('Select menu quest error:', err);
            await interaction.followUp({ content: '❌ Failed to load selected quest.', flags: 64 });
        }
    },

    // 🚀 Button Interactions Handler (Start / Stop / Refresh)
    async handleButton(interaction, client) {
        const customId = interaction.customId;
        if (!customId.startsWith('quest_')) return;

        const [_, action, questId] = customId.split('_');
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.reply({ content: '❌ Token not found.', flags: 64 }); return; }

        await interaction.deferUpdate();
        const qc = new QuestClient(token);

        try {
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            const quest = valid.find(q => q.id === questId) || valid[0];

            let logStatus = '🧭 Quest selected\n📝 Enrolled';

            if (action === 'start') {
                logStatus = '🧭 Quest selected\n📝 Enrolled\n▶️ Starting quest execution...';
            } else if (action === 'stop') {
                logStatus = '🧭 Quest selected\n📝 Enrolled\n⏹️ Quest stopped by user.';
            } else if (action === 'refresh') {
                logStatus = '🧭 Quest selected\n📝 Enrolled\n🔄 Status refreshed successfully.';
            }

            await interaction.editReply(buildQuestSolverCard(quest, logStatus));
        } catch (err) {
            console.error('Button interaction error:', err);
        }
    }
};
