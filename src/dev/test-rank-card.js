require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const { registerFonts } = require('../services/registerFonts');
const { getPlayer }     = require('../lib/brawlapi');
const { generateRankCard } = require('../modules/rankCard');

registerFonts();

async function main() {
  const inputTag = process.argv[2] || 'P80YQJRL';
  const tag = inputTag.replace(/^#*/, '').toUpperCase();

  console.log(`[TEST] Récupération joueur BS #${tag}...`);
  const bsPlayer = await getPlayer(`#${tag}`);
  console.log(`[TEST] Joueur: ${bsPlayer.name} — ${bsPlayer.brawlers?.length} brawlers`);

  // Données RNT optionnelles — à brancher sur fetchRntProfile si besoin
  const rntData = {
    currentRankedPts: 1250,
    highestRankedPts: 8343,
    recordPoints:     30580,
    totalBrawlers:    bsPlayer.brawlers?.length ?? 0,
    accountCreation:  2018,
    expLevel:         bsPlayer.expLevel ?? 225,
    expProgress:      0.63,
    expCurrent:       1425,
    expMax:           2280,
    famePoints:       0,
    maxWinStreak:     43,
    totalPrestige:    103,
  };

  console.log('[TEST] Génération rank card...');
  const buffer = await generateRankCard(bsPlayer, rntData);

  const outDir = path.join(__dirname, '..', '..', 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'rank-card-test.png');
  fs.writeFileSync(outPath, buffer);
  console.log(`[TEST] Image générée : ${outPath}`);
}

main().catch(err => {
  console.error('[TEST] Erreur :', err);
  process.exit(1);
});