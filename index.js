const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// --- إعدادات الأيديهات (ضع الأيديهات الخاصة بك هنا) ---
const TOKEN = "YOUR_BOT_TOKEN_HERE"; // توكن البوت
const CHANNELS = {
    SCHEDULE: "1234567890",   // روم الجدول
    STATS: "1234567890",      // روم إحصائيات الساعات
    ATTENDANCE: "1234567890"  // روم تسجيل الدخول والخروج
};

const DATA_FILE = './hospital_data.json';

// تحميل أو إنشاء قاعدة البيانات
let db = {
    schedule: {},
    stats: {},
    config: { statsMessageId: null }
};

if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE));
}

// مصفوفة الساعات الـ 24
const hours = [
    "12:00ص – 1:00ص", "1:00ص – 2:00ص", "2:00ص – 3:00ص", "3:00ص – 4:00ص",
    "4:00ص – 5:00ص", "5:00ص – 6:00ص", "6:00ص – 7:00ص", "7:00ص – 8:00ص",
    "8:00ص – 9:00ص", "9:00ص – 10:00ص", "10:00ص – 11:00ص", "11:00ص – 12:00م",
    "12:00م – 1:00م", "1:00م – 2:00م", "2:00م – 3:00م", "3:00م – 4:00م",
    "4:00م – 5:00م", "5:00م – 6:00م", "6:00م – 7:00م", "7:00م – 8:00م",
    "8:00م – 9:00م", "9:00م – 10:00م", "10:00م – 11:00م", "11:00م – 12:00ص"
];

// تهيئة الجدول
if (Object.keys(db.schedule).length === 0) {
    hours.forEach(h => db.schedule[h] = { owner: null });
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// إنشاء إمبد الجدول
function getScheduleEmbed() {
    let desc = hours.map(h => `⏰ ${h} | ${db.schedule[h].owner ? `<@${db.schedule[h].owner}>` : "🔴 متاح للحجز"}`).join('\n');
    return new EmbedBuilder().setTitle("📅 جدول الشيفتات الأسبوعي الثابت").setDescription(desc).setColor("#5865F2");
}

// إنشاء إمبد الإحصائيات
function getStatsEmbed() {
    let desc = Object.entries(db.stats)
        .map(([id, data]) => `👤 <@${id}>: **${(data.totalMinutes / 60).toFixed(2)}** ساعة عمل`)
        .join('\n') || "لا توجد بيانات مسجلة حالياً.";
    return new EmbedBuilder().setTitle("📊 إحصائيات الساعات المنجزة").setDescription(desc).setColor("#3BA55C");
}

// تحديث رسالة الإحصائيات تلقائياً
async function updateStatsMessage() {
    try {
        const channel = await client.channels.fetch(CHANNELS.STATS);
        if (db.config.statsMessageId) {
            const msg = await channel.messages.fetch(db.config.statsMessageId);
            await msg.edit({ embeds: [getStatsEmbed()] });
        }
    } catch (e) { console.log("خطأ في تحديث الإحصائيات: " + e.message); }
}

client.once('ready', () => {
    console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        
        // 1. روم الجدول
        const schedChan = client.channels.cache.get(CHANNELS.SCHEDULE);
        const schedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شيفت ثابت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجزك').setStyle(ButtonStyle.Danger)
        );
        await schedChan.send({ embeds: [getScheduleEmbed()], components: [schedRow] });

        // 2. روم الحضور
        const attendChan = client.channels.cache.get(CHANNELS.ATTENDANCE);
        const attendRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول (بداية)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج (نهاية)').setStyle(ButtonStyle.Secondary)
        );
        await attendChan.send({ 
            embeds: [new EmbedBuilder().setTitle("⏱️ نظام تسجيل الوقت").setDescription("يرجى الضغط على الأزرار عند بدء وانهاء العمل.").setColor("Grey")],
            components: [attendRow] 
        });

        // 3. روم الإحصائيات
        const statsChan = client.channels.cache.get(CHANNELS.STATS);
        const statsMsg = await statsChan.send({ embeds: [getStatsEmbed()] });
        db.config.statsMessageId = statsMsg.id;
        save();

        message.reply("✅ تم إرسال الأنظمة إلى الرومات المخصصة!");
    }
});

client.on('interactionCreate', async interaction => {
    const userId = interaction.user.id;

    // منطق حجز شيفت
    if (interaction.customId === 'btn_book') {
        const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
        if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ!", ephemeral: true });
        
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_book').setPlaceholder('اختر الساعة المتاحة').addOptions(options)
        );
        await interaction.reply({ content: "اختر وقتك الثابت للأسبوع:", components: [menu], ephemeral: true });
    }

    if (interaction.customId === 'menu_book') {
        const selected = interaction.values[0];
        db.schedule[selected].owner = userId;
        save();
        await interaction.update({ content: `✅ تم حجزك لشيفت: ${selected}`, components: [] });
        await interaction.message.edit({ embeds: [getScheduleEmbed()] });
    }

    // منطق إلغاء الحجز
    if (interaction.customId === 'btn_clear') {
        let count = 0;
        for (let h in db.schedule) {
            if (db.schedule[h].owner === userId) {
                db.schedule[h].owner = null;
                count++;
            }
        }
        if (count === 0) return interaction.reply({ content: "ليس لديك شيفتات محجوزة!", ephemeral: true });
        save();
        await interaction.reply({ content: "✅ تم إلغاء جميع شيفتاتك.", ephemeral: true });
        await interaction.message.edit({ embeds: [getScheduleEmbed()] });
    }

    // منطق الحضور والانصراف
    if (interaction.customId === 'check_in') {
        if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
        if (db.stats[userId].lastLogin) return interaction.reply({ content: "أنت مسجل دخولك بالفعل!", ephemeral: true });
        
        db.stats[userId].lastLogin = Date.now();
        save();
        await interaction.reply({ content: "🛫 تم تسجيل دخولك. عمل ممتع!", ephemeral: true });
    }

    if (interaction.customId === 'check_out') {
        if (!db.stats[userId] || !db.stats[userId].lastLogin) {
            return interaction.reply({ content: "يجب تسجيل الدخول أولاً قبل الخروج!", ephemeral: true });
        }
        const diff = (Date.now() - db.stats[userId].lastLogin) / (1000 * 60); // بالدقائق
        db.stats[userId].totalMinutes += diff;
        db.stats[userId].lastLogin = null;
        save();
        await interaction.reply({ content: `🛬 تم تسجيل الخروج. الرصيد المضاف: **${diff.toFixed(1)}** دقيقة.`, ephemeral: true });
        updateStatsMessage(); // تحديث روم الإحصائيات
    }
});

client.login(TOKEN);
