"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getCachedOrFetch } = require("../services/imageCache");
const { drawHeader, normalizeRankCardData } = require("./rankCard");

const ASSETS        = path.resolve(__dirname, "..", "assets");
const BG_DIR        = path.join(ASSETS, "backgrounds");
const PORTRAITS_DIR = path.join(ASSETS, "brawlers", "portrait");
const ICONS_DIR     = path.join(ASSETS, "icons");

const SCALE  = 2;
const W      = 1500;
const H      = 1250;
const MARGIN = 14;

function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

// Palette vive arc-en-ciel : gris → vert → jaune-vert → or → ambre → orange → rouge-rose → magenta → violet
const STREAK_THRESHOLDS = [
  { min: 0,  bg: "#908f98", border: "#86858d", tint: "#86858d" },
  { min: 1,  bg: "#ebf5af", border: "#c5ce93", tint: "#c5ce93" },
  { min: 5,  bg: "#fdf405", border: "#d9d206", tint: "#d9d206" },
  { min: 10,  bg: "#f8595c", border: "#d04a4c", tint: "#d04a4c" },
  { min: 20,  bg: "#fa88e3", border: "#d170bd", tint: "#d170bd" },
  { min: 30, bg: "#b3fb9d", border: "#9fdc8d", tint: "#9fdc8d" },
  { min: 50, bg: "#7df2fb", border: "#67c5cb", tint: "#67c5cb" },
  { min: 60, bg: "#ba029f", border: "#8a0276", tint: "#8a0276" },
  { min: 70, bg: "#faf8fa", border: "#a5a3a5", tint: "#a5a3a5" },
];

function getStreakTier(streak) {
  const n = Number(streak || 0);
  let result = STREAK_THRESHOLDS[0];
  for (const t of STREAK_THRESHOLDS) {
    if (n >= t.min) result = t;
    else break;
  }
  return result;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Crée une version teintée de l'icône flamme pour chaque palier via source-atop
async function buildTintedFlames(wsIcon) {
  if (!wsIcon) return new Map();
  const map = new Map();
  for (const tier of STREAK_THRESHOLDS) {
    const off  = createCanvas(wsIcon.width, wsIcon.height);
    const octx = off.getContext("2d");
    octx.drawImage(wsIcon, 0, 0);
    octx.globalCompositeOperation = "source-atop";
    octx.fillStyle  = tier.tint;
    octx.globalAlpha = 0.82;
    octx.fillRect(0, 0, wsIcon.width, wsIcon.height);
    octx.globalAlpha = 1.0;
    octx.globalCompositeOperation = "source-over";
    map.set(tier.min, off);
  }
  return map;
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
  ctx.fillStyle   = fill;
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

async function drawWinstreakGrid(ctx, brawlers, startY) {
  const sorted = [...brawlers]
    .map(b => ({ ...b, streak: Number(b.maxWinStreak ?? 0) }))
    .sort((a, b) => b.streak - a.streak);

  const COLS    = 10;
  const GRID_W  = W - MARGIN * 2;
  const GAP     = 15;
  const CELL_W  = Math.floor((GRID_W - GAP * (COLS - 1)) / COLS);
  const CELL_H  = Math.round(CELL_W * 0.62);
  const ROWS    = Math.max(1, Math.ceil(sorted.length / COLS));
  const GRID_H  = H - startY - MARGIN;
  const ACTUAL_H = Math.min(CELL_H, Math.floor(GRID_H / ROWS));
  // Zone label élargie pour accueillir flamme + nombre + MAX
  const LABEL_H  = Math.round(ACTUAL_H * 0.38);

  const wsIcon = await tryLoad(path.join(ICONS_DIR, "borderless", "winstreak.png"))
    ?? await tryLoad(path.join(ICONS_DIR, "winstreak.png"));

  const tintedFlames = await buildTintedFlames(wsIcon);

  const portraits = await Promise.all(sorted.map(b => {
    const id = b.id ?? b.brawler_id;
    return tryLoad(
      path.join(PORTRAITS_DIR, `${id}.png`),
      {
        cacheKey: `brawlers/portrait/${id}.png`,
        url: `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png`,
      },
    );
  }));

  for (let i = 0; i < sorted.length; i++) {
    const { streak } = sorted[i];
    const portrait   = portraits[i];
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const cx   = MARGIN + col * (CELL_W + GAP);
    const cy   = startY + row * (ACTUAL_H + GAP);
    const tier = getStreakTier(streak);
    const { r, g, b } = hexToRgb(tier.bg);

    if (streak === 0) ctx.globalAlpha = 0.50;

    // ── Fond coloré vif ─────────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 12);
    ctx.fillStyle = tier.bg;
    ctx.fill();

    // ── Portrait clippé ─────────────────────────────────────────────────────
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
      ctx.clip();
      // Zoom x2 sur le portrait pour remplir la case
      const sc = (ACTUAL_H / portrait.height) * 2;
      ctx.drawImage(portrait, S(cx), S(cy), portrait.width * sc, portrait.height * sc);
      ctx.restore();
    }

    // ── Gradient léger pour conserver la vivacité ────────────────────────────
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.clip();
    const cellGrad = ctx.createLinearGradient(0, S(cy), 0, S(cy + ACTUAL_H));
    cellGrad.addColorStop(0,    "rgba(255,255,255,0.14)");
    cellGrad.addColorStop(0.28, "rgba(0,0,0,0)");
    cellGrad.addColorStop(1,    "rgba(0,0,0,0.38)");
    ctx.fillStyle = cellGrad;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(ACTUAL_H));
    ctx.restore();

    // ── Bordure vive ────────────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.strokeStyle = tier.border;
    ctx.lineWidth   = S(streak > 0 ? 3.5 : 2);
    ctx.stroke();

    // ── Overlay label bas : teinte sombre du palier ─────────────────────────
    const labelY = cy + ACTUAL_H - LABEL_H;
    ctx.save();
    rrPath(ctx, cx, labelY, CELL_W, LABEL_H, 8);
    ctx.fillStyle = `rgba(${Math.round(r * 0.30)},${Math.round(g * 0.30)},${Math.round(b * 0.30)},0.90)`;
    ctx.fill();
    ctx.restore();

    // ── Flamme teintée à gauche du label ────────────────────────────────────
    const FLAME_PAD = Math.max(4, Math.round(CELL_W * 0.04));
    const flameH    = Math.max(10, Math.round(LABEL_H * 0.82));
    const flameW    = flameH;
    const flameX    = cx + FLAME_PAD;
    const flameY    = labelY + (LABEL_H - flameH) / 2;
    const flameCX   = flameX + flameW / 2;

    const flameImg = tintedFlames.get(tier.min) ?? wsIcon;
    if (flameImg) {
      ctx.drawImage(flameImg, S(flameX), S(flameY), S(flameW), S(flameH));
    }

    // ── Nombre DE VICTOIRES sur la flamme ────────────────────────────────────
    const numFSize = Math.max(6, Math.round(flameH * 0.52));
    ctx.font         = FONT(numFSize, 900);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    const numStr   = String(streak);
    const numColor = streak > 0 ? "#ffffff" : "rgba(210,200,240,0.80)";
    outlined(ctx, numStr, flameCX, flameY + flameH * 0.50, numColor, "#000000", streak > 0 ? 2.5 : 2);

    // ── "MAX" sous la flamme ─────────────────────────────────────────────────
    const maxFSize = Math.max(5, Math.round(LABEL_H * 0.27));
    ctx.font         = FONT(maxFSize, 700);
    ctx.textBaseline = "bottom";
    outlined(ctx, "MAX", flameCX, labelY + LABEL_H - 2, "rgba(255,255,255,0.82)", "#000000", 1.5);

    ctx.globalAlpha = 1.0;
  }
}

async function generateWinstreakCard(bsPlayer, extra = {}) {
  const data   = normalizeRankCardData(bsPlayer, extra);
  const canvas = createCanvas(S(W), S(H));
  const ctx    = canvas.getContext("2d");

  const bgImg = await tryLoad(path.join(BG_DIR, "rank_bg.png"));
  if (bgImg) {
    const sc = Math.max(S(W) / bgImg.width, S(H) / bgImg.height);
    const dW = bgImg.width * sc;
    const dH = bgImg.height * sc;
    ctx.drawImage(bgImg, (S(W) - dW) / 2, (S(H) - dH) / 2, dW, dH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, S(H));
    g.addColorStop(0, "#1a0a38");
    g.addColorStop(1, "#0d0520");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S(W), S(H));
  }

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, S(W), S(H));

  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  await drawWinstreakGrid(ctx, data.brawlers, headerEndY);

  ctx.font         = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign    = "right";
  ctx.fillStyle    = "rgba(255,255,255,0.30)";
  ctx.fillText(new Date().toLocaleDateString("fr-FR"), S(W - 6), S(H - 4));

  return canvas.toBuffer("image/png");
}

module.exports = { generateWinstreakCard };
