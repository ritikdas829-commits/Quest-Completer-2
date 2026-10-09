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

function buildQuestSolverCard(quest, allValidQuests = [], logStatus = '🧭 Quest selected\n📝 Enrolled') {
    const c = new ContainerBuilder().setAccentColor(0x5865F2);
    
    const gameTitle = quest.config?.messages?.game_title || 'Risk of Rain 2';
    const publisher = quest.config?.messages?.publisher || 'NC';
    const questName = quest.config?.messages?.quest_name || 'ROR2 Hallowed Concepts';
    const rewardName = quest.config?.reward_store_listing?.name || '700 Orbs 💠';
    
    // Dynamic asset image/thumbnail URL agar quest config mein ho
    const assetId = quest.config?.assets?.hero || quest.config?.config?.assets?.hero;
    const bannerUrl = assetId ? `https://cdn.discordapp.com/quests/assets/${quest.id}/${assetId}.png` : null;

    let contentText = `# 🛡️ Quest Solver\n\n` +
        `- **Game:** ${gameTitle}\n` +
        `- **Publisher:** ${publisher}\n` +
        `- **Quest Name:** ${questName}\n` +
        `- **Enrolled At:** ${new Date().toLocaleDateString()}\n` +
        `- **Progress:**\n⏳ 0%\n💻 Desktop: 0%\n\n` +
        `### Rewards:\n- ${rewardName}\n\n` +
        `### Tasks:\n- Play On Desktop for 15m`;

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentText));

    const componentsList = [c];

    // Agar multiple quests hain toh Dropdown Select Menu add kar do
    if (allValidQuests.length > 1) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('quest_select_menu')
            .setPlaceholder('Choose another quest...')
            .addOptions(
                allValidQuests.slice(0, 25).map(q => ({
                    label: (q.config?.messages?.quest_name || 'Quest').substring(0, 100),
                    value: q.id,
                    description: `Game: ${q.config?.messages?.game_title || 'Unknown'}`.substring(0, 100),
                    default: q.id === quest.id
                }))
            );
        componentsList.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${quest.id}`).setLabel('Start').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`quest_stop_${quest.id}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`quest_refresh_${quest.id}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary)
    );

    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)
    );

    componentsList.push(actionRow, linkRow);

    const logsContainer = new ContainerBuilder().setAccentColor(0x2B2D31);
    logsContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📦 **Quest Logs**\n${logStatus}`));
    componentsList.push(logsContainer);

    return { components: componentsList, flags: MessageFlags.IsComponentsV2 };
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver UI card with dropdown and logs'),
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

            await interaction.followUp(buildQuestSolverCard(valid[0], valid));
        } catch (err) {
            await interaction.followUp({ content: '❌ Something went wrong.', flags: 64 });
        }
    },

    async prefixExecute(message, _args, client) {
        // Turant message bhej do taaki " didn't respond in time " error na aaye
        const tempMsg = await message.channel.send('⏳ Fetching active quests...');
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await tempMsg.edit(buildLinkPrompt()); return; }

        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            if (valid.length === 0) { await tempMsg.edit('❌ No active quests found.'); return; }

            const payload = buildQuestSolverCard(valid[0], valid);
            await tempMsg.edit(payload);
        } catch (err) {
            console.error('Prefix Quest Error:', err);
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
            const valid = manager.filterQuestsValid();
            const target = valid.find(q => q.id === interaction.values[0]) || valid[0];

            await interaction.editReply(buildQuestSolverCard(target, valid, '🧭 Quest switched from dropdown\n📝 Enrolled'));
        } catch (err) {}
    },

    async handleButton(interaction, client) {
        if (!interaction.customId.startsWith('quest_')) return;
        const [_, action, questId] = interaction.customId.split('_');
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;

        await interaction.deferUpdate();
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid();
            const quest = valid.find(q => q.id === questId) || valid[0];

            let logStatus = '🧭 Quest selected\n📝 Enrolled';
            if (action === 'start') logStatus = '🧭 Quest selected\n📝 Enrolled\n▶️ Starting quest execution...';
            else if (action === 'stop') logStatus = '🧭 Quest selected\n📝 Enrolled\n⏹️ Quest stopped.';
            else if (action === 'refresh') logStatus = '🧭 Quest selected\n📝 Enrolled\n🔄 Refreshed successfully.';

            await interaction.editReply(buildQuestSolverCard(quest, valid, logStatus));
        } catch (err) {}
    }
};
