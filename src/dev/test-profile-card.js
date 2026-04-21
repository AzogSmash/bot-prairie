require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile } = require('../modules/profileCard');
const { renderProfileCard } = require('../modules/profileCardExact');

async function main() {
  const inputTag = process.argv[2] || 'P80YQJRL';
  const tag = inputTag.startsWith('#') ? inputTag : `#${inputTag}`;

  try {
    console.log(`[TEST] Récupération joueur BS ${tag}...`);
    const bsPlayer = await getPlayer(tag);

    console.log(`[TEST] Récupération joueur RNT ${tag}...`);
    const rnt = await fetchRntProfile(tag).catch(() => null);
    const rntData = rnt?.result || rnt || {};

    console.log('[TEST] Génération image exacte...');
    const buffer = await renderProfileCard({
      player: rntData,
      club: bsPlayer?.club || null,
      rankedScore:
        rntData?.ranked_elo ||
        (rntData?.stats || []).find(s => s.name === 'CurrentRankedPoints')?.value ||
        0,
      extra: {
        expLevel: bsPlayer?.expLevel || 1,
        expPoints: bsPlayer?.expPoints || 0,
        clubName: bsPlayer?.club?.name || '',
      },
      playerTag: tag,
    });

    const outDir = path.join(__dirname, '../../tmp');
    const outFile = path.join(outDir, 'profile-card-exact-test.png');

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, buffer);

    console.log(`[TEST] Image générée : ${outFile}`);
  } catch (err) {
    console.error('[TEST] Erreur :', err);
  }
}

main();