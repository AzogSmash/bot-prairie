"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getCachedOrFetch } = require("../services/imageCache");
const { drawHeader, normalizeRankCardData } = require("./rankCard");

const ASSETS        = path.resolve(__dirname, "..", "assets");
const BG_DIR        = path.join(ASSETS, "backgrounds");
const PORTRAITS_DIR = path.join(ASSETS, "brawlers", "portrait");
const EMOJI_DIR     = path.join(ASSETS, "brawlers", "emoji");
const ICONS_DIR     = path.join(ASSETS, "icons");
const BRAWLERS_META = require("../assets/brawlers-meta.json");

const SCALE  = 2;
const W      = 1500;
const MARGIN = 14;
const COLS   = 10;
const GAP    = 15;

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
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function darkenHex(hex, amt = 50) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
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
  const remotes = Array.isArray(remote) ? remote : (remote ? [remote] : []);
  for (const r of remotes) {
    if (r?.cacheKey && r?.url) {
      try { return await getCachedOrFetch(r.cacheKey, r.url); } catch { /* skip */ }
    }
  }
  return null;
}

async function drawWinstreakGrid(ctx, items, startY) {
  const CELL_W = Math.floor((W - MARGIN * 2 - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.62);

  const wsIcon = await tryLoad(path.join(ICONS_DIR, "borderless", "winstreak.png"))
    ?? await tryLoad(path.join(ICONS_DIR, "winstreak.png"));

  const tintedFlames = await buildTintedFlames(wsIcon);

  const portraits = await Promise.all(items.map(b => {
    if (b._placeholder) return null;
    const id = b.id ?? b.brawler_id;
    const localEmoji    = path.join(EMOJI_DIR,    `${id}.png`);
    const localPortrait = path.join(PORTRAITS_DIR, `${id}.png`);
    if (fs.existsSync(localEmoji))    return loadImage(localEmoji).catch(() => null);
    if (fs.existsSync(localPortrait)) return loadImage(localPortrait).catch(() => null);
    return tryLoad(null, [
      { cacheKey: `brawlers/emoji/${id}.png`,    url: `https://cdn.brawlify.com/brawler-bs/regular/${id}.png` },
      { cacheKey: `brawlers/portrait/${id}.png`, url: `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png` },
    ]);
  }));

  for (let i = 0; i < items.length; i++) {
    const b       = items[i];
    const col     = i % COLS;
    const row     = Math.floor(i / COLS);
    const cx      = MARGIN + col * (CELL_W + GAP);
    const cy      = startY + row * (CELL_H + GAP);
    const portrait = portraits[i];

    if (b._placeholder) {
      ctx.globalAlpha = 0.30;
      rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
      ctx.fillStyle = "#1a1030";
      ctx.fill();
      rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
      ctx.strokeStyle = "rgba(120,100,180,0.3)";
      ctx.lineWidth   = S(1.5);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      continue;
    }

    const { streak } = b;
    const tier = getStreakTier(streak);

    if (streak === 0) ctx.globalAlpha = 0.50;

    const R = 12;

    // ── Fond assombri ────────────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.fillStyle = streak === 0 ? "#2a2040" : darkenHex(tier.bg, 45);
    ctx.fill();

    // ── Dégradé radial vers les bords ────────────────────────────────────────
    if (streak > 0) {
      const gx = S(cx + CELL_W / 2);
      const gy = S(cy + CELL_H / 2);
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, S(Math.max(CELL_W, CELL_H) * 0.72));
      grad.addColorStop(0,   "rgba(0,0,0,0)");
      grad.addColorStop(0.6, "rgba(0,0,0,0)");
      grad.addColorStop(1,   "rgba(0,0,0,0.5)");
      rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ── Portrait clippé, décalé à gauche ────────────────────────────────────
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
      ctx.clip();
      const iS = Math.round(CELL_H * 0.82);
      ctx.drawImage(portrait, S(cx + 3), S(cy + (CELL_H - iS) / 2), S(iS), S(iS));
      ctx.restore();
    }

    // ── Dégradé horizontal droite pour lisibilité flamme ────────────────────
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.clip();
    const cellGrad = ctx.createLinearGradient(S(cx + CELL_W * 0.35), 0, S(cx + CELL_W), 0);
    cellGrad.addColorStop(0, "rgba(0,0,0,0)");
    cellGrad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = cellGrad;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(CELL_H));
    ctx.restore();

    // ── Bordure vive ─────────────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.strokeStyle = streak === 0 ? "rgba(100,80,160,0.45)" : tier.border;
    ctx.lineWidth   = S(streak > 0 ? 4 : 1.5);
    ctx.stroke();

    // ── Flamme au milieu-droit, nombre centré dedans ─────────────────────────
    const flameH  = Math.round(CELL_H * 0.72);
    const flameW  = flameH;
    const flameX  = cx + CELL_W - flameW - 5;
    const midY    = cy + CELL_H * 0.62 - 5;
    const flameCX = flameX + flameW / 2;

    const flameImg = tintedFlames.get(tier.min) ?? wsIcon;
    if (flameImg) {
      ctx.drawImage(flameImg, S(flameX), S(midY - flameH / 2), S(flameW), S(flameH));
    }

    const numFSize = Math.max(8, Math.round(flameH * 0.46));
    const numStr   = String(streak);
    const numColor = streak > 0 ? "#ffffff" : "rgba(210,200,240,0.80)";
    ctx.font         = FONT(numFSize, 900);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    outlined(ctx, numStr, flameCX, midY, numColor, "#000000", streak > 0 ? 3 : 2);

    ctx.globalAlpha = 1.0;
  }
}

async function generateWinstreakCard(bsPlayer, extra = {}, mode = 'max') {
  const data = normalizeRankCardData(bsPlayer, extra);
  const streakField = mode === 'current' ? 'currentWinStreak' : 'maxWinStreak';

  // Construire la liste complète : possédés triés + non-possédés à 0
  const ownedMap = new Map();
  for (const b of (data.brawlers || [])) ownedMap.set(b.id ?? b.brawler_id, b);

  const ownedSorted = [...ownedMap.values()]
    .map(b => ({ ...b, streak: Number(b[streakField] ?? 0) }))
    .sort((a, b) => b.streak - a.streak);

  const unowned = BRAWLERS_META
    .filter(b => !ownedMap.has(b.id))
    .map(b => ({ id: b.id, streak: 0, _unowned: true }));

  const allItems = [...ownedSorted, ...unowned];

  // Compléter la dernière ligne avec des cases placeholder
  const rem = allItems.length % COLS;
  if (rem !== 0) for (let i = 0; i < COLS - rem; i++) allItems.push({ _placeholder: true });

  // Hauteur dynamique
  const CELL_W = Math.floor((W - MARGIN * 2 - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.62);
  const ROWS = Math.ceil(allItems.length / COLS);
  const GRID_TOTAL = ROWS * CELL_H + (ROWS - 1) * GAP;
  const H = 208 + 14 + GRID_TOTAL + MARGIN + 16;

  const canvas = createCanvas(S(W), S(H));
  const ctx    = canvas.getContext("2d");

  const bgImg = await tryLoad(path.join(BG_DIR, "background_prestige.png"));
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

  await drawWinstreakGrid(ctx, allItems, headerEndY);

  ctx.font         = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign    = "right";
  ctx.fillStyle    = "rgba(255,255,255,0.30)";
  ctx.fillText(new Date().toLocaleDateString("fr-FR"), S(W - 6), S(H - 4));

  return canvas.toBuffer("image/png");
}

module.exports = { generateWinstreakCard };
