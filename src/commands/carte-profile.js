const { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { generateProfileCard } = require('../modules/profileCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carte-profil')
    .setDescription('Génère la carte de profil visuelle (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') || interaction.user;

    const { data } = await supabase
      .from('members')
      .select('brawlstars_tag')
      .eq('discord_id', target.id)
      .maybeSingle();

    if (!data?.brawlstars_tag) {
      return interaction.editReply({
        content: `❌ **${target.username}** n'a pas encore lié son compte BS.`
      });
    }

    try {
      const player = await getPlayer(data.brawlstars_tag);
      const buffer = await generateProfileCard(data.brawlstars_tag, player);
      const attachment = new AttachmentBuilder(buffer, { name: 'carte-profil.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      console.error('[CarteProfil]', err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  }
};