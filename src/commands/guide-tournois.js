const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide-tournois')
    .setDescription('Guide Tournois — bracket, pronostics et compétitions Prairie'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🏟️ Tournois Prairie')
      .setDescription(
        'La famille Prairie organise régulièrement des tournois internes. ' +
        'Voici comment suivre les matchs et participer aux pronostics.'
      )
      .addFields(
        {
          name: '📊 Voir le bracket',
          value: [
            '`/tournoi-bracket`',
            'Affiche le bracket du tournoi en cours avec tous les matchs et résultats.',
            '> L\'image du bracket est aussi mise à jour automatiquement dans le canal tournoi.',
            '> Le bouton 🔄 te permet de rafraîchir le bracket en direct.',
          ].join('\n'),
        },
        {
          name: '🎯 Faire ses pronostics',
          value: [
            '`/pronostic`',
            'Parie sur les résultats des matchs avant le début du tournoi.',
            '> Les matchs se débloquent progressivement au fil du tournoi.',
            '> Tu peux modifier tes pronostics tant que le tournoi n\'a pas commencé.',
            '> Un classement des meilleurs pronostiqueurs est affiché à la fin.',
          ].join('\n'),
        },
        {
          name: '❓ Guide des pronostics',
          value: [
            '`/pronostic-help`',
            'Explication complète du système de points et du fonctionnement des pronostics.',
            '> Lis-le avant de faire tes premiers pronostics pour maximiser tes points !',
          ].join('\n'),
        },
        {
          name: '💡 Comment ça marche ?',
          value: [
            '1. Le staff crée le tournoi et inscrit les participants',
            '2. Les équipes sont composées automatiquement de façon équilibrée',
            '3. Tu fais tes pronostics avec `/pronostic` avant le début',
            '4. Le tournoi se lance — suis les matchs avec `/tournoi-bracket`',
            '5. Le staff entre les résultats au fur et à mesure',
            '6. À la fin, le classement des pronostics est révélé 🏆',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Les pronostics sont verrouillés dès que le tournoi démarre',
            '• Plus tu es précis dans tes pronostics, plus tu marques de points',
            '• Pour un récap de toutes les commandes → `/help`',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
