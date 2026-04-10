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
      .setDescription('Voici toutes les commandes disponibles sur le serveur Prairie !')
      .addFields(
        // Compte BS
        {
          name: '🎮 Brawl Stars',
          value: [
            '`/lier` — Lie ton compte Brawl Stars à ton profil Prairie',
            '`/profil` — Affiche ton profil ou celui d\'un membre',
            '`/classement` — Top des membres Prairie par trophées',
            '`/clubs` — Vue globale des 7 clubs Prairie',
          ].join('\n'),
          inline: false,
        },

        // Absences
        {
          name: '📋 Absences',
          value: [
            '`/absence` — Déclare une absence via formulaire',
            '`/absences` — Liste les absences avec filtres par club et période',
            '`/absence-annuler` — Annule ton absence *(staff : peut annuler celle de n\'importe qui)*',
          ].join('\n'),
          inline: false,
        },

        // Info
        {
          name: '❓ Aide',
          value: [
            '`/help` — Affiche ce message',
          ].join('\n'),
          inline: false,
        },

        // Footer info
        {
          name: '💡 Bon à savoir',
          value: [
            '• Les commandes avec 🔒 sont réservées au staff',
            '• `/profil` fonctionne uniquement après avoir fait `/lier`',
            '• Les stats sont récupérées en temps réel depuis l\'API Brawl Stars',
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Bot développé pour la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};