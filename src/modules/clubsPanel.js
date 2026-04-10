const { EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie' },
  { tag: '#2JUVYQ0YV', emoji: '⚡', name: 'Prairie Céleste' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie' },
  { tag: '#C9JUYQQY',  emoji: '🍃', name: 'Prairie Sauvage' },
];

// Stocke les IDs des messages pour les mettre à jour
const messageIds = {};

async function buildClubEmbed(clubData, emoji) {
  const members = clubData.members?.length || 0;
  const maxMembers = 30;
  const places = maxMembers - members;
  const avgTrophies = members
    ? Math.round(clubData.members.reduce((sum, m) => sum + m.trophies, 0) / members)
    : 0;

  const fillBar = '█'.repeat(Math.round((members / maxMembers) * 10)) +
                  '░'.repeat(10 - Math.round((members / maxMembers) * 10));

  const statusText = places === 0
    ? '🔴 **Complet**'
    : `🟢 **${places} place(s) disponible(s)**`;

  // Couleur selon remplissage
  const color = places === 0 ? '#e74c3c' : places <= 3 ? '#e67e22' : '#2ecc71';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${clubData.name}`)
    .addFields(
      {
        name: '🏆 Trophées club',
        value: `**${clubData.trophies?.toLocaleString('fr-FR')}**`,
        inline: true
      },
      {
        name: '📊 Moyenne',
        value: `**${avgTrophies.toLocaleString('fr-FR')}** 🏆`,
        inline: true
      },
      {
        name: '🎯 Trophées requis',
        value: `**${clubData.requiredTrophies?.toLocaleString('fr-FR')}** 🏆`,
        inline: true
      },
      {
        name: '👥 Membres',
        value: `${fillBar} **${members}/30**`,
        inline: true
      },
      {
        name: '📋 Statut',
        value: statusText,
        inline: true
      },
      {
        name: '🏷️ Tag',
        value: `\`${clubData.tag}\``,
        inline: true
      },
    )
    .setFooter({ text: `Prairie Brawl Stars • Mis à jour` })
    .setTimestamp();
}

async function updateClubsPanel(client) {
  const channel = client.channels.cache.get(process.env.CLUBS_CHANNEL_ID);
  if (!channel) {
    console.error('[ClubsPanel] Channel introuvable');
    return;
  }

  console.log('[ClubsPanel] Mise à jour des panels clubs...');

  for (const club of PRAIRIE_CLUBS) {
    try {
      const clubData = await getClub(club.tag);
      const embed = await buildClubEmbed(clubData, club.emoji);

      if (messageIds[club.tag]) {
        // Met à jour le message existant
        try {
          const msg = await channel.messages.fetch(messageIds[club.tag]);
          await msg.edit({ embeds: [embed] });
        } catch {
          // Message supprimé — en recrée un
          const msg = await channel.send({ embeds: [embed] });
          messageIds[club.tag] = msg.id;
        }
      } else {
        // Crée un nouveau message
        const msg = await channel.send({ embeds: [embed] });
        messageIds[club.tag] = msg.id;
      }

      // Petite pause entre chaque club pour éviter le rate limit
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`[ClubsPanel] Erreur pour ${club.name}:`, err.message);
    }
  }

  console.log('[ClubsPanel] ✅ Panels mis à jour');
}

module.exports = { updateClubsPanel };