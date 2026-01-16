const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// --- المتغيرات الأساسية ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNELS = {
    SCHEDULE: process.env.CHANNEL_SCHEDULE,   
    STATS: process.env.CHANNEL_STATS,      
    ATTENDANCE: process.env.CHANNEL_ATTENDANCE
};

const DATA_FILE = './hospital_db.json'; // تم تغيير المسار لضمان الحفظ المحلي

let db = {
    schedule: {},
    stats: {},
    config: { statsMessageId: null, lastMentionId: {} }
};

// تحميل البيانات
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE);
        db = JSON.parse(rawData);
    } catch (e) { console.error("Database error"); }
}

const hours = [
    "12:00ص – 1:00ص", "1:00ص – 2:00ص", "2:00ص – 3:00ص", "3:00ص – 4:00ص",
    "4:00ص – 5:00ص", "5:00ص – 6:00ص", "6:00ص – 7:00ص", "7:00ص – 8:00ص",
    "8:00ص – 9:00ص", "9:00ص – 10:00ص", "10:00ص – 11:00ص", "11:00ص – 12:00م",
    "12:00م – 1:00م", "1:00م – 2:00م", "2:00م – 3:00م", "3:00م – 4:00م",
    "4:00م – 5:00م", "5:00م – 6:00م", "6:00م – 7:00م", "7:00م – 8:00م",
    "8:00م – 9:00م", "9:00م – 10:00م", "10:00م – 11:00م", "11:00م – 12:00ص"
];

const periods = [
    { name: "🌙 الفترة الليلية", range: [0, 5] },
    { name: "☀️ الفترة الصباحية", range: [6, 11] },
    { name: "🌤 الفترة المسائية", range: [12, 17] },
    { name: "🌆 المسائية المتأخرة", range: [18, 23] }
];

// التأكد من تهيئة الساعات
hours.forEach(h => { if (!db.schedule[h]) db.schedule[h] = { owner: null }; });

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

async function fetchName(userId, guild) {
    if (!userId) return "______";
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        return member ? member.displayName : "عضو غادر";
    } catch { return "Unknown"; }
}

// إنشاء الإيمبد مع عنوان ثابت للتعرف عليه لاحقاً
async function createScheduleEmbed(guild) {
    let desc = "⏰ مدة كل شيفت: **ساعة واحدة**\n";
    desc += "━━━━━━━━━━━━━━━\n";

    for (const period of periods) {
        desc += `\n**${period.name}**\n`;
        for (let i = period.range[0]; i <= period.range[1]; i++) {
            const hour = hours[i];
            const ownerId = db.schedule[hour].owner;
            const name = await fetchName(ownerId, guild);
            const emoji = ownerId ? "✅" : "⚪";
            desc += `${emoji} \`${hour}\` | **${name}**\n`;
        }
    }
    desc += "\n━━━━━━━━━━━━━━━\n📌 التحديث يتم تلقائياً فور الحجز.";

    return new EmbedBuilder()
        .setTitle("📅 جدول توزيع الشفتات الرسمي")
        .setAuthor({ name: "نظام إدارة المستشفى", iconURL: guild.iconURL() })
        .setDescription(desc)
        .setColor("#2b2d31")
        .setFooter({ text: "آخر تحديث" })
        .setTimestamp();
}

async function forceUpdate(guild) {
    save();
    try {
        // 1. تحديث جدول الشفتات
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedMsgs = await schedChan.messages.fetch({ limit: 20 });
        const targetMsg = schedMsgs.find(m => 
            m.author.id === client.user.id && 
            m.embeds[0]?.data?.title === "📅 جدول توزيع الشفتات الرسمي"
        );
        
        if (targetMsg) {
            const newEmbed = await createScheduleEmbed(guild);
            await targetMsg.edit({ embeds: [newEmbed] });
        }

        // 2. تحديث الإحصائيات
        if (db.config.statsMessageId) {
            const statsChan = await client.channels.fetch(CHANNELS.STATS);
            const statsMsg = await statsChan.messages.fetch(db.config.statsMessageId).catch(() => null);
            if (statsMsg) {
                let statsLines = [];
                for (const [id, data] of Object.entries(db.stats)) {
                    const name = await fetchName(id, guild);
                    statsLines.push(`• **${name}**: \`${(data.totalMinutes / 60).toFixed(2)}\` ساعة`);
                }
                const statsEmbed = new EmbedBuilder()
                    .setTitle("📊 إحصائيات الساعات المسجلة")
                    .setDescription(statsLines.join('\n') || "لا توجد بيانات حالياً")
                    .setColor("#3BA55C")
                    .setTimestamp();
                await statsMsg.edit({ embeds: [statsEmbed] });
            }
        }
    } catch (err) { console.error("Update failed:", err.message); }
}

client.once('ready', () => console.log(`✅ ${client.user.tag} is online`));

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const { user, guild, customId } = interaction;

    if (interaction.isButton()) {
        if (customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ اليوم!", ephemeral: true });
            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('menu_book')
                    .setPlaceholder('اختر وقت الشيفت الذي تريده')
                    .addOptions(options.slice(0, 25))
            );
            return interaction.reply({ content: "يرجى اختيار الساعة المناسبة:", components: [row], ephemeral: true });
        }

        if (customId === 'check_in') {
            if (!db.stats[user.id]) db.stats[user.id] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[user.id].lastLogin) return interaction.reply({ content: "أنت مسجل دخول بالفعل!", ephemeral: true });
            
            db.stats[user.id].lastLogin = Date.now();
            save();
            return interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح. عمل ممتع!", ephemeral: true });
        }

        if (customId === 'check_out') {
            if (!db.stats[user.id]?.lastLogin) return interaction.reply({ content: "لم تقم بتسجيل الدخول بعد!", ephemeral: true });
            const mins = (Date.now() - db.stats[user.id].lastLogin) / 60000;
            db.stats[user.id].totalMinutes += mins;
            db.stats[user.id].lastLogin = null;
            await forceUpdate(guild);
            return interaction.reply({ content: `✅ تم تسجيل الخروج. الوقت المضاف: \`${mins.toFixed(1)}\` دقيقة.`, ephemeral: true });
        }

        if (customId === 'btn_clear') {
            let cleared = false;
            for (let h in db.schedule) { 
                if (db.schedule[h].owner === user.id) {
                    db.schedule[h].owner = null;
                    cleared = true;
                }
            }
            if (!cleared) return interaction.reply({ content: "ليس لديك أي حجز لإلغائه.", ephemeral: true });
            await forceUpdate(guild);
            return interaction.reply({ content: "✅ تم إلغاء جميع حجوزاتك بنجاح.", ephemeral: true });
        }
        
        if (customId === 'btn_swap') {
            const row = new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId('menu_swap').setPlaceholder('اختر الشخص المراد التبديل معه')
            );
            return interaction.reply({ content: "اختر الزميل للتبديل معه (يجب أن يمتلك كلاهما شفتات):", components: [row], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && customId === 'menu_book') {
        const selected = interaction.values[0];
        db.schedule[selected].owner = user.id;
        
        await forceUpdate(guild);
        return interaction.update({ content: `✅ تم حجز ساعة **${selected}** بإسمك.`, components: [] });
    }

    if (interaction.isUserSelectMenu() && customId === 'menu_swap') {
        const targetId = interaction.values[0];
        let myShifts = Object.keys(db.schedule).filter(h => db.schedule[h].owner === user.id);
        let trgShifts = Object.keys(db.schedule).filter(h => db.schedule[h].owner === targetId);

        if (!myShifts.length || !trgShifts.length) {
            return interaction.reply({ content: "يجب أن يمتلك كلا الطرفين شفتات محجوزة لإتمام التبديل!", ephemeral: true });
        }

        myShifts.forEach(h => db.schedule[h].owner = targetId);
        trgShifts.forEach(h => db.schedule[h].owner = user.id);
        
        await forceUpdate(guild);
        return interaction.reply({ content: `✅ تمت عملية التبديل بينك وبين <@${targetId}> بنجاح.`, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        try {
            // إعداد قناة الجدول
            const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
            const schedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شفت').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_swap').setLabel('تبديل شفت').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجزك').setStyle(ButtonStyle.Danger)
            );
            await schedChan.send({ embeds: [await createScheduleEmbed(message.guild)], components: [schedRow] });

            // إعداد قناة الحضور
            const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            const attendRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول (On Duty)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج (Off Duty)').setStyle(ButtonStyle.Danger)
            );
            await attendChan.send({ 
                embeds: [new EmbedBuilder().setTitle("⏱️ نظام تسجيل الحضور والغياب").setDescription("يرجى الضغط على الأزرار أدناه لبدء وإنهاء وقت العمل لحساب الإحصائيات.").setColor("#5865F2")], 
                components: [attendRow] 
            });

            // إعداد قناة الإحصائيات
            const statsChan = await client.channels.fetch(CHANNELS.STATS);
            const sMsg = await statsChan.send({ embeds: [new EmbedBuilder().setTitle("📊 إحصائيات الساعات").setDescription("بانتظار تسجيل البيانات...").setColor("#3BA55C")] });
            db.config.statsMessageId = sMsg.id;
            
            save();
            message.reply("✅ تم إعداد جميع القنوات بنجاح!");
        } catch (e) {
            console.error(e);
            message.reply("❌ حدث خطأ أثناء الإعداد. تأكد من صحة الـ IDs في ملف الـ env.");
        }
    }
});

// نظام التنبيه الذكي (كل دقيقة)
setInterval(async () => {
    const now = new Date();
    const curH = hours[now.getHours()];
    const ownerId = db.schedule[curH]?.owner;
    
    if (ownerId && (!db.stats[ownerId] || !db.stats[ownerId].lastLogin)) {
        try {
            const chan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            if (!db.config.lastMentionId[curH]) {
                const m = await chan.send(`⚠️ تنبيه: <@${ownerId}>، بدأ وقت شيفتك الآن (**${curH}**) ولم تسجل دخولك بعد!`);
                db.config.lastMentionId[curH] = m.id;
                save();
            }
        } catch (e) {}
    }
}, 60000);

client.login(TOKEN);
