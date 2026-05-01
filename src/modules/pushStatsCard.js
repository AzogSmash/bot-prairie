"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { DateTime } = require("luxon");
const { getCachedOrFetch } = require("../services/imageCache");
const { drawHeader, normalizeRankCardData } = require("./rankCard");

const ASSETS    = path.resolve(__dirname, "..", "assets");
const BG_DIR    = path.join(ASSETS, "backgrounds");
const ICONS_DIR = path.join(ASSETS, "icons");

const SCALE     = 2;
const W         = 1500;
const H         = 1500;
const MARGIN    = 14;
const CHART_H   = 416;
const CHART_GAP = 14;

function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}
function fmt(n) {
  return Number.isFinite(+n) ? Number(n).toLocaleString("fr-FR") : "0";
}
function fmtY(n) {
  const v = Math.round(n);
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return fmt(v);
}
function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(S(x + r), S(y));
  ctx.lineTo(S(x + w - r), S(y));
  ctx.arcTo(S(x + w), S(y),     S(x + w), S(y + r),     S(r));
  ctx.lineTo(S(x + w), S(y + h - r));
  ctx.arcTo(S(x + w), S(y + h), S(x + w - r), S(y + h), S(r));
  ctx.lineTo(S(x + r), S(y + h));
  ctx.arcTo(S(x),      S(y + h), S(x), S(y + h - r),    S(r));
  ctx.lineTo(S(x), S(y + r));
  ctx.arcTo(S(x),      S(y),     S(x + r), S(y),         S(r));
  ctx.closePath();
}

function outlined(ctx, text, x, y, fill, stroke, sw) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = S(sw);
  ctx.lineJoin    = "round";
  ctx.strokeText(String(text), S(x), S(y));
  ctx.fillStyle = fill;
  ctx.fillText(String(text), S(x), S(y));
}

async function tryLoad(localPath, remote = null) {
  if (localPath && fs.existsSync(localPath)) {
    try { return await loadImage(localPath); } catch { /* skip */ }
  }
  if (remote?.cacheKey && remote?.url) {
    try { return await getCachedOrFetch(remote.cacheKey, remote.url); } catch { /* skip */ }
  }
  return null;
}

// Catmull-Rom smooth curve (logical coords → scaled canvas)
function smoothPath(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(S(pts[0].x), S(pts[0].y));
  if (pts.length < 3) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(S(pts[i].x), S(pts[i].y));
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t  = 0.35;
    ctx.bezierCurveTo(
      S(p1.x + (p2.x - p0.x) * t / 2), S(p1.y + (p2.y - p0.y) * t / 2),
      S(p2.x - (p3.x - p1.x) * t / 2), S(p2.y - (p3.y - p1.y) * t / 2),
      S(p2.x), S(p2.y),
    );
  }
}

// ── Dessin d'un graphique ─────────────────────────────────────────────────────

function drawChart(ctx, { px, py, pw, ph, title, subtitle, points, color, icTrophies }) {
  // Panneau — fond sombre opaque + bordure visible
  rrPath(ctx, px, py, pw, ph, 14);
  ctx.fillStyle = "rgba(8,4,28,0.92)";
  ctx.fill();
  rrPath(ctx, px, py, pw, ph, 14);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth   = S(1.5);
  ctx.stroke();

  // Titre
  ctx.font         = FONT(17, 900);
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  outlined(ctx, title, px + 16, py + 11, color, "#000000", 3.5);

  // Sous-titre
  if (subtitle) {
    ctx.font = FONT(11, 700);
    outlined(ctx, subtitle, px + 16, py + 35, "rgba(200,215,255,0.72)", "#000000", 2.5);
  }

  const TITLE_H   = subtitle ? 60 : 42;
  const XLABEL_H  = 30;
  const YLABEL_W  = 58;
  const RPAD      = 14;
  const PANEL_PAD = 14;

  const ax = px + PANEL_PAD + YLABEL_W;
  const ay = py + PANEL_PAD + TITLE_H;
  const aw = pw - PANEL_PAD - YLABEL_W - RPAD - PANEL_PAD;
  const ah = ph - PANEL_PAD - TITLE_H - XLABEL_H - PANEL_PAD;

  // Pas de données
  if (!points || points.length < 2) {
    ctx.font         = FONT(13, 700);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle    = "rgba(255,255,255,0.35)";
    ctx.fillText("Pas encore assez de données", S(px + pw / 2), S(ay + ah / 2));
    return;
  }

  // Plage Y
  const vals     = points.map(p => p.value);
  const minV     = Math.min(...vals);
  const maxV     = Math.max(...vals);
  const rawRange = maxV - minV;
  const pad      = Math.max(rawRange * 0.18, 30);
  let yMin = Math.floor((minV - pad) / 50) * 50;
  let yMax = Math.ceil((maxV  + pad) / 50) * 50;
  if (yMax - yMin < 200) {
    const mid = (yMin + yMax) / 2;
    yMin = Math.floor((mid - 100) / 50) * 50;
    yMax = Math.ceil((mid  + 100) / 50) * 50;
  }
  const yRange = yMax - yMin;

  const toY = v => ay + ah * (1 - (v - yMin) / yRange);
  const toX = i => ax + (points.length > 1 ? (i / (points.length - 1)) * aw : aw / 2);

  // Ligne verticale axe Y
  ctx.beginPath();
  ctx.moveTo(S(ax), S(ay));
  ctx.lineTo(S(ax), S(ay + ah));
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth   = S(1);
  ctx.stroke();

  // Grille horizontale (5 lignes)
  const GRID = 4;
  for (let g = 0; g <= GRID; g++) {
    const gy = ay + g * ah / GRID;
    const yv = yMax - g * yRange / GRID;

    ctx.beginPath();
    ctx.moveTo(S(ax), S(gy));
    ctx.lineTo(S(ax + aw), S(gy));
    ctx.strokeStyle = g === 0 || g === GRID
      ? "rgba(255,255,255,0.28)"
      : "rgba(255,255,255,0.12)";
    ctx.lineWidth   = S(g === 0 || g === GRID ? 1.5 : 1);
    ctx.stroke();

    ctx.font         = FONT(10, 700);
    ctx.textAlign    = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle    = "rgba(255,255,255,0.65)";
    ctx.fillText(fmtY(yv), S(ax - 6), S(gy));
  }

  // Points canvas
  const pts = points.map((p, i) => ({ x: toX(i), y: toY(p.value) }));
  const [r, g, b] = hexRgb(color);

  // Remplissage dégradé — bien opaque
  ctx.save();
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.lineTo(S(pts[pts.length - 1].x), S(ay + ah));
  ctx.lineTo(S(pts[0].x), S(ay + ah));
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, S(ay), 0, S(ay + ah));
  fillGrad.addColorStop(0,    `rgba(${r},${g},${b},0.62)`);
  fillGrad.addColorStop(0.65, `rgba(${r},${g},${b},0.22)`);
  fillGrad.addColorStop(1,    `rgba(${r},${g},${b},0.05)`);
  ctx.fillStyle = fillGrad;
  ctx.fill();
  ctx.restore();

  // Halo large (glow)
  ctx.save();
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.strokeStyle = `rgba(${r},${g},${b},0.50)`;
  ctx.lineWidth   = S(12);
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  ctx.stroke();
  ctx.restore();

  // Courbe principale — épaisse et lumineuse
  ctx.save();
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth   = S(4.5);
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  ctx.stroke();
  ctx.restore();

  // Points de données (adaptatifs selon densité)
  const showDots = pts.length <= 90;
  const dotR     = pts.length <= 25 ? 4.5 : pts.length <= 60 ? 3.5 : 2.5;
  if (showDots) {
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(S(pt.x), S(pt.y), S(dotR), 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth   = S(1.5);
      ctx.stroke();
    }
  }

  // Étiquettes axe X — espacement minimum garanti pour éviter les chevauchements
  ctx.font         = FONT(10, 700);
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "rgba(255,255,255,0.72)";

  const MIN_LABEL_PX      = 58;
  const drawnLabelIdxs    = new Set();
  const hasExplicitLabels = points.some((p, i) => i > 0 && i < points.length - 1 && p.label !== "");
  let lastLabelX = -Infinity;

  if (hasExplicitLabels) {
    for (let i = 0; i < points.length; i++) {
      if (!points[i].label) continue;
      const lx = toX(i);
      if (lastLabelX !== -Infinity && lx - lastLabelX < MIN_LABEL_PX) continue;
      ctx.fillText(String(points[i].label), S(lx), S(ay + ah + 5));
      drawnLabelIdxs.add(i);
      lastLabelX = lx;
    }
  } else {
    const maxLbls = Math.max(2, Math.floor(aw / 68));
    const step    = Math.max(1, Math.ceil(points.length / maxLbls));
    const lblSet  = new Set([0, points.length - 1]);
    for (let i = step; i < points.length - 1; i += step) lblSet.add(i);
    for (const i of [...lblSet].sort((a, b) => a - b)) {
      const lx = toX(i);
      if (i !== 0 && i !== points.length - 1 && lastLabelX !== -Infinity && lx - lastLabelX < MIN_LABEL_PX) continue;
      ctx.fillText(String(points[i].label), S(lx), S(ay + ah + 5));
      drawnLabelIdxs.add(i);
      lastLabelX = lx;
    }
  }

  // Graduations uniquement aux positions effectivement affichées
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth   = S(1);
  for (const i of drawnLabelIdxs) {
    const tx = toX(i);
    ctx.beginPath();
    ctx.moveTo(S(tx), S(ay + ah));
    ctx.lineTo(S(tx), S(ay + ah + 4));
    ctx.stroke();
  }

  // Badge delta (haut droite)
  const delta    = vals[vals.length - 1] - vals[0];
  const deltaStr = (delta >= 0 ? "+" : "") + fmt(delta);
  const deltaClr = delta > 0 ? "#4cde7a" : delta < 0 ? "#ff6b6b" : "#ffffff";

  ctx.font         = FONT(14, 900);
  ctx.textAlign    = "right";
  ctx.textBaseline = "top";

  if (icTrophies) {
    const icSz  = 20;
    const tw    = ctx.measureText(deltaStr).width / SCALE;
    const iconX = px + pw - PANEL_PAD - tw - 5 - icSz;
    ctx.drawImage(icTrophies, S(iconX), S(py + 11), S(icSz), S(icSz));
  }
  outlined(ctx, deltaStr, px + pw - PANEL_PAD, py + 14, deltaClr, "#000000", 3);
}

// ── Génération finale ─────────────────────────────────────────────────────────

async function generatePushStatsCard(bsPlayer, extra, { todayPoints, weekPoints, seasonPoints, seasonLabel }) {
  normalizeRankCardData(bsPlayer, extra); // valide les données
  const canvas = createCanvas(S(W), S(H));
  const ctx    = canvas.getContext("2d");

  // Fond — très sombre pour faire ressortir les graphiques
  const bgImg = await tryLoad(path.join(BG_DIR, "rank_bg.png"));
  if (bgImg) {
    const sc = Math.max(S(W) / bgImg.width, S(H) / bgImg.height);
    ctx.drawImage(bgImg, (S(W) - bgImg.width * sc) / 2, (S(H) - bgImg.height * sc) / 2, bgImg.width * sc, bgImg.height * sc);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, S(H));
    g.addColorStop(0, "#1a0a38");
    g.addColorStop(1, "#0d0520");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S(W), S(H));
  }
  // Voile sombre fort pour maximiser le contraste des panels
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, S(W), S(H));

  // Header commun
  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  const icTrophies = await tryLoad(path.join(ICONS_DIR, "trophies.png"));

  const now       = DateTime.now().setZone("Europe/Paris");
  const DAYS_LONG = ["", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
  const MONTHS_FR = ["", "jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];
  const weekStart = now.startOf("week");

  const todaySub  = `${DAYS_LONG[now.weekday]} ${now.day} ${MONTHS_FR[now.month]}`;
  const weekSub   = `Sem. du ${weekStart.day} ${MONTHS_FR[weekStart.month]} — points toutes les heures`;
  const seasonSub = seasonLabel || "Saison en cours";

  const pw = W - MARGIN * 2;

  drawChart(ctx, {
    px: MARGIN, py: headerEndY,
    pw, ph: CHART_H,
    title: "Aujourd'hui", subtitle: todaySub,
    points: todayPoints, color: "#FFB800", icTrophies,
  });

  drawChart(ctx, {
    px: MARGIN, py: headerEndY + CHART_H + CHART_GAP,
    pw, ph: CHART_H,
    title: "Cette semaine", subtitle: weekSub,
    points: weekPoints, color: "#4fc4f8", icTrophies,
  });

  drawChart(ctx, {
    px: MARGIN, py: headerEndY + (CHART_H + CHART_GAP) * 2,
    pw, ph: CHART_H,
    title: "Cette saison", subtitle: seasonSub,
    points: seasonPoints, color: "#c57af0", icTrophies,
  });

  ctx.font         = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign    = "right";
  ctx.fillStyle    = "rgba(255,255,255,0.30)";
  ctx.fillText(now.toFormat("dd/MM/yyyy"), S(W - 6), S(H - 4));

  return canvas.toBuffer("image/png");
}

module.exports = { generatePushStatsCard };
