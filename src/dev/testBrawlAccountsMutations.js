const {
  getLinkedAccounts,
  getMainAccount,
  addLinkedAccount,
  setMainAccount,
  removeLinkedAccount,
} = require('../lib/brawlAccounts');
const { supabase } = require('../lib/supabase');

async function getMemberSnapshot(discordId) {
  const { data, error } = await supabase
    .from('members')
    .select('discord_id, brawlstars_tag, brawlstars_trophies, club_name')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function main() {
  try {
    const testDiscordId = '810571811339239424';
    const fakeAltTag = '#TESTALT001';
    const fakeAltName = 'Test Alt';

    console.log('--- état initial ---');
    const initialAccounts = await getLinkedAccounts(testDiscordId);
    const initialMain = await getMainAccount(testDiscordId);
    const initialMember = await getMemberSnapshot(testDiscordId);

    console.log('accounts:');
    console.dir(initialAccounts, { depth: null });
    console.log('main:');
    console.dir(initialMain, { depth: null });
    console.log('member snapshot:');
    console.dir(initialMember, { depth: null });

    console.log('\n--- ajout d’un alt non-main ---');
    await addLinkedAccount(testDiscordId, fakeAltTag, fakeAltName, false);

    const afterAddAccounts = await getLinkedAccounts(testDiscordId);
    const afterAddMain = await getMainAccount(testDiscordId);
    const afterAddMember = await getMemberSnapshot(testDiscordId);

    console.log('accounts after add:');
    console.dir(afterAddAccounts, { depth: null });
    console.log('main after add:');
    console.dir(afterAddMain, { depth: null });
    console.log('member snapshot after add:');
    console.dir(afterAddMember, { depth: null });

    console.log('\n--- passage du faux alt en main ---');
    await setMainAccount(testDiscordId, fakeAltTag);

    const afterSetMainAccounts = await getLinkedAccounts(testDiscordId);
    const afterSetMain = await getMainAccount(testDiscordId);
    const afterSetMainMember = await getMemberSnapshot(testDiscordId);

    console.log('accounts after setMain:');
    console.dir(afterSetMainAccounts, { depth: null });
    console.log('main after setMain:');
    console.dir(afterSetMain, { depth: null });
    console.log('member snapshot after setMain:');
    console.dir(afterSetMainMember, { depth: null });

    console.log('\n--- suppression du faux alt ---');
    await removeLinkedAccount(testDiscordId, fakeAltTag);

    const finalAccounts = await getLinkedAccounts(testDiscordId);
    const finalMain = await getMainAccount(testDiscordId);
    const finalMember = await getMemberSnapshot(testDiscordId);

    console.log('accounts after remove:');
    console.dir(finalAccounts, { depth: null });
    console.log('main after remove:');
    console.dir(finalMain, { depth: null });
    console.log('member snapshot after remove:');
    console.dir(finalMember, { depth: null });

    console.log('\n✅ Test mutations terminé');
  } catch (error) {
    console.error('❌ Erreur pendant le test mutations :');
    console.error(error);
  }
}

main();