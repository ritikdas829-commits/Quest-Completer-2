import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { enableAutoquest, disableAutoquest, isAutoquestEnabled } from '../quest/autoquestStore.js';
import { PREFIX } from '../utils/config.js';

async function runAutoquestToggle(userId, tokenStore, replyFn) {
    if (isAutoquestEnabled(userId)) {
        disableAutoquest(userId);
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Disabled`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    if (!(await tokenStore.has(userId))) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ No Saved Token\nUse \`${PREFIX}link\` first.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    enableAutoquest(userId);
    const c = new ContainerBuilder().setAccentColor(0x57F287);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Enabled!`));
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

export const autoquestCmd = {
    data: new SlashCommandBuilder().setName('autoquest').setDescription('Auto-complete every new quest the moment it drops'),
    prefix: 'autoquest',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runAutoquestToggle(interaction.user.id, client.tokenStore, opts => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runAutoquestToggle(message.author.id, client.tokenStore, opts => message.reply(opts));
    },
};

export async function runAutoquestForUser(userId, quest, tokenStore, discordClient) {
    const token = await tokenStore.get(userId);
    if (!token) { disableAutoquest(userId); return; }
    const { QuestClient: QC } = await import('../quest/questClient.js');
    const { Quest: Q } = await import('../quest/quest.js');
    const qc = new QC(token);
    try {
        const manager = await qc.fetchQuests();
        let live = manager.get(quest.id) || Q.create({ id: quest.id, config: quest.config, user_status: null });
        if (live.isCompleted() || live.isExpired()) return;
        await manager.doingQuest(live, console.log);
        await manager.claimRewards(console.log).catch(() => 0);
    } catch (err) {
        if (String(err).includes('401')) {
            await tokenStore.remove(userId);
            disableAutoquest(userId);
        }
    }
}
