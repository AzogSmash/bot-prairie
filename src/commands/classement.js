const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Affiche le classement interne Prairie 🏆'),

  async execute(interaction) {
    await interaction.deferReply();

    // Récupère le top 10 depuis Supabase
    const { data, error } = await supabase
      .from('members')
      .select('discord_id, discord_username, brawlstars_trophies, club_name, brawlstars_tag')
      .not('brawlstars_trophies', 'is', null)
      .order('brawlstars_trophies', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      return interaction.editReply({
        content: '❌ Aucun membre lié pour l\'instant. Utilisez `/lier` pour apparaître dans le classement !'
      });
    }

    // Médailles pour le podium
    const medals = ['👑', '🥈', '🥉'];

    // Construit le classement
    const lines = data.map((member, index) => {
      const medal = medals[index] || `**#${index + 1}**`;
      const trophies = member.brawlstars_trophies?.toLocaleString('fr-FR') || '?';
      const club = member.club_name || 'Sans club';
      const name = member.discord_username || 'Inconnu';
      return `${medal} **${name}** — 🏆 ${trophies} • 🌿 ${club}`;
    });

    // Rang de l'utilisateur qui a lancé la commande
    const { data: allMembers } = await supabase
      .from('members')
      .select('discord_id')
      .not('brawlstars_trophies', 'is', null)
      .order('brawlstars_trophies', { ascending: false });

    const userRank = allMembers
      ? allMembers.findIndex(m => m.discord_id === interaction.user.id) + 1
      : null;

    const totalMembers = allMembers?.length || 0;

    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle('🏆 Classement Prairie')
      .setDescription(lines.join('\n'))
      .addFields({
        name: '📊 Ton rang',
        value: userRank
          ? `Tu es **#${userRank}** sur ${totalMembers} membres liés`
          : 'Tu n\'apparais pas encore — utilise `/lier` !',
        inline: false
      })
      .setFooter({ text: `Prairie Brawl Stars • ${totalMembers} membres liés` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};