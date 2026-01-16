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

const DATA_FILE = '/tmp/hospital_db.json';

let db = {
    schedule: {},
    stats: {},
    config: { statsMessageId: null, lastMentionId: {} }
};

// تحميل البيانات مع معالجة الأخطاء
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE);
        db = JSON.parse(rawData);
    } catch (e) { console.error("Database initialization error"); }
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

// التأكد من وجود الساعات في الـ DB
hours.forEach(h => { if (!db.schedule[h]) db.schedule[h] = { owner: null }; });

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// دالة جلب الاسم الصافي (بدون Dr)
async function fetchName(userId, guild) {
    if (!userId) return "______";
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        return member ? member.displayName : "Unknown";
    } catch { return "Unknown"; }
}

// دالة إنشاء إمبد الجدول الاحترافي
async function createScheduleEmbed(guild) {
    let desc = "👥 **جدول الشيفتات اليومية**\n";
    desc += "⏰ مدة كل شيفت: **ساعة واحدة**\n";
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
        .setAuthor({ name: "إدارة تنظيم المواعيد", iconURL: guild.iconURL() })
        .setDescription(desc)
        .setColor("#2b2d31")
        .setTimestamp();
}

// تحديث الرسائل في القنوات
async function forceUpdate(guild) {
    save();
    try {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedMsgs = await schedChan.messages.fetch({ limit: 10 });
        const targetMsg = schedMsgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes(""));
        
        if (targetMsg) {
            const newEmbed = await createScheduleEmbed(guild);
            await targetMsg.edit({ embeds: [newEmbed] });
        }

        // تحديث الإحصائيات
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
                    .setDescription(statsLines.join('\n') || "لا توجد بيانات")
                    .setColor("#3BA55C");
                await statsMsg.edit({ embeds: [statsEmbed] });
            }
        }
    } catch (err) { console.error("Update failed:", err.message); }
}

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const { userId, guild, customId } = interaction;

    if (interaction.isButton()) {
        if (customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ!", ephemeral: true });
            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('menu_book').setPlaceholder('اختر وقت الشيفت').addOptions(options.slice(0, 25))
            );
            return interaction.reply({ content: "اختر الساعة المناسبة لك:", components: [row], ephemeral: true });
        }

        if (customId === 'check_in') {
            if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[userId].lastLogin) return interaction.reply({ content: "أنت مسجل دخول بالفعل!", ephemeral: true });
            
            db.stats[userId].lastLogin = Date.now();
            save();

            const curH = hours[new Date().getHours()];
            if (db.config.lastMentionId[curH]) {
                const chan = await client.channels.fetch(CHANNELS.ATTENDANCE);
                const m = await chan.messages.fetch(db.config.lastMentionId[curH]).catch(() => null);
                if (m) await m.delete();
                delete db.config.lastMentionId[curH];
                save();
            }
            return interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح.", ephemeral: true });
        }

        if (customId === 'check_out') {
            if (!db.stats[userId]?.lastLogin) return interaction.reply({ content: "لم تسجل دخولك!", ephemeral: true });
            const mins = (Date.now() - db.stats[userId].lastLogin) / 60000;
            db.stats[userId].totalMinutes += mins;
            db.stats[userId].lastLogin = null;
            await forceUpdate(guild);
            return interaction.reply({ content: `✅ تم تسجيل خروجك. (+${mins.toFixed(1)} دقيقة)`, ephemeral: true });
        }

        if (customId === 'btn_clear') {
            for (let h in db.schedule) { if (db.schedule[h].owner === userId) db.schedule[h].owner = null; }
            await forceUpdate(guild);
            return interaction.reply({ content: "✅ تم إلغاء حجزك.", ephemeral: true });
        }
        
        if (customId === 'btn_swap') {
            const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('menu_swap').setPlaceholder('اختر الزميل'));
            return interaction.reply({ content: "اختر الشخص المراد التبديل معه:", components: [row], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && customId === 'menu_book') {
        const selected = interaction.values[0];
        db.schedule[selected].owner = userId;
        await interaction.update({ content: `✅ تم حجز ساعة ${selected}`, components: [] });
        await forceUpdate(guild);
    }

    if (interaction.isUserSelectMenu() && customId === 'menu_swap') {
        const target = interaction.values[0];
        let myShifts = Object.keys(db.schedule).filter(h => db.schedule[h].owner === userId);
        let trgShifts = Object.keys(db.schedule).filter(h => db.schedule[h].owner === target);

        if (!myShifts.length || !trgShifts.length) return interaction.reply({ content: "لا يوجد شفتات متبادلة!", ephemeral: true });

        myShifts.forEach(h => db.schedule[h].owner = target);
        trgShifts.forEach(h => db.schedule[h].owner = userId);
        await forceUpdate(guild);
        return interaction.reply({ content: "✅ تم تبديل الشفتات.", ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شفت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_swap').setLabel('تبديل').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
        );
        await schedChan.send({ embeds: [await createScheduleEmbed(message.guild)], components: [schedRow] });

        const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
        const attendRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger)
        );
        await attendChan.send({ embeds: [new EmbedBuilder().setTitle("⏱️ تسجيل الحضور").setDescription("سجل دخولك لمسح التنبيه.")], components: [attendRow] });

        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        const sMsg = await statsChan.send({ embeds: [new EmbedBuilder().setTitle("📊 الإحصائيات").setDescription("بانتظار البيانات")] });
        db.config.statsMessageId = sMsg.id;
        save();
        message.reply("✅ تمت عملية الإعداد!");
    }
});

// نظام التنبيه
setInterval(async () => {
    const now = new Date();
    const curH = hours[now.getHours()];
    const owner = db.schedule[curH]?.owner;
    if (owner && (!db.stats[owner] || !db.stats[owner].lastLogin)) {
        try {
            const chan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            if (!db.config.lastMentionId[curH]) {
                const m = await chan.send(`⚠️ <@${owner}> بدأ شيفتك الآن (${curH})`);
                db.config.lastMentionId[curH] = m.id;
                save();
            }
        } catch (e) {}
    }
}, 60000);

client.login(TOKEN);
