const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

// ── Génération des matchs du bracket ─────────────────────────────────────────
// Retourne un tableau de matchs à insérer en DB
// side: 'left' ou 'right'
// teams: tableau trié par seed [{id, seed}]
function generateSideMatches(tournamentId, side, teams) {
  const matches = [];
  const n = teams.length; // 6, 12 ou 24

  if (n === 6) {
    // R1 : seed1 vs seed2, seed3 vs seed4 (seed5 et seed6 ont bye)
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 1, team1_id: teams[0].id, team2_id: teams[1].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 2, team1_id: teams[2].id, team2_id: teams[3].id });
    // seed5 vs seed6 jouent aussi en R1 mais leur gagnant a un bye en demi
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 3, team1_id: teams[4].id, team2_id: teams[5].id });
    // R2 (demi) : gagnant(1v2) vs gagnant(3v4) — gagnant(5v6) a bye
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 1, team1_id: null, team2_id: null });
    // R3 (finale poule) : gagnant demi vs gagnant(5v6)
    matches.push({ tournament_id: tournamentId, round: 3, side, match_order: 1, team1_id: null, team2_id: null });
  }

  if (n === 12) {
    // R1 : 3 matchs (1v2, 3v4, 5v6) — seeds 7-12 ont bye
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 1, team1_id: teams[0].id, team2_id: teams[1].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 2, team1_id: teams[2].id, team2_id: teams[3].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 3, team1_id: teams[4].id, team2_id: teams[5].id });
    // seeds 7-12 jouent entre eux en R1 aussi
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 4, team1_id: teams[6].id, team2_id: teams[7].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 5, team1_id: teams[8].id, team2_id: teams[9].id });
    matches.push({ tournament_id: tournamentId, round: 1, side, match_order: 6, team1_id: teams[10].id, team2_id: teams[11].id });
    // R2 (QF) : 3 matchs — gagnants seeds 7-12 ont bye
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 1, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 2, team1_id: null, team2_id: null });
    matches.push({ tournament_id: tournamentId, round: 2, side, match_order: 3, team1_id: null, team2_id: null });
    // R3 (demi) : 1 match
    matches.push({ tournament_id: tournamentId, round: 3, side, match_order: 1, team1_id: null, team2_id: null });
    // R4 (finale poule) : 1 match
    matches.push({ tournament_id: tournamentId, round: 4, side, match_order: 1, team1_id: null, team2_id: null });
  }

  if (n === 24) {
    // R1 : 6 matchs (1v2, 3v4, 5v6, 7v8, 9v10, 11v12) — seeds 13-24 ont bye
    for (let i = 0; i < 6; i++) {
      matches.push({ tournament_id: tournamentId, round: 1, side, match_order: i + 1, team1_id: teams[i * 2].id, team2_id: teams[i * 2 + 1].id });
    }
    // seeds 13-24 jouent entre eux en R1
    for (let i = 6; i < 12; i++) {
      matches.push({ tournament_id: tournamentId, round: 1, side, match_order: i + 1, team1_id: teams[i * 2].id, team2_id: teams[i * 2 + 1].id });
    }
    // R2 : 6 matchs
    for (let i = 0; i < 6; i++) {
      matches.push({ tournament_id: tournamentId, round: 2, side, match_order: i + 1, team1_id: null, team2_id: null });
    }
    // R3 (QF) : 3 matchs
    for (let i = 0; i < 3; i++) {
      matches.push({ tournament_id: tournamentId, round: 3, side, match_order: i + 1, team1_id: null, team2_id: null });
    }
    // R4 (demi) : 1 match
    matches.push({ tournament_id: tournamentId, round: 4, side, match_order: 1, team1_id: null, team2_id: null });
    // R5 (finale poule) : 1 match
    matches.push({ tournament_id: tournamentId, round: 5, side, match_order: 1, team1_id: null, team2_id: null });
  }

  return matches;
}

function generateFinalMatch(tournamentId) {
  return {
    tournament_id: tournamentId,
    round: 99,
    side: 'final',
    match_order: 1,
    team1_id: null,
    team2_id: null,
  };
}

// ── Labels des rounds ─────────────────────────────────────────────────────────
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
            { name: '12 équipes', value: 12 },
            { name: '24 équipes', value: 24 },
            { name: '48 équipes', value: 48 },
          )
      ),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const nom = interaction.options.getString('nom');
      const taille = interaction.options.getInteger('taille');

      const { data: tournament, error } = await supabase
        .from('tournaments')
        .insert({
          name: nom,
          size: taille,
          status: 'open',
          created_by: interaction.user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('[TournoiCréer]', error);
        return interaction.editReply({ content: '❌ Erreur lors de la création du tournoi.' });
      }

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`🏆 Tournoi créé — ${nom}`)
        .addFields(
          { name: '📋 ID', value: `\`${tournament.id}\``, inline: false },
          { name: '👥 Taille', value: `${taille} équipes`, inline: true },
          { name: '📊 Statut', value: '🟢 Ouvert', inline: true },
        )
        .setDescription(
          `Tournoi créé avec succès !\n\n` +
          `**Prochaines étapes :**\n` +
          `1. Ajoute les équipes avec \`/tournoi-équipe\`\n` +
          `2. Lance le tournoi avec \`/tournoi-démarrer\`\n\n` +
          `⚠️ Tu as besoin de **${taille / 2} équipes par côté** (${taille / 2} gauche + ${taille / 2} droite)`
        )
        .setFooter({ text: `Créé par ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-équipe ─────────────────────────────────────────────────────────
  tournoiEquipe: {
    data: new SlashCommandBuilder()
      .setName('tournoi-équipe')
      .setDescription('Ajoute une équipe au tournoi (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName('tournoi_id').setDescription('ID du tournoi').setRequired(true))
      .addStringOption(o => o.setName('nom').setDescription('Nom de l\'équipe').setRequired(true))
      .addStringOption(o =>
        o.setName('côté')
          .setDescription('Côté du bracket')
          .setRequired(true)
          .addChoices(
            { name: '⬅️ Gauche', value: 'left' },
            { name: '➡️ Droite', value: 'right' },
          )
      )
      .addIntegerOption(o => o.setName('seed').setDescription('Seed de l\'équipe (1 = meilleure)').setRequired(true).setMinValue(1)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournamentId = interaction.options.getString('tournoi_id');
      const nom = interaction.options.getString('nom');
      const side = interaction.options.getString('côté');
      const seed = interaction.options.getInteger('seed');

      // Vérifie que le tournoi existe et est ouvert
      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (tErr || !tournament) return interaction.editReply({ content: '❌ Tournoi introuvable.' });
      if (tournament.status !== 'open') return interaction.editReply({ content: '❌ Le tournoi n\'est plus ouvert.' });

      // Vérifie le nombre max d'équipes par côté
      const maxPerSide = tournament.size / 2;
      const { count } = await supabase
        .from('tournament_teams')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('side', side);

      if (count >= maxPerSide) {
        return interaction.editReply({ content: `❌ Le côté ${side === 'left' ? 'gauche' : 'droit'} est complet (${maxPerSide} équipes max).` });
      }

      const { error } = await supabase
        .from('tournament_teams')
        .insert({ tournament_id: tournamentId, name: nom, side, seed });

      if (error) {
        if (error.code === '23505') return interaction.editReply({ content: `❌ Le seed ${seed} est déjà pris côté ${side === 'left' ? 'gauche' : 'droit'}.` });
        return interaction.editReply({ content: '❌ Erreur lors de l\'ajout de l\'équipe.' });
      }

      // Récupère le compte actuel
      const { count: newCount } = await supabase
        .from('tournament_teams')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Équipe ajoutée')
        .addFields(
          { name: '🏷️ Équipe', value: nom, inline: true },
          { name: '📍 Côté', value: side === 'left' ? '⬅️ Gauche' : '➡️ Droite', inline: true },
          { name: '🎯 Seed', value: String(seed), inline: true },
          { name: '📊 Progression', value: `${newCount} / ${tournament.size} équipes ajoutées`, inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-démarrer ───────────────────────────────────────────────────────
  tournoiDemarrer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-démarrer')
      .setDescription('Démarre le tournoi et verrouille les pronos (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName('tournoi_id').setDescription('ID du tournoi').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournamentId = interaction.options.getString('tournoi_id');

      const { data: tournament } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (!tournament) return interaction.editReply({ content: '❌ Tournoi introuvable.' });
      if (tournament.status !== 'open') return interaction.editReply({ content: '❌ Le tournoi est déjà démarré ou terminé.' });

      // Vérifie que toutes les équipes sont présentes
      const { data: teams } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('side').order('seed');

      if (!teams || teams.length !== tournament.size) {
        return interaction.editReply({
          content: `❌ Il manque des équipes — ${teams?.length ?? 0}/${tournament.size} ajoutées.`
        });
      }

      // Génère les matchs
      const leftTeams = teams.filter(t => t.side === 'left').sort((a, b) => a.seed - b.seed);
      const rightTeams = teams.filter(t => t.side === 'right').sort((a, b) => a.seed - b.seed);

      const teamsPerSide = tournament.size / 2;
      const leftMatches = generateSideMatches(tournamentId, 'left', leftTeams.slice(0, teamsPerSide));
      const rightMatches = generateSideMatches(tournamentId, 'right', rightTeams.slice(0, teamsPerSide));
      const finalMatch = generateFinalMatch(tournamentId);

      const { error: matchError } = await supabase
        .from('tournament_matches')
        .insert([...leftMatches, ...rightMatches, finalMatch]);

      if (matchError) {
        console.error('[TournoiDémarrer]', matchError);
        return interaction.editReply({ content: '❌ Erreur lors de la génération du bracket.' });
      }

      // Verrouille les pronos existants
      await supabase
        .from('tournament_predictions')
        .update({ locked_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId)
        .is('locked_at', null);

      // Met à jour le statut
      await supabase
        .from('tournaments')
        .update({ status: 'started' })
        .eq('id', tournamentId);

      // Compte les pronos
      const { count: pronoCount } = await supabase
        .from('tournament_predictions')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`🏆 ${tournament.name} — Tournoi démarré !`)
        .setDescription('Le bracket a été généré et les pronos sont verrouillés.')
        .addFields(
          { name: '👥 Équipes', value: `${tournament.size}`, inline: true },
          { name: '🎯 Pronos verrouillés', value: `${pronoCount ?? 0}`, inline: true },
          { name: '🎮 Matchs générés', value: `${leftMatches.length + rightMatches.length + 1}`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Annonce dans le salon tournoi si configuré
      if (process.env.TOURNAMENT_CHANNEL_ID) {
        try {
          const channel = await interaction.client.channels.fetch(process.env.TOURNAMENT_CHANNEL_ID);
          const announceEmbed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`🏆 ${tournament.name} — C'est parti !`)
            .setDescription('Le tournoi vient de démarrer ! Les pronos sont maintenant verrouillés.')
            .setTimestamp();
          await channel.send({ embeds: [announceEmbed] });
        } catch {}
      }
    }
  },

  // ── /tournoi-résultat ───────────────────────────────────────────────────────
  tournoiResultat: {
    data: new SlashCommandBuilder()
      .setName('tournoi-résultat')
      .setDescription('Entre le résultat d\'un match (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName('tournoi_id').setDescription('ID du tournoi').setRequired(true))
      .addStringOption(o => o.setName('match_id').setDescription('ID du match').setRequired(true))
      .addStringOption(o => o.setName('gagnant_id').setDescription('ID de l\'équipe gagnante').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournamentId = interaction.options.getString('tournoi_id');
      const matchId = interaction.options.getString('match_id');
      const winnerId = interaction.options.getString('gagnant_id');

      // Vérifie le match
      const { data: match } = await supabase
        .from('tournament_matches')
        .select('*, team1:team1_id(name), team2:team2_id(name)')
        .eq('id', matchId)
        .eq('tournament_id', tournamentId)
        .single();

      if (!match) return interaction.editReply({ content: '❌ Match introuvable.' });
      if (match.status === 'finished') return interaction.editReply({ content: '❌ Ce match est déjà terminé.' });
      if (winnerId !== match.team1_id && winnerId !== match.team2_id) {
        return interaction.editReply({ content: '❌ L\'équipe gagnante ne participe pas à ce match.' });
      }

      // Met à jour le match
      await supabase
        .from('tournament_matches')
        .update({ winner_id: winnerId, status: 'finished' })
        .eq('id', matchId);

      // Recalcule les scores des pronos
      await recalculateScores(tournamentId);

      const winnerName = winnerId === match.team1_id ? match.team1?.name : match.team2?.name;

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Résultat enregistré')
        .addFields(
          { name: '🏆 Gagnant', value: winnerName || winnerId, inline: true },
          { name: '📊 Match', value: `${match.team1?.name ?? '?'} vs ${match.team2?.name ?? '?'}`, inline: true },
        )
        .setFooter({ text: 'Les scores des pronos ont été recalculés' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-terminer ───────────────────────────────────────────────────────
  tournoiTerminer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-terminer')
      .setDescription('Clôture le tournoi et affiche le classement (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName('tournoi_id').setDescription('ID du tournoi').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply();

      const tournamentId = interaction.options.getString('tournoi_id');

      const { data: tournament } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (!tournament) return interaction.editReply({ content: '❌ Tournoi introuvable.' });

      // Recalcul final des scores
      await recalculateScores(tournamentId);

      // Met à jour le statut
      await supabase
        .from('tournaments')
        .update({ status: 'finished' })
        .eq('id', tournamentId);

      // Récupère le classement
      const { data: predictions } = await supabase
        .from('tournament_predictions')
        .select('*')
        .eq('tournament_id', tournamentId)
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
  // Récupère tous les matchs terminés
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('status', 'finished');

  if (!matches?.length) return;

  const leftMatches = matches.filter(m => m.side === 'left');
  const rightMatches = matches.filter(m => m.side === 'right');
  const finalMatch = matches.find(m => m.side === 'final');

  // Récupère tous les matchs du tournoi pour savoir si une poule est complète
  const { data: allMatches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  const allLeftMatches = allMatches.filter(m => m.side === 'left');
  const allRightMatches = allMatches.filter(m => m.side === 'right');

  const leftComplete = allLeftMatches.every(m => m.status === 'finished');
  const rightComplete = allRightMatches.every(m => m.status === 'finished');
  const finalComplete = finalMatch?.status === 'finished';

  // Récupère tous les pronos
  const { data: predictions } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId);

  if (!predictions?.length) return;

  for (const prediction of predictions) {
    const preds = prediction.predictions || {};

    let leftCorrect = false;
    let rightCorrect = false;
    let finalCorrect = false;

    if (leftComplete) {
      leftCorrect = leftMatches.every(m => {
        const predicted = preds[m.id];
        return predicted === m.winner_id;
      });
    }

    if (rightComplete) {
      rightCorrect = rightMatches.every(m => {
        const predicted = preds[m.id];
        return predicted === m.winner_id;
      });
    }

    if (finalComplete && finalMatch) {
      finalCorrect = preds[finalMatch.id] === finalMatch.winner_id;
    }

    const score = (leftCorrect ? 1 : 0) + (rightCorrect ? 1 : 0) + (finalCorrect ? 1 : 0);

    await supabase
      .from('tournament_predictions')
      .update({ score, left_correct: leftCorrect, right_correct: rightCorrect, final_correct: finalCorrect })
      .eq('id', prediction.id);
  }
}