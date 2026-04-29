const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { generateRankCard } = require('../modules/rankCard');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('image-prestige')
    .setDescription('Génère ta carte de prestige Brawl Stars')
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

      const extra = {
        currentRankedPts:   rntData.stats?.find(s => s.id === 24)?.value ?? 0,
        currentRankedName:  player.rankedRankName ?? '',
        highestRankedPts:   rntData.stats?.find(s => s.id === 25)?.value ?? 0,
        highestRankedName:  player.highestAllTimeRankedRankName ?? '',
        recordPoints:       rntData.stats?.find(s => s.id === 31)?.value ?? 0,
        recordLevel:        rntData.stats?.find(s => s.id === 32)?.value ?? 0,
        totalBrawlers:      player.brawlers?.length ?? 0,
        accountCreation:    rntData.stats?.find(s => s.id === 27)?.value ?? null,
        maxWinStreak:       rntData.max_winstreak ?? 0,
        totalPrestige:      player.totalPrestigeLevel ?? 0,
      };

      const buffer = await generateRankCard(player, extra);

      const attachment = new AttachmentBuilder(buffer, { name: 'carte-rank.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      console.error('[CarteRank]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  }
};