const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getClub } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie' },
  { tag: '#2JUVYQ0YV', emoji: '🪽', name: 'Prairie Céleste' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie' },
  { tag: '#C9JUYQQY',  emoji: '🐾', name: 'Prairie Sauvage' },
];

async function getProgressionStats(clubFilter) {
  const now = new Date();

  // Récupère le dernier snapshot de chaque type
  async function getLatestSnapshot(type) {
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies')
      .eq('type', type)
      .order('snapshot_at', { ascending: false })
      .limit(1000);
    return data || [];
  }

  async function getSeasonSnapshot() {
    // Récupère la dernière season_start
    const { data: season } = await supabase
      .from('season_starts')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1);

    if (!season?.length) return [];

    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies')
      .eq('type', 'hourly')
      .gte('snapshot_at', season[0].started_at)
      .order('snapshot_at', { ascending: true })
      .limit(1000);
    return data || [];
  }

  const [daily, weekly, season, current] = await Promise.all([
    getLatestSnapshot('daily'),
    getLatestSnapshot('weekly'),
    getSeasonSnapshot(),
    supabase.from('trophies_snapshots')
      .select('bs_tag, trophies, club_name')
      .eq('type', 'hourly')
      .order('snapshot_at', { ascending: false })
      .limit(1000)
      .then(r => r.data || []),
  ]);

  // Filtre par club si nécessaire
  const filterByClub = (rows) => {
    if (clubFilter === 'tous') return rows;
    const clubName = PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name;
    return rows.filter(r => r.club_name === clubName);
  };

  const currentFiltered = filterByClub(current);
  const tags = new Set(currentFiltered.map(r => r.bs_tag));

  const sum = (rows) => rows
    .filter(r => tags.has(r.bs_tag))
    .reduce((acc, r) => acc + r.trophies, 0);

  const currentTotal = sum(currentFiltered);

  // Pour chaque snapshot, prend le plus ancien par membre (premier snapshot du type)
  const firstByTag = (rows) => {
    const map = {};
    for (const r of rows) {
      if (tags.has(r.bs_tag) && !map[r.bs_tag]) map[r.bs_tag] = r.trophies;
    }
    return Object.values(map).reduce((a, b) => a + b, 0);
  };

  const dailyTotal = firstByTag(daily);
  const weeklyTotal = firstByTag(weekly);
  const seasonTotal = firstByTag(season);

  return {
    today: dailyTotal ? currentTotal - dailyTotal : null,
    week: weeklyTotal ? currentTotal - weeklyTotal : null,
    season: seasonTotal ? currentTotal - seasonTotal : null,
  };
}

async function buildClassement(clubFilter = 'tous') {
  const clubsToFetch = clubFilter === 'tous'
    ? PRAIRIE_CLUBS
    : PRAIRIE_CLUBS.filter(c => c.tag === clubFilter);

  let allMembers = [];

  for (const club of clubsToFetch) {
    try {
      const clubData = await getClub(club.tag);
      const members = (clubData.members || []).map(m => ({
        bsTag: m.tag,
        bsName: m.name,
        trophies: m.trophies,
        role: m.role,
        clubName: clubData.name,
        clubEmoji: club.emoji,
      }));
      allMembers = [...allMembers, ...members];
    } catch (err) {
      console.error(`[Classement] Erreur club ${club.name}:`, err.message);
    }
  }

  const { data: linkedMembers } = await supabase
    .from('members')
    .select('discord_username, brawlstars_tag')
    .not('brawlstars_tag', 'is', null);

  const discordMap = {};
  if (linkedMembers) {
    for (const m of linkedMembers) {
      discordMap[m.brawlstars_tag] = m.discord_username;
    }
  }

  allMembers.sort((a, b) => b.trophies - a.trophies);
  return { allMembers, discordMap };
}

async function getRequesterBsTag(userId) {
  const { data } = await supabase
    .from('members')
    .select('brawlstars_tag')
    .eq('discord_id', userId)
    .maybeSingle();
  return data?.brawlstars_tag || null;
}

function buildEmbed(allMembers, discordMap, clubFilter, page = 0, globalMembers = [], requesterBsTag = null, progression = null) {
  const pageSize = 30;
  const totalPages = Math.ceil(allMembers.length / pageSize);
  const start = page * pageSize;
  const slice = allMembers.slice(start, start + pageSize);

  const clubLabel = clubFilter === 'tous'
    ? 'Toute la famille Prairie'
    : PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name || clubFilter;

  const totalTrophies = allMembers.reduce((sum, m) => sum + m.trophies, 0);
  const avgTrophies = allMembers.length
    ? Math.round(totalTrophies / allMembers.length)
    : 0;

  let description = '';

  if (page === 0) {
    const podium = slice.slice(0, 3);
    const rest = slice.slice(3);

    const podiumLines = podium.map((m, i) => {
      const medals = ['👑', '🥈', '🥉'];
      const name = discordMap[m.bsTag] ? `${m.bsName} *(${discordMap[m.bsTag]})*` : m.bsName;
      const linked = discordMap[m.bsTag] ? ' 🔗' : '';
      const isRequester = m.bsTag === requesterBsTag;
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank} global` : '';
      const highlight = isRequester ? ' 👈 **toi**' : '';
      return `${medals[i]} **${name}**${linked}${highlight}\n┗ 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}`;
    }).join('\n\n');

    const restLines = rest.map((m, i) => {
      const rank = i + 4;
      const name = discordMap[m.bsTag] ? `${m.bsName} *(${discordMap[m.bsTag]})*` : m.bsName;
      const linked = discordMap[m.bsTag] ? '🔗' : '';
      const isRequester = m.bsTag === requesterBsTag;
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank}` : '';
      const highlight = isRequester ? ' 👈 **toi**' : '';
      return `**#${rank}** ${linked} ${name} — 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}${highlight}`;
    }).join('\n');

    description = podiumLines + (restLines ? `\n\n─────────────────\n${restLines}` : '');
  } else {
    description = slice.map((m, i) => {
      const rank = start + i + 1;
      const name = discordMap[m.bsTag] ? `${m.bsName} *(${discordMap[m.bsTag]})*` : m.bsName;
      const linked = discordMap[m.bsTag] ? '🔗' : '';
      const isRequester = m.bsTag === requesterBsTag;
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank}` : '';
      const highlight = isRequester ? ' 👈 **toi**' : '';
      return `**#${rank}** ${linked} ${name} — 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}${highlight}`;
    }).join('\n');
  }

  const myRank = requesterBsTag
    ? allMembers.findIndex(m => m.bsTag === requesterBsTag) + 1
    : null;

  const myRankStr = myRank > 0
    ? `\n👤 Ton rang : **#${myRank}** / ${allMembers.length}`
    : '';

  const formatProg = (val) => val === null ? '—' : val >= 0 ? `+${val.toLocaleString('fr-FR')}` : val.toLocaleString('fr-FR');
  
  return new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle(`🏆 Classement Prairie — ${clubLabel}`)
    .setDescription(description || '\u200b')
    .addFields({
      name: '📊 Stats',
      value: [
        `👥 **${allMembers.length}** membres • 🏆 Total : **${totalTrophies.toLocaleString('fr-FR')}** • 📈 Moyenne : **${avgTrophies.toLocaleString('fr-FR')}**`,
        `🔗 Liés Discord : **${Object.keys(discordMap).length}**` + myRankStr,
        progression ? `🔥 Aujourd'hui : **${formatProg(progression.today)}** • 📅 Cette semaine : **${formatProg(progression.week)}** • 🏆 Cette saison : **${formatProg(progression.season)}**` : '',
      ].filter(Boolean).join('\n\n'),
    })
    .setFooter({ text: `Prairie Brawl Stars • Page ${page + 1}/${totalPages} • 🔗 = Discord lié${clubFilter !== 'tous' ? ' • 🌿 = rang global' : ''}` })
    .setTimestamp();
}

function buildComponents(clubFilter, page, totalPages, fromProfil = false) {
  const rows = [];

  const clubMenu = new StringSelectMenuBuilder()
    .setCustomId(`classement_club_${page}`)
    .setPlaceholder('🌿 Filtrer par club')
    .addOptions([
      { label: '🌿 Toute la famille', value: 'tous', default: clubFilter === 'tous' },
      ...PRAIRIE_CLUBS.map(c => ({
        label: `${c.emoji} ${c.name}`,
        value: c.tag,
        default: c.tag === clubFilter
      }))
    ]);

  rows.push(new ActionRowBuilder().addComponents(clubMenu));

  const row1 = new ActionRowBuilder();

  // Bouton retour profil uniquement si on vient du profil
  if (fromProfil) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`classement_profil`)
        .setLabel('👤 Mon profil')
        .setStyle(ButtonStyle.Success)
    );
  }

  if (totalPages > 1) {
    const maxBtns = fromProfil ? 4 : 5;
    for (let i = 0; i < Math.min(maxBtns, totalPages); i++) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`classement_goto_${i}_${clubFilter}`)
          .setLabel(`${i + 1}`)
          .setStyle(i === page ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(i === page)
      );
    }
  }

  if (row1.components.length > 0) rows.push(row1);

  if (totalPages > 5) {
    const row2 = new ActionRowBuilder();
    for (let i = 5; i < Math.min(10, totalPages); i++) {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(`classement_goto_${i}_${clubFilter}`)
          .setLabel(`${i + 1}`)
          .setStyle(i === page ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(i === page)
      );
    }
    rows.push(row2);
  }

  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des membres de la famille Prairie 🏆'),

  async execute(interaction) {
    await interaction.deferReply();
    const { allMembers, discordMap } = await buildClassement('tous');
    const requesterBsTag = await getRequesterBsTag(interaction.user.id);
    const totalPages = Math.ceil(allMembers.length / 30);
    const progression = await getProgressionStats('tous');
    const embed = buildEmbed(allMembers, discordMap, 'tous', 0, [], requesterBsTag, progression);
    const components = buildComponents('tous', 0, totalPages);
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();
    const clubFilter = interaction.values[0];
    const fromProfil = interaction.customId.includes('fromprofil');
    const { allMembers, discordMap } = await buildClassement(clubFilter);
    const requesterBsTag = await getRequesterBsTag(interaction.user.id);

    let globalMembers = [];
    if (clubFilter !== 'tous') {
      const { allMembers: global } = await buildClassement('tous');
      globalMembers = global;
    }

    const totalPages = Math.ceil(allMembers.length / 30);
    const progression = await getProgressionStats(clubFilter);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, 0, globalMembers, requesterBsTag, progression);
    const components = buildComponents(clubFilter, 0, totalPages, fromProfil);
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleButton(interaction) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split('_');
    console.log('[handleButton] customId:', interaction.customId);
    console.log('[handleButton] parts:', parts);
    const page = parseInt(parts[2]);
    const fromProfil = interaction.customId.endsWith('_fromprofil');
    const clubFilter = fromProfil
      ? parts.slice(3, -1).join('_')
      : parts.slice(3).join('_');
    console.log('[handleButton] page:', page, 'clubFilter:', clubFilter, 'fromProfil:', fromProfil);
    const { allMembers, discordMap } = await buildClassement(clubFilter);
    const requesterBsTag = await getRequesterBsTag(interaction.user.id);

    let globalMembers = [];
    if (clubFilter !== 'tous') {
      const { allMembers: global } = await buildClassement('tous');
      globalMembers = global;
    }

    const totalPages = Math.ceil(allMembers.length / 30);
    const progression = await getProgressionStats(clubFilter);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, page, globalMembers, requesterBsTag, progression);
    const components = buildComponents(clubFilter, page, totalPages, fromProfil);
    await interaction.editReply({ embeds: [embed], components });
  }
};