"use strict";

const { supabase } = require("./supabase");

async function recalculateScores(tournamentId) {
  const { data: allMatches } = await supabase
    .from("tournament_matches")
    .select("*")
    .eq("tournament_id", tournamentId);

  if (!allMatches?.length) return;

  const leftMatches  = allMatches.filter(m => m.side === "left");
  const rightMatches = allMatches.filter(m => m.side === "right");
  const finalMatch   = allMatches.find(m => m.side === "final");

  const leftComplete  = leftMatches.every(m => m.status === "finished");
  const rightComplete = rightMatches.every(m => m.status === "finished");
  const finalComplete = finalMatch?.status === "finished";

  const { data: predictions } = await supabase
    .from("tournament_predictions")
    .select("*")
    .eq("tournament_id", tournamentId);

  if (!predictions?.length) return;

  for (const prediction of predictions) {
    const preds = prediction.predictions || {};

    const leftCorrect  = leftComplete  ? leftMatches.every(m => preds[m.id] === m.winner_id)  : false;
    const rightCorrect = rightComplete ? rightMatches.every(m => preds[m.id] === m.winner_id) : false;
    const finalCorrect = finalComplete && finalMatch ? preds[finalMatch.id] === finalMatch.winner_id : false;

    const score = (leftCorrect ? 1 : 0) + (rightCorrect ? 1 : 0) + (finalCorrect ? 1 : 0);

    await supabase
      .from("tournament_predictions")
      .update({ score, left_correct: leftCorrect, right_correct: rightCorrect, final_correct: finalCorrect })
      .eq("id", prediction.id);
  }
}

module.exports = { recalculateScores };
