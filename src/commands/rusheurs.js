const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { supabase } = require('../lib/supabase');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie fleurie' },
  { tag: '#2JUVYQ0YV', emoji: '🪽', name: 'Prairie Céleste' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie' },
  { tag: '#C9JUYQQY',  emoji: '🐾', name: 'Prairie Sauvage' },
];

const PERIODES = [
  { label: 'Aujourd\'hui', value: 'daily', emoji: '🔥' },
  { label: 'Cette semaine', value: 'weekly', emoji: '📅' },
  { label: 'Ce mois', value: 'monthly', emoji: '📆' },
  { label: 'Cette saison', value: 'season', emoji: '🏆' },
];

async function getRusheurs(clubFilter, periode) {
  // Récupère snapshot de référence
  async function getRefRows() {
    if (periode === 'season') {
      const { data: season } = await supabase
        .from('season_starts')
        .select('started_at')
        .order('started_at', { ascending: false })
        .limit(1);
      if (!season?.length) return [];

      const { data } = await supabase
        .from('trophies_snapshots')
        .select('bs_tag, trophies, club_name')
        .eq('type', 'hourly')
        .gte('snapshot_at', season[0].started_at)
        .order('snapshot_at', { ascending: true })
        .limit(1000);

      const map = {};
      for (const r of (data || [])) {
        if (!map[r.bs_tag]) map[r.bs_tag] = r;
      }
      return Object.values(map);
    }

    const typeMap = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies, club_name')
      .eq('type', typeMap[periode])
      .order('snapshot_at', { ascending: false })
      .limit(1000);

    const map = {};
    for (const r of (data || [])) {
      if (!map[r.bs_tag]) map[r.bs_tag] = r;
    }
    return Object.values(map);
  }

  // Trophées actuels
  async function getCurrentRows() {
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, bs_name, trophies, club_name')
      .eq('type', 'hourly')
      .order('snapshot_at', { ascending: false })
      .limit(1000);

    const map = {};
    for (const r of (data || [])) {
      if (!map[r.bs_tag]) map[r.bs_tag] = r;
    }
    return Object.values(map);
  }

  const [refRows, currentRows] = await Promise.all([getRefRows(), getCurrentRows()]);

  const refMap = {};
  for (const r of refRows) refMap[r.bs_tag] = r.trophies;

  // Calcule progression par membre
  let rusheurs = currentRows
    .filter(r => refMap[r.bs_tag] !== undefined)
    .map(r => ({
        bsTag: r.bs_tag,
        bsName: r.bs_name || null,
        clubName: r.club_name,
        clubEmoji: PRAIRIE_CLUBS.find(c => c.name === r.club_name)?.emoji || '🌿',
        progression: r.trophies - refMap[r.bs_tag],
        trophies: r.trophies,
  }))
    .filter(r => r.progression > 0);

  // Filtre par club
  if (clubFilter !== 'tous') {
    const clubName = PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name;
    rusheurs = rusheurs.filter(r => r.clubName === clubName);
  }

  // Récupère les pseudos Discord
  const { data: members } = await supabase
    .from('members')
    .select('brawlstars_tag, discord_username')
    .not('brawlstars_tag', 'is', null);

  const discordMap = {};
  for (const m of (members || [])) discordMap[m.brawlstars_tag] = m.discord_username;

  rusheurs.sort((a, b) => b.progression - a.progression);

  return rusheurs.map(r => ({
    ...r,
    discordName: discordMap[r.bsTag] || null,
  }));
}

function buildEmbed(rusheurs, clubFilter, periode) {
  const periodeLabel = PERIODES.find(p => p.value === periode);
  const clubLabel = clubFilter === 'tous'
    ? 'Toute la famille Prairie'
    : PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name;

  if (!rusheurs.length) {
    return new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('🔥 Classement Rusheurs')
      .setDescription(`Pas encore de données pour cette période.\nLes stats se remplissent au fil du temps !`)
      .addFields(
        { name: '🌿 Périmètre', value: clubLabel, inline: true },
        { name: `${periodeLabel.emoji} Période`, value: periodeLabel.label, inline: true },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Les données daily/weekly arrivent à minuit' })
      .setTimestamp();
  }

  // Rois du push — #1 de chaque club (uniquement vue globale + saison)
  let roisSection = '';
  if (clubFilter === 'tous' && periode === 'season') {
    const rois = [];
    for (const club of PRAIRIE_CLUBS) {
      const roi = rusheurs.find(r => r.clubName === club.name);
      if (roi) {
        const name = roi.discordName || roi.bsName || roi.bsTag;
        rois.push(`${club.emoji} **${name}** • +${roi.progression.toLocaleString('fr-FR')} 🏆`);
      }
    }
    if (rois.length) {
      roisSection = `👑 **ROIS DU PUSH ACTUELS**\n${rois.join('\n')}\n\u200b`;
    }
  }

  // Podium
  const medals = ['👑', '🥈', '🥉'];
  const podiumLines = rusheurs.slice(0, 3).map((r, i) => {
    const name = r.discordName ? `**${r.discordName}** *(${r.bsName || r.bsTag})*` : `**${r.bsName || r.bsTag}**`;
    return [
      `${medals[i]} ${name}`,
      `┗ +${r.progression.toLocaleString('fr-FR')} 🏆  •  ${r.trophies.toLocaleString('fr-FR')} total  •  ${r.clubEmoji} ${r.clubName}`,
    ].join('\n');
  }).join('\n\n');

  // Reste
  const restLines = rusheurs.slice(3, 30).map((r, i) => {
    const name = r.discordName ? `${r.discordName} *(${r.bsName || r.bsTag})*` : (r.bsName || r.bsTag);
    return `\`#${i + 4}\` ${r.clubEmoji} **${name}** • +${r.progression.toLocaleString('fr-FR')} 🏆 • ${r.trophies.toLocaleString('fr-FR')} total`;
  }).join('\n');

  const totalPush = rusheurs.reduce((a, r) => a + r.progression, 0);

  const description = [
    roisSection,
    roisSection ? '━━━━━━━━━━━━━━━━━━━━━━' : '',
    podiumLines,
    '\u200b',
    '━━━━━━━━━━━━━━━━━━━━━━',
    restLines,
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle(`🔥 Classement Rusheurs — ${periodeLabel.emoji} ${periodeLabel.label}`)
    .setDescription(description)
    .addFields({
      name: '\u200b',
      value: [
        `🌿 **${clubLabel}**  •  👥 **${rusheurs.length}** rusheurs actifs  •  🏆 **+${totalPush.toLocaleString('fr-FR')}** pushés`,
      ].join('\n'),
    })
    .setFooter({ text: 'Prairie Brawl Stars • Classement rusheurs' })
    .setTimestamp();
}

function buildComponents(clubFilter, periode) {
  const clubMenu = new StringSelectMenuBuilder()
    .setCustomId(`rusheurs_club_${periode}`)
    .setPlaceholder('🌿 Filtrer par club')
    .addOptions([
      { label: '🌿 Toute la famille', value: 'tous', default: clubFilter === 'tous' },
      ...PRAIRIE_CLUBS.map(c => ({
        label: `${c.emoji} ${c.name}`,
        value: c.tag,
        default: c.tag === clubFilter,
      })),
    ]);

  const periodeMenu = new StringSelectMenuBuilder()
    .setCustomId(`rusheurs_periode_${clubFilter}`)
    .setPlaceholder('📅 Période')
    .addOptions(
      PERIODES.map(p => ({
        label: `${p.emoji} ${p.label}`,
        value: p.value,
        default: p.value === periode,
      }))
    );

  return [
    new ActionRowBuilder().addComponents(clubMenu),
    new ActionRowBuilder().addComponents(periodeMenu),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rusheurs')
    .setDescription('Classement des rusheurs Prairie 🔥'),

  async execute(interaction) {
    await interaction.deferReply();
    const rusheurs = await getRusheurs('tous', 'season');
    const embed = buildEmbed(rusheurs, 'tous', 'season');
    const components = buildComponents('tous', 'season');
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();
    const [, type, otherFilter] = interaction.customId.split('_');
    const selected = interaction.values[0];

    let clubFilter, periode;
    if (type === 'club') {
      clubFilter = selected;
      periode = otherFilter;
    } else {
      clubFilter = otherFilter;
      periode = selected;
    }

    const rusheurs = await getRusheurs(clubFilter, periode);
    const embed = buildEmbed(rusheurs, clubFilter, periode);
    const components = buildComponents(clubFilter, periode);
    await interaction.editReply({ embeds: [embed], components });
  },
};