const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');

// Barre de progression visuelle
function progressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

// Paliers de trophées Prairie
function getNextMilestone(trophies) {
  const milestones = [5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000, 150000];
  return milestones.find(m => m > trophies) || null;
}

// Couleur selon trophées
function getTrophyColor(trophies) {
  if (trophies >= 100000) return '#f1c40f'; // Or
  if (trophies >= 75000)  return '#e67e22'; // Orange
  if (trophies >= 50000)  return '#e74c3c'; // Rouge
  if (trophies >= 25000)  return '#9b59b6'; // Violet
  if (trophies >= 10000)  return '#3498db'; // Bleu
  return '#2ecc71';                          // Vert
}

// Rang emoji selon position
function getRankEmoji(rank) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank <= 10) return '🏅';
  return '🌿';
}

async function buildProfileEmbed(target, client) {
  // Récupère les données Supabase
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('discord_id', target.id)
    .single();

  if (error || !data || !data.brawlstars_tag) return null;

  // Stats fraîches depuis l'API BS
  const player = await getPlayer(data.brawlstars_tag);

  // Rang interne Prairie
  const { data: rankData } = await supabase
    .from('members')
    .select('discord_id')
    .not('brawlstars_trophies', 'is', null)
    .order('brawlstars_trophies', { ascending: false });

  const rank = rankData ? rankData.findIndex(m => m.discord_id === target.id) + 1 : null;
  const totalMembers = rankData ? rankData.length : 0;

  // Met à jour Supabase
  await supabase
    .from('members')
    .update({
      brawlstars_trophies: player.trophies,
      club_name: player.club?.name || null,
      last_seen_at: new Date().toISOString(),
    })
    .eq('discord_id', target.id);

  // Progression vers prochain palier
  const nextMilestone = getNextMilestone(player.trophies);
  const prevMilestone = getNextMilestone(player.trophies - 1) 
    ? [5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000].find(m => m < player.trophies) || 0
    : 0;
  const progress = nextMilestone
    ? progressBar(player.trophies - prevMilestone, nextMilestone - prevMilestone)
    : '██████████';

  // Temps sur le serveur
  const joinedAt = data.joined_at
    ? `<t:${Math.floor(new Date(data.joined_at).getTime() / 1000)}:R>`
    : 'Inconnu';

  const rankEmoji = rank ? getRankEmoji(rank) : '🌿';
  const color = getTrophyColor(player.trophies);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${player.name} • ${player.tag}`,
      iconURL: target.displayAvatarURL({ dynamic: true })
    })
    .setTitle(`${rankEmoji} Profil Prairie`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      // Ligne 1 — Identité
      {
        name: '🌿 Club',
        value: player.club?.name || 'Sans club',
        inline: true
      },
      {
        name: '📅 Sur le serveur',
        value: joinedAt,
        inline: true
      },
      {
        name: '🎯 Niveau',
        value: `${player.expLevel}`,
        inline: true
      },

      // Ligne 2 — Trophées
      {
        name: '🏆 Trophées',
        value: `**${player.trophies.toLocaleString('fr-FR')}**`,
        inline: true
      },
      {
        name: '🥇 Record',
        value: `${player.highestTrophies?.toLocaleString('fr-FR') || '?'}`,
        inline: true
      },
      {
        name: `${rankEmoji} Rang Prairie`,
        value: rank ? `**#${rank}** / ${totalMembers}` : 'Non classé',
        inline: true
      },

      // Ligne 3 — Victoires
      {
        name: '⚔️ Victoires 3v3',
        value: player['3vs3Victories']?.toLocaleString('fr-FR') || '?',
        inline: true
      },
      {
        name: '🎯 Victoires Solo',
        value: player.soloVictories?.toLocaleString('fr-FR') || '?',
        inline: true
      },
      {
        name: '💥 Victoires Duo',
        value: player.duoVictories?.toLocaleString('fr-FR') || '?',
        inline: true
      },

      // Ligne 4 — Progression
      {
        name: nextMilestone
          ? `📈 Progression → ${nextMilestone.toLocaleString('fr-FR')} trophées`
          : '📈 Progression',
        value: nextMilestone
          ? `${progress} ${player.trophies.toLocaleString('fr-FR')} / ${nextMilestone.toLocaleString('fr-FR')}`
          : `${progress} Palier max atteint 🎉`,
        inline: false
      },

      // Ligne 5 — Statut Prairie
      {
        name: '📊 Statut Prairie',
        value: data.status === 'nouveau' ? '🆕 Nouveau membre'
          : data.status === 'actif' ? '✅ Membre actif'
          : data.status === 'inactif' ? '⚠️ Inactif'
          : data.status === 'staff' ? '🛡️ Staff Prairie'
          : '✅ Membre actif',
        inline: true
      },
      {
        name: '🏅 Brawlers débloqués',
        value: `${player.brawlers?.length || '?'}`,
        inline: true
      },
      {
        name: '⭐ Brawlers max',
        value: `${player.brawlers?.filter(b => b.power === 11).length || '?'}`,
        inline: true
      },
    )
    .setFooter({ text: `Prairie Brawl Stars • Stats en temps réel • ${totalMembers} membres liés` })
    .setTimestamp();

  return embed;
}

module.exports.buildProfileEmbed = buildProfileEmbed;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Affiche le profil Prairie d\'un membre')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') || interaction.user;

    try {
      const embed = await buildProfileEmbed(target, interaction.client);

      if (!embed) {
        return interaction.editReply({
          content: `❌ **${target.username}** n'a pas encore lié son compte Brawl Stars.\nUtilise \`/lier #TAG\` pour commencer !`
        });
      }

      // Boutons interactifs
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_${target.id}`)
          .setLabel('🔄 Actualiser')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`classement_${target.id}`)
          .setLabel('🏆 Classement Prairie')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error('[Profil]', err);
      await interaction.editReply({ content: '❌ Erreur lors de la récupération du profil.' });
    }
  }
};