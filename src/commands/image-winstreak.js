const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { generateWinstreakCard } = require('../modules/winstreakCard');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('image-winstreak')
    .setDescription('Génère ta carte des séries de victoires max par brawler')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') || interaction.user;
    const bsTag = await getPreferredBsTag(target.id);

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
      const stats = rntData?.stats || [];

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
      };

      const buffer = await generateWinstreakCard(player, extra);
      await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'image-winstreak.png' })] });

    } catch (err) {
      console.error('[ImageWinstreak]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  }
};
