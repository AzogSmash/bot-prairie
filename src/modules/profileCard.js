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

function getStat(stats, name) {
  return stats?.find(s => s.name === name)?.value || 0;
}

function fmt(n) {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

// Texte avec outline noir épais style BS
function drawOutlineText(ctx, text, x, y, fillColor, fontSize, font, outlineWidth = 6) {
  ctx.font = `${fontSize}px ${font}`;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

// Rectangle arrondi
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

// Box style BS : fond coloré + bordure noire épaisse
function bsBox(ctx, x, y, w, h, bgColor, borderColor = '#000', r = 10) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();
}

// Box stat sombre (les blocs CURRENT/HIGHEST etc.)
function statBox(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 8);
  ctx.fillStyle = '#1a0e35';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// Motif losanges violet style BS
function drawBSPattern(ctx, x, y, w, h, baseColor, lineColor) {
  ctx.save();
  rr(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  // Grille diagonale
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

async function generateProfileCard(bsTag, bsPlayer) {
  let rnt = null;
  try { rnt = await fetchRntProfile(bsTag); } catch (e) { console.error('[Card] RNT:', e.message); }

  const stats = rnt?.stats || [];
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ═══════════════════════════════════════════════════
  // FOND GLOBAL violet foncé avec pattern
  // ═══════════════════════════════════════════════════
  ctx.fillStyle = '#3d1a6e';
  ctx.fillRect(0, 0, W, H);

  // Pattern subtil sur tout le fond
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W + H; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(0, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - i, 0); ctx.lineTo(W, i); ctx.stroke();
  }

  // ═══════════════════════════════════════════════════
  // ZONE GAUCHE (37% de W)
  // ═══════════════════════════════════════════════════
  const LW = 520;
  const brawlers = bsPlayer?.brawlers || [];
  const topBrawler = [...brawlers].sort((a, b) => b.trophies - a.trophies)[0];

  // Fond zone gauche : violet avec motif BS vert/bleu comme la référence
  drawBSPattern(ctx, 0, 0, LW, H, '#2a1050', 'rgba(100, 200, 100, 0.15)');

  // Bordure droite zone gauche
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(LW, 0);
  ctx.lineTo(LW, H);
  ctx.stroke();

  // Ligne de séparation lumineuse
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LW - 1, 0);
  ctx.lineTo(LW - 1, H);
  ctx.stroke();

  // ── HEADER GAUCHE : tag + icône profil ──────────────
  const iconId = bsPlayer?.icon?.id;
  const iconSize = 90;

  // Fond noir tag en haut
  bsBox(ctx, 0, 0, LW, 130, '#1a0a30', '#000000', 0);

  if (iconId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`);
    if (iconImg) {
      // Bordure verte style BS
      bsBox(ctx, 8, 8, iconSize + 4, iconSize + 4, '#2d5a27', '#000', 6);
      ctx.drawImage(iconImg, 10, 10, iconSize, iconSize);
    }
  }

  // Tag — taille adaptative pour éviter la coupure
  const tagText = '#' + bsTag.replace('#', '');
  const maxTagW = LW - 14;
  let tagSize = 22;
  ctx.font = `bold ${tagSize}px Roboto`;
  while (ctx.measureText(tagText).width > maxTagW && tagSize > 13) {
    tagSize--;
    ctx.font = `bold ${tagSize}px Roboto`;
  }
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'left';
  ctx.fillText(tagText, 12, iconSize + 22);

  // Nom dans une box style BS
  bsBox(ctx, iconSize + 18, 18, LW - iconSize - 30, 54, '#1a1a3e', '#000', 8);
  ctx.font = '36px Lilita';
  ctx.textAlign = 'center';
  drawOutlineText(ctx, bsPlayer?.name || 'Joueur', iconSize + 18 + (LW - iconSize - 30) / 2, 60, '#44ff44', 36, 'Lilita', 5);

  // Badge niveau + barre XP
  const expLevel = bsPlayer?.expLevel || getStat(stats, 'ExpLevel') || 1;
  const expPoints = bsPlayer?.expPoints || 0;
  // XP par niveau approximatif (300 par niveau, variable mais ok pour affichage)
  const xpPerLevel = 1000;
  const xpProgress = expPoints % xpPerLevel;
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  // Badge niveau (carré bleu)
  bsBox(ctx, iconSize + 18, 78, 52, 34, '#3a6bc4', '#000', 6);
  ctx.font = 'bold 19px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), iconSize + 18 + 26, 101);

  // Barre XP
  const barX = iconSize + 76, barY = 84, barW = LW - iconSize - 90, barH = 20;
  // Fond barre (gris foncé)
  rr(ctx, barX, barY, barW, barH, 5);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Remplissage bleu clair
  if (xpRatio > 0) {
    const fillW = Math.max(10, Math.round(barW * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillW - 4, barH - 4, 4);
    const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
    barGrad.addColorStop(0, '#4fc3f7');
    barGrad.addColorStop(1, '#0288d1');
    ctx.fillStyle = barGrad;
    ctx.fill();
  }
  // Texte XP à droite de la barre
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 2, barY + barH - 4);

  // ── GRAND PORTRAIT BRAWLER ──────────────────────────
  if (topBrawler) {
    const portrait = await tryImg(`https://cdn.brawlify.com/brawlers/portraits/${topBrawler.id}.png`);
    if (portrait) {
      const ph = 460;
      const pw = Math.round(ph * portrait.width / portrait.height);
      const px = (LW - pw) / 2;
      const py = 130;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(portrait, px, py, pw, ph);
      ctx.restore();
    }
  }

  // ── NOM + SKIN en bas gauche ─────────────────────────
  // Dégradé noir bas
  const ng = ctx.createLinearGradient(0, H - 160, 0, H);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(0.5, 'rgba(0,0,0,0.85)');
  ng.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, H - 160, LW, 160);

  ctx.textAlign = 'left';
  drawOutlineText(ctx, bsPlayer?.name || 'Joueur', 14, H - 70, '#44ff44', 52, 'Lilita', 7);

  const skinName = topBrawler?.skin?.name || topBrawler?.name || '';
  if (skinName) {
    drawOutlineText(ctx, skinName, 14, H - 26, '#ff9900', 26, 'Roboto', 5);
  }

  // ── Badge club brawler (bas gauche) ─────────────────
  const clubBadgeId = bsPlayer?.club?.badgeId;
  if (clubBadgeId) {
    const cbImg = await tryImg(`https://cdn.brawlify.com/club-badges/regular/${clubBadgeId}.png`);
    if (cbImg) ctx.drawImage(cbImg, LW - 80, H - 80, 70, 70);
  }

  // ═══════════════════════════════════════════════════
  // ZONE DROITE
  // ═══════════════════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;

  // Fond zone droite : violet plus clair avec grille
  drawBSPattern(ctx, RX, 0, RW, H, '#4a1f80', 'rgba(100, 80, 160, 0.2)');

  // ── ACCOUNT CREATED (haut droite) ───────────────────
  const creationYear = getStat(stats, 'AccountCreationYear') || rnt?.account_creation_year;
  if (creationYear) {
    const acW = 310, acH = 48, acX = W - acW - 14, acY = 12;
    // Ombre portée
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#ffffff', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 20px Roboto';
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 32);
  }

  // ── TROPHY ROAD + WIN STREAK ─────────────────────────
  const trophies = bsPlayer?.trophies || getStat(stats, 'Trophies') || 0;
  const maxWS = brawlers.reduce((m, b) => Math.max(m, b.maxWinStreak || 0), 0) || 0;

  // Icône profil (cercle)
  const pIconId = bsPlayer?.icon?.id;
  if (pIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${pIconId}.png`);
    if (pIcon) {
      const pr = 52, px = RX + 65, py = 75;
      // Cercle avec bordure rouge style BS
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

  // Trophy Road
  const trX = RX + 132, trY = 18, trW = RW - 132 - 200, trH = 110;
  statBox(ctx, trX, trY, trW, trH);
  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 14, trY + 28);
  drawOutlineText(ctx, fmt(trophies), trX + 14, trY + 96, '#ffffff', 68, 'Lilita', 5);

  // Win Streak
  const wsX = trX + trW + 14, wsW = RW - (wsX - RX) - 8;
  statBox(ctx, wsX, trY, wsW, trH);
  const wsNum = String(maxWS);
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#ffaa00';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 26);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 46);
  drawOutlineText(ctx, wsNum, wsX + wsW / 2, trY + 100, '#ffffff', 58, 'Lilita', 5);

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 8;
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 8;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 100;
  const colW = Math.floor((RW - 24) / 3);

  const currentElo = getStat(stats, 'CurrentRankedPoints') || rnt?.ranked_elo || 0;
  const highestElo = getStat(stats, 'HighestRankedPoints') || rnt?.highest_ranked_elo || 0;
  const recordPts = getStat(stats, 'RecordPoints') || rnt?.record_points || 0;
  const recordTier = getStat(stats, 'RecordTier') || rnt?.record_tier || 7;
  const curTier = getRankedTier(currentElo);
  const hiTier = getRankedTier(highestElo);

  const row2 = [
    { label: 'CURRENT', val: currentElo, sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''), color: curTier.color, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, sub: hiTier.name + (hiTier.sub ? ' ' + hiTier.sub : ''),  color: hiTier.color,  badgeUrl: hiTier.file  ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png`  : null },
    { label: 'RECORDS', val: recordPts,  sub: '',                                                    color: '#ffd700',     badgeUrl: `https://cdn.brawlify.com/records/regular/${recordTier}.png` },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * colW + (i > 0 ? 8 * i : 0);
    statBox(ctx, cx, curY, colW - 4, R2H);

    if (c.badgeUrl) {
      const badge = await tryImg(c.badgeUrl);
      if (badge) ctx.drawImage(badge, cx + 6, curY + 10, 86, 86);
    }

    const tx = cx + 100;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 20);

    drawOutlineText(ctx, fmt(c.val), tx, curY + 68, '#ffffff', 44, 'Lilita', 4);

    if (c.sub) {
      ctx.font = 'bold 16px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 90);
    }
  }

  curY += R2H + 8;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 8;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 82;
  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStat(stats, '3vs3Victories') || 0;
  const soloWins = bsPlayer?.soloVictories || getStat(stats, 'SoloVictories') || 0;
  const duoWins = bsPlayer?.duoVictories || getStat(stats, 'DuoVictories') || 0;

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
      if (mImg) ctx.drawImage(mImg, cx + 6, curY + 6, 64, 64);
    } else {
      // 3v3 : carrés rouge/bleu manuels
      const bx = cx + 10, by = curY + 10, sq = 20, gap = 3;
      const sq3 = [[0,0,'#e74c3c'],[sq+gap,0,'#e74c3c'],[0,sq+gap,'#e74c3c'],
                   [sq+gap,sq+gap,'#3498db'],[(sq+gap)*2,0,'#3498db'],[(sq+gap)*2,sq+gap,'#3498db']];
      sq3.forEach(([dx, dy, c]) => {
        ctx.fillStyle = c;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.fillRect(bx + dx, by + dy, sq, sq);
        ctx.strokeRect(bx + dx, by + dy, sq, sq);
      });
      ctx.font = 'bold 13px Roboto';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap / 2 + sq / 2, by + sq + gap / 2 + sq / 2 + 4);
    }

    const tx = cx + 82;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 22);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 68, '#ffffff', 42, 'Lilita', 4);
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

  // Box brawlers
  statBox(ctx, RX, curY, brawlW, R4H);

  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 12, curY + 26);
  const brawlerCount = brawlers.length || 0;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 12, curY + 26);

  // Icônes brawlers — petits portraits propres
  const topSix = [...brawlers].sort((a, b) => b.trophies - a.trophies).slice(0, 6);
  const iSz = 56;
  for (let i = 0; i < topSix.length; i++) {
    const bx = RX + 12 + i * (iSz + 6);
    const by = curY + 30;
    // Fond sobre arrondi
    rr(ctx, bx - 2, by - 2, iSz + 4, iSz + 4, 8);
    ctx.fillStyle = '#2a1050';
    ctx.fill();
    ctx.strokeStyle = '#5500aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const bImg = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${topSix[i].id}.png`);
    if (bImg) ctx.drawImage(bImg, bx, by, iSz, iSz);
  }

  if (brawlerCount > 6) {
    ctx.font = 'bold 15px Roboto';
    ctx.fillStyle = '#cccccc';
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 6} more`, RX + 12 + 6 * (iSz + 6) + 4, curY + 30 + iSz / 2 + 6);
  }

  // Box Prestige
  const presX = RX + brawlW + 8;
  statBox(ctx, presX, curY, presW, R4H);

  const prestige = getStat(stats, 'Prestige')
    || getStat(stats, 'TotalPrestige')
    || rnt?.prestige
    || rnt?.total_prestige
    || bsPlayer?.totalPrestigeLevel
    || 0;

  // Badge prestige centré en haut
  const presFile = Math.min(Math.max(Math.floor(prestige / 10), 0), 6);
  const pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presFile}.png`);
  const ps = Math.min(presW - 16, R4H - 50);
  if (pImg) {
    ctx.drawImage(pImg, presX + (presW - ps) / 2, curY + 4, ps, ps);
  }
  // Chiffre prestige centré sur le badge
  const prestigeY = curY + 4 + ps * 0.62;
  drawOutlineText(ctx, String(prestige), presX + presW / 2, prestigeY, '#ffffff', 40, 'Lilita', 6);
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 26);
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