const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getClub } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie' },
  { tag: '#2JUVYQ0YV', emoji: '⚡', name: 'Prairie Céleste' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie' },
  { tag: '#C9JUYQQY',  emoji: '🍃', name: 'Prairie Sauvage' },
];

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

function buildEmbed(allMembers, discordMap, clubFilter, page = 0) {
  const pageSize = 10;
  const totalPages = Math.ceil(allMembers.length / pageSize);
  const start = page * pageSize;
  const slice = allMembers.slice(start, start + pageSize);

  const medals = ['👑', '🥈', '🥉'];

  const lines = slice.map((m, i) => {
    const rank = start + i + 1;
    const medal = rank <= 3 ? medals[rank - 1] : `**#${rank}**`;
    const name = discordMap[m.bsTag] ? `${discordMap[m.bsTag]} *(${m.bsName})*` : m.bsName;
    const linked = discordMap[m.bsTag] ? '🔗' : '';
    return `${medal} ${linked} ${name} — 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}`;
  });

  const clubLabel = clubFilter === 'tous'
    ? 'Toute la famille Prairie'
    : PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name || clubFilter;

  const totalTrophies = allMembers.reduce((sum, m) => sum + m.trophies, 0);
  const avgTrophies = allMembers.length
    ? Math.round(totalTrophies / allMembers.length)
    : 0;

  return new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle(`🏆 Classement Prairie — ${clubLabel}`)
    .setDescription(lines.join('\n'))
    .addFields({
      name: '📊 Stats',
      value: [
        `👥 **${allMembers.length}** membres`,
        `🏆 Total : **${totalTrophies.toLocaleString('fr-FR')}**`,
        `📈 Moyenne : **${avgTrophies.toLocaleString('fr-FR')}**`,
        `🔗 Liés Discord : **${Object.keys(discordMap).length}**`,
      ].join(' • '),
      inline: false
    })
    .setFooter({ text: `Prairie Brawl Stars • Page ${page + 1}/${totalPages} • 🔗 = compte Discord lié` })
    .setTimestamp();
}

function buildComponents(clubFilter, page, totalPages) {
  // Menu filtre club
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

  // Boutons pagination
  const prevBtn = new ButtonBuilder()
    .setCustomId(`classement_prev_${page}_${clubFilter}`)
    .setLabel('◀ Précédent')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`classement_next_${page}_${clubFilter}`)
    .setLabel('Suivant ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('classement_page_info')
    .setLabel(`Page ${page + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  return [
    new ActionRowBuilder().addComponents(clubMenu),
    new ActionRowBuilder().addComponents(prevBtn, pageBtn, nextBtn),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des membres de la famille Prairie 🏆'),

  async execute(interaction) {
    await interaction.deferReply();

    const { allMembers, discordMap } = await buildClassement('tous');
    const totalPages = Math.ceil(allMembers.length / 10);
    const embed = buildEmbed(allMembers, discordMap, 'tous', 0);
    const components = buildComponents('tous', 0, totalPages);

    await interaction.editReply({ embeds: [embed], components });
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();

    const clubFilter = interaction.values[0];
    const { allMembers, discordMap } = await buildClassement(clubFilter);
    const totalPages = Math.ceil(allMembers.length / 10);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, 0);
    const components = buildComponents(clubFilter, 0, totalPages);

    await interaction.editReply({ embeds: [embed], components });
  },

  async handleButton(interaction) {
    await interaction.deferUpdate();

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const currentPage = parseInt(parts[2]);
    const clubFilter = parts[3];

    const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

    const { allMembers, discordMap } = await buildClassement(clubFilter);
    const totalPages = Math.ceil(allMembers.length / 10);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, newPage);
    const components = buildComponents(clubFilter, newPage, totalPages);

    await interaction.editReply({ embeds: [embed], components });
  }
};