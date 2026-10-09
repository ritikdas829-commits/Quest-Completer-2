
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
import { buildLinkPrompt } from './linkCommands.js';

function fmtDate(d) {
    if (!d) return '10/12/2026';
    try { return new Date(d).toLocaleDateString('en-US'); } catch { return '10/12/2026'; }
}

// EXACT Orbie style card from your screenshot
function buildExactOrbieCard(quest, logStatus = '🧭 Quest selected\n📝 Enrolled', opts = {}) {
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
    
    const rewardCount = q.rewards?.[0]?.count || 700;
    const minutes = Math.round((firstTask.target || 900)/60);
    const banner = opts.bannerUrl || q.assets?.hero || 'https://i.imgur.com/YourAionBanner.jpg';

    // Main Container - Orbie exact
    const main = new ContainerBuilder().setAccentColor(0x2B2D31);

    main.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## <:orb_wreath:1390000000000000000> Quest Solver\n\n` +
            `• **Game:** ${game}\n` +
            `• **Publisher:** ${publisher}\n` +
            `• **Quest Name:** ${questName}\n` +
            `• **Enrolled At:** ${enrolled}\n` +
            `• **Expires At:** ${expires}\n` +
            `• **Progress:**\n` +
            `⚙️ ${progress}%\n` +
            `💻 Desktop: ${desktop}%\n\n` +
            `## Rewards:\n` +
            `• ${rewardCount} Orbs <a:orbs:1390000000000000001>\n\n` +
            `## Tasks:\n` +
            `• Play On Desktop for ${minutes}m`
        )
    );

    main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

    // AION 2 Banner - exact like screenshot
    if (banner && banner.startsWith('http')) {
        try {
            main.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(banner).setDescription('AION 2 - YOUR SAGA TAKES FLIGHT')
                )
            );
            main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
        } catch {}
    }

    // Game button - AION 2: AION 2 LAUNCH PLAY >
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_title_${quest.id}`)
            .setLabel(`${game}: ${questName}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ id: '1390000000000000002', name: 'orbs' }) // will fallback to 💠
    ));

    main.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Start / Stop / Refresh row - exact icons from screenshot
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

    // View Quest button
    main.addActionRowComponents(row => row.addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_view_${quest.id}`)
            .setLabel('View Quest')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '🔗' })
    ));

    // Logs Container - second card exact like screenshot
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    const logLines = logStatus.split('\n').map(l => l.trim()).filter(Boolean);
    const formattedLogs = logLines.map(l => {
        if (l.includes('selected')) return `🧭 ${l.replace('🧭','').trim()}`;
        if (l.includes('Enrolled')) return `📝 ${l.replace('📝','').trim()}`;
        if (l.includes('Starting')) return `▶️ ${l.replace('▶️','').trim()}`;
        return `• ${l}`;
    }).join('\n');

    logs.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 📄 Quest Logs\n\n\`\`\`\n${formattedLogs}\n\`\`\``
        )
    );

    return {
        components: [main, logs],
        flags: MessageFlags.IsComponentsV2
    };
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Quest Solver - Orbie Style'),
    prefix: 'quest',

    async execute(interaction, client) {
        await interaction.deferReply();
        const token = await client.tokenStore.get(interaction.user.id);
        if (!token) { await interaction.followUp(buildLinkPrompt?.() || { content: 'Use /link first', flags: 64 }); return; }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (!valid.length) { await interaction.followUp({ content: 'No quests', flags: 64 }); return; }
            // Use first quest but with AION 2 banner for demo - real will auto pick game banner
            await interaction.followUp(buildExactOrbieCard(valid[0], undefined, {
                bannerUrl: valid[0].config?.assets?.hero || 'https://cdn.discordapp.com/attachments/1380000000000000000/1390000000000000000/aion2.jpg',
                enrolledAt: new Date(),
                expiresAt: valid[0].config?.expires_at
            }));
        } catch (e) {
            console.error(e);
            await interaction.followUp({ content: 'Error: ' + e.message, flags: 64 });
        }
    },

    async prefixExecute(message, _args, client) {
        const token = await client.tokenStore.get(message.author.id);
        if (!token) { await message.channel.send(buildLinkPrompt?.() || 'Use ;link'); return; }
        try {
            const qc = new QuestClient(token);
            const manager = await qc.fetchQuests();
            const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
            if (!valid.length) { await message.channel.send('No quests'); return; }
            await message.channel.send(buildExactOrbieCard(valid[0], undefined, {
                bannerUrl: valid[0].config?.assets?.hero,
                enrolledAt: new Date(),
                expiresAt: valid[0].config?.expires_at
            }));
        } catch (e) {
            await message.channel.send('Error: ' + e.message);
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
        if (['title','view'].includes(action)) {
            if (action === 'view') {
                await interaction.reply({ content: 'https://discord.com/quests', flags: 64 }).catch(()=>{});
            }
            return;
        }

        await interaction.deferUpdate().catch(()=>{});
        const token = await client.tokenStore.get(interaction.user.id);
        const qc = new QuestClient(token);
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid ? manager.filterQuestsValid() : manager;
        const quest = valid.find(q=>q.id===questId) || valid[0];
        if (!quest) return;

        if (action === 'start') {
            await interaction.editReply(buildExactOrbieCard(quest, '🧭 Quest selected\n📝 Enrolled\n▶️ Starting...', { status: 'running', progress: 0, desktop: 0, bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
            setImmediate(async () => {
                try {
                    await qc.doingQuest(quest, (done,total)=>{
                        const p = Math.round(done/total*100);
                        interaction.editReply(buildExactOrbieCard(quest, `🧭 Quest selected\n📝 Enrolled\n▶️ Running ${p}%`, { status: 'running', progress: p, desktop: p, bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
                    });
                    await interaction.editReply(buildExactOrbieCard(quest, '🧭 Quest selected\n📝 Enrolled\n✅ Completed! 700 Orbs claimed', { status: 'idle', progress: 100, desktop: 100, bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
                } catch(err) {
                    await interaction.editReply(buildExactOrbieCard(quest, `❌ Failed: ${err.message}`, { status: 'idle', bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
                }
            });
        } else if (action === 'stop') {
            if (qc.abort) qc.abort();
            await interaction.editReply(buildExactOrbieCard(quest, '🧭 Quest selected\n📝 Enrolled\n⏹️ Stopped', { bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
        } else if (action === 'refresh') {
            await interaction.editReply(buildExactOrbieCard(quest, '🧭 Quest selected\n📝 Enrolled\n🔄 Refreshed', { bannerUrl: quest.config?.assets?.hero })).catch(()=>{});
        }
    }
};

export { buildExactOrbieCard };
