const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BOT_CHANNEL = '<#1173729682546495589>';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide-demarrage')
    .setDescription('Guide de démarrage — comment configurer le bot Prairie'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🚀 Débuter sur le Bot Prairie')
      .setDescription(
        `Bienvenue dans la famille Prairie ! Le bot te permet de connecter ton compte Brawl Stars au serveur ` +
        `et d'accéder à des stats, classements et outils pensés pour toute la famille.\n\n` +
        `📌 Toutes ces commandes sont à utiliser dans ${BOT_CHANNEL}\n\n` +
        `**3 étapes pour être opérationnel :**`
      )
      .addFields(
        {
          name: '1️⃣  Lier ton compte Brawl Stars',
          value: [
            '`/lier #TONTAG`',
            'Connecte ton compte BS au serveur. Ton tag se trouve dans le jeu → **Profil** → à côté de ton nom.',
            '> *Exemple : `/lier #2ABC123`*',
            '> Le bot vérifie que le tag existe bien dans Brawl Stars.',
            '> Tu peux lier jusqu\'à **5 comptes** (utile si tu joues sur plusieurs comptes).',
          ].join('\n'),
        },
        {
          name: '2️⃣  Gérer tes comptes liés',
          value: [
            '`/settings`',
            'Ajoute, supprime ou change ton **compte principal** via un panneau interactif.',
            '> Le compte principal détermine ton rang Prairie, ta carte de profil et tes rôles sur le serveur.',
          ].join('\n'),
        },
        {
          name: '3️⃣  Consulter ton profil',
          value: [
            '`/profil` ou `/profil @membre`',
            'Ton profil Prairie complet : trophées, brawlers débloqués, rang dans les clubs, et tes 25 dernières parties.',
            '> Tu peux aussi consulter le profil de n\'importe quel autre membre.',
          ].join('\n'),
        },
        {
          name: '💡 Bon à savoir',
          value: [
            '• Tes **rôles** (club, palier de trophées) sont mis à jour automatiquement toutes les 30 min',
            '• Si tu changes de club dans le jeu, le bot le détecte tout seul',
            '• Utilise `/help` pour un récap de toutes les commandes disponibles',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Bot Prairie • /help pour un récap rapide de toutes les commandes' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
