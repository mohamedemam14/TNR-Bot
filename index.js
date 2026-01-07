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

  // غرف العمل الـ 12
  ROOMS: [
    "1434330815990464674", "1434330427900039343", "1434521224272150619", 
    "1434330587480719484", "1434330953018249377", "1434330690928906280",
    "1434514759436472451", "1434514060937924729", "1434516019661242408", 
    "1434514183461929021", "1434514841204162650", "1434514293830717530"
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

const TASKS_RANK_2 = ["الإرشاد", "الاستقبال", "المخالفات", "الفعاليات", "الإعلام", "CPR"];
const TASKS_RANK_3 = ["الإرشاد", "الاستقبال", "المخالفات", "الفعاليات", "الإعلام", "CPR"];

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
    fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify({ progress: {}, stats: { violations: 0, promoted: 0, people: {}, mainEmbedId: null } }));
  }
  return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(data, null, 2)); }

/* ================== نظام المهام الأساسي ================== */
async function completeTask(traineeId, rank, taskName) {
  const db = loadDB();
  const key = `${traineeId}_${rank}`;
  if (!db.progress[key]) db.progress[key] = { tasks: [], followMessageId: null, resultSent: false };

  const data = db.progress[key];
  const totalTasks = rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3;

  if (taskName === "الكل") {
    data.tasks = [...totalTasks];
  } else if (taskName && totalTasks.includes(taskName) && !data.tasks.includes(taskName)) {
    data.tasks.push(taskName);
  } else { return; }

  let listString = totalTasks.map(t => `${data.tasks.includes(t) ? "✅" : "❌"} ${t}`).join("\n");
  const content = `📋 **متابعة مهام رتبة ${rank}**\n━━━━━━━━━━━━━━\n👤 المتدرب: <@${traineeId}>\n\n📝 المهام:\n${listString}\n━━━━━━━━━━━━━━\n📊 التقدم: ${data.tasks.length} / ${totalTasks.length}\n\n🔗 ${CONFIG.LINE_LINK}`;

  const followChannel = await client.channels.fetch(CONFIG.FOLLOW_CHANNEL_ID).catch(() => null);
  if (followChannel) {
    if (data.followMessageId) {
      const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (m) await m.edit({ content });
      else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }
    } else { const s = await followChannel.send({ content }); data.followMessageId = s.id; }
  }

  if (data.tasks.length === totalTasks.length && !data.resultSent) {
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

/* ================== تحديث الإحصائيات العامة ================== */
async function updateStatsEmbeds() {
  const db = loadDB();
  const data = db.stats;
  const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const guild = channel.guild;
  const members = await guild.members.fetch(); 
  const traineesCount = members.filter(m => m.roles.cache.has(CONFIG.RANK_1_ROLE_ID) || m.roles.cache.has(CONFIG.RANK_2_ROLE_ID)).size;
  const totalActivities = Object.values(data.people).reduce((sum, p) => sum + (p.courses || 0) + (p.events || 0), 0);

  const mainEmbed = new EmbedBuilder()
    .setTitle("📊 إحصائيات المتابعة الأسبوعية")
    .setColor(0x5865f2)
    .addFields(
      { name: "👥 متدربين حاليين", value: `\`\`\`res\n${traineesCount}\`\`\``, inline: true },
      { name: "📚 الكورسات والفعاليات", value: `\`\`\`res\n${totalActivities}\`\`\``, inline: true },
      { name: "🚫 مخالفات وإرشاد", value: `\`\`\`res\n${data.violations}\`\`\``, inline: true },
      { name: "⬆️ تمت ترقية", value: `\`\`\`res\n${data.promoted}\`\`\``, inline: true }
    )
    .setImage(CONFIG.LINE_LINK);

  if (data.mainEmbedId) {
    const msg = await channel.messages.fetch(data.mainEmbedId).catch(() => null);
    if (msg) await msg.edit({ embeds: [mainEmbed] });
    else { const n = await channel.send({ embeds: [mainEmbed] }); data.mainEmbedId = n.id; }
  } else { const n = await channel.send({ embeds: [mainEmbed] }); data.mainEmbedId = n.id; }
  saveDB(db);
}

/* ================== رصد الريأكشن ✅ ================== */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  
  // التأكد أن الإيموجي هو ✅
  if (reaction.emoji.name !== "✅") return;

  if (reaction.partial) await reaction.fetch();
  
  if (CONFIG.ROOMS.includes(reaction.message.channelId)) {
    const member = await reaction.message.guild.members.fetch(user.id);
    
    // التحقق من رتبة الإدارة التي تضع الريأكشن
    if (member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
      const traineeId = reaction.message.author.id;
      const traineeMember = await reaction.message.guild.members.fetch(traineeId).catch(() => null);
      if (!traineeMember) return;

      // تحديد الرتبة بناءً على رتبة المتدرب الحالية
      const rank = traineeMember.roles.cache.has(CONFIG.RANK_2_ROLE_ID) ? 3 : 2;
      const taskName = TASKS_MAP[reaction.message.channelId];
      
      if (taskName) {
        await completeTask(traineeId, rank, taskName);
      }
    }
  }
});

/* ================== الأوامر ================== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const db = loadDB();

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

  if (message.content.startsWith("+")) {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
    const args = message.content.split(/\s+/);
    const command = args[0];
    const target = message.mentions.members.first();
    const amount = parseInt(args.find(a => !isNaN(a) && a.length < 5)) || 1;

    if (command === "+reset") {
      db.stats = { violations: 0, promoted: 0, people: {}, mainEmbedId: db.stats.mainEmbedId };
      saveDB(db); await updateStatsEmbeds(); return message.reply("✅ تم تصفير الأسبوع.");
    }
    if (command === "+كورس" && target) {
        if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
        db.stats.people[target.id].courses += amount;
        message.reply(`✅ تم إضافة ${amount} كورس لـ ${target.displayName}`);
    }
    saveDB(db); updateStatsEmbeds();
  }
});

client.once(Events.ClientReady, () => { updateStatsEmbeds(); });
client.login(CONFIG.TOKEN);
