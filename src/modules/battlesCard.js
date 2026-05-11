'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { getCachedOrFetch } = require('../services/imageCache');

const SCALE = 2;
const S = n => Math.round(n * SCALE);

const COLS    = 5;
const CELL_W  = 200;
const CELL_H  = 120;
const GAP     = 8;
const PAD     = 16;
const HEADER_H = 82;

const C = {
  victory : { bg: 'rgba(20, 60, 20, 0.95)',  border: '#27ae60', trophy: '#2ecc71' },
  defeat  : { bg: 'rgba(60, 15, 15, 0.95)',  border: '#c0392b', trophy: '#e74c3c' },
  draw    : { bg: 'rgba(30, 30, 40, 0.95)',  border: '#7f8c8d', trophy: '#95a5a6' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  if (!result && b.rank != null) {
    result = b.rank <= 2 ? 'victory' : b.rank >= 6 ? 'defeat' : 'draw';
  }
  result = result || 'draw';

  return {
    brawler,
    result,
    trophyChange : b.trophyChange ?? null,
    modeId       : item.event?.modeId ?? null,
    mapName      : (item.event?.map ?? '').replace(/_/g, ' '),
    duration     : b.duration ?? null,
    time         : item.battleTime,
    type         : b.type || '',
  };
}

function parseBSDate(iso) {
  // BS format: "20260511T123210.000Z" → standard ISO
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

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function fetchImg(cacheKey, url) {
  try { return await getCachedOrFetch(cacheKey, url); } catch { return null; }
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
async function renderBattlesCard(playerTag, playerName, battles) {
  const items = battles.slice(0, 25);
  const parsed = items.map(b => parseBattle(b, playerTag));

  const rows    = Math.ceil(items.length / COLS);
  const W       = PAD * 2 + COLS * CELL_W + (COLS - 1) * GAP;
  const H       = HEADER_H + PAD + rows * CELL_H + (rows - 1) * GAP + PAD;

  const canvas  = createCanvas(S(W), S(H));
  const ctx     = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // ── Fond global ──────────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0d0d1a');
  grad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Header ───────────────────────────────────────────────────────────────
  const wins   = parsed.filter(p => p.result === 'victory').length;
  const losses = parsed.filter(p => p.result === 'defeat').length;
  const net    = parsed.reduce((s, p) => s + (p.trophyChange ?? 0), 0);
  const netStr = (net >= 0 ? '+' : '') + net;

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 22px Arial`;
  ctx.fillText(playerName, PAD, 32);

  ctx.font = `400 13px Arial`;
  ctx.fillStyle = '#aaaacc';
  ctx.fillText(`#${playerTag.replace('#', '')} • ${items.length} dernières parties`, PAD, 50);

  ctx.font = `700 13px Arial`;
  ctx.fillStyle = '#2ecc71';
  ctx.fillText(`${wins}V`, PAD, 70);
  ctx.fillStyle = '#e74c3c';
  ctx.fillText(`${losses}D`, PAD + 32, 70);
  ctx.fillStyle = net >= 0 ? '#f1c40f' : '#e74c3c';
  ctx.fillText(`${netStr} 🏆`, PAD + 64, 70);

  // ── Cellules ─────────────────────────────────────────────────────────────
  for (let i = 0; i < parsed.length; i++) {
    const p    = parsed[i];
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const cx   = PAD + col * (CELL_W + GAP);
    const cy   = HEADER_H + PAD + row * (CELL_H + GAP);
    const col_ = C[p.result] || C.draw;

    // Fond cellule
    rrect(ctx, cx, cy, CELL_W, CELL_H, 10);
    ctx.fillStyle = col_.bg;
    ctx.fill();
    ctx.strokeStyle = col_.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Portrait brawler (40% gauche)
    const brawlerW = Math.floor(CELL_W * 0.42);
    if (p.brawler?.id) {
      const img = await fetchImg(`brawler_bl_${p.brawler.id}.png`,
        `https://cdn.brawlify.com/brawlers/borderless/${p.brawler.id}.png`);
      if (img) {
        ctx.save();
        rrect(ctx, cx, cy, brawlerW, CELL_H, 10);
        ctx.clip();
        // Centrage vertical, légèrement décalé en bas
        const aspect = img.width / img.height;
        const ih = CELL_H + 10;
        const iw = ih * aspect;
        ctx.drawImage(img, cx + (brawlerW - iw) / 2, cy - 5, iw, ih);
        ctx.restore();
        // Dégradé sur le bord droit du portrait
        const fade = ctx.createLinearGradient(cx + brawlerW - 20, 0, cx + brawlerW, 0);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(1, col_.bg);
        ctx.fillStyle = fade;
        ctx.fillRect(cx + brawlerW - 20, cy, 20, CELL_H);
      }
    }

    // Zone droite
    const rx = cx + brawlerW + 6;
    const rw = CELL_W - brawlerW - 10;

    // Icône mode (top-right)
    if (p.modeId != null) {
      const modeImg = await fetchImg(`mode_${48000000 + p.modeId}.png`,
        `https://cdn.brawlify.com/game-modes/regular/${48000000 + p.modeId}.png`);
      if (modeImg) {
        const ms = 22;
        ctx.drawImage(modeImg, cx + CELL_W - ms - 6, cy + 6, ms, ms);
      }
    }

    // Temps écoulé
    ctx.font = `400 10px Arial`;
    ctx.fillStyle = 'rgba(200,200,220,0.7)';
    ctx.fillText(timeAgo(p.time), rx, cy + 16);

    // Trophées (central, gros)
    const tStr = p.trophyChange != null
      ? (p.trophyChange >= 0 ? '+' : '') + p.trophyChange
      : p.type === 'friendly' ? '🤝' : '—';
    ctx.font = `900 26px Arial`;
    ctx.fillStyle = p.trophyChange != null ? col_.trophy : '#888';
    ctx.fillText(tStr, rx, cy + 52);

    // Brawler name
    ctx.font = `600 10px Arial`;
    ctx.fillStyle = 'rgba(220,220,240,0.85)';
    ctx.fillText(trunc(p.brawler?.name ?? '', 14), rx, cy + 68);

    // Map + durée
    ctx.font = `400 9px Arial`;
    ctx.fillStyle = 'rgba(160,160,180,0.7)';
    ctx.fillText(trunc(p.mapName, 18), rx, cy + 84);
    if (p.duration) {
      ctx.fillStyle = 'rgba(140,140,160,0.6)';
      ctx.fillText(fmtDuration(p.duration), rx, cy + 97);
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderBattlesCard };
