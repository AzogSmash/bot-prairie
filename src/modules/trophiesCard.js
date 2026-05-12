'use strict';
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getCachedOrFetch } = require('../services/imageCache');
const { drawHeader } = require('./rankCard');

const fs = require('node:fs');

const ASSETS        = path.resolve(__dirname, '..', 'assets');
const BG_FILE       = path.join(ASSETS, 'backgrounds', 'background_prestige.png');
const PORTRAITS_DIR = path.join(ASSETS, 'brawlers', 'portrait');
const EMOJI_DIR     = path.join(ASSETS, 'brawlers', 'emoji');
const BRAWLERS_META = require('../assets/brawlers-meta.json');

const SCALE  = 2;
const W      = 1500;
const MARGIN = 14;
function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

const PRESTIGE_THRESHOLDS = [
  { min: 0,     color: '#c49060' },
  { min: 250,   color: '#ffb84a' },
  { min: 500,   color: '#b8c4f4' },
  { min: 750,   color: '#ffe454' },
  { min: 1000,  color: '#bf6eff' },
  { min: 2000,  color: '#ff5090' },
  { min: 3000,  color: '#ffd940' },
  { min: 4000,  color: '#ffc830' },
  { min: 5000,  color: '#ffd940' },
  { min: 6000,  color: '#ffd940' },
  { min: 7000,  color: '#ffd940' },
  { min: 8000,  color: '#ffd940' },
  { min: 9000,  color: '#ffd940' },
  { min: 10000, color: '#ffd940' },
];

function getPrestigeColor(trophies) {
  let color = PRESTIGE_THRESHOLDS[0].color;
  for (const p of PRESTIGE_THRESHOLDS) {
    if (trophies >= p.min) color = p.color;
    else break;
  }
  return color;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function darkenHex(hex, amt = 50) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
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

async function loadBrawlerImage(id) {
  const localEmoji    = path.join(EMOJI_DIR,    `${id}.png`);
  const localPortrait = path.join(PORTRAITS_DIR, `${id}.png`);
  if (fs.existsSync(localEmoji))    { try { return await loadImage(localEmoji);    } catch {} }
  if (fs.existsSync(localPortrait)) { try { return await loadImage(localPortrait); } catch {} }
  try { return await getCachedOrFetch(`brawlers/emoji/${id}.png`,    `https://cdn.brawlify.com/brawler-bs/regular/${id}.png`); }    catch {}
  try { return await getCachedOrFetch(`brawlers/portrait/${id}.png`, `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png`); } catch {}
  return null;
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
async function renderTrophiesCard(playerTag, bsPlayer, extra, mode = 'current') {
  const trophyField = mode === 'highest' ? 'highestTrophies' : 'trophies';

  const ownedMap = new Map();
  for (const b of (bsPlayer.brawlers || [])) ownedMap.set(b.id, b);

  const ownedSorted = [...ownedMap.values()].sort((a, b) =>
    ((b[trophyField] ?? b.trophies ?? 0) - (a[trophyField] ?? a.trophies ?? 0)));
  const unowned     = BRAWLERS_META
    .filter(b => !ownedMap.has(b.id))
    .map(b => ({ id: b.id, name: b.name, trophies: 0, _unowned: true }));
  const allBrawlers = [...ownedSorted, ...unowned];

  const COLS   = 11;
  const GAP    = 10;
  const CELL_W = Math.floor((W - MARGIN * 2 - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.62);

  // Compléter la dernière ligne avec des cases placeholder
  const remCols = allBrawlers.length % COLS;
  if (remCols !== 0) for (let i = 0; i < COLS - remCols; i++) allBrawlers.push({ _placeholder: true });

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
    Promise.all(allBrawlers.map(b => loadBrawlerImage(b.id))),
    loadImage(path.join(ASSETS, 'icons', 'trophies.png')).catch(() => null),
  ]);

  // ── Grille ────────────────────────────────────────────────────────────────
  const gridY = headerEndY + 14;

  for (let i = 0; i < allBrawlers.length; i++) {
    const b   = allBrawlers[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = MARGIN + col * (CELL_W + GAP);
    const cy  = gridY  + row * (CELL_H + GAP);

    if (b._placeholder) {
      ctx.globalAlpha = 0.30;
      rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
      ctx.fillStyle = '#1a1030';
      ctx.fill();
      rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
      ctx.strokeStyle = 'rgba(120,100,180,0.3)';
      ctx.lineWidth   = S(1.5);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      continue;
    }

    const unowned   = !!b._unowned;
    const bTrophies = b[trophyField] ?? b.trophies ?? 0;
    const color     = getPrestigeColor(bTrophies);
    const portrait = portraits[i];

    if (unowned) ctx.globalAlpha = 0.45;

    const R = 12;
    // ── Fond assombri ─────────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.fillStyle = unowned ? '#2a2040' : darkenHex(color, 45);
    ctx.fill();

    // ── Dégradé radial vers les bords ────────────────────────────────────
    if (!unowned) {
      const gx = S(cx + CELL_W / 2);
      const gy = S(cy + CELL_H / 2);
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, S(Math.max(CELL_W, CELL_H) * 0.72));
      grad.addColorStop(0,   'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0)');
      grad.addColorStop(1,   'rgba(0,0,0,0.5)');
      rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ── Portrait clippé, décalé à gauche ─────────────────────────────────
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
      ctx.clip();
      const iS = Math.round(CELL_H * 0.82);
      ctx.drawImage(portrait, S(cx + 3), S(cy + (CELL_H - iS) / 2), S(iS), S(iS));
      ctx.restore();
    }

    // ── Dégradé horizontal droite pour lisibilité du nombre ──────────────
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.clip();
    const fadeGrad = ctx.createLinearGradient(S(cx + CELL_W * 0.35), 0, S(cx + CELL_W), 0);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    fadeGrad.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(CELL_H));
    ctx.restore();

    // ── Bordure visible ───────────────────────────────────────────────────
    rrPath(ctx, cx, cy, CELL_W, CELL_H, R);
    ctx.strokeStyle = unowned ? 'rgba(100,80,160,0.45)' : color;
    ctx.lineWidth   = S(unowned ? 1.5 : 4);
    ctx.stroke();

    ctx.globalAlpha = 1.0;

    // ── Nombre de trophées (centré verticalement, décalé droite, icône derrière) ──
    if (!unowned && bTrophies > 0) {
      const tStr = String(bTrophies);
      const midY = cy + CELL_H * 0.54;
      const centerX = cx + CELL_W * 0.62;

      // Taille de police plus généreuse
      let fs = 26;
      ctx.font = FONT(fs);
      while (fs > 13 && ctx.measureText(tStr).width / SCALE > CELL_W * 0.52) {
        fs -= 1;
        ctx.font = FONT(fs);
      }

      // Icône trophée grande, centrée derrière le texte
      if (trophyIcon) {
        const iconSz = Math.round(CELL_H * 0.80);
        ctx.globalAlpha = 0.22;
        ctx.drawImage(trophyIcon, S(centerX - iconSz / 2), S(cy + (CELL_H - iconSz) / 2), S(iconSz), S(iconSz));
        ctx.globalAlpha = 1.0;
      }

      // Nombre en blanc centré
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.strokeStyle  = 'rgba(0,0,0,0.90)';
      ctx.lineWidth    = S(4);
      ctx.lineJoin     = 'round';
      ctx.strokeText(tStr, S(centerX), S(midY));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tStr, S(centerX), S(midY));
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
