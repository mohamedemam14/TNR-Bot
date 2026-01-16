const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// --- الإعدادات (تأكد من وضع الـ IDs في ملف .env) ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNELS = {
    ATTENDANCE: process.env.CHANNEL_ATTENDANCE, // روم الأزرار
    LOGS: process.env.CHANNEL_LOGS,             // روم السجل (نصوص)
    STATS: process.env.CHANNEL_STATS            // روم إحصائيات الساعات
};

const DATA_FILE = './reception_db.json';

let db = {
    activeSessions: {}, // الجلسات الحالية
    weeklyStats: {},    // مجموع الساعات التراكمي
    statsMessageId: null
};

// تحميل البيانات
if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) { console.error("Database error"); }
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// دالة لتحديث رسالة الإحصائيات
async function updateStatsEmbed(guild) {
    try {
        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        if (!statsChan) return;

        let description = "📊 **إحصائيات ساعات عمل موظفي الاستقبال:**\n\n";
        const entries = Object.entries(db.weeklyStats);

        if (entries.length === 0) {
            description += "لا توجد بيانات مسجلة لهذا الأسبوع.";
        } else {
            for (const [userId, minutes] of entries) {
                const hours = (minutes / 60).toFixed(2);
                description += `• <@${userId}>: \`${hours}\` ساعة\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("📅 الحصاد الأسبوعي للساعات")
            .setDescription(description)
            .setColor("#3BA55C")
            .setTimestamp();

        if (db.statsMessageId) {
            const msg = await statsChan.messages.fetch(db.statsMessageId).catch(() => null);
            if (msg) return await msg.edit({ embeds: [embed] });
        }

        const newMsg = await statsChan.send({ embeds: [embed] });
        db.statsMessageId = newMsg.id;
        save();
    } catch (err) { console.error("Stats update failed:", err); }
}

client.once('ready', () => console.log(`✅ ${client.user.tag} جاهز للعمل`));

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const { user, guild, customId } = interaction;
    const logChannel = await guild.channels.fetch(CHANNELS.LOGS);

    if (customId === 'check_in') {
        if (db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ أنت مسجل دخول بالفعل!", ephemeral: true });
        }

        // إرسال السجل (وقت فقط :t)
        const logMsg = await logChannel.send(`📥 **دخول استقبل:** ${user} | الوقت: <t:${Math.floor(Date.now() / 1000)}:t> | 🟢 في العمل`);

        db.activeSessions[user.id] = {
            logMessageId: logMsg.id,
            startTime: Date.now()
        };
        save();

        return interaction.reply({ content: "✅ تم تسجيل دخولك.", ephemeral: true });
    }

    if (customId === 'check_out') {
        if (!db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ لم تقم بتسجيل الدخول!", ephemeral: true });
        }

        const session = db.activeSessions[user.id];
        const durationMins = (Date.now() - session.startTime) / 60000;

        // تحديث الإحصائيات الأسبوعية
        db.weeklyStats[user.id] = (db.weeklyStats[user.id] || 0) + durationMins;

        try {
            // تعديل رسالة السجل (وقت فقط :t)
            const oldMsg = await logChannel.messages.fetch(session.logMessageId);
            await oldMsg.edit(`📤 **خروج استقبال:** ${user} | الوقت: <t:${Math.floor(Date.now() / 1000)}:t> | 🔴 انتهى (المدة: \`${durationMins.toFixed(0)}\` دقيقة)`);
        } catch (e) {}

        delete db.activeSessions[user.id];
        save();

        await updateStatsEmbed(guild);
        return interaction.reply({ content: "✅ تم تسجيل خروجك وتحديث ساعاتك.", ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        // لوحة التحكم
        const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger)
        );

        await attendChan.send({ 
            embeds: [new EmbedBuilder().setTitle("🚪 نظام حضور الاستقبال").setDescription("يرجى تسجيل الدخول عند بدء الشفت والخروج عند انتهائه.").setColor("Blue")], 
            components: [row] 
        });

        // إرسال رسالة الإحصائيات لأول مرة
        await updateStatsEmbed(message.guild);
        
        message.reply("✅ تم إعداد النظام بالكامل (اللوحة، السجل، والإحصائيات).");
    }
});

client.login(TOKEN);
