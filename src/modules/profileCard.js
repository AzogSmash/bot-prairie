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
  const map = new Map((stats || []).map(s => [normalizeStr(s.name), Number(s.value) || 0]));
  for (const name of names) {
    const key = normalizeStr(name);
    if (map.has(key)) return map.get(key);
  }
  return 0;
}

// Sélectionne l'ID du brawler héros — accepte favorite_brawler comme nombre OU objet
function pickHeroBrawlerId(bsPlayer, rntData) {
  const favoriteId = Number(
    rntData?.favorite_brawler?.id ||
    rntData?.favorite_brawler ||
    0
  );
  if (favoriteId) return favoriteId;

  // Fallback sur les brawlers RNT (clés snake_case)
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

  // Fallback sur brawlers BS (clés camelCase)
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

// Prestige total — gère clés snake_case RNT + fallback calcul
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
    return rntBrawlers.reduce((sum, b) => {
      const t = Math.max(Number(b.highest_trophies || 0), Number(b.trophies || 0));
      return sum + Math.floor(t / 1000);
    }, 0);
  }

  return (bsPlayer?.brawlers || []).reduce((sum, b) => {
    const t = Math.max(Number(b.highestTrophies || 0), Number(b.trophies || 0));
    return sum + Math.floor(t / 1000);
  }, 0);
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

  // ── Normalisation des données RNT ────────────────────
  const rntData = rnt?.result || rnt || {};
  const stats = rntData?.stats || [];
  const rntBrawlers = rntData?.brawlers || [];
  const favoriteBrawlerId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  const maxWS = Number(rntData?.max_winstreak || 0);
  const ownedBrawlers = Number(rntData?.brawler_count || 0);
  const allianceName = rntData?.alliance?.name || '';
  const firstBattleCardAvatar = Number(rntData?.battle_card?.first_profile_avatar || 0);
  const profileAvatar = Number(rntData?.profile_avatar || 0);
  const creationYear =
    getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') ||
    rntData?.account_creation_year;

  // ── Données calculées ────────────────────────────────
  const bsBrawlers = bsPlayer?.brawlers || [];
  const heroBrawlerId = pickHeroBrawlerId(bsPlayer, rntData);
  const brawlerCount = ownedBrawlers || bsBrawlers.length;
  const trophies = bsPlayer?.trophies || getStatLoose(stats, 'Trophies') || 0;
  const prestige = getTotalPrestigeFromRnt(rntData, bsPlayer);

  const currentElo = getStatLoose(stats, 'CurrentRankedPoints', 'current_ranked_points') || rntData?.ranked_elo || 0;
  const highestElo = getStatLoose(stats, 'HighestRankedPoints', 'highest_ranked_points') || rntData?.highest_ranked_elo || 0;
  const recordPts  = getStatLoose(stats, 'RecordPoints', 'record_points') || rntData?.record_points || 0;
  const recordLevel = getStatLoose(stats, 'RecordLevel', 'RecordTier') || Number(rntData?.record_level || rntData?.record_tier || 7);

  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStatLoose(stats, '3vs3Victories', '3v3victories') || 0;
  const soloWins = bsPlayer?.soloVictories    || getStatLoose(stats, 'SoloVictories', 'solo_victories') || 0;
  const duoWins  = bsPlayer?.duoVictories     || getStatLoose(stats, 'DuoVictories',  'duo_victories')  || 0;

  const expLevel  = bsPlayer?.expLevel  || getStatLoose(stats, 'ExpLevel',  'exp_level')  || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;

  const curTier = getRankedTier(currentElo);
  const hiTier  = getRankedTier(highestElo);

  // ── Canvas ───────────────────────────────────────────
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // FOND GLOBAL
  ctx.fillStyle = '#3d1a6e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W + H; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(0, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - i, 0); ctx.lineTo(W, i); ctx.stroke();
  }

  // ══ ZONE GAUCHE ══════════════════════════════════════
  const LW = 470;
  drawBSPattern(ctx, 0, 0, LW, H, '#2a1050', 'rgba(100, 200, 100, 0.15)');
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(LW, 0); ctx.lineTo(LW, H); ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(LW - 1, 0); ctx.lineTo(LW - 1, H); ctx.stroke();

  // ── HEADER GAUCHE ────────────────────────────────────
  const iconSize = 88;
  bsBox(ctx, 0, 0, LW, 118, '#1a0a30', '#000000', 0);

  // Icône profil principal (profile_avatar RNT ou BS)
  const avatarId = profileAvatar || bsPlayer?.icon?.id;
  if (avatarId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${avatarId}.png`);
    if (iconImg) {
      bsBox(ctx, 8, 8, iconSize + 4, iconSize + 4, '#2d5a27', '#000', 6);
      ctx.drawImage(iconImg, 10, 10, iconSize, iconSize);
    }
  }

  // Tag centré sous l'avatar
  const tagText = '#' + bsTag.replace('#', '').toUpperCase();
  const tagFontSize = fitTextSize(ctx, tagText, iconSize + 10, 17, 10, 'Roboto', 'bold');
  ctx.font = `bold ${tagFontSize}px Roboto`;
  ctx.fillStyle = '#f0f0f0';
  ctx.textAlign = 'center';
  ctx.fillText(tagText, 10 + iconSize / 2, 10 + iconSize + 20);

  // Nom auto-fit dans sa box
  const playerName = bsPlayer?.name || 'Joueur';
  const nameBoxX = iconSize + 20;
  const nameBoxY = 14;
  const nameBoxW = LW - nameBoxX - 12;
  const nameBoxH = 50;
  bsBox(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, '#1a1a3e', '#000', 8);
  const nameFontSize = fitTextSize(ctx, playerName, nameBoxW - 20, 34, 20, 'Lilita');
  ctx.textAlign = 'center';
  drawOutlineText(ctx, playerName, nameBoxX + nameBoxW / 2, nameBoxY + 38, '#44ff44', nameFontSize, 'Lilita', 5);

  // Badge niveau + barre XP
  const xpPerLevel = 1000;
  const xpProgress = Math.max(0, expPoints % xpPerLevel);
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  bsBox(ctx, nameBoxX, 70, 50, 32, '#3a6bc4', '#000', 6);
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), nameBoxX + 25, 92);

  const barX = nameBoxX + 56, barY = 76, barW = nameBoxW - 56, barH = 18;
  rr(ctx, barX, barY, barW, barH, 5);
  ctx.fillStyle = '#141424'; ctx.fill();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; ctx.stroke();
  if (xpRatio > 0) {
    const fillInnerW = Math.max(8, Math.round((barW - 4) * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillInnerW, barH - 4, 4);
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, '#6ad6ff'); g.addColorStop(1, '#1d8fff');
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.font = 'bold 12px Roboto';
  ctx.fillStyle = '#d8d8d8';
  ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 3, barY + 13);

  // ── GRAND PORTRAIT BRAWLER ───────────────────────────
  if (heroBrawlerId) {
    const portrait = await tryImg(`https://cdn.brawlify.com/brawlers/portraits/${heroBrawlerId}.png`);
    if (portrait) {
      const ph = 400;
      const pw = Math.round(ph * portrait.width / portrait.height);
      const px = (LW - pw) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(portrait, px, 118, pw, ph);
      ctx.restore();
    }
  }

  // ── NOM + CLUB en bas gauche ─────────────────────────
  const ng = ctx.createLinearGradient(0, H - 150, 0, H);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.4, 'rgba(0,0,0,0.82)');
  ng.addColorStop(1, 'rgba(0,0,0,0.96)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, H - 150, LW, 150);

  ctx.textAlign = 'left';
  drawOutlineText(ctx, playerName, 12, H - 62, '#44ff44', 48, 'Lilita', 7);

  // Texte orange = nom du club/alliance (plus le nom du brawler)
  const subText = allianceName || bsPlayer?.club?.name || '';
  if (subText) {
    drawOutlineText(ctx, subText, 12, H - 24, '#ff9900', 24, 'Roboto', 5);
  }

  // Badge club
  const clubBadgeId = bsPlayer?.club?.badgeId;
  if (clubBadgeId) {
    const cbImg = await tryImg(`https://cdn.brawlify.com/club-badges/regular/${clubBadgeId}.png`);
    if (cbImg) ctx.drawImage(cbImg, LW - 74, H - 74, 64, 64);
  }

  // ══ ZONE DROITE ══════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;
  const trY = 62;
  const trH = 84;

  drawBSPattern(ctx, RX, 0, RW, H, '#4a1f80', 'rgba(100, 80, 160, 0.2)');

  // ── ICÔNE PROFIL (cercle Trophy Road) ────────────────
  // Utilise battle_card.first_profile_avatar en priorité
  const trophyIconId = firstBattleCardAvatar || profileAvatar || bsPlayer?.icon?.id;
  if (trophyIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${trophyIconId}.png`);
    if (pIcon) {
      const pr = 46, px = RX + 58, py = trY + trH / 2;
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
  const trX = RX + 120;
  const wsW = 148;
  const trW = RW - 120 - wsW - 16;
  statBox(ctx, trX, trY, trW, trH);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 12, trY + 22);
  drawOutlineText(ctx, fmt(trophies), trX + 12, trY + 74, '#ffffff', 58, 'Lilita', 5);

  // ── WIN STREAK ───────────────────────────────────────
  const wsX = trX + trW + 10;
  statBox(ctx, wsX, trY, wsW, trH);
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#ffaa00';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 20);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 36);
  drawOutlineText(ctx, String(maxWS), wsX + wsW / 2, trY + 76, '#ffffff', 48, 'Lilita', 5);

  // ── ACCOUNT CREATED ───────────────────────────────────
  if (creationYear) {
    const acW = 340, acH = 44, acX = W - acW - 16, acY = 12;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#ffffff', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 19px Roboto';
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 29);
  }

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 7;
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 7;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 78;
  const colW = Math.floor((RW - 20) / 3);

  const row2 = [
    { label: 'CURRENT', val: currentElo, sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''), color: curTier.color, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, sub: hiTier.name  + (hiTier.sub  ? ' ' + hiTier.sub  : ''), color: hiTier.color,  badgeUrl: hiTier.file  ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png`  : null },
    { label: 'RECORDS', val: recordPts,  sub: '',                                                      color: '#ffd700',    badgeUrl: `https://cdn.brawlify.com/records/regular/${recordLevel}.png` },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * (colW + 6);
    statBox(ctx, cx, curY, colW - 2, R2H);

    if (c.badgeUrl) {
      const badge = await tryImg(c.badgeUrl);
      if (badge) ctx.drawImage(badge, cx + 5, curY + 6, 64, 64);
    }

    const tx = cx + 76;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 16);

    drawOutlineText(ctx, fmt(c.val), tx, curY + 56, '#ffffff', 36, 'Lilita', 4);

    if (c.sub) {
      ctx.font = 'bold 13px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 72);
    }
  }

  curY += R2H + 7;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 7;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 66;

  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e74c3c', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: '#aaaaaa', modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#3498db', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + i * (colW + 6);
    statBox(ctx, cx, curY, colW - 2, R3H);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 5, curY + 3, 56, 56);
    } else {
      const bx = cx + 8, by = curY + 6, sq = 18, gap = 3;
      [[0,0,'#e74c3c'],[sq+gap,0,'#e74c3c'],[0,sq+gap,'#e74c3c'],
       [sq+gap,sq+gap,'#3498db'],[(sq+gap)*2,0,'#3498db'],[(sq+gap)*2,sq+gap,'#3498db']]
        .forEach(([dx, dy, col]) => {
          ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
          ctx.fillRect(bx+dx, by+dy, sq, sq); ctx.strokeRect(bx+dx, by+dy, sq, sq);
        });
      ctx.font = 'bold 11px Roboto';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap/2 + sq/2, by + sq + gap/2 + sq/2 + 3);
    }

    const tx = cx + 72;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 18);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 56, '#ffffff', 36, 'Lilita', 4);
  }

  curY += R3H + 7;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 7;

  // ── BRAWLERS + PRESTIGE (hauteur fixe) ───────────────
  const R4H = 124;
  const presW = 150;
  const brawlW = RW - presW - 14;

  statBox(ctx, RX, curY, brawlW, R4H);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 10, curY + 20);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 10, curY + 20);

  // Top 6 depuis RNT brawlers (brawler_id) sinon BS
  const topSixRnt = [...rntBrawlers]
    .sort((a, b) => Number(b.trophies || 0) - Number(a.trophies || 0))
    .slice(0, 6);
  const topSixBs = [...bsBrawlers]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 6);
  const topSix = topSixRnt.length ? topSixRnt : topSixBs;

  const iSz = 48;
  for (let i = 0; i < topSix.length; i++) {
    const bId = topSixRnt.length ? topSix[i].brawler_id : topSix[i].id;
    const bx = RX + 10 + i * (iSz + 6);
    const by = curY + 28;
    rr(ctx, bx - 2, by - 2, iSz + 4, iSz + 4, 7);
    ctx.fillStyle = '#2a1050'; ctx.fill();
    ctx.strokeStyle = '#5500aa'; ctx.lineWidth = 1.5; ctx.stroke();
    const bImg = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${bId}.png`);
    if (bImg) ctx.drawImage(bImg, bx, by, iSz, iSz);
  }

  if (brawlerCount > 6) {
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = '#d8d8d8';
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 6} more`, RX + 10 + 6 * (iSz + 6) + 2, curY + 28 + iSz / 2 + 8);
  }

  // ── PRESTIGE ─────────────────────────────────────────
  const presX = RX + brawlW + 6;
  statBox(ctx, presX, curY, presW, R4H);

  const presTierFile = Math.min(6, Math.max(0, Math.floor(prestige / 20)));
  const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presTierFile}.png`);
  const badgeSize = Math.min(96, presW - 20);
  const badgeX = presX + (presW - badgeSize) / 2;
  const badgeY = curY + 14;

  if (pImg) ctx.drawImage(pImg, badgeX, badgeY, badgeSize, badgeSize);

  ctx.textAlign = 'center';
  drawOutlineText(ctx, String(prestige), presX + presW / 2, badgeY + badgeSize * 0.6, '#ffffff', 30, 'Lilita', 5);

  ctx.font = 'bold 12px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 22);
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = '#9b59b6';
  ctx.fillText('PRESTIGE', presX + presW / 2, curY + R4H - 8);

  // ── DATE ──────────────────────────────────────────────
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 8, H - 5);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };