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
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function getStat(stats, name) { return stats?.find(s => s.name === name)?.value || 0; }
function getStatLoose(stats, ...names) {
  const map = new Map((stats || []).map(s => [normalizeStr(s.name), Number(s.value) || 0]));
  for (const name of names) { const k = normalizeStr(name); if (map.has(k)) return map.get(k); }
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
  const direct = getStatLoose(stats, 'Prestige', 'TotalPrestige') || Number(rntData?.prestige || 0) || Number(rntData?.total_prestige || 0) || Number(bsPlayer?.totalPrestigeLevel || 0);
  if (direct > 0) return direct;
  const rntBrawlers = rntData?.brawlers || [];
  if (rntBrawlers.length) return rntBrawlers.reduce((s, b) => s + Math.floor(Math.max(Number(b.highest_trophies || 0), Number(b.trophies || 0)) / 1000), 0);
  return (bsPlayer?.brawlers || []).reduce((s, b) => s + Math.floor(Math.max(Number(b.highestTrophies || 0), Number(b.trophies || 0)) / 1000), 0);
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
        try { const j = JSON.parse(d); if (j.ok && j.result) resolve(j.result); else reject(new Error('RNT non trouvé')); }
        catch (e) { reject(e); }
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
function fmt(n) { if (!n && n !== 0) return '0'; return Number(n).toLocaleString('fr-FR'); }

function drawOutlineText(ctx, text, x, y, fillColor, fontSize, font, outlineWidth = 6) {
  ctx.font = `${fontSize}px ${font}`;
  ctx.strokeStyle = '#000000'; ctx.lineWidth = outlineWidth; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor; ctx.fillText(text, x, y);
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
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function bsBox(ctx, x, y, w, h, bgColor, borderColor = '#000', r = 10) {
  rr(ctx, x, y, w, h, r); ctx.fillStyle = bgColor; ctx.fill();
  ctx.strokeStyle = borderColor; ctx.lineWidth = 3; ctx.stroke();
}

function statBox(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(22, 10, 45, 0.88)'; ctx.fill();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.stroke();
}

function drawBSPattern(ctx, x, y, w, h, baseColor, lineColor) {
  ctx.save(); rr(ctx, x, y, w, h, 0); ctx.clip();
  ctx.fillStyle = baseColor; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
  const sz = 38;
  for (let row = -1; row < (h / sz) + 2; row++) {
    for (let col = -1; col < (w / sz) + 2; col++) {
      const cx = x + col * sz + (row % 2 === 0 ? 0 : sz / 2);
      const cy = y + row * sz * 0.6;
      ctx.beginPath(); ctx.moveTo(cx, cy - sz * 0.32); ctx.lineTo(cx + sz * 0.44, cy);
      ctx.lineTo(cx, cy + sz * 0.32); ctx.lineTo(cx - sz * 0.44, cy); ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}

// Dessine un petit marqueur (⭐ ou 🔥) en canvas natif (pas d'emoji)
function drawMarker(ctx, x, y, type) {
  ctx.save();
  if (type === 'star') {
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    // Étoile 5 branches simplifiée
    const r1 = 7, r2 = 3.5, cx = x, cy = y;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * Math.PI / 5) - Math.PI / 2;
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (type === 'flame') {
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
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
  const creationYear = getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') || rntData?.account_creation_year;

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
  const duoWins  = bsPlayer?.duoVictories     || getStatLoose(stats, 'DuoVictories', 'duo_victories')   || 0;
  const expLevel  = bsPlayer?.expLevel  || getStatLoose(stats, 'ExpLevel', 'exp_level')   || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;

  const curTier = getRankedTier(currentElo);
  const hiTier  = getRankedTier(highestElo);

  // ── Canvas ───────────────────────────────────────────
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── FOND GLOBAL : fond_profil.png en cover + overlay ─
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
    // Cover : scale pour couvrir tout le canvas
    const scaleX = W / bg.width, scaleY = H / bg.height;
    const scale = Math.max(scaleX, scaleY);
    const sw = bg.width * scale, sh = bg.height * scale;
    ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } catch {
    ctx.fillStyle = '#3d1a6e';
    ctx.fillRect(0, 0, W, H);
  }
  // Overlay violet/noir semi-transparent pour lisibilité
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, 'rgba(30, 8, 70, 0.82)');
  overlay.addColorStop(0.6, 'rgba(20, 5, 50, 0.75)');
  overlay.addColorStop(1, 'rgba(10, 2, 30, 0.55)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // ══ ZONE GAUCHE ══════════════════════════════════════
  const LW = 440;
  // Overlay gauche plus opaque pour lisibilité des stats
  drawBSPattern(ctx, 0, 0, LW, H, 'rgba(30, 8, 60, 0.78)', 'rgba(100, 200, 100, 0.12)');
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(LW, 0); ctx.lineTo(LW, H); ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(LW - 1, 0); ctx.lineTo(LW - 1, H); ctx.stroke();

  // ── HEADER GAUCHE ────────────────────────────────────
  const iconSize = 84;
  bsBox(ctx, 0, 0, LW, 112, 'rgba(15, 5, 35, 0.92)', '#000000', 0);

  const avatarId = profileAvatar || bsPlayer?.icon?.id;
  if (avatarId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${avatarId}.png`);
    if (iconImg) {
      bsBox(ctx, 7, 7, iconSize + 4, iconSize + 4, '#2d5a27', '#000', 6);
      ctx.drawImage(iconImg, 9, 9, iconSize, iconSize);
    }
  }

  const tagText = '#' + bsTag.replace('#', '').toUpperCase();
  const tagFontSize = fitTextSize(ctx, tagText, iconSize + 8, 16, 10, 'Roboto', 'bold');
  ctx.font = `bold ${tagFontSize}px Roboto`;
  ctx.fillStyle = '#f0f0f0'; ctx.textAlign = 'center';
  ctx.fillText(tagText, 9 + iconSize / 2, 9 + iconSize + 18);

  const playerName = bsPlayer?.name || 'Joueur';
  const nameBoxX = iconSize + 18, nameBoxY = 12, nameBoxW = LW - nameBoxX - 10, nameBoxH = 48;
  bsBox(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, '#1a1a3e', '#000', 8);
  const nameFontSize = fitTextSize(ctx, playerName, nameBoxW - 18, 32, 18, 'Lilita');
  ctx.textAlign = 'center';
  drawOutlineText(ctx, playerName, nameBoxX + nameBoxW / 2, nameBoxY + 36, '#44ff44', nameFontSize, 'Lilita', 5);

  const xpPerLevel = 1000;
  const xpProgress = Math.max(0, expPoints % xpPerLevel);
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  bsBox(ctx, nameBoxX, 66, 48, 30, '#3a6bc4', '#000', 6);
  ctx.font = 'bold 16px Roboto'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), nameBoxX + 24, 87);

  const barX = nameBoxX + 54, barY = 72, barW = nameBoxW - 54, barH = 16;
  rr(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = '#141424'; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
  if (xpRatio > 0) {
    const fillW = Math.max(6, Math.round((barW - 4) * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillW, barH - 4, 3);
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, '#6ad6ff'); g.addColorStop(1, '#1d8fff');
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.font = 'bold 11px Roboto'; ctx.fillStyle = '#d8d8d8'; ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 3, barY + 12);

  // ── GRAND PORTRAIT BRAWLER ───────────────────────────
  if (heroBrawlerId) {
    const portrait = await tryImg(`https://cdn.brawlify.com/brawlers/portraits/${heroBrawlerId}.png`);
    if (portrait) {
      const ph = 390;
      const pw = Math.round(ph * portrait.width / portrait.height);
      const px = (LW - pw) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 35; ctx.shadowOffsetY = 12;
      ctx.drawImage(portrait, px, 112, pw, ph);
      ctx.restore();
    }
  }

  // ── NOM + CLUB en bas gauche ─────────────────────────
  const ng = ctx.createLinearGradient(0, H - 140, 0, H);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.35, 'rgba(0,0,0,0.78)');
  ng.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = ng; ctx.fillRect(0, H - 140, LW, 140);

  ctx.textAlign = 'left';
  drawOutlineText(ctx, playerName, 10, H - 58, '#44ff44', 46, 'Lilita', 7);

  const subText = allianceName || bsPlayer?.club?.name || '';
  if (subText) {
    drawOutlineText(ctx, subText, 10, H - 22, '#ff9900', 22, 'Roboto', 5);
  }

  // Badge club/alliance
  const badgeId = allianceBadge || bsPlayer?.club?.badgeId;
  if (badgeId) {
    const cbImg = await tryImg(`https://cdn.brawlify.com/club-badges/regular/${badgeId}.png`);
    if (cbImg) ctx.drawImage(cbImg, LW - 68, H - 68, 58, 58);
  }

  // ══ ZONE DROITE ══════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;
  const trY = 56;
  const trH = 78;

  // Overlay droit légèrement plus opaque que le fond prairie
  drawBSPattern(ctx, RX, 0, RW, H, 'rgba(45, 18, 80, 0.72)', 'rgba(100, 80, 160, 0.18)');

  // ── ICÔNE PROFIL (cercle Trophy Road) ────────────────
  const trophyIconId = firstBattleCardAvatar || profileAvatar || bsPlayer?.icon?.id;
  if (trophyIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${trophyIconId}.png`);
    if (pIcon) {
      const pr = 42, px = RX + 54, py = trY + trH / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(pIcon, px - pr, py - pr, pr * 2, pr * 2);
      ctx.restore();
    }
  }

  // ── TROPHY ROAD ──────────────────────────────────────
  const trX = RX + 108;
  const wsW = 140;
  const trW = RW - 108 - wsW - 14;
  statBox(ctx, trX, trY, trW, trH);
  ctx.font = 'bold 14px Roboto'; ctx.fillStyle = '#aaaaaa'; ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 10, trY + 20);
  drawOutlineText(ctx, fmt(trophies), trX + 10, trY + 68, '#ffffff', 54, 'Lilita', 5);

  // ── WIN STREAK ───────────────────────────────────────
  const wsX = trX + trW + 8;
  statBox(ctx, wsX, trY, wsW, trH);

  // Icône du brawler winstreak si dispo (petit, dans la box)
  if (winstreakBrawlerId) {
    const wsBI = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${winstreakBrawlerId}.png`);
    if (wsBI) ctx.drawImage(wsBI, wsX + 4, trY + trH / 2 - 22, 44, 44);
  }

  ctx.font = 'bold 12px Roboto'; ctx.fillStyle = '#ffaa00'; ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 18);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 32);
  drawOutlineText(ctx, String(maxWS), wsX + wsW / 2, trY + 70, '#ffffff', 44, 'Lilita', 5);

  // ── ACCOUNT CREATED ───────────────────────────────────
  if (creationYear) {
    const acW = 320, acH = 40, acX = W - acW - 14, acY = 10;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#ffffff', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 17px Roboto'; ctx.fillStyle = '#222222'; ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 26);
  }

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 6;
  ctx.fillStyle = '#000000'; ctx.fillRect(RX, curY, RW - 8, 4); curY += 6;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 72;
  const colW = Math.floor((RW - 16) / 3);

  const row2 = [
    { label: 'CURRENT', val: currentElo, sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''), color: curTier.color, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, sub: hiTier.name + (hiTier.sub ? ' ' + hiTier.sub : ''),   color: hiTier.color,  badgeUrl: hiTier.file  ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png`  : null },
    { label: 'RECORDS', val: recordPts,  sub: '',                                                     color: '#ffd700',    badgeUrl: `https://cdn.brawlify.com/records/regular/${recordLevel}.png` },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R2H);
    if (c.badgeUrl) { const b = await tryImg(c.badgeUrl); if (b) ctx.drawImage(b, cx + 4, curY + 4, 60, 60); }
    const tx = cx + 70;
    ctx.font = 'bold 11px Roboto'; ctx.fillStyle = '#aaaaaa'; ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 14);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 50, '#ffffff', 34, 'Lilita', 4);
    if (c.sub) { ctx.font = 'bold 12px Roboto'; ctx.fillStyle = c.color; ctx.fillText(c.sub, tx, curY + 65); }
  }
  curY += R2H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000'; ctx.fillRect(RX, curY, RW - 8, 4); curY += 6;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 60;
  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e74c3c', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: '#aaaaaa', modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#3498db', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R3H);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 4, curY + 2, 52, 52);
    } else {
      const bx = cx + 7, by = curY + 5, sq = 17, gap = 2;
      [[0,0,'#e74c3c'],[sq+gap,0,'#e74c3c'],[0,sq+gap,'#e74c3c'],
       [sq+gap,sq+gap,'#3498db'],[(sq+gap)*2,0,'#3498db'],[(sq+gap)*2,sq+gap,'#3498db']]
        .forEach(([dx, dy, col]) => {
          ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
          ctx.fillRect(bx+dx, by+dy, sq, sq); ctx.strokeRect(bx+dx, by+dy, sq, sq);
        });
      ctx.font = 'bold 10px Roboto'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap/2 + sq/2, by + sq + gap/2 + sq/2 + 3);
    }

    const tx = cx + 64;
    ctx.font = 'bold 11px Roboto'; ctx.fillStyle = c.color; ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 16);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 50, '#ffffff', 32, 'Lilita', 4);
  }
  curY += R3H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000'; ctx.fillRect(RX, curY, RW - 8, 4); curY += 6;

  // ── BRAWLERS + PRESTIGE (bandeau compact fixe) ───────
  const R4H = 104;
  const presW = 138;
  const brawlW = RW - presW - 12;

  statBox(ctx, RX, curY, brawlW, R4H);
  ctx.font = 'bold 13px Roboto'; ctx.fillStyle = '#aaaaaa'; ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 8, curY + 17);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 8, curY + 17);

  // Ligne brawlers avec ordre prioritaire : favorite → winstreak → top par trophées
  const iSz = 46;
  const slotCount = 6;
  const orderedIds = [];
  const usedIds = new Set();

  // 1. favorite
  if (favoriteBrawlerId) { orderedIds.push({ id: favoriteBrawlerId, marker: 'star' }); usedIds.add(favoriteBrawlerId); }
  // 2. winstreak (si différent du favorite)
  if (winstreakBrawlerId && !usedIds.has(winstreakBrawlerId)) { orderedIds.push({ id: winstreakBrawlerId, marker: 'flame' }); usedIds.add(winstreakBrawlerId); }
  // 3. Reste par trophées
  const sortedRnt = [...rntBrawlers].sort((a, b) => Number(b.trophies || 0) - Number(a.trophies || 0));
  const sortedBs  = [...bsBrawlers].sort((a, b) => b.trophies - a.trophies);
  const sortedList = sortedRnt.length ? sortedRnt.map(b => ({ id: Number(b.brawler_id) })) : sortedBs.map(b => ({ id: b.id }));
  for (const b of sortedList) {
    if (orderedIds.length >= slotCount) break;
    if (!usedIds.has(b.id)) { orderedIds.push({ id: b.id, marker: null }); usedIds.add(b.id); }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { id: bId, marker } = orderedIds[i];
    const bx = RX + 8 + i * (iSz + 5);
    const by = curY + 22;
    rr(ctx, bx - 2, by - 2, iSz + 4, iSz + 4, 7);
    ctx.fillStyle = '#2a1050'; ctx.fill();
    ctx.strokeStyle = '#5500aa'; ctx.lineWidth = 1.5; ctx.stroke();
    const bImg = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${bId}.png`);
    if (bImg) ctx.drawImage(bImg, bx, by, iSz, iSz);
    // Marqueur visuel
    if (marker) drawMarker(ctx, bx + iSz - 6, by + 6, marker);
  }

  if (brawlerCount > slotCount) {
    const moreX = RX + 8 + slotCount * (iSz + 5) + 4;
    ctx.font = 'bold 13px Roboto'; ctx.fillStyle = '#d8d8d8'; ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - slotCount} more`, moreX, curY + 22 + iSz / 2 + 6);
  }

  // ── PRESTIGE ─────────────────────────────────────────
  const presX = RX + brawlW + 6;
  statBox(ctx, presX, curY, presW, R4H);

  const presTierFile = Math.min(6, Math.max(0, Math.floor(prestige / 20)));
  const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presTierFile}.png`);
  const badgeSize = Math.min(82, presW - 18);
  const badgeX = presX + (presW - badgeSize) / 2;
  const badgeY = curY + 10;

  if (pImg) ctx.drawImage(pImg, badgeX, badgeY, badgeSize, badgeSize);
  ctx.textAlign = 'center';
  drawOutlineText(ctx, String(prestige), presX + presW / 2, badgeY + badgeSize * 0.58, '#ffffff', 28, 'Lilita', 5);

  ctx.font = 'bold 11px Roboto'; ctx.fillStyle = '#aaaaaa';
  ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 20);
  ctx.font = 'bold 13px Roboto'; ctx.fillStyle = '#9b59b6';
  ctx.fillText('PRESTIGE', presX + presW / 2, curY + R4H - 6);

  // ── DATE ──────────────────────────────────────────────
  ctx.font = 'bold 12px Roboto'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 7, H - 4);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };