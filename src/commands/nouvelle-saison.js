const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nouvelle-saison')
    .setDescription('Marque le début d\'une nouvelle saison (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date de début si déjà commencée (JJ/MM/AAAA) — laisser vide pour maintenant')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('label')
        .setDescription('Nom de la saison ex: Saison 49')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const dateInput = interaction.options.getString('date');
    const label = interaction.options.getString('label') || 'Saison sans nom';

    let seasonStart;

    if (dateInput) {
      // Parse JJ/MM/AAAA
      const parts = dateInput.split('/');
      if (parts.length !== 3) {
        return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA' });
      }
      seasonStart = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`);
      if (isNaN(seasonStart.getTime())) {
        return interaction.editReply({ content: '❌ Date invalide.' });
      }
    } else {
      seasonStart = new Date();
    }

    // Enregistre le début de saison
    await supabase.from('season_starts').insert({
      started_at: seasonStart.toISOString(),
      label,
    });

    // Si date passée, cherche le snapshot horaire le plus proche
    let snapshotRef = null;
    if (dateInput) {
      const { data: snapshots } = await supabase
        .from('trophies_snapshots')
        .select('snapshot_at')
        .eq('type', 'hourly')
        .gte('snapshot_at', seasonStart.toISOString())
        .order('snapshot_at', { ascending: true })
        .limit(1);

      snapshotRef = snapshots?.[0]?.snapshot_at || null;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🏆 Nouvelle saison enregistrée !')
      .addFields(
        { name: '📋 Label', value: label, inline: true },
        { name: '📅 Début officiel', value: seasonStart.toLocaleDateString('fr-FR'), inline: true },
        { name: '📸 Snapshot de référence', value: snapshotRef
          ? `Le plus proche : ${new Date(snapshotRef).toLocaleString('fr-FR')}`
          : '🕐 Snapshot pris maintenant', inline: false },
      )
      .setFooter({ text: `Enregistré par ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
    if (staffChannel) await staffChannel.send({ embeds: [embed] });
  }
};