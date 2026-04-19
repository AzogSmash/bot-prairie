

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { registerFont } = require('canvas');

const ASSETS = path.resolve(__dirname, '../assets');
registerFont(path.join(ASSETS, 'LilitaOne-Regular.ttf'), { family: 'Lilita One' });
registerFont(path.join(ASSETS, 'Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile, generateProfileCard } = require('../modules/profileCard');

async function main() {
  const inputTag = process.argv[2] || 'P80YQJRL';
  const tag = inputTag.startsWith('#') ? inputTag : `#${inputTag}`;

  try {
    console.log(`[TEST] Récupération joueur ${tag}...`);
    const player = await getPlayer(tag);

    console.log(`[TEST] Récupération RNT ${tag}...`);
    const rnt = await fetchRntProfile(tag).catch(() => null);
    const rntData = rnt?.result || rnt || {};

    console.log('[TEST] Génération image...');
    const buffer = await generateProfileCard(tag, player, rntData);

    const outDir = path.join(__dirname, '../../tmp');
    const outFile = path.join(outDir, 'profile-card-test.png');

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, buffer);

    console.log(`[TEST] Image générée : ${outFile}`);
  } catch (err) {
    console.error('[TEST] Erreur :', err);
  }
}

main();