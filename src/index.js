require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { buildProfileEmbed } = require('./commands/profil');
const { updateClubsPanel } = require('./modules/clubsPanel');
const { updateSnapshots } = require('./jobs/snapshots');
const { registerFonts } = require('./services/registerFonts');

const {
  handleSettingsButton,
  handleSettingsModal,
  handleSettingsSelect,
} = require('./modules/settingsInteractions');

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
  console.log(`[Events] Chargé: ${event.name} (${file})`);
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
  // ── Settings first: Buttons / Modals / Selects ─────────────────
  if (interaction.isButton() && interaction.customId.startsWith('settings:')) {
    try {
      return await handleSettingsButton(interaction);
    } catch (error) {
      console.error('[Settings Button]', error);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: '❌ Erreur lors du traitement.', ephemeral: true });
      }
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('settings:')) {
    try {
      return await handleSettingsModal(interaction);
    } catch (error) {
      console.error('[Settings Modal]', error);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: '❌ Erreur lors du traitement.', ephemeral: true });
      }
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('settings:')) {
    try {
      return await handleSettingsSelect(interaction);
    } catch (error) {
      console.error('[Settings Select]', error);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: '❌ Erreur lors du traitement.', ephemeral: true });
      }
      return;
    }
  }

  // ── Modals ────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('absence_modal')) {
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
    if (interaction.customId.startsWith('annuler_absence_select_')) {
      const absenceAnnulerCmd = require('./commands/absence-annuler');
      await absenceAnnulerCmd.handleSelect(interaction);
    }
    if (interaction.customId.startsWith('rusheurs_')) {
      const rusheursCmd = require('./commands/rusheurs');
      await rusheursCmd.handleSelect(interaction);
    }
    if (interaction.customId.startsWith('pronostic_')) {
      const pronosticCmd = require('./commands/pronostic');
      await pronosticCmd.handleSelect(interaction);
    }
    if (interaction.customId.startsWith('bracket_')) {
      const bracketCmd = require('./commands/tournoi-bracket');
      await bracketCmd.handleSelect(interaction);
    }
    return;
  }

  // ── Boutons ───────────────────────────────────────────────
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');
    const action = parts[0];

    if (action === 'classement' && parts[1] === 'profil') {
      await interaction.deferUpdate();
      try {
        const targetId = parts[parts.length - 1];
        const target = await interaction.client.users.fetch(targetId);
        const profilePayload = await buildProfileEmbed(target, interaction.client);

        if (!profilePayload) {
          await interaction.followUp({ content: '❌ Tu n\'as pas encore lié ton compte BS.', ephemeral: true });
        } else {
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`refresh_${target.id}`)
              .setLabel('🔄 Actualiser')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`classement_goto_0_tous_fromprofil`)
              .setLabel('🏆 Classement Prairie')
              .setStyle(ButtonStyle.Primary),
          );

          await interaction.editReply({
            ...profilePayload,
            components: [row],
          });
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (action === 'classement') {
      const classementCmd = require('./commands/classement');
      await classementCmd.handleButton(interaction);
      return;
    }

    if (action === 'refresh') {
      await interaction.deferUpdate();
      const target = await interaction.client.users.fetch(parts[1]);
      try {
        const profilePayload = await buildProfileEmbed(target, interaction.client);
        if (profilePayload) {
          await interaction.editReply(profilePayload);
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }
    if (interaction.customId.startsWith('pronostic_')) {
      const pronosticCmd = require('./commands/pronostic');
      await pronosticCmd.handleButton(interaction);
      return;
    }
    if (interaction.customId.startsWith('bracket_')) {
      const bracketCmd = require('./commands/tournoi-bracket');
      await bracketCmd.handleButton(interaction);
      return;
    }
    return;
  }

  // ── Slash commands ────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (interaction.commandName === 'profil' && !interaction.deferred && !interaction.replied) {
    }

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
  setTimeout(async () => {
    await updateSnapshots(client);
    setInterval(() => updateSnapshots(client), 60 * 60 * 1000);
  }, 33000);
});

registerFonts();

client.login(process.env.DISCORD_TOKEN);