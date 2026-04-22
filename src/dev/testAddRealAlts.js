const {
  addLinkedAccount,
  getLinkedAccounts,
} = require('../lib/brawlAccounts');

async function main() {
  try {
    const discordId = '860525163799773205';

    await addLinkedAccount(discordId, '#LL88OJ9YV', 'smurf mini Prairie', false);
    await addLinkedAccount(discordId, '#GCUPPQQQJ', 'smurf sans club', false);

    const accounts = await getLinkedAccounts(discordId);
    console.dir(accounts, { depth: null });

    console.log('\n✅ Comptes ajoutés');
  } catch (error) {
    console.error('❌ Erreur ajout comptes :');
    console.error(error);
  }
}

main();