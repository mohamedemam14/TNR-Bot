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

// --- الإعدادات ---
const TOKEN = process.env.DISCORD_TOKEN; 
const ATTENDANCE_CHANNEL_ID = process.env.CHANNEL_ATTENDANCE; // روم الأزرار
const LOG_CHANNEL_ID = process.env.CHANNEL_LOGS;       // روم السجل اللي بيكتب فيه البوت

const DATA_FILE = './attendance_db.json';

let db = {
    activeSessions: {} // لتخزين الجلسات الحالية (ID الرسالة ووقت الدخول)
};

// تحميل البيانات
if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) { console.error("خطأ في قراءة قاعدة البيانات"); }
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

client.once('ready', () => console.log(`✅ تم تشغيل البوت: ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const { user, guild, customId } = interaction;

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

    if (customId === 'check_in') {
        // التحقق إذا كان مسجل دخول بالفعل
        if (db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ أنت مسجل دخول بالفعل!", ephemeral: true });
        }

        const startTime = new Date();
        
        // إرسال رسالة في روم السجل
        const logEmbed = new EmbedBuilder()
            .setTitle("📥 تسجيل دخول جديد")
            .setColor("Green")
            .addFields(
                { name: "الموظف", value: `${user}`, inline: true },
                { name: "وقت الدخول", value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`, inline: true },
                { name: "الحالة", value: "🟢 في العمل حالياً" }
            )
            .setTimestamp();

        const logMsg = await logChannel.send({ embeds: [logEmbed] });

        // حفظ الجلسة
        db.activeSessions[user.id] = {
            logMessageId: logMsg.id,
            startTime: startTime.getTime()
        };
        save();

        return interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح. عمل ممتع!", ephemeral: true });
    }

    if (customId === 'check_out') {
        // التحقق إذا كان لديه جلسة نشطة
        if (!db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ لم تقم بتسجيل الدخول بعد!", ephemeral: true });
        }

        const session = db.activeSessions[user.id];
        const endTime = new Date();
        const durationMs = endTime.getTime() - session.startTime;
        
        // حساب المدة (ساعات ودقائق)
        const hours = Math.floor(durationMs / 3600000);
        const minutes = Math.floor((durationMs % 3600000) / 60000);

        try {
            // تعديل الرسالة السابقة في روم السجل
            const oldMsg = await logChannel.messages.fetch(session.logMessageId);
            const editedEmbed = new EmbedBuilder()
                .setTitle("📤 تم تسجيل الخروج")
                .setColor("Red")
                .addFields(
                    { name: "الموظف", value: `${user}`, inline: true },
                    { name: "وقت الدخول", value: `<t:${Math.floor(session.startTime / 1000)}:F>`, inline: false },
                    { name: "وقت الخروج", value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`, inline: false },
                    { name: "مدة العمل", value: `⏱️ ${hours} ساعة و ${minutes} دقيقة` },
                    { name: "الحالة", value: "🔴 انتهى الشفت" }
                )
                .setTimestamp();

            await oldMsg.edit({ embeds: [editedEmbed] });
        } catch (err) {
            console.error("تعذر العثور على رسالة السجل لتعديلها.");
        }

        // مسح الجلسة
        delete db.activeSessions[user.id];
        save();

        return interaction.reply({ content: `✅ تم تسجيل خروجك. مدة العمل: ${hours} س، ${minutes} د.`, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    // أمر الإعداد
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        const attendChan = await client.channels.fetch(ATTENDANCE_CHANNEL_ID);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success).setEmoji('📥'),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger).setEmoji('📤')
        );

        const embed = new EmbedBuilder()
            .setTitle("⏱️ نظام الحضور والانصراف")
            .setDescription("اضغط على الأزرار أدناه لتسجيل وقت بداية ونهاية عملك.")
            .setColor("Blue")
            .setFooter({ text: "سيتم تسجيل البيانات وتحديث السجل تلقائياً" });

        await attendChan.send({ embeds: [embed], components: [row] });
        message.reply("✅ تم إرسال لوحة التحكم بنجاح!");
    }
});

client.login(TOKEN);
