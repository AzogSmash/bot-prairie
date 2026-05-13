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
            'Prédie tous les matchs du bracket avant de soumettre tes pronostics.',
            '> L\'interface se débloque **round par round** : tu prédis les QF, puis les demies, puis la finale.',
            '> Une fois soumis, tes pronostics sont **définitifs** — impossible de les modifier.',
            '> Un classement des meilleurs pronostiqueurs est affiché à la fin 🏆',
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
          name: '🏅 Système de points',
          value: [
            '**3 points maximum** par tournoi :',
            '> **1 pt** — tous les résultats du tableau **gauche** corrects',
            '> **1 pt** — tous les résultats du tableau **droit** corrects',
            '> **1 pt** — gagnant de la **grande finale** correct',
            'Les meilleurs pronostiqueurs peuvent gagner des points Prairie et tenter de remporter un battlepass !',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Lis `/pronostic-help` avant de te lancer pour tout comprendre',
            '• Pour un récap de toutes les commandes → `/help`',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
