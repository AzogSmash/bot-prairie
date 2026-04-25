// src/commands/tournoi-bracket-refresh.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { sendOrUpdateBracketImage } = require('../modules/tournoiParticipants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi-bracket-refresh')
    .setDescription('Régénère l\'image du bracket (staff only)')
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

    await sendOrUpdateBracketImage(interaction.client, tournament);
    await interaction.editReply({ content: '✅ Image du bracket régénérée.' });
  }
};