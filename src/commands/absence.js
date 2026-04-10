const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

function parseDate(str) {
  const clean = str.trim();
  // Accepte JJ/MM, JJ/MM/AAAA, JJ-MM, JJ-MM-AAAA
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
    .setDescription('Déclare une absence'),

  async execute(interaction) {
    // Ouvre le modal
    const modal = new ModalBuilder()
      .setCustomId('absence_modal')
      .setTitle('📋 Déclarer une absence');

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

  // Handler modal — appelé depuis index.js
  async handleModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    const rawDebut = interaction.fields.getTextInputValue('debut');
    const rawFin = interaction.fields.getTextInputValue('fin');
    const raison = interaction.fields.getTextInputValue('raison') || 'Non précisée';

    const debut = parseDate(rawDebut);
    const fin = parseDate(rawFin);

    if (!debut) {
      return interaction.editReply({ content: '❌ Date de début invalide. Utilise le format **JJ/MM** — ex: `25/04`' });
    }
    if (!fin) {
      return interaction.editReply({ content: '❌ Date de fin invalide. Utilise le format **JJ/MM** — ex: `30/04`' });
    }
    if (fin.date < debut.date) {
      return interaction.editReply({ content: '❌ La date de fin doit être après la date de début.' });
    }
    if (debut.date < new Date(new Date().setHours(0, 0, 0, 0))) {
      return interaction.editReply({ content: '❌ La date de début ne peut pas être dans le passé.' });
    }

    const duree = Math.ceil((fin.date - debut.date) / (1000 * 60 * 60 * 24)) + 1;

    const { error } = await supabase
      .from('absences')
      .insert({
        discord_id: user.id,
        discord_username: user.username,
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
      .setTitle('✅ Absence enregistrée !')
      .addFields(
        { name: '📅 Début', value: debut.display, inline: true },
        { name: '📅 Fin', value: fin.display, inline: true },
        { name: '⏳ Durée', value: `${duree} jour(s)`, inline: true },
        { name: '💬 Raison', value: raison, inline: false },
      )
      .setFooter({ text: 'Prairie Brawl Stars • Tu peux annuler avec /absence-annuler' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embedConfirm] });

    const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
    if (staffChannel) {
      const embedStaff = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('📋 Nouvelle absence déclarée')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Membre', value: `${user} (${user.username})`, inline: true },
          { name: '⏳ Durée', value: `${duree} jour(s)`, inline: true },
          { name: '📅 Période', value: `${debut.display} → ${fin.display}`, inline: false },
          { name: '💬 Raison', value: raison, inline: false },
        )
        .setFooter({ text: 'Prairie Brawl Stars' })
        .setTimestamp();

      await staffChannel.send({ embeds: [embedStaff] });
    }
  }
};