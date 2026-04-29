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
      .setDescription('Guide complet pour les staffs. Suivez les étapes dans l\'ordre !')
      .addFields(
        {
          name: '1️⃣ Créer le tournoi',
          value: '`/tournoi-créer` — Définit le nom et la taille du tournoi (8, 12, 16, 24, 32 ou 48 équipes).\nLe tournoi est créé en statut **ouvert**.',
          inline: false,
        },
        {
          name: '2️⃣ Inscrire les joueurs (mode auto uniquement)',
          value: '`/tournoi-participants` — Inscrit les joueurs via un rôle Discord ou une liste de mentions. Récupère automatiquement les elos ranked de chacun via l\'API.\n*Passe cette étape si tu crées les équipes manuellement.*',
          inline: false,
        },
        {
          name: '3️⃣ Composer les équipes',
          value: '**Mode auto** : `/tournoi-composer` — Génère des équipes équilibrées automatiquement via snake draft + optimisation, puis crée le bracket en BDD.\n\n**Mode manuel** : `/tournoi-equipe-manuel` — Crée les équipes une par une en spécifiant les membres Discord. L\'elo est récupéré automatiquement. Une fois toutes les équipes créées, lance `/tournoi-composer` pour générer le bracket.',
          inline: false,
        },
        {
          name: '4️⃣ Ajuster les équipes si besoin',
          value: '`/tournoi-ajuster` — Modifie l\'elo d\'un membre ou échange deux membres entre équipes.\n`/tournoi-remplacer` — Remplace un membre par un remplaçant inscrit au tournoi.\n⚠️ Si tu modifies des équipes après `/tournoi-composer`, relance `/tournoi-composer` pour régénérer le bracket.',
          inline: false,
        },
        {
          name: '5️⃣ Afficher le bracket',
          value: '`/tournoi-bracket` — Génère l\'image visuelle du bracket et l\'envoie dans le salon tournoi. L\'image restera au même endroit et se mettra à jour automatiquement à chaque résultat.\n⚠️ Ne lance cette commande que lorsque les équipes sont **définitives** — c\'est le moment où les membres découvrent les équipes.',
          inline: false,
        },
        {
          name: '6️⃣ Pronos des membres',
          value: '`/pronostic` — Les membres peuvent faire leurs pronostics sur **tout le bracket** (tous les rounds, byes inclus) dès que le bracket est visible.\nIls prédisent match par match, le bracket se débloque progressivement selon leurs choix.\nLes pronos restent ouverts jusqu\'au `/tournoi-démarrer`.',
          inline: false,
        },
        {
          name: '7️⃣ Publier les tendances',
          value: 'Fais `/pronostic` puis soumets tes pronos — un bouton **📢 Publier les tendances dans #annonces** apparaît (staff uniquement).\nL\'embed publié montre pour chaque match le favori et les % de votes, sans révéler qui a voté quoi.',
          inline: false,
        },
        {
          name: '8️⃣ Démarrer le tournoi',
          value: '`/tournoi-démarrer` — Verrouille tous les pronos existants et passe le tournoi en statut **started**.\nPlus personne ne peut voter ou modifier ses pronos après ça.',
          inline: false,
        },
        {
          name: '9️⃣ Entrer les résultats',
          value: '`/tournoi-bracket` — Utilise le menu **🛡️ Staff — Entrer le résultat d\'un match** pour sélectionner un match et désigner le gagnant.\nL\'image du bracket se met à jour automatiquement et la propagation vers les rounds suivants se fait en BDD.\nPour corriger une erreur : bouton **✏️ Modifier un résultat**.',
          inline: false,
        },
        {
          name: '🔟 Terminer le tournoi',
          value: '`/tournoi-terminer` — Calcule les scores finaux des pronos et affiche le classement.\n🥇 1pt si toute la poule gauche correcte • 🥈 1pt si toute la poule droite correcte • 🥉 1pt si la grande finale correcte.',
          inline: false,
        },
        {
          name: '🔧 Commandes utiles',
          value: '`/tournoi-bracket-reset` — Réinitialise tous les résultats du tournoi (confirmation requise). Les équipes et pronos sont conservés. Utile pour corriger plusieurs erreurs d\'un coup.\n\n`/tournoi-help` — Affiche ce guide.',
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Staff uniquement' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};