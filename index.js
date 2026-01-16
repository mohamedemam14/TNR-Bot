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

// --- إعدادات البيئة ---
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
    config: { statsMessageId: null, lastMentionId: {} }
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

async function getDisplayName(userId, guild) {
    if (!userId) return "______";
    try {
        const member = await guild.members.fetch(userId);
        return member ? member.displayName : "Unknown";
    } catch { return "Unknown"; }
}

async function getScheduleEmbed(guild) {
    let description = "⏰ مدة كل شيفت: ساعة واحدة\n━━━━━━━━━━━━━━━\n";
    for (const period of periods) {
        for (let i = period.range[0]; i <= period.range[1]; i++) {
            const hourLabel = hours[i];
            const name = await getDisplayName(db.schedule[hourLabel].owner, guild);
            const prefix = (i === period.range[0]) ? period.name : " ".repeat(4);
            description += `${prefix} ${hourLabel} | ${name}\n`;
        }
    }
    description += "━━━━━━━━━━━━━━━\n📌 سيتم تحديث الجدول بعد اختيار شيفتات إضافية لتغطية العجز الحالي";
    return new EmbedBuilder().setTitle("👥📅 جدول الشيفتات اليومية").setDescription(description).setColor("#5865F2");
}

// تحديث الرسائل في القنوات
async function updateGlobalMessages(guild) {
    try {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedMsgs = await schedChan.messages.fetch({ limit: 10 });
        const schedMsg = schedMsgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("جدول"));
        if (schedMsg) await schedMsg.edit({ embeds: [await getScheduleEmbed(guild)] });

        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        if (db.config.statsMessageId) {
            const msg = await statsChan.messages.fetch(db.config.statsMessageId);
            let statsList = [];
            for (const [id, data] of Object.entries(db.stats)) {
                const name = await getDisplayName(id, guild);
                statsList.push(`👤 **${name}**: ${(data.totalMinutes / 60).toFixed(2)} ساعة`);
            }
            await msg.edit({ embeds: [new EmbedBuilder().setTitle("📊 إحصائيات الساعات").setDescription(statsList.join('\n') || "لا توجد بيانات").setColor("#3BA55C")] });
        }
    } catch (e) { console.error("Update Error:", e.message); }
}

// نظام المنشن التلقائي
setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const hourLabel = hours[currentHour];
    const ownerId = db.schedule[hourLabel]?.owner;

    if (ownerId && (!db.stats[ownerId] || !db.stats[ownerId].lastLogin)) {
        try {
            const channel = await client.channels.fetch(CHANNELS.ATTENDANCE);
            if (!db.config.lastMentionId[hourLabel]) {
                const msg = await channel.send(`⚠️ انتباه <@${ownerId}>! بدأ وقت شيفتك الآن (${hourLabel}). سجل دخولك.`);
                db.config.lastMentionId[hourLabel] = msg.id;
                save();
            }
        } catch (e) {}
    }
}, 60000);

client.once('ready', () => console.log(`✅ ${client.user.tag} Online`));

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const { userId, guild, customId } = interaction;

    if (interaction.isButton()) {
        if (customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "الجدول ممتلئ!", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_book').setPlaceholder('اختر الساعة').addOptions(options.slice(0, 25)));
            await interaction.reply({ content: "اختر ساعتك:", components: [menu], ephemeral: true });
        }

        if (customId === 'btn_swap') {
            const userMenu = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('menu_swap_user').setPlaceholder('اختر الزميل'));
            await interaction.reply({ content: "اختر الزميل للتبديل معه لليوم:", components: [userMenu], ephemeral: true });
        }

        if (customId === 'check_in') {
            if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[userId].lastLogin) return interaction.reply({ content: "مسجل بالفعل!", ephemeral: true });
            db.stats[userId].lastLogin = Date.now();
            save();
            const currentHourLabel = hours[new Date().getHours()];
            if (db.config.lastMentionId[currentHourLabel]) {
                try {
                    const chan = await client.channels.fetch(CHANNELS.ATTENDANCE);
                    const m = await chan.messages.fetch(db.config.lastMentionId[currentHourLabel]);
                    await m.delete();
                    delete db.config.lastMentionId[currentHourLabel];
                } catch (e) {}
            }
            await interaction.reply({ content: "✅ تم تسجيل دخولك ومسح التنبيه.", ephemeral: true });
        }

        if (customId === 'check_out') {
            if (!db.stats[userId]?.lastLogin) return interaction.reply({ content: "لم تسجل دخولك!", ephemeral: true });
            const diff = (Date.now() - db.stats[userId].lastLogin) / 60000;
            db.stats[userId].totalMinutes += diff;
            db.stats[userId].lastLogin = null;
            save();
            await interaction.reply({ content: `✅ خروج. أضفت ${diff.toFixed(1)} دقيقة.`, ephemeral: true });
            await updateGlobalMessages(guild);
        }

        if (customId === 'btn_clear') {
            for (let h in db.schedule) if (db.schedule[h].owner === userId) db.schedule[h].owner = null;
            save();
            await interaction.reply({ content: "✅ تم الإلغاء.", ephemeral: true });
            await updateGlobalMessages(guild);
        }
    }

    if (interaction.isStringSelectMenu() && customId === 'menu_book') {
        db.schedule[interaction.values[0]].owner = userId;
        save();
        await interaction.update({ content: `✅ تم الحجز: ${interaction.values[0]}`, components: [] });
        await updateGlobalMessages(guild); // التحديث الفوري للجدول
    }

    if (interaction.isUserSelectMenu() && customId === 'menu_swap_user') {
        const targetId = interaction.values[0];
        let myS = Object.keys(db.schedule).filter(h => db.schedule[h].owner === userId);
        let trgS = Object.keys(db.schedule).filter(h => db.schedule[h].owner === targetId);
        if (!myS.length || !trgS.length) return interaction.reply({ content: "يجب وجود شفتات لكلا الطرفين للتبديل!", ephemeral: true });
        myS.forEach(h => db.schedule[h].owner = targetId);
        trgS.forEach(h => db.schedule[h].owner = userId);
        save();
        await interaction.reply({ content: "✅ تم تبديل الشفتات بنجاح!", ephemeral: true });
        await updateGlobalMessages(guild);
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شفت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_swap').setLabel('تبديل شفت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجز').setStyle(ButtonStyle.Danger)
        );
        await schedChan.send({ embeds: [await getScheduleEmbed(message.guild)], components: [schedRow] });

        const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
        const attendRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Secondary)
        );
        await attendChan.send({ embeds: [new EmbedBuilder().setTitle("⏱️ تسجيل الحضور").setDescription("سجل دخولك عند البدء لإزالة المنشن.")], components: [attendRow] });

        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        const statsMsg = await statsChan.send({ embeds: [new EmbedBuilder().setTitle("📊 إحصائيات الساعات").setDescription("لا توجد بيانات")] });
        db.config.statsMessageId = statsMsg.id;
        save();
        message.reply("✅ تمت عملية الإعداد!");
    }
});

client.login(TOKEN);
