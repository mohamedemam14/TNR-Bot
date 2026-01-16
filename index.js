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

// --- الإعدادات ---
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
    try { db = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (e) { console.error("Error loading DB"); }
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
    { name: "🌙 الفترة الليلية",
     range: [0, 5], color: "#1A1A1A" },
    { name: "☀️ الفترة الصباحية",
     range: [6, 11], color: "#FFAC33" },
    { name: "🌤 الفترة المسائية",
     range: [12, 17], color: "#55ACEE" },
    { name: "🌆 المسائية المتأخرة",
     range: [18, 23], color: "#3B88C3" }
];

if (Object.keys(db.schedule).length === 0) {
    hours.forEach(h => db.schedule[h] = { owner: null });
}

function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

async function getDisplayName(userId, guild) {
    if (!userId) return "🔴 متاح للحجز";
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        return member ? member.displayName : "عضو غادر";
    } catch { return "غير معروف"; }
}

async function getScheduleEmbed(guild) {
    let description = "👥 **جدول الشيفتات اليومية**\n";
    description += "⏰ مدة كل شيفت: **ساعة واحدة**\n";
    description += "━━━━━━━━━━━━━━━━━━\n";

    for (const period of periods) {
        description += `\n**${period.name}**\n`;
        for (let i = period.range[0]; i <= period.range[1]; i++) {
            const hourLabel = hours[i];
            const ownerId = db.schedule[hourLabel].owner;
            const name = await getDisplayName(ownerId, guild);
            const statusEmoji = ownerId ? "👤" : "🟢";
            description += `> ${statusEmoji} \`${hourLabel}\` | **${name}**\n`;
        }
    }

    description += "\n━━━━━━━━━━━━━━━━━━\n";
    description += "📌 *يتم تحديث الجدول تلقائياً عند كل حجز جديد*";

    return new EmbedBuilder()
        .setAuthor({ name: "نظام إدارة الشيفتات", iconURL: guild.iconURL() })
        .setDescription(description)
        .setColor("#2F3136")
        .setFooter({ text: "Hospital Management System" })
        .setTimestamp();
}

async function updateGlobalMessages(guild) {
    try {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedMsgs = await schedChan.messages.fetch({ limit: 20 });
        const schedMsg = schedMsgs.find(m => m.author.id === client.user.id && m.embeds[0]?.description?.includes("جدول"));
        
        if (schedMsg) {
            const newEmbed = await getScheduleEmbed(guild);
            await schedMsg.edit({ embeds: [newEmbed] });
        }

        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        if (db.config.statsMessageId) {
            const sMsg = await statsChan.messages.fetch(db.config.statsMessageId).catch(() => null);
            if (sMsg) {
                let statsText = "";
                for (const [id, data] of Object.entries(db.stats)) {
                    const name = await getDisplayName(id, guild);
                    if (name !== "🔴 متاح للحجز") {
                        statsText += `• **${name}**: \`${(data.totalMinutes / 60).toFixed(2)}\` ساعة\n`;
                    }
                }
                await sMsg.edit({ embeds: [new EmbedBuilder().setTitle("📊 إحصائيات ساعات العمل").setDescription(statsText || "لا توجد بيانات مسجلة").setColor("#3BA55C")] });
            }
        }
    } catch (e) { console.error("Update Error:", e.message); }
}

client.once('ready', () => console.log(`✅ ${client.user.tag} Is Active`));

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const { userId, guild, customId } = interaction;

    if (interaction.isButton()) {
        if (customId === 'btn_book') {
            const options = hours.filter(h => !db.schedule[h].owner).map(h => ({ label: h, value: h }));
            if (options.length === 0) return interaction.reply({ content: "⚠️ جميع الساعات محجوزة!", ephemeral: true });
            
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('menu_book')
                    .setPlaceholder('اختر الساعة التي تريد حجزها...')
                    .addOptions(options.slice(0, 25))
            );
            await interaction.reply({ content: "📅 اختر وقت الشيفت الخاص بك:", components: [menu], ephemeral: true });
        }

        if (customId === 'check_in') {
            if (!db.stats[userId]) db.stats[userId] = { totalMinutes: 0, lastLogin: null };
            if (db.stats[userId].lastLogin) return interaction.reply({ content: "⚠️ أنت مسجل دخول بالفعل!", ephemeral: true });
            
            db.stats[userId].lastLogin = Date.now();
            save();
            
            const currentH = hours[new Date().getHours()];
            if (db.config.lastMentionId[currentH]) {
                const chan = await client.channels.fetch(CHANNELS.ATTENDANCE);
                chan.messages.fetch(db.config.lastMentionId[currentH]).then(m => m.delete()).catch(() => null);
                delete db.config.lastMentionId[currentH];
                save();
            }
            await interaction.reply({ content: "✅ تم تسجيل دخولك بنجاح. بالتوفيق في عملك!", ephemeral: true });
        }

        if (customId === 'check_out') {
            if (!db.stats[userId]?.lastLogin) return interaction.reply({ content: "⚠️ لم تقم بتسجيل الدخول!", ephemeral: true });
            const minutes = (Date.now() - db.stats[userId].lastLogin) / 60000;
            db.stats[userId].totalMinutes += minutes;
            db.stats[userId].lastLogin = null;
            save();
            await interaction.reply({ content: `✅ تم تسجيل الخروج. تمت إضافة \`${minutes.toFixed(1)}\` دقيقة.`, ephemeral: true });
            await updateGlobalMessages(guild);
        }

        if (customId === 'btn_clear') {
            for (let h in db.schedule) { if (db.schedule[h].owner === userId) db.schedule[h].owner = null; }
            save();
            await interaction.reply({ content: "✅ تم إلغاء حجزك بنجاح.", ephemeral: true });
            await updateGlobalMessages(guild);
        }

        if (customId === 'btn_swap') {
            const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('menu_swap_user').setPlaceholder('اختر الزميل للتبديل معه'));
            await interaction.reply({ content: "🔃 اختر الشخص الذي تود مبادلة شفتك معه:", components: [row], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && customId === 'menu_book') {
        const selectedHour = interaction.values[0];
        db.schedule[selectedHour].owner = userId;
        save();
        await interaction.update({ content: `✅ تم حجز الساعة: **${selectedHour}** بنجاح!`, components: [] });
        await updateGlobalMessages(guild);
    }

    if (interaction.isUserSelectMenu() && customId === 'menu_swap_user') {
        const targetId = interaction.values[0];
        let myS = Object.keys(db.schedule).filter(h => db.schedule[h].owner === userId);
        let trgS = Object.keys(db.schedule).filter(h => db.schedule[h].owner === targetId);

        if (!myS.length || !trgS.length) return interaction.reply({ content: "⚠️ يجب أن يكون للطرفين ساعات محجوزة للتبديل!", ephemeral: true });

        myS.forEach(h => db.schedule[h].owner = targetId);
        trgS.forEach(h => db.schedule[h].owner = userId);
        save();
        await interaction.reply({ content: `✅ تم تبديل الشفتات مع <@${targetId}> بنجاح!`, ephemeral: true });
        await updateGlobalMessages(guild);
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!setup' && message.member.permissions.has('Administrator')) {
        const schedChan = await client.channels.fetch(CHANNELS.SCHEDULE);
        const schedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_book').setLabel('حجز شفت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_swap').setLabel('تبديل شفت').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_clear').setLabel('إلغاء حجز').setStyle(ButtonStyle.Danger)
        );
        await schedChan.send({ embeds: [await getScheduleEmbed(message.guild)], components: [schedRow] });

        const attendChan = await client.channels.fetch(CHANNELS.ATTENDANCE);
        const attendRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('check_in').setLabel('تسجيل دخول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('check_out').setLabel('تسجيل خروج').setStyle(ButtonStyle.Danger)
        );
        await attendChan.send({ 
            embeds: [new EmbedBuilder().setTitle("⏱️ نظام الحضور والانصراف").setDescription("سجل دخولك عند بدء الشفت ليتم احتساب الساعات ومسح التنبيه التلقائي.").setColor("#2F3136")],
            components: [attendRow] 
        });

        const statsChan = await client.channels.fetch(CHANNELS.STATS);
        const statsMsg = await statsChan.send({ embeds: [new EmbedBuilder().setTitle("📊 إحصائيات العمل").setDescription("بانتظار البيانات...")] });
        db.config.statsMessageId = statsMsg.id;
        save();
        message.reply("✅ تم إعداد النظام بالكامل بشكل احترافي.");
    }
});

client.login(TOKEN);
