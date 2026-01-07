import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder 
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
  
  RANK_1_ROLE_ID: "1434311654664962240", 
  RANK_2_ROLE_ID: "1434316046847709356", 

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
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMessageReactions, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers 
  ],
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
      stats: { violations: 0, promoted: 0, people: {}, mainEmbedId: null, topEmbedId: null } 
    }));
  }
  return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(data, null, 2)); }

/* ================== نظام المهام ================== */
async function completeTask(traineeId, rank, taskName) {
  const db = loadDB();
  const key = `${traineeId}_${rank}`;
  if (!db.progress[key]) db.progress[key] = { tasks: [], followMessageId: null, resultSent: false };

  const data = db.progress[key];
  const tasksList = rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3;
  const totalTasks = Object.values(tasksList);

  if (taskName === "الكل") {
    data.tasks = [...totalTasks];
  } else if (taskName && !data.tasks.includes(taskName)) {
    data.tasks.push(taskName);
  }

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

/* ================== تحديث الإمبدات ================== */
async function updateStatsEmbeds() {
  try {
    const db = loadDB();
    const data = db.stats;
    const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guild = channel.guild;
    await guild.members.fetch(); 
    const traineesCount = guild.members.cache.filter(m => 
      m.roles.cache.has(CONFIG.RANK_1_ROLE_ID) || m.roles.cache.has(CONFIG.RANK_2_ROLE_ID)
    ).size;

    const totalActivities = Object.values(data.people).reduce((sum, p) => sum + (p.courses || 0) + (p.events || 0), 0);

    const mainEmbed = {
      title: "📊 إحصائيات المتابعة الأسبوعية",
      description: "يتم تحديث إحصائيات المتدربين تلقائياً بناءً على الرتب\n━━━━━━━━━━━━━━",
      color: 0x5865f2,
      fields: [
        { name: "👥 متدربين حاليين", value: `\`\`\`res\n${traineesCount}\`\`\``, inline: true },
        { name: "📚 الكورسات والفعاليات", value: `\`\`\`res\n${totalActivities}\`\`\``, inline: true },
        { name: "🚫 مخالفات وإرشاد", value: `\`\`\`res\n${data.violations}\`\`\``, inline: true },
        { name: "⬆️ تمت ترقية", value: `\`\`\`res\n${data.promoted}\`\`\``, inline: true }
      ],
      image: { url: CONFIG.LINE_LINK },
      timestamp: new Date(),
      footer: { text: "نظام الإحصائيات التلقائي" }
    };

    const sortedIds = Object.keys(data.people).sort((a, b) => {
      const totalA = (data.people[a].courses || 0) + (data.people[a].events || 0);
      const totalB = (data.people[b].courses || 0) + (data.people[b].events || 0);
      return totalB - totalA;
    });

    let listDescription = "";
    if (sortedIds.length > 0) {
      const topUserId = sortedIds[0];
      listDescription += `🌟 **نجم الأسبوع:** <@${topUserId}>\n━━━━━━━━━━━━━━\n`;

      listDescription += sortedIds.slice(0, 15).map((id, i) => {
        const p = data.people[id];
        const total = (p.courses || 0) + (p.events || 0);
        let rating = total >= 10 ? "💎 ممتاز" : total >= 6 ? "✅ جيد جداً" : total >= 3 ? "⚠️ جيد" : "❌ ضعيف";
        return `**${i + 1}. ${p.name}**\n📚 كورسات: ${p.courses} | 🎯 فعاليات: ${p.events}\nالتقييم: \`${rating}\``;
      }).join("\n\n");
    } else {
      listDescription = "لا يوجد بيانات نشاط حالياً";
    }

    const topEmbed = { title: "🏆 قائمة النشاط والتميز", color: 0xf1c40f, description: listDescription, footer: { text: "يتم الترتيب والتقييم تلقائياً" } };

    if (data.mainEmbedId) {
      const msg = await channel.messages.fetch(data.mainEmbedId).catch(() => null);
      if (msg) await msg.edit({ embeds: [mainEmbed] });
      else { const n = await channel.send({ embeds: [mainEmbed] }); data.mainEmbedId = n.id; }
    } else { const n = await channel.send({ embeds: [mainEmbed] }); data.mainEmbedId = n.id; }

    if (data.topEmbedId) {
      const msg = await channel.messages.fetch(data.topEmbedId).catch(() => null);
      if (msg) await msg.edit({ embeds: [topEmbed] });
      else { const n = await channel.send({ embeds: [topEmbed] }); data.topEmbedId = n.id; }
    } else { const n = await channel.send({ embeds: [topEmbed] }); data.topEmbedId = n.id; }

    db.stats = data;
    saveDB(db);
  } catch (err) { console.error("Stats Update Error:", err); }
}

/* ================== الأحداث (Events) ================== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const db = loadDB();
  const userId = message.author.id;

  // أمر الهيلب (Help)
  if (message.content === "+help") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("📖 قائمة أوامر التحكم في البوت")
      .setColor(0x00ffcc)
      .addFields(
        { name: "⭐ نشاط الأعضاء", value: "`+كورس @user [العدد]`\n`+فعالية @user [العدد]`", inline: true },
        { name: "➕ إحصائيات يدوية", value: "`+مخالفة [العدد]`\n`+ترقية [العدد]`", inline: true },
        { name: "✅ نظام المهام", value: "`مكمل @user [الرتبة]`\n`مكمل @user [اسم المهمة] [الرتبة]`", inline: false },
        { name: "🧹 أوامر التصفير", value: "`+reset` (لتصفير الإحصائيات)", inline: true }
      )
      .setImage(CONFIG.LINE_LINK);
    return message.reply({ embeds: [helpEmbed] });
  }

  // نظام مكمل
  if (message.content.startsWith("مكمل")) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

    const args = message.content.split(/\s+/);
    const trainee = message.mentions.members.first();
    const rank = parseInt(args[args.length - 1]);

    if (!trainee || ![2, 3].includes(rank)) return;

    // استخراج اسم المهمة إذا وجد
    let taskPart = message.content
      .replace("مكمل", "")
      .replace(`<@${trainee.id}>`, "")
      .replace(`<@!${trainee.id}>`, "")
      .replace(rank.toString(), "")
      .trim();

    const taskName = taskPart === "" ? "الكل" : taskPart;
    await completeTask(trainee.id, rank, taskName);
    message.react("✅");
    return;
  }

  // الأوامر اليدوية (+)
  if (message.content.startsWith("+")) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

    const args = message.content.split(/\s+/);
    const command = args[0];
    const target = message.mentions.members.first();
    
    let amount = 1;
    const potentialAmount = args.find(arg => !isNaN(arg) && arg.trim() !== "");
    if (potentialAmount) amount = parseInt(potentialAmount);

    if (command === "+reset") {
      db.stats = { violations: 0, promoted: 0, people: {}, mainEmbedId: db.stats.mainEmbedId, topEmbedId: db.stats.topEmbedId };
      saveDB(db);
      await updateStatsEmbeds();
      return message.reply("✅ تم تصفير إحصائيات الأسبوع.");
    }

    if (command === "+كورس" && target) {
      if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
      db.stats.people[target.id].courses += amount;
      message.reply(`✅ تمت إضافة ${amount} كورس لـ ${target.displayName}`);
    } 
    else if (command === "+فعالية" && target) {
      if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
      db.stats.people[target.id].events += amount;
      message.reply(`✅ تمت إضافة ${amount} فعالية لـ ${target.displayName}`);
    }
    else if (command === "+مخالفة") {
      db.stats.violations += amount;
      message.reply(`✅ تمت إضافة ${amount} مخالفة.`);
    } 
    else if (command === "+ترقية") {
      db.stats.promoted += amount;
      message.reply(`✅ تمت إضافة ${amount} ترقية.`);
    }

    saveDB(db);
    updateStatsEmbeds();
    return;
  }

  // الحساب التلقائي من الرومات
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

client.once(Events.ClientReady, () => {
  console.log(`🚀 System Ready: ${client.user.tag}`);
  updateStatsEmbeds();
});

client.login(CONFIG.TOKEN);
