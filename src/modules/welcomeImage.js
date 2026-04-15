const { createCanvas, loadImage } = require('canvas');
const path = require('path');

const ASSETS_PATH = path.join(__dirname, '../assets');

async function generateWelcomeImage(user, type = 'welcome') {
  const width = 1024;
  const height = 300;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // ── 1. Charger le fond ──────────────────────────────────
  const bgFile = type === 'welcome' ? 'arrivee.png' : 'depart.png';
  const background = await loadImage(path.join(ASSETS_PATH, bgFile));
  ctx.drawImage(background, 0, 0, width, height);

  // ── 2. Overlay sombre pour lisibilité ───────────────────
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);

  // ── 3. Avatar en cercle ─────────────────────────────────
  const avatarSize = 100;
  const avatarX = width / 2;
  const avatarY = height / 2 - 20;

  const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatar = await loadImage(avatarURL);

  // Cercle blanc derrière l'avatar
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.closePath();

  // Clip circulaire pour l'avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  ctx.restore();

  // ── 4. Texte principal ──────────────────────────────────
  const title = type === 'welcome' ? 'BIENVENUE' : 'AU REVOIR';
  const titleColor = type === 'welcome' ? '#2ecc71' : '#e74c3c';

  ctx.fillStyle = titleColor;
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, avatarY + avatarSize / 2 + 40);

  // ── 5. Pseudo ───────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(user.username.toUpperCase(), width / 2, avatarY + avatarSize / 2 + 70);

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeImage };