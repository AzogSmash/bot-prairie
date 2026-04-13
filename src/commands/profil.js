const { setCache, getCache, isCacheValid } = require('../lib/cache');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, getBattleLog } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { getProgressionStats } = require('../lib/progression');
const { getMemberProgression } = require('../lib/progression');
const { getClub } = require('../lib/brawlapi');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟' },
  { tag: '#2C9Y28JPP', emoji: '🌿' },
  { tag: '#2JUVYQ0YV', emoji: '🪽' },
  { tag: '#2CJJLLUQ9', emoji: '❄️' },
  { tag: '#2YGPRQYCC', emoji: '🔥' },
  { tag: '#JY89VGGP',  emoji: '🌱' },
  { tag: '#C9JUYQQY',  emoji: '🐾' },
];


async function getAllClubMembers() {
  const { clubMembersCache } = getCache();
  if (isCacheValid() && clubMembersCache.length > 0) return clubMembersCache;

  // Fetch si cache expiré
  const allMembers = [];
  for (const club of PRAIRIE_CLUBS) {
    try {
      const clubData = await getClub(club.tag);
      clubData.members?.forEach(m => allMembers.push({
        bsTag: m.tag,
        trophies: m.trophies,
        clubName: clubData.name,
      }));
    } catch {}
  }
  return allMembers;
}

function getRankEmoji(rank) {
  if (rank >= 35) return '🟣';
  if (rank >= 30) return '🔴';
  if (rank >= 25) return '🟠';
  if (rank >= 20) return '🟡';
  if (rank >= 15) return '🟢';
  if (rank >= 10) return '🔵';
  return '⚪';
}

function parseNameColor(nameColor) {
  if (!nameColor) return '#2ecc71';
  const clean = nameColor.replace('0x', '');
  const hex = '#' + clean.slice(0, 6);
  return hex.length === 7 ? hex : '#2ecc71';
}

function getNextMilestone(trophies) {
  const milestones = [5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000, 150000];
  return milestones.find(m => m > trophies) || null;
}

function getPrevMilestone(trophies) {
  const milestones = [0, 5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000];
  return [...milestones].reverse().find(m => m <= trophies) || 0;
}

function progressBar(current, max, length = 12) {
  const filled = Math.min(Math.round((current / max) * length), length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function modeLabel(mode) {
  const modes = {
    gemGrab: '💎 Gem Grab', brawlBall: '⚽ Brawl Ball',
    heist: '💰 Heist', bounty: '⭐ Bounty',
    hotZone: '🔥 Hot Zone', knockout: '🥊 Knockout',
    duoShowdown: '👥 Duo Showdown', soloShowdown: '☠️ Solo Showdown',
    wipeout: '💥 Wipeout', siege: '🤖 Siege',
  };
  return modes[mode] || `🎮 ${mode}`;
}

async function buildProfileEmbed(target, client) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('discord_id', target.id)
    .single();

  if (error || !data || !data.brawlstars_tag) return null;

  const [player, battleLogData, allClubMembers] = await Promise.all([
    getPlayer(data.brawlstars_tag),
    getBattleLog(data.brawlstars_tag).catch(() => null),
    getAllClubMembers(),
  ]);

  const playerInCache = allClubMembers.find(m => m.bsTag === player.tag);
  console.log('[DEBUG cache match]', playerInCache);
  console.log('[DEBUG cache tags]', allClubMembers.map(m => m.bsTag).slice(0, 5));
  console.log('[DEBUG cache length]', allClubMembers.length);
  console.log('[DEBUG search]', allClubMembers.find(m => m.bsTag.toLowerCase() === player.tag.toLowerCase()));


  const playerDebug = Object.fromEntries(
    Object.entries(player).filter(([key]) => key !== 'brawlers')
  );
  console.log('[DEBUG PLAYER]', JSON.stringify(playerDebug, null, 2));


  const progression = await getMemberProgression(data.brawlstars_tag);
  const formatProg = (val, current) => val === null ? '—' : `+${(current - val).toLocaleString('fr-FR')}`;

  // Rang sur tous les membres des 7 clubs
  const sortedMembers = [...allClubMembers].sort((a, b) => b.trophies - a.trophies);
  const rankInFamily = sortedMembers.findIndex(m => m.bsTag === player.tag) + 1;
  const totalInFamily = sortedMembers.length;

  // Met à jour Supabase
  await supabase
    .from('members')
    .update({
      brawlstars_trophies: player.trophies,
      club_name: player.club?.name || null,
      last_seen_at: new Date().toISOString(),
    })
    .eq('discord_id', target.id);

  // ── Brawlers ──────────────────────────────────────────────
  const brawlers = player.brawlers || [];
  const topBrawler = [...brawlers].sort((a, b) => b.trophies - a.trophies)[0];
  const maxedBrawlers = brawlers.filter(b => b.power === 11).length;
  const hyperchargeBrawlers = brawlers.filter(b => b.hyperCharges?.length > 0).length;
  const maxWinStreak = brawlers.reduce((max, b) => Math.max(max, b.maxWinStreak || 0), 0);

  // ── Battle log ────────────────────────────────────────────
  let winRate = null;
  let favoriteMode = null;
  let recentBrawler = null;

  if (battleLogData?.items?.length > 0) {
    const battles = battleLogData.items.slice(0, 25);
    const results = battles.filter(b => b.battle?.result);
    const wins = results.filter(b => b.battle.result === 'victory').length;
    winRate = results.length > 0 ? Math.round((wins / results.length) * 100) : null;

    const modeCounts = {};
    battles.forEach(b => {
      const mode = b.event?.mode || 'unknown';
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    });
    favoriteMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const lastBattle = battles[0];
    if (lastBattle?.battle?.teams) {
      const allPlayers = lastBattle.battle.teams.flat();
      const me = allPlayers.find(p => p.tag === player.tag);
      recentBrawler = me?.brawler?.name || null;
    }
  }

  // ── Progression ───────────────────────────────────────────
  const nextMilestone = getNextMilestone(player.trophies);
  const prevMilestone = getPrevMilestone(player.trophies);
  const progress = nextMilestone
    ? progressBar(player.trophies - prevMilestone, nextMilestone - prevMilestone)
    : '████████████';

  // ── Rang emoji ────────────────────────────────────────────
  const podiumEmojis = ['👑', '🥈', '🥉'];
  const rankEmoji = rankInFamily <= 3 ? podiumEmojis[rankInFamily - 1] : '🌿';

  // ── Couleur depuis BS ─────────────────────────────────────
  const color = parseNameColor(player.nameColor);

  // ── Icône BS ──────────────────────────────────────────────
  const bsIconUrl = player.icon?.id
    ? `https://cdn.brawlify.com/profile-icons/regular/${player.icon.id}.png`
    : null;

  // ── Ancienneté ────────────────────────────────────────────
  const joinedAt = data.joined_at
    ? `<t:${Math.floor(new Date(data.joined_at).getTime() / 1000)}:R>`
    : 'Inconnu';

  const embed = new EmbedBuilder()
  .setColor(color)
  .setAuthor({
    name: `${player.name} • ${player.tag}`,
    iconURL: target.displayAvatarURL({ dynamic: true }),
  })
  .setTitle(`${rankEmoji} Profil Prairie — #${rankInFamily} / ${totalInFamily}`)
  .setThumbnail(bsIconUrl || target.displayAvatarURL({ dynamic: true, size: 256 }))

  // ── Identité ──────────────────────────────────────────────
  .addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━\n👤 IDENTITÉ',
    value: [
      `🌿 **${player.club?.name || 'Sans club'}**  •  🎯 Niv. **${player.expLevel}**  •  ⭐ Prestige **${player.totalPrestigeLevel || 0}**`,
      `📅 Sur le serveur : ${joinedAt}`,
    ].join('\n'),
    inline: false,
  })

  // ── Trophées & Progression ────────────────────────────────
  .addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━\n🏆 TROPHÉES & PROGRESSION',
    value: [
      `🏆 **${player.trophies.toLocaleString('fr-FR')}**  •  🥇 Record : **${player.highestTrophies?.toLocaleString('fr-FR') || '?'}**  •  ${rankEmoji} **#${rankInFamily}** / ${totalInFamily}`,
      `\`${progress}\` ${player.trophies.toLocaleString('fr-FR')} / ${nextMilestone ? nextMilestone.toLocaleString('fr-FR') : 'Max 🎉'}`,
      `\u200b`,
      `🔥 Aujourd'hui : **${formatProg(progression.daily, player.trophies)}**  •  📅 Semaine : **${formatProg(progression.weekly, player.trophies)}**  •  🏆 Saison : **${formatProg(progression.seasonRef, player.trophies)}**`,
    ].join('\n'),
    inline: false,
  })

  // ── Brawler favori ────────────────────────────────────────
  .addFields({
    name: `━━━━━━━━━━━━━━━━━━━━━━\n🎮 BRAWLER FAVORI — ${topBrawler?.name || '?'}`,
    value: topBrawler ? [
      `${getRankEmoji(topBrawler.rank)} Rang **${topBrawler.rank}**  •  🏆 **${topBrawler.trophies.toLocaleString('fr-FR')}** trophées  •  ⚡ Power **${topBrawler.power}**/11`,
      `⚡ HC ${topBrawler.hyperCharges?.length > 0 ? '✅' : '❌'}${topBrawler.skin?.name ? `  •  🎨 **${topBrawler.skin.name}**` : ''}  •  🔥 Streak max : **${topBrawler.maxWinStreak || 0}**`,
    ].join('\n') : 'Aucun brawler',
    inline: false,
  })

  // ── Collection ────────────────────────────────────────────
  .addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━\n📦 COLLECTION',
    value: `🗂️ **${brawlers.length}** débloqués  •  💪 **${maxedBrawlers}**/${brawlers.length} au max  •  ⚡ **${hyperchargeBrawlers}** HC`,
    inline: false,
  })

  // ── Victoires ─────────────────────────────────────────────
  .addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━\n⚔️ VICTOIRES',
    value: `⚔️ 3v3 : **${player['3vs3Victories']?.toLocaleString('fr-FR') || '?'}**  •  ☠️ Solo : **${player.soloVictories?.toLocaleString('fr-FR') || '?'}**  •  👥 Duo : **${player.duoVictories?.toLocaleString('fr-FR') || '?'}**`,
    inline: false,
  })

  // ── Battle log ────────────────────────────────────────────
  .addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━\n📊 25 DERNIÈRES PARTIES',
    value: [
      winRate !== null ? `🎯 Win rate : **${winRate}%**` : null,
      favoriteMode ? `🕹️ Mode favori : **${modeLabel(favoriteMode)}**` : null,
      recentBrawler ? `🎮 Dernier brawler : **${recentBrawler}**` : null,
      `🔥 Meilleure win streak : **${maxWinStreak}**`,
    ].filter(Boolean).join('  •  ') || 'Aucune partie récente',
    inline: false,
  })

  // ── Statut ────────────────────────────────────────────────
  .addFields({
    name: '\u200b',
    value: data.status === 'staff' ? '🛡️ **Staff Prairie**'
      : data.status === 'inactif' ? '⚠️ **Inactif**'
      : data.status === 'nouveau' ? '🆕 **Nouveau membre**'
      : '✅ **Membre actif**',
    inline: false,
  })

  .setFooter({ text: 'Prairie Brawl Stars • Stats en temps réel' })
  .setTimestamp();

return embed;
}

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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_${target.id}`)
          .setLabel('🔄 Actualiser')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`classement_goto_0_tous_fromprofil`)
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

module.exports.buildProfileEmbed = buildProfileEmbed;