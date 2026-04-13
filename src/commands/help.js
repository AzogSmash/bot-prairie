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
        'Développé spécialement pour notre communauté de **7 clubs** et **350+ membres actifs**.\n\n' +
        `Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`
      )

      .addFields({
        name: '━━━━━━━━━━━━━━━━━━━━━━\n🎮 Brawl Stars',
        value: [
          '`/lier` — Lie ton compte Brawl Stars à ton profil Prairie',
          '`/profil` — Affiche ton profil complet ou celui d\'un membre',
          '`/classement` — Classement Prairie par trophées avec filtres par club',
          '`/rusheurs` — Classement des rusheurs par période et par club',
          '`/clubs` — Vue globale des 7 clubs en temps réel',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '━━━━━━━━━━━━━━━━━━━━━━\n📋 Absences',
        value: [
          '`/absence` — Déclare une absence via formulaire',
          '`/absences` — Liste les absences avec filtres par club et période',
          '`/absence-annuler` — Annule une de tes absences actives',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '━━━━━━━━━━━━━━━━━━━━━━\n🔒 Staff Prairie',
        value: [
          '`/absence @membre` — Créer une absence pour un membre',
          '`/absence-annuler @membre` — Annuler l\'absence d\'un membre',
          '`/absences` — Voir toutes les absences + annuler celles des membres',
          '`/config-club` — Modifier les infos d\'un club',
          '`/nouvelle-saison` — Marquer le début d\'une nouvelle saison',
          '`/reset-panels` — Réinitialise les panels du salon infos-clubs',
          '`/setup-regles` — Publie/met à jour le règlement',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '━━━━━━━━━━━━━━━━━━━━━━\n🛡️ Modération',
        value: [
          '`/mod warn @membre` — Avertir un membre',
          '`/mod mute @membre durée` — Mute temporaire (en minutes)',
          '`/mod unmute @membre` — Unmute un membre',
          '`/mod kick @membre` — Expulser un membre',
          '`/mod tempban @membre durée` — Ban temporaire (en jours)',
          '`/mod ban @membre` — Bannir définitivement',
          '`/mod unban id` — Débannir un membre',
          '`/mod clear nombre` — Supprimer des messages (1-100)',
        ].join('\n'),
        inline: false,
      })

      .addFields({
        name: '━━━━━━━━━━━━━━━━━━━━━━\n💡 Bon à savoir',
        value: [
          '• `/profil` et `/classement` fonctionnent uniquement après `/lier`',
          '• Les stats BS sont récupérées en temps réel depuis l\'API Brawl Stars',
          '• Les panels clubs se mettent à jour automatiquement toutes les heures',
          '• Le classement affiche tous les membres des 7 clubs, liés ou non',
          '• `/rusheurs` ne nécessite pas de compte lié',
          `• Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`,
        ].join('\n'),
        inline: false,
      })

      .setFooter({ text: 'Prairie Brawl Stars • Bot officiel de la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};