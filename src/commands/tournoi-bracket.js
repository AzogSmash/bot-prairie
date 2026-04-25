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

async function buildBracketEmbed(tournament, matches, teams) {
  const teamMap = {};
  for (const t of (teams || [])) teamMap[t.id] = t;

  const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));

  // Groupe par side puis round
  const sides = ['left', 'right', 'final'];
  const fields = [];

  for (const side of sides) {
    const sideMatches = matches
      .filter(m => m.side === side)
      .sort((a, b) => a.round - b.round || a.match_order - b.match_order);

    if (!sideMatches.length) continue;

    const lines = sideMatches.map((m, i) => {
      const t1 = teamMap[m.team1_id];
      const t2 = teamMap[m.team2_id];
      const winner = teamMap[m.winner_id];
      const status = m.status === 'finished'
        ? `✅ **${winner?.name ?? '?'}**`
        : m.status === 'ongoing'
          ? '🔴 En cours'
          : '⏳ En attente';

      const roundLabel = getRoundLabel(m.round, maxRound);
      const t1name = t1?.name ?? '?';
      const t2name = t2?.name ?? '?';
      const matchNum = i + 1;

      if (!t1 || !t2) return `\`#${matchNum}\` ${roundLabel} — *En attente des rounds précédents*`;
      return `\`#${matchNum}\` **${roundLabel}** — ${t1name} vs ${t2name} — ${status}`;
    });

    fields.push({
      name: getSideLabel(side),
      value: lines.join('\n') || 'Aucun match',
      inline: false,
    });
  }

  const pending = matches.filter(m => m.status === 'pending' && m.team1_id && m.team2_id).length;
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
    if (!tournament) {
      return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });
    }

    const { data: matches } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('side')
      .order('round')
      .order('match_order');

    const { data: teams } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('tournament_id', tournament.id);

    if (!matches?.length) {
      return interaction.editReply({ content: '❌ Le bracket n\'est pas encore généré.' });
    }

    const embed = await buildBracketEmbed(tournament, matches, teams);
    const components = buildComponents(tournament, matches, teams, interaction.member);

    await interaction.editReply({ embeds: [embed], components });
  },

  async handleSelect(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('bracket_match_')) {
      return handleMatchSelect(interaction);
    }

    if (customId.startsWith('bracket_winner_')) {
      return handleWinnerSelect(interaction);
    }
  },

  async handleButton(interaction) {
if (interaction.customId === 'bracket_refresh') {
    await interaction.deferUpdate();
    const tournament = await getActiveTournament();
    if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.', components: [] });

    const { data: matches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('side').order('round').order('match_order');

    const { data: teams } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournament.id);

    const teamMap = {};
    for (const t of (teams || [])) teamMap[t.id] = t;

    // Affiche tous les matchs terminés pour correction
    const finishedMatches = matches.filter(m => m.status === 'finished' && m.team1_id && m.team2_id);
    const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));

    const embed = await buildBracketEmbed(tournament, matches, teams);
    embed.setDescription(`✏️ **Quel résultat veux-tu modifier ?**`);

    const components = [];

    const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('bracket_refresh')
        .setLabel('✏️ Modifier un résultat')
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(refreshRow);

    if (finishedMatches.length > 0) {
        const menu = new StringSelectMenuBuilder()
        .setCustomId(`bracket_match_${tournament.id}`)
        .setPlaceholder('Choisis le match à corriger')
        .addOptions(
            finishedMatches.slice(0, 25).map(m => {
            const t1 = teamMap[m.team1_id]?.name ?? '?';
            const t2 = teamMap[m.team2_id]?.name ?? '?';
            const sideLabel = m.side === 'left' ? '<' : m.side === 'right' ? '>' : 'F';
            const roundLabel = getRoundLabel(m.round, maxRound);
            return {
                label: `${sideLabel} ${roundLabel} — ${t1} vs ${t2}`,
                value: m.id,
            };
            })
        );
        components.push(new ActionRowBuilder().addComponents(menu));
    }

    await interaction.editReply({ embeds: [embed], components });
    }
  },
};

// ── Composants ────────────────────────────────────────────────────────────────
function buildComponents(tournament, matches, teams, member) {
  const isStaff = member?.permissions?.has(PermissionFlagsBits.ManageRoles);
  const components = [];

  // Bouton refresh toujours visible
  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
    .setCustomId('bracket_refresh')
    .setLabel('✏️ Modifier un résultat')
    .setStyle(ButtonStyle.Secondary)
  );
  components.push(refreshRow);

  // Menu staff pour entrer un résultat
  if (isStaff) {
    const teamMap = {};
    for (const t of (teams || [])) teamMap[t.id] = t;

    const pendingMatches = matches.filter(m =>
      m.status !== 'finished' && m.team1_id && m.team2_id
    );

    if (pendingMatches.length > 0) {
      const maxRound = Math.max(...matches.filter(m => m.side !== 'final').map(m => m.round));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`bracket_match_${tournament.id}`)
        .setPlaceholder('🛡️ Staff — Entrer le résultat d\'un match')
        .addOptions(
          pendingMatches.slice(0, 25).map((m, i) => {
            const t1 = teamMap[m.team1_id]?.name ?? '?';
            const t2 = teamMap[m.team2_id]?.name ?? '?';
            const roundLabel = getRoundLabel(m.round, maxRound);
            const sideLabel = m.side === 'left' ? '⬅️' : m.side === 'right' ? '➡️' : '🏆';
            return {
              label: `${sideLabel} ${roundLabel} — ${t1} vs ${t2}`,
              value: m.id,
            };
          })
        );

      components.push(new ActionRowBuilder().addComponents(menu));
    }
  }

  return components;
}

// ── Sélection du match ────────────────────────────────────────────────────────
async function handleMatchSelect(interaction) {
  await interaction.deferUpdate();

  const matchId = interaction.values[0];
  const tournamentId = interaction.customId.split('_')[2];

  const { data: match } = await supabase
    .from('tournament_matches')
    .select('*, team1:team1_id(id, name), team2:team2_id(id, name)')
    .eq('id', matchId)
    .single();

  if (!match) return interaction.editReply({ content: '❌ Match introuvable.', components: [] });

  const tournament = await getActiveTournament();
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const { data: teams } = await supabase
    .from('tournament_teams')
    .select('*')
    .eq('tournament_id', tournamentId);

  const embed = await buildBracketEmbed(tournament, matches, teams);
  embed.setDescription(`**Qui a gagné ?**\n\n🆚 **${match.team1?.name}** vs **${match.team2?.name}**`);

  const winnerMenu = new StringSelectMenuBuilder()
    .setCustomId(`bracket_winner_${tournamentId}_${matchId}`)
    .setPlaceholder('Choisis le gagnant')
    .addOptions([
      { label: `🏆 ${match.team1?.name}`, value: match.team1?.id },
      { label: `🏆 ${match.team2?.name}`, value: match.team2?.id },
    ]);

  const cancelBtn = new ButtonBuilder()
    .setCustomId('bracket_refresh')
    .setLabel('❌ Annuler')
    .setStyle(ButtonStyle.Secondary);

  await interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(winnerMenu),
      new ActionRowBuilder().addComponents(cancelBtn),
    ],
  });
}

// ── Propagation du gagnant vers le match suivant ──────────────────────────────
async function propagateWinner(tournamentId, finishedMatch, winnerId) {
  const { round, side, match_order } = finishedMatch;

  // Récupère tous les matchs du tournoi
  const { data: allMatches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('side', side)
    .order('round')
    .order('match_order');

  if (!allMatches?.length) return;

  const maxRound = Math.max(...allMatches.map(m => m.round));
  const nextRound = round + 1;
  const nextMatches = allMatches.filter(m => m.round === nextRound);
  if (!nextMatches.length) return;

  // Logique de propagation selon la structure du bracket
  // Les matchs du round actuel alimentent le match suivant
  const currentRoundMatches = allMatches.filter(m => m.round === round).sort((a, b) => a.match_order - b.match_order);

  // Trouve l'index du match terminé dans son round
  const matchIndex = currentRoundMatches.findIndex(m => m.id === finishedMatch.id);

  // Détermine quel match du round suivant reçoit ce gagnant
  // et si c'est team1 ou team2
  let targetMatchOrder, isTeam1;

  // Pour n=6 :
  // R1m1 → R2m1 team1, R1m2 → R2m1 team2, R1(bye seed5v6) → R2m2 (déjà rempli)
  // R2m1 → R3m1 team1, R2m2 → R3m1 team2
  
  // Règle générale : les matchs se propagent par paires vers le round suivant
  // match_order 1,2 → next match_order 1 (team1=gagnant m1, team2=gagnant m2)
  // match_order 3,4 → next match_order 2 etc.

  const nextMatchOrder = Math.ceil(match_order / 2);
  isTeam1 = match_order % 2 === 1;

  const targetMatch = nextMatches.find(m => m.match_order === nextMatchOrder);
  if (!targetMatch) return;

  const updateField = isTeam1 ? { team1_id: winnerId } : { team2_id: winnerId };
  await supabase
    .from('tournament_matches')
    .update(updateField)
    .eq('id', targetMatch.id);

  // Si les deux équipes sont maintenant remplies, marque comme pending
  const { data: updatedMatch } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('id', targetMatch.id)
    .single();

  // Vérifie si c'est la finale — propager le gagnant de la finale de poule vers la grande finale
  if (updatedMatch?.round === maxRound && updatedMatch?.status !== 'finished') {
    // Gagnant de la finale de poule → grande finale
    const { data: finalMatch } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('side', 'final')
      .single();

    if (finalMatch) {
      const isFinalTeam1 = side === 'left';
      await supabase
        .from('tournament_matches')
        .update(isFinalTeam1 ? { team1_id: null } : { team2_id: null })
        .eq('id', finalMatch.id);
    }
  }
}

// ── Sélection du gagnant ──────────────────────────────────────────────────────
async function handleWinnerSelect(interaction) {
  await interaction.deferUpdate();

  const parts = interaction.customId.split('_');
  const tournamentId = parts[2];
  const matchId = parts[3];
  const winnerId = interaction.values[0];

  // Récupère le match avant de l'update
  const { data: finishedMatch } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('id', matchId)
    .single();

  // Enregistre le résultat
  await supabase
    .from('tournament_matches')
    .update({ winner_id: winnerId, status: 'finished' })
    .eq('id', matchId);

  // Propage le gagnant vers le match suivant
  if (finishedMatch) {
    await propagateWinner(tournamentId, finishedMatch, winnerId);

    // Si c'est une finale de poule, propage vers la grande finale
    const { data: allMatches } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('side', finishedMatch.side);

    const maxRound = Math.max(...(allMatches || []).map(m => m.round));

    if (finishedMatch.round === maxRound) {
      const { data: finalMatch } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('side', 'final')
        .single();

      if (finalMatch) {
        const isFinalTeam1 = finishedMatch.side === 'left';
        await supabase
          .from('tournament_matches')
          .update(isFinalTeam1 ? { team1_id: winnerId } : { team2_id: winnerId })
          .eq('id', finalMatch.id);
      }
    }
  }

  // Recalcule les scores des pronos
  await recalculateScores(tournamentId);

  // Rafraîchit le bracket
  const tournament = await getActiveTournament();
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const { data: teams } = await supabase
    .from('tournament_teams')
    .select('*')
    .eq('tournament_id', tournamentId);

  const { data: winner } = await supabase
    .from('tournament_teams')
    .select('name')
    .eq('id', winnerId)
    .single();

  const embed = await buildBracketEmbed(tournament, matches, teams);
  embed.setDescription(`✅ **${winner?.name}** remporte le match !\n\n**${matches.filter(m => m.status === 'finished').length}/${matches.length}** matchs terminés`);

  const components = buildComponents(tournament, matches, teams, interaction.member);
  await interaction.editReply({ embeds: [embed], components });

  // Met à jour l'image du bracket
  sendOrUpdateBracketImage(interaction.client, tournament).catch(() => {});
}

// ── Recalcul des scores ───────────────────────────────────────────────────────
async function recalculateScores(tournamentId) {
  const { data: allMatches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!allMatches?.length) return;

  const leftMatches = allMatches.filter(m => m.side === 'left');
  const rightMatches = allMatches.filter(m => m.side === 'right');
  const finalMatch = allMatches.find(m => m.side === 'final');

  const leftComplete = leftMatches.every(m => m.status === 'finished');
  const rightComplete = rightMatches.every(m => m.status === 'finished');
  const finalComplete = finalMatch?.status === 'finished';

  const { data: predictions } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!predictions?.length) return;

  for (const prediction of predictions) {
    const preds = prediction.predictions || {};

    const leftCorrect = leftComplete
      ? leftMatches.every(m => preds[m.id] === m.winner_id)
      : false;

    const rightCorrect = rightComplete
      ? rightMatches.every(m => preds[m.id] === m.winner_id)
      : false;

    const finalCorrect = finalComplete && finalMatch
      ? preds[finalMatch.id] === finalMatch.winner_id
      : false;

    const score = (leftCorrect ? 1 : 0) + (rightCorrect ? 1 : 0) + (finalCorrect ? 1 : 0);

    await supabase
      .from('tournament_predictions')
      .update({ score, left_correct: leftCorrect, right_correct: rightCorrect, final_correct: finalCorrect })
      .eq('id', prediction.id);
  }
}