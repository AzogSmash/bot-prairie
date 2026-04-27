const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getPlayer, getBattleLog } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { getCache, isCacheValid } = require('../lib/cache');
const { getClub } = require('../lib/brawlapi');
const { renderProfileCard } = require('../modules/profileCardExact');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟' },
  { tag: '#2C9Y28JPP', emoji: '🌿' },
  { tag: '#2JUVYQ0YV', emoji: '⚡' },
  { tag: '#2CJJLLUQ9', emoji: '❄️' },
  { tag: '#2YGPRQYCC', emoji: '🔥' },
  { tag: '#JY89VGGP',  emoji: '🌱' },
  { tag: '#C9JUYQQY',  emoji: '🍃' },
];

async function getAllClubMembers() {
  const { clubMembersCache } = getCache();
  if (isCacheValid() && clubMembersCache.length > 0) return clubMembersCache;
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
    trioShowdown: '👥 Trio Showdown', wipeout: '💥 Wipeout', siege: '🤖 Siege',
  };
  return modes[mode] || `🎮 ${mode}`;
}

function getRankedTier(elo) {
  if (elo >= 11250) return 'Pro';
  if (elo >= 8250)  return 'Masters';
  if (elo >= 6000)  return 'Legendary';
  if (elo >= 4500)  return 'Mythic';
  if (elo >= 3000)  return 'Diamond';
  if (elo >= 1500)  return 'Gold';
  if (elo >= 750)   return 'Silver';
  return 'Bronze';
}

function getRankedEmoji(elo) {
  if (elo >= 11250) return '🔴'; // Pro
  if (elo >= 8250)  return '🟣'; // Masters
  if (elo >= 6000)  return '⭐'; // Legendary
  if (elo >= 4500)  return '💎'; // Mythic
  if (elo >= 3000)  return '🔷'; // Diamond
  if (elo >= 1500)  return '🥇'; // Gold
  if (elo >= 750)   return '🥈'; // Silver
  return '🥉'; // Bronze
}

async function getPushSnapshots(bsTag) {
  const now = new Date();

  // Début du jour
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // Début de la semaine (lundi)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);

  // Début de la saison
  const { data: season } = await supabase
    .from('season_starts')
    .select('started_at')
    .order('started_at', { ascending: false })
    .limit(1);
  const seasonStart = season?.[0]?.started_at;

  // Snapshot actuel
  const { data: currentSnap } = await supabase
    .from('trophies_snapshots')
    .select('trophies')
    .eq('bs_tag', bsTag)
    .eq('type', 'hourly')
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentTrophies = currentSnap?.trophies;
  if (!currentTrophies) return { daily: null, weekly: null, season: null };

  async function getPushSince(since) {
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('trophies')
      .eq('bs_tag', bsTag)
      .eq('type', 'hourly')
      .gte('snapshot_at', since.toISOString())
      .order('snapshot_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const diff = currentTrophies - data.trophies;
    return diff > 0 ? diff : 0;
  }

  const [daily, weekly, seasonPush] = await Promise.all([
    getPushSince(startOfDay),
    getPushSince(startOfWeek),
    seasonStart ? getPushSince(new Date(seasonStart)) : Promise.resolve(null),
  ]);

  return { daily, weekly, season: seasonPush };
}

async function buildProfileEmbed(target, client) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('discord_id', target.id)
    .single();
  const bsTag = await getPreferredBsTag(target.id);
  if (error || !data || !bsTag) return null;

  const [player, battleLogData, allClubMembers, rnt, pushData] = await Promise.all([
    getPlayer(bsTag),
    getBattleLog(bsTag).catch(() => null),
    getAllClubMembers(),
    fetchRntProfile(bsTag).catch(() => null),
    getPushSnapshots(bsTag),
  ]);

  const rntData = rnt?.result || rnt || {};

  const sortedMembers = [...allClubMembers].sort((a, b) => b.trophies - a.trophies);
  const rankInFamily  = sortedMembers.findIndex(m => m.bsTag === player.tag) + 1;
  const totalInFamily = sortedMembers.length;

  await supabase
    .from('members')
    .update({
      brawlstars_tag: bsTag,
      brawlstars_trophies: player.trophies,
      club_name: player.club?.name || null,
      last_seen_at: new Date().toISOString(),
    })
    .eq('discord_id', target.id);

  const brawlers = player.brawlers || [];

  // ── Collection ────────────────────────────────────────────────────────────
  const totalBrawlers   = brawlers.length;
  const maxedBrawlers   = brawlers.filter(b => b.power === 11).length;
  const hypercharges    = brawlers.filter(b => b.hyperCharges?.length > 0).length;
  const totalGadgets    = brawlers.reduce((sum, b) => sum + (b.gadgets?.filter(g => g.gadget).length || 0), 0);
  const maxGadgets      = brawlers.reduce((sum, b) => sum + (b.gadgets?.length || 0), 0);
  const totalSP         = brawlers.reduce((sum, b) => sum + (b.starPowers?.filter(s => s.starPower).length || 0), 0);
  const maxSP           = brawlers.reduce((sum, b) => sum + (b.starPowers?.length || 0), 0);
  const totalGears      = brawlers.reduce((sum, b) => sum + (b.gears?.length || 0), 0);
  const maxGears        = totalBrawlers * 2;

  // ── Classé ────────────────────────────────────────────────────────────────
  const rankedElo         = player.rankedElo || 0;
  const rankedRankName    = player.rankedRankName || 'Bronze I';
  const highestElo        = player.highestAllTimeRankedElo || 0;
  const highestRankName   = player.highestAllTimeRankedRankName || '';
  const rankedEmoji       = getRankedEmoji(rankedElo);

  // ── Battle log ────────────────────────────────────────────────────────────
  let winRate = null;
  let lastMode = null;
  let lastBrawler = null;

  if (battleLogData?.items?.length > 0) {
    const battles = battleLogData.items.slice(0, 25);
    const results = battles.filter(b => b.battle?.result);
    const wins    = results.filter(b => b.battle.result === 'victory').length;
    winRate = results.length > 0 ? Math.round((wins / results.length) * 100) : null;

    const lastBattle = battles[0];
    lastMode = lastBattle?.event?.mode || null;
    if (lastBattle?.battle?.teams) {
      const allPlayers = lastBattle.battle.teams.flat();
      const me = allPlayers.find(p => p.tag === player.tag);
      lastBrawler = me?.brawler?.name || null;
    }
  }

  // ── Progression trophées ──────────────────────────────────────────────────
  const nextMilestone = getNextMilestone(player.trophies);
  const prevMilestone = getPrevMilestone(player.trophies);
  const progress = nextMilestone
    ? progressBar(player.trophies - prevMilestone, nextMilestone - prevMilestone)
    : '████████████';

  const podiumEmojis = ['👑', '🥈', '🥉'];
  const rankEmoji    = rankInFamily <= 3 ? podiumEmojis[rankInFamily - 1] : '🌿';
  const color        = parseNameColor(player.nameColor);
  const bsIconUrl    = player.icon?.id
    ? `https://cdn.brawlify.com/profile-icons/regular/${player.icon.id}.png`
    : null;

  // ── Rang Prairie ──────────────────────────────────────────────────────────
  const isPrairie  = allClubMembers.some(m => m.bsTag === player.tag);
  const rangPrairie = rankInFamily > 0 && isPrairie
    ? `**#${rankInFamily}** / ${totalInFamily}`
    : 'Hors Prairie';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${player.name} • ${player.tag}`,
      iconURL: target.displayAvatarURL({ dynamic: true }),
    })
    .setThumbnail(bsIconUrl || target.displayAvatarURL({ dynamic: true, size: 256 }))

    // ── Bloc 1 : Trophées ────────────────────────────────────────────────
    .addFields(
      { name: '🏆 Trophées', value: `**${player.trophies.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📈 Record', value: `**${player.highestTrophies?.toLocaleString('fr-FR') || '?'}**`, inline: true },
      { name: `${rankEmoji} Rang Prairie`, value: rangPrairie, inline: true },
    )

    // ── Progression ──────────────────────────────────────────────────────
    .addFields({
      name: nextMilestone ? `Vers ${nextMilestone.toLocaleString('fr-FR')} trophées` : 'Progression',
      value: nextMilestone
        ? `\`${progress}\` ${player.trophies.toLocaleString('fr-FR')} / ${nextMilestone.toLocaleString('fr-FR')}`
        : `\`████████████\` Palier max atteint 🎉`,
      inline: false,
    })

    // ── Bloc 2 : Classé ──────────────────────────────────────────────────
    .addFields(
      {
        name: `${rankedEmoji} Classé`,
        value: `**${rankedRankName}** — ${rankedElo.toLocaleString('fr-FR')} pts`,
        inline: true,
      },
      {
        name: '🏅 Record classé',
        value: `**${highestRankName}** — ${highestElo.toLocaleString('fr-FR')} pts`,
        inline: true,
      },
      { name: '\u200b', value: '\u200b', inline: true },
    )

    // ── Bloc 3 : Victoires ───────────────────────────────────────────────
    .addFields(
      { name: '⚔️ 3v3', value: `**${player['3vs3Victories']?.toLocaleString('fr-FR') || '?'}**`, inline: true },
      { name: '☠️ Solo', value: `**${player.soloVictories?.toLocaleString('fr-FR') || '?'}**`, inline: true },
      { name: '👥 Duo', value: `**${player.duoVictories?.toLocaleString('fr-FR') || '?'}**`, inline: true },
    )

    // ── Bloc 4 : Collection ──────────────────────────────────────────────
    .addFields(
      { name: '🗂️ Brawlers', value: `**${totalBrawlers}** • ${maxedBrawlers} max`, inline: true },
      { name: '⚡ Hypercharges', value: `**${hypercharges}**`, inline: true },
      { name: '🎯 Niveau', value: `**${player.expLevel}** • Prestige **${player.totalPrestigeLevel || 0}**`, inline: true },
    )
    .addFields(
      { name: '🔧 Gadgets', value: `**${totalGadgets}** / ${maxGadgets}`, inline: true },
      { name: '⭐ Star Powers', value: `**${totalSP}** / ${maxSP}`, inline: true },
      { name: '⚙️ Gears', value: `**${totalGears}** / ${maxGears}`, inline: true },
    )

    // ── Bloc 5 : Push ────────────────────────────────────────────────────
    .addFields({
      name: '🚀 Push',
      value: [
        `Aujourd'hui : **${pushData.daily !== null ? '+' + pushData.daily.toLocaleString('fr-FR') : '—'}** 🏆`,
        `Cette semaine : **${pushData.weekly !== null ? '+' + pushData.weekly.toLocaleString('fr-FR') : '—'}** 🏆`,
        `Cette saison : **${pushData.season !== null ? '+' + pushData.season.toLocaleString('fr-FR') : '—'}** 🏆`,
      ].join('\n'),
      inline: false,
    })

    // ── Bloc 6 : Dernières parties ───────────────────────────────────────
    .addFields({
      name: '📊 25 dernières parties',
      value: [
        winRate !== null ? `🎯 Win rate : **${winRate}%**` : null,
        lastMode ? `🕹️ Dernier mode : **${modeLabel(lastMode)}**` : null,
        lastBrawler ? `🎮 Dernier brawler : **${lastBrawler}**` : null,
      ].filter(Boolean).join('\n') || 'Aucune partie récente',
      inline: false,
    })

    // ── Statut ───────────────────────────────────────────────────────────
    .addFields({
      name: '📋 Statut Prairie',
      value: data.status === 'staff'   ? '🛡️ Staff Prairie'
           : data.status === 'inactif' ? '⚠️ Inactif'
           : data.status === 'nouveau' ? '🆕 Nouveau membre'
           : '✅ Membre actif',
      inline: true,
    })
    .addFields(
      { name: '🌿 Club', value: player.club?.name || 'Sans club', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )

    .setFooter({ text: 'Prairie Brawl Stars • Stats en temps réel' })
    .setTimestamp();

  return { embed, player, bsTag, rntData };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profil-test')
    .setDescription('Affiche le profil Prairie d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('membre') || interaction.user;

    try {
      const profileData = await buildProfileEmbed(target, interaction.client);

      if (!profileData) {
        return interaction.editReply({
          content: `❌ **${target.username}** n'a pas encore lié son compte Brawl Stars.\nUtilise \`/lier #TAG\` pour commencer !`
        });
      }

      const { embed, player, bsTag, rntData } = profileData;

      let cardAttachment = null;
      let cardFailed = false;

      try {
        const rntAvailable = rntData && Object.keys(rntData).length > 0 && rntData.stats;

        const cardBuffer = await Promise.race([
          renderProfileCard({
            player: rntAvailable ? rntData : {
              ...player,
              stats: [
                { id: 3,  value: player.trophies || 0 },
                { id: 4,  value: player.highestTrophies || 0 },
                { id: 1,  value: player['3vs3Victories'] || 0 },
                { id: 8,  value: player.soloVictories || 0 },
                { id: 11, value: player.duoVictories || 0 },
                { id: 2,  value: player.expPoints || 0 },
                { id: 5,  value: player.brawlers?.length || 0 },
                { id: 24, value: 0 },
                { id: 25, value: 0 },
                { id: 30, value: player.totalPrestigeLevel || 0 },
                { id: 31, value: 0 },
                { id: 32, value: 0 },
              ],
            },
            extra: {
              expLevel: player.expLevel || 1,
              expPoints: player.expPoints || 0,
              clubName: player.club?.name || '',
            },
            playerTag: bsTag,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);

        cardAttachment = new AttachmentBuilder(cardBuffer, { name: 'profile-card.png' });
        embed.setImage('attachment://profile-card.png');
      } catch (err) {
        cardFailed = true;
        console.error('[PROFILE CARD FAIL]', bsTag, err.message);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_${target.id}`)
          .setLabel('🔄 Actualiser')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`classement_goto_0_tous_fromprofil_${target.id}`)
          .setLabel('🏆 Classement Prairie')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        files: cardAttachment ? [cardAttachment] : [],
      });

    } catch (err) {
      console.error('[Profil]', err);
      await interaction.editReply({ content: '❌ Erreur lors de la récupération du profil.' });
    }
  }
};

module.exports.buildProfileEmbed = buildProfileEmbed;
