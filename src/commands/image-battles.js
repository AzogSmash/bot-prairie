const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPlayer, getBattleLog } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { getPreferredBsTag } = require('../lib/brawlAccounts');
const { renderBattlesCard } = require('../modules/battlesCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('image-battles')
    .setDescription('Génère la carte de tes dernières parties Brawl Stars')
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
      const [player, log] = await Promise.all([
        getPlayer(bsTag),
        getBattleLog(bsTag),
      ]);

      const battles = log?.items;
      if (!battles?.length) {
        return interaction.editReply({ content: '❌ Aucune partie trouvée pour ce compte.' });
      }

      const buffer = await renderBattlesCard(bsTag, player.name, battles);
      const attachment = new AttachmentBuilder(buffer, { name: 'battles.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      console.error('[ImageBattles]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  },
};
