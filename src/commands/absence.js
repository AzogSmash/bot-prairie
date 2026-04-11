const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

function parseDate(str) {
  const clean = str.trim();
  const parts = clean.split(/[\/\-]/);
  if (parts.length < 2) return null;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2] || new Date().getFullYear().toString();
  const date = new Date(`${year}-${month}-${day}`);
  return isNaN(date.getTime()) ? null : { date, raw: `${year}-${month}-${day}`, display: `${day}/${month}/${year}` };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('absence')
    .setDescription('Déclare une absence')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Staff : créer une absence pour un autre membre')
        .setRequired(false)
    ),

  async execute(interaction) {
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
    const targetUser = interaction.options.getUser('membre');

    if (targetUser && !isStaff) {
      return interaction.reply({
        content: '❌ Seul le staff peut créer une absence pour un autre membre.',
        ephemeral: true,
      });
    }

    // Stocke la cible dans le customId du modal
    const targetId = targetUser ? targetUser.id : interaction.user.id;
    const targetUsername = targetUser ? targetUser.username : interaction.user.username;

    const modal = new ModalBuilder()
      .setCustomId(`absence_modal_${targetId}_${targetUsername}`)
      .setTitle(targetUser ? `📋 Absence pour ${targetUsername}` : '📋 Déclarer une absence');

    const debutInput = new TextInputBuilder()
      .setCustomId('debut')
      .setLabel('Date de début (JJ/MM ou JJ/MM/AAAA)')
      .setPlaceholder('ex: 25/04')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    const finInput = new TextInputBuilder()
      .setCustomId('fin')
      .setLabel('Date de fin (JJ/MM ou JJ/MM/AAAA)')
      .setPlaceholder('ex: 30/04')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    const raisonInput = new TextInputBuilder()
      .setCustomId('raison')
      .setLabel('Raison (optionnel)')
      .setPlaceholder('ex: Vacances, voyage, exams...')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder().addComponents(debutInput),
      new ActionRowBuilder().addComponents(finInput),
      new ActionRowBuilder().addComponents(raisonInput),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Récupère la cible depuis le customId
    const parts = interaction.customId.split('_');
    const targetId = parts[2];
    const targetUsername = parts.slice(3).join('_');
    const isForOther = targetId !== interaction.user.id;

    const rawDebut = interaction.fields.getTextInputValue('debut');
    const rawFin = interaction.fields.getTextInputValue('fin');
    const raison = interaction.fields.getTextInputValue('raison') || 'Non précisée';

    const debut = parseDate(rawDebut);
    const fin = parseDate(rawFin);

    if (!debut) return interaction.editReply({ content: '❌ Date de début invalide. Format : **JJ/MM**' });
    if (!fin) return interaction.editReply({ content: '❌ Date de fin invalide. Format : **JJ/MM**' });
    if (fin.date < debut.date) return interaction.editReply({ content: '❌ La date de fin doit être après la date de début.' });

    // Si c'est pour soi-même, vérifie que la date n'est pas dans le passé
    if (!isForOther && debut.date < new Date(new Date().setHours(0, 0, 0, 0))) {
      return interaction.editReply({ content: '❌ La date de début ne peut pas être dans le passé.' });
    }

    const duree = Math.ceil((fin.date - debut.date) / (1000 * 60 * 60 * 24)) + 1;

    const { error } = await supabase
      .from('absences')
      .insert({
        discord_id: targetId,
        discord_username: targetUsername,
        raison,
        date_debut: debut.raw,
        date_fin: fin.raw,
        active: true,
      });

    if (error) {
      console.error('[Absence]', error);
      return interaction.editReply({ content: '❌ Erreur lors de l\'enregistrement.' });
    }

    const embedConfirm = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle(isForOther ? `✅ Absence enregistrée pour ${targetUsername}` : '✅ Absence enregistrée !')
      .addFields(
        { name: '👤 Membre', value: isForOther ? `**${targetUsername}**` : `**${targetUsername}**`, inline: true },
        { name: '📅 Début', value: debut.display, inline: true },
        { name: '📅 Fin', value: fin.display, inline: true },
        { name: '⏳ Durée', value: `${duree} jour(s)`, inline: true },
        { name: '💬 Raison', value: raison, inline: false },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Annuler avec /absence-annuler' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embedConfirm] });

    const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
    if (staffChannel) {
      const embedStaff = new EmbedBuilder()
        .setColor(isForOther ? '#9b59b6' : '#e67e22')
        .setTitle(isForOther ? '📋 Absence créée par le staff' : '📋 Nouvelle absence déclarée')
        .addFields(
          { name: '👤 Membre', value: `**${targetUsername}**`, inline: true },
          { name: '⏳ Durée', value: `${duree} jour(s)`, inline: true },
          { name: '📅 Période', value: `${debut.display} → ${fin.display}`, inline: false },
          { name: '💬 Raison', value: raison, inline: false },
        )
        .setFooter({ text: isForOther ? `Créée par ${interaction.user.username}` : 'Prairie Brawl Stars' })
        .setTimestamp();

      await staffChannel.send({ embeds: [embedStaff] });
    }
  }
};