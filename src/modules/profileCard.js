const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');
const http = require('http');

registerFont(path.join(__dirname, '../assets/LilitaOne-Regular.ttf'), { family: 'Lilita' });
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

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
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getStat(stats, name) {
  return stats?.find(s => s.name === name)?.value || 0;
}

function getStatLoose(stats, ...names) {
  const map = new Map(
    (stats || []).map(s => [normalizeStr(s.name), Number(s.value) || 0])
  );
  for (const name of names) {
    const key = normalizeStr(name);
    if (map.has(key)) return map.get(key);
  }
  return 0;
}

function findBrawlerByIdOrName(brawlers, id, name) {
  if (!brawlers?.length) return null;
  if (id) {
    const foundById = brawlers.find(b => String(b.id) === String(id));
    if (foundById) return foundById;
  }
  if (name) {
    const target = normalizeStr(name);
    const foundByName = brawlers.find(b => normalizeStr(b.name) === target);
    if (foundByName) return foundByName;
  }
  return null;
}

function pickHeroBrawler(bsPlayer, rnt) {
  const brawlers = bsPlayer?.brawlers || [];
  if (!brawlers.length) return null;

  const byId = [
    rnt?.favorite_brawler?.id,
    rnt?.favoriteBrawler?.id,
    rnt?.most_played_brawler?.id,
    rnt?.mostPlayedBrawler?.id,
    rnt?.most_played?.id,
    rnt?.profile?.favorite_brawler_id,
    rnt?.profile?.favoriteBrawlerId,
  ].find(Boolean);

  const byName = [
    rnt?.favorite_brawler?.name,
    rnt?.favoriteBrawler?.name,
    rnt?.most_played_brawler?.name,
    rnt?.mostPlayedBrawler?.name,
    rnt?.most_played?.name,
    rnt?.profile?.favorite_brawler_name,
    rnt?.profile?.favoriteBrawlerName,
  ].find(Boolean);

  const found = findBrawlerByIdOrName(brawlers, byId, byName);
  if (found) return found;

  return [...brawlers].sort((a, b) => {
    const ah = Number(a.highestTrophies || 0);
    const bh = Number(b.highestTrophies || 0);
    if (bh !== ah) return bh - ah;
    const at = Number(a.trophies || 0);
    const bt = Number(b.trophies || 0);
    if (bt !== at) return bt - at;
    return Number(b.power || 0) - Number(a.power || 0);
  })[0];
}

function getBrawlerPrestigeValue(brawler) {
  const t = Math.max(
    Number(brawler?.highestTrophies || 0),
    Number(brawler?.trophies || 0)
  );
  return Math.max(0, Math.floor(t / 1000));
}

function getTotalPrestige(bsPlayer, rnt) {
  const stats = rnt?.stats || [];
  const direct =
    getStatLoose(stats, 'Prestige', 'TotalPrestige') ||
    Number(rnt?.prestige || 0) ||
    Number(rnt?.total_prestige || 0) ||
    Number(bsPlayer?.totalPrestigeLevel || 0);
  if (direct > 0) return direct;
  const brawlers = bsPlayer?.brawlers || [];
  return brawlers.reduce((sum, b) => sum + getBrawlerPrestigeValue(b), 0);
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
        } catch (e) { reject(e); }
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

async function tryImg(url) {
  try { return await fetchImage(url); } catch { return null; }
}

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
}

function statBox(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 8);
  ctx.fillStyle = '#1a0e35';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
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

// ═══════════════════════════════════════════════════════
// GÉNÉRATION CARTE
// ═══════════════════════════════════════════════════════
async function generateProfileCard(bsTag, bsPlayer) {
  let rnt = null;
  try { rnt = await fetchRntProfile(bsTag); } catch (e) { console.error('[Card] RNT:', e.message); }

  const stats = rnt?.stats || [];
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── FOND GLOBAL ──────────────────────────────────────
  ctx.fillStyle = '#3d1a6e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W + H; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(0, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - i, 0); ctx.lineTo(W, i); ctx.stroke();
  }

  // ══ ZONE GAUCHE ══════════════════════════════════════
  const LW = 520;
  const brawlers = bsPlayer?.brawlers || [];
  const heroBrawler = pickHeroBrawler(bsPlayer, rnt);

  drawBSPattern(ctx, 0, 0, LW, H, '#2a1050', 'rgba(100, 200, 100, 0.15)');

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(LW, 0); ctx.lineTo(LW, H); ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(LW - 1, 0); ctx.lineTo(LW - 1, H); ctx.stroke();

  // ── HEADER GAUCHE ────────────────────────────────────
  const iconId = bsPlayer?.icon?.id;
  const iconSize = 90;
  bsBox(ctx, 0, 0, LW, 130, '#1a0a30', '#000000', 0);

  if (iconId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`);
    if (iconImg) {
      bsBox(ctx, 8, 8, iconSize + 4, iconSize + 4, '#2d5a27', '#000', 6);
      ctx.drawImage(iconImg, 10, 10, iconSize, iconSize);
    }
  }

  // Tag centré sous l'avatar
  const tagText = '#' + bsTag.replace('#', '').toUpperCase();
  const tagFontSize = fitTextSize(ctx, tagText, iconSize + 10, 18, 11, 'Roboto', 'bold');
  ctx.font = `bold ${tagFontSize}px Roboto`;
  ctx.fillStyle = '#f0f0f0';
  ctx.textAlign = 'center';
  ctx.fillText(tagText, 10 + iconSize / 2, 10 + iconSize + 22);

  // Nom auto-fit dans sa box
  const playerName = bsPlayer?.name || 'Joueur';
  const nameBoxX = iconSize + 22;
  const nameBoxY = 18;
  const nameBoxW = LW - nameBoxX - 14;
  const nameBoxH = 54;
  bsBox(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, '#1a1a3e', '#000', 8);
  const nameFontSize = fitTextSize(ctx, playerName, nameBoxW - 24, 36, 22, 'Lilita');
  ctx.textAlign = 'center';
  drawOutlineText(ctx, playerName, nameBoxX + nameBoxW / 2, nameBoxY + 42, '#44ff44', nameFontSize, 'Lilita', 5);

  // Badge niveau + barre XP
  const expLevel = bsPlayer?.expLevel || getStatLoose(stats, 'ExpLevel', 'exp_level') || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;
  const xpPerLevel = 1000;
  const xpProgress = Math.max(0, expPoints % xpPerLevel);
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  bsBox(ctx, nameBoxX, 78, 52, 34, '#3a6bc4', '#000', 6);
  ctx.font = 'bold 19px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), nameBoxX + 26, 101);

  const barX = nameBoxX + 58;
  const barY = 84;
  const barW = nameBoxW - 58;
  const barH = 20;
  rr(ctx, barX, barY, barW, barH, 5);
  ctx.fillStyle = '#141424';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (xpRatio > 0) {
    const fillInnerW = Math.max(8, Math.round((barW - 4) * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillInnerW, barH - 4, 4);
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, '#6ad6ff');
    g.addColorStop(1, '#1d8fff');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#d8d8d8';
  ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 4, barY + 15);

  // ── GRAND PORTRAIT BRAWLER ───────────────────────────
  if (heroBrawler) {
    const portrait = await tryImg(`https://cdn.brawlify.com/brawlers/portraits/${heroBrawler.id}.png`);
    if (portrait) {
      const ph = 460;
      const pw = Math.round(ph * portrait.width / portrait.height);
      const px = (LW - pw) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(portrait, px, 130, pw, ph);
      ctx.restore();
    }
  }

  // ── NOM + SKIN en bas gauche ─────────────────────────
  const ng = ctx.createLinearGradient(0, H - 160, 0, H);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.5, 'rgba(0,0,0,0.85)');
  ng.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, H - 160, LW, 160);

  ctx.textAlign = 'left';
  drawOutlineText(ctx, playerName, 14, H - 70, '#44ff44', 52, 'Lilita', 7);

  const skinName = heroBrawler?.skin?.name || heroBrawler?.name || '';
  if (skinName) {
    drawOutlineText(ctx, skinName, 14, H - 26, '#ff9900', 26, 'Roboto', 5);
  }

  const clubBadgeId = bsPlayer?.club?.badgeId;
  if (clubBadgeId) {
    const cbImg = await tryImg(`https://cdn.brawlify.com/club-badges/regular/${clubBadgeId}.png`);
    if (cbImg) ctx.drawImage(cbImg, LW - 80, H - 80, 70, 70);
  }

  // ══ ZONE DROITE ══════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;
  const trY = 68;
  const trH = 92;

  drawBSPattern(ctx, RX, 0, RW, H, '#4a1f80', 'rgba(100, 80, 160, 0.2)');

  // ── ICÔNE PROFIL (cercle) ────────────────────────────
  const pIconId = bsPlayer?.icon?.id;
  if (pIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${pIconId}.png`);
    if (pIcon) {
      const pr = 52, px = RX + 65, py = trY + trH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b';
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
  const trophies = bsPlayer?.trophies || getStatLoose(stats, 'Trophies') || 0;
  const maxWS = brawlers.reduce((m, b) => Math.max(m, b.maxWinStreak || 0), 0) || 0;

  const trX = RX + 132;
  const wsW = 164;
  const trW = RW - 132 - wsW - 18;
  statBox(ctx, trX, trY, trW, trH);
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 14, trY + 24);
  drawOutlineText(ctx, fmt(trophies), trX + 14, trY + 82, '#ffffff', 60, 'Lilita', 5);

  // ── WIN STREAK ───────────────────────────────────────
  const wsX = trX + trW + 12;
  statBox(ctx, wsX, trY, wsW, trH);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#ffaa00';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 22);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 40);
  drawOutlineText(ctx, String(maxWS), wsX + wsW / 2, trY + 84, '#ffffff', 52, 'Lilita', 5);

  // ── ACCOUNT CREATED ───────────────────────────────────
  const creationYear =
    getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') ||
    rnt?.account_creation_year;
  if (creationYear) {
    const acW = 340, acH = 46, acX = W - acW - 18, acY = 14;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#ffffff', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 20px Roboto';
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 31);
  }

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 8;
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 8;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 88;
  const colW = Math.floor((RW - 24) / 3);

  const currentElo = getStatLoose(stats, 'CurrentRankedPoints', 'current_ranked_points') || rnt?.ranked_elo || 0;
  const highestElo = getStatLoose(stats, 'HighestRankedPoints', 'highest_ranked_points') || rnt?.highest_ranked_elo || 0;
  const recordPts  = getStatLoose(stats, 'RecordPoints', 'record_points') || rnt?.record_points || 0;
  const recordTier = getStatLoose(stats, 'RecordTier', 'record_tier') || rnt?.record_tier || 7;
  const curTier = getRankedTier(currentElo);
  const hiTier  = getRankedTier(highestElo);

  const row2 = [
    { label: 'CURRENT', val: currentElo, sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''), color: curTier.color, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, sub: hiTier.name  + (hiTier.sub  ? ' ' + hiTier.sub  : ''), color: hiTier.color,  badgeUrl: hiTier.file  ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png`  : null },
    { label: 'RECORDS', val: recordPts,  sub: '',                                                      color: '#ffd700',    badgeUrl: `https://cdn.brawlify.com/records/regular/${recordTier}.png` },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * colW + (i > 0 ? 8 * i : 0);
    statBox(ctx, cx, curY, colW - 4, R2H);

    if (c.badgeUrl) {
      const badge = await tryImg(c.badgeUrl);
      if (badge) ctx.drawImage(badge, cx + 6, curY + 8, 72, 72);
    }

    const tx = cx + 86;
    ctx.font = 'bold 13px Roboto';
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 18);

    drawOutlineText(ctx, fmt(c.val), tx, curY + 62, '#ffffff', 40, 'Lilita', 4);

    if (c.sub) {
      ctx.font = 'bold 15px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 80);
    }
  }

  curY += R2H + 8;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 8;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 74;
  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStatLoose(stats, '3vs3Victories', '3v3victories') || 0;
  const soloWins = bsPlayer?.soloVictories    || getStatLoose(stats, 'SoloVictories', 'solo_victories') || 0;
  const duoWins  = bsPlayer?.duoVictories     || getStatLoose(stats, 'DuoVictories',  'duo_victories')  || 0;

  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e74c3c', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: '#aaaaaa', modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#3498db', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + i * colW + (i > 0 ? 8 * i : 0);
    statBox(ctx, cx, curY, colW - 4, R3H);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 6, curY + 4, 60, 60);
    } else {
      const bx = cx + 10, by = curY + 8, sq = 19, gap = 3;
      [[0,0,'#e74c3c'],[sq+gap,0,'#e74c3c'],[0,sq+gap,'#e74c3c'],
       [sq+gap,sq+gap,'#3498db'],[(sq+gap)*2,0,'#3498db'],[(sq+gap)*2,sq+gap,'#3498db']]
        .forEach(([dx, dy, col]) => {
          ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
          ctx.fillRect(bx+dx, by+dy, sq, sq); ctx.strokeRect(bx+dx, by+dy, sq, sq);
        });
      ctx.font = 'bold 12px Roboto';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap / 2 + sq / 2, by + sq + gap / 2 + sq / 2 + 4);
    }

    const tx = cx + 78;
    ctx.font = 'bold 13px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 20);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 62, '#ffffff', 40, 'Lilita', 4);
  }

  curY += R3H + 8;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 8;

  // ── BRAWLERS + PRESTIGE ───────────────────────────────
  const R4H = H - curY - 4;
  const presW = 168;
  const brawlW = RW - presW - 16;

  statBox(ctx, RX, curY, brawlW, R4H);

  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 12, curY + 22);
  const brawlerCount = brawlers.length || 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 12, curY + 22);

  // Icônes top 6 brawlers
  const topSix = [...brawlers].sort((a, b) => b.trophies - a.trophies).slice(0, 6);
  const iSz = 52;
  for (let i = 0; i < topSix.length; i++) {
    const bx = RX + 12 + i * (iSz + 6);
    const by = curY + 28;
    rr(ctx, bx - 2, by - 2, iSz + 4, iSz + 4, 7);
    ctx.fillStyle = '#2a1050';
    ctx.fill();
    ctx.strokeStyle = '#5500aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const bImg = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${topSix[i].id}.png`);
    if (bImg) ctx.drawImage(bImg, bx, by, iSz, iSz);
  }

  if (brawlerCount > 6) {
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = '#d8d8d8';
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 6} more`, RX + 12 + 6 * (iSz + 6) + 2, curY + 30 + 33);
  }

  // ── PRESTIGE ─────────────────────────────────────────
  const prestige = getTotalPrestige(bsPlayer, rnt);
  const presX = RX + brawlW + 8;
  statBox(ctx, presX, curY, presW, R4H);

  const presTierFile = Math.min(6, Math.max(0, Math.floor(prestige / 20)));
  const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presTierFile}.png`);
  const badgeSize = Math.min(112, presW - 22);
  const badgeX = presX + (presW - badgeSize) / 2;
  const badgeY = curY + 26;

  if (pImg) ctx.drawImage(pImg, badgeX, badgeY, badgeSize, badgeSize);

  ctx.textAlign = 'center';
  drawOutlineText(ctx, String(prestige), presX + presW / 2, badgeY + badgeSize * 0.62, '#ffffff', 34, 'Lilita', 5);

  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 28);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#9b59b6';
  ctx.fillText('PRESTIGE', presX + presW / 2, curY + R4H - 10);

  // ── DATE ──────────────────────────────────────────────
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 8, H - 5);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };