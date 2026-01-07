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
  STATS_CHANNEL_ID: "1458097832232882308", // روم الإحصائيات
  FOLLOW_CHANNEL_ID: "1435287030484697128", // روم متابعة المهام
  FINAL_UPGRADE_CHANNEL_ID: "1457888039673270515", // روم الترقية النهائي
  
  // رومات النتائج
  RESULT_RANK_2: "1434522529506267308",
  RESULT_RANK_3: "1434519158426435678",

  // رومات النشاط (للإحصائيات)
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
      stats: { trainees: [], activities: 0, violations: 0, promoted: 0, people: {}, mainEmbedId: null, topEmbedId: null } 
    }));
  }
  return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(data, null, 2)); }

/* ================== وظائف الإحصائيات الأسبوعية ================== */
async function updateStatsEmbeds() {
  try {
    const db = loadDB();
    const data = db.stats;
    const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const mainEmbed = {
      title: "📊 إحصائيات المتابعة الأسبوعية",
      color: 0x5865f2,
      fields: [
        { name: "👥 متدربين جدد", value: `\`${data.trainees.length}\``, inline: true },
        { name: "📚 أنشطة", value: `\`${data.activities}\``, inline: true },
        { name: "🚫 مخالفات", value: `\`${data.violations}\``, inline: true },
        { name: "⬆️ ترقيات", value: `\`${data.promoted}\``, inline: true }
      ],
      timestamp: new Date()
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reset_week").setLabel("تصفير الأسبوع").setStyle(ButtonStyle.Danger)
    );

    const sorted = Object.values(data.people).sort((a, b) => (b.courses + b.events) - (a.courses + a.events));
    const listDescription = sorted.length ? sorted.slice(0, 15).map((p, i) => `**${i + 1}. ${p.name}**\n📚 كورسات: ${p.courses} | 🎯 فعاليات: ${p.events}`).join("\n\n") : "لا يوجد بيانات";

    const topEmbed = { title: "🏆 قائمة النشاط", color: 0xf1c40f, description: listDescription };

    // تحديث الرسائل أو إرسالها
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

/* ================== وظائف نظام المهام ================== */
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
    // رصد الترقيات من البوتات الأخرى في روم الترقية
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

  // 1. نظام "مكمل"
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

  // 2. تحديث إحصائيات الأنشطة
  const isCourse = CONFIG.COURSE_ROOMS.includes(message.channelId) && message.attachments.size > 0;
  const isEvent = CONFIG.EVENT_ROOMS.includes(message.channelId);

  if (isCourse || isEvent) {
    db.stats.activities++;
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
  const member = await msg.guild.members.fetch(user.id);
  if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

  // ريأكشن المهام
  const rank = TASKS_RANK_2[msg.channelId] ? 2 : TASKS_RANK_3[msg.channelId] ? 3 : null;
  if (rank) {
    const task = (rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3)[msg.channelId];
    await completeTask(msg.author.id, rank, task);
  }

  // ريأكشن المخالفات (لصالح الإحصائيات)
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
  db.stats = { trainees: [], activities: 0, violations: 0, promoted: 0, people: {}, mainEmbedId: db.stats.mainEmbedId, topEmbedId: db.stats.topEmbedId };
  saveDB(db);
  await updateStatsEmbeds();
  i.reply({ content: "✅ تم تصفير إحصائيات الأسبوع بنجاح", ephemeral: true });
});

client.once(Events.ClientReady, () => {
  console.log(`🚀 System Integrated & Ready: ${client.user.tag}`);
  updateStatsEmbeds();
});

client.login(CONFIG.TOKEN);
