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

      // ── Brawl Stars ───────────────────────────────────────
      .addFields({
        name: '🎮 Brawl Stars',
        value: [
          '`/lier` — Lie ton compte Brawl Stars à ton profil Prairie',
          '`/profil` — Affiche ton profil complet ou celui d\'un membre',
          '`/classement` — Classement Prairie par trophées avec filtres par club',
          '`/clubs` — Vue globale des 7 clubs en temps réel',
        ].join('\n'),
        inline: false,
      })

      // ── Absences ──────────────────────────────────────────
      .addFields({
        name: '📋 Absences',
        value: [
          '`/absence` — Déclare une absence via formulaire',
          '`/absences` — Liste les absences avec filtres par club et période',
          '`/absence-annuler` — Annule une de tes absences actives',
        ].join('\n'),
        inline: false,
      })

      // ── Aide ──────────────────────────────────────────────
      .addFields({
        name: '❓ Aide',
        value: '`/help` — Affiche ce message',
        inline: false,
      })

      // ── Staff ─────────────────────────────────────────────
      .addFields({
        name: '🔒 Staff Prairie',
        value: [
          '`/absence @membre` — Créer une absence pour un membre',
          '`/absence-annuler @membre` — Annuler l\'absence d\'un membre',
          '`/absences` — Voir toutes les absences + annuler celles des membres',
          '`/config-club` — Modifier les infos d\'un club (description, trophées requis, records)',
          '`/reset-panels` — Réinitialise les panels du salon infos-clubs',
          '`/setup-regles` — Publie/met à jour le règlement dans le salon dédié',
        ].join('\n'),
        inline: false,
      })

      // ── Bon à savoir ──────────────────────────────────────
      .addFields({
        name: '💡 Bon à savoir',
        value: [
          '• `/profil` et `/classement` fonctionnent uniquement après `/lier`',
          '• Les stats BS sont récupérées en temps réel depuis l\'API Brawl Stars',
          '• Les panels clubs se mettent à jour automatiquement toutes les heures',
          '• Le classement affiche tous les membres des 7 clubs, liés ou non',
          `• Un problème ? Ping <@&${process.env.TECH_ROLE_ID}> 🛠️`,
        ].join('\n'),
        inline: false,
      })

      .setFooter({ text: 'Prairie Brawl Stars • Bot officiel de la famille Prairie' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};