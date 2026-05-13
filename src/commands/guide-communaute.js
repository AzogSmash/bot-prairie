const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BOT_CHANNEL = '<#1173729682546495589>';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide-communaute')
    .setDescription('Guide Communauté — clubs, absences et vie du serveur'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 La vie de la famille Prairie')
      .setDescription(
        `Le bot facilite la vie quotidienne de la famille Prairie : infos sur les clubs, ` +
        `gestion des absences, anniversaires et bien plus.\n\n` +
        `📌 Toutes ces commandes sont à utiliser dans ${BOT_CHANNEL}`
      )
      .addFields(
        {
          name: '🌿 Les 7 clubs Prairie',
          value: [
            '`/clubs`',
            'Vue en temps réel des 7 clubs : membres, places disponibles, trophées minimum, records monde et France.',
            '> Utile pour savoir quel club recrute ou vérifier les critères d\'un club supérieur.',
          ].join('\n'),
        },
        {
          name: '📅 Déclarer une absence',
          value: [
            '`/absence`',
            'Un formulaire s\'ouvre pour indiquer tes dates et la raison (optionnelle).',
            '> ⚠️ Déclare ton absence **avant** de partir pour éviter d\'être exclu pendant ton absence.',
          ].join('\n'),
        },
        {
          name: '📋 Consulter les absences',
          value: [
            '`/absences`',
            'Liste les absences actives, filtrables par **club** et par **période** (en cours, ce mois, mois prochain…).',
          ].join('\n'),
        },
        {
          name: '❌ Annuler une absence',
          value: [
            '`/absence-annuler`',
            'Annule ton absence. Si tu en as plusieurs, un menu s\'affiche pour choisir laquelle annuler.',
          ].join('\n'),
        },
        {
          name: '🎂 Anniversaires',
          value: [
            '`/anniversaire <jour> <mois>` — Enregistre ton anniversaire (l\'année est optionnelle pour afficher ton âge)',
            '`/anniversaire` — Affiche ton anniversaire enregistré (avec un bouton pour le supprimer)',
            '`/anniversaires` — Consulte les prochains anniversaires de la famille',
            '> Le bot envoie automatiquement un message dans le canal général le jour J 🎉',
          ].join('\n'),
        },
        {
          name: '🌐 Site Prairie',
          value: '`/site` — Lien direct vers le site officiel de la famille Prairie.',
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Une absence non déclarée peut entraîner une exclusion — pense à prévenir !',
            '• Les infos des clubs se mettent à jour automatiquement toutes les 30 min',
            '• Utilise `/help` pour un récap de toutes les commandes',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
