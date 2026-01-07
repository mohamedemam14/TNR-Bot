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
  
  // رتب المتدربين للحساب التلقائي
  RANK_1_ROLE_ID: "1434311654664962240", // استبدله بـ ID رتبة 1
  RANK_2_ROLE_ID: "1434316046847709356", // استبدله بـ ID رتبة 2

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
    GatewayIntentBits.GuildMembers // ضروري جداً لحساب الرتب
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

/* ================== تحديث الإمبدات ================== */
async function updateStatsEmbeds() {
  try {
    const db = loadDB();
    const data = db.stats;
    const channel = await client.channels.fetch(CONFIG.STATS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // --- حساب المتدربين من الرتب تلقائياً ---
    const guild = channel.guild;
    await guild.members.fetch(); // تحديث كاش الأعضاء
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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reset_week").setLabel("تصفير الأسبوع").setStyle(ButtonStyle.Danger)
    );

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

  // أمر الهيلب (Help)
  if (message.content === "+help") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("📖 قائمة أوامر التحكم في البوت")
      .setColor(0x00ffcc)
      .setDescription("الأوامر المخصصة للإدارة للتحكم في الإحصائيات:")
      .addFields(
        { name: "⭐ نشاط الأعضاء", value: "`+كورس @user [العدد]`\n`+فعالية @user [العدد]`", inline: true },
        { name: "➕ إحصائيات يدوية", value: "`+مخالفة [العدد]`\n`+ترقية [العدد]`", inline: true },
        { name: "✅ نظام المهام", value: "`مكمل @user [الرتبة]`\n`مكمل @user [اسم المهمة] [الرتبة]`", inline: false },
        { name: "📊 التقييمات", value: "1-2: ضعيف | 3-5: جيد | 6-9: جيد جداً | 10+: ممتاز", inline: false }
      )
      .setImage(CONFIG.LINE_LINK)
      .setFooter({ text: "TNR System Help Center" });

    return message.reply({ embeds: [helpEmbed] });
  }

  // الأوامر اليدوية
  if (message.content.startsWith("+")) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

    const args = message.content.split(/\s+/);
    const command = args[0];
    const amount = parseInt(args[2]) || (parseInt(args[1]) || 1); 
    const target = message.mentions.members.first();

    if (command === "+كورس") {
      if (!target) return message.reply("❌ يرجى منشن الشخص.");
      if (!db.stats.people[target.id]) db.stats.people[target.id] = { name: target.displayName, courses: 0, events: 0 };
      db.stats.people[target.id].courses += amount;
      message.reply(`✅ تمت إضافة ${amount} كورس لـ ${target.displayName}`);
    } 
    else if (command === "+فعالية") {
      if (!target) return message.reply("❌ يرجى منشن الشخص.");
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

  // رصد الكورسات والفعاليات تلقائياً
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

// (بقية الأحداث ReactionAdd و InteractionCreate تبقى كما هي...)
// ... [نفس الكود السابق] ...

client.login(CONFIG.TOKEN);
