const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { supabase } = require('../lib/supabase');
const { DateTime } = require('luxon');

const MONTH_NAMES = [
  'janvier','février','mars','avril','mai','juin',
  'juillet','août','septembre','octobre','novembre','décembre',
];

function daysUntil(day, month) {
  const now  = DateTime.now().setZone('Europe/Paris').startOf('day');
  let next   = DateTime.fromObject({ year: now.year, month, day }, { zone: 'Europe/Paris' });
  if (next < now) next = next.plus({ years: 1 });
  return Math.round(next.diff(now, 'days').days);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anniversaires')
    .setDescription('Consulte les anniversaires du serveur'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const now = DateTime.now().setZone('Europe/Paris');
    let view       = 'prochains'; // 'prochains' | 'mois'
    let monthIndex = now.month - 1;

    await interaction.guild.members.fetch({ limit: 1000 }).catch(() => {});

    async function buildProchainsEmbed() {
      const { data } = await supabase
        .from('birthdays')
        .select('discord_id, discord_username, day, month, year');

      const currentYear = now.year;
      const entries = (data || [])
        .map(bday => {
          const days   = daysUntil(bday.day, bday.month);
          const member = interaction.guild.members.cache.get(bday.discord_id);
          const name   = member?.displayName ?? bday.discord_username;
          let ageAtBirthday = null;
          if (bday.year) {
            const thisYearBday = DateTime.fromObject({ year: currentYear, month: bday.month, day: bday.day }, { zone: 'Europe/Paris' });
            ageAtBirthday = thisYearBday >= now.startOf('day')
              ? currentYear - bday.year
              : currentYear + 1 - bday.year;
          }
          return { name, days, day: bday.day, month: bday.month, age: ageAtBirthday };
        })
        .sort((a, b) => a.days - b.days)
        .slice(0, 10);

      const lines = entries.map(e => {
        const dateStr = `${e.day} ${MONTH_NAMES[e.month - 1]}`;
        const ageStr  = e.age != null ? ` (${e.age} ans)` : '';
        if (e.days === 0) return `🎂 **${e.name}** : Aujourd'hui !${ageStr} 🎉`;
        if (e.days === 1) return `🎈 **${e.name}** : Demain — ${dateStr}${ageStr}`;
        return `🎁 **${e.name}** : ${dateStr}${ageStr} *(dans ${e.days} jours)*`;
      });

      return new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎂 Prochains anniversaires')
        .setDescription(lines.length ? lines.join('\n') : '*Aucun anniversaire enregistré.*')
        .setFooter({ text: 'Prairie Brawl Stars • Anniversaires' });
    }

    async function buildMoisEmbed(mIdx) {
      const month = mIdx + 1;
      const { data } = await supabase
        .from('birthdays')
        .select('discord_id, discord_username, day, year')
        .eq('month', month)
        .order('day', { ascending: true });

      const lines = [];
      for (const bday of (data || [])) {
        const member = interaction.guild.members.cache.get(bday.discord_id);
        const name   = member?.displayName ?? bday.discord_username;
        const isToday = mIdx === now.month - 1 && bday.day === now.day;
        const ageStr  = bday.year ? ` (${now.year - bday.year} ans)` : '';
        lines.push(`**${bday.day}** — ${name}${ageStr}${isToday ? ' 🎂' : ''}`);
      }

      return new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle(`🎂 Anniversaires — ${MONTH_NAMES[mIdx]}`)
        .setDescription(lines.length ? lines.join('\n') : '*Aucun anniversaire ce mois-ci.*')
        .setFooter({ text: 'Prairie Brawl Stars • Anniversaires' });
    }

    function buildRow() {
      if (view === 'prochains') {
        const prev = (monthIndex + 11) % 12;
        const next = (monthIndex + 1) % 12;
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('bdays_by_month').setLabel('Par mois').setStyle(ButtonStyle.Primary),
        );
      }
      const prev = (monthIndex + 11) % 12;
      const next = (monthIndex + 1) % 12;
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bdays_prochains').setLabel('Prochains').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bdays_prev').setLabel(`◀ ${MONTH_NAMES[prev]}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bdays_next').setLabel(`${MONTH_NAMES[next]} ▶`).setStyle(ButtonStyle.Secondary),
      );
    }

    const embed = await buildProchainsEmbed();
    const msg   = await interaction.editReply({ embeds: [embed], components: [buildRow()] });

    const collector = msg.createMessageComponentCollector({
      filter: i => ['bdays_prochains','bdays_by_month','bdays_prev','bdays_next'].includes(i.customId) && i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async i => {
      await i.deferUpdate();

      if (i.customId === 'bdays_prochains') {
        view = 'prochains';
        const e = await buildProchainsEmbed();
        await i.editReply({ embeds: [e], components: [buildRow()] });
      } else if (i.customId === 'bdays_by_month') {
        view = 'mois';
        monthIndex = now.month - 1;
        const e = await buildMoisEmbed(monthIndex);
        await i.editReply({ embeds: [e], components: [buildRow()] });
      } else if (i.customId === 'bdays_prev') {
        monthIndex = (monthIndex + 11) % 12;
        const e = await buildMoisEmbed(monthIndex);
        await i.editReply({ embeds: [e], components: [buildRow()] });
      } else if (i.customId === 'bdays_next') {
        monthIndex = (monthIndex + 1) % 12;
        const e = await buildMoisEmbed(monthIndex);
        await i.editReply({ embeds: [e], components: [buildRow()] });
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
