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
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anniversaire')
    .setDescription('Enregistre ou consulte ton anniversaire')
    .addIntegerOption(o =>
      o.setName('jour').setDescription('Jour (1-31)').setMinValue(1).setMaxValue(31).setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('mois').setDescription('Mois (1-12)').setMinValue(1).setMaxValue(12).setRequired(false)
    ),

  async execute(interaction) {
    const day   = interaction.options.getInteger('jour');
    const month = interaction.options.getInteger('mois');

    // ── Vue / suppression ────────────────────────────────────────────────────
    if (day === null && month === null) {
      await interaction.deferReply({ flags: 64 });

      const { data } = await supabase
        .from('birthdays')
        .select('day, month')
        .eq('discord_id', interaction.user.id)
        .maybeSingle();

      if (!data) {
        return interaction.editReply({
          content: "📭 Tu n'as pas encore enregistré ton anniversaire. Utilise `/anniversaire <jour> <mois>` pour le faire !",
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎂 Ton anniversaire')
        .setDescription(`Ton anniversaire est enregistré le **${data.day} ${MONTH_NAMES[data.month - 1]}**.`)
        .setFooter({ text: 'Prairie Brawl Stars • Anniversaires' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('bday_delete')
          .setLabel('Supprimer mon anniversaire')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

      const msg = await interaction.editReply({ embeds: [embed], components: [row] });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.customId === 'bday_delete' && i.user.id === interaction.user.id,
        max:    1,
        time:   60_000,
      });

      collector.on('collect', async i => {
        await supabase.from('birthdays').delete().eq('discord_id', interaction.user.id);
        await i.update({ content: '✅ Ton anniversaire a bien été supprimé.', embeds: [], components: [] });
      });

      collector.on('end', (_, reason) => {
        if (reason !== 'limit') interaction.editReply({ components: [] }).catch(() => {});
      });

      return;
    }

    // ── Enregistrement ───────────────────────────────────────────────────────
    await interaction.deferReply({ flags: 64 });

    if (day === null || month === null) {
      return interaction.editReply({ content: '❌ Tu dois fournir à la fois le **jour** et le **mois**.' });
    }

    if (day > MAX_DAYS[month - 1]) {
      return interaction.editReply({
        content: `❌ Le mois de **${MONTH_NAMES[month - 1]}** ne peut pas avoir **${day}** jours.`,
      });
    }

    const now = DateTime.now().setZone('Europe/Paris');
    const isToday = day === now.day && month === now.month;

    await supabase.from('birthdays').upsert({
      discord_id:       interaction.user.id,
      discord_username: interaction.user.username,
      day,
      month,
      last_wished_year: isToday ? now.year : null,
    }, { onConflict: 'discord_id' });

    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('🎂 Anniversaire enregistré !')
      .setDescription(`Ton anniversaire a été enregistré le **${day} ${MONTH_NAMES[month - 1]}**.\nLe bot te souhaitera bonne fête dans le général à minuit ! 🎉`)
      .setFooter({ text: 'Prairie Brawl Stars • Anniversaires' });

    await interaction.editReply({ embeds: [embed] });
  },
};
