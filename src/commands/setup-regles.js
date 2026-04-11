const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-regles')
    .setDescription('Affiche les règles du serveur dans le salon dédié (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.client.channels.fetch('1492210904375234754');
    if (!channel) {
      return interaction.editReply({ content: '❌ Salon des règles introuvable.' });
    }

    // ── Message 1 : Introduction ──────────────────────────
    const embed1 = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📜 Règlement de La Prairie')
      .setDescription(
        'Bienvenue sur le serveur officiel de la famille Prairie 🌿\n\n' +
        'Ce serveur réunit **7 clubs et 300+ membres actifs** autour de Brawl Stars.\n' +
        'Pour que tout le monde soit bien ici, merci de respecter les règles suivantes.\n\n' +
        '*Le non-respect de ces règles peut entraîner un avertissement, une exclusion temporaire ou définitive.*'
      )
      .setThumbnail('https://cdn.brawlify.com/club-badges/regular/8000000.png');

    // ── Message 2 : Règles générales ─────────────────────
    const embed2 = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🤝 Règles générales')
      .addFields(
        {
          name: '1️⃣ Respect',
          value: 'Le respect est obligatoire envers tous les membres, sans exception. Aucune insulte, moquerie ou comportement toxique ne sera toléré.',
          inline: false,
        },
        {
          name: '2️⃣ Pas de spam',
          value: 'Évite les messages répétitifs, les mentions abusives et les floods dans les salons.',
          inline: false,
        },
        {
          name: '3️⃣ Pas de discrimination',
          value: 'Tout propos sexiste, raciste, homophobe ou discriminatoire entraîne un ban immédiat.',
          inline: false,
        },
        {
          name: '4️⃣ Contenu approprié',
          value: 'Aucun contenu NSFW, choquant ou illégal n\'est autorisé sur ce serveur.',
          inline: false,
        },
        {
          name: '5️⃣ Pub & liens',
          value: 'Aucune publicité pour d\'autres serveurs Discord ou réseaux sociaux sans accord du staff.',
          inline: false,
        },
      );

    // ── Message 3 : Règles Prairie BS ────────────────────
    const embed3 = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('🌿 Règles de la famille Prairie')
      .addFields(
        {
          name: '🎮 Discord obligatoire',
          value: 'Être membre d\'un club Prairie implique d\'être présent sur ce serveur Discord.',
          inline: false,
        },
        {
          name: '📅 Activité',
          value: 'Une inactivité prolongée sans absence déclarée peut entraîner une exclusion du club. Pense à utiliser `/absence` si tu t\'absentes !',
          inline: false,
        },
        {
          name: '🏆 Events de club',
          value: 'La participation aux events de club est obligatoire selon les règles de ton club. Renseigne-toi auprès de ton staff.',
          inline: false,
        },
        {
          name: '🔗 Lier son compte',
          value: 'Nous t\'encourageons à lier ton compte Brawl Stars avec `/lier` pour apparaître dans le classement Prairie et profiter de toutes les fonctionnalités du bot.',
          inline: false,
        },
        {
          name: '🎙️ Vocal',
          value: 'Comportement correct obligatoire en vocal. Pas de bruit de fond excessif, respecte les autres.',
          inline: false,
        },
      );

    // ── Message 4 : Staff & sanctions ────────────────────
    const embed4 = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('🛡️ Staff & sanctions')
      .addFields(
        {
          name: '⚠️ Avertissement',
          value: 'Première infraction mineure → avertissement du staff.',
          inline: true,
        },
        {
          name: '🔇 Mute',
          value: 'Comportement répété → mute temporaire.',
          inline: true,
        },
        {
          name: '🚪 Kick',
          value: 'Infraction grave ou récidive → exclusion du serveur.',
          inline: true,
        },
        {
          name: '🔨 Ban',
          value: 'Infraction très grave (discrimination, pub, etc.) → ban définitif.',
          inline: true,
        },
        {
          name: '\u200b', value: '\u200b', inline: true,
        },
        {
          name: '\u200b', value: '\u200b', inline: true,
        },
        {
          name: '📩 Contacter le staff',
          value: 'Une question ou un problème ? Ouvre un ticket dans le salon dédié ou ping directement un membre du staff.',
          inline: false,
        },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Règlement v1.0 • Ces règles sont susceptibles d\'évoluer' })
      .setTimestamp();

    // Supprime les anciens messages du salon
    try {
      const messages = await channel.messages.fetch({ limit: 20 });
      const botMessages = messages.filter(m => m.author.id === interaction.client.user.id);
      for (const msg of botMessages.values()) {
        await msg.delete();
      }
    } catch {}

    // Envoie les 4 embeds
    await channel.send({ embeds: [embed1] });
    await channel.send({ embeds: [embed2] });
    await channel.send({ embeds: [embed3] });
    await channel.send({ embeds: [embed4] });

    await interaction.editReply({ content: '✅ Règles publiées dans le salon !' });
  }
};