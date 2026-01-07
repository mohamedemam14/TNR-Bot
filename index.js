import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
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
  
  // غرف العمل الـ 12 للرصد التلقائي للمهام
  ROOMS: [
    "1434330815990464674", "1434330427900039343", "1434521224272150619", 
    "1434330587480719484", "1434330953018249377", "1434330690928906280",
    "1434514759436472451", "1434514060937924729", "1434516019661242408", 
    "1434514183461929021", "1434514841204162650", "1434514293830717530"
  ],

  // غرف المخالفات والإرشاد الـ 4 المحددة لزيادة الإحصائية
  VIOLATION_ROOMS: [
    "1434514759436472451", 
    "1434516019661242408", 
    "1434330815990464674", 
    "1434521224272150619"
  ],

  LINE_LINK: "https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif",
  DB_FILE: "./data/database.json"
};

const TASKS_MAP = {
  "1434330815990464674": "الإرشاد", "1434330427900039343": "الاستقبال",
  "1434521224272150619": "المخالفات", "1434330587480719484": "الفعاليات",
  "1434330953018249377": "الإعلام", "1434330690928906280": "CPR",
  "1434514759436472451": "الإرشاد", "1434514060937924729": "الاستقبال",
  "1434516019661242408": "المخالفات", "1434514183461929021": "الفعاليات",
  "1434514841204162650": "الإعلام", "1434514293830717530": "CPR"
};

const TASKS_RANK_LIST = ["الإرشاد", "الاستقبال", "المخالفات", "الفعاليات", "الإعلام", "CPR"];

/* ================== البوت والسيرفر ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
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
    fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify({ progress: {}, stats: { violations: 0, promoted: 0, people: {}, mainEmbedId: null, topEmbedId: null } }));
  }
  return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(data, null, 2)); }

/* ================== نظام المهام (مكمل) ================== */
async function completeTask(traineeId, rank, taskName) {
  const db = loadDB();
  const key = `${traineeId}_${rank}`;
  if (!db.progress[key]) db.progress[key] = { tasks: [], followMessageId: null, resultSent: false };

  const data = db.progress[key];
  if (taskName === "الكل") {
    data.tasks = [...TASKS_RANK_LIST];
  } else if (taskName && TASKS_RANK_LIST.includes(taskName) && !data.tasks.includes(taskName)) {
    data.tasks.push(taskName);
  } else { return; }

  let listString = TASKS_RANK_LIST.map(t => `${data.tasks.includes(t) ? "✅" : "❌"} ${t}`).join("\n");
  const content = `📋 **متابعة مهام رتبة ${rank}**\n━━━━━━━━━━━━━━\n👤 المتدرب: <@${traineeId}>\n\n📝 المهام:\n${listString}\n━━━━━━━━━━━━━━\n📊 التقدم: ${data.tasks.length} / ${TASKS_RANK_LIST.length}\n\n🔗 ${CONFIG.LINE_LINK}`;

  const followChannel = await client.channels.fetch(CONFIG.FOLLOW_CHANNEL_ID).catch(() => null);
  if (followChannel) {
    if (data.followMessageId) {
      const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (m) await m.edit({ content });
      else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }
    } else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }
  }

  if (data.tasks.length === TASKS_RANK_LIST.length && !data.resultSent) {
    data.resultSent = true;
    const resChId = rank === 2 ? CONFIG.RESULT_RANK_2 : CONFIG.RESULT_RANK_3;
    const resCh = await client.channels.fetch(resChId).catch(() => null);
    if (resCh) await resCh.send(`🎉 **جاهز للترقية**\n👤 المتدرب: <@${traineeId}>\n🏅 الرتبة: ${rank}\n\n🔗 ${CONFIG.LINE_LINK}`);
    
    const finalCh = await client.channels.fetch(CONFIG.FINAL_UPGRADE_CHANNEL_ID).catch(() => null);
    if (finalCh) await finalCh.send(`**\n- إسم المتدرب : <@${traineeId}>\n- الرتبة الحالية : ${rank}\n\n- جاهز للترقية : ✅\n**`);
    db.stats.promoted++;
  }
  saveDB(db);
  updateStatsEmbeds();
}

/* ================== تحديث الإحصائيات (الإمبدات) ================== */
async function updateStatsEmbeds() {
  try {
    const db = loadDB();
    const data = db.stats;
    const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guild = channel.guild;
    const members = await guild.members.fetch(); 
    const traineesCount = members.filter(m => m.roles.cache.has(CONFIG.RANK_1_ROLE_ID) || m.roles.cache.has(CONFIG.RANK_2_ROLE_ID)).size;

    const totalCourses = Object.values(data.people).reduce((sum, p) => sum + (p.courses || 0), 0);
    const totalEvents = Object.values(data.people).reduce((sum, p) => sum + (p.events || 0), 0);

    // 1. الإمبد الأول (الإحصائيات)
    const mainEmbed = new EmbedBuilder()
      .setTitle("📊 إحصائيات المتابعة الأسبوعية")
      .setColor(0x5865f2)
      .addFields(
        { name: "👥 متدربين حاليين", value: `\`\`\`res\n${traineesCount}\`\`\``, inline: true },
        { name: "📚 إجمالي الكورسات", value: `\`\`\`res\n${totalCourses}\`\`\``, inline: true },
        { name: "🎯 إجمالي الفعاليات", value: `\`\`\`res\n${totalEvents}\`\`\``, inline: true },
        { name: "🚫 مخالفات وإرشاد", value: `\`\`\`res\n${data.violations}\`\`\``, inline: true },
        { name: "⬆️ تمت ترقية", value: `\`\`\`res\n${data.promoted}\`\`\``, inline: true }
      )
      .setImage(CONFIG.LINE_LINK)
      .setTimestamp();

    // 2. الإمبد الثاني (التميز)
    const sortedIds = Object.keys(data.people).sort((a, b) => {
      const totalA = (data.people[a].courses || 0) + (data.people[a].events || 0);
      const totalB = (data.people[b].courses || 0) + (data.people[b].events || 0);
      return totalB - totalA;
    });

    let listDesc = "لا يوجد بيانات نشاط حالياً";
    if (sortedIds.length > 0) {
      listDesc = `🌟 **نجم الأسبوع:** <@${sortedIds[0]}>\n━━━━━━━━━━━━━━\n`;
      listDesc += sortedIds.slice(0, 15).map((id, i) => {
        const p = data.people[id];
        const total = (p.courses || 0) + (p.events || 0);
        let rating = total >= 10 ? "💎 ممتاز" : total >= 6 ? "✅ جيد جداً" : total >= 3 ? "⚠️ جيد" : "❌ ضعيف";
        return `**${i + 1}. ${p.name}**\n📚 كورسات: ${p.courses} | 🎯 فعاليات: ${p.events}\nالتقييم: \`${rating}\``;
      }).join("\n\n");
    }

    const topEmbed = new EmbedBuilder()
      .setTitle("🏆 قائمة النشاط والتميز")
      .setColor(0xf1c40f)
      .setDescription(listDesc)
      .setFooter({ text: "يتم الترتيب والتقييم تلقائياً" });

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

    saveDB(db);
  } catch (err) { console.error(err); }
}

/* ================== رصد الريأكشن ✅ ================== */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.emoji.name !== "✅") return;
  if (reaction.partial) await reaction.fetch();
  
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member || !member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

  // 1. الرصد في رومات العمل الـ 12 (للمهام)
  if (CONFIG.ROOMS.includes(reaction.message.channelId)) {
    const traineeId = reaction.message.author.id;
    const traineeMember = await reaction.message.guild.members.fetch(traineeId).catch(() => null);
    if (traineeMember) {
      const rank = traineeMember.roles.cache.has(CONFIG.RANK_2_ROLE_ID) ? 3 : 2;
      const taskName = TASKS_MAP[reaction.message.channelId];
      if (taskName) await completeTask(traineeId, rank, taskName);
    }
  }

  // 2. الرصد في الرومات الـ 4 المحددة (لزيادة عداد المخالفات والإرشاد)
  if (CONFIG.VIOLATION_ROOMS.includes(reaction.message.channelId)) {
    const db = loadDB();
    db.stats.violations += 1; // تزداد في كل مرة يتم وضع ريأكشن ✅ من إداري
    saveDB(db);
    updateStatsEmbeds();
  }
});

/* ================== الأوامر والرسائل ================== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const db = loadDB();

  // 1. أمر Help
  if (message.content === "+help") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("📖 قائمة أوامر التحكم")
      .setColor(0x00ffcc)
      .addFields(
        { name: "⭐ نشاط", value: "`+كورس/كورسات @user [عدد]`\n`+فعالية @user [عدد]`", inline: true },
        { name: "➕ إحصائيات يدوية", value: "`+مخالفة [عدد]`\n`+ترقية [عدد]`", inline: true },
        { name: "✅ المهام", value: "`مكمل @user [الرتبة]`\n`مكمل @user [مهمة] [رتبة]`\nأو ريأكشن ✅ في الرومات", inline: false },
        { name: "🧹 الإدارة", value: "`+reset` (تصفير الأسبوع)", inline: true }
      ).setImage(CONFIG.LINE_LINK);
    return message.reply({ embeds: [helpEmbed] });
  }

  // 2. أمر مكمل
  if (message.content.startsWith("مكمل")) {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
    const args = message.content.split(/\s+/);
    const trainee = message.mentions.members.first();
    const rank = parseInt(args[args.length - 1]);
    if (!trainee || ![2, 3].includes(rank)) return;

    let taskName = message.content.replace(/مكمل|<@!?\d+>|\d+/g, "").trim() || "الكل";
    await completeTask(trainee.id, rank, taskName);
    message.react("✅");
  }

  // 3. الأوامر اليدوية (+)
  if (message.content.startsWith("+")) {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
    const args = message.content.split(/\s+/);
    const command = args[0];
    const target = message.mentions.members.first();
    const amount = parseInt(args.find(a => !isNaN(a) && a.length < 5)) || 1;

    if (command === "+reset") {
      db.stats = { violations: 0, promoted: 0, people: {}, mainEmbedId: db.stats.mainEmbedId, topEmbedId: db.stats.topEmbedId };
      saveDB(db); await updateStatsEmbeds(); return message.reply("✅ تم تصفير الأسبوع.");
    }
    if ((command === "+كورس" || command === "+كورسات") && target) {
        if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
        db.stats.people[target.id].courses += amount;
        message.reply(`✅ تم إضافة ${amount} كورس لـ ${target.displayName}`);
    } else if (command === "+فعالية" && target) {
        if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
        db.stats.people[target.id].events += amount;
        message.reply(`✅ تم إضافة ${amount} فعالية لـ ${target.displayName}`);
    } else if (command === "+مخالفة") { db.stats.violations += amount; message.reply(`✅ تمت إضافة ${amount} مخالفة.`); }
    else if (command === "+ترقية") { db.stats.promoted += amount; message.reply(`✅ تمت إضافة ${amount} ترقية.`); }

    saveDB(db); updateStatsEmbeds();
  }

  // 4. الرصد التلقائي (الكورسات والفعاليات)
  const userId = message.author.id;
  const isCourse = CONFIG.COURSE_ROOMS.includes(message.channelId) && message.attachments.size > 0;
  const isEvent = CONFIG.EVENT_ROOMS.includes(message.channelId);
  if (isCourse || isEvent) {
    if (!db.stats.people[userId]) db.stats.people[userId] = { name: message.member.displayName, courses: 0, events: 0 };
    if (isCourse) db.stats.people[userId].courses++; if (isEvent) db.stats.people[userId].events++;
    saveDB(db); updateStatsEmbeds();
  }
});

client.once(Events.ClientReady, () => { console.log("🚀 System Online"); updateStatsEmbeds(); });
client.login(CONFIG.TOKEN);
