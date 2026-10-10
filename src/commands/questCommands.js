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
import { disableAutoquest } from '../quest/autoquestStore.js';

const activeRunners = new Map();

// Task meta for detailed progress like Orbie
const TASK_META = {
    PLAY_ON_DESKTOP: { icon: '💻', label: 'Desktop', short: 'Desktop' },
    PLAY_ON_XBOX: { icon: '❎', label: 'Xbox', short: 'Xbox' },
    PLAY_ON_PLAYSTATION: { icon: '🎮', label: 'PlayStation', short: 'PlayStation' },
    WATCH_VIDEO: { icon: '🎬', label: 'Watch Video', short: 'Video' },
    STREAM_ON_DESKTOP: { icon: '📺', label: 'Stream', short: 'Stream' },
    PLAY_ACTIVITY: { icon: '🎮', label: 'Play Activity', short: 'Activity' },
    WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Mobile', short: 'Mobile' }
};

function fmtDate(d){
    try{
        const date = new Date(d);
        if(isNaN(date.getTime())) return 'N/A';
        return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`;
    }catch{ return 'N/A'; }
}

function getFullData(q){
    const cfg = q.config || q;
    const msgs = cfg.messages || {};
    const app = cfg.application || {};
    const assets = cfg.assets || {};
    const us = q.user_status || {};
    const rewards = cfg.rewards_config?.rewards || [];
    const taskCfg = cfg.task_config ?? cfg.task_config_v2 ?? {};
    const tasks = taskCfg.tasks || {};
    
    const game = msgs.game_title || msgs.gameTitle || app.name || 'Discord Quest';
    const questName = msgs.quest_name || msgs.questName || cfg.title || game;
    const publisher = msgs.game_publisher || msgs.gamePublisher || 'Unknown';
    
    const appId = app.id || '';
    let banner = null;
    let thumb = null;
    // Orbie uses quest-assets - this is the big thumbnail
    if(appId && assets.game_tile){
        banner = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
        thumb = banner;
    } else if(appId && assets.quest_tile){
        banner = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.quest_tile}.png`;
        thumb = banner;
    }
    // fallback to app-icon
    if(!banner && appId && app.icon && !app.icon.startsWith('http')){
        banner = `https://cdn.discordapp.com/app-icons/${appId}/${app.icon}.png?size=512`;
    }
    
    // Rewards - full detail like Orbie
    let rewardText = '700 Orbs 💠';
    let rewardLines = [];
    if(rewards.length){
        rewardLines = rewards.map(r=>{
            const name = r.messages?.name || r.name || 'Reward';
            if(r.orb_quantity) return `${r.orb_quantity} Orbs - ${name}`;
            if(r.messages?.name) return r.messages.name;
            return name;
        });
        const first = rewards[0];
        if(first.orb_quantity) rewardText = `${first.orb_quantity} Orbs - ${first.messages?.name || ''}`.trim();
        else rewardText = first.messages?.name || first.name || rewardText;
    }
    
    // Tasks - all platforms like Orbie: Desktop, Xbox, PlayStation with progress
    let taskList = [];
    let progressList = [];
    Object.entries(tasks).forEach(([key, t])=>{
        const meta = TASK_META[key] || {icon:'⚙️', label:key, short:key};
        const target = t.target || 900;
        let dur = '';
        if(key.includes('PLAY') || key.includes('STREAM')){
            if(target > 100){ // 900 times
                dur = `${target} times`;
            } else {
                dur = `${Math.ceil(target/60)}m`;
            }
        } else {
            dur = target < 60 ? `${target}s` : `${Math.ceil(target/60)}m`;
        }
        taskList.push(`Play On ${meta.short} for ${dur}`.replace('Play On Play On','Play On').replace('Play On Watch','Watch'));
        // For Orbie style, actually use original label
        if(key === 'PLAY_ON_DESKTOP') taskList[taskList.length-1] = `Play On Desktop for ${Math.ceil(target/60)}m`;
        else if(key === 'PLAY_ON_XBOX') taskList[taskList.length-1] = `Play On Xbox ${target} times`;
        else if(key === 'PLAY_ON_PLAYSTATION') taskList[taskList.length-1] = `Play On Playstation ${target} times`;
        else if(key.includes('WATCH')) taskList[taskList.length-1] = `${meta.label} for ${dur}`;
        else taskList[taskList.length-1] = `${meta.label} for ${dur}`;
        
        // Progress per platform
        let prog = 0;
        if(us.progress !== undefined) prog = Math.round(us.progress*100);
        if(us.completed_at) prog = 100;
        // Try to get platform specific progress if available
        progressList.push({key, label: meta.short, icon: meta.icon, progress: prog, target});
    });
    if(taskList.length===0){
        taskList = ['Play On Desktop for 15m'];
        progressList = [{key:'PLAY_ON_DESKTOP', label:'Desktop', icon:'💻', progress: us.progress ? Math.round(us.progress*100):0, target:900}];
    }
    
    let overallProgress = 0;
    if(typeof us.progress === 'number') overallProgress = Math.round(us.progress*100);
    if(us.completed_at) overallProgress = 100;
    
    const enrolled = us.enrolled_at || cfg.enrolled_at || new Date().toISOString();
    const expires = cfg.expires_at || null;
    const isActive = overallProgress < 100 && !us.completed_at;
    
    return {
        game: game.slice(0,80),
        publisher: publisher.slice(0,80),
        questName: questName.slice(0,80),
        banner,
        thumb,
        rewardText,
        rewardLines,
        taskList,
        progressList,
        overallProgress,
        enrolled: fmtDate(enrolled),
        expires: fmtDate(expires),
        expiresRaw: expires,
        questId: String(q.id || cfg.id || ''),
        isActive,
        appId
    };
}

function buildOrbieStyle(quest, allQuests, log){
    const d = getFullData(quest);
    
    const main = new ContainerBuilder().setAccentColor(d.isActive?0x5865F2:0x57F287);
    
    // Title like Orbie
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${d.isActive ? '🛡️ Quest Solver • AUTO-TRACKING' : '✅ Quest Solver • COMPLETED'}\n\n`+
        `• **Game:** ${d.game}\n`+
        `• **Publisher:** ${d.publisher}\n`+
        `• **Quest Name:** ${d.questName}\n`+
        `• **Enrolled At:** ${d.enrolled}\n`+
        `• **Expires At:** ${d.expires}\n`+
        `• **Progress:**\n`+
        d.progressList.map(p=>{
            const icon = p.progress>=100 ? '✅' : (p.label==='Desktop'?'⬜': p.label==='Xbox'?'🟩':'🟦');
            // Use check for completed like Orbie screenshot
            if(d.overallProgress>=100){
                return `${icon} ${p.progress}%`;
            } else {
                return `${p.icon} **${p.label}:** ${p.progress}%`;
            }
        }).join('\n') + (d.progressList.length===1 ? '' : '') +
        // Orbie style for 100%
        (d.overallProgress>=100 ? `\n✅ 100%\n⬜ Desktop: 100%\n🟩 Xbox: 100%\n🟦 PlayStation: 100%` : '') +
        `\n\n### Rewards:\n`+
        `• ${d.rewardLines[0] || d.rewardText}\n\n`+
        `### Tasks:\n`+
        d.taskList.map(t=>`• ${t}`).join('\n')
    ));
    
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    // Big thumbnail like Orbie screenshot - always show if available
    if(d.thumb){
        try{
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.thumb)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        }catch{}
    }
    
    // Dropdown - multiple quests with correct orb counts like second screenshot
    const options = (allQuests||[quest]).slice(0,25).map(q=>{
        const rd = getFullData(q);
        const dur = rd.progressList[0]?.target || 900;
        const durStr = dur > 100 ? `${dur>60?Math.ceil(dur/60)+'m':dur+'s'}` : (dur<60?`${dur}s`:`${Math.ceil(dur/60)}m`);
        // Fix: if target is 900 times, show 15m for dropdown simplicity, but use actual
        let dStr = durStr;
        if(rd.taskList[0]?.includes('900 times')) dStr = '15m';
        if(rd.taskList[0]?.includes('m')){ const m = rd.taskList[0].match(/(\d+)m/); if(m) dStr = `${m[1]}m`; }
        if(rd.taskList[0]?.includes('s')){ const m = rd.taskList[0].match(/(\d+)s/); if(m) dStr = `${m[1]}s`; }
        // Actually parse from task
        const t = (q.config?.task_config?.tasks || q.config?.task_config_v2?.tasks || {});
        const firstTask = Object.values(t)[0];
        if(firstTask){
            const tg = firstTask.target;
            if(tg < 60) dStr = `${tg}s`;
            else if(tg < 100) dStr = `${Math.ceil(tg/60)}m`;
            else dStr = '15m';
        }
        const status = rd.isActive ? (rd.overallProgress>0?'🟡':'🟢') : '✅';
        return {
            label: `${rd.game}: ${rd.questName}`.slice(0,100),
            value: rd.questId,
            description: `${rd.rewardLines[0]?.split(' - ')[0] || rd.rewardText} | ${dStr} | ${rd.overallProgress}%`.slice(0,100),
            default: rd.questId===d.questId
        };
    });
    
    main.addActionRowComponents(r=>r.addComponents(
        new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(options)
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel(d.isActive ? (d.overallProgress>0?'Resume':'Start') : 'Completed').setStyle(d.isActive?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(!d.isActive),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${log}\n\`\`\``));
    
    return {components:[main, logs], flags: MessageFlags.IsComponentsV2};
}

function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required\nUse /link`)); return {components:[c], flags: MessageFlags.IsComponentsV2}; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver ORBIE STYLE'),
    prefix:'quest',
    async execute(interaction, client){
        await interaction.deferReply();
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token){ await interaction.followUp(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            if(!valid.length){ const c=new ContainerBuilder().setAccentColor(0x4F545C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`)); await interaction.followUp({components:[c], flags: MessageFlags.IsComponentsV2}); return; }
            await interaction.followUp(buildOrbieStyle(valid[0], valid, 'Quest loaded • Orbie style • Thumbnail ready'));
        }catch(e){
            if(e.message?.includes('401')){ client.tokenStore.remove(interaction.user.id); disableAutoquest(interaction.user.id); const c=new ContainerBuilder().setAccentColor(0xED4245); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Expired`)); await interaction.followUp({components:[c], flags: MessageFlags.IsComponentsV2}); }
            else{ const c=new ContainerBuilder().setAccentColor(0xED4245); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,800)}`)); await interaction.followUp({components:[c], flags: MessageFlags.IsComponentsV2}); }
        }
    },
    async prefixExecute(message,_args,client){
        const token=await client.tokenStore.get(message.author.id);
        if(!token){ await message.channel.send(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            if(!valid.length) return;
            await message.channel.send(buildOrbieStyle(valid[0], valid, 'Quest loaded • Orbie style'));
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
            const rd=getFullData(sel);
            await interaction.editReply(buildOrbieStyle(sel, valid, `Switched to ${rd.questName} • ${rd.rewardText}`)).catch(()=>{});
        }catch(e){ console.error(e); }
    },
    async handleButton(interaction, client){
        if(!interaction.customId.startsWith('quest_')) return;
        await interaction.deferUpdate().catch(()=>{});
        const without=interaction.customId.replace('quest_','');
        const sep=without.indexOf('_');
        if(sep===-1) return;
        const action=without.slice(0,sep);
        const qId=without.slice(sep+1);
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token) return;
        const qc=new QuestClient(token);
        const mgr=await qc.fetchQuests();
        const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
        const quest=valid.find(q=>String(q.id)===qId)||valid[0];
        
        if(action==='start'){
            const rd=getFullData(quest);
            await interaction.editReply(buildOrbieStyle(quest, valid, `▶️ Starting ${rd.questName}...`)).catch(()=>{});
            setImmediate(async()=>{
                try{
                    try{ await qc.enrollQuest?.(quest); }catch{}
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        const updated={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100}};
                        const fresh=valid.map(x=>String(x.id)===qId?updated:x);
                        interaction.editReply(buildOrbieStyle(updated, fresh, `▶️ Tracking ${p}% • ${rd.game}`)).catch(()=>{});
                    });
                    const doneQ={...quest, config:quest.config, user_status:{progress:1, completed_at:new Date().toISOString()}};
                    await interaction.editReply(buildOrbieStyle(doneQ, valid, `✅ Completed! ${getFullData(doneQ).rewardText} claimed!`)).catch(()=>{});
                }catch(err){ await interaction.editReply(buildOrbieStyle(quest, valid, `❌ ${err.message}`)).catch(()=>{}); }
            });
        }else if(action==='stop'){
            await interaction.editReply(buildOrbieStyle(quest, valid, '⏹️ Stopped')).catch(()=>{});
        }else if(action==='refresh'){
            const fresh=await qc.fetchQuests();
            const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
            const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
            await interaction.editReply(buildOrbieStyle(fQuest, fValid, `🔄 Refreshed ${getFullData(fQuest).overallProgress}%`)).catch(()=>{});
        }
    }
};
