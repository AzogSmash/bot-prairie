const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi-help')
    .setDescription('Affiche le guide complet pour organiser un tournoi (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('📖 Guide — Organiser un tournoi Prairie')
      .setDescription('Guide complet pour les staffs. Suis les étapes dans l\'ordre !')
      .addFields(
        {
          name: '1️⃣ Créer le tournoi',
          value:
            '`/tournoi-créer` — Définis le nom et le nombre total d\'équipes (8, 12, 16, 24, 32 ou 48).\n' +
            'Le tournoi est créé en statut **ouvert**.',
          inline: false,
        },
        {
          name: '2️⃣ Composer les équipes — deux modes au choix',
          value:
            '**Mode auto** *(équipes générées automatiquement)* :\n' +
            '→ `/tournoi-participants` — inscrit les joueurs via un rôle ou des mentions, elos récupérés automatiquement.\n' +
            '→ `/tournoi-composer` — crée des équipes équilibrées (snake draft + optimisation) **et** génère le bracket.\n' +
            '⚠️ Relancer `/tournoi-participants` **efface et réinscrit toute la liste** — à éviter sauf pour tout reprendre.\n\n' +
            '**Mode manuel** *(tu choisis toi-même les membres de chaque équipe)* :\n' +
            '→ `/tournoi-equipe-manuel` — ajoute une équipe à la fois (membres spécifiés, elo récupéré auto). Répète pour chaque équipe.\n' +
            '→ `/tournoi-composer` une seule fois à la fin — génère uniquement le bracket sans toucher aux équipes déjà créées.',
          inline: false,
        },
        {
          name: '3️⃣ Ajuster les équipes si besoin',
          value:
            '`/tournoi-ajuster` — Modifie l\'elo d\'un membre, échange deux membres entre équipes, ou place un remplaçant.\n\n' +
            'Après toute modification, relance `/tournoi-composer` pour régénérer le bracket.\n' +
            '→ Les équipes sont **conservées** — seule la structure des matchs est recréée.',
          inline: false,
        },
        {
          name: '4️⃣ Afficher le bracket',
          value:
            '`/tournoi-bracket` — Envoie l\'image visuelle du bracket dans le salon tournoi.\n' +
            'L\'image se met à jour **automatiquement** à chaque résultat entré — pas besoin de la renvoyer.\n\n' +
            '⚠️ Lance cette commande seulement quand les équipes sont **définitives** : c\'est le moment où les membres découvrent les groupes.',
          inline: false,
        },
        {
          name: '5️⃣ Pronos des membres',
          value:
            '`/pronostic` — Les membres font leurs pronostics sur tout le bracket, match par match. Le bracket se débloque progressivement selon leurs choix.\n' +
            'Les pronos restent ouverts jusqu\'au `/tournoi-démarrer`.',
          inline: false,
        },
        {
          name: '6️⃣ Publier les tendances (optionnel)',
          value:
            'Lance `/pronostic` et soumets tes pronos — un bouton **📢 Publier les tendances dans #annonces** apparaît (staff uniquement).\n' +
            'L\'embed montre le favori et les % de votes pour chaque match, sans révéler qui a voté quoi.',
          inline: false,
        },
        {
          name: '7️⃣ Démarrer le tournoi',
          value:
            '`/tournoi-démarrer` — Verrouille tous les pronos existants et passe le tournoi en statut **started**.\n' +
            'Plus personne ne peut voter ou modifier ses pronos après ça.',
          inline: false,
        },
        {
          name: '8️⃣ Entrer les résultats',
          value:
            'Dans `/tournoi-bracket` → menu **🛡️ Staff — Entrer le résultat d\'un match** → choisis un match → désigne le gagnant.\n' +
            'L\'image du bracket se met à jour automatiquement. La propagation vers les rounds suivants se fait en base.\n\n' +
            '**Corriger une erreur :**\n' +
            '• Un seul résultat → bouton **✏️ Modifier un résultat** dans `/tournoi-bracket`.\n' +
            '• Plusieurs résultats → `/tournoi-bracket-reset` (réinitialise tous les résultats — équipes et pronos conservés).',
          inline: false,
        },
        {
          name: '9️⃣ Terminer le tournoi',
          value:
            '`/tournoi-terminer` — Calcule les scores finaux des pronos et affiche le classement.\n\n' +
            '**Système de points (tout-ou-rien par bloc) :**\n' +
            '🏅 1pt si **TOUS** les matchs de la poule gauche sont corrects\n' +
            '🏅 1pt si **TOUS** les matchs de la poule droite sont corrects\n' +
            '🏅 1pt si la grande finale est correcte\n' +
            '⚠️ Un seul mauvais pronostic dans une poule suffit à perdre le point de ce bloc.',
          inline: false,
        },
        {
          name: '🔧 Commandes utiles',
          value:
            '`/tournoi-bracket-reset` — Réinitialise tous les résultats (confirmation requise). Équipes et pronos conservés. Utile pour corriger plusieurs erreurs d\'un coup.\n' +
            '`/tournoi-help` — Affiche ce guide.',
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Staff uniquement' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
