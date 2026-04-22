const {
  getLinkedAccounts,
  getMainAccount,
  refreshMemberMainSnapshot,
  getPreferredBsTag,
} = require('../lib/brawlAccounts');

const { supabase } = require('../lib/supabase');

async function main() {
  try {
    console.log('--- first 10 rows in member_brawl_accounts ---');
    const { data, error } = await supabase
      .from('member_brawl_accounts')
      .select('discord_id, bs_tag, is_main')
      .limit(10);

    if (error) throw error;
    console.dir(data, { depth: null });

    if (!data || data.length === 0) {
      console.log('\n❌ La table est vide dans l’environnement lu par le bot.');
      process.exit(0);
    }

    const discordId = data[0].discord_id;
    console.log(`\n--- testing discord_id = ${discordId} ---`);

    console.log('\n--- linked accounts ---');
    const accounts = await getLinkedAccounts(discordId);
    console.dir(accounts, { depth: null });

    console.log('\n--- main account ---');
    const mainAccount = await getMainAccount(discordId);
    console.dir(mainAccount, { depth: null });

    console.log('\n--- refresh member snapshot ---');
    const result = await refreshMemberMainSnapshot(discordId);
    console.dir(result, { depth: null });

    console.log('\n--- preferred tag ---');
    const preferredTag = await getPreferredBsTag(discordId);
    console.dir(preferredTag, { depth: null });

    console.log('\n✅ Test terminé');
  } catch (error) {
    console.error('❌ Erreur pendant le test :');
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();