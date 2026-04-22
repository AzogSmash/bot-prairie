const { SlashCommandBuilder } = require('discord.js');
const { getLinkedAccounts, getMainAccount } = require('../lib/brawlAccounts');
const { buildSettingsPanel } = require('../modules/settingsPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Gère tes comptes Brawl Stars liés'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const discordId = interaction.user.id;

      const accounts = await getLinkedAccounts(discordId);
      const mainAccount = await getMainAccount(discordId);

      const panel = buildSettingsPanel(accounts, mainAccount);

      await interaction.editReply(panel);
    } catch (error) {
      console.error('[Settings]', error);
      await interaction.editReply({
        content: '❌ Impossible d’ouvrir les paramètres pour le moment.',
      });
    }
  },
};