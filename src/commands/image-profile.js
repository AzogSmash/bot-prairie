const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');
const { setupImageNav } = require('../services/imageNav');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carte-profil')
    .setDescription('Ta carte de profil visuelle Brawl Stars 🃏')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') || interaction.user;
    const bsTag  = await getPreferredBsTag(target.id);

    if (!bsTag) {
      return interaction.editReply({
        content: `❌ **${target.username}** n'a pas encore lié son compte BS.\nUtilise \`/lier #TAG\` pour commencer !`
      });
    }

    try {
      const [player, rnt] = await Promise.all([
        getPlayer(bsTag),
        fetchRntProfile(bsTag).catch(() => null),
      ]);

      const rntData = rnt?.result || rnt || {};
      const stats   = rntData?.stats || [];

      if (!rntData?.stats) {
        return interaction.editReply({
          content: '🔧 Carte profil indisponible pour le moment, réessaie dans quelques instants.'
        });
      }

      const extra = {
        currentRankedPts:  stats.find(s => s.id === 24)?.value ?? 0,
        currentRankedName: player.rankedRankName ?? '',
        highestRankedPts:  stats.find(s => s.id === 25)?.value ?? 0,
        highestRankedName: player.highestAllTimeRankedRankName ?? '',
        recordPoints:      stats.find(s => s.id === 31)?.value ?? 0,
        recordLevel:       stats.find(s => s.id === 32)?.value ?? 0,
        accountCreation:   stats.find(s => s.id === 27)?.value ?? null,
        maxWinStreak:      rntData.max_winstreak ?? 0,
        totalPrestige:     player.totalPrestigeLevel ?? 0,
        _rntData:          rntData,
        _expLevel:         player.expLevel || 1,
        _expPoints:        player.expPoints || 0,
        _clubName:         player.club?.name || '',
      };

      await setupImageNav(interaction, bsTag, player, extra, 'carte_profil');
    } catch (err) {
      console.error('[CarteProfil]', err);
      await interaction.editReply({ content: `❌ ${err.message}` });
    }
  }
};
