const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { CLUB_ROLES, TROPHY_ROLES, getTrophyRole, updateMemberRoles } = require('../jobs/snapshots');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lier')
    .setDescription('Lie ton compte Brawl Stars à ton profil Prairie')
    .addStringOption(option =>
      option.setName('tag')
        .setDescription('Ton tag Brawl Stars (ex: #2ABC123)')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const tag = interaction.options.getString('tag');
    const user = interaction.user;
    const member = interaction.member;

    try {
      const player = await getPlayer(tag);

      const { error } = await supabase
        .from('members')
        .upsert({
          discord_id: user.id,
          discord_tag: user.tag,
          discord_username: member.displayName,
          avatar_url: user.displayAvatarURL(),
          brawlstars_tag: player.tag,
          brawlstars_name: player.name,
          brawlstars_trophies: player.trophies,
          club_name: player.club?.name || null,
          status: 'actif',
        }, { onConflict: 'discord_id' });

      if (error) throw error;

      // Met à jour les rôles
      await updateMemberRoles(member, player.club?.name, player.trophies);

      const trophyTier = getTrophyRole(player.trophies);
      const clubRoleId = player.club?.name && CLUB_ROLES[player.club.name] 
        ? `<@&${CLUB_ROLES[player.club.name]}>` 
        : 'Aucun club Prairie';

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Compte lié avec succès !')
        .setDescription(`Ton compte Brawl Stars est maintenant lié à ton profil Prairie !`)
        .addFields(
          { name: '🎮 Joueur', value: player.name, inline: true },
          { name: '🏆 Trophées', value: player.trophies.toLocaleString('fr-FR'), inline: true },
          { name: '🌿 Club', value: player.club?.name || 'Sans club', inline: true },
        )
        .addFields(
          { name: '🏷️ Rôles attribués', value: `${clubRoleId}\n<@&${trophyTier.roleId}>`, inline: false },
        )
        .setFooter({ text: 'Prairie Brawl Stars' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[Lier]', err);
      await interaction.editReply({
        content: `❌ Tag introuvable ou invalide. Vérifie ton tag et réessaie.\nExemple : \`/lier #2ABC123\``
      });
    }
  },
};