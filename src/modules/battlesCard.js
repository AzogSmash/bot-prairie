'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getCachedOrFetch } = require('../services/imageCache');
const { drawHeader } = require('./rankCard');

const ASSETS   = path.resolve(__dirname, '..', 'assets');
const BG_FILE  = path.join(ASSETS, 'backgrounds', 'rank_bg.png');
const ICONS_DIR = path.join(ASSETS, 'icons');

const SCALE  = 2;
const W      = 1500;
const MARGIN = 14;
function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

const COLS   = 5;
const GRID_W = W - MARGIN * 2;
const GAP    = 10;
const CELL_W = Math.floor((GRID_W - GAP * (COLS - 1)) / COLS);
const CELL_H = 158;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseBSDate(iso) {
  const m = iso.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`);
  return new Date(iso);
}

function timeAgo(iso) {
  const ms = Date.now() - parseBSDate(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}j`;
  if (h >= 1)  return `${h}h`;
  return `${Math.max(1, m)}m`;
}

function fmtDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function parseBattle(item, playerTag) {
  const tag = playerTag.startsWith('#') ? playerTag : `#${playerTag}`;
  const b   = item.battle || {};

  let brawler = null;
  if (b.teams) {
    for (const team of b.teams) {
      const p = team.find(p => p.tag === tag);
      if (p) { brawler = p.brawler; break; }
    }
  }
  if (!brawler && b.players) {
    const p = b.players.find(p => p.tag === tag);
    if (p) brawler = p.brawler;
  }

  let result = b.result || null;
  if (!result && b.rank != null)
    result = b.rank <= 2 ? 'victory' : b.rank >= 6 ? 'defeat' : 'draw';
  result = result || 'draw';

  const mapRaw   = item.event?.map ?? '';
  const cleanMap = /^(Match\s*)?\d+$/.test(mapRaw.trim()) ? '' : mapRaw;

  return {
    brawler,
    result,
    trophyChange : b.trophyChange ?? null,
    modeId       : item.event?.modeId ?? null,
    mapName      : cleanMap,
    duration     : b.duration ?? null,
    time         : item.battleTime,
    type         : b.type || '',
  };
}

async function fetchImg(key, url) {
  try { return await getCachedOrFetch(key, url); } catch { return null; }
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
  ctx.lineWidth   = S(sw);
  ctx.lineJoin    = 'round';
  ctx.strokeText(String(text), S(x), S(y));
  ctx.fillStyle   = fill;
  ctx.fillText(String(text), S(x), S(y));
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
async function renderBattlesCard(playerTag, bsPlayer, extra, battles) {
  const items  = battles.slice(0, 25);
  const parsed = items.map(b => parseBattle(b, playerTag));
  const rows   = Math.ceil(items.length / COLS);

  const wins   = parsed.filter(p => p.result === 'victory').length;
  const losses = parsed.filter(p => p.result === 'defeat').length;
  const net    = parsed.reduce((s, p) => s + (p.trophyChange ?? 0), 0);

  const SUMMARY_H  = 48;
  const GRID_TOTAL = rows * CELL_H + (rows - 1) * GAP;
  const H = 208 + SUMMARY_H + GRID_TOTAL + MARGIN + 16;

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

  // ── Header commun (rankCard) ──────────────────────────────────────────────
  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  // ── Bande résumé ─────────────────────────────────────────────────────────
  const sy      = headerEndY + 10;
  const netStr  = (net >= 0 ? '+' : '') + net;
  const netColor = net >= 0 ? '#f1c40f' : '#e74c3c';

  const trophyIcon = await loadImage(path.join(ICONS_DIR, 'trophies.png')).catch(() => null);

  const summaryItems = [
    { label: `${items.length} parties`, color: 'rgba(200,200,230,0.9)' },
    { label: `${wins}V`,               color: '#2ecc71' },
    { label: `${losses}D`,             color: '#e74c3c' },
    { label: netStr,                   color: netColor, icon: trophyIcon },
  ];

  ctx.textBaseline = 'middle';
  let sx = MARGIN;
  const ICON_SZ = 18;
  const MID_Y   = sy + ICON_SZ / 2;

  for (const item of summaryItems) {
    ctx.font      = FONT(13);
    ctx.fillStyle = item.color;
    if (item.icon) {
      ctx.drawImage(item.icon, S(sx), S(MID_Y - ICON_SZ / 2), S(ICON_SZ), S(ICON_SZ));
      ctx.fillText(item.label, S(sx + ICON_SZ + 4), S(MID_Y));
      sx += ICON_SZ + 4 + ctx.measureText(item.label).width / SCALE + 20;
    } else {
      ctx.fillText(item.label, S(sx), S(MID_Y));
      sx += ctx.measureText(item.label).width / SCALE + 20;
    }
  }

  // ── Grille des battles ────────────────────────────────────────────────────
  const gridY = headerEndY + SUMMARY_H + 4;

  const COLORS = {
    victory : { border: '#27ae60', trophy: '#2ecc71', strip: 'rgba(39,174,96,0.80)' },
    defeat  : { border: '#c0392b', trophy: '#e74c3c', strip: 'rgba(192,57,43,0.80)' },
    draw    : { border: '#4a5568', trophy: '#95a5a6', strip: 'rgba(74,85,104,0.75)' },
  };

  for (let i = 0; i < parsed.length; i++) {
    const p   = parsed[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = MARGIN + col * (CELL_W + GAP);
    const cy  = gridY + row * (CELL_H + GAP);
    const c   = COLORS[p.result] || COLORS.draw;

    // Fond de base sombre
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.fillStyle = 'rgba(8,5,22,0.92)';
    ctx.fill();

    // Portrait brawler (pleine hauteur, calé à droite)
    if (p.brawler?.id) {
      const img = await fetchImg(
        `brawler_bl_${p.brawler.id}.png`,
        `https://cdn.brawlify.com/brawlers/borderless/${p.brawler.id}.png`
      );
      if (img) {
        ctx.save();
        rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
        ctx.clip();
        const scale = (CELL_H + 24) / img.height;
        const iw = img.width  * scale;
        const ih = img.height * scale;
        ctx.drawImage(img, S(cx + CELL_W - iw * 0.86), S(cy - 12), S(iw), S(ih));
        ctx.restore();

        // Gradient texte (gauche opaque → droite transparent)
        ctx.save();
        rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
        ctx.clip();
        const grad = ctx.createLinearGradient(S(cx), 0, S(cx + CELL_W), 0);
        grad.addColorStop(0,    'rgba(8,5,22,0.97)');
        grad.addColorStop(0.48, 'rgba(8,5,22,0.80)');
        grad.addColorStop(0.72, 'rgba(8,5,22,0.20)');
        grad.addColorStop(1,    'rgba(8,5,22,0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(S(cx), S(cy), S(CELL_W), S(CELL_H));
        ctx.restore();
      }
    }

    // Bande colorée top (résultat)
    ctx.save();
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.clip();
    ctx.fillStyle = c.strip;
    ctx.fillRect(S(cx), S(cy), S(CELL_W), S(5));
    ctx.restore();

    // Bordure colorée
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 12);
    ctx.strokeStyle = c.border;
    ctx.lineWidth   = S(2);
    ctx.stroke();

    const tx = cx + 10;
    ctx.textBaseline = 'alphabetic';

    // Temps (top-left)
    ctx.font      = FONT(11, 400);
    ctx.fillStyle = 'rgba(200,200,230,0.65)';
    ctx.fillText(timeAgo(p.time), S(tx), S(cy + 20));

    // Icône mode (top-right)
    if (p.modeId != null) {
      const mImg = await fetchImg(
        `mode_${48000000 + p.modeId}.png`,
        `https://cdn.brawlify.com/game-modes/regular/${48000000 + p.modeId}.png`
      );
      if (mImg) ctx.drawImage(mImg, S(cx + CELL_W - 32), S(cy + 7), S(26), S(26));
    }

    // Trophées (gros, avec contour)
    const tStr = p.trophyChange != null
      ? (p.trophyChange >= 0 ? '+' : '') + p.trophyChange
      : '–';
    ctx.font = FONT(34, 900);
    outlined(ctx, tStr, tx, cy + 75, c.trophy, 'rgba(0,0,0,0.9)', 4);

    // Nom brawler
    ctx.font = FONT(12);
    outlined(ctx, trunc(p.brawler?.name ?? '?', 14), tx, cy + 96, '#ffffff', 'rgba(0,0,0,0.8)', 3);

    // Map
    if (p.mapName) {
      ctx.font      = FONT(10, 400);
      ctx.fillStyle = 'rgba(180,180,210,0.75)';
      ctx.fillText(trunc(p.mapName, 20), S(tx), S(cy + 114));
    }

    // Durée
    if (p.duration) {
      ctx.font      = FONT(10, 400);
      ctx.fillStyle = 'rgba(140,140,170,0.55)';
      ctx.fillText(fmtDuration(p.duration), S(tx), S(cy + 131));
    }
  }

  // Date bas droite
  ctx.font         = FONT(10, 400);
  ctx.textBaseline = 'bottom';
  ctx.textAlign    = 'right';
  ctx.fillStyle    = 'rgba(255,255,255,0.3)';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), S(W - 6), S(H - 4));
  ctx.textAlign    = 'left';

  return canvas.toBuffer('image/png');
}

module.exports = { renderBattlesCard };
