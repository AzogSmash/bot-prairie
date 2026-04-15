const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const ASSETS_PATH = path.join(__dirname, '../assets');

registerFont(path.join(ASSETS_PATH, 'Roboto-Bold.ttf'), { family: 'Roboto' });

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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, width, height);

  // ── 3. Avatar en cercle ─────────────────────────────────
  const avatarSize = 100;
  const avatarX = width / 2;
  const avatarY = height / 2 - 30;

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

  // ── 4. Textes selon le type ─────────────────────────────
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (type === 'welcome') {
    // Titre "BIENVENUE DANS LA PRAIRIE"
    ctx.fillStyle = '#000000';
    ctx.font = '32px Roboto';
    ctx.fillText('BIENVENUE DANS LA PRAIRIE', width / 2 + 2, avatarY + avatarSize / 2 + 35);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText('BIENVENUE DANS LA PRAIRIE', width / 2, avatarY + avatarSize / 2 + 33);

    // Pseudo
    ctx.fillStyle = '#000000';
    ctx.font = '24px Roboto';
    ctx.fillText(user.username.toUpperCase(), width / 2 + 2, avatarY + avatarSize / 2 + 65);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(user.username.toUpperCase(), width / 2, avatarY + avatarSize / 2 + 63);

  } else {
    // Titre "À LA PROCHAINE..."
    ctx.fillStyle = '#000000';
    ctx.font = '32px Roboto';
    ctx.fillText('À LA PROCHAINE...', width / 2 + 2, avatarY + avatarSize / 2 + 35);
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('À LA PROCHAINE...', width / 2, avatarY + avatarSize / 2 + 33);

    // Pseudo
    ctx.fillStyle = '#000000';
    ctx.font = '24px Roboto';
    ctx.fillText(user.username.toUpperCase(), width / 2 + 2, avatarY + avatarSize / 2 + 65);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(user.username.toUpperCase(), width / 2, avatarY + avatarSize / 2 + 63);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeImage };