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

function buildEmbed(allMembers, discordMap, clubFilter, page = 0, globalMembers = []) {
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
      const name = discordMap[m.bsTag] ? `${discordMap[m.bsTag]}` : m.bsName;
      const linked = discordMap[m.bsTag] ? ' 🔗' : '';
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank} global` : '';
      return `${medals[i]} **${name}**${linked}\n┗ 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}`;
    }).join('\n\n');

    const restLines = rest.map((m, i) => {
      const rank = i + 4;
      const name = discordMap[m.bsTag] ? `${discordMap[m.bsTag]} *(${m.bsName})*` : m.bsName;
      const linked = discordMap[m.bsTag] ? '🔗' : '';
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank}` : '';
      return `**#${rank}** ${linked} ${name} — 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}`;
    }).join('\n');

    description = `${podiumLines}\n\n─────────────────\n${restLines}`;
  } else {
    description = slice.map((m, i) => {
      const rank = start + i + 1;
      const name = discordMap[m.bsTag] ? `${discordMap[m.bsTag]} *(${m.bsName})*` : m.bsName;
      const linked = discordMap[m.bsTag] ? '🔗' : '';
      const globalRank = clubFilter !== 'tous' && globalMembers.length > 0
        ? globalMembers.findIndex(gm => gm.bsTag === m.bsTag) + 1
        : null;
      const globalStr = globalRank > 0 ? ` • 🌿 #${globalRank}` : '';
      return `**#${rank}** ${linked} ${name} — 🏆 ${m.trophies.toLocaleString('fr-FR')} • ${m.clubEmoji} ${m.clubName}${globalStr}`;
    }).join('\n');
  }

  return new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle(`🏆 Classement Prairie — ${clubLabel}`)
    .setDescription(description)
    .addFields({
      name: '📊 Stats',
      value: [
        `👥 **${allMembers.length}** membres`,
        `🏆 Total : **${totalTrophies.toLocaleString('fr-FR')}**`,
        `📈 Moyenne : **${avgTrophies.toLocaleString('fr-FR')}**`,
        `🔗 Liés Discord : **${Object.keys(discordMap).length}**`,
      ].join(' • '),
    })
    .setFooter({ text: `Prairie Brawl Stars • Page ${page + 1}/${totalPages} • 🔗 = Discord lié${clubFilter !== 'tous' ? ' • 🌿 = rang global' : ''}` })
    .setTimestamp();
}

function buildComponents(clubFilter, page, totalPages) {
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

  if (totalPages > 1) {
    const row1 = new ActionRowBuilder();
    for (let i = 0; i < Math.min(5, totalPages); i++) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`classement_goto_${i}_${clubFilter}`)
          .setLabel(`${i + 1}`)
          .setStyle(i === page ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(i === page)
      );
    }
    rows.push(row1);

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
    const totalPages = Math.ceil(allMembers.length / 30);
    const embed = buildEmbed(allMembers, discordMap, 'tous', 0, []);
    const components = buildComponents('tous', 0, totalPages);
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();
    const clubFilter = interaction.values[0];
    const { allMembers, discordMap } = await buildClassement(clubFilter);

    let globalMembers = [];
    if (clubFilter !== 'tous') {
      const { allMembers: global } = await buildClassement('tous');
      globalMembers = global;
    }

    const totalPages = Math.ceil(allMembers.length / 30);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, 0, globalMembers);
    const components = buildComponents(clubFilter, 0, totalPages);
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleButton(interaction) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split('_');
    const page = parseInt(parts[2]);
    const clubFilter = parts[3];
    const { allMembers, discordMap } = await buildClassement(clubFilter);

    let globalMembers = [];
    if (clubFilter !== 'tous') {
      const { allMembers: global } = await buildClassement('tous');
      globalMembers = global;
    }

    const totalPages = Math.ceil(allMembers.length / 30);
    const embed = buildEmbed(allMembers, discordMap, clubFilter, page, globalMembers);
    const components = buildComponents(clubFilter, page, totalPages);
    await interaction.editReply({ embeds: [embed], components });
  }
};