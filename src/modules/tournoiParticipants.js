const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile } = require('../lib/rntapi');

// ── Noms de brawlers pour les équipes ─────────────────────────────────────────
const TEAM_NAMES = [
  'Shelly', 'Colt', 'Bull', 'Brock', 'El Primo', 'Barley', 'Poco', 'Rosa',
  'Jessie', 'Nita', 'Dynamike', 'Tick', '8-Bit', 'Rico', 'Darryl', 'Penny',
  'Carl', 'Jacky', 'Gus', 'Bo', 'Emz', 'Stu', 'Piper', 'Pam', 'Frank',
  'Bibi', 'Bea', 'Nani', 'Edgar', 'Griff', 'Grom', 'Bonnie', 'Gale', 'Colette',
  'Belle', 'Ash', 'Lola', 'Sam', 'Mandy', 'Maisie', 'Hank', 'Pearl', 'Larry',
  'Angelo', 'Berry', 'Clancy', 'Moe', 'Juju', 'Melodie', 'Lily',
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

// ── Récupère l'elo ranked depuis RNT ou BS officiel ───────────────────────────


async function getPlayerElo(bsTag) {
  try {
    const rnt = await fetchRntProfile(bsTag).catch(() => null);
    const rntData = rnt?.result || rnt || {};
    
    // Cherche l'elo ranked dans les stats RNT
    const stats = rntData?.stats || [];
    const currentRanked = stats.find(s => s.id === 24)?.value ?? 0;
    const highestRanked = stats.find(s => s.id === 25)?.value ?? 0;
    const elo = currentRanked || highestRanked || 0;
    
    return { elo, name: rntData?.name || bsTag };
  } catch {
    return { elo: 0, name: bsTag };
  }
}

module.exports = {
  // ── /tournoi-participants ───────────────────────────────────────────────────
  tournoiParticipants: {
    data: new SlashCommandBuilder()
      .setName('tournoi-participants')
      .setDescription('Inscrit les participants du tournoi (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o =>
        o.setName('mode')
          .setDescription('Mode d\'inscription')
          .setRequired(true)
          .addChoices(
            { name: '🎭 Rôle Discord', value: 'role' },
            { name: '📝 Liste de mentions', value: 'list' },
          )
      )
      .addRoleOption(o =>
        o.setName('rôle')
          .setDescription('Rôle dont tous les membres seront inscrits')
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName('membres')
          .setDescription('Mentions des participants (@user1 @user2 ...)')
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName('remplaçants')
          .setDescription('Mentions des remplaçants (@user1 @user2 ...)')
          .setRequired(false)
      ),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const mode = interaction.options.getString('mode');
      const role = interaction.options.getRole('rôle');
      const membresRaw = interaction.options.getString('membres');
      const remplacantsRaw = interaction.options.getString('remplaçants');

      // Récupère les IDs des participants
      let participantIds = [];
      let substituteIds = [];

      if (mode === 'role') {
        if (!role) return interaction.editReply({ content: '❌ Tu dois spécifier un rôle.' });
        const fetchedRole = await interaction.guild.roles.fetch(role.id);
        const roleMembers = await interaction.guild.members.fetch({ force: false });
        participantIds = roleMembers
          .filter(m => m.roles.cache.has(role.id))
          .map(m => m.id);
      } else {
        if (!membresRaw) return interaction.editReply({ content: '❌ Tu dois spécifier des membres.' });
        const matches = membresRaw.match(/<@!?(\d+)>/g) || [];
        participantIds = matches.map(m => m.replace(/<@!?|>/g, ''));
      }

      if (remplacantsRaw) {
        const matches = remplacantsRaw.match(/<@!?(\d+)>/g) || [];
        substituteIds = matches.map(m => m.replace(/<@!?|>/g, ''));
      }

      if (participantIds.length === 0) {
        return interaction.editReply({ content: '❌ Aucun participant trouvé.' });
      }

      // Supprime les participants existants
      await supabase
        .from('tournament_participants')
        .delete()
        .eq('tournament_id', tournament.id);

      // Récupère les comptes BS liés
      const allIds = [...new Set([...participantIds, ...substituteIds])];
      const { data: members } = await supabase
        .from('members')
        .select('discord_id, discord_username, brawlstars_tag')
        .in('discord_id', allIds);

      const memberMap = {};
      for (const m of (members || [])) memberMap[m.discord_id] = m;

      // Récupère les elos en parallèle
      await interaction.editReply({ content: '⏳ Récupération des elos ranked en cours...' });

      const rows = [];
      const noAccount = [];
      const noElo = [];

      for (const discordId of participantIds) {
        const member = memberMap[discordId];
        if (!member?.brawlstars_tag) {
          noAccount.push(`<@${discordId}>`);
          continue;
        }
        const { elo, name } = await getPlayerElo(member.brawlstars_tag);
        if (elo === 0) noElo.push(`**${member.discord_username}**`);
        rows.push({
          tournament_id: tournament.id,
          discord_id: discordId,
          discord_username: member.discord_username,
          bs_tag: member.brawlstars_tag,
          elo,
          is_substitute: false,
        });
      }

      for (const discordId of substituteIds) {
        const member = memberMap[discordId];
        if (!member?.brawlstars_tag) {
          noAccount.push(`<@${discordId}>`);
          continue;
        }
        const { elo } = await getPlayerElo(member.brawlstars_tag);
        rows.push({
          tournament_id: tournament.id,
          discord_id: discordId,
          discord_username: member.discord_username,
          bs_tag: member.brawlstars_tag,
          elo,
          is_substitute: true,
        });
      }

      if (rows.length === 0) {
        return interaction.editReply({ content: '❌ Aucun participant avec un compte BS lié.' });
      }

      const { error } = await supabase
        .from('tournament_participants')
        .insert(rows);

      if (error) {
        console.error('[TournoiParticipants]', error);
        return interaction.editReply({ content: '❌ Erreur lors de l\'inscription.' });
      }

      const mainCount = rows.filter(r => !r.is_substitute).length;
      const subCount = rows.filter(r => r.is_substitute).length;

      const participantLines = rows
        .filter(r => !r.is_substitute)
        .sort((a, b) => b.elo - a.elo)
        .map(r => `**${r.discord_username}** — ${r.elo > 0 ? `${r.elo} elo` : '⚪ Unranked'}`)
        .join('\n');

      const substituteLines = rows
        .filter(r => r.is_substitute)
        .map(r => `**${r.discord_username}** — ${r.elo > 0 ? `${r.elo} elo` : '⚪ Unranked'}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`✅ Participants inscrits — ${tournament.name}`)
        .setDescription(`Utilise \`/tournoi-composer\` pour générer les équipes automatiquement.`)
        .addFields(
          { name: `👥 Participants (${rows.filter(r => !r.is_substitute).length})`, value: participantLines || 'Aucun', inline: false },
          { name: `🔄 Remplaçants (${rows.filter(r => r.is_substitute).length})`, value: substituteLines || 'Aucun', inline: false },
          { name: '⚠️ Sans compte BS', value: noAccount.length ? noAccount.join(', ') : 'Aucun', inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-composer ───────────────────────────────────────────────────────
  tournoiComposer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-composer')
      .setDescription('Compose les équipes automatiquement selon l\'elo (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addIntegerOption(o =>
        o.setName('membres_par_equipe')
          .setDescription('Nombre de membres par équipe (défaut: 3)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(5)
      ),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const membersPerTeam = interaction.options.getInteger('membres_par_equipe') ?? 3;

      // Récupère les participants (non remplaçants)
      const { data: participants } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('is_substitute', false)
        .order('elo', { ascending: false });

      if (!participants?.length) {
        return interaction.editReply({ content: '❌ Aucun participant inscrit. Utilise `/tournoi-participants` d\'abord.' });
      }

      const totalTeams = Math.floor(participants.length / membersPerTeam);
      if (totalTeams < 2) {
        return interaction.editReply({ content: `❌ Pas assez de participants — il en faut au moins ${membersPerTeam * 2} pour former 2 équipes.` });
      }

      if (totalTeams !== tournament.size) {
        return interaction.editReply({
          content: `⚠️ Le nombre d'équipes calculé (${totalTeams}) ne correspond pas à la taille du tournoi (${tournament.size}).\nIl faut exactement **${tournament.size * membersPerTeam} participants** pour ce tournoi.`
        });
      }

      // Supprime les équipes existantes
      await supabase
        .from('tournament_teams')
        .delete()
        .eq('tournament_id', tournament.id);

      // Algorithme snake draft pour équipes équilibrées
      // Ex: 9 joueurs, 3 équipes de 3
      // Tri desc: P1, P2, P3, P4, P5, P6, P7, P8, P9
      // Round 1 (→): Équipe1=P1, Équipe2=P2, Équipe3=P3
      // Round 2 (←): Équipe3=P4, Équipe2=P5, Équipe1=P6
      // Round 3 (→): Équipe1=P7, Équipe2=P8, Équipe3=P9
      const sorted = [...participants].sort((a, b) => b.elo - a.elo);
      const teams = Array.from({ length: totalTeams }, (_, i) => ({
        name: TEAM_NAMES[i] || `Équipe ${i + 1}`,
        members: [],
      }));

      let direction = 1;
      let teamIndex = 0;

      for (let i = 0; i < sorted.length; i++) {
        teams[teamIndex].members.push(sorted[i]);

        if (direction === 1) {
          if (teamIndex === totalTeams - 1) {
            direction = -1;
          } else {
            teamIndex++;
          }
        } else {
          if (teamIndex === 0) {
            direction = 1;
          } else {
            teamIndex--;
          }
        }
      }

      // Détermine les côtés (moitié gauche, moitié droite)
      const half = totalTeams / 2;
      const leftTeams = teams.slice(0, half);
      const rightTeams = teams.slice(half);

      // Insère les équipes et leurs membres
      const teamRows = [];
      for (let i = 0; i < leftTeams.length; i++) {
        teamRows.push({ tournament_id: tournament.id, name: leftTeams[i].name, side: 'left', seed: i + 1 });
      }
      for (let i = 0; i < rightTeams.length; i++) {
        teamRows.push({ tournament_id: tournament.id, name: rightTeams[i].name, side: 'right', seed: i + 1 });
      }

      const { data: insertedTeams, error: teamError } = await supabase
        .from('tournament_teams')
        .insert(teamRows)
        .select();

      if (teamError) {
        console.error('[TournoiComposer teams]', teamError);
        return interaction.editReply({ content: '❌ Erreur lors de la création des équipes.' });
      }

      // Mappe les équipes insérées
      const teamMap = {};
      for (const t of insertedTeams) {
        teamMap[`${t.side}_${t.seed}`] = t.id;
      }

      // Insère les membres des équipes
      const memberRows = [];
      const allTeams = [...leftTeams, ...rightTeams];
      for (let i = 0; i < allTeams.length; i++) {
        const side = i < half ? 'left' : 'right';
        const seed = i < half ? i + 1 : i - half + 1;
        const teamId = teamMap[`${side}_${seed}`];
        for (const p of allTeams[i].members) {
          memberRows.push({
            team_id: teamId,
            tournament_id: tournament.id,
            discord_id: p.discord_id,
            discord_username: p.discord_username,
            bs_tag: p.bs_tag,
            elo: p.elo,
            is_substitute: false,
          });
        }
      }

      const { error: memberError } = await supabase
        .from('tournament_team_members')
        .insert(memberRows);

      if (memberError) {
        console.error('[TournoiComposer members]', memberError);
        return interaction.editReply({ content: '❌ Erreur lors de l\'assignation des membres.' });
      }

      // Affiche le résultat
      const leftLines = leftTeams.map((t, i) => {
        const avgElo = Math.round(t.members.reduce((s, m) => s + m.elo, 0) / t.members.length);
        const memberList = t.members.map(m => `${m.discord_username} (${m.elo})`).join(', ');
        return `**${t.name}** [~${avgElo}] — ${memberList}`;
      }).join('\n');

      const rightLines = rightTeams.map((t, i) => {
        const avgElo = Math.round(t.members.reduce((s, m) => s + m.elo, 0) / t.members.length);
        const memberList = t.members.map(m => `${m.discord_username} (${m.elo})`).join(', ');
        return `**${t.name}** [~${avgElo}] — ${memberList}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`✅ Équipes composées — ${tournament.name}`)
        .setDescription(`**${totalTeams} équipes** de **${membersPerTeam} membres** générées par snake draft selon l\'elo ranked.`)
        .addFields(
          { name: '⬅️ Tableau Gauche', value: leftLines || 'Aucune', inline: false },
          { name: '➡️ Tableau Droit', value: rightLines || 'Aucune', inline: false },
        )
        .setFooter({ text: 'Utilise /tournoi-remplacer pour modifier une équipe' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── /tournoi-remplacer ──────────────────────────────────────────────────────
  tournoiRemplacer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-remplacer')
      .setDescription('Remplace un membre d\'une équipe par un remplaçant (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o =>
        o.setName('sortant')
          .setDescription('Le membre qui quitte l\'équipe')
          .setRequired(true)
      )
      .addUserOption(o =>
        o.setName('entrant')
          .setDescription('Le remplaçant qui rejoint l\'équipe')
          .setRequired(true)
      ),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const sortant = interaction.options.getUser('sortant');
      const entrant = interaction.options.getUser('entrant');

      // Trouve le membre sortant dans une équipe
      const { data: sortantMember } = await supabase
        .from('tournament_team_members')
        .select('*, team:team_id(id, name, side)')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', sortant.id)
        .eq('is_substitute', false)
        .maybeSingle();

      if (!sortantMember) {
        return interaction.editReply({ content: `❌ **${sortant.username}** n'est dans aucune équipe du tournoi.` });
      }

      // Vérifie que l'entrant est remplaçant ou participant non assigné
      const { data: entrantParticipant } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', entrant.id)
        .maybeSingle();

      if (!entrantParticipant) {
        return interaction.editReply({ content: `❌ **${entrant.username}** n'est pas inscrit au tournoi.` });
      }

      // Vérifie que l'entrant n'est pas déjà dans une équipe
      const { data: entrantInTeam } = await supabase
        .from('tournament_team_members')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', entrant.id)
        .eq('is_substitute', false)
        .maybeSingle();

      if (entrantInTeam) {
        return interaction.editReply({ content: `❌ **${entrant.username}** est déjà dans une équipe.` });
      }

      // Récupère les infos BS de l'entrant
      const { data: entrantMember } = await supabase
        .from('members')
        .select('brawlstars_tag, discord_username')
        .eq('discord_id', entrant.id)
        .maybeSingle();

      // Effectue le remplacement
      // 1. Retire le sortant de l'équipe
      await supabase
        .from('tournament_team_members')
        .delete()
        .eq('id', sortantMember.id);

      // 2. Ajoute l'entrant à l'équipe
      await supabase
        .from('tournament_team_members')
        .insert({
          team_id: sortantMember.team_id,
          tournament_id: tournament.id,
          discord_id: entrant.id,
          discord_username: entrantMember?.discord_username || entrant.username,
          bs_tag: entrantMember?.brawlstars_tag || null,
          elo: entrantParticipant.elo,
          is_substitute: false,
        });

      // 3. Met à jour le statut du participant sortant comme remplaçant
      await supabase
        .from('tournament_participants')
        .update({ is_substitute: true })
        .eq('tournament_id', tournament.id)
        .eq('discord_id', sortant.id);

      const teamName = sortantMember.team?.name || 'équipe inconnue';
      const sideLabel = sortantMember.team?.side === 'left' ? '⬅️ Gauche' : '➡️ Droite';

      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🔄 Remplacement effectué')
        .addFields(
          { name: '🏷️ Équipe', value: `**${teamName}** — ${sideLabel}`, inline: false },
          { name: '❌ Sortant', value: `**${sortant.username}**`, inline: true },
          { name: '✅ Entrant', value: `**${entrant.username}**`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log staff
      const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
      if (staffChannel) {
        await staffChannel.send({ embeds: [embed] });
      }
    }
  },
};