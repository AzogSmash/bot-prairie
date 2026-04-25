const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const MOD_COMMANDS = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Commandes de modération')
  .addSubcommand(sub => sub
    .setName('warn')
    .setDescription('Avertir un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('mute')
    .setDescription('Mute un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('unmute')
    .setDescription('Unmute un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('kick')
    .setDescription('Expulser un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('tempban')
    .setDescription('Bannir temporairement un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en jours').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('ban')
    .setDescription('Bannir définitivement un membre')
    .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('unban')
    .setDescription('Débannir un membre')
    .addStringOption(o => o.setName('id').setDescription('ID Discord du membre').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('clear')
    .setDescription('Supprimer des messages')
    .addIntegerOption(o =>
      o.setName('nombre')
        .setDescription('Nombre de messages (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(o => o.setName('membre').setDescription('Filtrer par membre').setRequired(false))
  );

function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.roles.cache.has(process.env.MOD_ROLE_ID);
}

function formatTarget(target) {
  if (!target) return 'Inconnu';

  if (target.id && typeof target.toString === 'function' && target.toString() !== '[object Object]') {
    return `${target} \`${target.id}\``;
  }

  if (target.id) {
    return `${target.username || 'Utilisateur'} \`${target.id}\``;
  }

  return String(target);
}

async function sendLog(guild, action, moderator, target, raison, extra = '') {
  const colors = {
    warn: '#f39c12',
    mute: '#e67e22',
    unmute: '#2ecc71',
    kick: '#e74c3c',
    tempban: '#c0392b',
    ban: '#922b21',
    unban: '#27ae60',
    clear: '#3498db',
  };

  const icons = {
    warn: '⚠️',
    mute: '🔇',
    unmute: '🔊',
    kick: '👢',
    tempban: '⏱️🔨',
    ban: '🔨',
    unban: '✅',
    clear: '🗑️',
  };

  const channel = guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(colors[action] || '#95a5a6')
    .setTitle(`${icons[action] || 'ℹ️'} ${action.toUpperCase()}`)
    .addFields(
      { name: '👤 Cible', value: formatTarget(target), inline: true },
      { name: '🛡️ Modérateur', value: `${moderator}`, inline: true },
      { name: '💬 Raison', value: raison || 'Aucune raison', inline: false },
    )
    .setTimestamp();

  if (extra) {
    embed.addFields({ name: 'ℹ️ Info', value: extra, inline: false });
  }

  await channel.send({ embeds: [embed] });
}

async function tryDM(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch {}
}

function buildPublicModConfirm(action, moderator, target, raison, extra = '') {
  const labels = {
    warn: 'Avertissement',
    mute: 'Mute',
    unmute: 'Unmute',
    kick: 'Expulsion',
    tempban: 'Bannissement temporaire',
    ban: 'Bannissement définitif',
    unban: 'Débannissement',
    clear: 'Suppression de messages',
  };

  const colors = {
    warn: '#f39c12',
    mute: '#e67e22',
    unmute: '#2ecc71',
    kick: '#e74c3c',
    tempban: '#c0392b',
    ban: '#922b21',
    unban: '#27ae60',
    clear: '#3498db',
  };

  const icons = {
    warn: '⚠️',
    mute: '🔇',
    unmute: '🔊',
    kick: '👢',
    tempban: '⏱️🔨',
    ban: '🔨',
    unban: '✅',
    clear: '🗑️',
  };

  const embed = new EmbedBuilder()
    .setColor(colors[action] || '#95a5a6')
    .setTitle(`${icons[action] || '✅'} ${labels[action] || action} effectué`)
    .addFields(
      { name: '👤 Membre concerné', value: formatTarget(target), inline: false },
      { name: '🛡️ Action réalisée par', value: `${moderator}`, inline: false },
      { name: '💬 Raison', value: raison || 'Aucune raison', inline: false },
    )
    .setTimestamp();

  if (extra) {
    embed.addFields({ name: 'ℹ️ Détail', value: extra, inline: false });
  }

  return embed;
}

module.exports = {
  data: MOD_COMMANDS,

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const moderator = interaction.user;

    // ── WARN ─────────────────────────────────────────────
    if (sub === 'warn') {
      const target = interaction.options.getUser('membre');
      const raison = interaction.options.getString('raison') || 'Aucune raison';

      await tryDM(target, new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ Vous avez reçu un avertissement')
        .setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await sendLog(guild, 'warn', moderator, target, raison);

      return interaction.editReply({
        embeds: [buildPublicModConfirm('warn', moderator, target, raison)],
      });
    }

    // ── MUTE ─────────────────────────────────────────────
    if (sub === 'mute') {
      const target = interaction.options.getUser('membre');
      const duree = interaction.options.getInteger('duree');
      const raison = interaction.options.getString('raison') || 'Aucune raison';
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      const ms = duree * 60 * 1000;
      await member.timeout(ms, raison);

      await tryDM(target, new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🔇 Vous avez été mute')
        .setDescription(`**Serveur :** ${guild.name}\n**Durée :** ${duree} minute(s)\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await sendLog(guild, 'mute', moderator, target, raison, `Durée : ${duree} minute(s)`);

      return interaction.editReply({
        embeds: [
          buildPublicModConfirm(
            'mute',
            moderator,
            target,
            raison,
            `Durée : **${duree} minute(s)**`
          ),
        ],
      });
    }

    // ── UNMUTE ───────────────────────────────────────────
    if (sub === 'unmute') {
      const target = interaction.options.getUser('membre');
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await member.timeout(null);

      await sendLog(guild, 'unmute', moderator, target, 'Unmute manuel');

      return interaction.editReply({
        embeds: [buildPublicModConfirm('unmute', moderator, target, 'Unmute manuel')],
      });
    }

    // ── KICK ─────────────────────────────────────────────
    if (sub === 'kick') {
      const target = interaction.options.getUser('membre');
      const raison = interaction.options.getString('raison') || 'Aucune raison';
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await tryDM(target, new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('👢 Vous avez été expulsé')
        .setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await member.kick(raison);
      await sendLog(guild, 'kick', moderator, target, raison);

      return interaction.editReply({
        embeds: [buildPublicModConfirm('kick', moderator, target, raison)],
      });
    }

    // ── TEMPBAN ──────────────────────────────────────────
    if (sub === 'tempban') {
      const target = interaction.options.getUser('membre');
      const duree = interaction.options.getInteger('duree');
      const raison = interaction.options.getString('raison') || 'Aucune raison';
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await tryDM(target, new EmbedBuilder()
        .setColor('#c0392b')
        .setTitle('⏱️🔨 Vous avez été banni temporairement')
        .setDescription(`**Serveur :** ${guild.name}\n**Durée :** ${duree} jour(s)\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await guild.members.ban(target.id, { reason: raison, deleteMessageDays: 1 });
      await sendLog(guild, 'tempban', moderator, target, raison, `Durée : ${duree} jour(s)`);

      setTimeout(async () => {
        try {
          await guild.members.unban(target.id, 'Tempban expiré');
          await sendLog(guild, 'unban', { username: 'Bot automatique', id: 'AUTO' }, target, 'Tempban expiré');
        } catch {}
      }, duree * 24 * 60 * 60 * 1000);

      return interaction.editReply({
        embeds: [
          buildPublicModConfirm(
            'tempban',
            moderator,
            target,
            raison,
            `Durée : **${duree} jour(s)**`
          ),
        ],
      });
    }

    // ── BAN ──────────────────────────────────────────────
    if (sub === 'ban') {
      const target = interaction.options.getUser('membre');
      const raison = interaction.options.getString('raison') || 'Aucune raison';

      await tryDM(target, new EmbedBuilder()
        .setColor('#922b21')
        .setTitle('🔨 Vous avez été banni définitivement')
        .setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await guild.members.ban(target.id, { reason: raison, deleteMessageDays: 1 });
      await sendLog(guild, 'ban', moderator, target, raison);

      return interaction.editReply({
        embeds: [buildPublicModConfirm('ban', moderator, target, raison)],
      });
    }

    // ── UNBAN ────────────────────────────────────────────
    if (sub === 'unban') {
      const id = interaction.options.getString('id');

      try {
        await guild.members.unban(id);
        const target = { id, username: id };

        await sendLog(guild, 'unban', moderator, target, 'Unban manuel');

        return interaction.editReply({
          embeds: [buildPublicModConfirm('unban', moderator, target, 'Unban manuel')],
        });
      } catch {
        return interaction.editReply({ content: '❌ Impossible de débannir cet utilisateur.' });
      }
    }

    // ── CLEAR ────────────────────────────────────────────
    if (sub === 'clear') {
      const nombre = interaction.options.getInteger('nombre');
      const membre = interaction.options.getUser('membre');

      let messages = await interaction.channel.messages.fetch({ limit: 100 });

      if (membre) {
        messages = messages.filter(m => m.author.id === membre.id);
      }

      const toDelete = [...messages.values()].slice(0, nombre);

      await interaction.channel.bulkDelete(toDelete, true);

      const target = membre || { username: 'Tous les membres', id: 'N/A' };
      const raison = `${toDelete.length} message(s) supprimé(s)`;
      const extra = `Salon : ${interaction.channel}`;

      await sendLog(guild, 'clear', moderator, target, raison, extra);

      return interaction.editReply({
        embeds: [
          buildPublicModConfirm(
            'clear',
            moderator,
            target,
            raison,
            extra
          ),
        ],
      });
    }
  },
};