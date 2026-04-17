const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');
const http = require('http');

// Polices
registerFont(path.join(__dirname, '../assets/LilitaOne-Regular.ttf'), { family: 'Lilita' });
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

// Barème ranked actuel
const RANKED_TIERS = [
  { min: 0,     name: 'Bronze',    tier: 'I',   color: '#cd7f32', file: 'Bronze_1' },
  { min: 250,   name: 'Bronze',    tier: 'II',  color: '#cd7f32', file: 'Bronze_2' },
  { min: 500,   name: 'Bronze',    tier: 'III', color: '#cd7f32', file: 'Bronze_3' },
  { min: 750,   name: 'Silver',    tier: 'I',   color: '#c0c0c0', file: 'Silver_1' },
  { min: 1000,  name: 'Silver',    tier: 'II',  color: '#c0c0c0', file: 'Silver_2' },
  { min: 1250,  name: 'Silver',    tier: 'III', color: '#c0c0c0', file: 'Silver_3' },
  { min: 1500,  name: 'Gold',      tier: 'I',   color: '#ffd700', file: 'Gold_1' },
  { min: 1750,  name: 'Gold',      tier: 'II',  color: '#ffd700', file: 'Gold_2' },
  { min: 2000,  name: 'Gold',      tier: 'III', color: '#ffd700', file: 'Gold_3' },
  { min: 2250,  name: 'Diamond',   tier: 'I',   color: '#00bfff', file: 'Diamond_1' },
  { min: 2750,  name: 'Diamond',   tier: 'II',  color: '#00bfff', file: 'Diamond_2' },
  { min: 3250,  name: 'Diamond',   tier: 'III', color: '#00bfff', file: 'Diamond_3' },
  { min: 3750,  name: 'Mythic',    tier: 'I',   color: '#e84393', file: 'Mythic_1' },
  { min: 4250,  name: 'Mythic',    tier: 'II',  color: '#e84393', file: 'Mythic_2' },
  { min: 4750,  name: 'Mythic',    tier: 'III', color: '#e84393', file: 'Mythic_3' },
  { min: 5250,  name: 'Legendary', tier: 'I',   color: '#e74c3c', file: 'Legendary_1' },
  { min: 6000,  name: 'Legendary', tier: 'II',  color: '#e74c3c', file: 'Legendary_2' },
  { min: 6750,  name: 'Legendary', tier: 'III', color: '#e74c3c', file: 'Legendary_3' },
  { min: 7500,  name: 'Masters',   tier: 'I',   color: '#ff6b35', file: 'Masters_1' },
  { min: 8500,  name: 'Masters',   tier: 'II',  color: '#ff6b35', file: 'Masters_2' },
  { min: 9500,  name: 'Masters',   tier: 'III', color: '#ff6b35', file: 'Masters_3' },
  { min: 10500, name: 'Pro',       tier: '',    color: '#f1c40f', file: 'Pro' },
];

function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Unranked', tier: '', color: '#95a5a6', file: null };
  for (let i = RANKED_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANKED_TIERS[i].min) return RANKED_TIERS[i];
  }
  return RANKED_TIERS[0];
}

async function fetchRntProfile(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://api.rnt.dev/profile?tag=${cleanTag}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && json.result) resolve(json.result);
          else reject(new Error('Profil non trouvé'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl) => {
      const proto = reqUrl.startsWith('https') ? https : http;
      proto.get(reqUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return makeRequest(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => loadImage(Buffer.concat(chunks)).then(resolve).catch(reject));
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

function getStat(stats, name) {
  return stats?.find(s => s.name === name)?.value || 0;
}

function fmt(num) {
  if (!num && num !== 0) return '0';
  return Number(num).toLocaleString('fr-FR');
}

function drawRoundedRect(ctx, x, y, w, h, r) {
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

// Dessine une box avec fond semi-transparent + bordure colorée
function drawBox(ctx, x, y, w, h, borderColor, r = 14) {
  drawRoundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(10, 8, 20, 0.82)';
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

// Dessine le fond violet losangé style BS
function drawDiamondBg(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  drawRoundedRect(ctx, x, y, w, h, 16);
  ctx.clip();

  // Fond dégradé violet
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#2d0a5e');
  grad.addColorStop(0.5, '#1a0840');
  grad.addColorStop(1, '#0d0528');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Grille de losanges
  ctx.strokeStyle = 'rgba(120, 60, 200, 0.35)';
  ctx.lineWidth = 1;
  const size = 40;
  for (let row = -1; row < h / size + 2; row++) {
    for (let col = -1; col < w / size + 2; col++) {
      const cx = x + col * size + (row % 2 === 0 ? 0 : size / 2);
      const cy = y + row * size * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.35);
      ctx.lineTo(cx + size * 0.45, cy);
      ctx.lineTo(cx, cy + size * 0.35);
      ctx.lineTo(cx - size * 0.45, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Lignes diagonales lumineuses
  ctx.strokeStyle = 'rgba(160, 100, 255, 0.15)';
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 30) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }

  ctx.restore();
}

async function generateProfileCard(bsTag, bsPlayer) {
  // Fetch RNT
  let rnt = null;
  try { rnt = await fetchRntProfile(bsTag); } catch (e) { console.error('[ProfileCard] RNT error:', e.message); }

  const stats = rnt?.stats || [];
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── FOND GLOBAL ──────────────────────────────────────────────────────────
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
    ctx.drawImage(bg, 0, 0, W, H);
  } catch {
    ctx.fillStyle = '#0d0528';
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay pour assombrir
  ctx.fillStyle = 'rgba(5, 2, 18, 0.55)';
  ctx.fillRect(0, 0, W, H);

  // ── ZONE GAUCHE : fond losangé ──────────────────────────────────────────
  const leftW = 420;
  drawDiamondBg(ctx, 18, 18, leftW, H - 36);

  // Bordure gauche
  ctx.strokeStyle = 'rgba(150, 80, 255, 0.7)';
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, 18, 18, leftW, H - 36, 16);
  ctx.stroke();

  // ── BRAWLER FAVORI (grand visuel central gauche) ──────────────────────
  const brawlers = bsPlayer?.brawlers || [];
  const topBrawler = [...brawlers].sort((a, b) => b.trophies - a.trophies)[0];

  if (topBrawler) {
    try {
      const brawlerUrl = `https://cdn.brawlify.com/brawlers/borderless/${topBrawler.id}.png`;
      const brawlerImg = await fetchImage(brawlerUrl);
      // Grand brawler centré
      const bSize = 340;
      const bx = 18 + (leftW - bSize) / 2 - 10;
      const by = H / 2 - bSize / 2 - 30;
      ctx.save();
      ctx.shadowColor = 'rgba(180, 100, 255, 0.5)';
      ctx.shadowBlur = 40;
      ctx.drawImage(brawlerImg, bx, by, bSize, bSize);
      ctx.restore();
    } catch (e) {}
  }

  // ── NOM JOUEUR + TAG en bas de la zone gauche ─────────────────────────
  const playerName = bsPlayer?.name || rnt?.name || 'Joueur';
  const playerTag = bsPlayer?.tag || ('#' + bsTag.replace('#', ''));
  const skinName = topBrawler?.skin?.name || topBrawler?.name || '';

  // Fond gradient bas
  const nameGrad = ctx.createLinearGradient(18, H - 180, 18, H - 36);
  nameGrad.addColorStop(0, 'rgba(0,0,0,0)');
  nameGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.save();
  drawRoundedRect(ctx, 18, H - 180, leftW, 144, 16);
  ctx.clip();
  ctx.fillStyle = nameGrad;
  ctx.fillRect(18, H - 180, leftW, 144);
  ctx.restore();

  ctx.font = '52px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillText(playerName, 35, H - 100);
  ctx.shadowBlur = 0;

  if (skinName) {
    ctx.font = 'bold 22px Roboto';
    ctx.fillStyle = '#f39c12';
    ctx.fillText(skinName, 35, H - 68);
  }

  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = 'rgba(200,180,255,0.85)';
  ctx.fillText(playerTag, 35, H - 42);

  // ── LIGNE VERTICALE SÉPARATRICE ─────────────────────────────────────
  ctx.strokeStyle = 'rgba(150, 80, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftW + 18 + 12, 30);
  ctx.lineTo(leftW + 18 + 12, H - 30);
  ctx.stroke();

  // ── ZONE DROITE ───────────────────────────────────────────────────────
  const rx = leftW + 50;
  const rw = W - rx - 18;

  // ── HEADER DROITE : Nom + Account Created + icône profil ─────────────
  const profileIconId = bsPlayer?.icon?.id || rnt?.profile_avatar;
  if (profileIconId) {
    try {
      const iconUrl = `https://cdn.brawlify.com/profile-icons/regular/${profileIconId}.png`;
      const iconImg = await fetchImage(iconUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(rx + 55, 75, 52, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(iconImg, rx + 3, 23, 104, 104);
      ctx.restore();
      ctx.strokeStyle = 'rgba(200, 180, 255, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx + 55, 75, 52, 0, Math.PI * 2);
      ctx.stroke();
    } catch (e) {}
  }

  // Account Created
  const creationYear = getStat(stats, 'AccountCreationYear') || rnt?.account_creation_year;
  if (creationYear) {
    drawBox(ctx, W - 350, 22, 328, 50, 'rgba(200,180,255,0.4)', 10);
    ctx.font = 'bold 20px Roboto';
    ctx.fillStyle = '#ccbbff';
    ctx.textAlign = 'center';
    ctx.fillText(`COMPTE CRÉÉ EN ${creationYear}`, W - 186, 54);
  }

  // ── TROPHY ROAD + WIN STREAK ─────────────────────────────────────────
  const trophyY = 22;
  const trophyX = rx + 125;

  // Box Trophy Road
  drawBox(ctx, trophyX, trophyY, 420, 106, '#ffd700');

  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trophyX + 18, trophyY + 28);

  const trophies = bsPlayer?.trophies || getStat(stats, 'Trophies');
  ctx.font = '60px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(trophies), trophyX + 18, trophyY + 94);

  // Box Win Streak
  const wsX = trophyX + 430;
  drawBox(ctx, wsX, trophyY, 170, 106, '#f39c12');
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#f39c12';
  ctx.textAlign = 'center';
  ctx.fillText('WIN STREAK', wsX + 85, trophyY + 28);
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#f39c12';
  ctx.fillText('MAX', wsX + 85, trophyY + 50);

  const maxWinStreak = brawlers.reduce((max, b) => Math.max(max, b.maxWinStreak || 0), 0)
    || getStat(stats, 'MaxWinStreak');
  ctx.font = '52px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(maxWinStreak), wsX + 85, trophyY + 100);

  // ── RANKED : CURRENT / HIGHEST / RECORDS ─────────────────────────────
  const rankedY = trophyY + 120;
  const rankedH = 120;
  const rankedBoxW = (rw - 20) / 3;

  const currentElo = getStat(stats, 'CurrentRankedPoints') || rnt?.ranked_elo || 0;
  const highestElo = getStat(stats, 'HighestRankedPoints') || rnt?.highest_ranked_elo || 0;
  const recordPoints = getStat(stats, 'RecordPoints') || rnt?.record_points || 0;
  const currentTier = getRankedTier(currentElo);
  const highestTier = getRankedTier(highestElo);

  // Box CURRENT
  drawBox(ctx, rx, rankedY, rankedBoxW - 8, rankedH, currentTier.color);
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = currentTier.color;
  ctx.textAlign = 'left';
  ctx.fillText('CURRENT', rx + 90, rankedY + 24);
  ctx.font = '46px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(currentElo), rx + 90, rankedY + 75);
  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = currentTier.color;
  ctx.fillText(`${currentTier.name} ${currentTier.tier}`, rx + 90, rankedY + 105);

  // Badge ranked current
  if (currentTier.file) {
    try {
      const badgeUrl = `https://cdn.brawlify.com/ranked/regular/${currentTier.file}.png`;
      const badge = await fetchImage(badgeUrl);
      ctx.drawImage(badge, rx + 8, rankedY + 15, 78, 78);
    } catch (e) {}
  }

  // Box HIGHEST
  const hx = rx + rankedBoxW;
  drawBox(ctx, hx, rankedY, rankedBoxW - 8, rankedH, highestTier.color);
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = highestTier.color;
  ctx.textAlign = 'left';
  ctx.fillText('HIGHEST', hx + 90, rankedY + 24);
  ctx.font = '46px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(highestElo), hx + 90, rankedY + 75);
  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = highestTier.color;
  ctx.fillText(`${highestTier.name} ${highestTier.tier}`, hx + 90, rankedY + 105);

  if (highestTier.file) {
    try {
      const badgeUrl = `https://cdn.brawlify.com/ranked/regular/${highestTier.file}.png`;
      const badge = await fetchImage(badgeUrl);
      ctx.drawImage(badge, hx + 8, rankedY + 15, 78, 78);
    } catch (e) {}
  }

  // Box RECORDS
  const recx = rx + rankedBoxW * 2;
  drawBox(ctx, recx, rankedY, rankedBoxW - 8, rankedH, '#ffd700');
  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.fillText('RECORDS', recx + 90, rankedY + 24);
  ctx.font = '46px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(recordPoints), recx + 90, rankedY + 75);

  // Badge records (prestige icon)
  const prestige = getStat(stats, 'Prestige') || rnt?.prestige || 0;
  try {
    const recBadgeUrl = `https://cdn.brawlify.com/ranked/regular/Gold_3.png`; // fallback gold badge
    const recBadge = await fetchImage(recBadgeUrl);
    ctx.drawImage(recBadge, recx + 8, rankedY + 15, 78, 78);
  } catch (e) {}

  // ── 3v3 / SOLO / DUO WINS ─────────────────────────────────────────────
  const winsY = rankedY + rankedH + 14;
  const winsH = 100;
  const winsBoxW = (rw - 20) / 3;

  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStat(stats, '3vs3Victories');
  const soloWins = bsPlayer?.soloVictories || getStat(stats, 'SoloVictories');
  const duoWins = bsPlayer?.duoVictories || getStat(stats, 'DuoVictories');

  const winsData = [
    { label: '3 VS 3 WINS', value: wins3v3, color: '#e74c3c', icon: null },
    { label: 'SOLO WINS',   value: soloWins, color: '#95a5a6', icon: null },
    { label: 'DUO WINS',    value: duoWins,  color: '#3498db', icon: null },
  ];

  for (let i = 0; i < 3; i++) {
    const wx = rx + i * winsBoxW;
    const wd = winsData[i];
    drawBox(ctx, wx, winsY, winsBoxW - 8, winsH, wd.color);

    ctx.font = 'bold 15px Roboto';
    ctx.fillStyle = wd.color;
    ctx.textAlign = 'left';
    ctx.fillText(wd.label, wx + 18, winsY + 26);

    ctx.font = '44px Lilita';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmt(wd.value), wx + 18, winsY + 82);
  }

  // ── BRAWLERS + PRESTIGE ───────────────────────────────────────────────
  const brawlersY = winsY + winsH + 14;
  const brawlersH = H - brawlersY - 36;

  // Box brawlers
  const brawlerBoxW = rw - 200;
  drawBox(ctx, rx, brawlersY, brawlerBoxW, brawlersH, 'rgba(150,80,255,0.6)');

  const brawlerCount = brawlers.length || rnt?.brawler_count || 0;
  const totalBrawlers = brawlerCount;

  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#ccbbff';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', rx + 18, brawlersY + 28);

  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, rx + brawlerBoxW - 18, brawlersY + 28);

  // Icônes des 6 premiers brawlers
  const topBrawlers = [...brawlers].sort((a, b) => b.trophies - a.trophies).slice(0, 6);
  const iconSize = Math.min(60, (brawlerBoxW - 40) / 7);
  for (let i = 0; i < topBrawlers.length; i++) {
    const bx = rx + 18 + i * (iconSize + 8);
    const by = brawlersY + 38;
    try {
      const burl = `https://cdn.brawlify.com/brawlers/borderless/${topBrawlers[i].id}.png`;
      const bimg = await fetchImage(burl);
      // Fond violet
      drawRoundedRect(ctx, bx, by, iconSize, iconSize + 10, 8);
      ctx.fillStyle = 'rgba(80, 40, 140, 0.7)';
      ctx.fill();
      ctx.drawImage(bimg, bx, by, iconSize, iconSize);
    } catch (e) {
      drawRoundedRect(ctx, bx, by, iconSize, iconSize, 8);
      ctx.fillStyle = 'rgba(80, 40, 140, 0.7)';
      ctx.fill();
    }
  }

  if (topBrawlers.length > 6) {
    const moreX = rx + 18 + 6 * (iconSize + 8);
    ctx.font = 'bold 16px Roboto';
    ctx.fillStyle = '#ccbbff';
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 6} more`, moreX, brawlersY + 70);
  }

  // Box Prestige
  const presX = rx + brawlerBoxW + 12;
  const presW = rw - brawlerBoxW - 12;
  drawBox(ctx, presX, brawlersY, presW, brawlersH, '#9b59b6');

  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = '#9b59b6';
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL', presX + presW / 2, brawlersY + 28);
  ctx.fillText('PRESTIGE', presX + presW / 2, brawlersY + 48);

  ctx.font = '48px Lilita';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(prestige), presX + presW / 2, brawlersY + 100);

  // Badge prestige
  try {
    const prestigeFile = Math.min(prestige, 6);
    if (prestigeFile > 0) {
      const pUrl = `https://cdn.brawlify.com/prestiges/regular/${prestigeFile}.png`;
      const pImg = await fetchImage(pUrl);
      ctx.drawImage(pImg, presX + presW / 2 - 28, brawlersY + 105, 56, 56);
    }
  } catch (e) {}

  // ── DATE + WATERMARK ─────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = 'rgba(200,180,255,0.5)';
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 22, H - 10);

  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = 'rgba(200,180,255,0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('Prairie Bot', 22, H - 10);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };