const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide-stats')
    .setDescription('Guide Stats & Progression — classements, cartes visuelles et suivi de trophées'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('📊 Stats & Progression')
      .setDescription(
        'Suis ta progression, compare-toi aux autres membres de la famille Prairie et visualise tes stats BS en un coup d\'œil.\n\n' +
        '> ⚠️ Ces commandes nécessitent d\'avoir lié son compte avec `/lier` au préalable.'
      )
      .addFields(
        {
          name: '🏆 Classement Prairie',
          value: [
            '`/classement`',
            'Classement de tous les membres par trophées, filtrable par club.',
            '> Tu peux cliquer sur un membre du classement pour voir son profil directement.',
          ].join('\n'),
        },
        {
          name: '🔥 Rusheurs',
          value: [
            '`/rusheurs`',
            'Qui a le plus pushé sur la période ? Classement de la progression de trophées.',
            '> Filtres disponibles : **aujourd\'hui**, **cette semaine**, **ce mois**, **cette saison** — et par club.',
            '> Les stats se rafraîchissent toutes les **30 min**.',
          ].join('\n'),
        },
        {
          name: '📈 Progression des trophées',
          value: [
            '`/push-stats` ou `/push-stats @membre`',
            'Courbe graphique de l\'évolution de tes trophées sur la saison, la semaine et le jour.',
            '> Idéal pour voir d\'un coup d\'œil si tu progresses bien.',
          ].join('\n'),
        },
        {
          name: '🎨 Cartes visuelles',
          value: [
            '`/carte` ou `/carte @membre` — s\'ouvre sur la carte Prestige',
            '`/carte-profil` ou `/carte-profil @membre` — s\'ouvre sur la carte Profil',
            'Les deux commandes donnent accès aux **7 vues** via le menu de navigation :',
            '> 🃏 **Carte profil** — carte de profil visuelle complète',
            '> ⭐ **Prestige** — niveau de prestige, ranked, records',
            '> 🏆 **Trophées actuels** — tous tes brawlers et leurs trophées',
            '> 🥇 **Trophées record** — tes meilleures performances par brawler',
            '> ⚔️ **Dernières parties** — tes 25 dernières parties jouées',
            '> 🔥 **Winstreak max** — ta meilleure série de victoires par brawler',
            '> 💥 **Winstreak actuelle** — ta série de victoires en cours',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Les stats sont récupérées depuis l\'API officielle Brawl Stars — pas de lag artificiel',
            '• `/rusheurs` saison repart à zéro à chaque reset de trophées (1er jeudi du mois)',
            '• Pour un récap de toutes les commandes → `/help`',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
