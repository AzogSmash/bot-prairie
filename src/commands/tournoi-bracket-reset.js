const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi-bracket-reset')
    .setDescription('Réinitialise tous les résultats du tournoi en cours (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .in('status', ['open', 'started'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

    await interaction.editReply({
      content: `⚠️ Vous êtes sur le point de reset tous les résultats du tournoi **${tournament.name}** ainsi que l'image du bracket.\n\nÊtes-vous sûr de vouloir continuer ?`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bracket_reset_confirm_${tournament.id}`)
          .setLabel('✅ Confirmer')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('bracket_reset_cancel')
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Secondary),
      )],
    });
  },

  async handleButton(interaction) {
    if (interaction.customId === 'bracket_reset_cancel') {
      await interaction.update({ content: '❌ Réinitialisation annulée.', components: [] });
      return;
    }

    if (interaction.customId.startsWith('bracket_reset_confirm_')) {
      await interaction.deferUpdate();
      const tournamentId = interaction.customId.split('_')[3];

    // Remet tous les matchs à leur état initial
    await supabase
      .from('tournament_matches')
      .update({ winner_id: null, status: 'pending' })
      .eq('tournament_id', tournamentId);

    // Remet les team_id null sur les matchs des rounds > 1
    await supabase
      .from('tournament_matches')
      .update({ team1_id: null, team2_id: null })
      .eq('tournament_id', tournamentId)
      .gt('round', 1)
      .neq('side', 'final');

    // Remet la grande finale à null
    await supabase
      .from('tournament_matches')
      .update({ team1_id: null, team2_id: null })
      .eq('tournament_id', tournamentId)
      .eq('side', 'final');

      // Remet les scores des pronos à 0
      await supabase
        .from('tournament_predictions')
        .update({ score: 0, left_correct: false, right_correct: false, final_correct: false })
        .eq('tournament_id', tournamentId);

      const { data: tournament } = await supabase
        .from('tournaments').select('*').eq('id', tournamentId).single();


      await interaction.editReply({ content: `✅ Tournoi **${tournament.name}** réinitialisé avec succès.`, components: [] });
    }
  },
};