"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getCachedOrFetch } = require("../services/imageCache");
const { drawHeader, normalizeRankCardData } = require("./rankCard");

const ASSETS       = path.resolve(__dirname, "..", "assets");
const BG_DIR       = path.join(ASSETS, "backgrounds");
const PORTRAITS_DIR = path.join(ASSETS, "brawlers", "portrait");
const ICONS_DIR    = path.join(ASSETS, "icons");

const SCALE  = 2;
const W      = 1500;
const H      = 1250;
const MARGIN = 14;

function S(v) { return Math.round(v * SCALE); }

function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

// Palette feu : sombre (0) → ambre → orange → rouge → cramoisi → grenat → violet profond
const STREAK_THRESHOLDS = [
  { min: 0,  bg: "#1e1b2e", border: "rgba(110,100,160,0.38)" },
  { min: 1,  bg: "#4a3d05", border: "#c8a000" },
  { min: 5,  bg: "#6b3200", border: "#f07800" },
  { min: 10, bg: "#7d1d00", border: "#f04400" },
  { min: 15, bg: "#720010", border: "#f01540" },
  { min: 20, bg: "#580025", border: "#d00055" },
  { min: 25, bg: "#420038", border: "#b000a0" },
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

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(S(x + r), S(y));
  ctx.lineTo(S(x + w - r), S(y));
  ctx.arcTo(S(x + w), S(y), S(x + w), S(y + r), S(r));
  ctx.lineTo(S(x + w), S(y + h - r));
  ctx.arcTo(S(x + w), S(y + h), S(x + w - r), S(y + h), S(r));
  ctx.lineTo(S(x + r), S(y + h));
  ctx.arcTo(S(x), S(y + h), S(x), S(y + h - r), S(r));
  ctx.lineTo(S(x), S(y + r));
  ctx.arcTo(S(x), S(y), S(x + r), S(y), S(r));
  ctx.closePath();
}

function outlined(ctx, text, x, y, fill, stroke, sw) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = S(sw);
  ctx.lineJoin = "round";
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

async function drawWinstreakGrid(ctx, brawlers, startY) {
  const sorted = [...brawlers]
    .map(b => ({ ...b, streak: Number(b.maxWinStreak ?? 0) }))
    .sort((a, b) => b.streak - a.streak);

  const COLS     = 10;
  const GRID_W   = W - MARGIN * 2;
  const GAP      = 15;
  const CELL_W   = Math.floor((GRID_W - GAP * (COLS - 1)) / COLS);
  const CELL_H   = Math.round(CELL_W * 0.6);
  const ROWS     = Math.max(1, Math.ceil(sorted.length / COLS));
  const GRID_H   = H - startY - MARGIN;
  const ACTUAL_H = Math.min(CELL_H, Math.floor(GRID_H / ROWS));
  const LABEL_H  = Math.round(ACTUAL_H * 0.30);

  const wsIcon = await tryLoad(path.join(ICONS_DIR, "borderless", "winstreak.png"))
    ?? await tryLoad(path.join(ICONS_DIR, "winstreak.png"));

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

    if (streak === 0) ctx.globalAlpha = 0.50;

    // Fond plein (couleur du tier)
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 12);
    ctx.fillStyle = tier.bg;
    ctx.fill();

    // Portrait (clippé)
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
      ctx.clip();
      const sc = (ACTUAL_H / portrait.height) * 2;
      ctx.drawImage(portrait, S(cx), S(cy), portrait.width * sc, portrait.height * sc);
      ctx.restore();
    }

    // Gradient vertical : léger reflet en haut, ombre marquée en bas
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.clip();
    const cellGrad = ctx.createLinearGradient(0, S(cy), 0, S(cy + ACTUAL_H));
    cellGrad.addColorStop(0,    "rgba(255,255,255,0.10)");
    cellGrad.addColorStop(0.35, "rgba(0,0,0,0)");
    cellGrad.addColorStop(1,    "rgba(0,0,0,0.55)");
    ctx.fillStyle = cellGrad;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(ACTUAL_H));
    ctx.restore();

    // Bordure colorée (hue du tier)
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.strokeStyle = tier.border;
    ctx.lineWidth   = S(streak > 0 ? 3.5 : 2);
    ctx.stroke();

    // Label bas : overlay sombre + icône + nombre
    const labelY = cy + ACTUAL_H - LABEL_H;
    ctx.save();
    rrPath(ctx, cx, labelY, CELL_W, LABEL_H, 8);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fill();
    ctx.restore();

    const iconH = Math.round(LABEL_H * 0.68);
    const fSize = Math.max(8, Math.round(LABEL_H * 0.50));
    ctx.font         = FONT(fSize, 900);
    ctx.textBaseline = "middle";

    if (streak > 0 && wsIcon) {
      const numStr = String(streak);
      ctx.textAlign = "left";
      const tw      = ctx.measureText(numStr).width / SCALE;
      const totalW  = iconH + 3 + tw;
      const startX  = cx + (CELL_W - totalW) / 2;
      ctx.drawImage(wsIcon, S(startX), S(labelY + (LABEL_H - iconH) / 2), S(iconH), S(iconH));
      outlined(ctx, numStr, startX + iconH + 3, labelY + LABEL_H / 2, "#ffffff", "#000000", 2.5);
    } else if (streak > 0) {
      ctx.textAlign = "center";
      outlined(ctx, String(streak), cx + CELL_W / 2, labelY + LABEL_H / 2, "#ffffff", "#000000", 2.5);
    } else {
      ctx.textAlign = "center";
      outlined(ctx, "0", cx + CELL_W / 2, labelY + LABEL_H / 2, "rgba(160,150,180,0.80)", "#000000", 2);
    }

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

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, S(W), S(H));

  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  await drawWinstreakGrid(ctx, data.brawlers, headerEndY);

  ctx.font = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign    = "right";
  ctx.fillStyle    = "rgba(255,255,255,0.3)";
  ctx.fillText(new Date().toLocaleDateString("fr-FR"), S(W - 6), S(H - 4));

  return canvas.toBuffer("image/png");
}

module.exports = { generateWinstreakCard };
