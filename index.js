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
const LOG_CHANNEL_ID = process.env.CHANNEL_LOGS;       // روم السجل (رسائل نصية)

const DATA_FILE = './attendance_db.json';

let db = {
    activeSessions: {} // لتخزين ID الرسالة ووقت الدخول
};

// تحميل البيانات المحلية
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
        if (db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ أنت مسجل دخول بالفعل!", ephemeral: true });
        }

        const startTime = Math.floor(Date.now() / 1000);
        
        // إرسال رسالة نصية عادية في روم السجل
        const logContent = `📥 **تسجيل دخول**\n• الموظف: ${user}\n• الوقت: <t:${startTime}:F>\n• الحالة: 🟢 في العمل حالياً`;
        
        const logMsg = await logChannel.send(logContent);

        // حفظ الجلسة
        db.activeSessions[user.id] = {
            logMessageId: logMsg.id,
            startTime: Date.now()
        };
        save();

        return interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح.", ephemeral: true });
    }

    if (customId === 'check_out') {
        if (!db.activeSessions[user.id]) {
            return interaction.reply({ content: "⚠️ لم تقم بتسجيل الدخول بعد!", ephemeral: true });
        }

        const session = db.activeSessions[user.id];
        const endTime = Date.now();
        const durationMs = endTime - session.startTime;
        
        // حساب المدة
        const hours = Math.floor(durationMs / 3600000);
        const minutes = Math.floor((durationMs % 3600000) / 60000);

        try {
            // تعديل الرسالة النصية السابقة في روم السجل
            const oldMsg = await logChannel.messages.fetch(session.logMessageId);
            const updatedContent = `📤 **تم تسجيل الخروج**\n• الموظف: ${user}\n• وقت الدخول: <t:${Math.floor(session.startTime / 1000)}:F>\n• وقت الخروج: <t:${Math.floor(endTime / 1000)}:F>\n• مدة العمل: ⏱️ ${hours} ساعة و ${minutes} دقيقة\n• الحالة: 🔴 انتهى الشفت`;
            
            await oldMsg.edit(updatedContent);
        } catch (err) {
            console.error("تعذر العثور على الرسالة لتعديلها.");
        }

        // مسح الجلسة من الذاكرة
        delete db.activeSessions[user.id];
        save();

        return interaction.reply({ content: `✅ تم تسجيل خروجك. (المدة: ${hours} س، ${minutes} د)`, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    // أمر الإعداد (للإدارة فقط)
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        try {
            const attendChan = await client.channels.fetch(ATTENDANCE_CHANNEL_ID);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success).setEmoji('📥'),
                new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger).setEmoji('📤')
            );

            const embed = new EmbedBuilder()
                .setTitle("⏱️ نظام تسجيل الحضور")
                .setDescription("استخدم الأزرار أدناه لتوثيق بداية ونهاية ساعات عملك.")
                .setColor("#2f3136");

            await attendChan.send({ embeds: [embed], components: [row] });
            message.reply("✅ تم إعداد القناة بنجاح.");
        } catch (e) {
            message.reply("❌ تأكد من وضع ID القنوات الصحيح في ملف الـ env.");
        }
    }
});

client.login(TOKEN);
