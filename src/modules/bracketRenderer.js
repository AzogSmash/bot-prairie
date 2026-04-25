"use strict";

const path = require("path");
const fs   = require("fs");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const W = 3200;

function getCanvasHeight(teamsPerSide) {
  if (teamsPerSide <= 4)  return 1100;
  if (teamsPerSide <= 6)  return 1300;
  if (teamsPerSide <= 12) return 1700;
  if (teamsPerSide <= 16) return 2000;
  return 2200;
}

function getBgCrop(teamsPerSide) {
  if (teamsPerSide <= 4)  return 0.52;
  if (teamsPerSide <= 6)  return 0.60;
  if (teamsPerSide <= 12) return 0.70;
  if (teamsPerSide <= 16) return 0.80;
  return 0.90;
}

const C = {
  pending: { bg: "rgba(15, 8, 45, 0.88)",  border: "rgba(140, 90, 255, 0.75)", text: "#d0c0ff", name: "#e8dcff" },
  winner:  { bg: "rgba(5, 50, 15, 0.92)",  border: "rgba(40, 220, 75, 0.95)",  text: "#90ffaa", name: "#c0ffd0" },
  loser:   { bg: "rgba(45, 8, 8, 0.88)",   border: "rgba(190, 40, 40, 0.75)",  text: "#ffaaaa", name: "#ffcccc" },
  waiting: { bg: "rgba(8, 5, 25, 0.60)",   border: "rgba(70, 55, 130, 0.35)",  text: "rgba(130,110,190,0.5)" },
};

const CONNECTOR  = "rgba(150, 90, 255, 0.60)";
const FINAL_GOLD = "rgba(255, 200, 0, 0.95)";
const LABEL_COL  = "rgba(220, 195, 255, 0.95)";
const LABEL_ACTIVE = "#ffffff";

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function rrectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function rrectBot(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y);
  ctx.closePath();
}
function outlined(ctx, text, x, y, fill, stroke, lw, align = "left", baseline = "top") {
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.lineJoin = "round"; ctx.lineWidth = lw;
  ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function trunc(s, max) {
  if (!s) return "?";
  return s.length > max ? s.slice(0, max - 1) + "..." : s;
}
function getRoundLabel(round, maxRound) {
  if (round === 99)           return "GRANDE FINALE";
  if (round === maxRound)     return "Finale de poule";
  if (round === maxRound - 1) return "Demi-finale";
  if (round === maxRound - 2) return "Quart de finale";
  return `Round ${round}`;
}

// ── Faisceau lumineux ─────────────────────────────────────────────────────────
function drawSingleBeam(ctx, centerX, H, color, intensity, beamW) {
  // Trait fin et lumineux — très concentré au centre
  const thinW = beamW * 0.15;
  const grad = ctx.createLinearGradient(centerX - thinW, 0, centerX + thinW, 0);
  grad.addColorStop(0,    "rgba(0,0,0,0)");
  grad.addColorStop(0.3,  `rgba(${color}, ${intensity * 0.5})`);
  grad.addColorStop(0.5,  `rgba(${color}, ${intensity})`);
  grad.addColorStop(0.7,  `rgba(${color}, ${intensity * 0.5})`);
  grad.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(centerX - thinW, 0, thinW * 2, H * 0.85);

  // Halo léger autour
  const haloW = beamW * 0.5;
  const halo = ctx.createLinearGradient(centerX - haloW, 0, centerX + haloW, 0);
  halo.addColorStop(0,   "rgba(0,0,0,0)");
  halo.addColorStop(0.4, `rgba(${color}, ${intensity * 0.12})`);
  halo.addColorStop(0.5, `rgba(${color}, ${intensity * 0.25})`);
  halo.addColorStop(0.6, `rgba(${color}, ${intensity * 0.12})`);
  halo.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(centerX - haloW, 0, haloW * 2, H * 0.85);
}

// ── Rendu d'un côté ───────────────────────────────────────────────────────────
function renderSide(ctx, sideMatches, startX, sideW, areaTop, areaH, teamMap, membersMap, direction, activeRound) {
  if (!sideMatches.length) return {};

  const rounds    = [...new Set(sideMatches.map(m => m.round))].sort((a, b) => a - b);
  const maxRound  = Math.max(...rounds);
  const numRounds = rounds.length;
  const roundW    = sideW / numRounds;
  const maxM      = Math.max(...rounds.map(r => sideMatches.filter(m => m.round === r).length));
  const GAP       = Math.max(10, Math.floor(areaH * 0.018));
  const BOX_H     = Math.min(200, Math.max(100, Math.floor((areaH * 0.88 - (maxM - 1) * GAP) / maxM)));
  const BOX_W     = Math.min(380, Math.max(220, Math.floor(roundW * 0.84)));

  const positions = {};

  rounds.forEach((round, ri) => {
    const roundMatches = sideMatches.filter(m => m.round === round).sort((a, b) => a.match_order - b.match_order);
    const numM = roundMatches.length;

    const colX = direction === 1
      ? startX + ri * roundW + (roundW - BOX_W) / 2
      : startX + (numRounds - 1 - ri) * roundW + (roundW - BOX_W) / 2;

    const centerX = colX + BOX_W / 2;
    positions[`round_${round}_centerX`] = centerX;

    const totalH = numM * BOX_H + (numM - 1) * GAP;
    const startY = areaTop + (areaH - totalH) / 2;

    // Label du round — mis en valeur si c'est le round actif
    const isActive = round === activeRound;
    const labelSize = isActive ? 24 : 18;
    const labelFill = isActive ? LABEL_ACTIVE : LABEL_COL;
    const labelLw   = isActive ? 5 : 3;

    ctx.font = `700 ${labelSize}px Arial`;

    if (isActive) {
      // Halo violet derrière le label actif
      ctx.save();
      ctx.shadowColor = "rgba(180, 100, 255, 0.9)";
      ctx.shadowBlur  = 18;
      outlined(ctx, getRoundLabel(round, maxRound), centerX, startY - 10, labelFill, "rgba(0,0,0,0.9)", labelLw, "center", "bottom");
      ctx.restore();
    } else {
      outlined(ctx, getRoundLabel(round, maxRound), centerX, startY - 8, labelFill, "rgba(0,0,0,0.8)", labelLw, "center", "bottom");
    }

    roundMatches.forEach((match, mi) => {
      const boxY = startY + mi * (BOX_H + GAP);
      const cy   = drawMatch(ctx, colX, boxY, BOX_W, BOX_H, match, teamMap, membersMap);
      positions[match.id] = { x: colX, y: boxY, w: BOX_W, h: BOX_H, cy };
    });
  });

  // Connecteurs
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const cur  = sideMatches.filter(m => m.round === rounds[ri]).sort((a, b) => a.match_order - b.match_order);
    const next = sideMatches.filter(m => m.round === rounds[ri + 1]).sort((a, b) => a.match_order - b.match_order);
    next.forEach((nm, ni) => {
      const dp = positions[nm.id];
      if (!dp) return;
      [cur[ni * 2], cur[ni * 2 + 1]].forEach(src => {
        if (!src || !positions[src.id]) return;
        const sp = positions[src.id];
        const fx = direction === 1 ? sp.x + sp.w : sp.x;
        const tx = direction === 1 ? dp.x        : dp.x + dp.w;
        const mx = (fx + tx) / 2;
        ctx.beginPath(); ctx.moveTo(fx, sp.cy);
        ctx.bezierCurveTo(mx, sp.cy, mx, dp.cy, tx, dp.cy);
        ctx.strokeStyle = CONNECTOR; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
      });
    });
  }

  return positions;
}

// ── Dessin d'un match ─────────────────────────────────────────────────────────
function drawHalf(ctx, x, y, bw, bh, team, members, isWinner, isLoser, isTop, nameSize, memberSize) {
  const col = isWinner ? C.winner : isLoser ? C.loser : C.pending;
  if (isTop) rrectTop(ctx, x, y, bw, bh, 8);
  else       rrectBot(ctx, x, y, bw, bh, 8);
  ctx.fillStyle = col.bg; ctx.fill();
  ctx.strokeStyle = col.border; ctx.lineWidth = isWinner ? 2.5 : 1.5; ctx.stroke();
  if (isWinner) { ctx.save(); ctx.shadowColor = col.border; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore(); }

  const pad = 10;
  ctx.font = `900 ${nameSize}px Arial`;
  outlined(ctx, trunc(team?.name || "?", 20), x + pad, y + 5, isWinner ? "#ffd700" : col.name, "#000", 3);
  if (members?.length) {
    const ms = members.slice(0, 3).map(m => trunc(m, 14)).join("  |  ");
    ctx.font = `400 ${memberSize}px Arial`;
    outlined(ctx, ms, x + pad, y + bh - memberSize - 5, col.text, "rgba(0,0,0,0.8)", 2);
  }
}

function drawWaiting(ctx, x, y, bw, bh, isTop, labelSize) {
  if (isTop) rrectTop(ctx, x, y, bw, bh, 8);
  else       rrectBot(ctx, x, y, bw, bh, 8);
  ctx.fillStyle = C.waiting.bg; ctx.fill();
  ctx.strokeStyle = C.waiting.border; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `400 ${labelSize}px Arial`;
  outlined(ctx, "En attente", x + bw / 2, y + bh / 2, C.waiting.text, "transparent", 0, "center", "middle");
}

function drawMatch(ctx, x, y, bw, bh, match, teamMap, membersMap) {
  const t1 = teamMap[match?.team1_id];
  const t2 = teamMap[match?.team2_id];
  const halfH      = Math.floor((bh - 2) / 2);
  const isFinished = match?.status === "finished";
  const wId        = match?.winner_id;
  const nameSize   = 22;
  const memberSize = 16;
  const labelSize  = 13;

  if (!t1 && !t2) {
    rrect(ctx, x, y, bw, bh, 8);
    ctx.fillStyle = "rgba(5, 3, 20, 0.50)"; ctx.fill();
    ctx.strokeStyle = "rgba(60, 45, 110, 0.25)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `400 ${labelSize}px Arial`;
    outlined(ctx, "En attente des rounds precedents", x + bw / 2, y + bh / 2, "rgba(110,90,170,0.45)", "transparent", 0, "center", "middle");
    return y + bh / 2;
  }

  if (t1) drawHalf(ctx, x, y, bw, halfH, t1, membersMap[t1.id], isFinished && wId === t1.id, isFinished && wId !== t1.id, true, nameSize, memberSize);
  else    drawWaiting(ctx, x, y, bw, halfH, true, labelSize);
  ctx.beginPath(); ctx.moveTo(x, y + halfH + 1); ctx.lineTo(x + bw, y + halfH + 1);
  ctx.strokeStyle = "rgba(100, 80, 180, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
  const y2 = y + halfH + 2;
  if (t2) drawHalf(ctx, x, y2, bw, halfH, t2, membersMap[t2.id], isFinished && wId === t2.id, isFinished && wId !== t2.id, false, nameSize, memberSize);
  else    drawWaiting(ctx, x, y2, bw, halfH, false, labelSize);
  return y + bh / 2;
}

// ── Rendu principal ───────────────────────────────────────────────────────────
async function renderBracket(tournament, matches, teams, teamMembers) {
  const teamsPerSide = (tournament.size || 12) / 2;
  const H      = getCanvasHeight(teamsPerSide);
  const bgCrop = getBgCrop(teamsPerSide);

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;

  // Fond
  const bgPaths = [
    path.resolve(__dirname, "..", "assets", "backgrounds", "fond_profil2.png"),
    path.resolve(__dirname, "..", "assets", "backgrounds", "fond_profil.png"),
    path.resolve(__dirname, "..", "assets", "fond_profil2.png"),
    path.resolve(__dirname, "..", "assets", "fond_profil.png"),
  ];
  let bgLoaded = false;
  for (const bp of bgPaths) {
    if (fs.existsSync(bp)) {
      try {
        const bg   = await loadImage(bp);
        const srcH = Math.floor(bg.height * bgCrop);
        const sc   = Math.max(W / bg.width, H / srcH);
        const dw   = bg.width * sc;
        const dh   = srcH * sc;
        ctx.save(); ctx.rect(0, 0, W, H); ctx.clip();
        ctx.drawImage(bg, 0, 0, bg.width, srcH, (W - dw) / 2, 0, dw, dh);
        ctx.restore();
        bgLoaded = true; break;
      } catch {}
    }
  }
  if (!bgLoaded) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a0838"); g.addColorStop(1, "#080215");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = "rgba(0,0,0,0.48)"; ctx.fillRect(0, 0, W, H);

  // Layout
  const HEADER_H = 100;
  const FOOTER_H = 190;
  const AREA_TOP = HEADER_H + 10;
  const AREA_H   = H - AREA_TOP - FOOTER_H;
  const FINAL_W  = 340;
  const FINAL_X  = (W - FINAL_W) / 2;
  const SIDE_W   = (W - FINAL_W) / 2 - 50;
  const LEFT_X   = 20;
  const RIGHT_X  = W - SIDE_W - 20;

  // Maps
  const teamMap = {};
  for (const t of (teams || [])) teamMap[t.id] = t;
  const membersMap = {};
  for (const m of (teamMembers || [])) {
    if (!membersMap[m.team_id]) membersMap[m.team_id] = [];
    membersMap[m.team_id].push(m.discord_username);
  }

  const leftMatches  = matches.filter(m => m.side === "left").sort((a, b) => a.round - b.round || a.match_order - b.match_order);
  const rightMatches = matches.filter(m => m.side === "right").sort((a, b) => a.round - b.round || a.match_order - b.match_order);
  const finalMatch   = matches.find(m => m.side === "final");

  // Calcul du round actif gauche et droite
  const leftPlayable  = leftMatches.filter(m => m.team1_id && m.team2_id);
  const rightPlayable = rightMatches.filter(m => m.team1_id && m.team2_id);
  const leftRounds    = [...new Set(leftPlayable.map(m => m.round))].sort((a, b) => a - b);
  const rightRounds   = [...new Set(rightPlayable.map(m => m.round))].sort((a, b) => a - b);

  let activeLeftRound  = leftRounds[0] ?? 1;
  let activeRightRound = rightRounds[0] ?? 1;
  const isFinalRound   = leftPlayable.every(m => m.status === 'finished') && rightPlayable.every(m => m.status === 'finished');

  if (!isFinalRound) {
  for (const r of leftRounds) {
      if (leftPlayable.filter(m => m.round === r).some(m => m.status !== 'finished')) { activeLeftRound = r; break; }
   }
  for (const r of rightRounds) {
      if (rightPlayable.filter(m => m.round === r).some(m => m.status !== 'finished')) { activeRightRound = r; break; }
   }
  }

// Calcul centerX avant renderSide
  const numRoundsCalc = [...new Set(leftMatches.map(m => m.round))].length || 1;
  const roundWCalc    = SIDE_W / numRoundsCalc;
  const BOX_W_CALC    = Math.min(380, Math.max(220, Math.floor(roundWCalc * 0.84)));
  const BEAM_W        = roundWCalc * 0.8;
  const PURPLE        = "160, 80, 255";
  const GOLD          = "255, 190, 0";

  if (!isFinalRound) {
    const allRounds      = [...new Set(leftMatches.map(m => m.round))].sort((a, b) => a - b);
    const leftActiveIdx  = allRounds.indexOf(activeLeftRound);
    const rightActiveIdx = [...new Set(rightMatches.map(m => m.round))].sort((a, b) => a - b).indexOf(activeRightRound);
    const leftColX    = LEFT_X  + leftActiveIdx * roundWCalc + (roundWCalc - BOX_W_CALC) / 2;
    const rightColX   = RIGHT_X + (numRoundsCalc - 1 - rightActiveIdx) * roundWCalc + (roundWCalc - BOX_W_CALC) / 2;
    drawSingleBeam(ctx, leftColX  + BOX_W_CALC / 2, H, PURPLE, 0.70, BEAM_W);
    drawSingleBeam(ctx, rightColX + BOX_W_CALC / 2, H, PURPLE, 0.70, BEAM_W);
  }

  drawSingleBeam(ctx, FINAL_X + FINAL_W / 2, H, GOLD, isFinalRound ? 0.95 : 0.30, BEAM_W * 1.4);

  // Rendu des côtés PAR-DESSUS les faisceaux
  const leftPos  = renderSide(ctx, leftMatches,  LEFT_X,  SIDE_W, AREA_TOP, AREA_H, teamMap, membersMap, 1,  isFinalRound ? -1 : activeLeftRound);
  const rightPos = renderSide(ctx, rightMatches, RIGHT_X, SIDE_W, AREA_TOP, AREA_H, teamMap, membersMap, -1, isFinalRound ? -1 : activeRightRound);

  // Header
  ctx.font = `900 58px Arial`;
  outlined(ctx, tournament.name, W / 2, 12, "#ffffff", "#000", 10, "center", "top");
  const finished = matches.filter(m => m.status === "finished").length;
  ctx.font = `400 26px Arial`;
  outlined(ctx, `${finished} / ${matches.length} matchs termines`, W / 2, 76, LABEL_COL, "rgba(0,0,0,0.7)", 4, "center", "top");

  ctx.font = `700 22px Arial`;
  outlined(ctx, "TABLEAU GAUCHE", LEFT_X + SIDE_W / 2, 42, "rgba(180, 145, 255, 0.85)", "rgba(0,0,0,0.6)", 3, "center", "top");
  outlined(ctx, "TABLEAU DROIT",  RIGHT_X + SIDE_W / 2, 42, "rgba(180, 145, 255, 0.85)", "rgba(0,0,0,0.6)", 3, "center", "top");

  // Finale
  if (finalMatch) {
    const FBOX_H = Math.min(180, Math.max(120, Math.floor(AREA_H / 4)));
    const FBOX_Y = AREA_TOP + (AREA_H - FBOX_H) / 2;
    const halfH  = Math.floor((FBOX_H - 2) / 2);
    const FCY    = FBOX_Y + FBOX_H / 2;

    ctx.font = `900 ${isFinalRound ? 28 : 22}px Arial`;
    ctx.save();
    ctx.shadowColor = isFinalRound ? FINAL_GOLD : "rgba(255,180,0,0.5)";
    ctx.shadowBlur  = isFinalRound ? 30 : 12;
    outlined(ctx, "GRANDE FINALE", FINAL_X + FINAL_W / 2, FBOX_Y - 34, isFinalRound ? "#ffd700" : "rgba(255,190,0,0.7)", "#000", isFinalRound ? 6 : 4, "center", "bottom");
    ctx.restore();

    const t1 = teamMap[finalMatch.team1_id];
    const t2 = teamMap[finalMatch.team2_id];
    const isFin = finalMatch.status === "finished";
    const wId   = finalMatch.winner_id;
    const nSize = Math.max(18, Math.min(28, Math.floor(FINAL_W / 11)));
    const mSize = Math.max(14, Math.min(20, Math.floor(FINAL_W / 15)));
    const lSize = Math.max(12, Math.min(15, Math.floor(FINAL_W / 20)));

    if (t1) drawHalf(ctx, FINAL_X, FBOX_Y, FINAL_W, halfH, t1, membersMap[t1.id], isFin && wId === t1.id, isFin && wId !== t1.id, true, nSize, mSize);
    else    drawWaiting(ctx, FINAL_X, FBOX_Y, FINAL_W, halfH, true, lSize);
    ctx.beginPath(); ctx.moveTo(FINAL_X, FBOX_Y + halfH + 1); ctx.lineTo(FINAL_X + FINAL_W, FBOX_Y + halfH + 1);
    ctx.strokeStyle = "rgba(255,180,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    const y2 = FBOX_Y + halfH + 2;
    if (t2) drawHalf(ctx, FINAL_X, y2, FINAL_W, halfH, t2, membersMap[t2.id], isFin && wId === t2.id, isFin && wId !== t2.id, false, nSize, mSize);
    else    drawWaiting(ctx, FINAL_X, y2, FINAL_W, halfH, false, lSize);

    rrect(ctx, FINAL_X, FBOX_Y, FINAL_W, FBOX_H, 8);
    ctx.strokeStyle = isFin && wId ? FINAL_GOLD : "rgba(255,180,0,0.55)";
    ctx.lineWidth   = isFin ? 3 : 1.5;
    if (isFin && wId) { ctx.save(); ctx.shadowColor = FINAL_GOLD; ctx.shadowBlur = 22; ctx.stroke(); ctx.restore(); }
    else ctx.stroke();

    const lastLeft  = leftMatches.filter(m => m.round === Math.max(...leftMatches.map(x => x.round))).find(m => m.match_order === 1);
    const lastRight = rightMatches.filter(m => m.round === Math.max(...rightMatches.map(x => x.round))).find(m => m.match_order === 1);
    if (lastLeft && leftPos[lastLeft.id]) {
      const p = leftPos[lastLeft.id];
      ctx.beginPath(); ctx.moveTo(p.x + p.w, p.cy);
      ctx.bezierCurveTo((p.x + p.w + FINAL_X) / 2, p.cy, (p.x + p.w + FINAL_X) / 2, FCY, FINAL_X, FCY);
      ctx.strokeStyle = FINAL_GOLD; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (lastRight && rightPos[lastRight.id]) {
      const p = rightPos[lastRight.id];
      ctx.beginPath(); ctx.moveTo(p.x, p.cy);
      ctx.bezierCurveTo((p.x + FINAL_X + FINAL_W) / 2, p.cy, (p.x + FINAL_X + FINAL_W) / 2, FCY, FINAL_X + FINAL_W, FCY);
      ctx.strokeStyle = FINAL_GOLD; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }

  // Footer
  const footerY = H - FOOTER_H;
  ctx.fillStyle = "rgba(8, 4, 25, 0.85)";
  ctx.fillRect(0, footerY, W, FOOTER_H);
  ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(W, footerY);
  ctx.strokeStyle = "rgba(140, 90, 255, 0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = `700 28px Arial`;
  outlined(ctx, "Bientot...A vos pronostics ! Utilisez /pronostic dans #commandes-bot pour parier sur vos equipes gagnantes", W / 2, footerY + 40, "#ffd700", "rgba(0,0,0,0.9)", 5, "center", "top");
  ctx.font = `400 23px Arial`;
  outlined(ctx, "et tenter de gagner des points qui vous permettront d'avoir un battlepass offert entre autre !", W / 2, footerY + 76, "rgba(220, 195, 255, 0.90)", "rgba(0,0,0,0.7)", 3, "center", "top");
  ctx.font = `400 13px Arial`;
  outlined(ctx, `Prairie Brawl Stars  |  ${new Date().toLocaleString("fr-FR")}`, W - 14, H - 8, "rgba(180,155,220,0.35)", "transparent", 0, "right", "bottom");

  return canvas.toBuffer("image/png");
}

module.exports = { renderBracket };