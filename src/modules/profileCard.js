const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');
const http = require('http');

registerFont(path.join(__dirname, '../assets/LilitaOne-Regular.ttf'), { family: 'Lilita' });
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

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
          else reject(new Error('RNT: profil non trouvé'));
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

function getStat(stats, name) {
  return stats?.find(s => s.name === name)?.value || 0;
}

function fmt(n) {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

function drawRR(ctx, x, y, w, h, r) {
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

function drawBox(ctx, x, y, w, h, border = '#444', radius = 12, alpha = 0.82) {
  drawRR(ctx, x, y, w, h, radius);
  ctx.fillStyle = `rgba(10, 8, 25, ${alpha})`;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawDiamondBg(ctx, x, y, w, h, r = 16) {
  ctx.save();
  drawRR(ctx, x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2a0d5c');
  g.addColorStop(0.5, '#180840');
  g.addColorStop(1, '#0c0428');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(130, 70, 220, 0.3)';
  ctx.lineWidth = 1;
  const sz = 42;
  for (let row = -1; row < h / sz + 2; row++) {
    for (let col = -1; col < w / sz + 2; col++) {
      const cx = x + col * sz + (row % 2 === 0 ? 0 : sz / 2);
      const cy = y + row * sz * 0.62;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sz * 0.36);
      ctx.lineTo(cx + sz * 0.46, cy);
      ctx.lineTo(cx, cy + sz * 0.36);
      ctx.lineTo(cx - sz * 0.46, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(160, 100, 255, 0.12)';
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 28) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

async function tryImg(url) {
  try { return await fetchImage(url); } catch { return null; }
}

async function generateProfileCard(bsTag, bsPlayer) {
  let rnt = null;
  try { rnt = await fetchRntProfile(bsTag); } catch (e) { console.error('[ProfileCard] RNT:', e.message); }

  const stats = rnt?.stats || [];
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // FOND
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
    ctx.drawImage(bg, 0, 0, W, H);
  } catch {
    ctx.fillStyle = '#0c0428';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(4, 2, 16, 0.5)';
  ctx.fillRect(0, 0, W, H);

  // ══ ZONE GAUCHE ══════════════════════════════════════════
  const LW = 430, PAD = 18;
  drawDiamondBg(ctx, PAD, PAD, LW, H - PAD * 2);
  ctx.strokeStyle = 'rgba(160, 90, 255, 0.8)';
  ctx.lineWidth = 3;
  drawRR(ctx, PAD, PAD, LW, H - PAD * 2, 16);
  ctx.stroke();

  // Portrait brawler
  const brawlers = bsPlayer?.brawlers || [];
  const topBrawler = [...brawlers].sort((a, b) => b.trophies - a.trophies)[0];
  if (topBrawler) {
    const portrait = await tryImg(`https://cdn.brawlify.com/brawlers/portraits/${topBrawler.id}.png`);
    if (portrait) {
      const ph = H - PAD * 2 - 150;
      const pw = Math.round(ph * (portrait.width / portrait.height));
      const px = PAD + (LW - pw) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(200, 120, 255, 0.5)';
      ctx.shadowBlur = 45;
      ctx.drawImage(portrait, px, PAD + 10, pw, ph);
      ctx.restore();
    }
  }

  // Gradient bas
  const ng = ctx.createLinearGradient(PAD, H - 210, PAD, H - PAD);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.4, 'rgba(0,0,0,0.8)');
  ng.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.save();
  drawRR(ctx, PAD, H - 210, LW, 192, 16);
  ctx.clip();
  ctx.fillStyle = ng;
  ctx.fillRect(PAD, H - 210, LW, 192);
  ctx.restore();

  // Nom
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 10;
  ctx.font = '54px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(bsPlayer?.name || rnt?.name || 'Joueur', PAD + 18, H - 108);
  ctx.shadowBlur = 0;

  const skinName = topBrawler?.skin?.name || topBrawler?.name || '';
  if (skinName) {
    ctx.font = 'bold 22px Roboto';
    ctx.fillStyle = '#f39c12';
    ctx.fillText(skinName, PAD + 18, H - 74);
  }

  ctx.font = 'bold 20px Roboto';
  ctx.fillStyle = 'rgba(200,170,255,0.85)';
  ctx.fillText(bsPlayer?.tag || ('#' + bsTag.replace('#', '')), PAD + 18, H - 46);

  // Séparateur
  ctx.strokeStyle = 'rgba(160, 90, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LW + PAD + 14, PAD + 20);
  ctx.lineTo(LW + PAD + 14, H - PAD - 20);
  ctx.stroke();

  // ══ ZONE DROITE ══════════════════════════════════════════
  const RX = LW + PAD * 2 + 18;
  const RW = W - RX - PAD;
  let curY = PAD;

  // ── ROW 1 : Icône profil + Trophy Road + Win Streak ──
  const R1H = 118;

  // Icône profil
  const iconId = bsPlayer?.icon?.id;
  if (iconId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`);
    if (iconImg) {
      const ir = 50, ix = RX + ir + 4, iy = curY + R1H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ix, iy, ir, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(iconImg, ix - ir, iy - ir, ir * 2, ir * 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(200,170,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ix, iy, ir, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Trophy Road
  const trophyX = RX + 114;
  const wsW = 165;
  const trophyW = RW - 114 - wsW - 12;
  drawBox(ctx, trophyX, curY, trophyW, R1H, '#ffd700');
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trophyX + 14, curY + 26);
  const trophies = bsPlayer?.trophies || getStat(stats, 'Trophies') || 0;
  ctx.font = '64px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(trophies), trophyX + 14, curY + 103);

  // Win Streak
  const wsX = trophyX + trophyW + 8;
  drawBox(ctx, wsX, curY, wsW, R1H, '#f39c12');
  const maxWS = brawlers.reduce((m, b) => Math.max(m, b.maxWinStreak || 0), 0) || getStat(stats, 'MaxWinStreak') || 0;
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#f39c12';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, curY + 22);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, curY + 40);
  ctx.font = '52px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(maxWS), wsX + wsW / 2, curY + 100);

  // Account Created
  const creationYear = getStat(stats, 'AccountCreationYear') || rnt?.account_creation_year;
  if (creationYear) {
    const acW = 290, acH = 36;
    drawBox(ctx, W - acW - PAD, PAD, acW, acH, 'rgba(200,170,255,0.4)', 8, 0.65);
    ctx.font = 'bold 16px Roboto';
    ctx.fillStyle = '#ccbbff';
    ctx.textAlign = 'center';
    ctx.fillText(`COMPTE CRÉÉ EN ${creationYear}`, W - PAD - acW / 2, PAD + 24);
  }

  curY += R1H + 10;

  // ── ROW 2 : CURRENT / HIGHEST / RECORDS ──────────────
  const R2H = 112;
  const colW = Math.floor(RW / 3) - 5;

  const currentElo = getStat(stats, 'CurrentRankedPoints') || rnt?.ranked_elo || 0;
  const highestElo = getStat(stats, 'HighestRankedPoints') || rnt?.highest_ranked_elo || 0;
  const recordPoints = getStat(stats, 'RecordPoints') || rnt?.record_points || 0;
  const recordTier = getStat(stats, 'RecordTier') || rnt?.record_tier || 7;
  const curTier = getRankedTier(currentElo);
  const hiTier = getRankedTier(highestElo);

  const row2 = [
    { label: 'CURRENT', val: currentElo, tier: curTier, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, tier: hiTier,  badgeUrl: hiTier.file  ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png`  : null },
    { label: 'RECORDS', val: recordPoints, tier: null,  badgeUrl: `https://cdn.brawlify.com/records/regular/${recordTier}.png`, color: '#ffd700' },
  ];

  for (let i = 0; i < 3; i++) {
    const col = row2[i];
    const cx = RX + i * (colW + 8);
    const bc = col.tier?.color || col.color || '#ffd700';
    drawBox(ctx, cx, curY, colW, R2H, bc);

    if (col.badgeUrl) {
      const badge = await tryImg(col.badgeUrl);
      if (badge) ctx.drawImage(badge, cx + 6, curY + 10, 82, 82);
    }

    const tx = cx + 96;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = bc;
    ctx.textAlign = 'left';
    ctx.fillText(col.label, tx, curY + 22);

    ctx.font = '46px Lilita';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmt(col.val), tx, curY + 76);

    if (col.tier) {
      ctx.font = 'bold 16px Roboto';
      ctx.fillStyle = col.tier.color;
      ctx.fillText(`${col.tier.name}${col.tier.sub ? ' ' + col.tier.sub : ''}`, tx, curY + 100);
    }
  }

  curY += R2H + 10;

  // ── ROW 3 : 3v3 / SOLO / DUO ─────────────────────────
  const R3H = 98;
  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStat(stats, '3vs3Victories') || 0;
  const soloWins = bsPlayer?.soloVictories || getStat(stats, 'SoloVictories') || 0;
  const duoWins = bsPlayer?.duoVictories || getStat(stats, 'DuoVictories') || 0;

  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e74c3c', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: '#95a5a6', modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#3498db', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const col = row3[i];
    const cx = RX + i * (colW + 8);
    drawBox(ctx, cx, curY, colW, R3H, col.color);

    if (col.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${col.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 8, curY + 8, 74, 74);
    } else {
      // 3v3 dessiné manuellement
      const bx = cx + 10, by = curY + 16, sq = 20;
      [[0,0,'#e74c3c'],[sq+3,0,'#e74c3c'],[0,sq+3,'#e74c3c'],
       [sq+3,sq+3,'#3498db'],[(sq+3)*2,0,'#3498db'],[(sq+3)*2,sq+3,'#3498db']]
        .forEach(([dx,dy,c]) => { ctx.fillStyle=c; ctx.fillRect(bx+dx, by+dy, sq, sq); });
    }

    const tx = cx + 94;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = col.color;
    ctx.textAlign = 'left';
    ctx.fillText(col.label, tx, curY + 24);
    ctx.font = '44px Lilita';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmt(col.val), tx, curY + 80);
  }

  curY += R3H + 10;

  // ── ROW 4 : BRAWLERS + PRESTIGE ───────────────────────
  const R4H = H - curY - PAD;
  const presW = 155;
  const brawlW = RW - presW - 8;

  drawBox(ctx, RX, curY, brawlW, R4H, 'rgba(150,80,255,0.6)');
  const brawlerCount = brawlers.length || rnt?.brawler_count || 0;
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#ccbbff';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 12, curY + 24);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 12, curY + 24);

  const topSix = [...brawlers].sort((a, b) => b.trophies - a.trophies).slice(0, 6);
  const iSz = Math.min(66, Math.floor((brawlW - 24) / 7.2));
  for (let i = 0; i < topSix.length; i++) {
    const bx = RX + 12 + i * (iSz + 6);
    const by = curY + 32;
    drawRR(ctx, bx, by, iSz, iSz + 6, 9);
    ctx.fillStyle = 'rgba(80, 40, 140, 0.7)';
    ctx.fill();
    const bImg = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${topSix[i].id}.png`);
    if (bImg) ctx.drawImage(bImg, bx, by, iSz, iSz);
  }
  if (brawlerCount > 6) {
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = '#ccbbff';
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 6} more`, RX + 12 + 6 * (iSz + 6) + 4, curY + 32 + iSz / 2 + 6);
  }

  // Prestige
  const presX = RX + brawlW + 8;
  drawBox(ctx, presX, curY, presW, R4H, '#9b59b6');
  const prestige = getStat(stats, 'Prestige') || rnt?.prestige || 0;
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#9b59b6';
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL', presX + presW / 2, curY + 20);
  ctx.fillText('PRESTIGE', presX + presW / 2, curY + 35);
  ctx.font = '42px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(prestige), presX + presW / 2, curY + 76);
  const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${Math.min(Math.max(prestige, 0), 6)}.png`);
  if (pImg) ctx.drawImage(pImg, presX + presW / 2 - 30, curY + 82, 60, 60);

  // FOOTER
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = 'rgba(200,170,255,0.4)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - PAD - 4, H - 5);
  ctx.textAlign = 'left';
  ctx.fillText('Prairie Bot', PAD + 4, H - 5);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };