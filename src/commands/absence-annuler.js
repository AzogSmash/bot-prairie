const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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

    const { data, error } = await supabase
      .from('absences')
      .select('*')
      .eq('discord_id', discordId)
      .eq('active', true)
      .gte('date_fin', today)
      .order('date_debut', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      return interaction.editReply({
        content: `❌ **${username}** n'a aucune absence active à annuler.`
      });
    }

    await supabase
      .from('absences')
      .update({ active: false })
      .eq('id', data.id);

    const debutFormate = new Date(data.date_debut).toLocaleDateString('fr-FR');
    const finFormate = new Date(data.date_fin).toLocaleDateString('fr-FR');

    await interaction.editReply({
      content: `✅ Absence de **${username}** du **${debutFormate}** au **${finFormate}** annulée.`
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
};