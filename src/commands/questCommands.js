import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { disableAutoquest } from '../quest/autoquestStore.js';
import { buildLinkPrompt } from './linkCommands.js';

function buildNoQuestsCard() {
    const c = new ContainerBuilder().setAccentColor(0x4F545C);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔍 No Quests Available`));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildExpiredTokenCard() {
    const c = new ContainerBuilder().setAccentColor(0xED4245);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Expired`));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildQuestInfoCard(quest, phase) {
    const c = new ContainerBuilder().setAccentColor(phase === 'done' ? 0x57F287 : phase === 'failed' ? 0xED4245 : 0x5865F2);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${phase.toUpperCase()}\n### ${quest.config.messages.quest_name}`));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

async function runQuestAll(userId, tokenStore, send) {
    const token = await tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return false; }
    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        if (valid.length === 0) { await send(buildNoQuestsCard()); return false; }
        const progressMsgs = await Promise.all(valid.map(q => send(buildQuestInfoCard(q, 'starting'))));
        const results = await Promise.allSettled(valid.map(q => manager.doingQuest(q, console.log)));
        const completed = valid.filter((_, i) => results[i].status === 'fulfilled' && results[i].value === true);
        if (completed.length === 0) {
            await send({ components: [new ContainerBuilder().setAccentColor(0xFEE75C).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# No Quests Auto-Completed`))], flags: MessageFlags.IsComponentsV2 });
            return false;
        }
        const claimed = await manager.claimRewards(console.log).catch(() => 0);
        await Promise.allSettled(completed.map(q => progressMsgs[valid.indexOf(q)].edit(buildQuestInfoCard(q, 'done'))));
        return true;
    } catch (err) {
        if (String(err).includes('401') && (await tokenStore.has(userId))) {
            await tokenStore.remove(userId); disableAutoquest(userId);
            await send(buildExpiredTokenCard()).catch(() => {});
        }
        return false;
    }
}

export const questAllCmd = {
    data: new SlashCommandBuilder().setName('questall').setDescription('Complete all quests at once'),
    prefix: 'questall',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestAll(interaction.user.id, client.tokenStore, opts => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestAll(message.author.id, client.tokenStore, opts => message.channel.send(opts));
    },
};
