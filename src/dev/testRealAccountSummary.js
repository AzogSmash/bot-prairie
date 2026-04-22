const { getAccountsSummary } = require('../lib/brawlAccounts');

async function main() {
  try {
    const discordId = '860525163799773205';

    const currentTrophiesMap = new Map([
      ['#PGPYQUJ08', { trophies: 41000, clubName: 'Prairie Gelée', bsName: 'main Gelée' }],
      ['#LL88OJ9YV', { trophies: 52000, clubName: 'Mini Prairie', bsName: 'smurf mini Prairie' }],
      ['#GCUPPQQQJ', { trophies: 18000, clubName: null, bsName: 'smurf sans club' }],
    ]);

    const summary = await getAccountsSummary(discordId, currentTrophiesMap);

    console.log('--- summary ---');
    console.dir(summary, { depth: null });

    console.log('\n--- checks ---');
    console.log('accounts length =', summary.accounts.length);
    console.log('mainTag =', summary.mainTag);
    console.log('clubNames =', summary.clubNames);
    console.log('bestTrophies =', summary.bestTrophies);
    console.log('main club =', summary.mainAccount?.clubName);

    console.log('\n✅ Test summary simulé terminé');
  } catch (error) {
    console.error('❌ Erreur test summary simulé :');
    console.error(error);
  }
}

main();