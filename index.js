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

// --- استدعاء البيانات من متغيرات البيئة (Railway Variables) ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNELS = {
    SCHEDULE: process.env.CHANNEL_SCHEDULE,   
    STATS: process.env.CHANNEL_STATS,      
    ATTENDANCE: process.env.CHANNEL_ATTENDANCE
};

const DATA_FILE = '/tmp/hospital_data.json'; // استخدام مسار مؤقت متوافق مع الاستضافات السحابية

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

// تهيئة الجدول إذا كان جديداً
if (Object.keys(db.schedule).length === 0) {
    hours.forEach(h => db.schedule[h] = { owner: null });
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// دالة إنشاء إمبد الجدول
function getScheduleEmbed() {
    let desc = hours.map(h => `⏰ ${h} | ${db.schedule[h].owner ? `<@${db.schedule[h].owner}>` : "🔴 متاح للحجز"}`).join('\n');
    return new EmbedBuilder()
        .setTitle("📅 جدول الشيفتات الأسبوعي")
        .setDescription(desc)
        .setColor("#5865F2")
        .setTimestamp();
}

// دالة إنشاء إمبد الإحصائيات
function getStatsEmbed() {
    let desc = Object.entries(db.stats)
        .map(([id, data]) => `👤 <@${id}>: **${(data.totalMinutes / 60).toFixed(2)}** ساعة`)
        .join('\n') || "لا توجد بيانات مسجلة.";
    return new EmbedBuilder()
        .setTitle("📊 إحصائيات الساعات")
        .setDescription(desc)
        .setColor("#3BA55C");
}

async function updateStatsMessage() {
    try {
        const channel = await client.channels.fetch(CHANNELS.STATS);
        if (db.config.statsMessageId) {
            const msg = await channel.messages.fetch(db.config.statsMessageId);
            await msg.edit({ embeds: [getStatsEmbed()] });
        }
    } catch (e) { console.error("تنبيه: رسالة الإحصائيات غير موجودة بعد."); }
}

client.once('ready', () => {
    console.log(`✅ البوت متصل الآن باسم: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    // أمر الإعداد - للمديرين فقط
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        
        try {
            // 1. إرسال الجدول
            const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
            const schedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شيفت').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجزك').setStyle(ButtonStyle.Danger)
            );
            await schedChan.send({ embeds: [getScheduleEmbed()], components: [schedRow] });

            // 2. إرسال الحضور
            const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            const attendRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Secondary)
            );
            await attendChan.send({ 
                embeds: [new EmbedBuilder().setTitle("⏱️ تسجيل الحضور").setDescription("سجل دخولك عند البدء وخروجك عند الانتهاء لحساب الساعات.").setColor("Grey")],
                components: [attendRow] 
            });

            // 3. إرسال الإحصائيات
            const statsChan = await client.channels.fetch(CHANNELS.STATS);
            const statsMsg = await statsChan.send({ embeds: [getStatsEmbed()] });
            db.config.statsMessageId = statsMsg.id;
            save();

            message.reply("✅ تمت عملية الإعداد بنجاح في الرومات المحددة!");
        } catch (error) {
            message.reply("❌ حدث خطأ، تأكد من صحة أيديهات الرومات في إعدادات Railway.");
            console.error(error);
        }
    }
});

client.on('interactionCreate', async interaction => {
    const userId = interaction.user.id;

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ!", ephemeral: true });
            
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('menu_book').setPlaceholder('اختر الساعة').addOptions(options)
            );
            await interaction.reply({ content: "اختر ساعتك الثابتة:", components: [menu], ephemeral: true });
        }

        if (interaction.customId === 'btn_clear') {
            let found = false;
            for (let h in db.schedule) {
                if (db.schedule[h].owner === userId) {
                    db.schedule[h].owner = null;
                    found = true;
                }
            }
            if (!found) return interaction.reply({ content: "ليس لديك شيفتات!", ephemeral: true });
            save();
            await interaction.update({ embeds: [getScheduleEmbed()] });
        }

        if (interaction.customId === 'check_in') {
            if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[userId].lastLogin) return interaction.reply({ content: "أنت مسجل دخولك بالفعل!", ephemeral: true });
            db.stats[userId].lastLogin = Date.now();
            save();
            await interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح.", ephemeral: true });
        }

        if (interaction.customId === 'check_out') {
            if (!db.stats[userId]?.lastLogin) return interaction.reply({ content: "لم تسجل دخولك أصلاً!", ephemeral: true });
            const minutes = (Date.now() - db.stats[userId].lastLogin) / 60000;
            db.stats[userId].totalMinutes += minutes;
            db.stats[userId].lastLogin = null;
            save();
            await interaction.reply({ content: `✅ تم تسجيل خروجك. أضفت ${minutes.toFixed(1)} دقيقة لرصيدك.`, ephemeral: true });
            updateStatsMessage();
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_book') {
        db.schedule[interaction.values[0]].owner = userId;
        save();
        await interaction.update({ content: `✅ تم حجز ${interaction.values[0]}`, components: [] });
        // تحديث رسالة الجدول الأساسية
        const channel = await client.channels.fetch(CHANNELS.SCHEDULE);
        const msg = await channel.messages.fetch(interaction.message.reference?.messageId || interaction.message.id);
        await msg.edit({ embeds: [getScheduleEmbed()] });
    }
});

client.login(TOKEN);
