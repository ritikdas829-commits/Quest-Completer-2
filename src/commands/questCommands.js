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
    if(!d) return '-';
    try{ const date=new Date(d); if(isNaN(date)) return '-'; return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`; }catch{ return '-'; }
}
function resolveBanner(cfg){
    const app=cfg.application||{};
    const assets=cfg.assets||{};
    const appId=app.id||'';
    if(!appId) return null;
    // Orbie uses hero.png first - this works for March of Giants, Risk of Rain 2, Valorant, all
    if(assets.hero) return `https://cdn.discordapp.com/app-assets/${appId}/store/${assets.hero}.png`;
    if(assets.game_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
    if(assets.quest_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.quest_tile}.png`;
    return null;
}
function getData(q){
    const cfg=q.config||q;
    const msgs=cfg.messages||{};
    const app=cfg.application||{};
    const us=q.user_status||{};
    const rewards=cfg.rewards_config?.rewards||[];
    const tasks=cfg.task_config??cfg.task_config_v2??{};
    const t=tasks.tasks||{};
    const game=msgs.game_title||app.name||'Discord Quest';
    const questName=msgs.quest_name||cfg.title||game;
    const publisher=msgs.game_publisher||'Unknown';
    const banner=resolveBanner(cfg);
    let rewardLines=rewards.length?rewards.map(r=>{
        const name=r.messages?.name||r.name||'';
        if(name) return name;
        if(r.orb_quantity) return `${r.orb_quantity} Orbs`;
        return 'Reward';
    }):['700 Orbs'];
    rewardLines=[...new Set(rewardLines)].filter(Boolean);
    if(rewardLines.length===0) rewardLines=['700 Orbs'];
    // If orb only, add orb emoji like Orbie
    rewardLines=rewardLines.map(r=>{
        if(r.toLowerCase().includes('orb')) return r;
        return r;
    });
    
    let taskList=[], progressList=[];
    Object.entries(t).forEach(([k,v])=>{
        const target=v.target||900;
        if(k==='PLAY_ON_DESKTOP'){ taskList.push(`Play On Desktop for ${Math.ceil(target/60)}m`); progressList.push({label:'Desktop', icon:'⬜', key:k}); }
        else if(k==='PLAY_ON_XBOX'){ taskList.push(`Play On Xbox ${target} times`); progressList.push({label:'Xbox', icon:'🟩', key:k}); }
        else if(k==='PLAY_ON_PLAYSTATION'){ taskList.push(`Play On Playstation ${target} times`); progressList.push({label:'PlayStation', icon:'🟦', key:k}); }
        else if(k.includes('WATCH')){ taskList.push(`Watch Video for ${target<60?`${target}s`:`${Math.ceil(target/60)}m`}`); progressList.push({label:'Desktop', icon:'⬜', key:k}); }
        else { taskList.push(`${k} ${target}`); progressList.push({label:'Desktop', icon:'⬜', key:k}); }
    });
    if(taskList.length===0){ taskList=['Play On Desktop for 15m']; progressList=[{label:'Desktop', icon:'⬜', key:'PLAY_ON_DESKTOP'}]; }
    if(taskList.length===1){ taskList.push('Play On Xbox 900 times'); progressList.push({label:'Xbox', icon:'🟩', key:'PLAY_ON_XBOX'}); taskList.push('Play On Playstation 900 times'); progressList.push({label:'PlayStation', icon:'🟦', key:'PLAY_ON_PLAYSTATION'}); }
    
    let overall=typeof us.progress==='number'?Math.round(us.progress*100):0;
    if(us.completed_at) overall=100;
    const enrolled = us.enrolled_at ? fmtDate(us.enrolled_at) : '-';
    const isEnrolled = !!us.enrolled_at;
    
    return {game, publisher, questName, banner, rewardLines, taskList, progressList, overall, enrolled, expires:cfg.expires_at?fmtDate(cfg.expires_at):'-', questId:String(q.id||''), isEnrolled, isActive:overall<100&&!us.completed_at&&isEnrolled, rawProgress:us.progress||0, completed:!!us.completed_at};
}

function build(d, all, logs){
    const main=new ContainerBuilder().setAccentColor(d.completed?0x57F287:0x2B2D31);
    
    // Progress like Orbie - with icons
    let prog='';
    if(d.completed){
        prog=`✅ 100%\n⬜ Desktop: 100%\n🟩 Xbox: 100%\n🟦 PlayStation: 100%`;
        if(d.progressList.length===1) prog=`✅ 100%\n⬜ Desktop: 100%`;
    } else {
        if(d.overall===0){
            prog=`🔄 0%\n⬜ Desktop: 0%`;
            if(d.progressList.length>1) prog=`🔄 0%\n⬜ Desktop: 0%`;
        } else {
            prog=`🔄 ${d.overall}%\n⬜ Desktop: ${d.overall}%`;
            if(d.progressList.length>1){
                prog=d.progressList.map(p=>{
                    if(p.label==='Desktop') return `⬜ Desktop: ${d.overall}%`;
                    if(p.label==='Xbox') return `🟩 Xbox: ${d.overall}%`;
                    if(p.label==='PlayStation') return `🟦 PlayStation: ${d.overall}%`;
                    return `${p.icon} ${p.label}: ${d.overall}%`;
                }).join('\n');
                prog=`🔄 ${d.overall}%\n`+prog;
            }
        }
        // For single task like March of Giants
        if(d.progressList.length===1 && d.overall===0) prog=`🔄 0%\n⬜ Desktop: 0%`;
        if(d.progressList.length===1 && d.overall>0) prog=`🔄 ${d.overall}%\n⬜ Desktop: ${d.overall}%`;
    }
    if(!d.isEnrolled) prog=`🔄 0%\n⬜ Desktop: 0%`;
    
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🌀 Quest Solver\n\n• **Game:** ${d.game}\n• **Publisher:** ${d.publisher}\n• **Quest Name:** ${d.questName}\n• **Enrolled At:** ${d.enrolled}\n• **Expires At:** ${d.expires}\n• **Progress:**\n${prog}\n\n### Rewards:\n`+d.rewardLines.map(r=>`• ${r}`).join('\n')+`\n\n### Tasks:\n`+d.taskList.map(t=>`• ${t}`).join('\n')
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    if(d.banner){
        try{ main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner))); main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)); }catch{}
    }
    
    const opts=(all||[]).slice(0,25).map(q=>{
        const rd=getData(q);
        const tVal=Object.values(q.config?.task_config?.tasks||{})[0]?.target||900;
        const dStr=tVal<60?`${tVal}s`:`${Math.ceil(tVal/60)}m`;
        const icon = rd.completed ? '✅' : (rd.isEnrolled ? '🟡' : '🔵');
        return {label:`${rd.game}: ${rd.questName}`.slice(0,100), value:rd.questId, description:`${rd.rewardLines[0].slice(0,20)} | ${dStr} | ${rd.overall}%`.slice(0,100), default:rd.questId===d.questId};
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    
    // Buttons like Orbie - Enroll / Start / Stop / Refresh
    const row1 = [];
    if(!d.isEnrolled){
        row1.push(new ButtonBuilder().setCustomId(`quest_enroll_${d.questId}`).setLabel('Enroll').setStyle(ButtonStyle.Primary).setEmoji({name:'⚠️'}));
        row1.push(new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setDisabled(true));
        row1.push(new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'}));
    } else if(d.completed){
        row1.push(new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setDisabled(true));
        row1.push(new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setDisabled(true));
        row1.push(new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'}));
    } else if(d.isActive){
        row1.push(new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setDisabled(true));
        row1.push(new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}));
        row1.push(new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'}));
    } else {
        row1.push(new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Primary).setEmoji({name:'▶️'}));
        row1.push(new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setDisabled(true));
        row1.push(new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'}));
    }
    main.addActionRowComponents(r=>r.addComponents(...row1));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    
    const logsContainer=new ContainerBuilder().setAccentColor(0x2B2D31);
    logsContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logs}\n\`\`\``));
    return {components:[main,logsContainer], flags:MessageFlags.IsComponentsV2};
}

function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required\nUse /link to link your token`)); return {components:[c], flags:MessageFlags.IsComponentsV2}; }

function buildEphemeral(text, type='info'){
    const color = type==='success'?0x57F287:type==='error'?0xED4245:0x5865F2;
    const icon = type==='success'?'✅':type==='error'?'❌':'🔄';
    const c=new ContainerBuilder().setAccentColor(color);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon} ${text}`));
    return {components:[c], flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral};
}

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver - Orbie 1:1'),
    prefix:'quest',
    async execute(interaction, client){
        await interaction.deferReply();
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token){ await interaction.followUp(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||[]);
            if(!valid.length){ const c=new ContainerBuilder().setAccentColor(0x4F545C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`)); await interaction.followUp({components:[c], flags:MessageFlags.IsComponentsV2}); return; }
            const d=getData(valid[0]);
            await interaction.followUp(build(d, valid, `🧭 Quest selected`));
        }catch(e){
            if(e.message?.includes('401')){ client.tokenStore.remove(interaction.user.id); disableAutoquest(interaction.user.id); const c=new ContainerBuilder().setAccentColor(0xED4245); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Expired`)); await interaction.followUp({components:[c], flags:MessageFlags.IsComponentsV2}); }
            else{ const c=new ContainerBuilder().setAccentColor(0xED4245); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,800)}`)); await interaction.followUp({components:[c], flags:MessageFlags.IsComponentsV2}); }
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
            await message.channel.send(build(getData(valid[0]), valid, '🧭 Quest selected'));
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
            const rd=getData(sel);
            await interaction.editReply(build(rd, valid, `🧭 Quest selected`)).catch(()=>{});
        }catch(e){ console.error(e); }
    },
    async handleButton(interaction, client){
        if(!interaction.customId.startsWith('quest_')) return;
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
        
        if(action==='enroll'){
            await interaction.deferReply({ephemeral:true});
            try{
                await qc.enrollQuest?.(quest);
                await interaction.followUp(buildEphemeral('Successfully enrolled in quest!', 'success'));
                const fresh=await qc.fetchQuests();
                const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
                const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
                const rd=getData(fQuest);
                await interaction.editReply(build(rd, fValid, `🧭 Quest selected\n📝 Enrolled`)).catch(()=>{});
                // Update original message
                const original = await interaction.fetchReply().catch(()=>null);
            }catch(err){
                await interaction.followUp(buildEphemeral(`Enroll failed: ${err.message}`, 'error'));
            }
            // Refresh main embed
            try{
                const fresh=await qc.fetchQuests();
                const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
                const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
                // We need to edit the original quest message, not ephemeral
                // Find it via channel
                const messages = await interaction.channel.messages.fetch({limit:10});
                const botMsg = messages.find(m=>m.author.id===client.user.id && m.components.length>0);
                if(botMsg){
                    const rd=getData(fQuest);
                    await botMsg.edit(build(rd, fValid, `🧭 Quest selected\n📝 Enrolled`)).catch(()=>{});
                }
            }catch{}
            return;
        }
        
        await interaction.deferUpdate().catch(()=>{});
        
        if(action==='start'){
            const rd=getData(quest);
            // Check if another quest is active
            const active = valid.find(q=>q.user_status?.enrolled_at && !q.user_status?.completed_at && (q.user_status?.progress||0)<1 && String(q.id)!==qId);
            if(active){
                await interaction.followUp(buildEphemeral('Action Blocked: Finish active quest before switching.', 'error')).catch(()=>{});
                return;
            }
            
            await interaction.editReply(build(rd, valid, `🧭 Quest selected\n▶️ Solving started...`)).catch(()=>{});
            
            // DM like Orbie: Quest started! Check your DMs.
            try{ await interaction.followUp(buildEphemeral('Quest started! Check your DMs.', 'success')); }catch{}
            
            // Try to DM user like Orbie
            let dmChannel=null;
            try{ dmChannel = await interaction.user.createDM(); await dmChannel.send(build(rd, valid, `[${new Date().toLocaleTimeString()}] 🧭 Quest selected\n[${new Date().toLocaleTimeString()}] ▶️ Solving started...\n[${new Date().toLocaleTimeString()}] Fast mode active (fast)`)); }catch{}
            
            setImmediate(async()=>{
                try{
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        const updated={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100, enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}};
                        const fresh=valid.map(x=>String(x.id)===qId?updated:x);
                        const ud=getData(updated);
                        const log=`🧭 Quest selected\n📝 Enrolled\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Progress -> ${ud.questName} [${p}%] [${'█'.repeat(Math.floor(p/10))}${'░'.repeat(10-Math.floor(p/10))}]`;
                        interaction.editReply(build(ud, fresh, log)).catch(()=>{});
                        if(dmChannel){
                            dmChannel.send(`[${new Date().toLocaleTimeString().slice(0,8)}] Progress -> ${ud.questName} [${p}%] [${'█'.repeat(Math.floor(p/10))}${'░'.repeat(10-Math.floor(p/10))}]`).catch(()=>{});
                        }
                    });
                    const doneQ={...quest, config:quest.config, user_status:{progress:1, completed_at:new Date().toISOString(), enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}};
                    const dd=getData(doneQ);
                    const finalLog=`🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] 🎉 Quest completed successfully! [100%] [██████████]`;
                    await interaction.editReply(build(dd, valid, finalLog)).catch(()=>{});
                    if(dmChannel){
                        dmChannel.send(`🎉 Quest completed successfully! [100%] [██████████]`).catch(()=>{});
                    }
                }catch(err){ await interaction.editReply(build(getData(quest), valid, `❌ ${err.message}`)).catch(()=>{}); }
            });
        }else if(action==='stop'){
            await interaction.editReply(build(getData(quest), valid, `🧭 Quest selected\n⏹️ Stopped`)).catch(()=>{});
        }else if(action==='refresh'){
            await interaction.followUp(buildEphemeral('Quest status refreshed!', 'info')).catch(()=>{});
            const fresh=await qc.fetchQuests();
            const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||[]);
            const fQuest=fValid.find(q=>String(q.id)===qId)||fValid[0];
            await interaction.editReply(build(getData(fQuest), fValid, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)`)).catch(()=>{});
        }
    }
};
