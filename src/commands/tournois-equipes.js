const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

async function getActiveTournament() {
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', ['open', 'started'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi-équipes')
    .setDescription('Ajoute les équipes manuellement (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o =>
      o.setName('côté')
        .setDescription('Côté du bracket')
        .setRequired(true)
        .addChoices(
          { name: '⬅️ Gauche', value: 'left' },
          { name: '➡️ Droite', value: 'right' },
        )
    )
    .addStringOption(o =>
      o.setName('équipes')
        .setDescription('Noms des équipes séparés par des virgules')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const side = interaction.options.getString('côté');
    const equipesRaw = interaction.options.getString('équipes');

    const noms = equipesRaw
      .split(',')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (noms.length === 0) {
      return interaction.editReply({ content: '❌ Aucun nom d\'équipe valide détecté.' });
    }

    const tournament = await getActiveTournament();
    if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });
    if (tournament.status !== 'open') return interaction.editReply({ content: '❌ Le tournoi n\'est plus ouvert.' });

    const maxPerSide = tournament.size / 2;

    if (noms.length > maxPerSide) {
      return interaction.editReply({
        content: `❌ Trop d\'équipes — ce tournoi accepte **${maxPerSide} équipes par côté** (tu en as entré ${noms.length}).`
      });
    }

    await supabase
      .from('tournament_teams')
      .delete()
      .eq('tournament_id', tournament.id)
      .eq('side', side);

    const rows = noms.map((nom, i) => ({
      tournament_id: tournament.id,
      name: nom,
      side,
      seed: i + 1,
    }));

    const { error } = await supabase
      .from('tournament_teams')
      .insert(rows);

    if (error) {
      console.error('[TournoiÉquipes]', error);
      return interaction.editReply({ content: '❌ Erreur lors de l\'insertion des équipes.' });
    }

    const { count } = await supabase
      .from('tournament_teams')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament.id);

    const sideLabel = side === 'left' ? '⬅️ Gauche' : '➡️ Droite';
    const teamList = noms.map((n, i) => `**${i + 1}.** ${n}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle(`✅ Équipes ajoutées — ${sideLabel}`)
      .setDescription(teamList)
      .addFields(
        { name: '📊 Progression', value: `${count}/${tournament.size} équipes au total`, inline: true },
        { name: '✅ Ajoutées', value: `${noms.length}/${maxPerSide} côté ${side === 'left' ? 'gauche' : 'droit'}`, inline: true },
      )
      .setFooter({
        text: count >= tournament.size
          ? '✅ Toutes les équipes sont là — tu peux démarrer avec /tournoi-démarrer'
          : `⏳ Il manque encore ${tournament.size - count} équipe(s)`
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};