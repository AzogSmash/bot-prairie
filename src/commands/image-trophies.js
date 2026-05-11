const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');
const { setupImageNav } = require('../services/imageNav');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('image-trophies')
    .setDescription('Génère la carte des trophées par brawler')
    .addUserOption(o =>
      o.setName('membre').setDescription('Le membre (toi par défaut)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') || interaction.user;
    const bsTag  = await getPreferredBsTag(target.id);

    if (!bsTag) {
      return interaction.editReply({
        content: `❌ **${target.username}** n'a pas encore lié son compte BS. Utilise \`/lier #TAG\` pour commencer !`,
      });
    }

    try {
      const [player, rnt] = await Promise.all([
        getPlayer(bsTag),
        fetchRntProfile(bsTag).catch(() => null),
      ]);

      const rntData = rnt?.result || rnt || {};
      const stats   = rntData?.stats || [];
      const extra   = {
        currentRankedPts:  stats.find(s => s.id === 24)?.value ?? 0,
        currentRankedName: player.rankedRankName ?? '',
        highestRankedPts:  stats.find(s => s.id === 25)?.value ?? 0,
        highestRankedName: player.highestAllTimeRankedRankName ?? '',
        recordPoints:      stats.find(s => s.id === 31)?.value ?? 0,
        recordLevel:       stats.find(s => s.id === 32)?.value ?? 0,
        accountCreation:   stats.find(s => s.id === 27)?.value ?? null,
        maxWinStreak:      rntData.max_winstreak ?? 0,
        totalPrestige:     player.totalPrestigeLevel ?? 0,
      };

      await setupImageNav(interaction, bsTag, player, extra, 'trophies');
    } catch (err) {
      console.error('[ImageTrophies]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  },
};
