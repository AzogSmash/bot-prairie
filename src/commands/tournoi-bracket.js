const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { supabase } = require('../lib/supabase');
const { sendOrUpdateBracketImage } = require('../modules/tournoiParticipants');
const { recalculateScores } = require('../lib/tournoiScores');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getActiveTournament() {
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', ['open', 'started'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

function getRoundLabel(round, maxRound) {
  if (round === 99) return 'Finale';
  if (round === maxRound) return 'Finale de poule';
  if (round === maxRound - 1) return 'Demi-finale';
  if (round === maxRound - 2) return 'Quart de finale';
  return `Round ${round}`;
}

function getSideLabel(side) {
  if (side === 'left') return '⬅️ Gauche';
  if (side === 'right') return '➡️ Droite';
  return '🏆 Finale';
}

// ── Top elo par équipe ────────────────────────────────────────────────────────
async function buildTopEloMap(tournamentId) {
  const { data: members } = await supabase
    .from('tournament_team_members')
    .select('team_id, discord_username, elo')
    .eq('tournament_id', tournamentId)
    .eq('is_substitute', false);

  const topMap = {};
  for (const m of (members || [])) {
    if (!topMap[m.team_id] || m.elo > topMap[m.team_id].elo) {
      topMap[m.team_id] = { username: m.discord_username, elo: m.elo };
    }
  }
  return topMap;
}

function getTeamLabel(teamId, teamMap, topEloMap) {
  if (!teamId) return '?';
  const top = topEloMap[teamId];
  if (top) return top.username;
  return teamMap[teamId]?.name ?? '?';
}

// ── Build embed ───────────────────────────────────────────────────────────────
async function buildBracketEmbed(tournament, matches, teams, topEloMap) {
  const teamMap = {};
  for (const t of (teams || [])) teamMap[t.id] = t;

  const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));
  const sides = ['left', 'right', 'final'];
  const fields = [];

  for (const side of sides) {
    const sideMatches = matches
      .filter(m => m.side === side)
      .sort((a, b) => a.round - b.round || a.match_order - b.match_order);

    if (!sideMatches.length) continue;

    const lines = sideMatches.map((m, i) => {
      const t1name = m.team1_id ? getTeamLabel(m.team1_id, teamMap, topEloMap) : null;
      const t2name = m.team2_id ? getTeamLabel(m.team2_id, teamMap, topEloMap) : null;
      const winnerName = m.winner_id ? getTeamLabel(m.winner_id, teamMap, topEloMap) : null;

      const status = m.status === 'finished'
        ? `✅ **${winnerName ?? '?'}**`
        : m.status === 'ongoing'
          ? '🔴 En cours'
          : '⏳ En attente';

      const roundLabel = getRoundLabel(m.round, maxRound);
      const matchNum = i + 1;

      if (!t1name || !t2name) return `\`#${matchNum}\` ${roundLabel} — *En attente des rounds précédents*`;
      return `\`#${matchNum}\` **${roundLabel}** — ${t1name} vs ${t2name} — ${status}`;
    });

    fields.push({
      name: getSideLabel(side),
      value: lines.join('\n') || 'Aucun match',
      inline: false,
    });
  }

  const pending  = matches.filter(m => m.status === 'pending' && m.team1_id && m.team2_id).length;
  const finished = matches.filter(m => m.status === 'finished').length;

  return new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle(`🏆 Bracket — ${tournament.name}`)
    .setDescription(`**${finished}/${matches.length}** matchs terminés`)
    .addFields(fields)
    .setFooter({ text: `${pending} match(s) en attente de résultat • Staff : utilisez le menu ci-dessous` })
    .setTimestamp();
}

// ── Commande principale ───────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi-bracket')
    .setDescription('Affiche le bracket du tournoi en cours'),

  async execute(interaction) {
    await interaction.deferReply();

    const tournament = await getActiveTournament();
    if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

    const { data: matches } = await supabase
      .from('tournament_matches').select('*').eq('tournament_id', tournament.id)
      .order('side').order('round').order('match_order');

    const { data: teams } = await supabase
      .from('tournament_teams').select('*').eq('tournament_id', tournament.id);

    if (!matches?.length) return interaction.editReply({ content: '❌ Le bracket n\'est pas encore généré.' });

    const topEloMap = await buildTopEloMap(tournament.id);
    const embed = await buildBracketEmbed(tournament, matches, teams, topEloMap);
    const components = buildComponents(tournament, matches, teams, topEloMap, interaction.member);

    await interaction.editReply({ embeds: [embed], components });
    sendOrUpdateBracketImage(interaction.client, tournament).catch(() => {});
  },

  async handleSelect(interaction) {
    if (interaction.customId.startsWith('bracket_match_')) return handleMatchSelect(interaction);
    if (interaction.customId.startsWith('bracket_winner_')) return handleWinnerSelect(interaction);
  },

  async handleButton(interaction) {
    if (interaction.customId === 'bracket_refresh') {
      await interaction.deferUpdate();
      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.', components: [] });

      const { data: matches } = await supabase
        .from('tournament_matches').select('*').eq('tournament_id', tournament.id)
        .order('side').order('round').order('match_order');

      const { data: teams } = await supabase
        .from('tournament_teams').select('*').eq('tournament_id', tournament.id);

      const topEloMap = await buildTopEloMap(tournament.id);
      const embed = await buildBracketEmbed(tournament, matches, teams, topEloMap);
      const components = buildComponents(tournament, matches, teams, topEloMap, interaction.member);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    if (interaction.customId === 'bracket_edit_mode') {
      await interaction.deferUpdate();
      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.', components: [] });

      const { data: matches } = await supabase
        .from('tournament_matches').select('*').eq('tournament_id', tournament.id)
        .order('side').order('round').order('match_order');

      const { data: teams } = await supabase
        .from('tournament_teams').select('*').eq('tournament_id', tournament.id);

      const topEloMap = await buildTopEloMap(tournament.id);
      const finishedMatches = matches.filter(m => m.status === 'finished' && m.team1_id && m.team2_id);
      const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));

      const embed = await buildBracketEmbed(tournament, matches, teams, topEloMap);
      embed.setDescription('✏️ **Quel résultat veux-tu modifier ?**');

      const components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('bracket_refresh')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Secondary)
        ),
      ];

      if (finishedMatches.length > 0) {
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`bracket_match_${tournament.id}`)
          .setPlaceholder('Choisis le match à corriger')
          .addOptions(
            finishedMatches.slice(0, 25).map(m => {
              const t1 = getTeamLabel(m.team1_id, {}, topEloMap);
              const t2 = getTeamLabel(m.team2_id, {}, topEloMap);
              const sideLabel = m.side === 'left' ? '<' : m.side === 'right' ? '>' : 'F';
              return { label: `${sideLabel} ${getRoundLabel(m.round, maxRound)} — ${t1} vs ${t2}`, value: m.id };
            })
          );
        components.push(new ActionRowBuilder().addComponents(menu));
      }

      await interaction.editReply({ embeds: [embed], components });
      return;
    }
  },
};

// ── Composants ────────────────────────────────────────────────────────────────
function buildComponents(tournament, matches, teams, topEloMap, member) {
  const isStaff = member?.permissions?.has(PermissionFlagsBits.ManageRoles);
  const components = [];

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bracket_edit_mode')
      .setLabel('✏️ Modifier un résultat')
      .setStyle(ButtonStyle.Secondary)
  ));

  if (isStaff) {
    const teamMap = {};
    for (const t of (teams || [])) teamMap[t.id] = t;

    const pendingMatches = matches.filter(m => m.status !== 'finished' && m.team1_id && m.team2_id);

    if (pendingMatches.length > 0) {
      const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`bracket_match_${tournament.id}`)
        .setPlaceholder('🛡️ Staff — Entrer le résultat d\'un match')
        .addOptions(
          pendingMatches.slice(0, 25).map(m => {
            const t1 = getTeamLabel(m.team1_id, teamMap, topEloMap);
            const t2 = getTeamLabel(m.team2_id, teamMap, topEloMap);
            const roundLabel = getRoundLabel(m.round, maxRound);
            const sideLabel = m.side === 'left' ? '⬅️' : m.side === 'right' ? '➡️' : '🏆';
            return { label: `${sideLabel} ${roundLabel} — ${t1} vs ${t2}`, value: m.id };
          })
        );

      components.push(new ActionRowBuilder().addComponents(menu));
    }
  }

  return components;
}

// ── Sélection du match ────────────────────────────────────────────────────────
async function handleMatchSelect(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '❌ Seul le staff peut entrer ou modifier des résultats.', flags: 64 });
  }
  await interaction.deferUpdate();

  const matchId      = interaction.values[0];
  const tournamentId = interaction.customId.split('_')[2];

  const { data: match } = await supabase
    .from('tournament_matches').select('*').eq('id', matchId).single();

  if (!match) return interaction.editReply({ content: '❌ Match introuvable.', components: [] });

  const tournament = await getActiveTournament();
  const { data: matches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const { data: teams } = await supabase
    .from('tournament_teams').select('*').eq('tournament_id', tournamentId);

  const topEloMap = await buildTopEloMap(tournamentId);
  const t1name = getTeamLabel(match.team1_id, {}, topEloMap);
  const t2name = getTeamLabel(match.team2_id, {}, topEloMap);

  const embed = await buildBracketEmbed(tournament, matches, teams, topEloMap);
  embed.setDescription(`**Qui a gagné ?**\n\n🆚 **${t1name}** vs **${t2name}**`);

  const winnerMenu = new StringSelectMenuBuilder()
    .setCustomId(`bracket_winner_${tournamentId}_${matchId}`)
    .setPlaceholder('Choisis le gagnant')
    .addOptions([
      { label: `🏆 ${t1name}`, value: match.team1_id },
      { label: `🏆 ${t2name}`, value: match.team2_id },
    ]);

  await interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(winnerMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bracket_refresh').setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary)
      ),
    ],
  });
}

// ── Propagation via next_match_id ─────────────────────────────────────────────
async function propagateWinner(finishedMatch, winnerId) {
  if (!finishedMatch.next_match_id) return;

  const updateField = finishedMatch.next_slot === 1
    ? { team1_id: winnerId }
    : { team2_id: winnerId };

  await supabase
    .from('tournament_matches')
    .update(updateField)
    .eq('id', finishedMatch.next_match_id);
}

// ── Sélection du gagnant ──────────────────────────────────────────────────────
async function handleWinnerSelect(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '❌ Seul le staff peut entrer ou modifier des résultats.', flags: 64 });
  }
  await interaction.deferUpdate();

  const parts        = interaction.customId.split('_');
  const tournamentId = parts[2];
  const matchId      = parts[3];
  const winnerId     = interaction.values[0];

  const { data: finishedMatch } = await supabase
    .from('tournament_matches').select('*').eq('id', matchId).single();

  await supabase
    .from('tournament_matches')
    .update({ winner_id: winnerId, status: 'finished' })
    .eq('id', matchId);

  if (finishedMatch) {
    await propagateWinner(finishedMatch, winnerId);
  }

  await recalculateScores(tournamentId);

  const tournament = await getActiveTournament();
  const { data: matches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const { data: teams } = await supabase
    .from('tournament_teams').select('*').eq('tournament_id', tournamentId);

  const topEloMap  = await buildTopEloMap(tournamentId);
  const winnerName = getTeamLabel(winnerId, {}, topEloMap);

  const embed = await buildBracketEmbed(tournament, matches, teams, topEloMap);
  embed.setDescription(`✅ **${winnerName}** remporte le match !\n\n**${matches.filter(m => m.status === 'finished').length}/${matches.length}** matchs terminés`);

  const components = buildComponents(tournament, matches, teams, topEloMap, interaction.member);
  await interaction.editReply({ embeds: [embed], components });

  sendOrUpdateBracketImage(interaction.client, tournament).catch(() => {});
}

