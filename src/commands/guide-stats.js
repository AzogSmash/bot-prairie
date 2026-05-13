const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BOT_CHANNEL = '<#1173729682546495589>';

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
        `Suis ta progression, compare-toi aux autres membres de la famille Prairie et visualise tes stats BS.\n\n` +
        `📌 Toutes ces commandes sont à utiliser dans ${BOT_CHANNEL}\n` +
        `> ⚠️ Nécessite d'avoir lié son compte avec \`/lier\` au préalable.`
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
            'Classement des membres par progression de trophées.',
            '> Filtres : **aujourd\'hui**, **cette semaine**, **ce mois**, **cette saison** — et par club.',
            '> Les données se rafraîchissent toutes les **30 min**.',
          ].join('\n'),
        },
        {
          name: '📈 Progression des trophées',
          value: [
            '`/push-stats` ou `/push-stats @membre`',
            'Graphique de l\'évolution de tes trophées sur la saison, la semaine et le jour.',
          ].join('\n'),
        },
        {
          name: '🎨 Cartes visuelles',
          value: [
            '`/carte` — s\'ouvre sur la carte **Prestige**',
            '`/carte-profil` — s\'ouvre sur la **Carte de profil**',
            'Les deux donnent accès aux **7 vues** via le menu de navigation :',
            '> 🃏 Carte profil · ⭐ Prestige · 🏆 Trophées actuels · 🥇 Trophées record',
            '> ⚔️ Dernières parties · 🔥 Winstreak max · 💥 Winstreak actuelle',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• `/rusheurs` saison repart à zéro à chaque reset de trophées (1er jeudi du mois à 9h UTC)',
            '• Les stats BS sont récupérées en temps réel depuis l\'API officielle',
            '• Utilise `/help` pour un récap de toutes les commandes',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
