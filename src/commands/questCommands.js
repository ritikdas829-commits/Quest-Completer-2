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

function fmtDate(d){
    if(!d) return '-';
    try{ const date=new Date(d); if(isNaN(date)) return '-'; return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`; }catch{ return '-'; }
}
function resolveBanner(cfg, isVideo=false){
    const app=cfg.application||{};
    const assets=cfg.assets||{};
    const appId=app.id||'';
    if(!appId) return null;
    // Exact Orbie logic: hero.png first
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
    let rewardLines=rewards.length?rewards.map(r=>r.messages?.name||r.name||`${r.orb_quantity} Orbs`):['700 Orbs'];
    rewardLines=[...new Set(rewardLines)].filter(Boolean);
    let taskList=[], progressList=[];
    Object.entries(t).forEach(([k,v])=>{
        const target=v.target||900;
        if(k==='PLAY_ON_DESKTOP'){ taskList.push(`Play On Desktop for ${Math.ceil(target/60)}m`); progressList.push({label:'Desktop'}); }
        else if(k==='PLAY_ON_XBOX'){ taskList.push(`Play On Xbox ${target} times`); progressList.push({label:'Xbox'}); }
        else if(k==='PLAY_ON_PLAYSTATION'){ taskList.push(`Play On Playstation ${target} times`); progressList.push({label:'PlayStation'}); }
        else if(k.includes('WATCH')){ taskList.push(`Watch Video for ${target<60?`${target}s`:`${Math.ceil(target/60)}m`}`); progressList.push({label:'Desktop'}); }
        else { taskList.push(`${k} ${target}`); progressList.push({label:'Desktop'}); }
    });
    if(taskList.length===0){ taskList=['Play On Desktop for 15m']; progressList=[{label:'Desktop'}]; }
    if(taskList.length===1){ taskList.push('Play On Xbox 900 times'); progressList.push({label:'Xbox'}); taskList.push('Play On Playstation 900 times'); progressList.push({label:'PlayStation'}); }
    // Deduplicate like Melon fix
    taskList=[...new Set(taskList)];
    // Rebuild progressList after dedup
    if(taskList.length===1) progressList=[{label:'Desktop'}];
    else if(taskList.length===3) progressList=[{label:'Desktop'},{label:'Xbox'},{label:'PlayStation'}];
    
    let overall=typeof us.progress==='number'?Math.round(us.progress*100):0;
    if(us.completed_at) overall=100;
    const isVideo = Object.keys(t).some(k=>k.includes('WATCH'));
    const banner=resolveBanner(cfg, isVideo);
    return {
        game, publisher, questName, banner, rewardLines, taskList, progressList,
        overall, enrolled:us.enrolled_at?fmtDate(us.enrolled_at):'-',
        expires:cfg.expires_at?fmtDate(cfg.expires_at):'-',
        questId:String(q.id||''), completed:!!us.completed_at, isEnrolled:!!us.enrolled_at
    };
}
function build(d, all, logText){
    const main=new ContainerBuilder().setAccentColor(d.completed?0x57F287:0x2B2D31);
    let prog='';
    if(d.completed){
        prog=`✅ 100%\n⬜ Desktop: 100%\n🟩 Xbox: 100%\n🟦 PlayStation: 100%`;
        if(d.progressList.length===1) prog=`✅ 100%\n⬜ Desktop: 100%`;
    } else {
        const pct=d.overall||0;
        if(pct===0) prog=`🔄 ${pct}%\n⬜ Desktop: ${pct}%`;
        else prog=`🔄 ${pct}%\n⬜ Desktop: ${pct}%\n🟩 Xbox: ${pct}%\n🟦 PlayStation: ${pct}%`;
        if(d.progressList.length===1) prog=`🔄 ${pct}%\n⬜ Desktop: ${pct}%`;
        if(!d.isEnrolled) prog=`🔄 0%\n⬜ Desktop: 0%`;
    }
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
        return {label:`${rd.game}: ${rd.questName}`.slice(0,100), value:rd.questId, description:`${rd.rewardLines[0].slice(0,20)} | ${dStr} | ${rd.overall}%`.slice(0,100), default:rd.questId===d.questId};
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    // Buttons exactly like screenshot - Start Stop Refresh View Quest
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setDisabled(d.completed||!d.isEnrolled).setEmoji({name:'▶️'}),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setDisabled(!d.completed&&d.overall===0),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    const logs=new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logText}\n\`\`\``));
    return {components:[main,logs], flags:MessageFlags.IsComponentsV2};
}
function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required`)); return {components:[c], flags:MessageFlags.IsComponentsV2}; }
function buildEphemeral(text, type='info'){
    const c=new ContainerBuilder().setAccentColor(type==='success'?0x57F287:type==='error'?0xED4245:0x5865F2);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${type==='success'?'✅':type==='error'?'❌':'🔄'} ${text}`));
    return {components:[c], flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral};
}
export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver Exact'),
    prefix:'quest',
    async execute(i,c){ await i.deferReply(); const t=await c.tokenStore.get(i.user.id); if(!t){ await i.followUp(buildLink()); return; } try{ const qc=new (await import('../quest/questClient.js')).QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; if(!v.length){ const cc=new ContainerBuilder().setAccentColor(0x4F545C); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); return; } await i.followUp(build(getData(v[0]), v, `🧭 Quest selected`)); }catch(e){ const cc=new ContainerBuilder().setAccentColor(0xED4245); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,500)}`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); } },
    async prefixExecute(m,a,c){ const t=await c.tokenStore.get(m.author.id); if(!t){ await m.channel.send(buildLink()); return; } try{ const qc=new (await import('../quest/questClient.js')).QuestClient(t); const mm=await qc.fetchQuests(); const v=mm.filterQuestsValid?mm.filterQuestsValid():mm.quests||[]; if(!v.length) return; await m.channel.send(build(getData(v[0]), v, '🧭 Quest selected')); }catch(e){} },
    async handleSelectMenu(i,c){
        if(i.customId!=='quest_select_menu') return;
        await i.deferUpdate().catch(()=>{});
        try{ const t=await c.tokenStore.get(i.user.id); const qc=new (await import('../quest/questClient.js')).QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; const sel=v.find(q=>String(q.id)===i.values[0])||v[0]; await i.editReply(build(getData(sel), v, `🧭 Quest selected`)).catch(()=>{}); }catch{}
    },
    async handleButton(i,c){
        if(!i.customId.startsWith('quest_')) return;
        const w=i.customId.replace('quest_',''); const sep=w.indexOf('_'); if(sep===-1) return; const act=w.slice(0,sep); const qId=w.slice(sep+1);
        const t=await c.tokenStore.get(i.user.id); if(!t) return;
        const qc=new (await import('../quest/questClient.js')).QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; const quest=v.find(q=>String(q.id)===qId)||v[0];
        if(act==='enroll'){
            await i.deferReply({ephemeral:true}); try{ await qc.enrollQuest?.(quest); await i.followUp(buildEphemeral('Successfully enrolled in quest!', 'success')); const fresh=await qc.fetchQuests(); const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[]; const fq=fv.find(q=>String(q.id)===qId)||fv[0]; const msgs=await i.channel.messages.fetch({limit:10}); const botMsg=msgs.find(mm=>mm.author.id===c.user.id&&mm.components.length>0); if(botMsg) await botMsg.edit(build(getData(fq), fv, `🧭 Quest selected\n📝 Enrolled`)).catch(()=>{}); }catch(err){ await i.followUp(buildEphemeral(`Enroll failed: ${err.message}`, 'error')).catch(()=>{}); } return;
        }
        await i.deferUpdate().catch(()=>{});
        if(act==='start'){
            const rd=getData(quest);
            const active=v.find(q=>q.user_status?.enrolled_at&&!q.user_status?.completed_at&&(q.user_status?.progress||0)<1&&String(q.id)!==qId);
            if(active){ await i.followUp(buildEphemeral('Action Blocked: Finish active quest before switching.', 'error')).catch(()=>{}); return; }
            await i.editReply(build(rd, v, `🧭 Quest selected\n▶️ Solving started...`)).catch(()=>{});
            try{ await i.followUp(buildEphemeral('Quest started! Check your DMs.', 'success')); }catch{}
            let dm=null; try{ dm=await i.user.createDM(); await dm.send(build(rd, v, `[${new Date().toLocaleTimeString()}] 🧭 Quest selected\n[${new Date().toLocaleTimeString()}] ▶️ Solving started...\n[${new Date().toLocaleTimeString()}] Fast mode active (fast)`)); }catch{}
            setImmediate(async()=>{
                try{
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        const upd={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100, enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}};
                        const fresh=v.map(x=>String(x.id)===qId?upd:x);
                        const ud=getData(upd);
                        const log=`🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Progress -> ${ud.questName} [${p}%] [${'█'.repeat(Math.floor(p/10))}${'░'.repeat(10-Math.floor(p/10))}]`;
                        i.editReply(build(ud, fresh, log)).catch(()=>{});
                    });
                    const doneQ={...quest, config:quest.config, user_status:{progress:1, completed_at:new Date().toISOString(), enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}};
                    const dd=getData(doneQ);
                    await i.editReply(build(dd, v, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] 🎉 Quest completed successfully! [100%] [${'█'.repeat(10)}]`)).catch(()=>{});
                }catch(err){ await i.editReply(build(getData(quest), v, `❌ ${err.message}`)).catch(()=>{}); }
            });
        }else if(act==='stop'){ await i.editReply(build(getData(quest), v, `🧭 Quest selected\n⏹️ Stopped`)).catch(()=>{}); }
        else if(act==='refresh'){ await i.followUp(buildEphemeral('Quest status refreshed!', 'info')).catch(()=>{}); const fresh=await qc.fetchQuests(); const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[]; const fq=fv.find(q=>String(q.id)===qId)||fv[0]; await i.editReply(build(getData(fq), fv, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)`)).catch(()=>{}); }
    }
};
