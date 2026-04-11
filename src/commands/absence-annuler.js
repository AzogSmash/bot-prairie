const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('absence-annuler')
    .setDescription('Annule une absence')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Staff : annuler l\'absence d\'un autre membre')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
    const targetUser = interaction.options.getUser('membre');

    if (targetUser && !isStaff) {
      return interaction.editReply({
        content: '❌ Seul le staff peut annuler l\'absence d\'un autre membre.'
      });
    }

    const discordId = targetUser ? targetUser.id : interaction.user.id;
    const username = targetUser ? targetUser.username : interaction.user.username;
    const today = new Date().toISOString().split('T')[0];

    // Récupère TOUTES les absences actives
    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('discord_id', discordId)
      .eq('active', true)
      .gte('date_fin', today)
      .order('date_debut', { ascending: true });

    if (error || !data || data.length === 0) {
      return interaction.editReply({
        content: `❌ **${username}** n'a aucune absence active à annuler.`
      });
    }

    // Si une seule absence → annule directement
    if (data.length === 1) {
      return annulerAbsence(interaction, data[0], username, isStaff, targetUser);
    }

    // Si plusieurs absences → menu déroulant pour choisir
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`annuler_absence_select_${discordId}`)
      .setPlaceholder('Choisis l\'absence à annuler')
      .addOptions(
        data.map(a => ({
          label: `${new Date(a.date_debut).toLocaleDateString('fr-FR')} → ${new Date(a.date_fin).toLocaleDateString('fr-FR')}`,
          description: a.raison !== 'Non précisée' ? a.raison.slice(0, 50) : 'Aucune raison',
          value: a.id,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.editReply({
      content: `**${username}** a plusieurs absences actives — laquelle annuler ?`,
      components: [row],
    });
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();

    const absenceId = interaction.values[0];
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('id', absenceId)
      .single();

    if (error || !data) {
      return interaction.editReply({ content: '❌ Absence introuvable.', components: [] });
    }

    const username = data.discord_username;
    const targetUser = null;
    await annulerAbsence(interaction, data, username, isStaff, targetUser);
  }
};

async function annulerAbsence(interaction, absence, username, isStaff, targetUser) {
  await supabase
    .from('absences')
    .update({ active: false })
    .eq('id', absence.id);

  const debutFormate = new Date(absence.date_debut).toLocaleDateString('fr-FR');
  const finFormate = new Date(absence.date_fin).toLocaleDateString('fr-FR');

  await interaction.editReply({
    content: `✅ Absence de **${username}** du **${debutFormate}** au **${finFormate}** annulée.`,
    components: [],
  });

  const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
  if (staffChannel) {
    await staffChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('❌ Absence annulée')
          .setDescription(
            `**${username}** — absence du **${debutFormate}** au **${finFormate}** annulée` +
            (isStaff && targetUser ? `\nPar le staff : ${interaction.user}` : '')
          )
          .setTimestamp()
      ]
    });
  }
}