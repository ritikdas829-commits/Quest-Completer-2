import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from 'discord.js';
import { disableAutoquest } from '../quest/autoquestStore.js';
import { PREFIX } from '../utils/config.js';

function sanitizeToken(raw) {
    return raw.trim()
        .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
        .replace(/^`+|`+$/g, '')
        .replace(/^Bot\s+/i, '')
        .trim();
}

function isValidUserToken(token) {
    return token.length >= 50 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(token);
}

export function buildLinkModal() {
    const modal = new ModalBuilder()
        .setCustomId('link_token_modal')
        .setTitle('Link Your Discord Token');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('link_token_input')
                .setLabel('Your Discord user token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste your token here...')
                .setRequired(true),
        ),
    );
    return modal;
}

export function buildLinkPrompt() {
    const c = new ContainerBuilder().setAccentColor(0xFEE75C);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🔗 Token Required\nYou need to link your Discord token before using quest commands.\n\nClick **Link Token** below — a popup will appear where you can paste your token.\n\n**How to get your token:**\n\`1.\` Open Discord in your **browser** (not the app)\n\`2.\` Press \`Ctrl+Shift+I\` → **Network** tab → filter \`XHR\`\n\`3.\` Send any message, click the request, find \`Authorization\` in headers\n\`4.\` Copy that value and paste it into the popup\n\n> ⚠️ This is your **user token**, NOT your bot token.`,
        ),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('link_prompt')
                .setLabel('🔗 Link Token')
                .setStyle(ButtonStyle.Primary),
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export const linkCmd = {
    data: new SlashCommandBuilder().setName('link').setDescription('Save your Discord token so you never have to enter it again'),
    prefix: 'link',
    async execute(interaction, _client) {
        await interaction.showModal(buildLinkModal());
    },
    async prefixExecute(message, args, client) {
        const ts = client.tokenStore;
        const inlineToken = args.join('').trim();
        if (inlineToken) {
            try { await message.delete(); } catch {}
            const token = sanitizeToken(inlineToken);
            const sendDM = async (payload) => {
                const user = await client.users.fetch(message.author.id).catch(() => null);
                const dm = await user?.createDM().catch(() => null);
                await dm?.send(payload).catch(() => {});
            };
            if (!isValidUserToken(token)) {
                await sendDM({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format\nCopy the Authorization header value correctly.`))], flags: MessageFlags.IsComponentsV2 });
                return;
            }
            let accountName = '', verifyOk = false;
            try {
                const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
                verifyOk = res.ok;
                if (res.ok) {
                    const data = await res.json();
                    accountName = data.global_name || data.username || '';
                }
            } catch {}
            if (!verifyOk) {
                await sendDM({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord`))], flags: MessageFlags.IsComponentsV2 });
                return;
            }
            await ts.save(message.author.id, token);
            await sendDM({ components: [new ContainerBuilder().setAccentColor(0x57F287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ Token Linked!\nLinked as **"${accountName}"**.`))], flags: MessageFlags.IsComponentsV2 });
            return;
        }
        await message.reply(buildLinkPrompt());
    },
};

export const unlinkCmd = {
    data: new SlashCommandBuilder().setName('unlink').setDescription('Remove your saved Discord token'),
    prefix: 'unlink',
    async execute(interaction, client) {
        const removed = await client.tokenStore.remove(interaction.user.id);
        disableAutoquest(interaction.user.id);
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(removed ? `# 🔓 Token Unlinked\nYour saved token has been removed.` : `# No Token Saved\nYou don't have a saved token.`));
        await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },
    async prefixExecute(message, _args, client) {
        const removed = await client.tokenStore.remove(message.author.id);
        disableAutoquest(message.author.id);
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(removed ? `# 🔓 Token Unlinked\nYour saved token has been removed.` : `# No Token Saved\nYou don't have a saved token.`));
        await message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    },
};

export async function handleLinkModal(interaction, client) {
    const ts = client.tokenStore;
    const raw = interaction.fields.getTextInputValue('link_token_input');
    const token = sanitizeToken(raw);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isValidUserToken(token)) {
        await interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format`))], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    let accountName = '', verifyOk = false;
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        verifyOk = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch {}
    if (!verifyOk) {
        await interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord`))], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    await ts.save(interaction.user.id, token);
    await interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0x57F287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ Token Linked!\nLinked as **"${accountName}"**.`))], flags: MessageFlags.IsComponentsV2 });
}

export async function handleLinkPromptButton(interaction) {
    await interaction.showModal(buildLinkModal());
}
