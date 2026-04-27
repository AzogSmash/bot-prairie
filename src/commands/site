const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('site')
    .setDescription('Affiche le lien du site officiel de la famille Prairie 🌿'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Site officiel de la famille Prairie')
      .setURL('https://brawl-club-manager.vercel.app')
      .setDescription(
        '**Retrouve toutes les infos de la famille Prairie sur notre site !**\n\n' +
        '🏆 Classements et stats des clubs\n' +
        '👥 Profils des membres\n' +
        '📊 Suivi des performances\n\n' +
        '👉 **[Accéder au site](https://brawl-club-manager.vercel.app)**'
      )
      .setFooter({ text: 'Prairie Brawl Stars • Site officiel' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
