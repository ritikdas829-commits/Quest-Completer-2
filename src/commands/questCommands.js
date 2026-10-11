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

function fmtDate(d) {
    if (!d) return '-';
    try { const date = new Date(d); if (isNaN(date.getTime())) return '-'; return `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear()}`; } catch { return '-'; }
}

// CLEAN BANNER - NO POOP - Only valid URL
function resolveBanner(cfg) {
    const app = cfg.application || {};
    const assets = cfg.assets || {};
    const appId = app.id || '';
    const messages = cfg.messages || {};
    // Direct clean URLs
    if(messages.thumbUrl && typeof messages.thumbUrl==='string' && messages.thumbUrl.startsWith('http')) return messages.thumbUrl;
    if(cfg.thumbUrl && typeof cfg.thumbUrl==='string' && cfg.thumbUrl.startsWith('http')) return cfg.thumbUrl;
    if (!appId) return null;
    const tasks = cfg.task_config?.tasks || cfg.task_config_v2?.tasks || {};
    const isVideo = Object.keys(tasks).some(k=>k.toUpperCase().includes('WATCH'));
    const getUrl = (hash, folder) => {
        if(!hash || typeof hash!=='string') return null;
        if(hash.startsWith('http')) return hash;
        if(hash.length < 10) return null;
        return `https://cdn.discordapp.com/app-assets/${appId}/${folder}/${hash}.png?size=1024`;
    };
    if(isVideo) return getUrl(assets.game_tile, 'quest-assets') || getUrl(assets.quest_tile, 'quest-assets') || getUrl(assets.hero, 'store');
    else return getUrl(assets.hero, 'store') || getUrl(assets.game_tile, 'quest-assets') || getUrl(assets.quest_tile, 'quest-assets');
}

function parseTasks(taskObj) {
    const tasks = taskObj || {};
    let list = [];
    for (const [key, val] of Object.entries(tasks)) {
        const target = val.target ?? 0;
        const k = key.toUpperCase();
        if (k.includes('PLAY_ON_DESKTOP')) list.push({ label: 'Desktop', icon: '⬜', text: `Play On Desktop for ${target===0?'0m':`${Math.ceil(target/60)}m`}`, target });
        else if (k.includes('PLAY_ON_XBOX')) list.push({ label: 'Xbox', icon: '🟩', text: `Play On Xbox ${target} times`, target });
        else if (k.includes('PLAY_ON_PLAYSTATION')) list.push({ label: 'PlayStation', icon: '🟦', text: `Play On Playstation ${target} times`, target });
        else if (k.includes('WATCH') && k.includes('MOBILE')) list.push({ label: 'Mobile', icon: '📱', text: `Watch Video On Mobile for ${target===0?'0m':`${target}s`}`, target });
        else if (k.includes('WATCH')) list.push({ label: 'Web/Desktop', icon: '🎬', text: `Watch Video for ${target===0?'0m':`${target}s`}`, target });
        else list.push({ label: 'Desktop', icon: '⬜', text: `Play On Desktop for ${target===0?'0m':`${Math.ceil(target/60)}m`}`, target });
    }
    const seen=new Set(); const uniq=[]; for(const p of list){ if(!seen.has(p.text)){ seen.add(p.text); uniq.push(p);} }
    if(uniq.length===1 && uniq[0].label==='Desktop'){ uniq.push({label:'Xbox', icon:'🟩', text:'Play On Xbox 900 times', target:900}); uniq.push({label:'PlayStation', icon:'🟦', text:'Play On Playstation 900 times', target:900}); }
    return uniq.length?uniq:[{label:'Desktop', icon:'⬜', text:'Play On Desktop for 15m', target:900}];
}

// REAL DATA PER QUEST - Enrolled At & Expires At har quest ka alag
function getData(q){
    const cfg=q.config||q; const msgs=cfg.messages||{}; const app=cfg.application||{}; const us=q.user_status||{}; const rewards=cfg.rewards_config?.rewards||[]; const taskCfg=cfg.task_config??cfg.task_config_v2??{};
    const game=msgs.game_title||app.name||'Discord Quest'; const questName=msgs.quest_name||cfg.title||game; const publisher=msgs.game_publisher||'Unknown';
    let rewardLines=rewards.length?rewards.map(r=>r.messages?.name||r.name||`${r.orb_quantity} Orbs`):['200 Orbs']; rewardLines=[...new Set(rewardLines)].filter(Boolean);
    const parsed=parseTasks(taskCfg.tasks||{});
    // Real progress per quest
    let overall=typeof us.progress==='number'?Math.round(us.progress*100):0;
    if(us.completed_at) overall=100;
    // Real enrolled & expires per quest - NOT FIXED
    const enrolled = us.enrolled_at ? fmtDate(us.enrolled_at) : '-';
    const expires = cfg.expires_at ? fmtDate(cfg.expires_at) : '-';
    return { game, publisher, questName, banner:resolveBanner(cfg), rewardLines, taskList:parsed.map(p=>p.text), progressList:parsed, overall, enrolled, expires, questId:String(q.id||''), completed:!!us.completed_at, isEnrolled:!!us.enrolled_at, rawEnrolled:us.enrolled_at, rawExpires:cfg.expires_at };
}

function build(d, all, logText){
    const main=new ContainerBuilder().setAccentColor(d.completed?0x57F287:0x2B2D31);
    const pct=d.overall||0;
    let prog='';
    // % ME PROGRESS - Real per quest
    if(d.completed){
        prog=`✅ 100%\n`+d.progressList.map(p=>`${p.icon} ${p.label}: 100%`).join('\n');
    } else {
        if(d.progressList.some(p=>p.label==='Mobile')){
            prog=`🔄 ${pct}%\n🎬 Web/Desktop: ${pct}%\n📱 Mobile: ${pct}%`;
        } else {
            prog=`🔄 ${pct}%\n⬜ Desktop: ${pct}%\n🟩 Xbox: ${pct}%\n🟦 PlayStation: ${pct}%`;
        }
        // If not enrolled, show 0% for that quest
        if(!d.isEnrolled){
            if(d.progressList.some(p=>p.label==='Mobile')) prog=`🔄 0%\n🎬 Web/Desktop: 0%\n📱 Mobile: 0%`;
            else prog=`🔄 0%\n⬜ Desktop: 0%\n🟩 Xbox: 0%\n🟦 PlayStation: 0%`;
        }
    }
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🌀 Quest Solver\n\n`+
        `• **Game:** ${d.game}\n`+
        `• **Publisher:** ${d.publisher}\n`+
        `• **Quest Name:** ${d.questName}\n`+
        `• **Enrolled At:** ${d.enrolled}\n`+
        `• **Expires At:** ${d.expires}\n`+
        `• **Progress:**\n${prog}\n\n`+
        `### Rewards:\n`+d.rewardLines.map(r=>`• ${r}`).join('\n')+`\n\n`+
        `### Tasks:\n`+d.taskList.map(t=>`• ${t}`).join('\n')
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    if(d.banner){
        try{
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.banner)));
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
        }catch{}
    }
    // Dropdown - har quest select pe usi ka data change hoga
    const opts=(all||[]).slice(0,25).map(q=>{
        const rd=getData(q);
        const ft=rd.progressList[0];
        const tv=ft?.target??0;
        const ds=tv===0?'0m':tv<60?`${tv}s`:`${Math.ceil(tv/60)}m`;
        return {label:`${rd.game}: ${rd.questName}`.slice(0,100), value:rd.questId, description:`Enrolled: ${rd.enrolled} | ${ds} | ${rd.overall}%`.slice(0,100), default:rd.questId===d.questId};
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(`${d.game}: ${d.questName}`.slice(0,100)).addOptions(opts)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel(d.completed?'Completed':'Start').setStyle(ButtonStyle.Secondary).setDisabled(d.completed).setEmoji({name:d.completed?'✅':'▶️'}), new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}), new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link)));
    // LOGS ONLY PROGRESS - as you wanted
    const logs=new ContainerBuilder().setAccentColor(0x2B2D31); logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs\n\`\`\`\n${logText}\n\`\`\``));
    return {components:[main,logs], flags:MessageFlags.IsComponentsV2};
}
function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFEE75C); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔗 Token Required`)); return {components:[c], flags:MessageFlags.IsComponentsV2}; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('V8 Real Tracking Per Quest'),
    prefix:'quest',
    async execute(i,c){
        await i.deferReply();
        const t=await c.tokenStore.get(i.user.id);
        if(!t){ await i.followUp(buildLink()); return; }
        try{
            const {QuestClient}=await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const m=await qc.fetchQuests();
            const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[];
            if(!v.length){ const cc=new ContainerBuilder().setAccentColor(0x4F545C); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔍 No Quests`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2}); return; }
            const rd=getData(v[0]);
            const bar='█'.repeat(Math.floor(rd.overall/10))+'░'.repeat(10-Math.floor(rd.overall/10));
            await i.followUp(build(rd, v, `Progress -> ${rd.questName} [${rd.overall}%] [${bar}]`));
        }catch(e){
            const cc=new ContainerBuilder().setAccentColor(0xED4245); cc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ ${e.message.slice(0,500)}`)); await i.followUp({components:[cc], flags:MessageFlags.IsComponentsV2});
        }
    },
    async prefixExecute(m,a,c){
        const t=await c.tokenStore.get(m.author.id);
        if(!t){ await m.channel.send(buildLink()); return; }
        try{
            const {QuestClient}=await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const mm=await qc.fetchQuests();
            const v=mm.filterQuestsValid?mm.filterQuestsValid():mm.quests||[];
            if(!v.length) return;
            const rd=getData(v[0]);
            const bar='█'.repeat(Math.floor(rd.overall/10))+'░'.repeat(10-Math.floor(rd.overall/10));
            await m.channel.send(build(rd, v, `Progress -> ${rd.questName} [${rd.overall}%] [${bar}]`));
        }catch{}
    },
    async handleSelectMenu(i,c){
        if(i.customId!=='quest_select_menu') return;
        try{ await i.deferUpdate(); }catch{}
        try{
            const t=await c.tokenStore.get(i.user.id);
            const {QuestClient}=await import('../quest/questClient.js');
            const qc=new QuestClient(t);
            const m=await qc.fetchQuests();
            const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[];
            const sel=v.find(q=>String(q.id)===i.values[0])||v[0];
            const rd=getData(sel);
            // REAL TRACKING - Har quest select pe usi quest ka Enrolled/Expires/Progress change hoga
            const bar='█'.repeat(Math.floor(rd.overall/10))+'░'.repeat(10-Math.floor(rd.overall/10));
            await i.editReply(build(rd, v, `Progress -> ${rd.questName} [${rd.overall}%] [${bar}]`)).catch(()=>{});
        }catch{}
    },
    async handleButton(i,c){
        if(!i.customId.startsWith('quest_')) return;
        const w=i.customId.replace('quest_',''); const sep=w.indexOf('_'); if(sep===-1) return; const act=w.slice(0,sep); const qId=w.slice(sep+1);
        try{ await i.deferUpdate(); }catch{}
        const t=await c.tokenStore.get(i.user.id); if(!t) return;
        const {QuestClient}=await import('../quest/questClient.js');
        const qc=new QuestClient(t);
        const m=await qc.fetchQuests(); const v=m.filterQuestsValid?m.filterQuestsValid():m.quests||[]; let quest=v.find(q=>String(q.id)===qId)||v[0];
        if(act==='start'){
            let rd=getData(quest);
            const bar0='░'.repeat(10);
            await i.editReply(build(rd, v, `Progress -> ${rd.questName} [${rd.overall}%] [${bar0}]`)).catch(()=>{});
            setImmediate(async()=>{
                try{
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        const upd={...quest, config:quest.config, user_status:{...quest.user_status, progress:p/100, enrolled_at:quest.user_status?.enrolled_at||new Date().toISOString()}};
                        const fresh=v.map(x=>String(x.id)===qId?upd:x);
                        const ud=getData(upd);
                        const bar='█'.repeat(Math.floor(p/10))+'░'.repeat(10-Math.floor(p/10));
                        // ONLY PROGRESS - as you wanted
                        const log=`Progress -> ${ud.questName} [${p}%] [${bar}]`;
                        i.editReply(build(ud, fresh, log)).catch(()=>{});
                    });
                    const freshAfter=await qc.fetchQuests(); const fv=freshAfter.filterQuestsValid?freshAfter.filterQuestsValid():freshAfter.quests||[]; const fq=fv.find(q=>String(q.id)===qId)||fv[0]; const dd=getData(fq);
                    const bar100='█'.repeat(10);
                    await i.editReply(build(dd, fv, `Progress -> ${dd.questName} [${dd.overall}%] [${bar100}]`)).catch(()=>{});
                }catch(err){
                    const rdErr=getData(quest);
                    await i.editReply(build(rdErr, v, `Progress -> ${rdErr.questName} [Error] [${err.message.slice(0,30)}]`)).catch(()=>{});
                }
            });
        }else if(act==='stop'){
            const rd=getData(quest);
            await i.editReply(build(rd, v, `Progress -> ${rd.questName} [${rd.overall}%] [Stopped]`)).catch(()=>{});
        }else if(act==='refresh'){
            const fresh=await qc.fetchQuests(); const fv=fresh.filterQuestsValid?fresh.filterQuestsValid():fresh.quests||[]; const fq=fv.find(q=>String(q.id)===qId)||fv[0]; const rd=getData(fq);
            const bar='█'.repeat(Math.floor(rd.overall/10))+'░'.repeat(10-Math.floor(rd.overall/10));
            // Refresh pe bhi real Enrolled/Expires update hoga
            await i.editReply(build(rd, fv, `Progress -> ${rd.questName} [${rd.overall}%] [${bar}]`)).catch(()=>{});
        }
    }
};
