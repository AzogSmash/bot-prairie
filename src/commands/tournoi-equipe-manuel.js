const { fetchRntProfile } = require('../lib/rntapi');

async function getPlayerElo(bsTag) {
  try {
    const rnt = await fetchRntProfile(bsTag).catch(() => null);
    const rntData = rnt?.result || rnt || {};
    const stats = rntData?.stats || [];
    const currentRanked = stats.find(s => s.id === 24)?.value ?? 0;
    const highestRanked = stats.find(s => s.id === 25)?.value ?? 0;
    return highestRanked || currentRanked || 0;
  } catch {
    return 0;
  }
}

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');

const TEAM_NAMES = [
  'Shelly', 'Colt', 'Bull', 'Brock', 'El Primo', 'Barley', 'Poco', 'Rosa',
  'Jessie', 'Nita', 'Dynamike', 'Tick', '8-Bit', 'Rico', 'Darryl', 'Penny',
  'Carl', 'Jacky', 'Gus', 'Bo', 'Emz', 'Stu', 'Piper', 'Pam', 'Frank',
  'Bibi', 'Bea', 'Nani', 'Edgar', 'Griff', 'Grom', 'Bonnie', 'Gale', 'Colette',
];

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
    .setName('tournoi-equipe-manuel')
    .setDescription('Ajoute une équipe avec ses membres Discord (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o =>
      o.setName('côté')
        .setDescription('Côté du bracket')
        .setRequired(true)
        .addChoices(
          { name: '⬅️ Gauche', value: 'left' },
          { name: '➡️ Droite', value: 'right' },
          { name: '🎲 Aléatoire', value: 'random' },
        )
    )
    .addUserOption(o => o.setName('membre1').setDescription('Membre 1').setRequired(true))
    .addUserOption(o => o.setName('membre2').setDescription('Membre 2').setRequired(true))
    .addUserOption(o => o.setName('membre3').setDescription('Membre 3').setRequired(true))
    .addUserOption(o => o.setName('membre4').setDescription('Membre 4 (optionnel)').setRequired(false))
    .addUserOption(o => o.setName('membre5').setDescription('Membre 5 (optionnel)').setRequired(false))
    .addRoleOption(o =>
      o.setName('rôle_remplaçants')
        .setDescription('Rôle des remplaçants à inscrire (une seule fois suffit)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const tournament = await getActiveTournament();
    if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });
    if (tournament.status !== 'open') return interaction.editReply({ content: '❌ Le tournoi n\'est plus ouvert.' });

    const members = [
      interaction.options.getUser('membre1'),
      interaction.options.getUser('membre2'),
      interaction.options.getUser('membre3'),
      interaction.options.getUser('membre4'),
      interaction.options.getUser('membre5'),
    ].filter(Boolean);

    const roleRemplacants = interaction.options.getRole('rôle_remplaçants');

    // Détermine le côté
    let side = interaction.options.getString('côté');
    const maxPerSide = tournament.size / 2;

    if (side === 'random') {
      const { data: leftTeams }  = await supabase.from('tournament_teams').select('id').eq('tournament_id', tournament.id).eq('side', 'left');
      const { data: rightTeams } = await supabase.from('tournament_teams').select('id').eq('tournament_id', tournament.id).eq('side', 'right');
      const leftCount  = leftTeams?.length  ?? 0;
      const rightCount = rightTeams?.length ?? 0;
      if (leftCount >= maxPerSide)       side = 'right';
      else if (rightCount >= maxPerSide) side = 'left';
      else side = Math.random() < 0.5 ? 'left' : 'right';
    }

    // Vérifie la place
    const { count } = await supabase
      .from('tournament_teams')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament.id)
      .eq('side', side);

    if (count >= maxPerSide) {
      return interaction.editReply({ content: `❌ Le côté ${side === 'left' ? 'gauche' : 'droit'} est complet (${maxPerSide} équipes max).` });
    }

    // Nom d'équipe disponible
    const { data: existingTeams } = await supabase.from('tournament_teams').select('name').eq('tournament_id', tournament.id);
    const usedNames    = new Set((existingTeams || []).map(t => t.name));
    const availableName = TEAM_NAMES.find(n => !usedNames.has(n)) || `Equipe ${(count ?? 0) + 1}`;
    const seed = (count ?? 0) + 1;

    // Crée l'équipe
    const { data: team, error: teamError } = await supabase
      .from('tournament_teams')
      .insert({ tournament_id: tournament.id, name: availableName, side, seed, captain_discord_id: members[0].id })
      .select()
      .single();

    if (teamError) {
      console.error('[TournoiEquipeManuel]', teamError);
      return interaction.editReply({ content: '❌ Erreur lors de la création de l\'équipe.' });
    }

    // Récupère les infos BS
    const discordIds = members.map(m => m.id);
    const { data: bsMembers } = await supabase.from('members').select('discord_id, discord_username, brawlstars_tag').in('discord_id', discordIds);
    const bsMap = {};
    for (const m of (bsMembers || [])) bsMap[m.discord_id] = m;

    // Inscrit les membres de l'équipe
    const noAccount = [];
    for (const user of members) {
      const bs = bsMap[user.id];
      if (!bs?.brawlstars_tag) noAccount.push(user.username);
      const elo = bs?.brawlstars_tag ? await getPlayerElo(bs.brawlstars_tag) : 0;

      const { data: existing } = await supabase.from('tournament_participants').select('id').eq('tournament_id', tournament.id).eq('discord_id', user.id).maybeSingle();
      if (!existing) {
        await supabase.from('tournament_participants').insert({
          tournament_id: tournament.id,
          discord_id: user.id,
          discord_username: bs?.discord_username || user.username,
          bs_tag: bs?.brawlstars_tag || null,
          elo,
          is_substitute: false,
        });
      }
      await supabase.from('tournament_team_members').insert({
        team_id: team.id,
        tournament_id: tournament.id,
        discord_id: user.id,
        discord_username: bs?.discord_username || user.username,
        bs_tag: bs?.brawlstars_tag || null,
        elo,
        is_substitute: false,
      });
    }

    // Inscrit les remplaçants si rôle fourni
    let subCount = 0;
    if (roleRemplacants) {
      await interaction.guild.members.fetch({ limit: 1000 });
      const guildMembers = interaction.guild.members.cache;
      const subIds = guildMembers.filter(m => m.roles.cache.has(roleRemplacants.id)).map(m => m.id);
      const { data: subBsMembers } = await supabase.from('members').select('discord_id, discord_username, brawlstars_tag').in('discord_id', subIds);
      const subBsMap = {};
      for (const m of (subBsMembers || [])) subBsMap[m.discord_id] = m;

      for (const subId of subIds) {
        const { data: existing } = await supabase.from('tournament_participants').select('id').eq('tournament_id', tournament.id).eq('discord_id', subId).maybeSingle();
        if (!existing) {
          const bs = subBsMap[subId];
          await supabase.from('tournament_participants').insert({
            tournament_id: tournament.id,
            discord_id: subId,
            discord_username: bs?.discord_username || subId,
            bs_tag: bs?.brawlstars_tag || null,
            elo: 0,
            is_substitute: true,
          });
          subCount++;
        }
      }
    }

    // Total
    const { count: totalCount } = await supabase.from('tournament_teams').select('*', { count: 'exact', head: true }).eq('tournament_id', tournament.id);
    const sideLabel  = side === 'left' ? '⬅️ Gauche' : '➡️ Droite';
    const memberList = members.map(m => `**${bsMap[m.id]?.discord_username || m.username}**`).join(', ');

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle(`✅ Équipe ajoutée — ${sideLabel}`)
      .addFields(
        { name: '🏷️ Équipe',      value: availableName, inline: true },
        { name: '📍 Côté',        value: sideLabel,     inline: true },
        { name: '🎯 Seed',        value: `${seed}`,     inline: true },
        { name: '👥 Membres',     value: memberList,    inline: false },
        { name: '📊 Progression', value: `${totalCount}/${tournament.size} équipes au total`, inline: true },
        ...(subCount > 0 ? [{ name: '🔄 Remplaçants inscrits', value: `${subCount}`, inline: true }] : []),
        ...(noAccount.length > 0 ? [{ name: '⚠️ Sans compte BS lié (elo = 0)', value: noAccount.map(n => `**${n}** — utilise \`/lier\` pour lier son compte`, ).join('\n'), inline: false }] : []),
      )
      .setFooter({
        text: totalCount >= tournament.size
          ? '✅ Toutes les équipes sont créées — utilise /tournoi-composer pour générer le bracket'
          : `⏳ Il manque encore ${tournament.size - totalCount} équipe(s) — continue avec /tournoi-equipe-manuel`
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
