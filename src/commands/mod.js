const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { supabase } = require('../lib/supabase');

// ─────────────────────────────────────────────
// STORE EN MÉMOIRE — évite les customId trop longs
// clé : token court (6 chars), valeur : { warnId, warnUserId, filterUserId, page }
// TTL : 30 minutes
// ─────────────────────────────────────────────
const warnStore = new Map();
const STORE_TTL = 30 * 60 * 1000;

function storeWarnContext(warnId, warnUserId, filterUserId, page) {
  const token = Math.random().toString(36).slice(2, 8);
  warnStore.set(token, {
    warnId,
    warnUserId,
    filterUserId,
    page,
    expires: Date.now() + STORE_TTL,
  });
  // Nettoyage des entrées expirées
  for (const [k, v] of warnStore) {
    if (v.expires < Date.now()) warnStore.delete(k);
  }
  return token;
}

function getWarnContext(token) {
  const ctx = warnStore.get(token);
  if (!ctx || ctx.expires < Date.now()) return null;
  return ctx;
}

// ─────────────────────────────────────────────
// SLASH COMMAND BUILDER
// ─────────────────────────────────────────────
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
  )
  .addSubcommand(sub => sub
    .setName('sanction')
    .setDescription('Voir et gérer les avertissements du serveur')
    .addUserOption(o => o.setName('membre').setDescription('Filtrer par membre (optionnel)').setRequired(false))
  );

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────
function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.roles.cache.has(process.env.MOD_ROLE_ID);
}

function formatTarget(target) {
  if (!target) return 'Inconnu';
  if (target.id && typeof target.toString === 'function' && target.toString() !== '[object Object]') {
    return `${target} \`${target.id}\``;
  }
  if (target.id) return `${target.username || 'Utilisateur'} \`${target.id}\``;
  return String(target);
}

async function sendLog(guild, action, moderator, target, raison, extra = '') {
  const colors = { warn: '#f39c12', mute: '#e67e22', unmute: '#2ecc71', kick: '#e74c3c', tempban: '#c0392b', ban: '#922b21', unban: '#27ae60', clear: '#3498db' };
  const icons = { warn: '⚠️', mute: '🔇', unmute: '🔊', kick: '👢', tempban: '⏱️🔨', ban: '🔨', unban: '✅', clear: '🗑️' };

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

  if (extra) embed.addFields({ name: 'ℹ️ Info', value: extra, inline: false });
  await channel.send({ embeds: [embed] });
}

async function tryDM(user, embed) {
  try { await user.send({ embeds: [embed] }); } catch {}
}

function buildPublicModConfirm(action, moderator, target, raison, extra = '') {
  const labels = { warn: 'Avertissement', mute: 'Mute', unmute: 'Unmute', kick: 'Expulsion', tempban: 'Bannissement temporaire', ban: 'Bannissement définitif', unban: 'Débannissement', clear: 'Suppression de messages' };
  const colors = { warn: '#f39c12', mute: '#e67e22', unmute: '#2ecc71', kick: '#e74c3c', tempban: '#c0392b', ban: '#922b21', unban: '#27ae60', clear: '#3498db' };
  const icons = { warn: '⚠️', mute: '🔇', unmute: '🔊', kick: '👢', tempban: '⏱️🔨', ban: '🔨', unban: '✅', clear: '🗑️' };

  const embed = new EmbedBuilder()
    .setColor(colors[action] || '#95a5a6')
    .setTitle(`${icons[action] || '✅'} ${labels[action] || action} effectué`)
    .addFields(
      { name: '👤 Membre concerné', value: formatTarget(target), inline: false },
      { name: '🛡️ Action réalisée par', value: `${moderator}`, inline: false },
      { name: '💬 Raison', value: raison || 'Aucune raison', inline: false },
    )
    .setTimestamp();

  if (extra) embed.addFields({ name: 'ℹ️ Détail', value: extra, inline: false });
  return embed;
}

// ─────────────────────────────────────────────
// SANCTIONS — HELPERS
// ─────────────────────────────────────────────
const WARNS_PER_PAGE = 3;

async function resolveTargetUser(client, userIdStr) {
  if (!userIdStr || userIdStr === 'null') return null;
  try { return await client.users.fetch(userIdStr); } catch { return null; }
}

// filterUserId : ID Discord du filtre membre, ou 'null' pour vue globale
async function buildSanctionPage(guild, client, filterUserId, page) {
  const targetUser = await resolveTargetUser(client, filterUserId);

  let query = supabase
    .from('warns')
    .select('*')
    .eq('guild_id', guild.id)
    .order('created_at', { ascending: false });

  if (targetUser) query = query.eq('user_id', targetUser.id);

  const { data: warns, error } = await query;
  if (error) throw new Error(error.message);

  const total = warns.length;
  const totalPages = Math.max(1, Math.ceil(total / WARNS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = warns.slice(safePage * WARNS_PER_PAGE, safePage * WARNS_PER_PAGE + WARNS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle(targetUser ? `📋 Sanctions de ${targetUser.username}` : '📋 Toutes les sanctions du serveur')
    .setFooter({ text: `${total} avertissement(s)  •  Page ${safePage + 1}/${totalPages}` })
    .setTimestamp();

  if (targetUser) embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

  if (total === 0) {
    embed.setDescription(targetUser ? '✅ Aucun avertissement pour ce membre.' : '✅ Aucun avertissement sur ce serveur.');
  } else {
    for (const warn of slice) {
      const date = new Date(warn.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      embed.addFields({
        name: `⚠️ Warn \`${warn.id.slice(0, 8)}\` — ${date}`,
        value: `👤 **Membre :** <@${warn.user_id}>\n💬 **Raison :** ${warn.raison}\n🛡️ **Modérateur :** <@${warn.moderator_id}>`,
        inline: false,
      });
    }
  }

  // Boutons navigation — customId court : "s_prev:filterUserId:page"
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`s_prev:${filterUserId || 'null'}:${safePage}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`s_next:${filterUserId || 'null'}:${safePage}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );

  const rows = [navRow];

  for (const warn of slice) {
    const shortId = warn.id.slice(0, 8);
    // Stocker le contexte dans la Map, récupérer un token court
    const editToken = storeWarnContext(warn.id, warn.user_id, filterUserId || 'null', safePage);
    const delToken = storeWarnContext(warn.id, warn.user_id, filterUserId || 'null', safePage);

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`s_edit:${editToken}`)
          .setLabel(`✏️ Modifier ${shortId}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`s_del:${delToken}`)
          .setLabel(`🗑️ Supprimer ${shortId}`)
          .setStyle(ButtonStyle.Danger),
      )
    );
  }

  return { embed, rows, safePage, total };
}

// ─────────────────────────────────────────────
// HANDLER BOUTONS & MODALS
// ─────────────────────────────────────────────
async function handleSanctionInteraction(interaction) {
  if (interaction.isButton()) {
    const [action, ...parts] = interaction.customId.split(':');
    if (!['s_prev', 's_next', 's_del', 's_edit'].includes(action)) return false;

    if (!isMod(interaction.member)) {
      await interaction.reply({ content: "❌ Tu n'as pas la permission.", flags: 64 });
      return true;
    }

    // ── Navigation ────────────────────────────
    if (action === 's_prev' || action === 's_next') {
      const [filterUserId, pageStr] = parts;
      const newPage = action === 's_prev' ? parseInt(pageStr) - 1 : parseInt(pageStr) + 1;
      const { embed, rows } = await buildSanctionPage(interaction.guild, interaction.client, filterUserId, newPage);
      await interaction.update({ embeds: [embed], components: rows });
      return true;
    }

    // ── Suppression ───────────────────────────
    if (action === 's_del') {
      const token = parts[0];
      const ctx = getWarnContext(token);

      if (!ctx) {
        await interaction.reply({ content: '❌ Interaction expirée, relance `/mod sanction`.', flags: 64 });
        return true;
      }

      const { error } = await supabase.from('warns').delete().eq('id', ctx.warnId);
      if (error) {
        await interaction.reply({ content: '❌ Erreur lors de la suppression.', flags: 64 });
        return true;
      }

      warnStore.delete(token);
      const { embed, rows } = await buildSanctionPage(interaction.guild, interaction.client, ctx.filterUserId, ctx.page);
      await interaction.update({ embeds: [embed], components: rows });

      const warnedUser = await resolveTargetUser(interaction.client, ctx.warnUserId);
      await sendLog(interaction.guild, 'warn', interaction.user, warnedUser || { id: ctx.warnUserId, username: ctx.warnUserId }, `Warn \`${ctx.warnId.slice(0, 8)}\` supprimé manuellement`);
      return true;
    }

    // ── Modifier → Modal ──────────────────────
    if (action === 's_edit') {
      const token = parts[0];
      const ctx = getWarnContext(token);

      if (!ctx) {
        await interaction.reply({ content: '❌ Interaction expirée, relance `/mod sanction`.', flags: 64 });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`s_modal:${token}`)
        .setTitle('Modifier la raison du warn');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nouvelle_raison')
            .setLabel('Nouvelle raison')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
        )
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  // ── Modal submit ──────────────────────────────
  if (interaction.isModalSubmit()) {
    const [action, ...parts] = interaction.customId.split(':');
    if (action !== 's_modal') return false;

    const token = parts[0];
    const ctx = getWarnContext(token);

    if (!ctx) {
      await interaction.reply({ content: '❌ Interaction expirée, relance `/mod sanction`.', flags: 64 });
      return true;
    }

    const nouvelleRaison = interaction.fields.getTextInputValue('nouvelle_raison');

    const { error } = await supabase
      .from('warns')
      .update({ raison: nouvelleRaison })
      .eq('id', ctx.warnId);

    if (error) {
      await interaction.reply({ content: '❌ Erreur lors de la modification.', flags: 64 });
      return true;
    }

    warnStore.delete(token);
    const { embed, rows } = await buildSanctionPage(interaction.guild, interaction.client, ctx.filterUserId, ctx.page);
    await interaction.update({ embeds: [embed], components: rows });

    const warnedUser = await resolveTargetUser(interaction.client, ctx.warnUserId);
    await sendLog(interaction.guild, 'warn', interaction.user, warnedUser || { id: ctx.warnUserId, username: ctx.warnUserId }, `Raison du warn \`${ctx.warnId.slice(0, 8)}\` modifiée → ${nouvelleRaison}`);
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
module.exports = {
  data: MOD_COMMANDS,
  handleSanctionInteraction,

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: "❌ Tu n'as pas la permission.", flags: 64 });
    }

    await interaction.deferReply({ ephemeral: false });

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const moderator = interaction.user;

    // ── WARN ─────────────────────────────────
    if (sub === 'warn') {
      const target = interaction.options.getUser('membre');
      const raison = interaction.options.getString('raison') || 'Aucune raison';

      const { error } = await supabase.from('warns').insert({
        guild_id: guild.id,
        user_id: target.id,
        moderator_id: moderator.id,
        raison,
      });

      if (error) return interaction.editReply({ content: `❌ Erreur BDD : ${error.message}` });

      await tryDM(target, new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ Vous avez reçu un avertissement')
        .setDescription(`**Serveur :** ${guild.name}\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await sendLog(guild, 'warn', moderator, target, raison);
      return interaction.editReply({ embeds: [buildPublicModConfirm('warn', moderator, target, raison)] });
    }

    // ── MUTE ─────────────────────────────────
    if (sub === 'mute') {
      const target = interaction.options.getUser('membre');
      const duree = interaction.options.getInteger('duree');
      const raison = interaction.options.getString('raison') || 'Aucune raison';
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await member.timeout(duree * 60 * 1000, raison);

      await tryDM(target, new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🔇 Vous avez été mute')
        .setDescription(`**Serveur :** ${guild.name}\n**Durée :** ${duree} minute(s)\n**Raison :** ${raison}`)
        .setTimestamp()
      );

      await sendLog(guild, 'mute', moderator, target, raison, `Durée : ${duree} minute(s)`);
      return interaction.editReply({ embeds: [buildPublicModConfirm('mute', moderator, target, raison, `Durée : **${duree} minute(s)**`)] });
    }

    // ── UNMUTE ───────────────────────────────
    if (sub === 'unmute') {
      const target = interaction.options.getUser('membre');
      const member = guild.members.cache.get(target.id);

      if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

      await member.timeout(null);
      await sendLog(guild, 'unmute', moderator, target, 'Unmute manuel');
      return interaction.editReply({ embeds: [buildPublicModConfirm('unmute', moderator, target, 'Unmute manuel')] });
    }

    // ── KICK ─────────────────────────────────
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
      return interaction.editReply({ embeds: [buildPublicModConfirm('kick', moderator, target, raison)] });
    }

    // ── TEMPBAN ──────────────────────────────
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

      return interaction.editReply({ embeds: [buildPublicModConfirm('tempban', moderator, target, raison, `Durée : **${duree} jour(s)**`)] });
    }

    // ── BAN ──────────────────────────────────
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
      return interaction.editReply({ embeds: [buildPublicModConfirm('ban', moderator, target, raison)] });
    }

    // ── UNBAN ────────────────────────────────
    if (sub === 'unban') {
      const id = interaction.options.getString('id');
      try {
        await guild.members.unban(id);
        const target = { id, username: id };
        await sendLog(guild, 'unban', moderator, target, 'Unban manuel');
        return interaction.editReply({ embeds: [buildPublicModConfirm('unban', moderator, target, 'Unban manuel')] });
      } catch {
        return interaction.editReply({ content: '❌ Impossible de débannir cet utilisateur.' });
      }
    }

    // ── CLEAR ────────────────────────────────
    if (sub === 'clear') {
      const nombre = interaction.options.getInteger('nombre');
      const membre = interaction.options.getUser('membre');

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (membre) messages = messages.filter(m => m.author.id === membre.id);

      const toDelete = [...messages.values()].slice(0, nombre);
      await interaction.channel.bulkDelete(toDelete, true);

      const target = membre || { username: 'Tous les membres', id: 'N/A' };
      const raison = `${toDelete.length} message(s) supprimé(s)`;
      const extra = `Salon : ${interaction.channel}`;

      await sendLog(guild, 'clear', moderator, target, raison, extra);
      return interaction.editReply({ embeds: [buildPublicModConfirm('clear', moderator, target, raison, extra)] });
    }

    // ── SANCTION ─────────────────────────────
    if (sub === 'sanction') {
      const target = interaction.options.getUser('membre') || null;
      try {
        const { embed, rows } = await buildSanctionPage(guild, interaction.client, target?.id || 'null', 0);
        return interaction.editReply({ embeds: [embed], components: rows });
      } catch (err) {
        return interaction.editReply({ content: `❌ Erreur : ${err.message}` });
      }
    }
  },
};