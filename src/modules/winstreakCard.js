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

const STREAK_THRESHOLDS = [
  { min: 0,  color: "#4a4a5a" },
  { min: 1,  color: "#815b40" },
  { min: 5,  color: "#b3b5d5" },
  { min: 10, color: "#dec745" },
  { min: 15, color: "#b377e4" },
  { min: 20, color: "#ed599e" },
  { min: 25, color: "#f3cb66" },
];

function getStreakColor(streak) {
  const n = Number(streak || 0);
  let result = STREAK_THRESHOLDS[0];
  for (const t of STREAK_THRESHOLDS) {
    if (n >= t.min) result = t;
    else break;
  }
  return result.color;
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
    const { streak, id, brawler_id } = sorted[i];
    const portrait = portraits[i];
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const cx   = MARGIN + col * (CELL_W + GAP);
    const cy   = startY + row * (ACTUAL_H + GAP);
    const color = getStreakColor(streak);

    if (streak === 0) ctx.globalAlpha = 0.55;

    // Fond
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 14);
    ctx.fillStyle = `${color}dd`;
    ctx.fill();

    // Portrait
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
      ctx.clip();
      const sc = (ACTUAL_H / portrait.height) * 2;
      ctx.drawImage(portrait, S(cx), S(cy), portrait.width * sc, portrait.height * sc);
      ctx.restore();
    }

    // Bordure
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.strokeStyle = streak > 0 ? "rgba(255,255,255,0.92)" : "rgba(180,180,200,0.40)";
    ctx.lineWidth   = S(streak > 0 ? 4 : 2);
    ctx.stroke();

    // Overlay label bas
    const labelY = cy + ACTUAL_H - LABEL_H;
    ctx.save();
    rrPath(ctx, cx, labelY, CELL_W, LABEL_H, 8);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fill();
    ctx.restore();

    // Icône + numéro
    const iconH  = Math.round(LABEL_H * 0.70);
    const fSize  = Math.max(8, Math.round(LABEL_H * 0.52));
    ctx.font = FONT(fSize, 900);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    if (streak > 0 && wsIcon) {
      const totalW = iconH + S(fSize * 0.6 * String(streak).length) / SCALE + 4;
      const startX = cx + CELL_W / 2 - totalW / 2;
      ctx.drawImage(wsIcon, S(startX), S(labelY + (LABEL_H - iconH) / 2), S(iconH), S(iconH));
      ctx.textAlign = "left";
      outlined(ctx, String(streak), startX + iconH + 3, labelY + LABEL_H / 2, "#ffb15f", "#000000", 2.5);
    } else if (streak > 0) {
      outlined(ctx, String(streak), cx + CELL_W / 2, labelY + LABEL_H / 2, "#ffb15f", "#000000", 2.5);
    } else {
      outlined(ctx, "—", cx + CELL_W / 2, labelY + LABEL_H / 2, "#aaaaaa", "#000000", 2);
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
