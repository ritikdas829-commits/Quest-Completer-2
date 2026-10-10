
import { getEmoji } from '../handlers/emoji.js';
import { handleLinkModal, handleLinkPromptButton } from '../commands/linkCommands.js';
import { handleGuideButtons } from '../commands/guide.js';
import { questCmd } from '../commands/questCommands.js';

export default {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (interaction.isButton() && (interaction.customId === 'btn_pc' || interaction.customId === 'btn_android' || interaction.customId === 'btn_ios')) {
            await handleGuideButtons(interaction);
            return;
        }
        if (interaction.isModalSubmit() && interaction.customId === 'link_token_modal') {
            await handleLinkModal(interaction, client);
            return;
        }
        if (interaction.isButton() && interaction.customId === 'link_prompt') {
            await handleLinkPromptButton(interaction);
            return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId === 'quest_select_menu') {
            try { await questCmd.handleSelectMenu(interaction, client); } catch (e) { console.error(e); }
            return;
        }
        if (interaction.isButton() && interaction.customId.startsWith('quest_')) {
            try { await questCmd.handleButton(interaction, client); } catch (e) { console.error(e); }
            return;
        }
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, client);
        } catch (err) {
            console.error(err);
            const msg = { content: `${getEmoji('error')} Something went wrong.`, flags: 64 };
            if (interaction.replied || interaction.deferred) { await interaction.followUp(msg).catch(() => {}); } else { await interaction.reply(msg).catch(() => {}); }
        }
    },
};
