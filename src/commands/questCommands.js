import { 
    SlashCommandBuilder, 
    ContainerBuilder, 
    TextDisplayBuilder, 
    SeparatorBuilder, 
    SeparatorSpacingSize, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    MessageFlags 
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

function fmtDate(d) {
    if (!d) return '-';
    try { const date = new Date(d); if (isNaN(date.getTime())) return '-'; return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`; } catch { return '-'; }
}
// NO BANNER TO FIX POOP - Orbie style but safe
function parseTasks(taskObj) {
    const tasks = taskObj || {};
    let list = [];
    for (const [key, val] of Object.entries(tasks)) {
        const target = val.target || 900;
        const k = key.toUpperCase();
        if (k.includes('PLAY_ON_DESKTOP')) list.push({ label: 'Desktop', icon: '⬜', taskText: `Play On Desktop for ${Math.ceil(target/60)}m`, target });
        else if (k.includes('PLAY_ON_XBOX')) list.push({ label: 'Xbox', icon: '🟩', taskText: `Play On Xbox ${target} times`, target });
        else if (k.includes('PLAY_ON_PLAYSTATION')) list.push({ label: 'PlayStation', icon: '🟦', taskText: `Play On Playstation ${target} times`, target });
        else if (k.includes('WATCH') && k.includes('MOBILE')) list.push({ label: 'Mobile', icon: '📱', taskText: `Watch Video On Mobile for ${target<60?`${target}s`:`${Math.ceil(target/60)}m`}`, target });
        else if (k.includes('WATCH')) list.push({ label: 'Web/Desktop', icon: '🎬', taskText: `Watch Video for ${target<60?`${target}s`:`${Math.ceil(target/60)}m`}`, target });
        else list.push({ label: 'Desktop', icon: '⬜', taskText: `Play On Desktop for ${Math.ceil(target/60)}m`, target });
    }
    const seen=new Set(); const unique=[]; for(const p of list){ if(!seen.has(p.taskText)){ seen.add(p.taskText); unique.push(p);} }
    // If only 1 task, Orbie shows 3 tasks (Desktop+Xbox+PlayStation) - replicate
    if(unique.length===1 && unique[0].label==='Desktop'){
        unique.push({label:'Xbox', icon:'🟩', taskText:'Play On Xbox 900 times', target:900});
        unique.push({label:'PlayStation', icon:'🟦', taskText:'Play On Playstation 900 times', target:900});
    }
    return unique.length?unique:[{label:'Desktop', icon:'⬜', taskText:'Play On Desktop for 15m', target:900}];
}
function getData(q){
    const cfg=q.config||q; const msgs=cfg.messages||{}; const app=cfg.application||{}; const us=q.user_status||{}; const rewards=cfg.rewards_config?.rewards||[]; const taskCfg=cfg.task_config??cfg.task_config_v2??{};
    const game=msgs.game_title||msgs.gameTitle||app.name||'Discord Quest'; const questName=msgs.quest_name||msgs.questName||cfg.title||game; const publisher=msgs.game_publisher||msgs.gamePublisher||'Unknown';
    let rewardLines=rewards.length?rewards.map(r=>r.messages?.name||r.name||`${r.orb_quantity} Orbs`):['200 Orbs']; rewardLines=[...new Set(rewardLines)].filter(Boolean);
    const parsed=parseTasks(taskCfg.tasks||{}); let overall=typeof us.progress==='number'?Math.round(us.progress*100):0; if(us.completed_at) overall=100;
    return { game, publisher, questName, rewardLines, taskList:parsed.map(p=>p.taskText), progressList:parsed, overall, enrolled:us.enrolled_at?fmtDate(us.enrolled_at):'-', expires:cfg.expires_at?fmtDate(cfg.expires_at):'-', questId:String(q.id||''), completed:!!us.completed_at, isEnrolled:!!us.enrolled_at };
}
function build(d, all, logText){
    const main=new ContainerBuilder().setAccentColor(d.completed?0x57F287:0x2B2D31);
    let prog=''; const pct=d.overall||0;
    if(d.completed){
        prog=`✅ 100%\n`+d.progressList.map(p=>`${p.icon} ${p.label}: 100%`).join('\n');
    } else {
        if(d.progressList.some(p=>p.label==='Mobile')){
            prog=`🔄 ${pct}%\n🎬 Web/Desktop: ${pct}%\n📱 Mobile: ${pct}%`;
        } else {
            prog=`🔄 ${pct}%\n`+d.progressList.map(p=>`${p.icon} ${p.label}: ${pct}%`).join('\n');
        }
        if(!d.isEnrolled) prog=`🔄 0%\n`+d.progressList.map(p=>`${p.icon} ${p.label}: 0%`).join('\n');
    }
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🌀 Quest Solver\n\n• **Game:** ${d.game}\n• **Publisher:** ${d.publisher}\n• **Quest Name:** ${d.questName}\n• **Enrolled At:** ${d.enrolled}\n• **Expires At:** ${d.expires}\n• **Progress:**\n${prog}\n\n### Rewards:\n`+d.rewardLines.map(r=>`• ${r}`).join('\n')+`\n\n### Tasks:\n`+d.taskList.map(t=>`• ${t}`).join('\n')));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    // NO BANNER = NO POOP - Pehle jaisa clean
    const opts=(all||[]).slice(0,25).map(q=>{
        const rd=getData(q);
        const firstTask=rd.progressList[0]; const tVal=firstTask?.target||900;
        const dStr=tVal<60?`${tVal}s`:`${Math.ceil(tVal/60)}m`;
        return {label:`${rd.game}: ${rd.questName}`.slice(0,100), value:rd.questId, description:`${rd.rewardLines[0].slice(0,20)} | ${dStr} | ${rd.overall}%`.slice(0,100), default:rd.questId===d.questId};
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    // Pehle jaisa Start / Stop / Refresh
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel('Start').setStyle(ButtonStyle.Secondary).setDisabled(d.completed).setEmoji({name:'▶️'}),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    const logs=new ContainerBuilder().setAccentColor(0x2B2D31); logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logText}\n\`\`\``));
    return {components:[main,logs], flags:MessageFlags.IsComponentsV2};
}
function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required`)); return {components:[c], flags:MessageFlags.IsComponentsV2}; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver Pehle Jaisa Fixed'),
    prefix:'quest',
    async execute(i,c){ await i.deferReply(); const t=await c.tokenStore.get(i.user.id); if(!t){ await i.followUp(buildLink()); return; } try{ const {QuestClient}=await import('../quest/questClient.js'); const qc=new QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; if(!v.length){ const cc=new ContainerBuilder().setAccentColor(0x4F545C); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); return; } await i.followUp(build(getData(v[0]), v, `🧭 Quest selected`)); }catch(e){ const cc=new ContainerBuilder().setAccentColor(0xED4245); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,500)}`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); } },
    async prefixExecute(m,a,c){ const t=await c.tokenStore.get(m.author.id); if(!t){ await m.channel.send(buildLink()); return; } try{ const {QuestClient}=await import('../quest/questClient.js'); const qc=new QuestClient(t); const mm=await qc.fetchQuests(); const v=mm.filterQuestsValid?mm.filterQuestsValid():mm.quests||[]; if(!v.length) return; await m.channel.send(build(getData(v[0]), v, '🧭 Quest selected')); }catch{} },
    async handleSelectMenu(i,c){
        if(i.customId!=='quest_select_menu') return; try{ await i.deferUpdate(); }catch{} 
        try{ const t=await c.tokenStore.get(i.user.id); const {QuestClient}=await import('../quest/questClient.js'); const qc=new QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; const sel=v.find(q=>String(q.id)===i.values[0])||v[0]; await i.editReply(build(getData(sel), v, `🧭 Quest selected`)).catch(()=>{}); }catch{}
    },
    async handleButton(i,c){
        if(!i.customId.startsWith('quest_')) return; const w=i.customId.replace('quest_',''); const sep=w.indexOf('_'); if(sep===-1) return; const act=w.slice(0,sep); const qId=w.slice(sep+1);
        try{ await i.deferUpdate(); }catch{}
        const t=await c.tokenStore.get(i.user.id); if(!t) return; const {QuestClient}=await import('../quest/questClient.js'); const qc=new QuestClient(t); const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; let quest=v.find(q=>String(q.id)===qId)||v[0];
        if(act==='start'){
            let rd=getData(quest);
            if(!rd.isEnrolled){ try{ await qc.enrollQuest?.(quest); const fresh=await qc.fetchQuests(); const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[]; quest=fv.find(q=>String(q.id)===qId)||fv[0]; rd=getData(quest); await i.editReply(build(rd, fv, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Solving started...`)).catch(()=>{}); }catch(err){ await i.editReply(build(rd, v, `❌ ${err.message}`)).catch(()=>{}); return; }
            } else { await i.editReply(build(rd, v, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Solving started...`)).catch(()=>{}); }
            setImmediate(async()=>{ try{ await qc.doingQuest(quest, (done,total)=>{ const p=Math.round(done/total*100); const upd={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100, enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}}; const fresh=v.map(x=>String(x.id)===qId?upd:x); const ud=getData(upd); const bar='█'.repeat(Math.floor(p/10))+'░'.repeat(10-Math.floor(p/10)); const log=`🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] Progress -> ${ud.questName} [${p}%] [${bar}]`; i.editReply(build(ud, fresh, log)).catch(()=>{}); }); const doneQ={...quest, config:quest.config, user_status:{progress:1, completed_at:new Date().toISOString(), enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}}; const dd=getData(doneQ); await i.editReply(build(dd, v, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)\n[${new Date().toLocaleTimeString().slice(0,8)}] 🎉 Quest completed successfully! [100%] [${'█'.repeat(10)}]`)).catch(()=>{}); }catch(err){ await i.editReply(build(getData(quest), v, `❌ ${err.message}`)).catch(()=>{}); } });
        }else if(act==='stop'){ await i.editReply(build(getData(quest), v, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] ⏹️ Stopped`)).catch(()=>{}); }
        else if(act==='refresh'){ const fresh=await qc.fetchQuests(); const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[]; const fq=fv.find(q=>String(q.id)===qId)||fv[0]; await i.editReply(build(getData(fq), fv, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)`)).catch(()=>{}); }
    }
};
