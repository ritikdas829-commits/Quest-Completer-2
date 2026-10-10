import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

const activeRunners = new Map();

function getReal(q){
    const cfg = q.config || q;
    const msgs = cfg.messages || {};
    const appId = cfg.application?.id || '';
    const assets = cfg.assets || {};
    const rewards = cfg.rewards_config?.rewards || [];
    const tasks = (cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {};
    
    // Game & Quest name
    const game = msgs.game_title || msgs.gameTitle || 'Unknown Game';
    const questName = msgs.quest_name || msgs.questName || cfg.title || game;
    
    // Banner - CORRECT URL from your old file - NO POOP
    let banner = null;
    if(appId && assets.game_tile){
        banner = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
    }
    
    // Rewards - CORRECT from old file - NO UNKNOWN
    let rewardText = 'Unknown Reward';
    let orbCount = null;
    if(rewards.length){
        const r = rewards[0];
        const name = r.messages?.name || r.name || 'Reward';
        if(r.orb_quantity){
            orbCount = r.orb_quantity;
            rewardText = `${r.orb_quantity} Orbs \uD83D\uDDB2 ${name}`;
        } else if(r.quantity){
            rewardText = `${r.quantity}d ${name}`;
        } else {
            rewardText = name;
        }
    } else if(msgs.reward_text){
        rewardText = msgs.reward_text;
        const m = rewardText.match(/(\d+)\s*Orbs/i);
        if(m) orbCount = parseInt(m[1]);
    }
    
    // Tasks - Real Random 10s 30s 3m 15m
    const TASK_ICON = {PLAY_ON_DESKTOP:'\uD83D\uDDA5\uFE0F', WATCH_VIDEO:'\uD83C\uDFAC', STREAM_ON_DESKTOP:'\uD83D\uDCFA', PLAY_ACTIVITY:'\uD83C\uDFAE'};
    let taskStr = '';
    let dur = 900;
    let taskType = 'Play';
    Object.entries(tasks).forEach(([k,t])=>{
        const meta = TASK_ICON[k] || '\u2699\uFE0F';
        dur = t.target || 900;
        if(k.includes('WATCH')) taskType = 'Watch Video';
        else if(k.includes('STREAM')) taskType = 'Stream';
        const d = dur < 60 ? `${dur}s` : `${Math.ceil(dur/60)}m`;
        taskStr += `${meta} ${k.replace(/_/g,' ')} • ${d}\n`;
    });
    if(!taskStr) taskStr = '\uD83D\uDDA5\uFE0F Play on Desktop • 15m';
    
    const progress = q.user_status?.progress ? Math.round(q.user_status.progress*100) : 0;
    const isActive = progress < 100 && !q.user_status?.completed_at;
    const qId = String(q.id || cfg.id || '');
    
    return {game, questName, banner, rewardText, orbCount, taskStr, dur, taskType, progress, isActive, qId, appId, expires: cfg.expires_at};
}

function build(quest, all, log){
    const d = getReal(quest);
    const activeCount = all.filter(x=>getReal(x).isActive).length;
    
    const main = new ContainerBuilder().setAccentColor(d.isActive?0x5865F2:0x808080);
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## \uD83D\uDEE1\uFE0F Quest Solver • AUTO-TRACKING\n\n• **Game:** ${d.game}\n• **Quest:** ${d.questName}\n• **Status:** ${d.isActive?'\uD83D\uDFE2 Active':'⚫ Completed'}\n• **Progress:** ${d.progress>=100?'✅':'⏳'} ${d.progress}%\n\n### Rewards (Auto-Tracked):\n• ${d.rewardText}\n\n### Tasks (Real Random):\n${d.taskStr}`
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    if(d.banner){
        try{
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        }catch{}
    }
    
    const opts = all.slice(0,25).map(x=>{
        const rd = getReal(x);
        const durS = rd.dur < 60 ? `${rd.dur}s` : `${Math.ceil(rd.dur/60)}m`;
        const emoji = rd.isActive ? (rd.progress>0?'🟡':'🟢') : '⚫';
        return {
            label: `${rd.game}: ${rd.questName}`.slice(0,100),
            value: rd.qId,
            description: `${emoji} ${rd.rewardText.split(' ').slice(0,2).join(' ')} | ${durS} | ${rd.progress}%`.slice(0,100),
            default: rd.qId===d.qId
        };
    });
    
    main.addActionRowComponents(r=>r.addComponents(
        new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.qId}`).setLabel(d.isActive?'Start Tracking':'Completed').setStyle(d.isActive?ButtonStyle.Primary:ButtonStyle.Secondary).setEmoji({name:d.isActive?'▶️':'✅'}).setDisabled(!d.isActive),
        new ButtonBuilder().setCustomId(`quest_stop_${d.qId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.qId}`).setLabel('Refresh Check').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### \uD83D\uDCE6 Quest Logs • Auto-Check\n\`\`\`\n${log}\n\`\`\``));
    return {components:[main,logs], flags: MessageFlags.IsComponentsV2};
}

function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Not Linked\nUse /link first`)); return {components:[c], flags: MessageFlags.IsComponentsV2}; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver AUTO-TRACKING'),
    prefix:'quest',
    async execute(interaction, client){
        await interaction.deferReply();
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token){ await interaction.followUp(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            const active=valid.filter(q=>getReal(q).isActive);
            const show=active.length?active:valid;
            if(!show.length){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No Active Quests`)); await interaction.followUp({components:[c], flags: MessageFlags.IsComponentsV2}); return; }
            await interaction.followUp(build(show[0], show, `🔍 Auto-Checked: ${active.length} Active / ${valid.length} Total\n💰 ${getReal(show[0]).rewardText}\n📦 Tracking Ready`));
        }catch(e){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,800)}`)); await interaction.followUp({components:[c], flags: MessageFlags.IsComponentsV2}); }
    },
    async prefixExecute(message,_args,client){
        const token=await client.tokenStore.get(message.author.id);
        if(!token){ await message.channel.send(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            const active=valid.filter(q=>getReal(q).isActive);
            const show=active.length?active:valid;
            if(!show.length) return;
            await message.channel.send(build(show[0], show, `🔍 Auto-Checked: ${active.length} Active\n💰 ${getReal(show[0]).rewardText}`));
        }catch(e){ console.error(e); }
    },
    async handleSelectMenu(interaction, client){
        if(interaction.customId!=='quest_select_menu') return;
        await interaction.deferUpdate().catch(()=>{});
        try{
            const token=await client.tokenStore.get(interaction.user.id);
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            const sel=valid.find(q=>String(q.id)===interaction.values[0])||valid[0];
            await interaction.editReply(build(sel, valid, `🧭 ${getReal(sel).questName}\n💰 ${getReal(sel).rewardText}`)).catch(()=>{});
        }catch(e){ console.error(e); }
    },
    async handleButton(interaction, client){
        if(!interaction.customId.startsWith('quest_')) return;
        await interaction.deferUpdate().catch(()=>{});
        const [_, action, qId] = interaction.customId.split('_');
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token) return;
        const qc=new QuestClient(token);
        const mgr=await qc.fetchQuests();
        const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
        const quest=valid.find(q=>String(q.id)===qId)||valid[0];
        const rd=getReal(quest);
        
        if(action==='start'){
            await interaction.editReply(build(quest, valid, `▶️ Tracking: ${rd.questName}\n💰 ${rd.rewardText} • ${rd.taskStr.split('\n')[0]}`)).catch(()=>{});
            setImmediate(async()=>{
                try{
                    try{ await qc.enrollQuest?.(quest); }catch{}
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        interaction.editReply(build({...quest, user_status:{progress:p/100}}, valid, `▶️ Active: ${p}% • ${rd.game}\n💰 ${rd.rewardText} • Auto-Check`, {progress:p})).catch(()=>{});
                    });
                    await interaction.editReply(build({...quest, user_status:{progress:1, completed_at:new Date().toISOString()}}, valid, `✅ Completed! ${rd.questName}\n🎉 ${rd.rewardText} claimed!`)).catch(()=>{});
                }catch(err){ await interaction.editReply(build(quest, valid, `❌ ${err.message}\n💡 Refresh Check karo`)).catch(()=>{}); }
            });
        }else if(action==='stop'){
            await interaction.editReply(build(quest, valid, '⏹️ Stopped')).catch(()=>{});
        }else if(action==='refresh'){
            const fresh=await qc.fetchQuests();
            const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
            const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
            await interaction.editReply(build(fQuest, fValid, `🔄 Refresh: ${getReal(fQuest).progress}% | ${getReal(fQuest).rewardText}`)).catch(()=>{});
        }
    }
};
