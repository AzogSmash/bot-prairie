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

function formatRank(rank, limit) {
  if (!rank) return `+${limit}`;
  return `#${rank}`;
}

async function getClubRankings(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();

  async function fetchRanking(region) {
    const limit = region === 'global' ? 500 : 200;
    return new Promise((resolve) => {
      const url = `https://bsproxy.royaleapi.dev/v1/rankings/${region}/clubs?limit=${limit}`;
      const options = { headers: { 'Authorization': `Bearer ${process.env.BRAWLSTARS_API_KEY}` } };
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

  // Récupère les records existants
  const { data: existing } = await supabase
    .from('club_rankings')
    .select('*')
    .eq('club_tag', tag)
    .single()
    .catch(() => ({ data: null }));

  const bestWorld = existing
    ? (worldRank && worldRank < (existing.best_world_rank || 9999) ? worldRank : existing.best_world_rank)
    : worldRank;

  const bestFr = existing
    ? (frRank && frRank < (existing.best_fr_rank || 9999) ? frRank : existing.best_fr_rank)
    : frRank;

  // Sauvegarde
  await supabase
    .from('club_rankings')
    .upsert({
      club_tag: tag,
      best_world_rank: bestWorld,
      best_fr_rank: bestFr,
      current_world_rank: worldRank,
      current_fr_rank: frRank,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'club_tag' });

  return { worldRank, frRank, bestWorld, bestFr };
}

async function buildClubEmbed(clubData, clubConfig, rankings, customConfig) {
  const members = clubData.members || [];
  const memberCount = members.length;
  const maxMembers = 30;
  const places = maxMembers - memberCount;

  const trophiesList = members.map(m => m.trophies);
  const avgTrophies = memberCount ? Math.round(trophiesList.reduce((a, b) => a + b, 0) / memberCount) : 0;
  const maxTrophies = memberCount ? Math.max(...trophiesList) : 0;
  const minTrophies = memberCount ? Math.min(...trophiesList) : 0;

  const president = members.filter(m => m.role === 'president');
  const vps = members.filter(m => m.role === 'vicePresident');
  const seniors = members.filter(m => m.role === 'senior');
  const regulars = members.filter(m => m.role === 'member');

  const top5 = [...members]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 5)
    .map((m, i) => {
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      return `${medals[i]} **${m.name}** — ${m.trophies.toLocaleString('fr-FR')} 🏆`;
    })
    .join('\n');

  const filled = Math.round((memberCount / maxMembers) * 15);
  const fillBar = '█'.repeat(filled) + '░'.repeat(15 - filled);

  const statusText = places === 0 ? '🔴 **Complet**'
    : places <= 3 ? `🟠 **${places} place(s) disponible(s)**`
    : `🟢 **${places} places disponibles**`;

  // Utilise la config custom si disponible, sinon les valeurs par défaut
  const description = customConfig?.description || clubConfig.description;
  const level = customConfig?.level || clubConfig.level;
  const requiredTrophies = customConfig?.required_trophies || clubData.requiredTrophies;

  const cleanTag = clubConfig.tag.replace('#', '');
  const brawlifyUrl = `https://brawlify.com/stats/club/${cleanTag}`;
  const badgeUrl = clubData.badgeId
    ? `https://cdn.brawlify.com/club-badges/regular/${clubData.badgeId}.png`
    : null;

  const { worldRank, frRank, bestWorld, bestFr } = rankings;

  return new EmbedBuilder()
    .setColor(clubConfig.color)
    .setAuthor({
      name: `${clubConfig.emoji} ${clubData.name} • ${level}`,
      iconURL: badgeUrl || undefined,
      url: brawlifyUrl,
    })
    .setThumbnail(badgeUrl || null)
    .setDescription(`*${description}*`)

    // ── Statut & Classements ──────────────────────────────
    .addFields(
      { name: '📋 Statut', value: statusText, inline: true },
      {
        name: '🌍 Monde',
        value: `Actuel : **${formatRank(worldRank, 500)}**\nRecord : **${formatRank(bestWorld, 500)}**`,
        inline: true,
      },
      {
        name: '🇫🇷 France',
        value: `Actuel : **${formatRank(frRank, 200)}**\nRecord : **${formatRank(bestFr, 200)}**`,
        inline: true,
      },
    )

    // ── Trophées ──────────────────────────────────────────
    .addFields(
      { name: '🏆 Trophées club', value: `**${clubData.trophies?.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📊 Moyenne', value: `**${avgTrophies.toLocaleString('fr-FR')}**`, inline: true },
      { name: '🎯 Requis', value: `**${requiredTrophies?.toLocaleString('fr-FR')}**`, inline: true },
    )

    // ── Min/Max ───────────────────────────────────────────
    .addFields(
      { name: '📈 Meilleur', value: `**${maxTrophies.toLocaleString('fr-FR')}** 🏆`, inline: true },
      { name: '📉 Plus bas', value: `**${minTrophies.toLocaleString('fr-FR')}** 🏆`, inline: true },
      { name: '🏷️ Tag', value: `\`${clubData.tag}\``, inline: true },
    )

    // ── Membres ───────────────────────────────────────────
    .addFields({
      name: `👥 Membres — ${fillBar} ${memberCount}/30`,
      value: '\u200b',
      inline: false,
    })
    .addFields(
      { name: '👑 Président', value: president.length > 0 ? president.map(m => `**${m.name}**`).join(', ') : '—', inline: true },
      { name: '⭐ Vice-président(s)', value: vps.length > 0 ? vps.map(m => `**${m.name}**`).join(', ') : '—', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )
    .addFields(
      { name: '🔰 Senior(s)', value: `**${seniors.length}** membre(s)`, inline: true },
      { name: '👤 Membre(s)', value: `**${regulars.length}** membre(s)`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )

    // ── Top 5 ─────────────────────────────────────────────
    .addFields({ name: '🏅 Top 5', value: top5 || 'Aucun membre', inline: false })

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

  // Récupère toutes les configs custom
  const { data: configs } = await supabase
    .from('club_config')
    .select('*');

  const configMap = {};
  if (configs) {
    for (const c of configs) configMap[c.club_tag] = c;
  }

  const allMembers = [];

  for (const clubConfig of PRAIRIE_CLUBS) {
    try {
      const [clubData, rankings] = await Promise.all([
        getClub(clubConfig.tag),
        getClubRankings(clubConfig.tag),
      ]);

      const embed = await buildClubEmbed(clubData, clubConfig, rankings, configMap[clubConfig.tag]);

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

module.exports = { updateClubsPanel, PRAIRIE_CLUBS };