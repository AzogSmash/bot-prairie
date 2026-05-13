const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
        'Le bot facilite la vie quotidienne de la famille Prairie : infos sur les clubs, ' +
        'gestion des absences, anniversaires et bien plus.'
      )
      .addFields(
        {
          name: '🌿 Les 7 clubs Prairie',
          value: [
            '`/clubs`',
            'Vue en temps réel des 7 clubs de la famille : membres actuels, places disponibles, trophées minimum, records.',
            '> Utile pour savoir quel club recrute ou vérifier les critères pour rejoindre un club supérieur.',
          ].join('\n'),
        },
        {
          name: '📅 Déclarer une absence',
          value: [
            '`/absence`',
            'Préviens le staff si tu vas être absent. Un formulaire s\'ouvre pour indiquer tes dates et la raison (optionnelle).',
            '> Déclare ton absence **avant** de partir pour éviter d\'être exclu pendant ton absence.',
          ].join('\n'),
        },
        {
          name: '📋 Voir les absences',
          value: [
            '`/absences`',
            'Consulte les absences actives de la famille, filtrables par club et par période.',
            '> Pratique pour les capitaines qui veulent savoir qui est présent.',
          ].join('\n'),
        },
        {
          name: '❌ Annuler une absence',
          value: [
            '`/absence-annuler`',
            'Tu rentres plus tôt que prévu ? Annule ton absence pour que le staff soit informé.',
          ].join('\n'),
        },
        {
          name: '🎂 Anniversaires',
          value: [
            '`/anniversaire` — Enregistre ta date de naissance pour être fêté le jour J',
            '`/anniversaires` — Consulte les prochains anniversaires de la famille',
            '> Le bot envoie automatiquement un message d\'anniversaire dans le canal général.',
          ].join('\n'),
        },
        {
          name: '🌐 Site Prairie',
          value: [
            '`/site`',
            'Lien direct vers le site officiel de la famille Prairie.',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Une absence non déclarée peut entraîner une exclusion du club — pense à prévenir !',
            '• Les panels clubs se mettent à jour automatiquement toutes les 30 min',
            '• Pour un récap de toutes les commandes → `/help`',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
