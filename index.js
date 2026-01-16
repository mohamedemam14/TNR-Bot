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

// --- إعدادات البيانات ---
const TOKEN = process.env.DISCORD_TOKEN; 
const CHANNELS = {
    SCHEDULE: process.env.CHANNEL_SCHEDULE,   
    STATS: process.env.CHANNEL_STATS,      
    ATTENDANCE: process.env.CHANNEL_ATTENDANCE
};

const DATA_FILE = '/tmp/hospital_data.json';

let db = {
    schedule: {},
    stats: {},
    config: { statsMessageId: null }
};

if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE));
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
    { name: "🌆 الفترة المسائية المتأخرة", range: [18, 23] }
];

if (Object.keys(db.schedule).length === 0) {
    hours.forEach(h => db.schedule[h] = { owner: null });
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// دالة لجلب اسم الشخص بدلاً من المنشن
async function getDisplayName(userId, guild) {
    if (!userId) return "______";
    try {
        const member = await guild.members.fetch(userId);
        return member ? member.displayName : "Unknown";
    } catch {
        return "User Left";
    }
}

// دالة إنشاء إمبد الجدول المنسق
async function getScheduleEmbed(guild) {
    let description = "⏰ مدة كل شيفت: ساعة واحدة\n━━━━━━━━━━━━━━━\n";

    for (const period of periods) {
        for (let i = period.range[0]; i <= period.range[1]; i++) {
            const hourLabel = hours[i];
            const ownerId = db.schedule[hourLabel].owner;
            const name = await getDisplayName(ownerId, guild);
            
            // إضافة رمز الفترة فقط عند أول ساعة في كل فترة
            const prefix = (i === period.range[0]) ? period.name : " ".repeat(4);
            description += `${prefix} ${hourLabel} | Dr ${name}\n`;
        }
    }

    description += "━━━━━━━━━━━━━━━\n📌 سيتم تحديث الجدول بعد اختيار شيفتات إضافية لتغطية العجز الحالي";

    return new EmbedBuilder()
        .setTitle("👥📅 جدول الشيفتات اليومية")
        .setDescription(description)
        .setColor("#5865F2");
}

// دالة إنشاء إمبد الإحصائيات بالأسماء
async function getStatsEmbed(guild) {
    let statsArray = [];
    for (const [id, data] of Object.entries(db.stats)) {
        const name = await getDisplayName(id, guild);
        statsArray.push(`👤 **Dr ${name}**: ${(data.totalMinutes / 60).toFixed(2)} ساعة`);
    }

    return new EmbedBuilder()
        .setTitle("📊 إحصائيات الساعات")
        .setDescription(statsArray.join('\n') || "لا توجد بيانات مسجلة.")
        .setColor("#3BA55C");
}

async function updateGlobalMessages(guild) {
    try {
        // تحديث رسالة الجدول
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedMsgs = await schedChan.messages.fetch({ limit: 10 });
        const schedMsg = schedMsgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("جدول"));
        if (schedMsg) await schedMsg.edit({ embeds: [await getScheduleEmbed(guild)] });

        // تحديث رسالة الإحصائيات
        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        if (db.config.statsMessageId) {
            const msg = await statsChan.messages.fetch(db.config.statsMessageId);
            await msg.edit({ embeds: [await getStatsEmbed(guild)] });
        }
    } catch (e) { console.error("خطأ في تحديث الرسائل:", e.message); }
}

client.once('ready', () => {
    console.log(`✅ البوت متصل: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        try {
            const guild = message.guild;

            // 1. الجدول
            const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
            const schedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شيفت').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجزك').setStyle(ButtonStyle.Danger)
            );
            await schedChan.send({ embeds: [await getScheduleEmbed(guild)], components: [schedRow] });

            // 2. الحضور
            const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
            const attendRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Secondary)
            );
            await attendChan.send({ 
                embeds: [new EmbedBuilder().setTitle("⏱️ تسجيل الحضور").setDescription("سجل دخولك عند البدء وخروجك عند الانتهاء لحساب الساعات.").setColor("Grey")],
                components: [attendRow] 
            });

            // 3. الإحصائيات
            const statsChan = await client.channels.fetch(CHANNELS.STATS);
            const statsMsg = await statsChan.send({ embeds: [await getStatsEmbed(guild)] });
            db.config.statsMessageId = statsMsg.id;
            save();

            message.reply("✅ تمت عملية الإعداد بنجاح!");
        } catch (error) {
            message.reply("❌ حدث خطأ في الإعداد.");
            console.error(error);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const userId = interaction.user.id;
    const guild = interaction.guild;

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ!", ephemeral: true });
            
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('menu_book').setPlaceholder('اختر الساعة').addOptions(options.slice(0, 25))
            );
            await interaction.reply({ content: "اختر ساعتك:", components: [menu], ephemeral: true });
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
            await interaction.reply({ content: "✅ تم إلغاء حجزك.", ephemeral: true });
            await updateGlobalMessages(guild);
        }

        if (interaction.customId === 'check_in') {
            if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[userId].lastLogin) return interaction.reply({ content: "أنت مسجل دخول بالفعل!", ephemeral: true });
            db.stats[userId].lastLogin = Date.now();
            save();
            await interaction.reply({ content: "✅ تم تسجيل دخولك.", ephemeral: true });
        }

        if (interaction.customId === 'check_out') {
            if (!db.stats[userId]?.lastLogin) return interaction.reply({ content: "لم تسجل دخولك أصلاً!", ephemeral: true });
            const minutes = (Date.now() - db.stats[userId].lastLogin) / 60000;
            db.stats[userId].totalMinutes += minutes;
            db.stats[userId].lastLogin = null;
            save();
            await interaction.reply({ content: `✅ تم الخروج. أضفت ${minutes.toFixed(1)} دقيقة.`, ephemeral: true });
            await updateGlobalMessages(guild);
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_book') {
        db.schedule[interaction.values[0]].owner = userId;
        save();
        await interaction.update({ content: `✅ تم حجز ${interaction.values[0]}`, components: [] });
        await updateGlobalMessages(guild);
    }
});

client.login(TOKEN);
