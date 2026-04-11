const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { PRAIRIE_CLUBS } = require('../modules/clubsPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-club')
    .setDescription('Configure les infos d\'un club Prairie (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(option =>
      option.setName('club')
        .setDescription('Le club à configurer')
        .setRequired(true)
        .addChoices(...PRAIRIE_CLUBS.map(c => ({ name: `${c.emoji} ${c.name}`, value: c.tag })))
    )
    .addIntegerOption(option =>
      option.setName('trophees_requis')
        .setDescription('Nouveau minimum de trophées requis')
        .setRequired(false)
        .setMinValue(0)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Nouvelle description du club')
        .setRequired(false)
        .setMaxLength(200)
    )
    .addStringOption(option =>
      option.setName('niveau')
        .setDescription('Niveau du club')
        .setRequired(false)
        .addChoices(
          { name: '👑 Élite', value: '👑 Élite' },
          { name: '🥇 Confirmé', value: '🥇 Confirmé' },
          { name: '🥈 Intermédiaire', value: '🥈 Intermédiaire' },
          { name: '🥉 Débutant', value: '🥉 Débutant' },
        )
    )
    .addIntegerOption(option =>
    option.setName('record_monde')
        .setDescription('Meilleur classement mondial (1-1000, ou 0 pour mettre /)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1000)
    )
    .addIntegerOption(option =>
    option.setName('record_fr')
        .setDescription('Meilleur classement France (1-1000, ou 0 pour mettre /)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1000)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const clubTag = interaction.options.getString('club');
    const trophees = interaction.options.getInteger('trophees_requis');
    const description = interaction.options.getString('description');
    const niveau = interaction.options.getString('niveau');
    const recordMonde = interaction.options.getInteger('record_monde');
    const recordFr = interaction.options.getInteger('record_fr');

    const club = PRAIRIE_CLUBS.find(c => c.tag === clubTag);

    // Par :
    if (trophees === null && !description && !niveau && recordMonde === null && recordFr === null) {
    return interaction.editReply({ content: '❌ Tu dois renseigner au moins une valeur à modifier.' });
    }

    if (trophees || description || niveau) {
      const { data: existing } = await supabase
        .from('club_config')
        .select('*')
        .eq('club_tag', clubTag)
        .maybeSingle();

      await supabase
        .from('club_config')
        .upsert({
          club_tag: clubTag,
          required_trophies: trophees || existing?.required_trophies || null,
          description: description || existing?.description || null,
          level: niveau || existing?.level || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_tag' });
    }

// Par :
    if (recordMonde !== null && recordMonde !== undefined || recordFr !== null && recordFr !== undefined) {
    const { data: existing } = await supabase
        .from('club_rankings')
        .select('*')
        .eq('club_tag', clubTag)
        .maybeSingle();

    await supabase
        .from('club_rankings')
        .upsert({
        club_tag: clubTag,
        // 0 = pas de classement connu → null en base
        best_world_rank: recordMonde === 0 ? null : (recordMonde || existing?.best_world_rank || null),
        best_fr_rank: recordFr === 0 ? null : (recordFr || existing?.best_fr_rank || null),
        current_world_rank: existing?.current_world_rank || null,
        current_fr_rank: existing?.current_fr_rank || null,
        updated_at: new Date().toISOString(),
        }, { onConflict: 'club_tag' });
    }

    const changes = [
      trophees ? `🎯 Trophées requis → **${trophees.toLocaleString('fr-FR')}**` : null,
      description ? `📝 Description → *${description}*` : null,
      niveau ? `📋 Niveau → ${niveau}` : null,
      recordMonde !== null ? `🌍 Record monde → **${recordMonde === 0 ? '/' : '#' + recordMonde}**` : null,
      recordFr !== null ? `🇫🇷 Record France → **${recordFr === 0 ? '/' : '#' + recordFr}**` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle(`✅ ${club.emoji} ${club.name} — Config mise à jour`)
      .setDescription(changes.join('\n'))
      .setFooter({ text: `Modifié par ${interaction.user.username} • Les panels se mettront à jour à la prochaine heure` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
    if (staffChannel) await staffChannel.send({ embeds: [embed] });
  }
};