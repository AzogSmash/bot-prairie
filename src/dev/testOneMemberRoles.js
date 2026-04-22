require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { getAccountsSummary } = require('../lib/brawlAccounts');
const { updateMemberRoles, CLUB_ROLES, TROPHY_ROLES } = require('../jobs/snapshots');

const ALL_CLUB_ROLE_IDS = Object.values(CLUB_ROLES);
const ALL_TROPHY_ROLE_IDS = TROPHY_ROLES.map(t => t.roleId);

function extractManagedRoles(member) {
  return member.roles.cache
    .filter(r => ALL_CLUB_ROLE_IDS.includes(r.id) || ALL_TROPHY_ROLE_IDS.includes(r.id))
    .map(r => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const discordId = '860525163799773205';
    const member = guild.members.cache.get(discordId);

    if (!member) throw new Error('Membre introuvable dans le serveur.');

    const currentTrophiesMap = new Map([
      ['#PGPYQUJ08', { trophies: 41000, clubName: 'Prairie Gelée', bsName: 'main Gelée' }],
      ['#LL88OJ9YV', { trophies: 52000, clubName: 'Mini Prairie', bsName: 'smurf mini Prairie' }],
      ['#GCUPPQQQJ', { trophies: 18000, clubName: null, bsName: 'smurf sans club' }],
    ]);

    const summary = await getAccountsSummary(discordId, currentTrophiesMap);

    console.log('--- summary ---');
    console.dir(summary, { depth: null });

    console.log('\n--- roles before ---');
    console.dir(extractManagedRoles(member), { depth: null });

    await updateMemberRoles(member, summary.clubNames, summary.bestTrophies);

    await member.fetch(true);

    console.log('\n--- roles after ---');
    console.dir(extractManagedRoles(member), { depth: null });

    console.log('\n✅ Test roles terminé');
  } catch (error) {
    console.error('❌ Erreur test roles :');
    console.error(error);
  } finally {
    client.destroy();
  }
}

main();