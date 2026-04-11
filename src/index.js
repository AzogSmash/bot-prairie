require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { buildProfileEmbed } = require('./commands/profil');
const { updateClubsPanel } = require('./modules/clubsPanel');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Chargement des commandes
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
const commandsData = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

// Chargement des events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  client.on(event.name, (...args) => event.execute(...args));
}

// Enregistrement des slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
      { body: commandsData }
    );
    console.log('✅ Slash commands enregistrées');
  } catch (err) {
    console.error('Erreur deploy commands:', err);
  }
}

// Gestion des interactions
client.on('interactionCreate', async interaction => {

  // ── Modals ────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'absence_modal') {
      const absenceCmd = require('./commands/absence');
      await absenceCmd.handleModal(interaction);
    }
    return;
  }

  // ── Menus déroulants ──────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('absences_')) {
      const absencesCmd = require('./commands/absences');
      await absencesCmd.handleSelect(interaction);
    }
    if (interaction.customId.startsWith('classement_')) {
      const classementCmd = require('./commands/classement');
      await classementCmd.handleSelect(interaction);
    }
    return;
  }

  // ── Boutons ───────────────────────────────────────────────
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');
    const action = parts[0];

    // Pagination classement
    if (action === 'classement') {
      const classementCmd = require('./commands/classement');
      await classementCmd.handleButton(interaction);
      return;
    }

    // Refresh profil
    if (action === 'refresh') {
      await interaction.deferUpdate();
      const target = await interaction.client.users.fetch(parts[1]);
      try {
        const embed = await buildProfileEmbed(target, interaction.client);
        if (embed) await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    return;
  }

  // ── Slash commands ────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ Une erreur est survenue.' }).catch(() => {});
    } else {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
  }
});

client.once('clientReady', async () => {
  console.log(`✅ Bot Prairie connecté en tant que ${client.user.tag}`);
  await deployCommands();

  setTimeout(async () => {
    await updateClubsPanel(client);
    setInterval(() => updateClubsPanel(client), 60 * 60 * 1000);
  }, 3000);
});

client.login(process.env.DISCORD_TOKEN);