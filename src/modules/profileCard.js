const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');
const http = require('http');

registerFont(path.join(__dirname, '../assets/LilitaOne-Regular.ttf'), { family: 'Lilita' });
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

// ═══════════════════════════════════════════════════════
// PALETTE PRAIRIE
// ═══════════════════════════════════════════════════════
const PRAIRIE = {
  panel: 'rgba(29, 37, 24, 0.86)',
  panelAlt: 'rgba(45, 32, 21, 0.84)',
  panelSoft: 'rgba(33, 43, 28, 0.78)',
  leftOverlay: 'rgba(19, 24, 16, 0.55)',
  rightOverlay: 'rgba(28, 35, 22, 0.30)',
  innerStroke: 'rgba(225, 190, 110, 0.32)',
  pattern: 'rgba(220, 190, 120, 0.08)',
  greenText: '#a8ff62',
  goldText: '#f0b43c',
  cream: '#f4f0e2',
  muted: '#d6cdb6',
  blueXP1: '#79dfff',
  blueXP2: '#3098ff',
};

// ═══════════════════════════════════════════════════════
// RANKED TIERS
// ═══════════════════════════════════════════════════════
const RANKED_TIERS = [
  { min: 0,     name: 'Bronze',    file: 'Bronze',    color: '#cd7f32' },
  { min: 750,   name: 'Silver',    file: 'Silver',    color: '#c0c0c0' },
  { min: 1500,  name: 'Gold',      file: 'Gold',      color: '#ffd700' },
  { min: 2250,  name: 'Diamond',   file: 'Diamond',   color: '#00bfff' },
  { min: 3750,  name: 'Mythic',    file: 'Mythic',    color: '#e84393' },
  { min: 5250,  name: 'Legendary', file: 'Legendary', color: '#e74c3c' },
  { min: 7500,  name: 'Masters',   file: 'Masters',   color: '#ff6b35' },
  { min: 10500, name: 'Pro',       file: 'Pro',       color: '#f1c40f' },
];
const RANKED_SUBTIERS = [
  { min: 0,     sub: 'I' },   { min: 250,  sub: 'II' },  { min: 500,  sub: 'III' },
  { min: 750,   sub: 'I' },   { min: 1000, sub: 'II' },  { min: 1250, sub: 'III' },
  { min: 1500,  sub: 'I' },   { min: 1750, sub: 'II' },  { min: 2000, sub: 'III' },
  { min: 2250,  sub: 'I' },   { min: 2750, sub: 'II' },  { min: 3250, sub: 'III' },
  { min: 3750,  sub: 'I' },   { min: 4250, sub: 'II' },  { min: 4750, sub: 'III' },
  { min: 5250,  sub: 'I' },   { min: 6000, sub: 'II' },  { min: 6750, sub: 'III' },
  { min: 7500,  sub: 'I' },   { min: 8500, sub: 'II' },  { min: 9500, sub: 'III' },
  { min: 10500, sub: '' },
];
function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Unranked', file: null, color: '#95a5a6', sub: '' };
  let tier = RANKED_TIERS[0];
  for (const t of RANKED_TIERS) { if (elo >= t.min) tier = t; }
  let sub = '';
  for (const s of RANKED_SUBTIERS) { if (elo >= s.min) sub = s.sub; }
  return { ...tier, sub };
}

// ═══════════════════════════════════════════════════════
// HELPERS DATA
// ═══════════════════════════════════════════════════════
function normalizeStr(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function getStat(stats, name) { return stats?.find(s => s.name === name)?.value || 0; }
function getStatLoose(stats, ...names) {
  const map = new Map((stats || []).map(s => [normalizeStr(s.name), Number(s.value) || 0]));
  for (const name of names) {
    const k = normalizeStr(name);
    if (map.has(k)) return map.get(k);
  }
  return 0;
}

function pickHeroBrawlerId(bsPlayer, rntData) {
  const favoriteId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  if (favoriteId) return favoriteId;

  const rntBrawlers = rntData?.brawlers || [];
  if (rntBrawlers.length) {
    const best = [...rntBrawlers].sort((a, b) => {
      const ah = Number(a.highest_trophies || 0), bh = Number(b.highest_trophies || 0);
      if (bh !== ah) return bh - ah;
      const at = Number(a.trophies || 0), bt = Number(b.trophies || 0);
      if (bt !== at) return bt - at;
      return Number(b.power_level || 0) - Number(a.power_level || 0);
    })[0];
    if (best?.brawler_id) return Number(best.brawler_id);
  }

  const bsBrawlers = bsPlayer?.brawlers || [];
  const best = [...bsBrawlers].sort((a, b) => {
    const ah = Number(a.highestTrophies || 0), bh = Number(b.highestTrophies || 0);
    if (bh !== ah) return bh - ah;
    const at = Number(a.trophies || 0), bt = Number(b.trophies || 0);
    if (bt !== at) return bt - at;
    return Number(b.power || 0) - Number(a.power || 0);
  })[0];
  return best?.id || 0;
}

function getTotalPrestigeFromRnt(rntData, bsPlayer) {
  const stats = rntData?.stats || [];
  const direct =
    getStatLoose(stats, 'Prestige', 'TotalPrestige') ||
    Number(rntData?.prestige || 0) ||
    Number(rntData?.total_prestige || 0) ||
    Number(bsPlayer?.totalPrestigeLevel || 0);

  if (direct > 0) return direct;

  const rntBrawlers = rntData?.brawlers || [];
  if (rntBrawlers.length) {
    return rntBrawlers.reduce((s, b) => {
      const t = Math.max(Number(b.highest_trophies || 0), Number(b.trophies || 0));
      return s + Math.floor(t / 1000);
    }, 0);
  }

  return (bsPlayer?.brawlers || []).reduce((s, b) => {
    const t = Math.max(Number(b.highestTrophies || 0), Number(b.trophies || 0));
    return s + Math.floor(t / 1000);
  }, 0);
}

function getBsInfoTierFolderFromTrophies(trophies) {
  const t = Number(trophies || 0);

  if (t < 250) return '39000000';
  if (t < 500) return '39000001';
  if (t < 750) return '39000002';
  if (t < 1000) return '39000003';

  // 1000-1999 => 39000004
  // 2000-2999 => 39000005
  // 3000-3999 => 39000006
  const prestigeLevel = Math.floor(t / 1000);
  return String(39000003 + prestigeLevel);
}

function getBsInfoTierUrl(brawlerId, trophies) {
  const folder = getBsInfoTierFolderFromTrophies(trophies);
  return `https://cdn.bsinfox.com/tier/${folder}/${brawlerId}.png`;
}

function getTop10Brawlers(rntBrawlers = [], bsBrawlers = []) {
  if (rntBrawlers.length) {
    return [...rntBrawlers]
      .map(b => ({
        id: Number(b.brawler_id),
        trophies: Number(b.trophies || 0),
        highestTrophies: Number(b.highest_trophies || 0),
      }))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, 10);
  }

  return [...bsBrawlers]
    .map(b => ({
      id: Number(b.id),
      trophies: Number(b.trophies || 0),
      highestTrophies: Number(b.highestTrophies || 0),
    }))
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 10);
}

// ═══════════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════════
async function fetchRntProfile(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  return new Promise((resolve, reject) => {
    https.get(`https://api.rnt.dev/profile?tag=${cleanTag}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.ok && j.result) resolve(j.result);
          else reject(new Error('RNT non trouvé'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const lib = u.startsWith('https') ? https : http;
      lib.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return go(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => loadImage(Buffer.concat(chunks)).then(resolve).catch(reject));
      }).on('error', reject);
    };
    go(url);
  });
}
async function tryImg(url) { try { return await fetchImage(url); } catch { return null; } }

// ═══════════════════════════════════════════════════════
// HELPERS CANVAS
// ═══════════════════════════════════════════════════════
function fmt(n) {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

function drawOutlineText(ctx, text, x, y, fillColor, fontSize, font, outlineWidth = 6) {
  ctx.font = `${fontSize}px ${font}`;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

function fitTextSize(ctx, text, maxWidth, startSize, minSize, family, weight = '') {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight ? weight + ' ' : ''}${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size--;
  }
  return minSize;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function bsBox(ctx, x, y, w, h, bgColor, borderColor = '#000', r = 10) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // léger liseré interne
  rr(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2));
  ctx.strokeStyle = PRAIRIE.innerStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function statBox(ctx, x, y, w, h, alt = false) {
  rr(ctx, x, y, w, h, 10);
  ctx.fillStyle = alt ? PRAIRIE.panelAlt : PRAIRIE.panel;
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.stroke();

  rr(ctx, x + 2, y + 2, w - 4, h - 4, 8);
  ctx.strokeStyle = PRAIRIE.innerStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawBSPattern(ctx, x, y, w, h, baseColor, lineColor) {
  ctx.save();
  rr(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  const sz = 38;
  for (let row = -1; row < (h / sz) + 2; row++) {
    for (let col = -1; col < (w / sz) + 2; col++) {
      const cx = x + col * sz + (row % 2 === 0 ? 0 : sz / 2);
      const cy = y + row * sz * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sz * 0.32);
      ctx.lineTo(cx + sz * 0.44, cy);
      ctx.lineTo(cx, cy + sz * 0.32);
      ctx.lineTo(cx - sz * 0.44, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMarker(ctx, x, y, type) {
  ctx.save();

  if (type === 'star') {
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    const r1 = 7, r2 = 3.5, cx = x, cy = y;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * Math.PI / 5) - Math.PI / 2;
      i === 0
        ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
        : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (type === 'flame') {
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'trophy') {
    ctx.fillStyle = '#ffcf4a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - 5, y - 4, 10, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x - 2, y + 3, 4, 5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════
// GÉNÉRATION CARTE
// ═══════════════════════════════════════════════════════
async function generateProfileCard(bsTag, bsPlayer) {
  let rnt = null;
  try { rnt = await fetchRntProfile(bsTag); } catch (e) { console.error('[Card] RNT:', e.message); }

  // ── Normalisation RNT ────────────────────────────────
  const rntData = rnt?.result || rnt || {};
  const stats = rntData?.stats || [];
  const rntBrawlers = rntData?.brawlers || [];
  const favoriteBrawlerId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  const winstreakBrawlerId = Number(rntData?.winstreak_brawler?.id || rntData?.winstreak_brawler || 0);
  const maxWS = Number(rntData?.max_winstreak || 0);
  const ownedBrawlers = Number(rntData?.brawler_count || 0);
  const allianceName = rntData?.alliance?.name || '';
  const allianceBadge = Number(rntData?.alliance?.badge || 0);
  const firstBattleCardAvatar = Number(rntData?.battle_card?.first_profile_avatar || 0);
  const profileAvatar = Number(rntData?.profile_avatar || 0);
  const creationYear =
    getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') ||
    rntData?.account_creation_year;

  // ── Données calculées ────────────────────────────────
  const bsBrawlers = bsPlayer?.brawlers || [];
  const displayBrawlers = getTop10Brawlers(rntBrawlers, bsBrawlers);
  const heroBrawlerId = pickHeroBrawlerId(bsPlayer, rntData);
  const brawlerCount = ownedBrawlers || bsBrawlers.length;
  const trophies = bsPlayer?.trophies || getStatLoose(stats, 'Trophies') || 0;
  const prestige = getTotalPrestigeFromRnt(rntData, bsPlayer);

  const currentElo = getStatLoose(stats, 'CurrentRankedPoints', 'current_ranked_points') || rntData?.ranked_elo || 0;
  const highestElo = getStatLoose(stats, 'HighestRankedPoints', 'highest_ranked_points') || rntData?.highest_ranked_elo || 0;
  const recordPts  = getStatLoose(stats, 'RecordPoints', 'record_points') || rntData?.record_points || 0;
  const recordLevel = getStatLoose(stats, 'RecordLevel', 'RecordTier') || Number(rntData?.record_level || rntData?.record_tier || 7);

  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStatLoose(stats, '3vs3Victories', '3v3victories') || 0;
  const soloWins = bsPlayer?.soloVictories || getStatLoose(stats, 'SoloVictories', 'solo_victories') || 0;
  const duoWins  = bsPlayer?.duoVictories  || getStatLoose(stats, 'DuoVictories', 'duo_victories') || 0;
  const expLevel  = bsPlayer?.expLevel  || getStatLoose(stats, 'ExpLevel', 'exp_level') || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;

  const curTier = getRankedTier(currentElo);
  const hiTier  = getRankedTier(highestElo);

  // ── Canvas ───────────────────────────────────────────
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── FOND GLOBAL : fond_profil.png visible ────────────
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
    const scaleX = W / bg.width;
    const scaleY = H / bg.height;
    const scale = Math.max(scaleX, scaleY);
    const sw = bg.width * scale;
    const sh = bg.height * scale;
    ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } catch {
    ctx.fillStyle = '#3b5a2c';
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay très léger seulement pour la lisibilité
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, 'rgba(12, 14, 9, 0.18)');
  overlay.addColorStop(0.55, 'rgba(18, 15, 10, 0.10)');
  overlay.addColorStop(1, 'rgba(8, 6, 4, 0.22)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // léger assombrissement bas pour aider le texte
  const bottomGlow = ctx.createLinearGradient(0, H * 0.55, 0, H);
  bottomGlow.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGlow.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // ══ ZONE GAUCHE ══════════════════════════════════════
  const LW = 458;

  drawBSPattern(ctx, 0, 0, LW, H, PRAIRIE.leftOverlay, PRAIRIE.pattern);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(LW, 0);
  ctx.lineTo(LW, H);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(210, 180, 110, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LW - 1, 0);
  ctx.lineTo(LW - 1, H);
  ctx.stroke();

  // ── HEADER GAUCHE ────────────────────────────────────
  const iconSize = 84;
  bsBox(ctx, 0, 0, LW, 116, 'rgba(18, 15, 11, 0.86)', '#000000', 0);

  const avatarId = profileAvatar || bsPlayer?.icon?.id;
  if (avatarId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${avatarId}.png`);
    if (iconImg) {
      bsBox(ctx, 7, 7, iconSize + 4, iconSize + 4, '#324d25', '#000', 6);
      ctx.drawImage(iconImg, 9, 9, iconSize, iconSize);
    }
  }

  const tagText = '#' + bsTag.replace('#', '').toUpperCase();
  const tagFontSize = fitTextSize(ctx, tagText, iconSize + 8, 16, 10, 'Roboto', 'bold');
  ctx.font = `bold ${tagFontSize}px Roboto`;
  ctx.fillStyle = PRAIRIE.cream;
  ctx.textAlign = 'center';
  ctx.fillText(tagText, 9 + iconSize / 2, 9 + iconSize + 18);

  const playerName = bsPlayer?.name || 'Joueur';
  const nameBoxX = iconSize + 18;
  const nameBoxY = 12;
  const nameBoxW = LW - nameBoxX - 10;
  const nameBoxH = 50;
  bsBox(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, 'rgba(28, 38, 22, 0.92)', '#000', 8);

  const nameFontSize = fitTextSize(ctx, playerName, nameBoxW - 18, 32, 18, 'Lilita');
  ctx.textAlign = 'center';
  drawOutlineText(ctx, playerName, nameBoxX + nameBoxW / 2, nameBoxY + 36, PRAIRIE.greenText, nameFontSize, 'Lilita', 5);

  const xpPerLevel = 1000;
  const xpProgress = Math.max(0, expPoints % xpPerLevel);
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  bsBox(ctx, nameBoxX, 68, 52, 32, '#4b77d6', '#000', 6);
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), nameBoxX + 26, 90);

  const barX = nameBoxX + 58;
  const barY = 75;
  const barW = nameBoxW - 58;
  const barH = 17;
  rr(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = '#12161a';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (xpRatio > 0) {
    const fillW = Math.max(6, Math.round((barW - 4) * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillW, barH - 4, 3);
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, PRAIRIE.blueXP1);
    g.addColorStop(1, PRAIRIE.blueXP2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.font = 'bold 11px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 3, barY + 12);

  // ── GRAND MODEL BRAWLER ──────────────────────────────
  if (heroBrawlerId) {
    const model = await tryImg(`https://cdn.brawlify.com/brawlers/model/${heroBrawlerId}.png`);
    if (model) {
      const frameX = 8;
      const frameY = 116;
      const frameW = LW - 16;
     const frameH = 400;

      // contain + bottom align
      const scale = Math.min(frameW / model.width, frameH / model.height);
      const drawW = model.width * scale;
      const drawH = model.height * scale;
      const drawX = frameX + (frameW - drawW) / 2;
      const drawY = frameY + (frameH - drawH);

      ctx.save();

      // clip pour éviter tout débordement
      rr(ctx, frameX, frameY, frameW, frameH, 0);
      ctx.clip();

      ctx.shadowColor = 'rgba(0,0,0,0.70)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(model, drawX, drawY, drawW, drawH);

      ctx.restore();
    }
  }

  // ── NOM + CLUB en bas gauche ─────────────────────────
  const ng = ctx.createLinearGradient(0, H - 160, 0, H);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  ng.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, H - 160, LW, 160);

  ctx.textAlign = 'left';
  drawOutlineText(ctx, playerName, 12, H - 56, PRAIRIE.greenText, 48, 'Lilita', 7);

  const subText = allianceName || bsPlayer?.club?.name || '';
  if (subText) {
    drawOutlineText(ctx, subText, 12, H - 20, PRAIRIE.goldText, 22, 'Roboto', 5);
  }

  const badgeId = allianceBadge || bsPlayer?.club?.badgeId;
  if (badgeId) {
    const cbImg = await tryImg(`https://cdn.brawlify.com/club-badges/regular/${badgeId}.png`);
    if (cbImg) ctx.drawImage(cbImg, LW - 68, H - 68, 58, 58);
  }

  // ══ ZONE DROITE ══════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;

  drawBSPattern(ctx, RX, 0, RW, H, PRAIRIE.rightOverlay, PRAIRIE.pattern);

  const trY = 56;
  const trH = 90;

  // ── ICÔNE PROFIL (cercle Trophy Road) ────────────────
  const trophyIconId = firstBattleCardAvatar || profileAvatar || bsPlayer?.icon?.id;
  if (trophyIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${trophyIconId}.png`);
    if (pIcon) {
      const pr = 44, px = RX + 56, py = trY + trH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8d4e17';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(pIcon, px - pr, py - pr, pr * 2, pr * 2);
      ctx.restore();
    }
  }

  // ── TROPHY ROAD ──────────────────────────────────────
  const trX = RX + 112;
  const wsW = 170;
  const trW = RW - 112 - wsW - 14;

  statBox(ctx, trX, trY, trW, trH, true);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 12, trY + 22);
  drawOutlineText(ctx, fmt(trophies), trX + 12, trY + 74, '#ffffff', 58, 'Lilita', 5);

  // ── WIN STREAK ───────────────────────────────────────
  const wsX = trX + trW + 8;
  statBox(ctx, wsX, trY, wsW, trH);

  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#ffc83d';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 18);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 34);

  if (winstreakBrawlerId) {
    const wsBI = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${winstreakBrawlerId}.png`);
    if (wsBI) {
      const imgX = wsX + 8;
      const imgY = trY + 40;
      ctx.save();
      rr(ctx, imgX, imgY, 42, 42, 8);
      ctx.clip();
      ctx.drawImage(wsBI, imgX, imgY, 42, 42);
      ctx.restore();

      rr(ctx, imgX, imgY, 42, 42, 8);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      drawMarker(ctx, imgX + 36, imgY + 6, 'flame');
    }
  }

  // chiffre décalé à droite pour ne pas chevaucher l'icône
  drawOutlineText(ctx, String(maxWS), wsX + 110, trY + 74, '#ffffff', 40, 'Lilita', 5);

  // ── ACCOUNT CREATED ───────────────────────────────────
  if (creationYear) {
    const acW = 330, acH = 42, acX = W - acW - 14, acY = 10;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.50)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#f3f1eb', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 18px Roboto';
    ctx.fillStyle = '#2a2a2a';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 28);
  }

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 6;
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 84;
  const colW = Math.floor((RW - 16) / 3);

  const row2 = [
    {
      label: 'CURRENT',
      val: currentElo,
      sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''),
      color: curTier.color,
      badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null
    },
    {
      label: 'HIGHEST',
      val: highestElo,
      sub: hiTier.name + (hiTier.sub ? ' ' + hiTier.sub : ''),
      color: hiTier.color,
      badgeUrl: hiTier.file ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png` : null
    },
    {
      label: 'RECORDS',
      val: recordPts,
      sub: '',
      color: '#ffd700',
      badgeUrl: `https://cdn.brawlify.com/records/regular/${recordLevel}.png`
    },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R2H, i === 1);

    if (c.badgeUrl) {
      const b = await tryImg(c.badgeUrl);
      if (b) ctx.drawImage(b, cx + 6, curY + 8, 64, 64);
    }

    const tx = cx + 76;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = PRAIRIE.muted;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 16);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 58, '#ffffff', 38, 'Lilita', 4);
    if (c.sub) {
      ctx.font = 'bold 13px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 76);
    }
  }
  curY += R2H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 72;
  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e76345', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: PRAIRIE.muted, modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#63b7ff', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R3H, i === 0);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 6, curY + 8, 56, 56);
    } else {
      const bx = cx + 8, by = curY + 10, sq = 17, gap = 2;
      [[0,0,'#e74c3c'], [sq+gap,0,'#e74c3c'], [0,sq+gap,'#e74c3c'],
       [sq+gap,sq+gap,'#3498db'], [(sq+gap)*2,0,'#3498db'], [(sq+gap)*2,sq+gap,'#3498db']]
        .forEach(([dx, dy, col]) => {
          ctx.fillStyle = col;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.fillRect(bx + dx, by + dy, sq, sq);
          ctx.strokeRect(bx + dx, by + dy, sq, sq);
        });
      ctx.font = 'bold 10px Roboto';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap / 2 + sq / 2, by + sq + gap / 2 + sq / 2 + 3);
    }

    const tx = cx + 68;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 18);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 58, '#ffffff', 34, 'Lilita', 4);
  }
  curY += R3H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── BRAWLERS + PRESTIGE ──────────────────────────────
  const R4H = 168;
  const presW = 128;
  const brawlW = RW - presW - 12;

  statBox(ctx, RX, curY, brawlW, R4H, true);
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 10, curY + 18);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 10, curY + 18);

  // seulement les 10 premiers
  const cols = 5;
  const rows = 2;
  const slotCount = 10;
  const iSz = 56;
  const gapY = 12;

  const startX = RX + 16;
  const startY = curY + 34;
  const usableW = brawlW - 32;
  const totalIconsW = cols * iSz;
  const gapX = Math.max(10, Math.floor((usableW - totalIconsW) / (cols - 1)));

  for (let i = 0; i < Math.min(displayBrawlers.length, slotCount); i++) {
    const b = displayBrawlers[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = startX + col * (iSz + gapX);
    const by = startY + row * (iSz + gapY);

    const img = await tryImg(getBsInfoTierUrl(b.id, b.trophies));
    if (img) {
      ctx.drawImage(img, bx, by, iSz, iSz);
    } else {
      // fallback si jamais BSInfo rate
      const fallback = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`);
      if (fallback) ctx.drawImage(fallback, bx, by, iSz, iSz);
    }

    if (b.id === favoriteBrawlerId) {
      drawMarker(ctx, bx + iSz - 6, by + 6, 'star');
    } else if (b.id === winstreakBrawlerId) {
      drawMarker(ctx, bx + iSz - 6, by + 6, 'flame');
    }
  }

  if (brawlerCount > 10) {
    const moreX = startX + cols * iSz + (cols - 1) * gapX + 12;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = PRAIRIE.cream;
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 10} more`, moreX, startY + 28);
  }

// ── PRESTIGE ─────────────────────────────────────────
const presX = RX + brawlW + 6;
statBox(ctx, presX, curY, presW, R4H);

const presTierFile = Math.min(6, Math.max(0, Math.floor(prestige / 20)));
const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presTierFile}.png`);
const badgeSize = Math.min(90, presW - 18);
const badgeX = presX + (presW - badgeSize) / 2;
const badgeY = curY + 16;

if (pImg) ctx.drawImage(pImg, badgeX, badgeY, badgeSize, badgeSize);

ctx.textAlign = 'center';
drawOutlineText(ctx, String(prestige), presX + presW / 2, badgeY + badgeSize * 0.60, '#ffffff', 30, 'Lilita', 5);

ctx.font = 'bold 11px Roboto';
ctx.fillStyle = PRAIRIE.muted;
ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 24);

ctx.font = 'bold 14px Roboto';
ctx.fillStyle = PRAIRIE.goldText;
ctx.fillText('PRESTIGE', presX + presW / 2, curY + R4H - 8);

  // ── DATE ──────────────────────────────────────────────
  ctx.font = 'bold 12px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 7, H - 4);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };