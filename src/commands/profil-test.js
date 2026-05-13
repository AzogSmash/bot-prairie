const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getPlayer, getBattleLog } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { getCache, isCacheValid } = require('../lib/cache');
const { getClub } = require('../lib/brawlapi');
const { renderProfileCard } = require('../modules/profileCardExact');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');
const BRAWLERS_META = require('../assets/brawlers-meta.json');
const TOTAL_BRAWLERS = BRAWLERS_META.length;
const MAX_GADGETS    = BRAWLERS_META.reduce((s, b) => s + b.totalGadgets, 0);
const MAX_SP         = BRAWLERS_META.reduce((s, b) => s + b.totalSP, 0);

const B1 = '<:Text1:1483310643611439215>';
const B2 = '<:Text2:1483310738297847849>';
const ARROW_DN = '<:i_arrowdown:1481364567501176995>';
const ARROW_UP = '<:i_arrowup:1481364573650030789>';

function arrow(val) { return (val !== null && val > 0) ? ARROW_UP : ARROW_DN; }
function arrowRate(val) { return (val !== null && val >= 50) ? ARROW_UP : ARROW_DN; }

function fmtPush(val) {
  if (val === null) return '—';
  return (val >= 0 ? '+' : '') + val.toLocaleString('fr-FR');
}

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

function progressBar(current, max, length = 10) {
  const filled = Math.min(Math.round((current / max) * length), length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

const MODE_EMOJIS = {
  48000037: '<:gm_48000037:1478934858670542950>',
  48000038: '<:gm_48000038:1478934864496693399>',
  48000039: '<:gm_48000039:1478934870854996088>',
  48000040: '<:gm_48000040:1478934876018184233>',
  48000041: '<:gm_48000041:1478934882041466880>',
  48000042: '<:gm_48000042:1478934887556976773>',
  48000043: '<:gm_48000043:1478934893772804137>',
  48000044: '<:gm_48000044:1478934901578272779>',
  48000045: '<:gm_48000045:1478934909975531692>',
  48000046: '<:gm_48000046:1478934916111536129>',
  48000047: '<:gm_48000047:1478934922113843211>',
  48000048: '<:gm_48000048:1478934928312762571>',
  48000049: '<:gm_48000049:1478934934478520507>',
  48000050: '<:gm_48000050:1478934939989971032>',
  48000051: '<:gm_48000051:1478934945610207245>',
  48000052: '<:gm_48000052:1478934952358973581>',
  48000053: '<:gm_48000053:1478934958864072755>',
  48000054: '<:gm_48000054:1478934964446822531>',
  48000055: '<:gm_48000055:1478934969903743047>',
  48000056: '<:gm_48000056:1478934976719491115>',
  48000057: '<:gm_48000057:1478934983833030729>',
  48000058: '<:gm_48000058:1478934989872562218>',
  48000059: '<:gm_48000059:1478934995547455569>',
  48000060: '<:gm_48000060:1478935001117495487>',
  48000061: '<:gm_48000061:1478935006549377167>',
  48000062: '<:gm_48000062:1478935011909435555>',
  48000063: '<:gm_48000063:1478935018964521101>',
  48000064: '<:gm_48000064:1478935025801105598>',
  48000065: '<:gm_48000065:1478935031693971518>',
  48000066: '<:gm_48000066:1478935038320967690>',
  48000067: '<:gm_48000067:1478935043715109007>',
};

const LOCKED_EMOJI = '<:2b_locked:1478963121082204221>';

function modeLabel(mode) {
  const modes = {
    gemGrab: 'Gem Grab', brawlBall: 'Brawl Ball',
    heist: 'Heist', bounty: 'Bounty',
    hotZone: 'Hot Zone', knockout: 'Knockout',
    duoShowdown: 'Duo Showdown', soloShowdown: 'Solo Showdown',
    trioShowdown: 'Trio Showdown', wipeout: 'Wipeout', siege: 'Siege',
  };
  return modes[mode] || mode;
}

function getModeEmoji(modeId) {
  if (!modeId) return '';
  return MODE_EMOJIS[48000000 + modeId] || MODE_EMOJIS[modeId] || '';
}

const RANKED_EMOJIS = [
  '<:rt_58000000:1479579378844172301>', // Bronze I
  '<:rt_58000001:1479579384313675877>', // Bronze II
  '<:rt_58000002:1479579391347654836>', // Bronze III
  '<:rt_58000003:1479579399694057492>', // Silver I
  '<:rt_58000004:1479579405176012840>', // Silver II
  '<:rt_58000005:1479579969838518434>', // Silver III
  '<:rt_58000006:1479579975639109712>', // Gold I
  '<:rt_58000007:1479579982371094679>', // Gold II
  '<:rt_58000008:1479579988641714237>', // Gold III
  '<:rt_58000009:1479579994194968728>', // Diamond I
  '<:rt_58000010:1479580000150618374>', // Diamond II
  '<:rt_58000011:1479580005867585647>', // Diamond III
  '<:rt_58000012:1479580011450073349>', // Mythic I
  '<:rt_58000013:1479580017188147330>', // Mythic II
  '<:rt_58000014:1479580022703390790>', // Mythic III
  '<:rt_58000015:1479580027979960352>', // Legendary I
  '<:rt_58000016:1479580033520500882>', // Legendary II
  '<:rt_58000017:1479580039317033030>', // Legendary III
  '<:rt_58000018:1479580044853772461>', // Masters I
  '<:rt_58000019:1479580050746507406>', // Masters II
  '<:rt_58000020:1479580056727588916>', // Masters III
  '<:rt_58000021:1479580062515855483>', // Pro
];

function getRankedEmoji(rankName) {
  if (!rankName) return RANKED_EMOJIS[0];
  const n = rankName.toLowerCase();
  const sub = n.includes('iii') ? 2 : n.includes('ii') ? 1 : 0;
  if (n.includes('pro'))       return RANKED_EMOJIS[21];
  if (n.includes('masters'))   return RANKED_EMOJIS[18 + sub];
  if (n.includes('legendary')) return RANKED_EMOJIS[15 + sub];
  if (n.includes('mythic'))    return RANKED_EMOJIS[12 + sub];
  if (n.includes('diamond'))   return RANKED_EMOJIS[9 + sub];
  if (n.includes('gold'))      return RANKED_EMOJIS[6 + sub];
  if (n.includes('silver'))    return RANKED_EMOJIS[3 + sub];
  return RANKED_EMOJIS[sub];
}

async function getPushSnapshots(bsTag) {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);

  const { data: season } = await supabase
    .from('season_starts').select('started_at')
    .order('started_at', { ascending: false }).limit(1);
  const seasonStart = season?.[0]?.started_at;

  const { data: currentSnap } = await supabase
    .from('trophies_snapshots').select('trophies')
    .eq('bs_tag', bsTag).eq('type', 'hourly')
    .order('snapshot_at', { ascending: false }).limit(1).maybeSingle();

  const currentTrophies = currentSnap?.trophies;
  if (!currentTrophies) return { daily: null, weekly: null, season: null };

  async function getPushSince(since) {
    const { data } = await supabase
      .from('trophies_snapshots').select('trophies')
      .eq('bs_tag', bsTag).eq('type', 'hourly')
      .gte('snapshot_at', since.toISOString())
      .order('snapshot_at', { ascending: true }).limit(1).maybeSingle();
    if (!data) return null;
    return currentTrophies - data.trophies;
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
    .from('members').select('*').eq('discord_id', target.id).single();
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
  const isPrairie     = allClubMembers.some(m => m.bsTag === player.tag);

  await supabase.from('members').update({
    brawlstars_tag: bsTag,
    brawlstars_trophies: player.trophies,
    club_name: player.club?.name || null,
    last_seen_at: new Date().toISOString(),
  }).eq('discord_id', target.id);

  const brawlers = player.brawlers || [];

  // ── Collection ──────────────────────────────────────────────────────────
  const totalBrawlers = brawlers.length;
  const maxedBrawlers = brawlers.filter(b => b.power === 11).length;
  const hypercharges  = brawlers.filter(b => b.hyperCharges?.length > 0).length;
  const totalGadgets  = brawlers.reduce((sum, b) => sum + (b.gadgets?.length || 0), 0);
  const maxGadgets    = MAX_GADGETS;
  const totalSP       = brawlers.reduce((sum, b) => sum + (b.starPowers?.length || 0), 0);
  const maxSP         = MAX_SP;
  const totalGears    = brawlers.reduce((sum, b) => sum + (b.gears?.length || 0), 0);
  const maxGears      = TOTAL_BRAWLERS * 6;

  // ── Classé ──────────────────────────────────────────────────────────────
  const rankedElo      = player.rankedElo || 0;
  const rankedName     = player.rankedRankName || 'Bronze I';
  const highestElo     = player.highestAllTimeRankedElo || 0;
  const highestName    = player.highestAllTimeRankedRankName || 'Bronze I';

  // ── Battle log ──────────────────────────────────────────────────────────
  let winRate = null, lastMode = null, lastModeId = null, lastBrawler = null;
  if (battleLogData?.items?.length > 0) {
    const battles = battleLogData.items.slice(0, 25);
    const results = battles.filter(b => b.battle?.result);
    const wins    = results.filter(b => b.battle.result === 'victory').length;
    winRate = results.length > 0 ? Math.round((wins / results.length) * 100) : null;
    const last = battles[0];
    lastMode   = last?.event?.mode || null;
    lastModeId = last?.event?.modeId ?? null;
    if (last?.battle?.teams) {
      const me = last.battle.teams.flat().find(p => p.tag === player.tag);
      lastBrawler = me?.brawler?.name || null;
    }
  }

  // ── Progression ─────────────────────────────────────────────────────────
  const nextMilestone = getNextMilestone(player.trophies);
  const prevMilestone = getPrevMilestone(player.trophies);
  const progress = nextMilestone
    ? progressBar(player.trophies - prevMilestone, nextMilestone - prevMilestone)
    : '██████████';

  const podiumEmojis = ['👑', '🥈', '🥉'];
  const rankEmoji    = rankInFamily <= 3 ? podiumEmojis[rankInFamily - 1] : '🌿';
  const color        = parseNameColor(player.nameColor);
  const bsIconUrl    = player.icon?.id
    ? `https://cdn.brawlify.com/profile-icons/regular/${player.icon.id}.png` : null;

  const rangStr = rankInFamily > 0 && isPrairie
    ? `${rankEmoji} **#${rankInFamily}** / ${totalInFamily}`
    : 'Hors Prairie';

  const statusStr = data.status === 'staff' ? '🛡️ Staff'
    : data.status === 'inactif' ? '⚠️ Inactif'
    : data.status === 'nouveau' ? '🆕 Nouveau'
    : '<:Yes:1479588620297044042> Actif';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${player.name} • ${player.tag}`,
      iconURL: target.displayAvatarURL({ dynamic: true }),
    })
    .setThumbnail(bsIconUrl || target.displayAvatarURL({ dynamic: true, size: 256 }))

    .addFields({
      name: player.club?.name ? `${player.club.name}` : 'Sans club',
      value: `${B2} ${rangStr}  •  ${statusStr}`,
      inline: false,
    })

    .addFields({
      name: 'Trophées',
      value: [
        `${B1} X **${player.trophies.toLocaleString('fr-FR')}** / ${player.highestTrophies?.toLocaleString('fr-FR') || '?'}`,
      ].join('\n'),
      inline: false,
    })

    .addFields({
      name: `Classé`,
      value: [
        `${B1} ${getRankedEmoji(rankedName)} — ${rankedElo.toLocaleString('fr-FR')} pts`,
        `${B2} ${getRankedEmoji(highestName)} — ${highestElo.toLocaleString('fr-FR')} pts`,
      ].join('\n'),
      inline: false,
    })

    .addFields({
      name: 'Victoires',
      value: [
        `${B1} X **${player['3vs3Victories']?.toLocaleString('fr-FR') || '?'}**`,
        `${B2} X **${player.soloVictories?.toLocaleString('fr-FR') || '?'}** •  X **${player.duoVictories?.toLocaleString('fr-FR') || '?'}**`,
      ].join('\n'),
      inline: false,
    })

    .addFields({
      name: 'Collection',
      value: [
        `${B1} ${LOCKED_EMOJI} **${totalBrawlers}** / ${TOTAL_BRAWLERS} brawlers  •  **${maxedBrawlers}** max  •  **${hypercharges}** HC`,
        `${B1} X **${totalGadgets}** / ${maxGadgets}  •  **${totalSP}** / ${maxSP}  •  **${totalGears}** / ${maxGears}`,
        `${B2} X Niv. **${player.expLevel}**  •  Prestige **${player.totalPrestigeLevel || 0}**`,
      ].join('\n'),
      inline: false,
    })

    .addFields({
      name: 'Push',
      value: [
        `${B1} ${arrow(pushData.season)} Saison : **${fmtPush(pushData.season)}**`,
        `${B1} ${arrow(pushData.weekly)} Semaine : **${fmtPush(pushData.weekly)}**`,
        `${B2} ${arrow(pushData.daily)} Aujourd'hui : **${fmtPush(pushData.daily)}**`,
      ].join('\n'),
      inline: false,
    })

    .addFields({
      name: '25 dernières parties',
      value: (() => {
        const lines = [
          winRate !== null ? `${arrowRate(winRate)} Win rate : **${winRate}%**` : null,
          lastMode         ? `${getModeEmoji(lastModeId)} **${modeLabel(lastMode)}**` : null,
          lastBrawler      ? `Dernier brawler : **${lastBrawler}**` : null,
        ].filter(Boolean);
        if (!lines.length) return 'Aucune partie récente';
        return lines.map((l, i) => `${i < lines.length - 1 ? B1 : B2} ${l}`).join('\n');
      })(),
      inline: false,
    })

    .setFooter({ text: 'Prairie Brawl Stars • Stats en temps réel' })
    .setTimestamp();

  return { embed, player, bsTag, rntData };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profil-test')
    .setDescription('Test du nouveau profil (staff only)')
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
          content: `❌ **${target.username}** n'a pas encore lié son compte Brawl Stars.`
        });
      }

      const { embed, player, bsTag, rntData } = profileData;

      let cardAttachment = null;
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
                { id: 24, value: 0 }, { id: 25, value: 0 },
                { id: 30, value: player.totalPrestigeLevel || 0 },
                { id: 31, value: 0 }, { id: 32, value: 0 },
              ],
            },
            extra: { expLevel: player.expLevel || 1, expPoints: player.expPoints || 0, clubName: player.club?.name || '' },
            playerTag: bsTag,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
        cardAttachment = new AttachmentBuilder(cardBuffer, { name: 'profile-card.png' });
        embed.setImage('attachment://profile-card.png');
      } catch (err) {
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
      console.error('[ProfilTest]', err);
      await interaction.editReply({ content: `❌ ${err.message}` });
    }
  }
};

module.exports.buildProfileEmbed = buildProfileEmbed;
