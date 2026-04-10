const { EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');

const PRAIRIE_CLUBS = [
  {
    tag: '#29UPLG8QQ',
    emoji: '🌟',
    name: 'Prairie Étoilée',
    color: '#1a237e', // Bleu nuit
    description: 'Le club élite de la famille Prairie. Discord obligatoire, Events 100%, Voc privilégié. Chill & actif, bonne ambiance.',
    level: '👑 Élite',
  },
  {
    tag: '#2C9Y28JPP',
    emoji: '🌿',
    name: 'Prairie Fleurie',
    color: '#1b5e20', // Vert foncé
    description: 'Rush Mega Pig (tirelire), Discord obligatoire, Soit actif, Record 350, Voc privilégié.',
    level: '🥇 Confirmé',
  },
  {
    tag: '#2JUVYQ0YV',
    emoji: '⚡',
    name: 'Prairie Céleste',
    color: '#0d47a1', // Bleu ciel foncé
    description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.',
    level: '🥇 Confirmé',
  },
  {
    tag: '#2CJJLLUQ9',
    emoji: '❄️',
    name: 'Prairie Gelée',
    color: '#006064', // Cyan foncé
    description: 'Event de club obligatoire, Club affilié à la Prairie, Discord obligatoire, Soit actif.',
    level: '🥈 Intermédiaire',
  },
  {
    tag: '#2YGPRQYCC',
    emoji: '🔥',
    name: 'Prairie Brûlée',
    color: '#bf360c', // Rouge foncé
    description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.',
    level: '🥈 Intermédiaire',
  },
  {
    tag: '#JY89VGGP',
    emoji: '🌱',
    name: 'Mini Prairie',
    color: '#33691e', // Vert clair foncé
    description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.',
    level: '🥉 Débutant',
  },
  {
    tag: '#C9JUYQQY',
    emoji: '🍃',
    name: 'Prairie Sauvage',
    color: '#827717', // Jaune olive
    description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.',
    level: '🥉 Débutant',
  },
];

const messageIds = {};

async function buildClubEmbed(clubData, clubConfig) {
  const members = clubData.members?.length || 0;
  const maxMembers = 30;
  const places = maxMembers - members;

  const avgTrophies = members
    ? Math.round(clubData.members.reduce((sum, m) => sum + m.trophies, 0) / members)
    : 0;

  const maxTrophies = members
    ? Math.max(...clubData.members.map(m => m.trophies))
    : 0;

  const minTrophies = members
    ? Math.min(...clubData.members.map(m => m.trophies))
    : 0;

  // Top 3 membres
  const top3 = [...(clubData.members || [])]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 3)
    .map((m, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      return `${medals[i]} **${m.name}** — ${m.trophies.toLocaleString('fr-FR')} 🏆`;
    })
    .join('\n');

  // Répartition des rôles
  const presidents = clubData.members?.filter(m => m.role === 'president').length || 0;
  const vps = clubData.members?.filter(m => m.role === 'vicePresident').length || 0;
  const seniors = clubData.members?.filter(m => m.role === 'senior').length || 0;
  const regulars = clubData.members?.filter(m => m.role === 'member').length || 0;

  // Barre de remplissage
  const fillBar = '█'.repeat(Math.round((members / maxMembers) * 12)) +
                  '░'.repeat(12 - Math.round((members / maxMembers) * 12));

  const statusText = places === 0
    ? '🔴 Complet'
    : places <= 3
    ? `🟠 ${places} place(s) dispo`
    : `🟢 ${places} places disponibles`;

  return new EmbedBuilder()
    .setColor(clubConfig.color)
    .setTitle(`${clubConfig.emoji} ${clubData.name}`)
    .setDescription(
      `*${clubConfig.description}*\n\n` +
      `${clubConfig.level} • ${statusText}`
    )
    .addFields(
      // Ligne 1 — Trophées
      {
        name: '🏆 Trophées club',
        value: `**${clubData.trophies?.toLocaleString('fr-FR')}**`,
        inline: true
      },
      {
        name: '📊 Moyenne',
        value: `**${avgTrophies.toLocaleString('fr-FR')}**`,
        inline: true
      },
      {
        name: '🎯 Requis',
        value: `**${clubData.requiredTrophies?.toLocaleString('fr-FR')}**`,
        inline: true
      },

      // Ligne 2 — Min/Max
      {
        name: '📈 Meilleur membre',
        value: `**${maxTrophies.toLocaleString('fr-FR')}** 🏆`,
        inline: true
      },
      {
        name: '📉 Membre le plus bas',
        value: `**${minTrophies.toLocaleString('fr-FR')}** 🏆`,
        inline: true
      },
      {
        name: '🏷️ Tag',
        value: `\`${clubData.tag}\``,
        inline: true
      },

      // Ligne 3 — Membres
      {
        name: `👥 Membres ${fillBar} ${members}/30`,
        value: [
          `👑 Président : **${presidents}**`,
          `⭐ Vice-président : **${vps}**`,
          `🔰 Senior : **${seniors}**`,
          `👤 Membre : **${regulars}**`,
        ].join(' • '),
        inline: false
      },

      // Ligne 4 — Top 3
      {
        name: '🏅 Top 3 membres',
        value: top3 || 'Aucun membre',
        inline: false
      },
    )
    .setFooter({ text: 'Prairie Brawl Stars • Mis à jour toutes les heures' })
    .setTimestamp();
}

async function updateClubsPanel(client) {
  let channel;

  try {
    channel = await client.channels.fetch(process.env.CLUBS_CHANNEL_ID);
  } catch (err) {
    console.error('[ClubsPanel] Channel introuvable:', err.message);
    return;
  }

  if (!channel) {
    console.error('[ClubsPanel] Channel null');
    return;
  }

  console.log('[ClubsPanel] Mise à jour des panels clubs...');

  for (const clubConfig of PRAIRIE_CLUBS) {
    try {
      const clubData = await getClub(clubConfig.tag);
      const embed = await buildClubEmbed(clubData, clubConfig);

      if (messageIds[clubConfig.tag]) {
        try {
          const msg = await channel.messages.fetch(messageIds[clubConfig.tag]);
          await msg.edit({ embeds: [embed] });
        } catch {
          const msg = await channel.send({ embeds: [embed] });
          messageIds[clubConfig.tag] = msg.id;
        }
      } else {
        const msg = await channel.send({ embeds: [embed] });
        messageIds[clubConfig.tag] = msg.id;
      }

      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`[ClubsPanel] Erreur pour ${clubConfig.name}:`, err.message);
    }
  }

  console.log('[ClubsPanel] ✅ Panels mis à jour');
}

module.exports = { updateClubsPanel };