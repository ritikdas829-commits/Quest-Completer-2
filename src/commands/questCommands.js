
import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ButtonBuilder,
    ButtonStyle,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

function fmtDate(d) {
    if (!d) return '10/12/2026';
    try { return new Date(d).toLocaleDateString('en-US'); } catch { return '10/12/2026'; }
}

// FIXED - No invalid emoji IDs, No content field with V2
function buildExactOrbieCard(quest, logStatus = 'Quest selected\nEnrolled', opts = {}) {
    const q = quest.config || quest;
    const app = q.application || {};
    const taskConf = q.task_config || q.taskConfig || {};
    const firstTask = Object.values(taskConf?.tasks || {})[0] || {};
    
    const game = opts.game || q.messages?.gameTitle || app.name || 'AION 2';
    const publisher = opts.publisher || q.messages?.publisherName || app.publisher || 'NC';
    const questName = opts.questName || q.messages?.questName || q.id || 'AION 2 LAUNCH PLAY';
    const enrolled = fmtDate(opts.enrolledAt || new Date());
    const expires = fmtDate(opts.expiresAt || q.expires_at || '10/12/2026');
    const progress = opts.progress ?? 0;
    const desktop = opts.desktop ?? 0;
    const status = opts.status || 'idle';
    
    const rewardCount = q.rewards?.[0]?.count || q.config?.rewards?.[0]?.count || 700;
    const minutes = Math.round((firstTask.target || 900)/60);
    const banner = opts.bannerUrl || q.assets?.hero || q.config?.assets?.hero || null;

    const main = new ContainerBuilder().setAccentColor(0x5865F2);

    main.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🛡️ Quest Solver\n\n` +
            `• **Game:** ${game}\n` +
            `• **Publisher:** ${publisher}\n` +
            `• **Quest Name:** ${questName}\n` +
            `• **Enrolled At:** ${enrolled}\n` +
            `• **Expires At:** ${expires}\n` +
            `• **Progress:**\n` +
            `⏳ ${progress}%\n` +
            `💻 Desktop: ${desktop}%\n\n` +
            `### Rewards:\n` +
            `• ${rewardCount} Orbs 💠\n\n` +
            `### Tasks:\n` +
            `• Play On Desktop for ${minutes}m`
        )
    );

    main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

    if (banner && banner.startsWith('http')) {
        try {
            main.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(banner)
                )
            );
            main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
        } catch {}
    }

    // FIX: Use unicode emoji only, NO custom ID
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_title_${quest.id}`)
            .setLabel(`${game}: ${questName}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '💠' })
    ));

    main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_start_${quest.id}`)
            .setLabel('Start')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '▶️' })
            .setDisabled(status === 'running'),
        new ButtonBuilder()
            .setCustomId(`quest_stop_${quest.id}`)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '⏹️' }),
        new ButtonBuilder()
            .setCustomId(`quest_refresh_${quest.id}`)
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '🔄' })
    ));

    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder()
            .setLabel('View Quest')
            .setURL('https://discord.com/quests')
            .setStyle(ButtonStyle.Link)
            .setEmoji({ name: '🔗' })
    ));

    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### 📦 Quest Logs\n\`\`\`\n${logStatus}\n\`\`\``
        )
    );

    return {
        components: [main, logs],
        flags: MessageFlags.IsComponentsV2
    };
}

function buildLinkPromptV2() {
    const c = new ContainerBuilder().setAccentColor(0xFF0000);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Not Linked\n\nPlease link your account first using \`/link\` command.\n\n**How to link:**\n1. Use \`/link\`\n2. Enter your token\n3. Then use \`?quest\``));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver - Orbie Style'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { 
            await interaction.followUp(buildLinkPromptV2()); 
            return; 
        }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests found.`));
                await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await interaction.followUp(buildExactOrbieCard(valid[0], undefined, {
                bannerUrl: valid[0].config?.assets?.hero || valid[0].assets?.hero,
                enrolledAt: new Date(),
                expiresAt: valid[0].config?.expires_at
            }));
        } catch (e) {
            console.error(e);
            const c = new ContainerBuilder().setAccentColor(0xFF0000);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``));
            await interaction.followUp({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { 
            await message.channel.send(buildLinkPromptV2()); 
            return; 
        }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (!valid.length) { 
                const c = new ContainerBuilder().setAccentColor(0xFF0000);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No active quests found.`));
                await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }); 
                return; 
            }
            await message.channel.send(buildExactOrbieCard(valid[0], undefined, {
                bannerUrl: valid[0].config?.assets?.hero || valid[0].assets?.hero,
                enrolledAt: new Date(),
                expiresAt: valid[0].config?.expires_at
            }));
        } catch (e) {
            console.error(e);
            const c = new ContainerBuilder().setAccentColor(0xFF0000);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``));
            await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleButton(interaction, client) {
        const id = interaction.customId;
        if (!id.startsWith('quest_')) return;
        const without = id.replace('quest_', '');
        const sep = without.indexOf('_');
        if (sep === -1) return;
        const action = without.slice(0, sep);
        const questId = without.slice(sep+1);
        if (['title'].includes(action)) return;

        await interaction.deferUpdate().catch(()=>{});
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) return;
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
        const quest = valid.find(q=>q.id===questId) || valid[0];
        if (!quest) return;

        if (action === 'start') {
            await interaction.editReply(buildExactOrbieCard(quest, 'Quest selected\nEnrolled\nStarting...', { status: 'running', progress: 0, desktop: 0, bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        interaction.editReply(buildExactOrbieCard(quest, `Quest selected\nEnrolled\nRunning ${p}%`, { status: 'running', progress: p, desktop: p, bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
                    });
                    await interaction.editReply(buildExactOrbieCard(quest, 'Quest selected\nEnrolled\nCompleted! 700 Orbs claimed', { status: 'idle', progress: 100, desktop: 100, bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
                } catch(err) {
                    await interaction.editReply(buildExactOrbieCard(quest, `Failed: ${err.message}`, { status: 'idle', bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
                }
            });
        } else if (action === 'stop') {
            if (qc.abort) qc.abort();
            await interaction.editReply(buildExactOrbieCard(quest, 'Quest selected\nEnrolled\nStopped', { bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
        } else if (action === 'refresh') {
            await interaction.editReply(buildExactOrbieCard(quest, 'Quest selected\nEnrolled\nRefreshed', { bannerUrl: quest.config?.assets?.hero || quest.assets?.hero })).catch(()=>{});
        }
    }
};

export { buildExactOrbieCard };
