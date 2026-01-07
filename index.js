import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from "discord.js";
import fs from "fs";
import express from "express";

/* ================== الإعدادات (CONFIG) ================== */
const CONFIG = {
  TOKEN: process.env.TOKEN,
  ADMIN_ROLE_ID: "1457403586005831872",
  STATS_CHANNEL_ID: "1458097832232882308",
  FOLLOW_CHANNEL_ID: "1435287030484697128",
  FINAL_UPGRADE_CHANNEL_ID: "1457888039673270515",
  
  RESULT_RANK_2: "1434522529506267308",
  RESULT_RANK_3: "1434519158426435678",

  COURSE_ROOMS: ["1435036258266124390"],
  EVENT_ROOMS: ["1435036088950460528"],
  VIOLATION_ROOMS: ["1434330815990464674", "1434521224272150619", "1434514759436472451", "1434516019661242408"],

  LINE_LINK: "https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif",
  DB_FILE: "./data/database.json"
};

const TASKS_RANK_2 = {
  "1434330815990464674": "الإرشاد", "1434330427900039343": "الاستقبال",
  "1434521224272150619": "المخالفات", "1434330587480719484": "الفعاليات",
  "1434330953018249377": "الإعلام", "1434330690928906280": "CPR"
};

const TASKS_RANK_3 = {
  "1434514759436472451": "الإرشاد", "1434514060937924729": "الاستقبال",
  "1434516019661242408": "المخالفات", "1434514183461929021": "الفعاليات",
  "1434514841204162650": "الإعلام", "1434514293830717530": "CPR"
};

/* ================== البوت والسيرفر ================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const app = express();
app.get("/", (req, res) => res.send("✅ System is Running"));
app.listen(process.env.PORT || 8080);

/* ================== إدارة البيانات ================== */
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
function loadDB() {
  if (!fs.existsSync(CONFIG.DB_FILE)) {
    fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify({ 
      progress: {}, 
      stats: { trainees: [], violations: 0, promoted: 0, people: {}, mainEmbedId: null, topEmbedId: null } 
    }));
  }
  return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(data, null, 2)); }

/* ================== تحديث الإمبدات ================== */
async function updateStatsEmbeds() {
  try {
    const db = loadDB();
    const data = db.stats;
    const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const totalCourses = Object.values(data.people).reduce((sum, p) => sum + (p.courses || 0), 0);
    const totalEvents = Object.values(data.people).reduce((sum, p) => sum + (p.events || 0), 0);

    const mainEmbed = {
      title: "📊 إحصائيات المتابعة الأسبوعية",
      description: "تم تحديث البيانات بناءً على نشاط الإدارة والمتدربين\n━━━━━━━━━━━━━━",
      color: 0x5865f2,
      fields: [
        { name: "👥 متدربين جدد", value: `\`\`\`res\n${data.trainees.length}\`\`\``, inline: true },
        { name: "📚 الكورسات", value: `\`\`\`res\n${totalCourses}\`\`\``, inline: true },
        { name: "🎯 الفعاليات", value: `\`\`\`res\n${totalEvents}\`\`\``, inline: true },
        { name: "🚫 مخالفات وإرشاد", value: `\`\`\`res\n${data.violations}\`\`\``, inline: true },
        { name: "⬆️ ترقيات", value: `\`\`\`res\n${data.promoted}\`\`\``, inline: true }
      ],
      image: { url: CONFIG.LINE_LINK },
      timestamp: new Date(),
      footer: { text: "نظام الإحصائيات التلقائي" }
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reset_week").setLabel("تصفير الأسبوع").setStyle(ButtonStyle.Danger)
    );

    const sortedIds = Object.keys(data.people).sort((a, b) => {
      const totalA = data.people[a].courses + data.people[a].events;
      const totalB = data.people[b].courses + data.people[b].events;
      return totalB - totalA;
    });

    let listDescription = "";
    if (sortedIds.length > 0) {
      const topUserId = sortedIds[0];
      listDescription += `🌟 **نجم الأسبوع:** <@${topUserId}>\n━━━━━━━━━━━━━━\n`;

      listDescription += sortedIds.slice(0, 15).map((id, i) => {
        const p = data.people[id];
        const total = p.courses + p.events;
        let rating = "";
        
        if (total >= 10) rating = "💎 ممتاز";
        else if (total >= 6) rating = "✅ جيد جداً";
        else if (total >= 3) rating = "⚠️ جيد";
        else rating = "❌ ضعيف";

        return `**${i + 1}. ${p.name}**\n📚 كورسات: ${p.courses} | 🎯 فعاليات: ${p.events}\nالتقييم: \`${rating}\``;
      }).join("\n\n");
    } else {
      listDescription = "لا يوجد بيانات نشاط حالياً";
    }

    const topEmbed = { 
      title: "🏆 قائمة النشاط والتميز", 
      color: 0xf1c40f, 
      description: listDescription,
      footer: { text: "يتم الترتيب والتقييم تلقائياً" }
    };

    if (data.mainEmbedId) {
      const msg = await channel.messages.fetch(data.mainEmbedId).catch(() => null);
      if (msg) await msg.edit({ embeds: [mainEmbed], components: [row] });
      else { const n = await channel.send({ embeds: [mainEmbed], components: [row] }); data.mainEmbedId = n.id; }
    } else { const n = await channel.send({ embeds: [mainEmbed], components: [row] }); data.mainEmbedId = n.id; }

    if (data.topEmbedId) {
      const msg = await channel.messages.fetch(data.topEmbedId).catch(() => null);
      if (msg) await msg.edit({ embeds: [topEmbed] });
      else { const n = await channel.send({ embeds: [topEmbed] }); data.topEmbedId = n.id; }
    } else { const n = await channel.send({ embeds: [topEmbed] }); data.topEmbedId = n.id; }

    db.stats = data;
    saveDB(db);
  } catch (err) { console.error("Stats Update Error:", err); }
}

/* ================== نظام المهام ================== */
async function completeTask(traineeId, rank, taskName) {
  const db = loadDB();
  const key = `${traineeId}_${rank}`;
  if (!db.progress[key]) db.progress[key] = { tasks: [], followMessageId: null, resultSent: false };

  const data = db.progress[key];
  const tasksList = rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3;
  const totalTasks = Object.values(tasksList);

  if (taskName === "الكل") data.tasks = [...totalTasks];
  else if (taskName && !data.tasks.includes(taskName)) data.tasks.push(taskName);

  let listString = totalTasks.map(t => `${data.tasks.includes(t) ? "✅" : "❌"} ${t}`).join("\n");
  const content = `📋 **متابعة مهام رتبة ${rank}**\n━━━━━━━━━━━━━━\n👤 المتدرب: <@${traineeId}>\n\n📝 المهام:\n${listString}\n━━━━━━━━━━━━━━\n📊 التقدم: ${data.tasks.length} / ${totalTasks.length}\n\n🔗 ${CONFIG.LINE_LINK}`;

  const followChannel = await client.channels.fetch(CONFIG.FOLLOW_CHANNEL_ID);
  if (data.followMessageId) {
    const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
    if (m) await m.edit({ content });
    else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }
  } else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }

  if (data.tasks.length === totalTasks.length && !data.resultSent) {
    data.resultSent = true;
    const resCh = await client.channels.fetch(rank === 2 ? CONFIG.RESULT_RANK_2 : CONFIG.RESULT_RANK_3);
    await resCh.send(`🎉 **جاهز للترقية**\n👤 المتدرب: <@${traineeId}>\n🏅 الرتبة: ${rank}\n\n🔗 ${CONFIG.LINE_LINK}`);
    
    const finalCh = await client.channels.fetch(CONFIG.FINAL_UPGRADE_CHANNEL_ID);
    await finalCh.send(`**\n- إسم المتدرب : <@${traineeId}>\n- الرتبة الحالية : ${rank}\n\n- جاهز للترقية : ✅\n**`);
    
    db.stats.promoted++;
  }
  saveDB(db);
  updateStatsEmbeds();
}

/* ================== الأحداث (Events) ================== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) {
    if (message.channelId === CONFIG.FINAL_UPGRADE_CHANNEL_ID) {
      const db = loadDB();
      db.stats.promoted++;
      saveDB(db);
      updateStatsEmbeds();
    }
    return;
  }

  const db = loadDB();
  const userId = message.author.id;

  if (message.content.startsWith("+")) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

    const args = message.content.split(/\s+/);
    const command = args[0];
    const amount = parseInt(args[2]) || 1; 
    const target = message.mentions.members.first();

    if (command === "+متدرب") {
      const num = parseInt(args[1]) || 1;
      for(let i=0; i<num; i++) db.stats.trainees.push(`m_${Date.now()}_${i}`);
      message.reply(`✅ تمت إضافة ${num} متدرب.`);
    } 
    else if (command === "+كورس") {
      if (!target) return message.reply("❌ يرجى منشن الشخص. مثال: `+كورس @user 1` ");
      if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
      db.stats.people[target.id].courses += amount;
      message.reply(`✅ تمت إضافة ${amount} كورس لـ ${target.displayName}`);
    } 
    else if (command === "+فعالية") {
      if (!target) return message.reply("❌ يرجى منشن الشخص. مثال: `+فعالية @user 1` ");
      if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
      db.stats.people[target.id].events += amount;
      message.reply(`✅ تمت إضافة ${amount} فعالية لـ ${target.displayName}`);
    }
    else if (command === "+مخالفة") {
      db.stats.violations += (parseInt(args[1]) || 1);
      message.reply(`✅ تمت إضافة المخالفة.`);
    } 
    else if (command === "+ترقية") {
      db.stats.promoted += (parseInt(args[1]) || 1);
      message.reply(`✅ تمت إضافة الترقية.`);
    }
    saveDB(db);
    updateStatsEmbeds();
    return;
  }

  if (message.content.startsWith("مكمل")) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
    const args = message.content.split(/\s+/);
    const trainee = message.mentions.members.first();
    const rank = parseInt(args[args.length - 1]);
    if (!trainee || ![2, 3].includes(rank)) return;
    let taskPart = message.content.replace("مكمل", "").replace(`<@${trainee.id}>`, "").replace(`<@!${trainee.id}>`, "").replace(rank.toString(), "").trim();
    const validTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    if (taskPart === "الكل" || validTasks.includes(taskPart)) {
      await completeTask(trainee.id, rank, taskPart);
      message.react("✅");
    }
    return;
  }

  const isCourse = CONFIG.COURSE_ROOMS.includes(message.channelId) && message.attachments.size > 0;
  const isEvent = CONFIG.EVENT_ROOMS.includes(message.channelId);

  if (isCourse || isEvent) {
    if (!db.stats.people[userId]) db.stats.people[userId] = { name: message.member.displayName, courses: 0, events: 0 };
    if (isCourse) db.stats.people[userId].courses++;
    if (isEvent) db.stats.people[userId].events++;
    saveDB(db);
    updateStatsEmbeds();
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.emoji.name !== "✅") return;
  const db = loadDB();
  const msg = await reaction.message.fetch();
  const member = await msg.guild.members.fetch(user.id).catch(() => null);
  if (!member || !member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

  const rank = TASKS_RANK_2[msg.channelId] ? 2 : TASKS_RANK_3[msg.channelId] ? 3 : null;
  if (rank) {
    const task = (rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3)[msg.channelId];
    await completeTask(msg.author.id, rank, task);
  }

  if (CONFIG.VIOLATION_ROOMS.includes(msg.channelId)) {
    db.stats.violations++;
    saveDB(db);
    updateStatsEmbeds();
  }
});

client.on(Events.InteractionCreate, async i => {
  if (!i.isButton() || i.customId !== "reset_week") return;
  if (!i.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
  const db = loadDB();
  db.stats = { trainees: [], violations: 0, promoted: 0, people: {}, mainEmbedId: db.stats.mainEmbedId, topEmbedId: db.stats.topEmbedId };
  saveDB(db);
  await updateStatsEmbeds();
  i.reply({ content: "✅ تم تصفير إحصائيات الأسبوع بنجاح", ephemeral: true });
});

client.once(Events.ClientReady, () => {
  console.log(`🚀 TNR System Integrated: ${client.user.tag}`);
  updateStatsEmbeds();
});

process.on("unhandledRejection", e => console.error(e));
client.login(CONFIG.TOKEN);
