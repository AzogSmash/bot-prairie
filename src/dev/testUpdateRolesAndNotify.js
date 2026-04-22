require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { updateRolesAndNotify } = require('../jobs/snapshots');

async function main() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
    await updateRolesAndNotify(client);
    console.log('✅ updateRolesAndNotify terminé');
  } catch (error) {
    console.error('❌ Erreur updateRolesAndNotify :');
    console.error(error);
  } finally {
    client.destroy();
  }
}

main();