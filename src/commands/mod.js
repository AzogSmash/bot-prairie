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
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('membre').setDescription('Filtrer par membre').setRequired(false))
  );

function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.roles.cache.has(process.env.MOD_ROLE_ID);
}

async function sendLog(guild, action, moderator, target, raison, extra = '') {
  const colors = {
    warn: '#f39c12', mute: '#e67e22', unmute: '#2ecc71',
    kick: '#e74c3c', tempban: '#c0392b', ban: '#922b21', unban: '#27ae60', clear: '#3498db'
  };
  const icons = {
    warn: '⚠️', mute: '🔇', unmute: '🔊', kick: '👢',
    tempban: '⏱️🔨', ban: '🔨', unban: '✅', clear: '🗑️'
  };

  const channel = guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(colors[action] || '#95a5a6')
    .setTitle(`${icons[action]} ${action.toUpperCase()}`)
    .addFields(
      { name: '👤 Cible', value: target ? `${target} \`${target.id || target}\`` : 'Inconnu', inline: true },
      { name: '🛡️ Modérateur', value: `${moderator}`, inline: true },
      { name: '💬 Raison', value: raison || 'Aucune raison', inline: false },
    );

  if (extra) embed.addFields({ name: 'ℹ️ Info', value: extra, inline: false });
  embed.setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function tryDM(user, embed) {
  try { await user.send({ embeds: [embed] }); } catch {}
}

module.exports = {
  data: MOD_COMMANDS,

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const moderator = interaction.user;

    // ── WARN ─────────────────────────────────────────────
    if (sub === 'warn') {
      const target = interaction.options.getUser('membre');
      const raison = interaction.options.getString('raison') || 'Aucune raison';
      const member = guild.members.cache.get(target.id);

      await tryDM(target, new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ Vous avez reçu un avertissement')
        .setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await sendLog(guild, 'warn', moderator, target, raison);
      return interaction.editReply({ content: `✅ **${target.username}** a été averti.` });
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
      return interaction.editReply({ content: `✅ **${target.username}** a été mute pour ${duree} minute(s).` });
    }

    // ── UNMUTE ───────────────────────────────────────────
    if (sub === 'unmute') {
      const target = interaction.options.getUser('membre');
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await member.timeout(null);

      await sendLog(guild, 'unmute', moderator, target, 'Unmute manuel');
      return interaction.editReply({ content: `✅ **${target.username}** a été unmute.` });
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
      return interaction.editReply({ content: `✅ **${target.username}** a été expulsé.` });
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

      // Unban automatique après la durée
      setTimeout(async () => {
        try {
          await guild.members.unban(target.id, 'Tempban expiré');
          await sendLog(guild, 'unban', { username: 'Bot automatique' }, target, 'Tempban expiré');
        } catch {}
      }, duree * 24 * 60 * 60 * 1000);

      return interaction.editReply({ content: `✅ **${target.username}** a été banni pour ${duree} jour(s).` });
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
      return interaction.editReply({ content: `✅ **${target.username}** a été banni.` });
    }

    // ── UNBAN ────────────────────────────────────────────
    if (sub === 'unban') {
      const id = interaction.options.getString('id');
      try {
        await guild.members.unban(id);
        await sendLog(guild, 'unban', moderator, { id, username: id }, 'Unban manuel');
        return interaction.editReply({ content: `✅ L'utilisateur \`${id}\` a été débanni.` });
      } catch {
        return interaction.editReply({ content: '❌ Impossible de débannir cet utilisateur.' });
      }
    }

    // ── CLEAR ────────────────────────────────────────────
    if (sub === 'clear') {
      const nombre = interaction.options.getInteger('nombre');
      const membre = interaction.options.getUser('membre');

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (membre) messages = messages.filter(m => m.author.id === membre.id);
      const toDelete = [...messages.values()].slice(0, nombre);

      await interaction.channel.bulkDelete(toDelete, true);
      await sendLog(guild, 'clear', moderator, membre || { username: 'Tous', id: 'N/A' }, `${toDelete.length} message(s) supprimé(s)`, `Salon : ${interaction.channel}`);
      return interaction.editReply({ content: `✅ **${toDelete.length}** message(s) supprimé(s).` });
    }
  }
};