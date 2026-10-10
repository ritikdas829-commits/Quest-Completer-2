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
// COOL THUMBNAIL URL - Exact Orbie logic with fallback to avoid poop
function resolveBanner(cfg){
    const app=cfg.application||{};
    const assets=cfg.assets||{};
    const appId=app.id||'';
    if(!appId) return null;
    // For VIDEO quests like Melon, game_tile is cooler with Google Play badges
    const isVideo = Object.keys(cfg.task_config?.tasks||{}).some(k=>k.toUpperCase().includes('WATCH'));
    if(isVideo){
        if(assets.hero) return `https://cdn.discordapp.com/app-assets/${appId}/store/${assets.hero}.png`;
        if(assets.game_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
        if(assets.quest_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.quest_tile}.png`;
    } else {
        // PLAY quests like ROR2 - hero is the cool dark banner
        if(assets.hero) return `https://cdn.discordapp.com/app-assets/${appId}/store/${assets.hero}.png`;
        if(assets.game_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.game_tile}.png`;
        if(assets.quest_tile) return `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${assets.quest_tile}.png`;
    }
    return null;
}
function parseTasks(taskObj){
    const tasks = taskObj || {};
    let list=[];
    for(const [key, val] of Object.entries(tasks)){
        const target = val.target || 0;
        const k = key.toUpperCase();
        if(k.includes('PLAY_ON_DESKTOP')){
            list.push({label:'Desktop', icon:'⬜', taskText:`Play On Desktop for ${Math.ceil(target/60)}m`, key});
        } else if(k.includes('PLAY_ON_XBOX')){
            list.push({label:'Xbox', icon:'🟩', taskText:`Play On Xbox ${target} times`, key});
        } else if(k.includes('PLAY_ON_PLAYSTATION')){
            list.push({label:'PlayStation', icon:'🟦', taskText:`Play On Playstation ${target} times`, key});
        } else if(k.includes('WATCH') && k.includes('MOBILE')){
            list.push({label:'Mobile', icon:'📱', taskText:`Watch Video On Mobile for ${target===0?'0m':`${target}s`}`, key});
        } else if(k.includes('WATCH')){
            list.push({label:'Web/Desktop', icon:'🎬', taskText:`Watch Video for ${target===0?'0m':`${target}s`}`, key});
        } else {
            list.push({label:'Desktop', icon:'⬜', taskText:`${key} for ${target}`, key});
        }
    }
    // Deduplicate
    const seen=new Set(); const unique=[];
    for(const p of list){ if(!seen.has(p.taskText)){ seen.add(p.taskText); unique.push(p); } }
    return unique.length?unique:[{label:'Desktop', icon:'⬜', taskText:'Play On Desktop for 15m'}];
}
function getData(q){
    const cfg=q.config||q;
    const msgs=cfg.messages||{};
    const app=cfg.application||{};
    const us=q.user_status||{};
    const rewards=cfg.rewards_config?.rewards||[];
    const taskCfg=cfg.task_config??cfg.task_config_v2??{};
    const tasks=taskCfg.tasks||{};
    const game=msgs.game_title||app.name||'Discord Quest';
    const questName=msgs.quest_name||cfg.title||game;
    const publisher=msgs.game_publisher||'Unknown';
    let rewardLines=rewards.length?rewards.map(r=>r.messages?.name||r.name||`${r.orb_quantity||0} Orbs`):['200 Orbs'];
    rewardLines=[...new Set(rewardLines)].filter(Boolean);
    const parsed = parseTasks(tasks);
    let overall=typeof us.progress==='number'?Math.round(us.progress*100):0;
    if(us.completed_at) overall=100;
    return {
        game, publisher, questName, banner:resolveBanner(cfg), rewardLines,
        taskList: parsed.map(p=>p.taskText),
        progressList: parsed,
        overall,
        enrolled: us.enrolled_at?fmtDate(us.enrolled_at):'-',
        expires: cfg.expires_at?fmtDate(cfg.expires_at):'-',
        questId:String(q.id||''),
        completed:!!us.completed_at,
        isEnrolled:!!us.enrolled_at,
        raw:q
    };
}
function build(d, all, logText){
    const main=new ContainerBuilder().setAccentColor(d.completed?0x57F287:0x2B2D31);
    let prog='';
    const pct=d.overall||0;
    if(d.completed){
        if(d.progressList.some(p=>p.label==='Mobile')){
            prog=`✅ 100%\n🎬 Web/Desktop: 100%\n📱 Mobile: 100%`;
        } else if(d.progressList.length===1){
            prog=`✅ 100%\n⬜ Desktop: 100%`;
        } else {
            prog=`✅ 100%\n`+d.progressList.map(p=>{
                if(p.label==='Desktop') return `⬜ Desktop: 100%`;
                if(p.label==='Xbox') return `🟩 Xbox: 100%`;
                if(p.label==='PlayStation') return `🟦 PlayStation: 100%`;
                if(p.label==='Web/Desktop') return `🎬 Web/Desktop: 100%`;
                if(p.label==='Mobile') return `📱 Mobile: 100%`;
                return `${p.label}: 100%`;
            }).join('\n');
        }
    } else {
        if(d.progressList.some(p=>p.label==='Mobile')){
            prog=`🔄 ${pct}%\n🎬 Web/Desktop: ${pct}%\n📱 Mobile: ${pct}%`;
        } else if(d.progressList.length===1){
            prog=`🔄 ${pct}%\n⬜ Desktop: ${pct}%`;
        } else {
            prog=`🔄 ${pct}%\n`+d.progressList.map(p=>{
                if(p.label==='Desktop') return `⬜ Desktop: ${pct}%`;
                if(p.label==='Xbox') return `🟩 Xbox: ${pct}%`;
                if(p.label==='PlayStation') return `🟦 PlayStation: ${pct}%`;
                if(p.label==='Web/Desktop') return `🎬 Web/Desktop: ${pct}%`;
                if(p.label==='Mobile') return `📱 Mobile: ${pct}%`;
                return `${p.label}: ${pct}%`;
            }).join('\n');
        }
        if(!d.isEnrolled) prog=`🔄 0%\n`+(d.progressList.some(p=>p.label==='Mobile')?`🎬 Web/Desktop: 0%\n📱 Mobile: 0%`:`⬜ Desktop: 0%`);
    }
    // If banner fails, Discord shows poop - we hide if needed by try catch, but we keep banner as Orbie does
    // To guarantee cool thumbnail like Orbie, we ALWAYS include banner - Orbie never hides
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🌀 Quest Solver\n\n• **Game:** ${d.game}\n• **Publisher:** ${d.publisher}\n• **Quest Name:** ${d.questName}\n• **Enrolled At:** ${d.enrolled}\n• **Expires At:** ${d.expires}\n• **Progress:**\n${prog}\n\n### Rewards:\n`+d.rewardLines.map(r=>`• ${r}`).join('\n')+`\n\n### Tasks:\n`+d.taskList.map(t=>`• ${t}`).join('\n')
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    if(d.banner){
        try{
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        }catch{}
    }
    const opts=(all||[]).slice(0,25).map(q=>{
        const rd=getData(q);
        const tVal=Object.values(q.config?.task_config?.tasks||{})[0]?.target||0;
        const dStr=tVal===0?'0m':(tVal<60?`${tVal}s`:`${Math.ceil(tVal/60)}m`);
        return {label:`${rd.game}: ${rd.questName}`.slice(0,100), value:rd.questId, description:`${rd.rewardLines[0].slice(0,20)} | ${dStr} | ${rd.overall}%`.slice(0,100), default:rd.questId===d.questId};
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    // Buttons like Orbie - Start primary when not started
    const isActive = d.isEnrolled && !d.completed;
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel(d.isEnrolled?'Start':'Enroll & Start').setStyle(d.completed?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(d.completed),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary),
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
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver Cool Thumbnail No DM'),
    prefix:'quest',
    async execute(i,c){
        await i.deferReply();
        const t=await c.tokenStore.get(i.user.id);
        if(!t){ await i.followUp(buildLink()); return; }
        try{
            const { QuestClient } = await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const m=await qc.fetchQuests();
            const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[];
            if(!v.length){
                const cc=new ContainerBuilder().setAccentColor(0x4F545C);
                cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`));
                await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); return;
            }
            await i.followUp(build(getData(v[0]), v, `🧭 Quest selected`));
        }catch(e){
            const cc=new ContainerBuilder().setAccentColor(0xED4245);
            cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,500)}`));
            await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2});
        }
    },
    async prefixExecute(m,a,c){
        const t=await c.tokenStore.get(m.author.id);
        if(!t){ await m.channel.send(buildLink()); return; }
        try{
            const { QuestClient } = await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const mm=await qc.fetchQuests();
            const v=mm.filterQuestsValid?mm.filterQuestsValid():mm.quests||[];
            if(!v.length) return;
            await m.channel.send(build(getData(v[0]), v, '🧭 Quest selected'));
        }catch{}
    },
    async handleSelectMenu(i,c){
        if(i.customId!=='quest_select_menu') return;
        await i.deferUpdate().catch(()=>{});
        try{
            const t=await c.tokenStore.get(i.user.id);
            const { QuestClient } = await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const m=await qc.fetchQuests();
            const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[];
            const sel=v.find(q=>String(q.id)===i.values[0])||v[0];
            await i.editReply(build(getData(sel), v, `🧭 Quest selected`)).catch(()=>{});
        }catch{}
    },
    async handleButton(i,c){
        if(!i.customId.startsWith('quest_')) return;
        const w=i.customId.replace('quest_','');
        const sep=w.indexOf('_');
        if(sep===-1) return;
        const act=w.slice(0,sep);
        const qId=w.slice(sep+1);
        const t=await c.tokenStore.get(i.user.id);
        if(!t) return;
        const { QuestClient } = await import('../quest/questClient.js');
        const qc=new QuestClient(t);
        const m=await qc.fetchQuests();
        const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[];
        let quest=v.find(q=>String(q.id)===qId)||v[0];
        await i.deferUpdate().catch(()=>{});
        if(act==='start'){
            // FIX START FAIL - Auto enroll if not enrolled
            let rd=getData(quest);
            if(!rd.isEnrolled){
                try{
                    await qc.enrollQuest?.(quest);
                    const freshEnroll=await qc.fetchQuests();
                    const fv=freshEnroll.filterQuestsValid?freshEnroll.filterQuestsValid():freshEnroll.quests||[];
                    quest=fv.find(q=>String(q.id)===qId)||fv[0];
                    rd=getData(quest);
                    await i.editReply(build(rd, fv, `🧭 Quest selected\n📝 Enrolled At: ${rd.enrolled}\n▶️ Solving started...`)).catch(()=>{});
                }catch(err){
                    await i.followUp(buildEphemeral(`Enroll failed: ${err.message}`, 'error')).catch(()=>{});
                    return;
                }
            } else {
                await i.editReply(build(rd, v, `🧭 Quest selected\n▶️ Solving started...`)).catch(()=>{});
            }
            // NO DM - Direct progress in same channel
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
                }catch(err){
                    await i.editReply(build(getData(quest), v, `❌ ${err.message}\n🧭 Quest selected\n💡 Try /link again or check token`)).catch(()=>{});
                }
            });
        }else if(act==='stop'){
            await i.editReply(build(getData(quest), v, `🧭 Quest selected\n⏹️ Stopped`)).catch(()=>{});
        }else if(act==='refresh'){
            await i.followUp(buildEphemeral('Quest status refreshed!', 'info')).catch(()=>{});
            const fresh=await qc.fetchQuests();
            const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[];
            const fq=fv.find(q=>String(q.id)===qId)||fv[0];
            await i.editReply(build(getData(fq), fv, `🧭 Quest selected\n[${new Date().toLocaleTimeString().slice(0,8)}] Fast mode active (fast)`)).catch(()=>{});
        }
    }
};
