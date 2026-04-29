const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pronostic-help')
    .setDescription('Comment fonctionnent les pronostics ? 🏆'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('🎯 Guide — Pronostics Prairie')
      .setDescription('Parie sur les résultats du tournoi et tente de gagner des points !')
      .addFields(
        {
          name: '📋 Comment participer ?',
          value: 'Utilise `/pronostic` dans le salon commandes-bot avant le début du tournoi.\nTu dois avoir lié ton compte Brawl Stars avec `/lier` pour pouvoir voter.',
          inline: false,
        },
        {
          name: '🏆 Comment ça marche ?',
          value: 'Tu dois prédire le gagnant de **chaque match** du bracket, du premier round jusqu\'à la grande finale.\nLe bracket se débloque progressivement — tu dois d\'abord prédire les QF pour accéder aux demi-finales, etc.\nUne fois tous les matchs prédits, tu soumets tes pronostics. **Ils ne pourront plus être modifiés.**',
          inline: false,
        },
        {
          name: '👀 Voir les tendances',
          value: 'Après avoir soumis tes pronos, tu peux voir les tendances des votes de tous les participants :\n🔥 **Favori** avec le % de votes pour chaque match.',
          inline: false,
        },
        {
          name: '🏅 Système de points',
          value: '**1 point** si tu as correctement prédit **tous** les résultats du tableau gauche.\n**1 point** si tu as correctement prédit **tous** les résultats du tableau droit.\n**1 point** si tu as correctement prédit le gagnant de la **grande finale**.\n\nSoit **3 points maximum** par tournoi.',
          inline: false,
        },
        {
          name: '⏰ Quand voter ?',
          value: 'Les pronos sont ouverts dès que le bracket est affiché et se ferment au démarrage officiel du tournoi.\nPas de retard — une fois le tournoi lancé, plus personne ne peut soumettre de pronos !',
          inline: false,
        },
        {
          name: '🎁 Récompenses',
          value: 'Les meilleurs pronostiqueurs peuvent gagner des points Prairie et tenter de remporter un battlepass !',
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Bonne chance !' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};