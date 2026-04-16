const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');

// Enregistre la police
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

// Mapping des rangs ranked avec noms de fichiers Brawlify
const RANKED_TIERS = [
  { min: 0, name: 'Bronze', tier: 'I', color: '#cd7f32', file: 'Bronze' },
  { min: 250, name: 'Bronze', tier: 'II', color: '#cd7f32', file: 'Bronze' },
  { min: 500, name: 'Bronze', tier: 'III', color: '#cd7f32', file: 'Bronze' },
  { min: 750, name: 'Silver', tier: 'I', color: '#c0c0c0', file: 'Silver' },
  { min: 1000, name: 'Silver', tier: 'II', color: '#c0c0c0', file: 'Silver' },
  { min: 1250, name: 'Silver', tier: 'III', color: '#c0c0c0', file: 'Silver' },
  { min: 1500, name: 'Gold', tier: 'I', color: '#ffd700', file: 'Gold' },
  { min: 1750, name: 'Gold', tier: 'II', color: '#ffd700', file: 'Gold' },
  { min: 2000, name: 'Gold', tier: 'III', color: '#ffd700', file: 'Gold' },
  { min: 2250, name: 'Diamond', tier: 'I', color: '#00bfff', file: 'Diamond' },
  { min: 2750, name: 'Diamond', tier: 'II', color: '#00bfff', file: 'Diamond' },
  { min: 3250, name: 'Diamond', tier: 'III', color: '#00bfff', file: 'Diamond' },
  { min: 3750, name: 'Mythic', tier: 'I', color: '#e84393', file: 'Mythic' },
  { min: 4250, name: 'Mythic', tier: 'II', color: '#e84393', file: 'Mythic' },
  { min: 4750, name: 'Mythic', tier: 'III', color: '#e84393', file: 'Mythic' },
  { min: 5250, name: 'Legendary', tier: 'I', color: '#e74c3c', file: 'Legendary' },
  { min: 6000, name: 'Legendary', tier: 'II', color: '#e74c3c', file: 'Legendary' },
  { min: 6750, name: 'Legendary', tier: 'III', color: '#e74c3c', file: 'Legendary' },
  { min: 7500, name: 'Masters', tier: 'I', color: '#ff6b35', file: 'Masters' },
  { min: 8500, name: 'Masters', tier: 'II', color: '#ff6b35', file: 'Masters' },
  { min: 9500, name: 'Masters', tier: 'III', color: '#ff6b35', file: 'Masters' },
  { min: 10500, name: 'Pro', tier: '', color: '#f39c12', file: 'Pro' },
];

function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Unranked', tier: '', color: '#95a5a6', file: null };
  for (let i = RANKED_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANKED_TIERS[i].min) return RANKED_TIERS[i];
  }
  return RANKED_TIERS[0];
}

// Fetch depuis l'API rnt.dev
async function fetchRntProfile(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://api.rnt.dev/profile?tag=${cleanTag}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && json.result) {
            resolve(json.result);
          } else {
            reject(new Error('Profil non trouve'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Fetch image depuis URL avec gestion des redirections
async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl) => {
      const protocol = reqUrl.startsWith('https') ? https : require('http');
      protocol.get(reqUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          loadImage(buffer).then(resolve).catch(reject);
        });
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

// Helper pour extraire une stat
function getStat(stats, name) {
  const stat = stats?.find(s => s.name === name);
  return stat?.value || 0;
}

// Dessiner un rectangle arrondi
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Formater les nombres
function formatNumber(num) {
  if (!num) return '0';
  return num.toLocaleString('fr-FR');
}

// Générer la carte de profil
async function generateProfileCard(bsTag) {
  const profile = await fetchRntProfile(bsTag);
  const stats = profile.stats || [];

  const width = 1200;
  const height = 630;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond
  const background = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
  ctx.drawImage(background, 0, 0, width, height);

  // Overlay sombre dégradé
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // ══════════════════════════════════════════════════════════
  // AVATAR
  // ══════════════════════════════════════════════════════════
  const avatarX = 50;
  const avatarY = 45;
  const avatarSize = 130;

  try {
    const iconUrl = `https://cdn.brawlify.com/profile-icons/regular/${profile.profile_avatar}.png`;
    const avatar = await fetchImage(iconUrl);
    
    // Ombre
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    
    // Fond cercle
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Avatar clippé
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Bordure dorée
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch (e) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ══════════════════════════════════════════════════════════
  // INFOS JOUEUR
  // ══════════════════════════════════════════════════════════
  const infoX = avatarX + avatarSize + 25;
  
  // Pseudo
  ctx.font = 'bold 44px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(profile.name || 'Joueur', infoX, avatarY + 45);

  // Tag
  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('#' + (profile.account_tag?.tag?.replace('#', '') || bsTag.replace('#', '')), infoX, avatarY + 80);

  // Club
  const clubName = profile.alliance?.name || 'Sans club';
  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#2ecc71';
  ctx.fillText(clubName, infoX, avatarY + 115);

  // Année création
  const creationYear = getStat(stats, 'AccountCreationYear');
  if (creationYear) {
    ctx.font = 'bold 18px Roboto';
    ctx.fillStyle = '#f39c12';
    ctx.fillText('Compte cree en ' + creationYear, infoX, avatarY + 148);
  }

  // ══════════════════════════════════════════════════════════
  // TROPHÉES (en haut à droite)
  // ══════════════════════════════════════════════════════════
  const trophies = getStat(stats, 'Trophies');
  const highestTrophies = getStat(stats, 'HighestTrophies');

  // Box Trophées
  drawRoundedRect(ctx, 700, 35, 230, 95, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'center';
  ctx.fillText('TROPHEES', 815, 62);
  
  ctx.font = 'bold 38px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(trophies), 815, 108);

  // Box Record
  drawRoundedRect(ctx, 950, 35, 210, 95, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 16px Roboto';
  ctx.fillStyle = '#e74c3c';
  ctx.fillText('RECORD', 1055, 62);
  
  ctx.font = 'bold 38px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(highestTrophies), 1055, 108);

  // ══════════════════════════════════════════════════════════
  // SECTION RANKED (avec badge Brawlify)
  // ══════════════════════════════════════════════════════════
  const rankedY = 170;
  
  drawRoundedRect(ctx, 50, rankedY, 380, 200, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#9b59b6';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 22px Roboto';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9b59b6';
  ctx.fillText('MODE CLASSE', 70, rankedY + 35);

  const currentElo = getStat(stats, 'CurrentRankedPoints');
  const highestElo = getStat(stats, 'HighestRankedPoints');
  const currentTier = getRankedTier(currentElo);
  const highestTier = getRankedTier(highestElo);

  // Badge ranked actuel
  if (currentTier.file) {
    try {
      const badgeUrl = `https://cdn.brawlify.com/ranked/regular/${currentTier.file}.png`;
      const badge = await fetchImage(badgeUrl);
      ctx.drawImage(badge, 70, rankedY + 50, 70, 70);
    } catch (e) {}
  }

  // Elo actuel
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = '#888888';
  ctx.fillText('Actuel', 150, rankedY + 65);
  
  ctx.font = 'bold 30px Roboto';
  ctx.fillStyle = currentTier.color;
  ctx.fillText(formatNumber(currentElo), 150, rankedY + 100);
  
  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(currentTier.name + ' ' + currentTier.tier, 150, rankedY + 125);

  // Badge ranked record
  if (highestTier.file) {
    try {
      const badgeUrl = `https://cdn.brawlify.com/ranked/regular/${highestTier.file}.png`;
      const badge = await fetchImage(badgeUrl);
      ctx.drawImage(badge, 260, rankedY + 50, 70, 70);
    } catch (e) {}
  }

  // Elo record
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = '#888888';
  ctx.fillText('Record', 340, rankedY + 65);
  
  ctx.font = 'bold 30px Roboto';
  ctx.fillStyle = highestTier.color;
  ctx.fillText(formatNumber(highestElo), 340, rankedY + 100);
  
  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(highestTier.name + ' ' + highestTier.tier, 340, rankedY + 125);

  // ══════════════════════════════════════════════════════════
  // SECTION STATISTIQUES
  // ══════════════════════════════════════════════════════════
  const statsX = 450;
  
  drawRoundedRect(ctx, statsX, rankedY, 340, 200, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#3498db';
  ctx.fillText('STATISTIQUES', statsX + 20, rankedY + 35);

  const wins3v3 = getStat(stats, '3vs3Victories');
  const soloWins = getStat(stats, 'SoloVictories');
  const duoWins = getStat(stats, 'DuoVictories');
  const maxWinstreak = profile.max_winstreak || 0;
  const brawlerCount = profile.brawler_count || 0;
  const prestige = getStat(stats, 'Prestige');

  // Colonne gauche
  ctx.font = 'bold 20px Roboto';
  
  ctx.fillStyle = '#e74c3c';
  ctx.fillText('3v3', statsX + 20, rankedY + 75);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(wins3v3), statsX + 80, rankedY + 75);
  
  ctx.fillStyle = '#95a5a6';
  ctx.fillText('Solo', statsX + 20, rankedY + 110);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(soloWins), statsX + 80, rankedY + 110);
  
  ctx.fillStyle = '#3498db';
  ctx.fillText('Duo', statsX + 20, rankedY + 145);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(duoWins), statsX + 80, rankedY + 145);

  // Colonne droite
  ctx.fillStyle = '#f39c12';
  ctx.fillText('Winstreak', statsX + 180, rankedY + 75);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(maxWinstreak), statsX + 300, rankedY + 75);
  
  ctx.fillStyle = '#2ecc71';
  ctx.fillText('Brawlers', statsX + 180, rankedY + 110);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(brawlerCount), statsX + 300, rankedY + 110);
  
  ctx.fillStyle = '#9b59b6';
  ctx.fillText('Prestige', statsX + 180, rankedY + 145);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(prestige), statsX + 300, rankedY + 145);

  // ══════════════════════════════════════════════════════════
  // SECTION RECORDS
  // ══════════════════════════════════════════════════════════
  const recordsX = 810;
  
  drawRoundedRect(ctx, recordsX, rankedY, 350, 200, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#e74c3c';
  ctx.fillText('RECORDS', recordsX + 20, rankedY + 35);

  const recordPoints = getStat(stats, 'RecordPoints');
  const famePoints = getStat(stats, 'FamePoints');
  const challengeWins = getStat(stats, 'ChallengeWins');
  const expLevel = getStat(stats, 'ExpLevel');

  ctx.font = 'bold 20px Roboto';
  
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Points record', recordsX + 20, rankedY + 75);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(recordPoints), recordsX + 180, rankedY + 75);
  
  ctx.fillStyle = '#e84393';
  ctx.fillText('Fame', recordsX + 20, rankedY + 110);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(famePoints), recordsX + 180, rankedY + 110);
  
  ctx.fillStyle = '#00cec9';
  ctx.fillText('Challenges', recordsX + 20, rankedY + 145);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(challengeWins), recordsX + 180, rankedY + 145);

  ctx.fillStyle = '#74b9ff';
  ctx.fillText('Niveau', recordsX + 20, rankedY + 180);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(expLevel), recordsX + 180, rankedY + 180);

  // ══════════════════════════════════════════════════════════
  // VICTOIRES TOTALES (en bas)
  // ══════════════════════════════════════════════════════════
  const totalWins = wins3v3 + soloWins + duoWins;
  const bottomY = rankedY + 220;

  drawRoundedRect(ctx, 50, bottomY, 350, 70, 15);
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#2ecc71';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 18px Roboto';
  ctx.fillStyle = '#2ecc71';
  ctx.textAlign = 'left';
  ctx.fillText('VICTOIRES TOTALES', 70, bottomY + 28);
  
  ctx.font = 'bold 32px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatNumber(totalWins), 70, bottomY + 58);

  // ══════════════════════════════════════════════════════════
  // PRESTIGE BADGE (si disponible)
  // ══════════════════════════════════════════════════════════
  if (prestige > 0 && prestige <= 6) {
    try {
      const prestigeUrl = `https://cdn.brawlify.com/prestiges/regular/${prestige}.png`;
      const prestigeBadge = await fetchImage(prestigeUrl);
      ctx.drawImage(prestigeBadge, 420, bottomY + 5, 60, 60);
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════════════════════
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, height - 50, width, 50);

  ctx.font = 'bold 20px Roboto';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2ecc71';
  ctx.fillText('Prairie Bot  -  Famille de clubs Brawl Stars', width / 2, height - 18);

  // Date
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.font = 'bold 16px Roboto';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#888888';
  ctx.fillText(dateStr, width - 25, height - 18);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };