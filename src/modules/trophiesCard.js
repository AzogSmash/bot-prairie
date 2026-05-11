'use strict';
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getCachedOrFetch } = require('../services/imageCache');
const { drawHeader } = require('./rankCard');

const ASSETS        = path.resolve(__dirname, '..', 'assets');
const BG_FILE       = path.join(ASSETS, 'backgrounds', 'rank_bg.png');
const PORTRAITS_DIR = path.join(ASSETS, 'brawlers', 'portrait');
const BRAWLERS_META = require('../assets/brawlers-meta.json');

const SCALE  = 2;
const W      = 1500;
const MARGIN = 14;
function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

// ── Mêmes seuils et couleurs que rankCard ─────────────────────────────────────
const PRESTIGE_THRESHOLDS = [
  { min: 0,     color: '#815b40' },
  { min: 250,   color: '#f5aa4d' },
  { min: 500,   color: '#b3b5d5' },
  { min: 750,   color: '#dec745' },
  { min: 1000,  color: '#b377e4' },
  { min: 2000,  color: '#ed599e' },
  { min: 3000,  color: '#f3cb66' },
  { min: 4000,  color: '#DAA520' },
  { min: 5000,  color: '#f3cb66' },
  { min: 6000,  color: '#f3cb66' },
  { min: 7000,  color: '#f3cb66' },
  { min: 8000,  color: '#f3cb66' },
  { min: 9000,  color: '#f3cb66' },
  { min: 10000, color: '#f3cb66' },
];

function getPrestigeColor(trophies) {
  let color = PRESTIGE_THRESHOLDS[0].color;
  for (const p of PRESTIGE_THRESHOLDS) {
    if (trophies >= p.min) color = p.color;
    else break;
  }
  return color;
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

async function loadPortrait(id) {
  try { return await loadImage(path.join(PORTRAITS_DIR, `${id}.png`)); } catch {}
  try {
    return await getCachedOrFetch(
      `portrait_${id}.png`,
      `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png`,
    );
  } catch {}
  return null;
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
async function renderTrophiesCard(playerTag, bsPlayer, extra) {
  const ownedMap = new Map();
  for (const b of (bsPlayer.brawlers || [])) ownedMap.set(b.id, b);

  const ownedSorted = [...ownedMap.values()].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));
  const unowned     = BRAWLERS_META
    .filter(b => !ownedMap.has(b.id))
    .map(b => ({ id: b.id, name: b.name, trophies: 0, _unowned: true }));
  const allBrawlers = [...ownedSorted, ...unowned];

  const COLS   = 11;
  const GAP    = 10;
  const CELL_W = Math.floor((W - MARGIN * 2 - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.62);

  const rows       = Math.ceil(allBrawlers.length / COLS);
  const GRID_TOTAL = rows * CELL_H + (rows - 1) * GAP;
  const H          = 208 + 14 + GRID_TOTAL + MARGIN + 16;

  const canvas = createCanvas(S(W), S(H));
  const ctx    = canvas.getContext('2d');

  // ── Background ────────────────────────────────────────────────────────────
  try {
    const bgImg = await loadImage(BG_FILE);
    const sc = Math.max(S(W) / bgImg.width, S(H) / bgImg.height);
    const dW = bgImg.width  * sc;
    const dH = bgImg.height * sc;
    ctx.drawImage(bgImg, (S(W) - dW) / 2, (S(H) - dH) / 2, dW, dH);
  } catch {
    const g = ctx.createLinearGradient(0, 0, 0, S(H));
    g.addColorStop(0, '#1a0a38');
    g.addColorStop(1, '#0d0520');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S(W), S(H));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, S(W), S(H));

  // ── Header ────────────────────────────────────────────────────────────────
  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  // ── Assets communs ────────────────────────────────────────────────────────
  const [portraits, trophyIcon] = await Promise.all([
    Promise.all(allBrawlers.map(b => loadPortrait(b.id))),
    loadImage(path.join(ASSETS, 'icons', 'trophies.png')).catch(() => null),
  ]);

  // ── Grille ────────────────────────────────────────────────────────────────
  const gridY = headerEndY + 14;

  for (let i = 0; i < allBrawlers.length; i++) {
    const b       = allBrawlers[i];
    const col     = i % COLS;
    const row     = Math.floor(i / COLS);
    const cx      = MARGIN + col * (CELL_W + GAP);
    const cy      = gridY  + row * (CELL_H + GAP);
    const unowned = !!b._unowned;
    const color   = getPrestigeColor(b.trophies ?? 0);
    const portrait = portraits[i];

    if (unowned) ctx.globalAlpha = 0.45;

    // ── Fond couleur prestige (identique à rankCard) ──────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.fillStyle = unowned ? '#2a2040' : `${color}dd`;
    ctx.fill();

    // ── Portrait (même formule que rankCard) ──────────────────────────────
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
      ctx.clip();
      const sc = (CELL_H / portrait.height) * 2;
      ctx.drawImage(portrait, S(cx), S(cy), portrait.width * sc, portrait.height * sc);
      ctx.restore();
    }

    // ── Dégradé droite pour lisibilité du nombre ─────────────────────────
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.clip();
    const fadeGrad = ctx.createLinearGradient(S(cx + CELL_W * 0.30), 0, S(cx + CELL_W), 0);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    fadeGrad.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(CELL_H));
    ctx.restore();

    // ── Bordure couleur prestige ──────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.strokeStyle = unowned ? 'rgba(100,80,160,0.4)' : `${color}ff`;
    ctx.lineWidth   = S(unowned ? 1.5 : 3);
    ctx.stroke();

    ctx.globalAlpha = 1.0;

    // ── Nombre de trophées (droite, gros, avec icône derrière) ───────────
    if (!unowned && (b.trophies ?? 0) > 0) {
      const tStr   = String(b.trophies);
      const rightX = cx + CELL_W - 8;
      const midY   = cy + CELL_H * 0.80;

      // Nombre + icône trophée
      let fs = 21;
      ctx.font = FONT(fs);
      while (fs > 12 && ctx.measureText(tStr).width / SCALE > CELL_W * 0.52) {
        fs -= 1;
        ctx.font = FONT(fs);
      }

      const iconSz  = Math.round(fs * 1.1);
      const textW   = ctx.measureText(tStr).width / SCALE;
      const totalW  = (trophyIcon ? iconSz + 3 : 0) + textW;
      const startX  = rightX - totalW;

      // Icône trophée
      if (trophyIcon) {
        ctx.drawImage(trophyIcon, S(startX), S(midY - iconSz / 2), S(iconSz), S(iconSz));
      }

      // Nombre
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
      ctx.lineWidth    = S(3.5);
      ctx.lineJoin     = 'round';
      const numX = startX + (trophyIcon ? iconSz + 3 : 0);
      ctx.strokeText(tStr, S(numX), S(midY));
      ctx.fillStyle = color;
      ctx.fillText(tStr, S(numX), S(midY));
    }
  }

  // ── Date bas droite ───────────────────────────────────────────────────────
  ctx.font         = FONT(10, 400);
  ctx.textBaseline = 'bottom';
  ctx.textAlign    = 'right';
  ctx.fillStyle    = 'rgba(255,255,255,0.3)';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), S(W - 6), S(H - 4));
  ctx.textAlign    = 'left';

  return canvas.toBuffer('image/png');
}

module.exports = { renderTrophiesCard };
