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
        'Ce bot a été développé spécialement pour notre communauté de 7 clubs et 350+ membres actifs.\n\n' +
        'Si tu rencontres un problème, ping un <@&' + process.env.STAFF_ROLE_ID + '> 🛠️'
      )
      .addFields(
        // Brawl Stars
        {
          name: '🎮 Brawl Stars',
          value: [
            '`/lier` — Lie ton compte Brawl Stars à ton profil Prairie',
            '`/profil` — Affiche ton profil complet ou celui d\'un membre',
            '`/classement` — Classement des membres Prairie par trophées',
            '`/clubs` — Vue globale des 7 clubs Prairie en temps réel',
          ].join('\n'),
          inline: false,
        },

        // Absences
        {
          name: '📋 Absences',
          value: [
            '`/absence` — Déclare une absence via formulaire',
            '`/absences` — Liste les absences avec filtres par club et période',
            '`/absence-annuler` — Annule ton absence déclarée',
          ].join('\n'),
          inline: false,
        },

        // Staff only
        {
          name: '🔒 Staff uniquement',
          value: [
            '`/absences` — Voir toutes les absences + annuler celle de n\'importe quel membre',
            '`/absence-annuler @membre` — Annuler l\'absence d\'un membre spécifique',
            '`/reset-panels` — Réinitialise les panels du salon infos-clubs',
          ].join('\n'),
          inline: false,
        },

        // Aide
        {
          name: '❓ Aide',
          value: '`/help` — Affiche ce message',
          inline: false,
        },

        // Bon à savoir
        {
          name: '💡 Bon à savoir',
          value: [
            '• `/profil` fonctionne uniquement après avoir fait `/lier`',
            '• Les stats BS sont récupérées en temps réel',
            '• Les panels clubs se mettent à jour automatiquement toutes les heures',
            `• Un problème ? Ping <@&${process.env.STAFF_ROLE_ID}> 🛠️`,
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Bot officiel de la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};