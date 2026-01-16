نبتتبتبتبتتبconst { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// --- الإعدادات (تأكد من مطابقة الأسماء في ملف .env) ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNELS = {
    ATTENDANCE: process.env.CHANNEL_ATTENDANCE, 
    LOGS: process.env.CHANNEL_LOGS,             
    STATS: process.env.CHANNEL_STATS            
};

const DATA_FILE = './hospital_data.json';

let db = {
    activeSessions: {}, 
    weeklyStats: {},    
    statsMessageId: null
};

// تحميل البيانات
if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) { console.error("Database error"); }
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// دالة تحديث روم الإحصائيات
async function updateStatsEmbed(guild) {
    try {
        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        if (!statsChan) return;

        let desc = "📊 **إحصائيات ساعات موظفي الاستقبال (أسبوعي):**\n\n";
        const entries = Object.entries(db.weeklyStats);

        if (entries.length === 0) {
            desc += "لا توجد بيانات مسجلة حالياً.";
        } else {
            for (const [userId, minutes] of entries) {
                const hours = (minutes / 60).toFixed(2);
                desc += `• <@${userId}> : \`${hours}\` ساعة\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("📅 مجموع الساعات التراكمي")
            .setDescription(desc)
            .setColor("#3BA55C")
            .setFooter({ text: "يتم التحديث تلقائياً عند تسجيل الخروج" });

        if (db.statsMessageId) {
            const msg = await statsChan.messages.fetch(db.statsMessageId).catch(() => null);
            if (msg) return await msg.edit({ embeds: [embed] });
        }

        const newMsg = await statsChan.send({ embeds: [embed] });
        db.statsMessageId = newMsg.id;
        save();
    } catch (err) { console.error("Stats update failed:", err); }
}

client.once('ready', () => console.log(`✅ ${client.user.tag} جاهز`));

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const { user, guild, customId } = interaction;
    const logChannel = await guild.channels.fetch(CHANNELS.LOGS);

    if (customId === 'check_in') {
        if (db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ أنت مسجل دخول بالفعل!", ephemeral: true });
        }

        // إرسال السجل بالتنسيق المطلوب (وقت فقط)
        const logContent = `**\nشفت الاستقبال : ${user}\n🟢 تسجيل الدخول : <t:${Math.floor(Date.now() / 1000)}:t>\n🔴 تسجيل الخروج : --:--\nالوقت : جاري العمل...\n**`;
        const logMsg = await logChannel.send(logContent);

        db.activeSessions[user.id] = {
            logMessageId: logMsg.id,
            startTime: Date.now()
        };
        save();

        return interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح.", ephemeral: true });
    }

    if (customId === 'check_out') {
        if (!db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ لم تسجل دخولك بعد!", ephemeral: true });
        }

        const session = db.activeSessions[user.id];
        const endTime = Date.now();
        const durationMs = endTime - session.startTime;
        const durationMins = durationMs / 60000;

        // حساب الساعات والدقائق للمدة المقضاة
        const h = Math.floor(durationMins / 60);
        const m = Math.floor(durationMins % 60);

        // تحديث الإحصائيات
        db.weeklyStats[user.id] = (db.weeklyStats[user.id] || 0) + durationMins;

        try {
            const oldMsg = await logChannel.messages.fetch(session.logMessageId);
            const updatedContent = `**\nشفت الاستقبال : ${user}\n🟢 تسجيل الدخول : <t:${Math.floor(session.startTime / 1000)}:t>\n🔴 تسجيل الخروج : <t:${Math.floor(endTime / 1000)}:t>\nالوقت : ${h} ساعة و ${m} دقيقة\n**`;
            await oldMsg.edit(updatedContent);
        } catch (e) { console.error("Log edit failed"); }

        delete db.activeSessions[user.id];
        save();

        await updateStatsEmbed(guild);
        return interaction.reply({ content: `✅ تم تسجيل الخروج. المدة: ${h}س و ${m}د`, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        try {
            const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger)
            );

            await attendChan.send({ 
                embeds: [new EmbedBuilder().setTitle("🏥 نظام حضور الاستقبال").setDescription("اضغط على الأزرار أدناه لتسجيل شفتك").setColor("Blue")], 
                components: [row] 
            });

            await updateStatsEmbed(message.guild);
            message.reply("✅ تم الإعداد بنجاح.");
        } catch (err) { message.reply("❌ حدث خطأ، تأكد من الـ IDs في ملف الـ env"); }
    }
});

client.login(TOKEN);
