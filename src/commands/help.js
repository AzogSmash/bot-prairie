const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche toutes les commandes du bot Prairie 🌿'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Bot Prairie — Commandes disponibles')
      .setDescription(
        'Bienvenue sur le bot officiel de la famille Prairie !\n' +
        'Développé spécialement pour notre communauté de 7 clubs et 350+ membres actifs.\n\n' +
        `Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`
      )

      .addFields({
        name: '🎮 Brawl Stars',
        value: [
          '`/lier #TAG` — Lie ton compte Brawl Stars à ton profil Prairie',
          '`/settings` — Gère tes comptes liés (jusqu\'à 5 comptes, compte principal, suppression)',
          '`/profil` — Affiche ton profil complet avec carte visuelle ou celui d\'un membre',
          '`/classement` — Classement Prairie par trophées avec filtres par club',
          '`/rusheurs` — Classement des membres qui pushent le plus (jour / semaine / mois / saison)',
          '`/clubs` — Vue globale des 7 clubs en temps réel',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '📋 Absences',
        value: [
          '`/absence` — Déclare une absence via formulaire',
          '`/absences` — Liste les absences avec filtres par club et période',
          '`/absence-annuler` — Annule une de tes absences actives',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '❓ Aide',
        value: '`/help` — Affiche ce message',
        inline: false,
      })

      .addFields({
        name: '🔒 Staff Prairie',
        value: [
          '`/absence @membre` — Créer une absence pour un membre',
          '`/absence-annuler @membre` — Annuler l\'absence d\'un membre',
          '`/absences` — Voir toutes les absences + annuler celles des membres',
          '`/config-club` — Modifier les infos d\'un club (description, trophées requis, records)',
          '`/reset-panels` — Réinitialise les panels du salon infos-clubs',
          '`/setup-regles` — Publie/met à jour le règlement dans le salon dédié',
          '`/carte-profil` — Génère la carte de profil visuelle d\'un membre',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '💡 Bon à savoir',
        value: [
          '• `/profil`, `/classement` et `/rusheurs` nécessitent d\'avoir lié son compte via `/lier`',
          '• `/settings` permet de gérer plusieurs comptes BS sur un seul profil Discord',
          '• Le compte principal détermine ton rang, ta carte de profil et tes rôles',
          '• Les stats BS sont récupérées en temps réel depuis l\'API officielle',
          '• Les panels clubs se mettent à jour automatiquement toutes les heures',
          '• Les snapshots rusheurs sont pris toutes les heures',
          `• Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`,
        ].join('\n'),
        inline: false,
      })

      .setFooter({ text: 'Prairie Brawl Stars • Bot officiel de la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};