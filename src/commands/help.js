const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Récap rapide de toutes les commandes du bot Prairie 🌿'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Bot Prairie — Toutes les commandes')
      .setDescription(
        'Récap rapide de toutes les commandes disponibles.\n' +
        'Pour un guide complet par catégorie, consulte les salons dédiés du forum 📖'
      )
      .addFields(
        {
          name: '🚀 Démarrage',
          value: [
            '`/lier #TAG` — Lie ton compte Brawl Stars',
            '`/settings` — Gère tes comptes liés',
            '`/profil` — Ton profil Prairie complet',
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 Stats & Progression',
          value: [
            '`/classement` — Classement Prairie par trophées',
            '`/rusheurs` — Top progression (jour / semaine / mois / saison)',
            '`/push-stats` — Courbe d\'évolution de tes trophées',
            '`/carte` — Cartes visuelles (prestige, trophées, parties, winstreak…)',
            '`/carte-profil` — Carte de profil visuelle (navigation vers toutes les cartes)',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🌿 Communauté',
          value: [
            '`/clubs` — État en temps réel des 7 clubs Prairie',
            '`/absence` — Déclarer une absence',
            '`/absences` — Voir les absences actives',
            '`/absence-annuler` — Annuler son absence',
            '`/anniversaire` — Enregistrer son anniversaire',
            '`/anniversaires` — Prochains anniversaires',
            '`/site` — Lien vers le site Prairie',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🏟️ Tournois',
          value: [
            '`/tournoi-bracket` — Bracket du tournoi en cours',
            '`/pronostic` — Faire ses pronostics',
            '`/pronostic-help` — Guide du système de pronostics',
          ].join('\n'),
          inline: false,
        },
        {
          name: '📖 Guides détaillés',
          value: [
            '`/guide-demarrage` — Guide complet pour débuter',
            '`/guide-stats` — Guide stats, classements et cartes',
            '`/guide-communaute` — Guide vie du serveur',
            '`/guide-tournois` — Guide tournois et pronostics',
          ].join('\n'),
          inline: false,
        },
        {
          name: '💡 Bon à savoir',
          value: [
            `• Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`,
            '• Les stats se rafraîchissent toutes les 30 min',
            '• `/lier` est nécessaire pour accéder à la plupart des commandes',
          ].join('\n'),
          inline: false,
        }
      )
      .setFooter({ text: 'Prairie Brawl Stars • Bot officiel de la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
