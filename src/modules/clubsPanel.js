const { EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');
const { setCache } = require('../lib/cache');
const { supabase } = require('../lib/supabase');
const https = require('https');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée', color: '#1a237e', description: 'Le club élite de la famille Prairie. Discord obligatoire, Events 100%, Voc privilégié. Chill & actif, bonne ambiance.', level: '👑 Élite' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie', color: '#1b5e20', description: 'Rush Mega Pig (tirelire), Discord obligatoire, Soit actif, Voc privilégié.', level: '🥇 Confirmé' },
  { tag: '#2JUVYQ0YV', emoji: '⚡', name: 'Prairie Céleste', color: '#0d47a1', description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.', level: '🥇 Confirmé' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée', color: '#006064', description: 'Event de club obligatoire, Discord obligatoire, Soit actif.', level: '🥈 Intermédiaire' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée', color: '#bf360c', description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.', level: '🥈 Intermédiaire' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie', color: '#33691e', description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.', level: '🥉 Débutant' },
  { tag: '#C9JUYQQY',  emoji: '🍃', name: 'Prairie Sauvage', color: '#827717', description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.', level: '🥉 Débutant' },
];

// Récupère les classements FR et monde pour un club
async function getClubRankings(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();

  async function fetchRanking(region) {
    return new Promise((resolve) => {
      const url = `https://bsproxy.royaleapi.dev/v1/rankings/${region}/clubs`;
      const options = {
        headers: { 'Authorization': `Bearer ${process.env.BRAWLSTARS_API_KEY}` }
      };
      https.get(url, options, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(d);
            const rank = data.items?.findIndex(c => c.tag === `#${cleanTag}`) + 1;
            resolve(rank > 0 ? rank : null);
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  }

  const [worldRank, frRank] = await Promise.all([
    fetchRanking('global'),
    fetchRanking('FR'),
  ]);

  return { worldRank, frRank };
}

async function buildClubEmbed(clubData, clubConfig) {
  const members = clubData.members || [];
  const memberCount = members.length;
  const maxMembers = 30;
  const places = maxMembers - memberCount;

  const trophiesList = members.map(m => m.trophies);
  const avgTrophies = memberCount ? Math.round(trophiesList.reduce((a, b) => a + b, 0) / memberCount) : 0;
  const maxTrophies = memberCount ? Math.max(...trophiesList) : 0;
  const minTrophies = memberCount ? Math.min(...trophiesList) : 0;

  // Répartition des rôles
  const president = members.filter(m => m.role === 'president');
  const vps = members.filter(m => m.role === 'vicePresident');
  const seniors = members.filter(m => m.role === 'senior');
  const regulars = members.filter(m => m.role === 'member');

  // Top 5 membres
  const top5 = [...members]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 5)
    .map((m, i) => {
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      return `${medals[i]} **${m.name}** — ${m.trophies.toLocaleString('fr-FR')} 🏆`;
    })
    .join('\n');

  // Barre de remplissage
  const filled = Math.round((memberCount / maxMembers) * 15);
  const fillBar = '█'.repeat(filled) + '░'.repeat(15 - filled);

  // Statut
  const statusText = places === 0 ? '🔴 **Complet**'
    : places <= 3 ? `🟠 **${places} place(s) disponible(s)**`
    : `🟢 **${places} places disponibles**`;

  // Classements
  const { worldRank, frRank } = await getClubRankings(clubConfig.tag);

  // Icône du club
  const badgeUrl = clubData.badgeId
    ? `https://cdn.brawlify.com/club-badges/regular/${clubData.badgeId}.png`
    : null;

  // Lien Brawlify
  const cleanTag = clubConfig.tag.replace('#', '');
  const brawlifyUrl = `https://brawlify.com/stats/club/${cleanTag}`;

  return new EmbedBuilder()
    .setColor(clubConfig.color)
    .setAuthor({
      name: `${clubConfig.emoji} ${clubData.name} • ${clubConfig.level}`,
      iconURL: badgeUrl || undefined,
      url: brawlifyUrl,
    })
    .setThumbnail(badgeUrl || null)
    .setDescription(
      `*${clubConfig.description}*`
    )

    // ── Ligne 1 : Statut & Classements ───────────────────────
    .addFields(
      {
        name: '📋 Statut',
        value: statusText,
        inline: true,
      },
      {
        name: '🌍 Classement Monde',
        value: worldRank ? `**#${worldRank}** / 200` : '> 200',
        inline: true,
      },
      {
        name: '🇫🇷 Classement France',
        value: frRank ? `**#${frRank}** / 200` : '> 200',
        inline: true,
      },
    )

    // ── Ligne 2 : Trophées ────────────────────────────────────
    .addFields(
      {
        name: '🏆 Trophées club',
        value: `**${clubData.trophies?.toLocaleString('fr-FR')}**`,
        inline: true,
      },
      {
        name: '📊 Moyenne',
        value: `**${avgTrophies.toLocaleString('fr-FR')}**`,
        inline: true,
      },
      {
        name: '🎯 Requis',
        value: `**${clubData.requiredTrophies?.toLocaleString('fr-FR')}**`,
        inline: true,
      },
    )

    // ── Ligne 3 : Min/Max ─────────────────────────────────────
    .addFields(
      {
        name: '📈 Meilleur membre',
        value: `**${maxTrophies.toLocaleString('fr-FR')}** 🏆`,
        inline: true,
      },
      {
        name: '📉 Membre le plus bas',
        value: `**${minTrophies.toLocaleString('fr-FR')}** 🏆`,
        inline: true,
      },
      {
        name: '🏷️ Tag',
        value: `\`${clubData.tag}\``,
        inline: true,
      },
    )

    // ── Ligne 4 : Membres ─────────────────────────────────────
    .addFields({
      name: `👥 Membres — ${fillBar} ${memberCount}/30`,
      value: [
        `👑 Président : **${president.length}** — ${president.map(m => m.name).join(', ') || '—'}`,
        `⭐ Vice-président(s) : **${vps.length}** — ${vps.map(m => m.name).join(', ') || '—'}`,
        `🔰 Senior(s) : **${seniors.length}**`,
        `👤 Membre(s) : **${regulars.length}**`,
      ].join('\n'),
      inline: false,
    })

    // ── Ligne 5 : Top 5 ───────────────────────────────────────
    .addFields({
      name: '🏅 Top 5 membres',
      value: top5 || 'Aucun membre',
      inline: false,
    })

    // ── Footer ────────────────────────────────────────────────
    .setFooter({ text: 'Prairie Brawl Stars • Mis à jour toutes les heures • Clique sur le nom pour voir sur Brawlify' })
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

  console.log('[ClubsPanel] Mise à jour des panels clubs...');

  const { data: savedMessages } = await supabase
    .from('panel_messages')
    .select('*');

  const messageMap = {};
  if (savedMessages) {
    for (const row of savedMessages) {
      messageMap[row.club_tag] = row.message_id;
    }
  }

  const allMembers = [];

  for (const clubConfig of PRAIRIE_CLUBS) {
    try {
      const clubData = await getClub(clubConfig.tag);
      const embed = await buildClubEmbed(clubData, clubConfig);

      clubData.members?.forEach(m => allMembers.push({
        bsTag: m.tag,
        trophies: m.trophies,
        clubName: clubData.name,
      }));

      if (messageMap[clubConfig.tag]) {
        try {
          const msg = await channel.messages.fetch(messageMap[clubConfig.tag]);
          await msg.edit({ embeds: [embed] });
          console.log(`[ClubsPanel] ✏️ Mis à jour: ${clubConfig.name}`);
        } catch {
          const msg = await channel.send({ embeds: [embed] });
          await supabase
            .from('panel_messages')
            .upsert({ club_tag: clubConfig.tag, message_id: msg.id, channel_id: channel.id }, { onConflict: 'club_tag' });
          console.log(`[ClubsPanel] 📝 Recréé: ${clubConfig.name}`);
        }
      } else {
        const msg = await channel.send({ embeds: [embed] });
        await supabase
          .from('panel_messages')
          .upsert({ club_tag: clubConfig.tag, message_id: msg.id, channel_id: channel.id }, { onConflict: 'club_tag' });
        console.log(`[ClubsPanel] 🆕 Créé: ${clubConfig.name}`);
      }

      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`[ClubsPanel] Erreur pour ${clubConfig.name}:`, err.message);
    }
  }

  setCache(allMembers);
  console.log('[ClubsPanel] ✅ Panels mis à jour');
}

module.exports = { updateClubsPanel };