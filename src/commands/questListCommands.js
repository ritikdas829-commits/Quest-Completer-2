import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { buildLinkPrompt } from './linkCommands.js';

function buildNoQuestsCard() {
    const c = new ContainerBuilder().setAccentColor(0x4F545C);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔍 No Quests Available`));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

async function runQuestList(userId, tokenStore, send) {
    const token = await tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return; }
    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const all = manager.list();
        if (all.length === 0) { await send(buildNoQuestsCard()); return; }
        for (const q of all.slice(0, 10)) {
            const st = q.isCompleted() ? '✅ Completed' : q.isExpired() ? '🔴 Expired' : '🔵 Available';
            const c = new ContainerBuilder().setAccentColor(0x5865F2);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${q.config.messages.quest_name}\n**Status:** ${st}`));
            await send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (err) {}
}

export const questListCmd = {
    data: new SlashCommandBuilder().setName('questlist').setDescription('List all Discord quests and their status'),
    prefix: 'questlist',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestList(interaction.user.id, client.tokenStore, opts => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestList(message.author.id, client.tokenStore, opts => message.channel.send(opts));
    },
};
