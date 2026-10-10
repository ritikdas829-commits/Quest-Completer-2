
import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';

const activeQuestRunners = new Map();
const rewardTracker = new Map();

function fmtDate(s) { try { const d=new Date(s); return isNaN(d.getTime())?'Unknown':d.toLocaleDateString('en-US'); } catch { return 'Unknown'; } }

function getReal(q) {
    const cfg = q.config || q;
    const app = cfg.application || q.application || {};
    const us = q.user_status || {};
    
    let game = cfg.messages?.gameTitle || cfg.messages?.game_title || app.name || 'Discord';
    let questName = cfg.messages?.questName || cfg.messages?.quest_name || cfg.title || game;
    if (!questName) questName = game;

    const qId = q.id || cfg.id || '';
    const appId = app.id || cfg.application?.id || '';
    const iconHash = app.icon || cfg.assets?.icon || null;

    // ===== BANNER FIX - NO POOP =====
    let banner = null;
    if (appId && iconHash) {
        // Only use app-icons, 100% safe, no poop
        let hash = iconHash;
        if (hash.startsWith('http')) banner = null; // don't use external
        else banner = `https://cdn.discordapp.com/app-icons/${appId}/${hash}.png?size=512`;
    }
    // If no icon, no banner - better than poop

    // ===== REWARDS - 100% DYNAMIC - NO FIXED 700 - TRACKING =====
    let rewardText = 'Unknown Reward';
    let rewardCount = null;
    let rewardType = 'unknown';
    
    const rewards = cfg.rewards_config?.rewards || cfg.rewards || cfg.reward_store_listing || [];
    if (rewards.length > 0) {
        const r = rewards[0];
        // Real parsing from API
        if (r.count !== undefined || r.amount !== undefined || r.orb_count !== undefined) {
            rewardCount = r.count ?? r.amount ?? r.orb_count;
            rewardText = `${rewardCount} Orbs 💠`;
            rewardType = 'orbs';
        } else if (r.name) {
            const name = r.name;
            // Check if name contains number like "700 Orbs"
            const m = name.match(/(\d+)\s*Orbs?/i);
            if (m) {
                rewardCount = parseInt(m[1]);
                rewardText = `${rewardCount} Orbs 💠`;
                rewardType = 'orbs';
            } else if (name.toLowerCase().includes('decoration')) {
                rewardText = `🎨 ${name}`;
                rewardType = 'decoration';
            } else if (name.toLowerCase().includes('effect')) {
                rewardText = `✨ ${name}`;
                rewardType = 'effect';
            } else if (name.toLowerCase().includes('nitro')) {
                rewardText = `💎 ${name}`;
                rewardType = 'nitro';
            } else {
                rewardText = `🎮 ${name}`;
                rewardType = 'in_game';
            }
        }
        // Store in tracker
        rewardTracker.set(String(qId), { count: rewardCount, text: rewardText, type: rewardType });
    } else {
        // Fallback check other fields
        const rt = cfg.messages?.reward_text || cfg.messages?.rewardText || '';
        if (rt) {
            rewardText = rt;
            const m = rt.match(/(\d+)/);
            if (m) rewardCount = parseInt(m[1]);
        }
    }

    // ===== TASKS - REAL RANDOM 10s 30s 3m 15m =====
    const taskCfg = cfg.task_config || cfg.taskConfig || {};
    const tasks = Object.entries(taskCfg.tasks || {});
    let tasksFormatted = '';
    let durations = [];
    let taskType = 'Play';
    if (tasks.length) {
        tasksFormatted = tasks.map(([key, t]) => {
            const target = t.target ?? t.duration ?? 900;
            durations.push(target);
            const ev = (t.event_name || key || '').toLowerCase();
            if (ev.includes('watch') || ev.includes('video')) taskType = 'Watch Video';
            else if (ev.includes('stream')) taskType = 'Stream';
            else taskType = 'Play';
            let plat = 'Desktop';
            if (t.platform === 2) plat = 'Xbox';
            else if (t.platform === 3) plat = 'PlayStation';
            if (target < 60) return `• ${taskType} on ${plat} for ${target}s`;
            else return `• ${taskType} on ${plat} for ${Math.round(target/60)}m`;
        }).join('\n');
    } else {
        tasksFormatted = '• Play on Desktop for 15m';
        durations = [900];
    }

    const enrolled = us.enrolled_at || new Date().toISOString();
    const expires = cfg.expires_at || null;
    let progress = 0;
    if (typeof us.progress === 'number') progress = Math.round(us.progress * 100);
    if (us.completed_at) progress = 100;
    
    // Active check
    const isActive = progress < 100 && !us.completed_at;
    const isExpired = expires ? new Date(expires) < new Date() : false;

    return { 
        game: game.slice(0,80), 
        questName: questName.slice(0,80), 
        banner, 
        rewardText, 
        rewardCount, 
        rewardType,
        tasksFormatted, 
        durations, 
        taskType,
        enrolled, 
        expires, 
        progress, 
        questId: String(qId),
        isActive,
        isExpired
    };
}

function build(quest, allQuests, logStatus, opts={}) {
    const d = getReal(quest);
    const progress = opts.progress ?? d.progress;
    const isCompleted = progress >= 100;
    
    const main = new ContainerBuilder().setAccentColor(d.isActive ? 0x5865F2 : 0x808080);
    main.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 🛡️ Quest Solver • AUTO-TRACKING\n\n• **Game:** ${d.game}\n• **Quest:** ${d.questName}\n• **Status:** ${d.isActive ? '🟢 Active' : '⚫ Completed'}${d.isExpired ? ' (Expired)' : ''}\n• **Enrolled:** ${fmtDate(opts.enrolledAt || d.enrolled)}\n• **Expires:** ${fmtDate(opts.expiresAt || d.expires)}\n• **Progress:**\n${isCompleted ? '✅' : '⏳'} ${progress}%\n💻 Desktop: ${progress}%\n\n### Rewards (Auto-Tracked):\n• ${d.rewardText}${d.rewardType === 'orbs' ? ` • Type: ${d.taskType}` : ''}\n\n### Tasks (Real Random):\n${d.tasksFormatted}`
    ));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
    
    // Banner - only if valid app-icons url, no poop
    const bUrl = opts.bannerUrl || d.banner;
    if (bUrl && bUrl.startsWith('https://cdn.discordapp.com/app-icons/')) {
        try { 
            main.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bUrl))); 
            main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)); 
        } catch {}
    }
    
    const placeholder = `${d.game}: ${d.questName}`.slice(0,100);
    // Only show active quests in dropdown if filter enabled, else all
    const listQuests = opts.activeOnly ? (allQuests||[]).filter(q=>getReal(q).isActive) : (allQuests||[quest]);
    const finalList = listQuests.length ? listQuests : (allQuests||[quest]);
    
    const options = finalList.slice(0,25).map(q=>{
        const rd = getReal(q);
        const isSel = rd.questId === d.questId;
        const dur = rd.durations[0] || 900;
        const durStr = dur < 60 ? `${dur}s` : `${Math.round(dur/60)}m`;
        const statusEmoji = rd.isActive ? (rd.progress > 0 ? '🟡' : '🟢') : '⚫';
        return { 
            label: `${rd.game}: ${rd.questName}`.slice(0,100), 
            value: rd.questId, 
            description: `${statusEmoji} ${rd.rewardText} | ${durStr} | ${rd.progress}%${isSel?' • Selected':''}`.slice(0,100), 
            emoji: isSel ? {name:'✅'} : {name: statusEmoji}, 
            default: isSel 
        };
    });
    main.addActionRowComponents(r=>r.addComponents(new StringSelectMenuBuilder().setCustomId('quest_select_menu').setPlaceholder(placeholder).addOptions(options)));
    main.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    main.addActionRowComponents(r=>r.addComponents(
        new ButtonBuilder().setCustomId(`quest_start_${d.questId}`).setLabel(d.isActive ? 'Start Tracking' : 'Completed').setStyle(d.isActive ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji({name: d.isActive ? '▶️' : '✅'}).setDisabled(!d.isActive),
        new ButtonBuilder().setCustomId(`quest_stop_${d.questId}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji({name:'⏹️'}),
        new ButtonBuilder().setCustomId(`quest_refresh_${d.questId}`).setLabel('Refresh Check').setStyle(ButtonStyle.Secondary).setEmoji({name:'🔄'})
    ));
    main.addActionRowComponents(r=>r.addComponents(new ButtonBuilder().setLabel('View Quest').setURL('https://discord.com/quests').setStyle(ButtonStyle.Link).setEmoji({name:'🔗'})));
    
    const logs = new ContainerBuilder().setAccentColor(0x2B2D31);
    logs.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 Quest Logs • Auto-Check\n\`\`\`\n${logStatus}\n\`\`\``));
    return { components:[main,logs], flags:MessageFlags.IsComponentsV2 };
}

function buildLink(){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Not Linked\nUse \`/link\` first`)); return { components:[c], flags:MessageFlags.IsComponentsV2 }; }

export const questCmd={
    data:new SlashCommandBuilder().setName('quest').setDescription('Quest Solver AUTO-TRACKING ACTIVE ONLY'),
    prefix:'quest',
    async execute(interaction, client){
        await interaction.deferReply();
        const token=await client.tokenStore.get(interaction.user.id);
        if(!token){ await interaction.followUp(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||mgr.all||[]);
            const activeValid = valid.filter(q=>getReal(q).isActive && !getReal(q).isExpired);
            const showQuests = activeValid.length ? activeValid : valid;
            if(!showQuests.length){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No Active Quests`)); await interaction.followUp({components:[c], flags:MessageFlags.IsComponentsV2}); return; }
            await interaction.followUp(build(showQuests[0], showQuests, `🔍 Auto-Checked: ${activeValid.length} Active / ${valid.length} Total\n💰 ${getReal(showQuests[0]).rewardText} • ${getReal(showQuests[0]).tasksFormatted.split('\n')[0]}\n📦 Tracking Ready`, {activeOnly:false}));
        }catch(e){ console.error(e); const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Error\n\`\`\`${e.message}\`\`\``)); await interaction.followUp({components:[c], flags:MessageFlags.IsComponentsV2}); }
    },
    async prefixExecute(message,_args,client){
        const token=await client.tokenStore.get(message.author.id);
        if(!token){ await message.channel.send(buildLink()); return; }
        try{
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||mgr.all||[]);
            const activeValid = valid.filter(q=>getReal(q).isActive && !getReal(q).isExpired);
            const showQuests = activeValid.length ? activeValid : valid;
            if(!showQuests.length){ const c=new ContainerBuilder().setAccentColor(0xFF0000); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ No Active Quests`)); await message.channel.send({components:[c], flags:MessageFlags.IsComponentsV2}); return; }
            await message.channel.send(build(showQuests[0], showQuests, `🔍 Auto-Checked: ${activeValid.length} Active / ${valid.length} Total\n💰 ${getReal(showQuests[0]).rewardText}\n📦 Tracking Ready`, {activeOnly:false}));
        }catch(e){ console.error(e); }
    },
    async handleSelectMenu(interaction, client){
        if(interaction.customId!=='quest_select_menu') return;
        await interaction.deferUpdate().catch(()=>{});
        try{
            const token=await client.tokenStore.get(interaction.user.id);
            const qc=new QuestClient(token);
            const mgr=await qc.fetchQuests();
            const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||mgr.all||[]);
            const sel=valid.find(q=>String(q.id||q.config?.id)===interaction.values[0])||valid[0];
            const rd=getReal(sel);
            await interaction.editReply(build(sel, valid, `🧭 Auto-Checked: ${rd.questName}\n💰 Tracked: ${rd.rewardText} • ${rd.tasksFormatted.split('\n')[0]}\n${rd.isActive?'🟢 Active - Ready to track':'⚫ Completed'}`)).catch(()=>{});
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
        const userId=interaction.user.id;
        const token=await client.tokenStore.get(userId);
        if(!token) return;
        const qc=new QuestClient(token);
        const mgr=await qc.fetchQuests();
        const valid=mgr.filterQuestsValid?mgr.filterQuestsValid():(mgr.quests||mgr.all||[]);
        const quest=valid.find(q=>String(q.id||q.config?.id)===qId)||valid[0];
        const rd = getReal(quest);
        if(action==='start'){
            if(!rd.isActive){ await interaction.editReply(build(quest, valid, `⚫ Already Completed: ${rd.questName}\n💰 ${rd.rewardText} already claimed`)).catch(()=>{}); return; }
            await interaction.editReply(build(quest, valid, `▶️ Auto-Tracking Started: ${rd.questName}\n💰 Tracking: ${rd.rewardText} • ${rd.tasksFormatted.split('\n')[0]}\n🔍 Bot khud check karega progress`, {progress:rd.progress})).catch(()=>{});
            activeQuestRunners.set(`${userId}_${qId}`, qc);
            setImmediate(async()=>{
                try{
                    try{ await qc.enrollQuest?.(quest); }catch{}
                    let last=0;
                    await qc.doingQuest(quest, (done,total)=>{
                        const p=Math.round(done/total*100);
                        if(p-last>=2||p===100){ 
                            last=p; 
                            const fresh=valid.map(q=>String(q.id||q.config?.id)===qId?{...q, user_status:{...q.user_status, progress:p/100}}:q); 
                            interaction.editReply(build({...quest, user_status:{...quest.user_status, progress:p/100}}, fresh, `▶️ Tracking Active: ${p}% • ${rd.game}\n💰 Tracked: ${rd.rewardText} • Heartbeat OK • Auto-Check`, {progress:p})).catch(()=>{}); 
                        }
                    });
                    activeQuestRunners.delete(`${userId}_${qId}`);
                    rewardTracker.set(qId, {claimed:true, ...rd});
                    await interaction.editReply(build({...quest, user_status:{progress:1, completed_at:new Date().toISOString()}}, valid, `✅ Completed & Tracked! ${rd.questName}\n🎉 ${rd.rewardText} claimed! Auto-Checked!`, {progress:100})).catch(()=>{});
                }catch(err){ activeQuestRunners.delete(`${userId}_${qId}`); await interaction.editReply(build(quest, valid, `❌ Failed: ${err.message}\n💡 Try Refresh Check`)).catch(()=>{}); }
            });
        }else if(action==='stop'){
            const run=activeQuestRunners.get(`${userId}_${qId}`)||qc;
            if(typeof run.abort==='function') run.abort();
            activeQuestRunners.delete(`${userId}_${qId}`);
            await interaction.editReply(build(quest, valid, '⏹️ Tracking Stopped - Active Check Paused')).catch(()=>{});
        }else if(action==='refresh'){
            const fresh=await qc.fetchQuests();
            const fValid=fresh.filterQuestsValid?fresh.filterQuestsValid():(fresh.quests||fresh.all||[]);
            const fQuest=fValid.find(q=>String(q.id||q.config?.id)===qId)||fValid[0];
            const fd=getReal(fQuest);
            await interaction.editReply(build(fQuest, fValid, `🔄 Auto-Checked Refresh\n${fd.isActive?'🟢':'⚫'} ${fd.progress}% | ${fd.rewardText} | ${fd.tasksFormatted.split('\n')[0]}\n${fd.isActive?'Active - Trackable':'Completed'}`, {progress:fd.progress})).catch(()=>{});
        }
    }
};
export { build as buildFixed, getReal as getRealData };
