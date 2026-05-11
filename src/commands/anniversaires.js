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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anniversaires')
    .setDescription('Consulte les anniversaires du serveur par mois'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const now = DateTime.now().setZone('Europe/Paris');
    let monthIndex = now.month - 1; // 0-based

    // Pré-charge tous les membres Discord du serveur
    await interaction.guild.members.fetch({ limit: 1000 }).catch(() => {});

    async function buildEmbed(mIdx) {
      const month = mIdx + 1;
      const { data } = await supabase
        .from('birthdays')
        .select('discord_id, discord_username, day')
        .eq('month', month)
        .order('day', { ascending: true });

      const lines = [];
      for (const bday of (data || [])) {
        const member = interaction.guild.members.cache.get(bday.discord_id);
        const displayName = member?.displayName ?? bday.discord_username;
        const isToday = mIdx === now.month - 1 && bday.day === now.day;
        lines.push(`**${bday.day}** — ${displayName}${isToday ? ' 🎂' : ''}`);
      }

      return new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle(`🎂 Anniversaires — ${MONTH_NAMES[mIdx]}`)
        .setDescription(lines.length ? lines.join('\n') : '*Aucun anniversaire ce mois-ci.*')
        .setFooter({ text: `Prairie Brawl Stars • Anniversaires` });
    }

    function buildRow(mIdx) {
      const prev = (mIdx + 11) % 12;
      const next = (mIdx + 1) % 12;
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('bdays_prev')
          .setLabel(`◀ ${MONTH_NAMES[prev]}`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('bdays_next')
          .setLabel(`${MONTH_NAMES[next]} ▶`)
          .setStyle(ButtonStyle.Secondary),
      );
    }

    const embed = await buildEmbed(monthIndex);
    const msg = await interaction.editReply({ embeds: [embed], components: [buildRow(monthIndex)] });

    const collector = msg.createMessageComponentCollector({
      filter: i => ['bdays_prev', 'bdays_next'].includes(i.customId) && i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'bdays_prev') monthIndex = (monthIndex + 11) % 12;
      else monthIndex = (monthIndex + 1) % 12;

      await i.deferUpdate();
      const newEmbed = await buildEmbed(monthIndex);
      await i.editReply({ embeds: [newEmbed], components: [buildRow(monthIndex)] });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
