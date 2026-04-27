require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const { registerFonts } = require('../services/registerFonts');
const { getPlayer }     = require('../lib/brawlapi');
const { generateRankCard } = require('../modules/rankCard');
const { fetchRntProfile } = require('../lib/rntapi');
registerFonts();

async function main() {
  const inputTag = process.argv[2] || 'P80YQJRL';
  const tag = inputTag.replace(/^#*/, '').toUpperCase();

  console.log(`[TEST] Récupération joueur BS #${tag}...`);
  const bsPlayer = await getPlayer(`#${tag}`);
  console.log(`[TEST] Joueur: ${bsPlayer.name} — ${bsPlayer.brawlers?.length} brawlers`);

// Remplace le rntData hardcodé par :
const rnt = await fetchRntProfile(`#${tag}`);
const rntResult = rnt?.result || rnt || {};

const rntData = {
  currentRankedPts: rntResult.stats?.find(s => s.id === 24)?.value ?? 0,
  currentRankedName: bsPlayer.rankedRankName ?? '',
  highestRankedPts: rntResult.stats?.find(s => s.id === 25)?.value ?? 0,
  highestRankedName: bsPlayer.highestAllTimeRankedRankName ?? '',
  recordPoints: rntResult.stats?.find(s => s.id === 31)?.value ?? 0,
  recordLevel: rntResult.stats?.find(s => s.id === 32)?.value ?? 0,
  totalBrawlers: bsPlayer.brawlers?.length ?? 0,
  accountCreation: rntResult.stats?.find(s => s.id === 27)?.value ?? null,
  maxWinStreak: rntResult.max_winstreak ?? 0,
  totalPrestige: bsPlayer.totalPrestigeLevel ?? 0,
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