import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} from 'discord.js';
import { PREFIX } from '../utils/config.js';

async function runTokenCheck(userId, tokenStore, replyFn) {
    const token = await tokenStore.get(userId);
    if (!token) {
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# No Token Saved\nUse \`${PREFIX}link\` to save one.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    let valid = false, accountName = '';
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        valid = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch { valid = false; }
    const c = new ContainerBuilder().setAccentColor(valid ? 0x57F287 : 0xED4245);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(valid ? `# ✅ Token is Valid\nLinked as **"${accountName}"**.` : `# ❌ Token Invalid or Expired`));
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
    if (!valid) await tokenStore.remove(userId);
}

export const tokenCheckCmd = {
    data: new SlashCommandBuilder().setName('tokencheck').setDescription('Check whether your saved Discord token is still valid'),
    prefix: 'tokencheck',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runTokenCheck(interaction.user.id, client.tokenStore, opts => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runTokenCheck(message.author.id, client.tokenStore, opts => message.reply(opts));
    },
};
