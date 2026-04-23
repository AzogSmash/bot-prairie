const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { renderProfileCard } = require('../modules/profileCardExact');
const { fetchRntProfile } = require('../lib/rntapi');
const { getPreferredBsTag } = require('../lib/brawlAccounts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carte-profil')
    .setDescription('Génère ta carte de profil visuelle Brawl Stars')
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
      const rntAvailable = rntData && Object.keys(rntData).length > 0 && rntData.stats;

      if (!rntAvailable) {
        return interaction.editReply({
          content: '🔧 Mise à jour en cours — les visuels reviennent très bientôt !'
        });
      }

      const buffer = await renderProfileCard({
        player: rntData,
        extra: {
          expLevel: player.expLevel || 1,
          expPoints: player.expPoints || 0,
          clubName: player.club?.name || '',
        },
        playerTag: bsTag,
      });

      const attachment = new AttachmentBuilder(buffer, { name: 'carte-profil.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      console.error('[CarteProfil]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  }
};