const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { getPlayer } = require('../lib/brawlapi');
const { fetchRntProfile } = require('../lib/rntapi');
const { renderBracket } = require('./bracketRenderer');
const { generateAndSaveMatches } = require('../modules/bracketGenerator');

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

async function getPlayerElo(bsTag) {
  try {
    const rnt = await fetchRntProfile(bsTag).catch(() => null);
    const rntData = rnt?.result || rnt || {};
    const stats = rntData?.stats || [];
    const currentRanked = stats.find(s => s.id === 24)?.value ?? 0;
    const highestRanked = stats.find(s => s.id === 25)?.value ?? 0;
    const elo = highestRanked || currentRanked || 0;
    return { elo, name: rntData?.name || bsTag };
  } catch {
    return { elo: 0, name: bsTag };
  }
}

// ── Algo snake draft + optimisation ──────────────────────────────────────────
function snakeDraft(sorted, totalTeams) {
  const teams = Array.from({ length: totalTeams }, (_, i) => ({
    name: TEAM_NAMES[i] || `Équipe ${i + 1}`,
    members: [],
  }));

  let direction = 1;
  let teamIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    teams[teamIndex].members.push(sorted[i]);
    if (direction === 1) {
      if (teamIndex === totalTeams - 1) direction = -1;
      else teamIndex++;
    } else {
      if (teamIndex === 0) direction = 1;
      else teamIndex--;
    }
  }
  return teams;
}

function teamAvgElo(team) {
  if (!team.members.length) return 0;
  return team.members.reduce((s, m) => s + m.elo, 0) / team.members.length;
}

function stdDev(teams) {
  const avgs = teams.map(teamAvgElo);
  const mean = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  return Math.sqrt(avgs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / avgs.length);
}

function optimizeTeams(teams) {
  let improved = true;
  let iterations = 0;
  const MAX_ITER = 500;

  while (improved && iterations < MAX_ITER) {
    improved = false;
    iterations++;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let mi = 0; mi < teams[i].members.length; mi++) {
          for (let mj = 0; mj < teams[j].members.length; mj++) {
            const before = stdDev(teams);

            // Swap
            const tmp = teams[i].members[mi];
            teams[i].members[mi] = teams[j].members[mj];
            teams[j].members[mj] = tmp;

            const after = stdDev(teams);

            if (after < before - 0.1) {
              improved = true;
            } else {
              // Undo
              const tmp2 = teams[i].members[mi];
              teams[i].members[mi] = teams[j].members[mj];
              teams[j].members[mj] = tmp2;
            }
          }
        }
      }
    }
  }
  return teams;
}

// ── Génère les matchs du bracket ──────────────────────────────────────────────
// Modulo 4 (bracket parfait) :
// n=4  : R1(2 matchs), R2 finale poule(1 match)
// n=8  : R1(4 matchs), R2 demi(2 matchs), R3 finale poule(1 match)
// n=16 : R1(8 matchs), R2 QF(4 matchs), R3 demi(2 matchs), R4 finale poule(1 match)
// Modulo 6 (avec byes) :
// n=6  : R1(seed1vs2, seed3vs4), R2(gagnant1v2 vs gagnant3v4, seed5vs6), R3 finale poule
// n=12 : R1(4 matchs seeds 1-8), R2(4 matchs + seed9vs10 + seed11vs12), R3(2 matchs), R4 finale poule
// n=24 : R1(8 matchs seeds 1-16), R2(4+4 matchs), R3(4 matchs), R4(2 matchs), R5 finale poule

// ── Envoie ou met à jour l'image du bracket ───────────────────────────────────
async function sendOrUpdateBracketImage(client, tournament) {
  try {
    const channelId = process.env.TOURNAMENT_CHANNEL_ID;
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    // Récupère les données
    const { data: matches } = await supabase.from('tournament_matches').select('*').eq('tournament_id', tournament.id).order('side').order('round').order('match_order');
    const { data: teams }   = await supabase.from('tournament_teams').select('*').eq('tournament_id', tournament.id);
    const { data: members } = await supabase.from('tournament_team_members').select('*').eq('tournament_id', tournament.id);

    if (!matches?.length) return;

    const buffer = await renderBracket(tournament, matches, teams, members).catch(err => { console.error('[BracketImage]', err); return null; });
    if (!buffer) return;

    const attachment = new AttachmentBuilder(buffer, { name: 'bracket.png' });

    // Met à jour le message existant ou en crée un nouveau
    if (tournament.bracket_message_id && tournament.bracket_channel_id) {
      try {
        const ch  = await client.channels.fetch(tournament.bracket_channel_id);
        const msg = await ch.messages.fetch(tournament.bracket_message_id);
        await msg.edit({ content: `🏆 **${tournament.name}** — Bracket en cours`, files: [attachment] });
        return;
      } catch {
        // Message supprimé — on en recrée un
      }
    }

    // Nouveau message
    const msg = await channel.send({ content: `🏆 **${tournament.name}** — Bracket en cours`, files: [attachment] });
    await supabase.from('tournaments').update({ bracket_message_id: msg.id, bracket_channel_id: channel.id }).eq('id', tournament.id);

  } catch (err) {
    console.error('[sendOrUpdateBracketImage]', err);
  }
}

module.exports = {
  sendOrUpdateBracketImage,
  // ── /tournoi-participants ───
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
      .addRoleOption(o => o.setName('rôle').setDescription('Rôle dont tous les membres seront inscrits').setRequired(false))
      .addRoleOption(o => o.setName('rôle_remplaçants').setDescription('Rôle des remplaçants').setRequired(false))
      .addStringOption(o => o.setName('membres').setDescription('Mentions des participants (@user1 @user2 ...)').setRequired(false))
      .addStringOption(o => o.setName('remplaçants').setDescription('Mentions des remplaçants (@user1 @user2 ...)').setRequired(false)),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const mode = interaction.options.getString('mode');
      const role = interaction.options.getRole('rôle');
      const membresRaw = interaction.options.getString('membres');
      const remplacantsRaw = interaction.options.getString('remplaçants');
      const roleRemplacants = interaction.options.getRole('rôle_remplaçants');

      let participantIds = [];
      let substituteIds = [];

      if (mode === 'role' || roleRemplacants) {
        await interaction.guild.members.fetch({ limit: 1000 });
      }
      const guildMembers = interaction.guild.members.cache;

      if (mode === 'role') {
        if (!role) return interaction.editReply({ content: '❌ Tu dois spécifier un rôle.' });
        participantIds = guildMembers.filter(m => m.roles.cache.has(role.id)).map(m => m.id);
      } else {
        if (!membresRaw) return interaction.editReply({ content: '❌ Tu dois spécifier des membres.' });
        const matches = membresRaw.match(/<@!?(\d+)>/g) || [];
        participantIds = matches.map(m => m.replace(/<@!?|>/g, ''));
      }

      if (remplacantsRaw) {
        const matches = remplacantsRaw.match(/<@!?(\d+)>/g) || [];
        substituteIds = matches.map(m => m.replace(/<@!?|>/g, ''));
      }

      if (roleRemplacants) {
        const roleSubIds = guildMembers.filter(m => m.roles.cache.has(roleRemplacants.id)).map(m => m.id);
        substituteIds = [...new Set([...substituteIds, ...roleSubIds])];
      }

      if (participantIds.length === 0) return interaction.editReply({ content: '❌ Aucun participant trouvé.' });

      await supabase.from('tournament_participants').delete().eq('tournament_id', tournament.id);

      const allIds = [...new Set([...participantIds, ...substituteIds])];
      const { data: members } = await supabase
        .from('members')
        .select('discord_id, discord_username, brawlstars_tag')
        .in('discord_id', allIds);

      const memberMap = {};
      for (const m of (members || [])) memberMap[m.discord_id] = m;

      await interaction.editReply({ content: '⏳ Récupération des elos ranked en cours...' });

      const rows = [];
      const noAccount = [];

      for (const discordId of participantIds) {
        const member = memberMap[discordId];
        if (!member?.brawlstars_tag) { noAccount.push(`<@${discordId}>`); continue; }
        const { elo } = await getPlayerElo(member.brawlstars_tag);
        rows.push({ tournament_id: tournament.id, discord_id: discordId, discord_username: member.discord_username, bs_tag: member.brawlstars_tag, elo, is_substitute: false });
      }

      for (const discordId of substituteIds) {
        const member = memberMap[discordId];
        if (!member?.brawlstars_tag) { noAccount.push(`<@${discordId}>`); continue; }
        const { elo } = await getPlayerElo(member.brawlstars_tag);
        rows.push({ tournament_id: tournament.id, discord_id: discordId, discord_username: member.discord_username, bs_tag: member.brawlstars_tag, elo, is_substitute: true });
      }

      if (rows.length === 0) return interaction.editReply({ content: '❌ Aucun participant avec un compte BS lié.' });

      const { error } = await supabase.from('tournament_participants').insert(rows);
      if (error) { console.error('[TournoiParticipants]', error); return interaction.editReply({ content: '❌ Erreur lors de l\'inscription.' }); }

      const participantLines = rows.filter(r => !r.is_substitute).sort((a, b) => b.elo - a.elo)
        .map(r => `**${r.discord_username}** — ${r.elo > 0 ? `${r.elo} elo` : '⚪ Unranked'}`).join('\n');
      const substituteLines = rows.filter(r => r.is_substitute)
        .map(r => `**${r.discord_username}** — ${r.elo > 0 ? `${r.elo} elo` : '⚪ Unranked'}`).join('\n');

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
      .setDescription('Génère le bracket et ouvre les pronos (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addIntegerOption(o =>
        o.setName('membres_par_equipe')
          .setDescription('Nombre de membres par équipe pour le mode auto (défaut: 3)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(5)
      ),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      // Vérifie si des équipes existent déjà (mode manuel)
      const { data: existingTeams } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('side').order('seed');

      const hasManualTeams = existingTeams?.length > 0;

      if (hasManualTeams) {
        // ── MODE MANUEL — équipes déjà créées via /tournoi-equipe-manuel ──────
        const leftTeams  = existingTeams.filter(t => t.side === 'left').sort((a, b) => a.seed - b.seed);
        const rightTeams = existingTeams.filter(t => t.side === 'right').sort((a, b) => a.seed - b.seed);

        if (leftTeams.length === 0 || rightTeams.length === 0) {
          return interaction.editReply({ content: '❌ Il faut des équipes des deux côtés.' });
        }

        // Supprime les matchs existants et régénère
        await generateAndSaveMatches(supabase, tournament.id, leftTeams, rightTeams);

        // Récupère les membres pour l'affichage
        const { data: teamMembers } = await supabase
          .from('tournament_team_members')
          .select('*')
          .eq('tournament_id', tournament.id);

        const membersMap = {};
        for (const m of (teamMembers || [])) {
          if (!membersMap[m.team_id]) membersMap[m.team_id] = [];
          membersMap[m.team_id].push(m.discord_username);
        }

        const leftLines  = leftTeams.map(t  => `**${t.name}** — ${(membersMap[t.id] || []).join(', ')}`).join('\n');
        const rightLines = rightTeams.map(t => `**${t.name}** — ${(membersMap[t.id] || []).join(', ')}`).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle(`✅ Bracket généré — ${tournament.name}`)
          .setDescription(`**${existingTeams.length} équipes** — mode manuel\nLe bracket et les pronos sont maintenant disponibles !`)
          .addFields(
            { name: '⬅️ Tableau Gauche', value: leftLines  || 'Aucune', inline: false },
            { name: '➡️ Tableau Droit',  value: rightLines || 'Aucune', inline: false },
          )
          .setFooter({ text: 'Utilise /tournoi-démarrer pour verrouiller les pronos' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else {
        // ── MODE AUTO — compose les équipes depuis les participants ───────────
        const membersPerTeam = interaction.options.getInteger('membres_par_equipe') ?? 3;

        const { data: participants } = await supabase
          .from('tournament_participants')
          .select('*')
          .eq('tournament_id', tournament.id)
          .eq('is_substitute', false)
          .order('elo', { ascending: false });

        if (!participants?.length) return interaction.editReply({ content: '❌ Aucun participant inscrit. Utilise `/tournoi-participants` ou `/tournoi-equipe-manuel`.' });

        const totalTeams = Math.floor(participants.length / membersPerTeam);
        if (totalTeams < 2) return interaction.editReply({ content: `❌ Pas assez de participants.` });
        if (totalTeams !== tournament.size) {
          return interaction.editReply({
            content: `⚠️ Il faut exactement **${tournament.size * membersPerTeam} participants** pour ce tournoi (actuellement ${participants.length}).`
          });
        }

        const sorted = [...participants].sort((a, b) => b.elo - a.elo);
        let teams = snakeDraft(sorted, totalTeams);
        teams = optimizeTeams(teams);

        await supabase.from('tournament_team_members').delete().eq('tournament_id', tournament.id);
        await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);
        await supabase.from('tournament_teams').delete().eq('tournament_id', tournament.id);

        const half = totalTeams / 2;
        const leftTeams  = teams.slice(0, half);
        const rightTeams = teams.slice(half);

        const teamRows = [
          ...leftTeams.map((t, i)  => ({ tournament_id: tournament.id, name: t.name, side: 'left',  seed: i + 1 })),
          ...rightTeams.map((t, i) => ({ tournament_id: tournament.id, name: t.name, side: 'right', seed: i + 1 })),
        ];

        const { data: insertedTeams, error: teamError } = await supabase.from('tournament_teams').insert(teamRows).select();
        if (teamError) { console.error('[TournoiComposer]', teamError); return interaction.editReply({ content: '❌ Erreur lors de la création des équipes.' }); }

        const teamMap = {};
        for (const t of insertedTeams) teamMap[`${t.side}_${t.seed}`] = t.id;

        const memberRows = [];
        const allTeams = [...leftTeams, ...rightTeams];
        for (let i = 0; i < allTeams.length; i++) {
          const side   = i < half ? 'left' : 'right';
          const seed   = i < half ? i + 1 : i - half + 1;
          const teamId = teamMap[`${side}_${seed}`];
          for (const p of allTeams[i].members) {
            memberRows.push({ team_id: teamId, tournament_id: tournament.id, discord_id: p.discord_id, discord_username: p.discord_username, bs_tag: p.bs_tag, elo: p.elo, is_substitute: false });
          }
        }

        await supabase.from('tournament_team_members').insert(memberRows);

        const insertedLeft  = insertedTeams.filter(t => t.side === 'left').sort((a, b) => a.seed - b.seed);
        const insertedRight = insertedTeams.filter(t => t.side === 'right').sort((a, b) => a.seed - b.seed);
        await generateAndSaveMatches(supabase, tournament.id, insertedLeft, insertedRight);

        const avgDeviation = Math.round(stdDev(teams));
        const leftLines  = leftTeams.map(t  => { const avg = Math.round(teamAvgElo(t));  return `**${t.name}** [~${avg}] — ${t.members.map(m => `${m.discord_username} (${m.elo})`).join(', ')}`; }).join('\n');
        const rightLines = rightTeams.map(t => { const avg = Math.round(teamAvgElo(t)); return `**${t.name}** [~${avg}] — ${t.members.map(m => `${m.discord_username} (${m.elo})`).join(', ')}`; }).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle(`✅ Équipes composées — ${tournament.name}`)
          .setDescription(`**${totalTeams} équipes** de **${membersPerTeam} membres** • Écart moyen : **${avgDeviation} elo**\nLe bracket et les pronos sont maintenant disponibles !`)
          .addFields(
            { name: '⬅️ Tableau Gauche', value: leftLines  || 'Aucune', inline: false },
            { name: '➡️ Tableau Droit',  value: rightLines || 'Aucune', inline: false },
          )
          .setFooter({ text: 'Utilise /tournoi-ajuster pour modifier une équipe' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    }
  },
  tournoiAjuster: {
    data: new SlashCommandBuilder()
      .setName('tournoi-ajuster')
      .setDescription('Ajuste un elo ou échange deux membres (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('membre1').setDescription('Le membre à modifier').setRequired(true))
      .addUserOption(o => o.setName('membre2').setDescription('Membre à échanger avec membre1 (ou remplaçant)').setRequired(false))
      .addIntegerOption(o => o.setName('elo').setDescription('Nouvel elo pour membre1').setRequired(false).setMinValue(0)),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const user1  = interaction.options.getUser('membre1');
      const user2  = interaction.options.getUser('membre2');
      const newElo = interaction.options.getInteger('elo');

      // ── Cas 1 : Ajustement d'elo ──────────────────────────────────────────
      if (newElo !== null && !user2) {
        await supabase
          .from('tournament_participants')
          .update({ elo: newElo })
          .eq('tournament_id', tournament.id)
          .eq('discord_id', user1.id);

        await supabase
          .from('tournament_team_members')
          .update({ elo: newElo })
          .eq('tournament_id', tournament.id)
          .eq('discord_id', user1.id);

        return interaction.editReply({ content: `✅ Elo de **${user1.username}** mis à jour à **${newElo}**.\nUtilise \`/tournoi-composer\` pour recomposer les équipes avec ce nouvel elo.` });
      }

      // ── Cas 2 : Échange de membres ────────────────────────────────────────
      if (user2) {
        // Trouve les équipes des deux membres
        const { data: m1 } = await supabase
          .from('tournament_team_members')
          .select('*, team:team_id(id, name, side)')
          .eq('tournament_id', tournament.id)
          .eq('discord_id', user1.id)
          .maybeSingle();

        const { data: m2 } = await supabase
          .from('tournament_team_members')
          .select('*, team:team_id(id, name, side)')
          .eq('tournament_id', tournament.id)
          .eq('discord_id', user2.id)
          .maybeSingle();

        // Cas remplaçant (m2 pas dans une équipe)
        if (!m2) {
          const { data: sub } = await supabase
            .from('tournament_participants')
            .select('*')
            .eq('tournament_id', tournament.id)
            .eq('discord_id', user2.id)
            .maybeSingle();

          if (!sub) return interaction.editReply({ content: `❌ **${user2.username}** n'est pas inscrit au tournoi.` });
          if (!m1)  return interaction.editReply({ content: `❌ **${user1.username}** n'est dans aucune équipe.` });

          const { data: subMember } = await supabase.from('members').select('discord_username, brawlstars_tag').eq('discord_id', user2.id).maybeSingle();

          // Retire m1, ajoute m2
          await supabase.from('tournament_team_members').delete().eq('id', m1.id);
          await supabase.from('tournament_team_members').insert({
            team_id: m1.team_id, tournament_id: tournament.id,
            discord_id: user2.id, discord_username: subMember?.discord_username || user2.username,
            bs_tag: subMember?.brawlstars_tag || null, elo: sub.elo, is_substitute: false,
          });
          await supabase.from('tournament_participants').update({ is_substitute: true }).eq('tournament_id', tournament.id).eq('discord_id', user1.id);

          return interaction.editReply({
            content: `✅ **${user1.username}** remplacé par **${user2.username}** dans l'équipe **${m1.team?.name}**.`,
          });
        }

        // Échange entre deux équipes différentes
        if (!m1) return interaction.editReply({ content: `❌ **${user1.username}** n'est dans aucune équipe.` });
        if (m1.team_id === m2.team_id) return interaction.editReply({ content: `❌ Les deux membres sont déjà dans la même équipe.` });

        // Swap team_id
        await supabase.from('tournament_team_members').update({ team_id: m2.team_id }).eq('id', m1.id);
        await supabase.from('tournament_team_members').update({ team_id: m1.team_id }).eq('id', m2.id);

        return interaction.editReply({
          content: `✅ **${user1.username}** (${m1.team?.name}) et **${user2.username}** (${m2.team?.name}) ont été échangés.`,
        });
      }

      return interaction.editReply({ content: '❌ Précise un elo ou un deuxième membre.' });
    }
  },

  // ── /tournoi-remplacer ──────────────────────────────────────────────────────
  tournoiRemplacer: {
    data: new SlashCommandBuilder()
      .setName('tournoi-remplacer')
      .setDescription('Remplace un membre d\'une équipe par un remplaçant (staff only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o => o.setName('sortant').setDescription('Le membre qui quitte l\'équipe').setRequired(true))
      .addUserOption(o => o.setName('entrant').setDescription('Le remplaçant qui rejoint l\'équipe').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });

      const tournament = await getActiveTournament();
      if (!tournament) return interaction.editReply({ content: '❌ Aucun tournoi en cours.' });

      const sortant = interaction.options.getUser('sortant');
      const entrant = interaction.options.getUser('entrant');

      const { data: sortantMember } = await supabase
        .from('tournament_team_members')
        .select('*, team:team_id(id, name, side)')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', sortant.id)
        .eq('is_substitute', false)
        .maybeSingle();

      if (!sortantMember) return interaction.editReply({ content: `❌ **${sortant.username}** n'est dans aucune équipe.` });

      const { data: entrantParticipant } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', entrant.id)
        .maybeSingle();

      if (!entrantParticipant) return interaction.editReply({ content: `❌ **${entrant.username}** n'est pas inscrit au tournoi.` });

      const { data: entrantInTeam } = await supabase
        .from('tournament_team_members')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('discord_id', entrant.id)
        .eq('is_substitute', false)
        .maybeSingle();

      if (entrantInTeam) return interaction.editReply({ content: `❌ **${entrant.username}** est déjà dans une équipe.` });

      const { data: entrantMember } = await supabase.from('members').select('brawlstars_tag, discord_username').eq('discord_id', entrant.id).maybeSingle();

      await supabase.from('tournament_team_members').delete().eq('id', sortantMember.id);
      await supabase.from('tournament_team_members').insert({
        team_id: sortantMember.team_id, tournament_id: tournament.id,
        discord_id: entrant.id, discord_username: entrantMember?.discord_username || entrant.username,
        bs_tag: entrantMember?.brawlstars_tag || null, elo: entrantParticipant.elo, is_substitute: false,
      });
      await supabase.from('tournament_participants').update({ is_substitute: true }).eq('tournament_id', tournament.id).eq('discord_id', sortant.id);

      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🔄 Remplacement effectué')
        .addFields(
          { name: '🏷️ Équipe', value: `**${sortantMember.team?.name}** — ${sortantMember.team?.side === 'left' ? '⬅️' : '➡️'}`, inline: false },
          { name: '❌ Sortant', value: `**${sortant.username}**`, inline: true },
          { name: '✅ Entrant', value: `**${entrant.username}**`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
      if (staffChannel) await staffChannel.send({ embeds: [embed] });
    }
  },
};