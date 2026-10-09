import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { buildLinkPrompt } from './linkCommands.js';

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('View or run a specific quest'),
    prefix: 'quest',
    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLinkPrompt()); return; }
        const c = new ContainerBuilder().setAccentColor(0x5865F2);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎯 Quest Command\nUse /quests to see the full list or /questall to complete all.`));
        await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 });
    },
    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await message.channel.send(buildLinkPrompt()); return; }
        const c = new ContainerBuilder().setAccentColor(0x5865F2);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎯 Quest Command\nUse !quests to see the full list or !questall to complete all.`));
        await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
    },
};
