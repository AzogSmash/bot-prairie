const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

// ── Tournoi actif ─────────────────────────────────────────────────────────────
async function getActiveTournament(statusFilter = ['open', 'started']) {
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ── Génération des matchs du bracket ─────────────────────────────────────────
function generateSideMatches(tournamentId, side, teams) {
  const matches = [];
  const n = teams.length;

  if (n === 6) {
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 1, team1_id: teams[0].id, team2_id: teams[1].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 2, team1_id: teams[2].id, team2_id: teams[3].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 3, team1_id: teams[4].id, team2_id: teams[5].id });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 1, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 3, side, match_order: 1, team1_id: null, team2_id: null });
  }

  if (n === 12) {
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 1, team1_id: teams[0].id, team2_id: teams[1].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 2, team1_id: teams[2].id, team2_id: teams[3].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 3, team1_id: teams[4].id, team2_id: teams[5].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 4, team1_id: teams[6].id, team2_id: teams[7].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 5, team1_id: teams[8].id, team2_id: teams[9].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 6, team1_id: teams[10].id, team2_id: teams[11].id });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 1, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 2, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 3, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 3, side, match_order: 1, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 4, side, match_order: 1, team1_id: null, team2_id: null });
  }

  if (n === 24) {
    for (let i = 0; i < 6; i++) {
      matches.push({ tournament_id: tournamentId, round: 1, side, match_order: i + 1, team1_id: teams[i * 2].id, team2_id: teams[i * 2 + 1].id });
    }
    for (let i = 6; i < 12; i++) {
      matches.push({ tournament_id: tournamentId, round: 1, side, match_order: i + 1, team1_id: teams[i * 2].id, team2_id: teams[i * 2 + 1].id });
    }
    for (let i = 0; i < 6; i++) {
      matches.push({ tournament_id: tournamentId, round: 2, side, match_order: i + 1, team1_id: null, team2_id: null });
    }
    for (let i = 0; i < 3; i++) {
      matches.push({ tournament_id: tournamentId, round: 3, side, match_order: i + 1, team1_id: null, team2_id: null });
    }
    matches.push({ tournament_id: tournamentId, round: 4, side, match_order: 1, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 5, side, match_order: 1, team1_id: null, team2_id: null });
  }

  return matches;
}

function generateFinalMatch(tournamentId) {
  return { tournament_id: tournamentId, round: 99, side: 'final', match_order: 1, team1_id: null, team2_id: null };
}

function getRoundLabel(round, totalRounds) {
  if (round === 99) return 'Finale';
  if (round === totalRounds) return 'Finale de poule';
  if (round === totalRounds - 1) return 'Demi-finale';
  if (round === totalRounds - 2) return 'Quart de finale';
  return `Round ${round}`;
}

module.exports = {
  // ── /tournoi-créer ──────────────────────────────────────────────────────────
  tournoiCreer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-créer')
      .setDescription('Crée un nouveau tournoi (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName('nom').setDescription('Nom du tournoi').setRequired(true))
      .addIntegerOption(o =>
        o.setName('taille')
          .setDescription('Nombre total d\'équipes')
          .setRequired(true)
          .addChoices(
            { name: '8 équipes (4 par côté)', value: 8 },
            { name: '12 équipes (6 par côté)', value: 12 },
            { name: '16 équipes (8 par côté)', value: 16 },
            { name: '24 équipes (12 par côté)', value: 24 },
            { name: '32 équipes (16 par côté)', value: 32 },
            { name: '48 équipes (24 par côté)', value: 48 },
          )
      ),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const nom = interaction.options.getString('nom');
      const taille = interaction.options.getInteger('taille');

      const { data: tournament, error } = await supabase
        .from('tournaments')
        .insert({ name: nom, size: taille, status: 'open', created_by: interaction.user.id })
        .select()
        .single();

      if (error) {
        console.error('[TournoiCréer]', error);
        return interaction.editReply({ content: '❌ Erreur lors de la création du tournoi.' });
      }

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`🏆 Tournoi créé — ${nom}`)
        .setDescription(
        `✅ Tournoi **${nom}** créé !\n\n` +
        `**📋 Flow complet :**\n` +
        `1️⃣ \`/tournoi-participants\` — Inscris les joueurs et récupère leurs elos\n` +
        `2️⃣ \`/tournoi-composer\` — Génère les équipes équilibrées + le bracket + ouvre les pronos\n` +
        `3️⃣ \`/tournoi-ajuster\` — Modifie un elo ou échange des membres si besoin\n` +
        `4️⃣ \`/pronostic\` — Les membres font leurs pronos avant le début\n` +
        `5️⃣ \`/tournoi-démarrer\` — Verrouille les pronos et démarre officiellement\n` +
        `6️⃣ \`/tournoi-bracket\` — Entre les résultats match par match\n` +
        `7️⃣ \`/tournoi-terminer\` — Clôture et affiche le classement des pronos\n\n` +
        `**💡 Mode manuel :** \`/tournoi-équipes\` pour entrer les équipes à la main au lieu de \`/tournoi-composer\`\n` +
        `⚠️ Ce tournoi nécessite **${taille / 2} équipes par côté**`
        )
        .addFields(
          { name: '👥 Taille', value: `${taille} équipes`, inline: true },
          { name: '📊 Statut', value: '🟢 Ouvert', inline: true },
        )
        .setFooter({ text: `Créé par ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-démarrer ───────────────────────────────────────────────────────
  tournoiDemarrer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-démarrer')
      .setDescription('Démarre le tournoi actif et verrouille les pronos (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament(['open']);
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi ouvert trouvé.' });

      // Vérifie que les matchs ont bien été générés par /tournoi-composer
      const { count: matchCount } = await supabase
        .from('tournament_matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id);

      if (!matchCount) {
        return interaction.editReply({ content: '❌ Le bracket n\'est pas encore généré. Utilise `/tournoi-composer` d\'abord.' });
      }

      // Verrouille les pronos
      await supabase
        .from('tournament_predictions')
        .update({ locked_at: new Date().toISOString() })
        .eq('tournament_id', tournament.id)
        .is('locked_at', null);

      // Met à jour le statut
      await supabase
        .from('tournaments')
        .update({ status: 'started' })
        .eq('id', tournament.id);

      const { count: pronoCount } = await supabase
        .from('tournament_predictions')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id);

      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`🏆 ${tournament.name} — Tournoi démarré !`)
        .setDescription('Les pronos sont maintenant verrouillés. Le tournoi commence !')
        .addFields(
          { name: '👥 Équipes', value: `${tournament.size}`, inline: true },
          { name: '🎯 Pronos verrouillés', value: `${pronoCount ?? 0}`, inline: true },
          { name: '🎮 Matchs', value: `${matchCount}`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      if (process.env.TOURNAMENT_CHANNEL_ID) {
        try {
          const channel = await interaction.client.channels.fetch(process.env.TOURNAMENT_CHANNEL_ID);
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle(`🏆 ${tournament.name} — C'est parti !`)
                .setDescription('Le tournoi vient de démarrer ! Les pronos sont maintenant verrouillés.')
                .setTimestamp()
            ]
          });
        } catch {}
      }
    }
  },

  // ── /tournoi-terminer ───────────────────────────────────────────────────────
  tournoiTerminer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-terminer')
      .setDescription('Clôture le tournoi actif et affiche le classement (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament(['started']);
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      await recalculateScores(tournament.id);

      await supabase
        .from('tournaments')
        .update({ status: 'finished' })
        .eq('id', tournament.id);

      const { data: predictions } = await supabase
        .from('tournament_predictions')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('score', { ascending: false })
        .limit(20);

      if (!predictions?.length) {
        return interaction.editReply({ content: '✅ Tournoi terminé — aucun pronostic.' });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines = predictions.map((p, i) => {
        const medal = medals[i] || `**#${i + 1}**`;
        const details = [
          p.left_correct ? '✅G' : '❌G',
          p.right_correct ? '✅D' : '❌D',
          p.final_correct ? '✅F' : '❌F',
        ].join(' ');
        return `${medal} **${p.discord_username}** — **${p.score}/3** pts • ${details}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`🏆 ${tournament.name} — Classement des pronostics`)
        .setDescription(lines)
        .addFields({
          name: '📊 Légende',
          value: '✅G = Poule gauche correcte • ✅D = Poule droite correcte • ✅F = Finale correcte',
        })
        .setFooter({ text: 'Prairie Brawl Stars • Tournoi terminé' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

// ── Recalcul des scores ───────────────────────────────────────────────────────
async function recalculateScores(tournamentId) {
  const { data: allMatches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!allMatches?.length) return;

  const allLeftMatches = allMatches.filter(m => m.side === 'left');
  const allRightMatches = allMatches.filter(m => m.side === 'right');
  const finalMatch = allMatches.find(m => m.side === 'final');

  const leftComplete = allLeftMatches.every(m => m.status === 'finished');
  const rightComplete = allRightMatches.every(m => m.status === 'finished');
  const finalComplete = finalMatch?.status === 'finished';

  const { data: predictions } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!predictions?.length) return;

  for (const prediction of predictions) {
    const preds = prediction.predictions || {};

    const leftCorrect = leftComplete
      ? allLeftMatches.every(m => preds[m.id] === m.winner_id)
      : false;

    const rightCorrect = rightComplete
      ? allRightMatches.every(m => preds[m.id] === m.winner_id)
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