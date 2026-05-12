'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getCachedOrFetch } = require('../services/imageCache');
const { drawHeader } = require('./rankCard');

const ASSETS        = path.resolve(__dirname, '..', 'assets');
const BG_FILE       = path.join(ASSETS, 'backgrounds', 'background_prestige.png');
const ICONS_DIR     = path.join(ASSETS, 'icons');
const PORTRAITS_DIR = path.join(ASSETS, 'brawlers', 'portrait');
const RANKED_DIR    = path.join(ASSETS, 'ranked', 'tiered');

const SCALE  = 2;
const W      = 1500;
const MARGIN = 14;
function S(v) { return Math.round(v * SCALE); }
function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

const COLS   = 5;
const GRID_W = W - MARGIN * 2;
const GAP    = 15;
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
  let player  = null;
  if (b.teams) {
    for (const team of b.teams) {
      const p = team.find(p => p.tag === tag);
      if (p) { player = p; brawler = p.brawler ?? p.brawlers?.[0] ?? null; break; }
    }
  }
  if (!brawler && b.players) {
    const p = b.players.find(p => p.tag === tag);
    if (p) { player = p; brawler = p.brawler ?? p.brawlers?.[0] ?? null; }
  }

  let result = b.result || null;
  if (!result && b.rank != null)
    result = b.rank <= 2 ? 'victory' : b.rank >= 6 ? 'defeat' : 'draw';
  result = result || 'draw';

  const mapRaw   = item.event?.map ?? '';
  const cleanMap = /^(Match\s*)?\d+$/.test(mapRaw.trim()) ? '' : mapRaw;

  // trophyChange : battle > somme des brawlers (duel) > brawler unique
  let trophyChange = b.trophyChange ?? null;
  if (trophyChange == null && player?.brawlers?.length) {
    const sum = player.brawlers.reduce((s, bw) => s + (bw.trophyChange ?? 0), 0);
    if (player.brawlers.some(bw => bw.trophyChange != null)) trophyChange = sum;
  }
  if (trophyChange == null) trophyChange = brawler?.trophyChange ?? null;

  return {
    brawler,
    result,
    trophyChange,
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

async function loadPortrait(brawlerId) {
  const local = path.join(PORTRAITS_DIR, `${brawlerId}.png`);
  if (fs.existsSync(local)) {
    try { return await loadImage(local); } catch {}
  }
  return fetchImg(
    `portrait_${brawlerId}.png`,
    `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${brawlerId}.png`
  );
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

  const SUMMARY_H  = 68;
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
  const netStr   = (net >= 0 ? '+' : '') + net;
  const netColor = net >= 0 ? '#f1c40f' : '#e74c3c';

  const trophyIcon  = await loadImage(path.join(ICONS_DIR, 'trophies.png')).catch(() => null);
  const rankedIcon  = await loadImage(path.join(RANKED_DIR, '58000000.png')).catch(() => null);

  // Fond semi-transparent derrière le résumé
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(S(MARGIN), S(headerEndY + 2), S(W - MARGIN * 2), S(SUMMARY_H - 4));

  const ICON_SZ = 34;
  const MID_Y   = headerEndY + SUMMARY_H / 2 + 2;

  const summaryItems = [
    { label: `${items.length} parties`, color: '#ffffff' },
    { label: `${wins}V`,               color: '#2ecc71' },
    { label: `${losses}D`,             color: '#e74c3c' },
    { label: netStr,                   color: netColor, icon: trophyIcon },
  ];

  ctx.textBaseline = 'middle';
  ctx.font = FONT(28, 700);
  let sx = MARGIN + 10;

  for (const item of summaryItems) {
    if (item.icon) {
      ctx.drawImage(item.icon, S(sx), S(MID_Y - ICON_SZ / 2), S(ICON_SZ), S(ICON_SZ));
      outlined(ctx, item.label, sx + ICON_SZ + 6, MID_Y, item.color, 'rgba(0,0,0,0.8)', 4);
      sx += ICON_SZ + 6 + ctx.measureText(item.label).width / SCALE + 30;
    } else {
      outlined(ctx, item.label, sx, MID_Y, item.color, 'rgba(0,0,0,0.8)', 4);
      sx += ctx.measureText(item.label).width / SCALE + 30;
    }
  }

  // ── Grille des battles ────────────────────────────────────────────────────
  const gridY = headerEndY + SUMMARY_H + 4;

  const COLORS = {
    victory : { bg: '#43d35b', rgb: '67,211,91'   },
    defeat  : { bg: '#e84855', rgb: '232,72,85'   },
    draw    : { bg: '#8899aa', rgb: '136,153,170'  },
  };

  // Largeur réservée au portrait (gauche) vs texte (droite)
  const PORTRAIT_W = Math.round(CELL_W * 0.52);
  const TEXT_X     = cx => cx + PORTRAIT_W + 8;

  for (let i = 0; i < parsed.length; i++) {
    const p   = parsed[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = MARGIN + col * (CELL_W + GAP);
    const cy  = gridY + row * (CELL_H + GAP);
    const c   = COLORS[p.result] || COLORS.draw;

    // Fond coloré vif + bordure (avant le portrait)
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 10);
    ctx.fillStyle = c.bg;
    ctx.fill();
    rrPath(ctx, cx, cy, CELL_W, CELL_H, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = S(2);
    ctx.stroke();

    // Portrait détouré par-dessus (clip arrondi seulement, pas de clip de largeur)
    if (p.brawler?.id) {
      const img = await loadPortrait(p.brawler.id);
      if (img) {
        ctx.save();
        rrPath(ctx, cx, cy, CELL_W, CELL_H, 10);
        ctx.clip();
        const sc = (CELL_H + 16) / img.height;
        const iw = img.width * sc;
        const ih = img.height * sc;
        ctx.drawImage(img, S(cx - (iw - PORTRAIT_W) * 0.25), S(cy - 8), S(iw), S(ih));
        ctx.restore();
      }
    }

    // Temps (top-left, font 33)
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.font         = FONT(33, 400);
    outlined(ctx, timeAgo(p.time), cx + 7, cy + 6, '#ffffff', 'rgba(0,0,0,0.7)', 4);

    // Trophy change / icône ranked (top-right)
    if (p.type === 'soloRanked') {
      // Icône ranked à la place du trophyChange
      if (rankedIcon) {
        const RSZ = 52;
        ctx.drawImage(rankedIcon, S(cx + CELL_W - RSZ - 6), S(cy + 4), S(RSZ), S(RSZ));
      }
    } else {
      const tStr = p.trophyChange != null
        ? (p.trophyChange >= 0 ? '+' : '') + p.trophyChange
        : '–';
      ctx.font         = FONT(39, 700);
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      outlined(ctx, tStr, cx + CELL_W - 7, cy + 5, '#ffffff', 'rgba(0,0,0,0.7)', 4);
      if (trophyIcon) {
        const tw   = ctx.measureText(tStr).width / SCALE;
        const TRSZ = 42;
        ctx.drawImage(trophyIcon,
          S(cx + CELL_W - 7 - tw - TRSZ - 4), S(cy + 6),
          S(TRSZ), S(TRSZ)
        );
      }
      ctx.textAlign = 'left';
    }

    // Icône mode (top-right sous trophy, 3x = 60px)
    if (p.modeId != null) {
      const mImg = await fetchImg(
        `mode_${48000000 + p.modeId}.png`,
        `https://cdn.brawlify.com/game-modes/regular/${48000000 + p.modeId}.png`
      );
      if (mImg) ctx.drawImage(mImg, S(cx + CELL_W - 66), S(cy + 50), S(60), S(60));
    }

    // Badge power (radius 20 = 27×0.75) + trophées (font 22, icon 29)
    const BADGE_R = 20;
    const badgeCX = cx + 8 + BADGE_R;
    const badgeCY = cy + CELL_H - BADGE_R - 4;

    if (p.brawler?.power) {
      ctx.beginPath();
      ctx.arc(S(badgeCX), S(badgeCY), S(BADGE_R), 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.font         = FONT(14, 700);
      outlined(ctx, String(p.brawler.power), badgeCX, badgeCY, '#ffffff', 'rgba(0,0,0,0.5)', 2);
      ctx.textAlign = 'left';

      if (p.brawler.trophies != null && trophyIcon && p.type !== 'soloRanked') {
        const trX  = badgeCX + BADGE_R + 5;
        const TRSZ = 29;
        ctx.drawImage(trophyIcon, S(trX), S(badgeCY - TRSZ / 2), S(TRSZ), S(TRSZ));
        ctx.textBaseline = 'middle';
        ctx.font         = FONT(22, 400);
        outlined(ctx, String(p.brawler.trophies), trX + TRSZ + 4, badgeCY, '#ffffff', 'rgba(0,0,0,0.6)', 3);
      }
    }

    // Durée (bas-droite, font 28)
    if (p.duration) {
      ctx.font         = FONT(28, 400);
      ctx.textBaseline = 'bottom';
      ctx.textAlign    = 'right';
      ctx.fillStyle    = 'rgba(255,255,255,0.65)';
      ctx.fillText(fmtDuration(p.duration), S(cx + CELL_W - 7), S(cy + CELL_H - 4));
      ctx.textAlign = 'left';
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
