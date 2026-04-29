// ─────────────────────────────────────────────────────────────────────────────
// bracketGenerator.js
//
// Remplace generateSideMatches + generateAndSaveMatches dans :
//   - tournoiParticipants.js
//   - tournoi.js
//
// Ajoute next_match_id + next_slot sur chaque match pour que la propagation
// des gagnants (réels et prédits) soit fiable quelle que soit la taille.
//
// Tailles supportées : 4, 6, 8, 12, 16, 24 équipes par side
// (= tournois 8, 12, 16, 24, 32, 48 équipes totales)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère les matchs d'un side avec les liens _next_ref (résolus après insertion).
 * _next_ref : { round, match_order, slot } — null si c'est la finale de poule
 */
function generateSideMatchesWithLinks(tournamentId, side, teams) {
  const n = teams.length;
  const matches = [];

  // Helper
  const m = (round, match_order, team1_id, team2_id, next_round, next_mo, next_slot) => ({
    tournament_id: tournamentId,
    round,
    side,
    match_order,
    team1_id: team1_id ?? null,
    team2_id: team2_id ?? null,
    _next_ref: next_round ? { round: next_round, match_order: next_mo, slot: next_slot } : null,
  });

  // ── n=4 ───────────────────────────────────────────────────────────────────
  // R1: m1, m2 → R2: m1 (finale poule)
  if (n === 4) {
    matches.push(m(1, 1, teams[0].id, teams[1].id, 2, 1, 1));
    matches.push(m(1, 2, teams[2].id, teams[3].id, 2, 1, 2));
    matches.push(m(2, 1, null, null, null, null, null)); // finale poule
  }

  // ── n=6 ───────────────────────────────────────────────────────────────────
  // R1: m1(s1vs2), m2(s3vs4)
  // R2: m1(gR1m1 vs gR1m2), m2(s5vs6) — seed5/6 attendent en R2
  // R3: m1(gR2m1 vs gR2m2) — finale poule
  if (n === 6) {
    matches.push(m(1, 1, teams[0].id, teams[1].id, 2, 1, 1));
    matches.push(m(1, 2, teams[2].id, teams[3].id, 2, 1, 2));
    matches.push(m(2, 1, null, null,               3, 1, 1));
    matches.push(m(2, 2, teams[4].id, teams[5].id, 3, 1, 2));
    matches.push(m(3, 1, null, null, null, null, null)); // finale poule
  }

  // ── n=8 ───────────────────────────────────────────────────────────────────
  // R1: m1-m4 → R2: m1(gR1m1 vs gR1m2), m2(gR1m3 vs gR1m4) → R3: finale poule
  if (n === 8) {
    matches.push(m(1, 1, teams[0].id, teams[1].id, 2, 1, 1));
    matches.push(m(1, 2, teams[2].id, teams[3].id, 2, 1, 2));
    matches.push(m(1, 3, teams[4].id, teams[5].id, 2, 2, 1));
    matches.push(m(1, 4, teams[6].id, teams[7].id, 2, 2, 2));
    matches.push(m(2, 1, null, null,               3, 1, 1));
    matches.push(m(2, 2, null, null,               3, 1, 2));
    matches.push(m(3, 1, null, null, null, null, null)); // finale poule
  }

  // ── n=12 ──────────────────────────────────────────────────────────────────
  // R1: m1(s1vs2), m2(s3vs4), m3(s5vs6), m4(s7vs8)
  // R2: m1(gR1m1 vs gR1m2), m2(gR1m3 vs gR1m4), m3(s9vs10), m4(s11vs12)
  // R3: m1(gR2m1 vs gR2m2), m2(gR2m3 vs gR2m4)
  // R4: m1(gR3m1 vs gR3m2) — finale poule
  if (n === 12) {
    matches.push(m(1, 1, teams[0].id,  teams[1].id,  2, 1, 1));
    matches.push(m(1, 2, teams[2].id,  teams[3].id,  2, 1, 2));
    matches.push(m(1, 3, teams[4].id,  teams[5].id,  2, 2, 1));
    matches.push(m(1, 4, teams[6].id,  teams[7].id,  2, 2, 2));
    matches.push(m(2, 1, null, null,                  3, 1, 1));
    matches.push(m(2, 2, null, null,                  3, 1, 2));
    matches.push(m(2, 3, teams[8].id,  teams[9].id,  3, 2, 1));
    matches.push(m(2, 4, teams[10].id, teams[11].id, 3, 2, 2));
    matches.push(m(3, 1, null, null,                  4, 1, 1));
    matches.push(m(3, 2, null, null,                  4, 1, 2));
    matches.push(m(4, 1, null, null, null, null, null)); // finale poule
  }

  // ── n=16 ──────────────────────────────────────────────────────────────────
  // R1: m1-m8 → R2: m1-m4 → R3: m1-m2 → R4: finale poule
  if (n === 16) {
    for (let i = 0; i < 8; i++) {
      const nextMo   = Math.ceil((i + 1) / 2);
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(1, i + 1, teams[i * 2].id, teams[i * 2 + 1].id, 2, nextMo, nextSlot));
    }
    for (let i = 0; i < 4; i++) {
      const nextMo   = Math.ceil((i + 1) / 2);
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(2, i + 1, null, null, 3, nextMo, nextSlot));
    }
    matches.push(m(3, 1, null, null, 4, 1, 1));
    matches.push(m(3, 2, null, null, 4, 1, 2));
    matches.push(m(4, 1, null, null, null, null, null)); // finale poule
  }

  // ── n=24 ──────────────────────────────────────────────────────────────────
  // R1: m1-m8 (seeds 1-16)
  // R2: m1-m4 (gagnants R1) + m5-m8 (seeds 17-24)
  // R3: m1-m4 (gagnants R2 par paires)
  // R4: m1-m2 (gagnants R3)
  // R5: finale poule
  //
  // Propagation R1 → R2 : R1m1→R2m1 s1, R1m2→R2m1 s2, ..., R1m7→R2m4 s1, R1m8→R2m4 s2
  // Propagation R2 → R3 : R2m1→R3m1 s1, R2m2→R3m1 s2, R2m3→R3m2 s1, R2m4→R3m2 s2
  //                        R2m5→R3m3 s1, R2m6→R3m3 s2, R2m7→R3m4 s1, R2m8→R3m4 s2
  // Propagation R3 → R4 : R3m1→R4m1 s1, R3m2→R4m1 s2, R3m3→R4m2 s1, R3m4→R4m2 s2
  // Propagation R4 → R5 : R4m1→R5m1 s1, R4m2→R5m1 s2
  if (n === 24) {
    // R1 : seeds 1-16 (8 matchs)
    for (let i = 0; i < 8; i++) {
      const nextMo   = Math.ceil((i + 1) / 2);
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(1, i + 1, teams[i * 2].id, teams[i * 2 + 1].id, 2, nextMo, nextSlot));
    }
    // R2 : m1-m4 (gagnants R1), m5-m8 (seeds 17-24)
    for (let i = 0; i < 4; i++) {
      const nextMo   = Math.ceil((i + 1) / 2);
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(2, i + 1, null, null, 3, nextMo, nextSlot));
    }
    for (let i = 0; i < 4; i++) {
      const nextMo   = Math.ceil((i + 5) / 2); // m5→R3m3, m6→R3m3, m7→R3m4, m8→R3m4
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(2, i + 5, teams[16 + i * 2].id, teams[16 + i * 2 + 1].id, 3, nextMo, nextSlot));
    }
    // R3 : 4 matchs
    for (let i = 0; i < 4; i++) {
      const nextMo   = Math.ceil((i + 1) / 2);
      const nextSlot = (i % 2 === 0) ? 1 : 2;
      matches.push(m(3, i + 1, null, null, 4, nextMo, nextSlot));
    }
    // R4 : 2 matchs
    matches.push(m(4, 1, null, null, 5, 1, 1));
    matches.push(m(4, 2, null, null, 5, 1, 2));
    // R5 : finale poule
    matches.push(m(5, 1, null, null, null, null, null));
  }

  return matches;
}

/**
 * Insère les matchs d'un side en deux passes pour résoudre les next_match_id.
 */
async function insertSideMatchesWithLinks(supabase, tournamentId, side, teams) {
  const matchDefs = generateSideMatchesWithLinks(tournamentId, side, teams);

  // Passe 1 : insert sans next_match_id
  const rows = matchDefs.map(({ _next_ref, ...rest }) => rest);
  const { data: inserted, error } = await supabase
    .from('tournament_matches')
    .insert(rows)
    .select();

  if (error) throw new Error(`Erreur insertion matchs ${side}: ${error.message}`);

  // Passe 2 : update next_match_id + next_slot
  for (let i = 0; i < matchDefs.length; i++) {
    const ref = matchDefs[i]._next_ref;
    if (!ref) continue;

    const current = inserted[i];
    const target  = inserted.find(m => m.round === ref.round && m.match_order === ref.match_order);
    if (!target) continue;

    await supabase
      .from('tournament_matches')
      .update({ next_match_id: target.id, next_slot: ref.slot })
      .eq('id', current.id);
  }

  return inserted;
}

/**
 * Génère et sauvegarde tous les matchs du tournoi.
 * Remplace l'ancien generateAndSaveMatches — signature identique sauf
 * que supabase est passé en premier argument.
 *
 * Usage :
 *   const { generateAndSaveMatches } = require('../modules/bracketGenerator');
 *   await generateAndSaveMatches(supabase, tournament.id, leftTeams, rightTeams);
 */
async function generateAndSaveMatches(supabase, tournamentId, leftTeams, rightTeams) {
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

  const leftInserted  = await insertSideMatchesWithLinks(supabase, tournamentId, 'left',  leftTeams);
  const rightInserted = await insertSideMatchesWithLinks(supabase, tournamentId, 'right', rightTeams);

  // Grande finale
  const { data: finalMatch } = await supabase
    .from('tournament_matches')
    .insert({
      tournament_id: tournamentId,
      round: 99,
      side: 'final',
      match_order: 1,
      team1_id: null,
      team2_id: null,
    })
    .select()
    .single();

    // La finale de poule = match avec le round le plus élevé de chaque side
    const leftMaxRound  = Math.max(...leftInserted.map(m => m.round));
    const rightMaxRound = Math.max(...rightInserted.map(m => m.round));
    const leftFinal  = leftInserted.find(m => m.round === leftMaxRound);
    const rightFinal = rightInserted.find(m => m.round === rightMaxRound);

    if (leftFinal) {
    await supabase.from('tournament_matches')
        .update({ next_match_id: finalMatch.id, next_slot: 1 })
        .eq('id', leftFinal.id);
    }
    if (rightFinal) {
    await supabase.from('tournament_matches')
        .update({ next_match_id: finalMatch.id, next_slot: 2 })
        .eq('id', rightFinal.id);
        
}
}

module.exports = {
  generateSideMatchesWithLinks,
  insertSideMatchesWithLinks,
  generateAndSaveMatches,
};
