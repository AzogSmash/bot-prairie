const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');

// Enregistre la police
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

// Mapping des rangs ranked
const RANKED_TIERS = [
  { min: 0, name: 'Bronze I', color: '#cd7f32' },
  { min: 250, name: 'Bronze II', color: '#cd7f32' },
  { min: 500, name: 'Bronze III', color: '#cd7f32' },
  { min: 750, name: 'Silver I', color: '#c0c0c0' },
  { min: 1000, name: 'Silver II', color: '#c0c0c0' },
  { min: 1250, name: 'Silver III', color: '#c0c0c0' },
  { min: 1500, name: 'Gold I', color: '#ffd700' },
  { min: 1750, name: 'Gold II', color: '#ffd700' },
  { min: 2000, name: 'Gold III', color: '#ffd700' },
  { min: 2250, name: 'Diamond I', color: '#00bfff' },
  { min: 2750, name: 'Diamond II', color: '#00bfff' },
  { min: 3250, name: 'Diamond III', color: '#00bfff' },
  { min: 3750, name: 'Mythic I', color: '#9b59b6' },
  { min: 4250, name: 'Mythic II', color: '#9b59b6' },
  { min: 4750, name: 'Mythic III', color: '#9b59b6' },
  { min: 5250, name: 'Legendary I', color: '#e74c3c' },
  { min: 6000, name: 'Legendary II', color: '#e74c3c' },
  { min: 6750, name: 'Legendary III', color: '#e74c3c' },
  { min: 7500, name: 'Masters I', color: '#8e44ad' },
  { min: 8500, name: 'Masters II', color: '#8e44ad' },
  { min: 9500, name: 'Masters III', color: '#8e44ad' },
  { min: 10500, name: 'Pro', color: '#f39c12' },
];

function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Non classé', color: '#95a5a6' };
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
            reject(new Error('Profil non trouvé'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Fetch image depuis URL
async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        loadImage(buffer).then(resolve).catch(reject);
      });
    }).on('error', reject);
  });
}

// Helper pour extraire une stat
function getStat(stats, name) {
  const stat = stats?.find(s => s.name === name);
  return stat?.value || 0;
}

// Dessiner un rectangle arrondi
function roundRect(ctx, x, y, width, height, radius) {
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

// Générer la carte de profil
async function generateProfileCard(bsTag) {
  // Fetch les données depuis rnt.dev
  const profile = await fetchRntProfile(bsTag);
  const stats = profile.stats || [];

  // Dimensions
  const width = 1774;
  const height = 887;

  // Créer le canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Charger et dessiner le fond
  const background = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
  ctx.drawImage(background, 0, 0, width, height);

  // Overlay semi-transparent pour améliorer la lisibilité
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);

  // === SECTION GAUCHE : Avatar + Infos de base ===
  
  // Cadre pour l'avatar
  const avatarX = 80;
  const avatarY = 80;
  const avatarSize = 200;

  // Charger l'icône de profil
  try {
    const iconUrl = `https://cdn.brawlify.com/profile-icons/regular/${profile.profile_avatar}.png`;
    const avatar = await fetchImage(iconUrl);
    
    // Dessiner cercle pour l'avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Bordure de l'avatar
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();
  } catch (e) {
    // Avatar par défaut si erreur
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pseudo
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Roboto';
  ctx.textAlign = 'left';
  ctx.fillText(profile.name || 'Joueur', avatarX + avatarSize + 40, avatarY + 70);

  // Tag
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 36px Roboto';
  ctx.fillText(profile.account_tag?.tag || bsTag, avatarX + avatarSize + 40, avatarY + 120);

  // Club
  const clubName = profile.alliance?.name || 'Sans club';
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 32px Roboto';
  ctx.fillText(`🌿 ${clubName}`, avatarX + avatarSize + 40, avatarY + 170);

  // Année de création
  const creationYear = getStat(stats, 'AccountCreationYear');
  if (creationYear) {
    ctx.fillStyle = '#f39c12';
    ctx.font = 'bold 28px Roboto';
    ctx.fillText(`Compte créé en ${creationYear}`, avatarX + avatarSize + 40, avatarY + 215);
  }

  // === SECTION CENTRE-HAUT : Trophées ===
  
  const trophyBoxX = 900;
  const trophyBoxY = 60;

  // Box trophées
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, trophyBoxX, trophyBoxY, 380, 140, 20);
  ctx.fill();

  // Trophées actuels
  const trophies = getStat(stats, 'Trophies');
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 28px Roboto';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 TROPHÉES', trophyBoxX + 190, trophyBoxY + 40);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Roboto';
  ctx.fillText(trophies.toLocaleString('fr-FR'), trophyBoxX + 190, trophyBoxY + 110);

  // Record trophées
  const highestTrophies = getStat(stats, 'HighestTrophies');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, trophyBoxX + 400, trophyBoxY, 280, 140, 20);
  ctx.fill();

  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 24px Roboto';
  ctx.fillText('RECORD', trophyBoxX + 540, trophyBoxY + 40);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px Roboto';
  ctx.fillText(highestTrophies.toLocaleString('fr-FR'), trophyBoxX + 540, trophyBoxY + 100);

  // === SECTION CENTRE : Ranked ===
  
  const rankedBoxX = 80;
  const rankedBoxY = 340;

  // Box ranked
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, rankedBoxX, rankedBoxY, 500, 220, 20);
  ctx.fill();

  // Titre
  ctx.fillStyle = '#9b59b6';
  ctx.font = 'bold 32px Roboto';
  ctx.textAlign = 'left';
  ctx.fillText('⚔️ MODE CLASSÉ', rankedBoxX + 30, rankedBoxY + 45);

  // Elo actuel
  const currentElo = getStat(stats, 'CurrentRankedPoints');
  const currentTier = getRankedTier(currentElo);
  
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 24px Roboto';
  ctx.fillText('Actuel', rankedBoxX + 30, rankedBoxY + 90);
  
  ctx.fillStyle = currentTier.color;
  ctx.font = 'bold 40px Roboto';
  ctx.fillText(`${currentElo.toLocaleString('fr-FR')} Elo`, rankedBoxX + 30, rankedBoxY + 135);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Roboto';
  ctx.fillText(currentTier.name, rankedBoxX + 30, rankedBoxY + 175);

  // Elo record
  const highestElo = getStat(stats, 'HighestRankedPoints');
  const highestTier = getRankedTier(highestElo);
  
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 24px Roboto';
  ctx.fillText('Record', rankedBoxX + 280, rankedBoxY + 90);
  
  ctx.fillStyle = highestTier.color;
  ctx.font = 'bold 40px Roboto';
  ctx.fillText(`${highestElo.toLocaleString('fr-FR')} Elo`, rankedBoxX + 280, rankedBoxY + 135);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Roboto';
  ctx.fillText(highestTier.name, rankedBoxX + 280, rankedBoxY + 175);

  // === SECTION DROITE : Stats ===
  
  const statsBoxX = 620;
  const statsBoxY = 340;

  // Box stats
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, statsBoxX, statsBoxY, 550, 220, 20);
  ctx.fill();

  // Titre
  ctx.fillStyle = '#3498db';
  ctx.font = 'bold 32px Roboto';
  ctx.textAlign = 'left';
  ctx.fillText('📊 STATISTIQUES', statsBoxX + 30, statsBoxY + 45);

  // Victoires 3v3
  const wins3v3 = getStat(stats, '3vs3Victories');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Roboto';
  ctx.fillText(`🎮 3v3: ${wins3v3.toLocaleString('fr-FR')}`, statsBoxX + 30, statsBoxY + 100);

  // Solo
  const soloWins = getStat(stats, 'SoloVictories');
  ctx.fillText(`☠️ Solo: ${soloWins.toLocaleString('fr-FR')}`, statsBoxX + 30, statsBoxY + 145);

  // Duo
  const duoWins = getStat(stats, 'DuoVictories');
  ctx.fillText(`👥 Duo: ${duoWins.toLocaleString('fr-FR')}`, statsBoxX + 30, statsBoxY + 190);

  // Winstreak max
  const maxWinstreak = profile.max_winstreak || 0;
  ctx.fillStyle = '#f39c12';
  ctx.fillText(`🔥 Winstreak: ${maxWinstreak}`, statsBoxX + 300, statsBoxY + 100);

  // Brawlers
  const brawlerCount = profile.brawler_count || 0;
  ctx.fillStyle = '#2ecc71';
  ctx.fillText(`🗂️ Brawlers: ${brawlerCount}`, statsBoxX + 300, statsBoxY + 145);

  // Prestige
  const prestige = getStat(stats, 'Prestige');
  ctx.fillStyle = '#9b59b6';
  ctx.fillText(`⭐ Prestige: ${prestige}`, statsBoxX + 300, statsBoxY + 190);

  // === SECTION BAS : Records ===
  
  const recordsBoxX = 1200;
  const recordsBoxY = 340;

  // Box records
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, recordsBoxX, recordsBoxY, 500, 220, 20);
  ctx.fill();

  // Titre
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 32px Roboto';
  ctx.textAlign = 'left';
  ctx.fillText('🏅 RECORDS', recordsBoxX + 30, recordsBoxY + 45);

  // Record points
  const recordPoints = getStat(stats, 'RecordPoints');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Roboto';
  ctx.fillText(`📈 Points: ${recordPoints.toLocaleString('fr-FR')}`, recordsBoxX + 30, recordsBoxY + 100);

  // Fame points
  const famePoints = getStat(stats, 'FamePoints');
  ctx.fillText(`🌟 Fame: ${famePoints.toLocaleString('fr-FR')}`, recordsBoxX + 30, recordsBoxY + 145);

  // Challenge wins
  const challengeWins = getStat(stats, 'ChallengeWins');
  ctx.fillText(`🏆 Challenges: ${challengeWins}`, recordsBoxX + 30, recordsBoxY + 190);

  // === FOOTER : Prairie Bot ===
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  roundRect(ctx, 0, height - 70, width, 70, 0);
  ctx.fill();

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 28px Roboto';
  ctx.textAlign = 'center';
  ctx.fillText('🌿 Prairie Bot • Famille de clubs Brawl Stars', width / 2, height - 25);

  // Date de génération
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 22px Roboto';
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, width - 40, height - 25);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };