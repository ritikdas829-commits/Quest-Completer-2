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

function fmtDate(d){
    try{
        const date = new Date(d);
        if(isNaN(date.getTime())) return 'N/A';
        return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`;
    }catch{ return 'N/A'; }
}

function getData(q){
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
    const publisher = msgs.game_publisher || msgs.gamePublisher || 'Unknown Publisher';
    
    const appId = app.id || '';
    let banner = null;
    // ONLY use quest-assets - NEVER app-icons (poop fix)
    if(appId && assets.game_tile){
        banner = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
    } else if(appId && assets.quest_tile){
        banner = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.quest_tile}.png`;
    }
    // If no game_tile, NO banner - better than poop
    
    // REWARDS - CLEAN, NO DUPLICATE
    let rewardLines = [];
    if(rewards.length){
        rewardLines = rewards.map(r=>{
            const name = r.messages?.name || r.name || '';
            const orb = r.orb_quantity;
            if(orb && name){
                // If name already contains Orbs, don't duplicate
                if(name.toLowerCase().includes('orb')) return name;
                return `${name} (${orb} Orbs)`;
            }
            if(orb) return `${orb} Orbs`;
            if(name) return name;
            return 'Reward';
        });
    } else {
        rewardLines = ['700 Orbs'];
    }
    // Fix duplicate "700 Orbs - 700 Orbs"
    rewardLines = rewardLines.map(r=> r.replace(/(\d+ Orbs)\s*-\s*\1/i, '$1').trim());
    
    // TASKS - ONLY real tasks, no fake Xbox 0%
    let taskList = [];
    let progressList = [];
    Object.entries(tasks).forEach(([key, t])=>{
        const target = t.target || 900;
        if(key === 'PLAY_ON_DESKTOP'){
            taskList.push(`Play On Desktop for ${Math.ceil(target/60)}m`);
            progressList.push({label:'Desktop', icon:'💻', progress: us.progress ? Math.round(us.progress*100):0});
        } else if(key === 'PLAY_ON_XBOX'){
            taskList.push(`Play On Xbox ${target} times`);
            progressList.push({label:'Xbox', icon:'❎', progress: 0});
        } else if(key === 'PLAY_ON_PLAYSTATION'){
            taskList.push(`Play On Playstation ${target} times`);
            progressList.push({label:'PlayStation', icon:'🎮', progress: 0});
        } else if(key.includes('WATCH')){
            const dur = target < 60 ? `${target}s` : `${Math.ceil(target/60)}m`;
            taskList.push(`Watch Video for ${dur}`);
            progressList.push({label:'Video', icon:'🎬', progress: us.progress ? Math.round(us.progress*100):0});
        } else if(key.includes('STREAM')){
            taskList.push(`Stream On Desktop for ${Math.ceil(target/60)}m`);
            progressList.push({label:'Desktop', icon:'💻', progress: us.progress ? Math.round(us.progress*100):0});
        }
    });
    if(taskList.length===0){
        taskList = ['Play On Desktop for 15m'];
        progressList = [{label:'Desktop', icon:'💻', progress: us.progress ? Math.round(us.progress*100):0}];
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
        rewardLines,
        taskList,
        progressList,
        overallProgress,
        enrolled: fmtDate(enrolled),
        expires: fmtDate(expires),
        questId: String(q.id || cfg.id || ''),
        isActive
    };
}

function buildClean(quest, allQuests, logText){
    const d = getData(quest);
    
    const main = new ContainerBuilder().setAccentColor(0x5865F2);
    
    // CLEAN - No AUTO-TRACKING, just Quest Solver like Orbie
    const progressLines = d.progressList.map(p=>{
        if(d.overallProgress >= 100) return `✅ ${p.progress}%`;
        return `${p.icon} **${p.label}:** ${d.overallProgress}%`;
    }).join('\n');
    
    // For completed - show like Orbie screenshot
    let progDisplay = progressLines;
    if(d.overallProgress >= 100 && d.progressList.length > 1){
        progDisplay = `✅ 100%\n` + d.progressList.map(p=>{
            if(p.label==='Desktop') return `⬜ Desktop: 100%`;
            if(p.label==='Xbox') return `🟩 Xbox: 100%`;
            if(p.label==='PlayStation') return `🟦 PlayStation: 100%`;
            return `${p.icon} ${p.label}: 100%`;
        }).join('\n');
    } else if(d.overallProgress < 100 && d.progressList.length === 1){
        // Single platform - simple like your screenshot should be
        progDisplay = `${d.progressList[0].icon} **${d.progressList[0].label}:** ${d.overallProgress}%`;
    }
    
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🌀 Quest Solver\n\n`+
        `• **Game:** ${d.game}\n`+
        `• **Publisher:** ${d.publisher}\n`+
        `• **Quest Name:** ${d.questName}\n`+
        `• **Enrolled At:** ${d.enrolled}\n`+
        `• **Expires At:** ${d.expires}\n`+
        `• **Progress:**\n${progDisplay}\n\n`+
        `### Rewards:\n`+
        d.rewardLines.map(r=>`• ${r}`).join('\n') + `\n\n`+
        `### Tasks:\n`+
        d.taskList.map(t=>`• ${t}`).join('\n')
    ));
    
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    // BANNER - Only if real quest-assets exists, else HIDE (no poop)
    if(d.banner){
        try{
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        }catch{
            // If banner fails, don't show anything - no poop
        }
    }
    
    // DROPDOWN - Clean
    const options = (allQuests||[quest]).slice(0,25).map(q=>{
        const rd = getData(q);
        const firstTask = (q.config?.task_config?.tasks || q.config?.task_config_v2?.tasks || {});
        const tVal = Object.values(firstTask)[0]?.target || 900;
        const dStr = tVal < 60 ? `${tVal}s` : `${Math.ceil(tVal/60)}m`;
        const status = rd.isActive ? '🟢' : '✅';
        // Clean description - no duplicate
        const rewardShort = rd.rewardLines[0]?.split(' (')[0] || rd.rewardLines[0] || 'Reward';
        return {
            label: `${rd.game}: ${rd.questName}`.slice(0,100),
            value: rd.questId,
            description: `${rewardShort} | ${dStr} | ${rd.overallProgress}%`.slice(0,100),
            default: rd.questId===d.questId
        };
    });
    
    main.addActionRowComponents(r=>r.addComponents(
        new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(options)
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel(d.isActive ? 'Start' : 'Completed').setStyle(d.isActive?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(!d.isActive),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logText}\n\`\`\``));
    
    return {components:[main, logs], flags: MessageFlags.IsComponentsV2};
}

function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required\nUse /link`)); return {components:[c], flags: MessageFlags.IsComponentsV2}; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver - Clean Orbie Clone'),
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
            await interaction.followUp(buildClean(valid[0], valid, 'Quest loaded • Clean Orbie style • No fake'));
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
            await message.channel.send(buildClean(valid[0], valid, 'Quest loaded • Clean'));
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
            await interaction.editReply(buildClean(sel, valid, `Quest selected: ${getData(sel).questName}`)).catch(()=>{});
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
            const rd=getData(quest);
            await interaction.editReply(buildClean(quest, valid, `Starting ${rd.questName}...`)).catch(()=>{});
            setImmediate(async()=>{
                try{
                    try{ await qc.enrollQuest?.(quest); }catch{}
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        const updated={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100}};
                        const fresh=valid.map(x=>String(x.id)===qId?updated:x);
                        interaction.editReply(buildClean(updated, fresh, `Progress: ${p}% • ${rd.game}`)).catch(()=>{});
                    });
                    const doneQ={...quest, config:quest.config, user_status:{progress:1, completed_at:new Date().toISOString()}};
                    await interaction.editReply(buildClean(doneQ, valid, `Completed! ${getData(doneQ).rewardLines[0]} claimed!`)).catch(()=>{});
                }catch(err){ await interaction.editReply(buildClean(quest, valid, `Error: ${err.message}`)).catch(()=>{}); }
            });
        }else if(action==='stop'){
            await interaction.editReply(buildClean(quest, valid, 'Stopped')).catch(()=>{});
        }else if(action==='refresh'){
            const fresh=await qc.fetchQuests();
            const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
            const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
            await interaction.editReply(buildClean(fQuest, fValid, `Refreshed: ${getData(fQuest).overallProgress}%`)).catch(()=>{});
        }
    }
};
