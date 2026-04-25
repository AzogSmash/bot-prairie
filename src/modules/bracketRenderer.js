"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const ASSETS = path.resolve(__dirname, "..", "assets");
const BG_DIR = path.join(ASSETS, "backgrounds");

// ── Dimensions ────────────────────────────────────────────────────────────────
const W = 3000;
const H = 1600;
const SCALE = 1;

// ── Couleurs ──────────────────────────────────────────────────────────────────
const COLORS = {
  pending:  { bg: "rgba(20, 10, 50, 0.75)",  border: "rgba(150, 100, 255, 0.6)",  text: "#c8b8ff" },
  winner:   { bg: "rgba(10, 60, 20, 0.85)",  border: "rgba(50, 220, 80, 0.9)",    text: "#80ff99" },
  loser:    { bg: "rgba(40, 10, 10, 0.75)",  border: "rgba(180, 50, 50, 0.6)",    text: "#ff9090" },
  ongoing:  { bg: "rgba(60, 40, 0, 0.85)",   border: "rgba(255, 180, 0, 0.9)",    text: "#ffe080" },
};

const CONNECTOR_COLOR = "rgba(180, 120, 255, 0.7)";
const FINAL_COLOR     = "rgba(255, 200, 0, 0.9)";
const TITLE_COLOR     = "#ffffff";
const ROUND_LABEL_COLOR = "rgba(200, 180, 255, 0.85)";

// ── Fonts ─────────────────────────────────────────────────────────────────────
function FONT(size, weight = 700) {
  return `${weight} ${size}px "Lilita One", "Lilita", Arial, sans-serif`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function outlined(ctx, text, x, y, fill, stroke, lw, align = "left") {
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawTeamBox(ctx, x, y, w, h, teamName, members, status, isWinner = false) {
  const col = isWinner ? COLORS.winner : (status === 'ongoing' ? COLORS.ongoing : (status === 'finished' && !isWinner ? COLORS.loser : COLORS.pending));

  // Fond
  rrPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = col.bg;
  ctx.fill();

  // Bordure
  rrPath(ctx, x, y, w, h, 10);
  ctx.strokeStyle = col.border;
  ctx.lineWidth = isWinner ? 3 : 1.5;
  ctx.stroke();

  // Glow si gagnant
  if (isWinner) {
    ctx.save();
    ctx.shadowColor = col.border;
    ctx.shadowBlur = 12;
    rrPath(ctx, x, y, w, h, 10);
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  const pad = 10;
  ctx.textBaseline = "top";

  // Nom de l'équipe
  const nameSize = Math.min(18, Math.floor(w / 10));
  ctx.font = FONT(nameSize, 900);
  const nameY = y + pad;
  outlined(ctx, teamName || "?", x + pad, nameY, isWinner ? "#ffd700" : col.text, "#000", 3);

  // Séparateur
  ctx.beginPath();
  ctx.moveTo(x + pad, nameY + nameSize + 4);
  ctx.lineTo(x + w - pad, nameY + nameSize + 4);
  ctx.strokeStyle = col.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Membres
  const memberSize = Math.min(13, Math.floor(w / 14));
  ctx.font = FONT(memberSize, 400);
  const memberStartY = nameY + nameSize + 10;
  const lineH = memberSize + 5;

  (members || []).slice(0, 3).forEach((m, i) => {
    const memberY = memberStartY + i * lineH;
    const memberName = m.length > 18 ? m.slice(0, 16) + "…" : m;
    outlined(ctx, `• ${memberName}`, x + pad, memberY, col.text, "#000", 2);
  });
}

function drawConnector(ctx, x1, y1, x2, y2, color = CONNECTOR_COLOR) {
  const mx = (x1 + x2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();
}

function drawLine(ctx, x1, y1, x2, y2, color = CONNECTOR_COLOR, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

// ── Structure du bracket ──────────────────────────────────────────────────────
// Retourne les rounds max par côté selon la taille du tournoi
function getMaxRound(teamsPerSide) {
  if (teamsPerSide <= 6)  return 3;
  if (teamsPerSide <= 12) return 4;
  return 5;
}

function getRoundLabel(round, maxRound) {
  if (round === maxRound) return "Finale de poule";
  if (round === maxRound - 1) return "Demi-finale";
  if (round === maxRound - 2) return "Quart de finale";
  return `Round ${round}`;
}

// ── Rendu principal ───────────────────────────────────────────────────────────
async function renderBracket(tournament, matches, teams, teamMembers) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ── Fond ───────────────────────────────────────────────────────────────────
  const bgPath = path.join(BG_DIR, "fond_profil2.png");
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    const sc = Math.max(W / bg.width, H / bg.height);
    ctx.drawImage(bg, (W - bg.width * sc) / 2, (H - bg.height * sc) / 2, bg.width * sc, bg.height * sc);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a0a38");
    g.addColorStop(1, "#0d0520");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay sombre pour lisibilité
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, W, H);

  // ── Title ──────────────────────────────────────────────────────────────────
  const TITLE_H = 70;
  ctx.font = FONT(36, 900);
  ctx.textBaseline = "middle";
  outlined(ctx, `🏆 ${tournament.name}`, W / 2, TITLE_H / 2, TITLE_COLOR, "#000", 6, "center");

  // ── Layout ─────────────────────────────────────────────────────────────────
  const BRACKET_TOP    = TITLE_H + 20;
  const BRACKET_H      = H - BRACKET_TOP - 20;
  const BRACKET_W      = W;

  // Zone finale au centre
  const FINAL_W        = 200;
  const FINAL_X        = (W - FINAL_W) / 2;

  // Zone gauche et droite
  const SIDE_W         = (W - FINAL_W) / 2 - 20;
  const LEFT_X         = 10;
  const RIGHT_X        = W - SIDE_W - 10;

  // ── Maps ───────────────────────────────────────────────────────────────────
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

  const teamsPerSide = (tournament.size || 12) / 2;
  const maxRound     = getMaxRound(teamsPerSide);

  // ── Rendu d'un côté ────────────────────────────────────────────────────────
  function renderSide(sideMatches, sideX, sideW, direction) {
    // direction: 1 = gauche (R1 à gauche), -1 = droite (R1 à droite)
    const rounds = [...new Set(sideMatches.map(m => m.round))].sort((a, b) => a - b);
    const numRounds = rounds.length;
    const roundW = sideW / numRounds;

    // Boîte dimensions
    const BOX_W  = Math.min(200, roundW - 30);
    const BOX_H  = 90;
    const GAP    = 16;

    // Stocke les positions des boîtes pour tracer les connecteurs
    const boxPositions = {}; // matchId -> {cx, cy}

    rounds.forEach((round, ri) => {
      const roundMatches = sideMatches.filter(m => m.round === round);
      const numMatches   = roundMatches.length;

      // Position X du round
      let colX;
      if (direction === 1) {
        colX = sideX + ri * roundW + (roundW - BOX_W) / 2;
      } else {
        colX = sideX + (numRounds - 1 - ri) * roundW + (roundW - BOX_W) / 2;
      }

      // Espacement vertical
      const totalH   = numMatches * BOX_H + (numMatches - 1) * GAP;
      const startY   = BRACKET_TOP + (BRACKET_H - totalH) / 2;

      // Label du round
      const labelX = colX + BOX_W / 2;
      const labelY = BRACKET_TOP + 8;
      ctx.font = FONT(13, 700);
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      ctx.fillStyle = ROUND_LABEL_COLOR;
      ctx.fillText(getRoundLabel(round, maxRound), labelX, labelY);

      roundMatches.forEach((match, mi) => {
        const boxY = startY + mi * (BOX_H + GAP);
        const boxCY = boxY + BOX_H / 2;

        boxPositions[match.id] = { x: colX, y: boxY, cx: colX + BOX_W / 2, cy: boxCY, w: BOX_W, h: BOX_H };

        const t1 = teamMap[match.team1_id];
        const t2 = teamMap[match.team2_id];
        const winner = teamMap[match.winner_id];

        if (!t1 && !t2) {
          // Match vide (rounds futurs)
          rrPath(ctx, colX, boxY, BOX_W, BOX_H, 10);
          ctx.fillStyle = "rgba(10, 5, 30, 0.5)";
          ctx.fill();
          rrPath(ctx, colX, boxY, BOX_W, BOX_H, 10);
          ctx.strokeStyle = "rgba(100, 80, 180, 0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.font = FONT(13, 400);
          ctx.textBaseline = "middle";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(150, 130, 200, 0.5)";
          ctx.fillText("En attente", colX + BOX_W / 2, boxY + BOX_H / 2);
          return;
        }

        // Match avec 2 équipes — affiche en deux demi-boîtes
        const halfH = (BOX_H - 2) / 2;

        [t1, t2].forEach((team, ti) => {
          if (!team) return;
          const teamY    = boxY + ti * (halfH + 2);
          const isWinner = match.status === "finished" && match.winner_id === team.id;
          const isLoser  = match.status === "finished" && match.winner_id !== team.id;
          const members  = membersMap[team.id] || [];

          const col = isWinner ? COLORS.winner : (isLoser ? COLORS.loser : COLORS.pending);

          rrPath(ctx, colX, teamY, BOX_W, halfH, ti === 0 ? 10 : 0);
          if (ti === 0) {
            // Top half rounded top
            ctx.beginPath();
            ctx.moveTo(colX + 10, teamY);
            ctx.lineTo(colX + BOX_W - 10, teamY);
            ctx.arcTo(colX + BOX_W, teamY, colX + BOX_W, teamY + 10, 10);
            ctx.lineTo(colX + BOX_W, teamY + halfH);
            ctx.lineTo(colX, teamY + halfH);
            ctx.lineTo(colX, teamY + 10);
            ctx.arcTo(colX, teamY, colX + 10, teamY, 10);
            ctx.closePath();
          } else {
            ctx.beginPath();
            ctx.moveTo(colX, teamY);
            ctx.lineTo(colX + BOX_W, teamY);
            ctx.lineTo(colX + BOX_W, teamY + halfH - 10);
            ctx.arcTo(colX + BOX_W, teamY + halfH, colX + BOX_W - 10, teamY + halfH, 10);
            ctx.lineTo(colX + 10, teamY + halfH);
            ctx.arcTo(colX, teamY + halfH, colX, teamY + halfH - 10, 10);
            ctx.closePath();
          }
          ctx.fillStyle = col.bg;
          ctx.fill();
          ctx.strokeStyle = col.border;
          ctx.lineWidth = isWinner ? 2 : 1;
          ctx.stroke();

          if (isWinner) {
            ctx.save();
            ctx.shadowColor = col.border;
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.restore();
          }

          // Nom équipe
          const pad = 7;
          ctx.textBaseline = "top";
          const nameSize = 13;
          ctx.font = FONT(nameSize, 900);
          const displayName = (team.name || "?").slice(0, 14);
          outlined(ctx, displayName, colX + pad, teamY + 3, isWinner ? "#ffd700" : col.text, "#000", 2.5);

          // Membres (1 ligne compacte)
          const memberStr = members.slice(0, 3).map(m => m.length > 8 ? m.slice(0, 7) + "." : m).join(" · ");
          ctx.font = FONT(10, 400);
          ctx.textBaseline = "bottom";
          outlined(ctx, memberStr, colX + pad, teamY + halfH - 3, "rgba(200,190,255,0.85)", "#000", 1.5);
        });

        // Séparateur entre les deux équipes
        ctx.beginPath();
        ctx.moveTo(colX, boxY + halfH + 1);
        ctx.lineTo(colX + BOX_W, boxY + halfH + 1);
        ctx.strokeStyle = "rgba(120, 100, 200, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    });

    // ── Connecteurs entre rounds ────────────────────────────────────────────
    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const round     = rounds[ri];
      const nextRound = rounds[ri + 1];
      const roundMatches     = sideMatches.filter(m => m.round === round);
      const nextRoundMatches = sideMatches.filter(m => m.round === nextRound);

      // Paire de matchs → match suivant
      for (let i = 0; i < nextRoundMatches.length; i++) {
        const next   = nextRoundMatches[i];
        const src1   = roundMatches[i * 2];
        const src2   = roundMatches[i * 2 + 1];
        const dstPos = boxPositions[next?.id];

        if (src1 && boxPositions[src1.id] && dstPos) {
          const p1 = boxPositions[src1.id];
          const fromX = direction === 1 ? p1.x + p1.w : p1.x;
          const toX   = direction === 1 ? dstPos.x : dstPos.x + dstPos.w;
          drawLine(ctx, fromX, p1.cy, toX, dstPos.cy, CONNECTOR_COLOR, 1.5);
        }
        if (src2 && boxPositions[src2.id] && dstPos) {
          const p2 = boxPositions[src2.id];
          const fromX = direction === 1 ? p2.x + p2.w : p2.x;
          const toX   = direction === 1 ? dstPos.x : dstPos.x + dstPos.w;
          drawLine(ctx, fromX, p2.cy, toX, dstPos.cy, CONNECTOR_COLOR, 1.5);
        }
      }
    }

    return boxPositions;
  }

  const leftPositions  = renderSide(leftMatches,  LEFT_X,  SIDE_W,  1);
  const rightPositions = renderSide(rightMatches, RIGHT_X, SIDE_W, -1);

  // ── Finale ─────────────────────────────────────────────────────────────────
  if (finalMatch) {
    const FBOX_W  = 220;
    const FBOX_H  = 100;
    const finalX  = (W - FBOX_W) / 2;
    const finalY  = BRACKET_TOP + (BRACKET_H - FBOX_H) / 2;
    const finalCY = finalY + FBOX_H / 2;

    const t1 = teamMap[finalMatch.team1_id];
    const t2 = teamMap[finalMatch.team2_id];

    // Label
    ctx.font = FONT(14, 900);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "center";
    ctx.fillStyle = FINAL_COLOR;
    ctx.shadowColor = FINAL_COLOR;
    ctx.shadowBlur = 8;
    ctx.fillText("⚔️ GRANDE FINALE", W / 2, finalY - 6);
    ctx.shadowBlur = 0;

    const halfH = (FBOX_H - 2) / 2;

    [t1, t2].forEach((team, ti) => {
      if (!team) {
        // Case vide
        const teamY = finalY + ti * (halfH + 2);
        ctx.beginPath();
        if (ti === 0) {
          ctx.moveTo(finalX + 10, teamY);
          ctx.lineTo(finalX + FBOX_W - 10, teamY);
          ctx.arcTo(finalX + FBOX_W, teamY, finalX + FBOX_W, teamY + 10, 10);
          ctx.lineTo(finalX + FBOX_W, teamY + halfH);
          ctx.lineTo(finalX, teamY + halfH);
          ctx.lineTo(finalX, teamY + 10);
          ctx.arcTo(finalX, teamY, finalX + 10, teamY, 10);
        } else {
          ctx.moveTo(finalX, teamY);
          ctx.lineTo(finalX + FBOX_W, teamY);
          ctx.lineTo(finalX + FBOX_W, teamY + halfH - 10);
          ctx.arcTo(finalX + FBOX_W, teamY + halfH, finalX + FBOX_W - 10, teamY + halfH, 10);
          ctx.lineTo(finalX + 10, teamY + halfH);
          ctx.arcTo(finalX, teamY + halfH, finalX, teamY + halfH - 10, 10);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(10, 5, 30, 0.6)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 180, 0, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.font = FONT(12, 400);
        ctx.fillStyle = "rgba(200, 160, 80, 0.5)";
        ctx.fillText("En attente", finalX + FBOX_W / 2, teamY + halfH / 2);
        return;
      }

      const teamY    = finalY + ti * (halfH + 2);
      const isWinner = finalMatch.status === "finished" && finalMatch.winner_id === team.id;
      const isLoser  = finalMatch.status === "finished" && finalMatch.winner_id !== team.id;
      const members  = membersMap[team.id] || [];
      const col      = isWinner ? COLORS.winner : (isLoser ? COLORS.loser : COLORS.pending);

      ctx.beginPath();
      if (ti === 0) {
        ctx.moveTo(finalX + 10, teamY);
        ctx.lineTo(finalX + FBOX_W - 10, teamY);
        ctx.arcTo(finalX + FBOX_W, teamY, finalX + FBOX_W, teamY + 10, 10);
        ctx.lineTo(finalX + FBOX_W, teamY + halfH);
        ctx.lineTo(finalX, teamY + halfH);
        ctx.lineTo(finalX, teamY + 10);
        ctx.arcTo(finalX, teamY, finalX + 10, teamY, 10);
      } else {
        ctx.moveTo(finalX, teamY);
        ctx.lineTo(finalX + FBOX_W, teamY);
        ctx.lineTo(finalX + FBOX_W, teamY + halfH - 10);
        ctx.arcTo(finalX + FBOX_W, teamY + halfH, finalX + FBOX_W - 10, teamY + halfH, 10);
        ctx.lineTo(finalX + 10, teamY + halfH);
        ctx.arcTo(finalX, teamY + halfH, finalX, teamY + halfH - 10, 10);
      }
      ctx.closePath();
      ctx.fillStyle = col.bg;
      ctx.fill();
      ctx.strokeStyle = isWinner ? FINAL_COLOR : col.border;
      ctx.lineWidth = isWinner ? 3 : 1.5;
      ctx.stroke();

      if (isWinner) {
        ctx.save();
        ctx.shadowColor = FINAL_COLOR;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.restore();
      }

      const pad = 8;
      ctx.textBaseline = "top";
      ctx.font = FONT(14, 900);
      outlined(ctx, (team.name || "?").slice(0, 16), finalX + pad, teamY + 3, isWinner ? "#ffd700" : col.text, "#000", 3);

      const memberStr = members.slice(0, 3).map(m => m.length > 9 ? m.slice(0, 8) + "." : m).join(" · ");
      ctx.font = FONT(11, 400);
      ctx.textBaseline = "bottom";
      outlined(ctx, memberStr, finalX + pad, teamY + halfH - 3, "rgba(200,190,255,0.85)", "#000", 2);
    });

    // Séparateur finale
    ctx.beginPath();
    ctx.moveTo(finalX, finalY + halfH + 1);
    ctx.lineTo(finalX + FBOX_W, finalY + halfH + 1);
    ctx.strokeStyle = "rgba(255, 180, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Connecteurs finale gauche
    const lastLeftRound = Math.max(...leftMatches.map(m => m.round));
    const lastLeftMatch = leftMatches.find(m => m.round === lastLeftRound);
    if (lastLeftMatch && leftPositions[lastLeftMatch.id]) {
      const p = leftPositions[lastLeftMatch.id];
      drawLine(ctx, p.x + p.w, p.cy, finalX, finalCY, FINAL_COLOR, 2);
    }

    // Connecteurs finale droite
    const lastRightRound = Math.max(...rightMatches.map(m => m.round));
    const lastRightMatch = rightMatches.find(m => m.round === lastRightRound);
    if (lastRightMatch && rightPositions[lastRightMatch.id]) {
      const p = rightPositions[lastRightMatch.id];
      drawLine(ctx, p.x, p.cy, finalX + FBOX_W, finalCY, FINAL_COLOR, 2);
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  ctx.font = FONT(12, 400);
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(200, 180, 255, 0.4)";
  ctx.fillText(`Prairie Brawl Stars • ${new Date().toLocaleDateString("fr-FR")}`, W - 10, H - 4);

  return canvas.toBuffer("image/png");
}

module.exports = { renderBracket };