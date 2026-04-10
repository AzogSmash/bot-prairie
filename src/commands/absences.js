const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../lib/supabase');

const CLUBS = [
  { label: '🌿 Tous les clubs', value: 'tous' },
  { label: '🌟 Prairie Étoilée', value: 'Prairie Étoilée' },
  { label: '🌿 Prairie Fleurie', value: 'Prairie fleurie' },
  { label: '⚡ Prairie Céleste', value: 'Prairie Céleste' },
  { label: '❄️ Prairie Gelée', value: 'Prairie Gelée' },
  { label: '🔥 Prairie Brûlée', value: 'Prairie Brûlée' },
  { label: '🌱 Mini Prairie', value: 'Mini Prairie' },
  { label: '🍃 Prairie Sauvage', value: 'Prairie Sauvage' },
];

const PERIODES = [
  { label: '📅 Toutes les périodes', value: 'tous' },
  { label: '🔴 En ce moment', value: 'encours' },
  { label: '📆 Ce mois-ci', value: 'mois' },
  { label: '📆 Mois prochain', value: 'prochain' },
  { label: '📆 Dans 2 mois+', value: 'futur' },
];

async function fetchAbsences(clubFilter, periodeFilter) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let query = supabase
    .from('absences')
    .select('*')
    .eq('active', true)
    .gte('date_fin', todayStr)
    .order('date_debut', { ascending: true });

  // Filtre période
  if (periodeFilter === 'encours') {
    query = query.lte('date_debut', todayStr).gte('date_fin', todayStr);
  } else if (periodeFilter === 'mois') {
    const debut = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const fin = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    query = query.gte('date_debut', debut).lte('date_debut', fin);
  } else if (periodeFilter === 'prochain') {
    const debut = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0];
    const fin = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split('T')[0];
    query = query.gte('date_debut', debut).lte('date_debut', fin);
  } else if (periodeFilter === 'futur') {
    const debut = new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString().split('T')[0];
    query = query.gte('date_debut', debut);
  }

  const { data: absences } = await query;
  if (!absences || absences.length === 0) return [];

  // Enrichit avec club BS
  const ids = absences.map(a => a.discord_id);
  const { data: members } = await supabase
    .from('members')
    .select('discord_id, club_name, brawlstars_trophies')
    .in('discord_id', ids);

  let enriched = absences.map(a => {
    const member = members?.find(m => m.discord_id === a.discord_id);
    return {
      ...a,
      club_name: member?.club_name || 'Sans club',
      trophies: member?.brawlstars_trophies,
    };
  });

  // Filtre club
  if (clubFilter !== 'tous') {
    enriched = enriched.filter(a =>
      a.club_name.toLowerCase() === clubFilter.toLowerCase()
    );
  }

  return enriched;
}

function formatLine(a) {
  const debut = Math.floor(new Date(a.date_debut).getTime() / 1000);
  const fin = Math.floor(new Date(a.date_fin).getTime() / 1000);
  const duree = Math.ceil((new Date(a.date_fin) - new Date(a.date_debut)) / (1000 * 60 * 60 * 24)) + 1;
  const trophies = a.trophies ? ` • 🏆 ${a.trophies.toLocaleString('fr-FR')}` : '';
  const raison = a.raison && a.raison !== 'Non précisée' ? `\n> _${a.raison}_` : '';
  return `👤 **${a.discord_username}** • 🌿 ${a.club_name}${trophies}\n📅 <t:${debut}:D> → <t:${fin}:D> • ⏳ ${duree}j${raison}`;
}

function buildEmbed(absences, clubFilter, periodeFilter) {
  const clubLabel = CLUBS.find(c => c.value === clubFilter)?.label || 'Tous';
  const periodeLabel = PERIODES.find(p => p.value === periodeFilter)?.label || 'Toutes';

  if (absences.length === 0) {
    return new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📋 Absences Prairie')
      .setDescription('✅ Aucune absence pour ces filtres !')
      .addFields(
        { name: '🌿 Club', value: clubLabel, inline: true },
        { name: '📅 Période', value: periodeLabel, inline: true },
      )
      .setFooter({ text: 'Prairie Brawl Stars • /absence pour déclarer la tienne' })
      .setTimestamp();
  }

  // Groupe par club
  const grouped = {};
  for (const a of absences) {
    const club = a.club_name || 'Sans club';
    if (!grouped[club]) grouped[club] = [];
    grouped[club].push(a);
  }

  const embed = new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle(`📋 Absences Prairie — ${absences.length} membre(s)`)
    .addFields(
      { name: '🌿 Club', value: clubLabel, inline: true },
      { name: '📅 Période', value: periodeLabel, inline: true },
    );

  for (const [club, membres] of Object.entries(grouped)) {
    embed.addFields({
      name: `${club} (${membres.length})`,
      value: membres.map(formatLine).join('\n\n'),
      inline: false,
    });
  }

  embed
    .setFooter({ text: 'Prairie Brawl Stars • /absence pour déclarer la tienne' })
    .setTimestamp();

  return embed;
}

function buildRows(clubFilter, periodeFilter) {
  const clubMenu = new StringSelectMenuBuilder()
    .setCustomId(`absences_club_${periodeFilter}`)
    .setPlaceholder('🌿 Filtrer par club')
    .addOptions(CLUBS.map(c => ({ ...c, default: c.value === clubFilter })));

  const periodeMenu = new StringSelectMenuBuilder()
    .setCustomId(`absences_periode_${clubFilter}`)
    .setPlaceholder('📅 Filtrer par période')
    .addOptions(PERIODES.map(p => ({ ...p, default: p.value === periodeFilter })));

  return [
    new ActionRowBuilder().addComponents(clubMenu),
    new ActionRowBuilder().addComponents(periodeMenu),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('absences')
    .setDescription('Liste les absences Prairie avec filtres 📋'),

  async execute(interaction) {
    await interaction.deferReply();

    const absences = await fetchAbsences('tous', 'tous');
    const embed = buildEmbed(absences, 'tous', 'tous');
    const rows = buildRows('tous', 'tous');

    await interaction.editReply({ embeds: [embed], components: rows });
  },

  // Handlers pour les menus déroulants — à appeler depuis index.js
  async handleSelect(interaction) {
    await interaction.deferUpdate();

    const [, type, otherFilter] = interaction.customId.split('_');
    const selected = interaction.values[0];

    let clubFilter, periodeFilter;
    if (type === 'club') {
      clubFilter = selected;
      periodeFilter = otherFilter;
    } else {
      clubFilter = otherFilter;
      periodeFilter = selected;
    }

    const absences = await fetchAbsences(clubFilter, periodeFilter);
    const embed = buildEmbed(absences, clubFilter, periodeFilter);
    const rows = buildRows(clubFilter, periodeFilter);

    await interaction.editReply({ embeds: [embed], components: rows });
  }
};