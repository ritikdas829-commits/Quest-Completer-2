import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { disableAutoquest } from '../quest/autoquestStore.js';
import { buildLinkPrompt } from './linkCommands.js';

function buildQuestResultCard(quest, success) {
    const c = new ContainerBuilder().setAccentColor(success ? 0x57F287 : 0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ${success ? '✅ Quest Completed' : '❌ Quest Failed'}\n### ${quest.config.messages.quest_name}`
        )
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export const questCmd = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Handles individual quest selection and execution'),
    prefix: 'quest',
    
    // Slash command fallback if needed
    async execute(interaction, client) {
        await interaction.reply({ 
            content: 'Please use `/quests` to view available quests and select one from the menu.', 
            flags: 64 
        });
    },

    // Select Menu Interaction Handler (Jab user dropdown se quest select karega)
    async handleSelectMenu(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'quest_select_menu') return;

        await interaction.deferUpdate();
        const userId = interaction.user.id;
        const token = await client.tokenStore.get(userId);

        if (!token) {
            await interaction.followUp(buildLinkPrompt());
            return;
        }

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

            // Run the selected quest
            const success = await manager.doingQuest(targetQuest, console.log);
            if (success) {
                await manager.claimRewards(console.log).catch(() => {});
            }

            await interaction.editReply(buildQuestResultCard(targetQuest, success));
        } catch (err) {
            if (String(err).includes('401') && (await client.tokenStore.has(userId))) {
                await client.tokenStore.remove(userId);
                disableAutoquest(userId);
                await interaction.followUp({ content: '❌ Token expired. Please re-link your account.', flags: 64 });
            } else {
                await interaction.followUp({ content: '❌ An error occurred while running the quest.', flags: 64 });
            }
        }
    }
};
