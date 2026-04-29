const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { supabase } = require('../lib/supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pronostic')
    .setDescription('Fais tes pronostics pour un tournoi Prairie 🏆'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const { data: member } = await supabase
      .from('members')
      .select('brawlstars_tag')
      .eq('discord_id', interaction.user.id)
      .maybeSingle();

    if (!member?.brawlstars_tag) {
      return interaction.editReply({
        content: '❌ Tu dois lier ton compte BS avec `/lier` pour participer aux pronostics.',
      });
    }

    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('*')
      .in('status', ['open', 'started'])
      .order('created_at', { ascending: false });

    if (!tournaments?.length) {
      return interaction.editReply({ content: '❌ Aucun tournoi en cours pour le moment.' });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('pronostic_select_tournament')
      .setPlaceholder('Choisis un tournoi')
      .addOptions(tournaments.map(t => ({
        label: t.name,
        description: `${t.size} équipes • ${t.status === 'open' ? '🟢 Pronos ouverts' : '🔴 Tournoi en cours'}`,
        value: t.id,
      })));

    await interaction.editReply({
      content: '🏆 **Pronostics Prairie** — Choisis un tournoi :',
      components: [new ActionRowBuilder().addComponents(menu)],
    });
  },

  async handleSelect(interaction) {
    if (interaction.customId === 'pronostic_select_tournament') {
      await interaction.deferUpdate();
      return showPage(interaction, interaction.values[0], 'left');
    }
    if (interaction.customId.startsWith('pronostic_vote_')) {
      return handleVoteSelect(interaction);
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;
    if (customId.startsWith('pronostic_nav_')) {
      await interaction.deferUpdate();
      const parts = customId.split('_');
      return showPage(interaction, parts[2], parts[3]);
    }
    if (customId.startsWith('pronostic_submit_'))  return handleSubmit(interaction);
    if (customId.startsWith('pronostic_view_'))    return handleViewPredictions(interaction);
    if (customId.startsWith('pronostic_publish_')) return handlePublish(interaction);
  },
};

// ─────────────────────────────────────────────
// TOP ELO PAR ÉQUIPE
// ─────────────────────────────────────────────

async function buildTopEloMap(tournamentId) {
  const { data: members } = await supabase
    .from('tournament_team_members')
    .select('team_id, discord_username, elo')
    .eq('tournament_id', tournamentId)
    .eq('is_substitute', false);

  const topMap = {};
  for (const m of (members || [])) {
    if (!topMap[m.team_id] || m.elo > topMap[m.team_id].elo) {
      topMap[m.team_id] = { username: m.discord_username, elo: m.elo };
    }
  }
  return topMap;
}

// ─────────────────────────────────────────────
// PROPAGATION VIRTUELLE
// ─────────────────────────────────────────────

function resolveVirtualTeams(allMatches, predictions) {
  const byId = {};
  for (const m of allMatches) byId[m.id] = m;

  const virtualTeams = {};
  for (const m of allMatches) {
    virtualTeams[m.id] = { team1_id: m.team1_id, team2_id: m.team2_id };
  }

  const sorted = [...allMatches].sort((a, b) => {
    if (a.side === 'final') return 1;
    if (b.side === 'final') return -1;
    return a.round - b.round;
  });

  for (const m of sorted) {
    const winner = predictions[m.id];
    if (!winner || !m.next_match_id) continue;
    const target = byId[m.next_match_id];
    if (!target) continue;
    if (m.next_slot === 1) {
      virtualTeams[m.next_match_id] = { ...virtualTeams[m.next_match_id], team1_id: winner };
    } else {
      virtualTeams[m.next_match_id] = { ...virtualTeams[m.next_match_id], team2_id: winner };
    }
  }

  return virtualTeams;
}

function isMatchUnlocked(matchId, virtualTeams) {
  const vt = virtualTeams[matchId];
  return !!(vt?.team1_id && vt?.team2_id);
}

function invalidateDownstream(allMatches, predictions, changedMatchId) {
  const byId = {};
  for (const m of allMatches) byId[m.id] = m;
  const toInvalidate = new Set();
  const queue = [changedMatchId];
  while (queue.length) {
    const id = queue.shift();
    const m = byId[id];
    if (!m || !m.next_match_id) continue;
    if (!toInvalidate.has(m.next_match_id)) {
      toInvalidate.add(m.next_match_id);
      queue.push(m.next_match_id);
    }
  }
  for (const id of toInvalidate) delete predictions[id];
}

function propagatePredictions(allMatches, predictions, votedMatchId, winnerId) {
  const updated = { ...predictions };
  invalidateDownstream(allMatches, updated, votedMatchId);
  updated[votedMatchId] = winnerId;
  return updated;
}

function getRoundLabel(round, maxRound) {
  if (round === maxRound) return 'FP'; // Finale de poule
  if (round === maxRound - 1) return 'DF';
  if (round === maxRound - 2) return 'QF';
  return `R${round}`;
}

function getRoundLabelFull(round, maxRound) {
  if (round === maxRound) return 'Finale de poule';
  if (round === maxRound - 1) return 'Demi-finale';
  if (round === maxRound - 2) return 'Quart de finale';
  return `Round ${round}`;
}

function getNextMatchToVote(allMatches, predictions, virtualTeams, currentSide) {
  const sideOrder = currentSide === 'left'
    ? ['left', 'right', 'final']
    : currentSide === 'right'
      ? ['right', 'left', 'final']
      : ['final', 'left', 'right'];

  for (const side of sideOrder) {
    const sideMatches = allMatches
      .filter(m => m.side === side)
      .sort((a, b) => a.round - b.round || a.match_order - b.match_order);
    for (const m of sideMatches) {
      if (isMatchUnlocked(m.id, virtualTeams) && !predictions[m.id]) return m;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// BUILD TENDANCES EMBED
// ─────────────────────────────────────────────

async function buildTendancesEmbed(tournamentId, tournament) {
  const { data: allMatches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const { data: allPreds } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .not('locked_at', 'is', null);

  const topEloMap = await buildTopEloMap(tournamentId);
  const total = allPreds?.length || 0;
  if (!total) return null;

  // Agrège les votes par match en résolvant les équipes virtuelles de chaque prono
  const matchVotes = {};
  for (const pred of allPreds) {
    const preds = pred.predictions || {};
    const vt = resolveVirtualTeams(allMatches, preds);
    for (const m of allMatches) {
      if (!matchVotes[m.id]) matchVotes[m.id] = {};
      const voted = preds[m.id];
      if (!voted) continue;
      matchVotes[m.id][voted] = (matchVotes[m.id][voted] || 0) + 1;
    }
  }

  function buildSideLines(side) {
    const sideMatches = allMatches
      .filter(m => m.side === side)
      .sort((a, b) => a.round - b.round || a.match_order - b.match_order);
    if (!sideMatches.length) return null;

    const maxRound = side === 'final' ? 99 : Math.max(...sideMatches.map(m => m.round));
    const lines = [];

    for (const m of sideMatches) {
      const shortLabel = side === 'final' ? 'Finale' : `${getRoundLabel(m.round, maxRound)} M${m.match_order}`;
      const votes = matchVotes[m.id] || {};
      const totalVotes = Object.values(votes).reduce((s, v) => s + v, 0);

      if (!totalVotes) {
        lines.push(`${shortLabel} — *Aucun vote*`);
        continue;
      }

      // Trie par nombre de votes décroissant
      const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      const [topId, topCount] = sorted[0];
      const topName = topEloMap[topId]?.username ?? '?';
      const topPct  = Math.round((topCount / totalVotes) * 100);

      // Résultat réel
      let resultIcon = '';
      if (m.winner_id) {
        resultIcon = topId === m.winner_id ? ' ✅' : ' ❌';
      }

      if (sorted.length === 1 || topPct === 100) {
        // Un seul choix = unanime
        lines.push(`${shortLabel} — 🔥 **${topName}** 100%${resultIcon}`);
      } else {
        const [, secCount] = sorted[1];
        const secId   = sorted[1][0];
        const secName = topEloMap[secId]?.username ?? '?';
        const secPct  = Math.round((secCount / totalVotes) * 100);
        lines.push(`${shortLabel} — 🔥 **${topName}** ${topPct}% · ${secName} ${secPct}%${resultIcon}`);
      }
    }

    return lines.join('\n');
  }

  const leftLines  = buildSideLines('left');
  const rightLines = buildSideLines('right');
  const finalLines = buildSideLines('final');

  const embed = new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle(`📊 Tendances des pronostics — ${tournament.name}`)
    .setDescription(`**${total} participant(s)** ont soumis leurs pronostics`)
    .setTimestamp();

  if (leftLines)  embed.addFields({ name: '⬅️ Tableau Gauche', value: leftLines,  inline: false });
  if (rightLines) embed.addFields({ name: '➡️ Tableau Droit',  value: rightLines, inline: false });
  if (finalLines) embed.addFields({ name: '🏆 Grande Finale',  value: finalLines, inline: false });

  return embed;
}

// ─────────────────────────────────────────────
// AFFICHAGE PAGE VOTE
// ─────────────────────────────────────────────

async function showPage(interaction, tournamentId, side) {
  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).single();
  if (!tournament) return interaction.editReply({ content: '❌ Tournoi introuvable.', components: [] });

  const { data: existing } = await supabase
    .from('tournament_predictions').select('*')
    .eq('tournament_id', tournamentId).eq('discord_id', interaction.user.id).maybeSingle();

  if (existing?.locked_at) return showMyPredictions(interaction, tournamentId, existing);

  const { data: allMatches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId)
    .order('round').order('match_order');

  if (!allMatches?.length) return interaction.editReply({ content: '❌ Bracket non généré.', components: [] });

  const topEloMap = await buildTopEloMap(tournamentId);
  const predictions = existing?.predictions || {};
  const virtualTeams = resolveVirtualTeams(allMatches, predictions);

  const allUnlocked = allMatches.filter(m => isMatchUnlocked(m.id, virtualTeams));
  const totalVoted  = allUnlocked.filter(m => predictions[m.id]).length;
  const canSubmit   = allMatches.length > 0 && totalVoted === allMatches.length;

  function sideRecap(s) {
    const sideMatches = allMatches.filter(m => m.side === s).sort((a, b) => a.round - b.round || a.match_order - b.match_order);
    if (!sideMatches.length) return 'Aucun match';
    const maxRound = Math.max(...sideMatches.map(m => m.round));
    return sideMatches.map(m => {
      const vt = virtualTeams[m.id] || {};
      const t1 = vt.team1_id ? (topEloMap[vt.team1_id]?.username ?? '?') : '?';
      const t2 = vt.team2_id ? (topEloMap[vt.team2_id]?.username ?? '?') : '?';
      const voted   = predictions[m.id];
      const winner  = voted ? (topEloMap[voted]?.username ?? '?') : null;
      const unlocked = isMatchUnlocked(m.id, virtualTeams);
      const icon  = voted ? '☑️' : unlocked ? '❓' : '🔒';
      const label = getRoundLabelFull(m.round, maxRound);
      return `${icon} **${label}** M${m.match_order} — ${t1} vs ${t2}${voted ? ` → **${winner}**` : ''}`;
    }).join('\n');
  }

  const finalMatch = allMatches.find(m => m.side === 'final');
  let finalRecap = '🔒 Prédit les deux finales de poule d\'abord';
  if (finalMatch) {
    const vt = virtualTeams[finalMatch.id] || {};
    const t1 = vt.team1_id ? (topEloMap[vt.team1_id]?.username ?? '?') : '?';
    const t2 = vt.team2_id ? (topEloMap[vt.team2_id]?.username ?? '?') : '?';
    const voted    = predictions[finalMatch.id];
    const winner   = voted ? (topEloMap[voted]?.username ?? '?') : null;
    const unlocked = isMatchUnlocked(finalMatch.id, virtualTeams);
    const icon = voted ? '☑️' : unlocked ? '❓' : '🔒';
    finalRecap = `${icon} ${t1} vs ${t2}${voted ? ` → **${winner}**` : ''}`;
  }

  const nextMatch  = getNextMatchToVote(allMatches, predictions, virtualTeams, side);
  const activeSide = nextMatch ? nextMatch.side : side;

  const embed = new EmbedBuilder()
    .setColor(activeSide === 'final' ? '#f1c40f' : '#e67e22')
    .setTitle(`🏆 Pronostics — ${tournament.name}`)
    .addFields(
      { name: '⬅️ Tableau Gauche', value: sideRecap('left'),  inline: false },
      { name: '➡️ Tableau Droit',  value: sideRecap('right'), inline: false },
      { name: '🏆 Grande Finale',  value: finalRecap,         inline: false },
    )
    .setFooter({ text: `${totalVoted}/${allMatches.length} match(s) prédit(s)${canSubmit ? ' — ✅ Prêt à soumettre !' : ''}` })
    .setTimestamp();

  if (canSubmit) {
    embed.setDescription('✅ **Tous les matchs sont prédits !** Tu peux soumettre.');
  } else if (nextMatch) {
    const smfl = allMatches.filter(m => m.side === nextMatch.side);
    const maxR = nextMatch.side === 'final' ? 99 : Math.max(...smfl.map(m => m.round));
    const ml   = nextMatch.side === 'final' ? 'Grande Finale' : getRoundLabelFull(nextMatch.round, maxR);
    const sl   = nextMatch.side === 'left' ? '⬅️ Gauche' : nextMatch.side === 'right' ? '➡️ Droite' : '🏆 Finale';
    embed.setDescription(`**À voter : ${sl} — ${ml}${nextMatch.side !== 'final' ? ` M${nextMatch.match_order}` : ''}**`);
  } else {
    embed.setDescription('🔒 Prédit les rounds précédents pour débloquer la suite.');
  }

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pronostic_nav_${tournamentId}_left`)
      .setLabel('⬅️ Gauche')
      .setStyle(activeSide === 'left'  ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pronostic_nav_${tournamentId}_right`)
      .setLabel('➡️ Droite')
      .setStyle(activeSide === 'right' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pronostic_nav_${tournamentId}_final`)
      .setLabel('🏆 Finale')
      .setStyle(activeSide === 'final' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const components = [navRow];

  if (nextMatch && !canSubmit) {
    const vt     = virtualTeams[nextMatch.id] || {};
    const t1name = vt.team1_id ? (topEloMap[vt.team1_id]?.username ?? 'Équipe 1') : 'Équipe 1';
    const t2name = vt.team2_id ? (topEloMap[vt.team2_id]?.username ?? 'Équipe 2') : 'Équipe 2';
    const voted  = predictions[nextMatch.id];
    const smfl   = allMatches.filter(m => m.side === nextMatch.side);
    const maxR   = nextMatch.side === 'final' ? 99 : Math.max(...smfl.map(m => m.round));
    const ml     = nextMatch.side === 'final' ? 'Grande Finale' : getRoundLabelFull(nextMatch.round, maxR);

    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pronostic_vote_${tournamentId}_${nextMatch.id}_${nextMatch.side}`)
        .setPlaceholder(`${ml}${nextMatch.side !== 'final' ? ` M${nextMatch.match_order}` : ''} — ${t1name} vs ${t2name}`)
        .addOptions([
          { label: t1name, value: vt.team1_id, default: voted === vt.team1_id },
          { label: t2name, value: vt.team2_id, default: voted === vt.team2_id },
        ])
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pronostic_submit_${tournamentId}`)
      .setLabel(canSubmit ? '✅ Soumettre mes pronostics' : `⏳ ${totalVoted}/${allMatches.length} prédit(s)`)
      .setStyle(canSubmit ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canSubmit)
  ));

  await interaction.editReply({ embeds: [embed], components });
}

// ─────────────────────────────────────────────
// VOTE
// ─────────────────────────────────────────────

async function handleVoteSelect(interaction) {
  await interaction.deferUpdate();

  const parts        = interaction.customId.split('_');
  const tournamentId = parts[2];
  const matchId      = parts[3];
  const side         = parts[4];
  const winnerId     = interaction.values[0];

  const { data: existing } = await supabase
    .from('tournament_predictions').select('*')
    .eq('tournament_id', tournamentId).eq('discord_id', interaction.user.id).maybeSingle();

  const { data: allMatches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId)
    .order('round').order('match_order');

  const predictions = propagatePredictions(allMatches, existing?.predictions || {}, matchId, winnerId);

  if (existing) {
    await supabase.from('tournament_predictions').update({ predictions }).eq('id', existing.id);
  } else {
    await supabase.from('tournament_predictions').insert({
      tournament_id: tournamentId,
      discord_id: interaction.user.id,
      discord_username: interaction.user.username,
      predictions,
    });
  }

  await showPage(interaction, tournamentId, side);
}

// ─────────────────────────────────────────────
// SOUMISSION
// ─────────────────────────────────────────────

async function handleSubmit(interaction) {
  await interaction.deferUpdate();

  const tournamentId = interaction.customId.split('_')[2];

  const { data: existing } = await supabase
    .from('tournament_predictions').select('*')
    .eq('tournament_id', tournamentId).eq('discord_id', interaction.user.id).maybeSingle();

  if (!existing) return interaction.editReply({ content: '❌ Aucun pronostic trouvé.', components: [] });

  const { data: allMatches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId);

  const virtualTeams = resolveVirtualTeams(allMatches, existing.predictions || {});
  const allUnlocked  = allMatches.filter(m => isMatchUnlocked(m.id, virtualTeams));

  if (allUnlocked.length !== allMatches.length || allUnlocked.some(m => !existing.predictions?.[m.id])) {
    return interaction.editReply({ content: '❌ Tu n\'as pas encore prédit tous les matchs.', components: [] });
  }

  await supabase.from('tournament_predictions')
    .update({ locked_at: new Date().toISOString() }).eq('id', existing.id);

  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).single();

  const tendancesEmbed = await buildTendancesEmbed(tournamentId, tournament);

  const embeds = [
    new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('✅ Pronostics soumis !')
      .setDescription(`Tes pronostics pour **${tournament?.name}** ont été enregistrés et verrouillés.\n\nTu ne peux plus les modifier. Bonne chance ! 🍀`)
      .setTimestamp(),
  ];
  if (tendancesEmbed) embeds.push(tendancesEmbed);

  const components = [];
  if (interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pronostic_publish_${tournamentId}`)
        .setLabel('📢 Publier les tendances dans #annonces')
        .setStyle(ButtonStyle.Primary)
    ));
  }

  await interaction.editReply({ embeds, components });
}

// ─────────────────────────────────────────────
// VUE TENDANCES
// ─────────────────────────────────────────────

async function handleViewPredictions(interaction) {
  await interaction.deferUpdate();

  const tournamentId = interaction.customId.split('_')[2];

  const { data: myPred } = await supabase
    .from('tournament_predictions').select('*')
    .eq('tournament_id', tournamentId).eq('discord_id', interaction.user.id).maybeSingle();

  if (!myPred?.locked_at) {
    return interaction.editReply({
      content: '❌ Tu dois d\'abord soumettre tes propres pronostics pour voir ceux des autres.',
      components: [],
    });
  }

  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).single();

  const tendancesEmbed = await buildTendancesEmbed(tournamentId, tournament);

  if (!tendancesEmbed) {
    return interaction.editReply({ content: '❌ Aucun pronostic soumis.', components: [] });
  }

  const components = [];
  if (interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pronostic_publish_${tournamentId}`)
        .setLabel('📢 Publier les tendances dans #annonces')
        .setStyle(ButtonStyle.Primary)
    ));
  }

  await interaction.editReply({ embeds: [tendancesEmbed], components });
}

// ─────────────────────────────────────────────
// PUBLICATION DANS #ANNONCES (staff)
// ─────────────────────────────────────────────

async function handlePublish(interaction) {
  await interaction.deferUpdate();

  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.followUp({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
  }

  const tournamentId = interaction.customId.split('_')[2];

  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).single();

  const tendancesEmbed = await buildTendancesEmbed(tournamentId, tournament);

  if (!tendancesEmbed) {
    return interaction.followUp({ content: '❌ Aucune tendance à publier.', ephemeral: true });
  }

  const channelId = process.env.TOURNAMENT_CHANNEL_ID;
  if (!channelId) {
    return interaction.followUp({ content: '❌ `TOURNAMENT_CHANNEL_ID` non configuré.', ephemeral: true });
  }

  try {
    const channel = await interaction.client.channels.fetch(channelId);
    await channel.send({ embeds: [tendancesEmbed] });
    await interaction.followUp({ content: '✅ Tendances publiées dans le salon annonces !', ephemeral: true });
  } catch (err) {
    console.error('[PronosticPublish]', err);
    await interaction.followUp({ content: '❌ Impossible d\'envoyer dans le salon.', ephemeral: true });
  }
}

// ─────────────────────────────────────────────
// MES PRONOS (après soumission)
// ─────────────────────────────────────────────

async function showMyPredictions(interaction, tournamentId, myPrediction) {
  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).single();

  const { data: allMatches } = await supabase
    .from('tournament_matches').select('*').eq('tournament_id', tournamentId)
    .order('side').order('round').order('match_order');

  const topEloMap = await buildTopEloMap(tournamentId);
  const preds     = myPrediction.predictions || {};
  const virtualTeams = resolveVirtualTeams(allMatches || [], preds);

  const lines = (allMatches || []).map(m => {
    const vt     = virtualTeams[m.id] || {};
    const t1name = vt.team1_id ? (topEloMap[vt.team1_id]?.username ?? '?') : '?';
    const t2name = vt.team2_id ? (topEloMap[vt.team2_id]?.username ?? '?') : '?';
    const winner  = preds[m.id] ? (topEloMap[preds[m.id]]?.username ?? '?') : '—';
    const correct = m.winner_id ? (preds[m.id] === m.winner_id ? '✅' : '❌') : '⏳';
    const sideIcon = m.side === 'final' ? '🏆' : m.side === 'left' ? '⬅️' : '➡️';
    const sm = (allMatches || []).filter(x => x.side === m.side);
    const maxR = m.side === 'final' ? 99 : Math.max(...sm.map(x => x.round));
    const label = m.side === 'final' ? 'Finale' : getRoundLabelFull(m.round, maxR);
    return `${correct} ${sideIcon} **${label}**${m.side !== 'final' ? ` M${m.match_order}` : ''} — ${t1name} vs ${t2name} → **${winner}**`;
  });

  const scoreText = (myPrediction.score > 0 || myPrediction.left_correct || myPrediction.right_correct)
    ? `\n\n**Score : ${myPrediction.score}/3 pts**\n${myPrediction.left_correct ? '✅' : '❌'} Poule gauche • ${myPrediction.right_correct ? '✅' : '❌'} Poule droite • ${myPrediction.final_correct ? '✅' : '❌'} Finale`
    : '';

  const tendancesEmbed = await buildTendancesEmbed(tournamentId, tournament);

  const embeds = [
    new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle(`🎯 Mes pronostics — ${tournament?.name}`)
      .setDescription(lines.join('\n') + scoreText)
      .setTimestamp(),
  ];
  if (tendancesEmbed) embeds.push(tendancesEmbed);

  const components = [];
  if (interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pronostic_publish_${tournamentId}`)
        .setLabel('📢 Publier les tendances dans #annonces')
        .setStyle(ButtonStyle.Primary)
    ));
  }

  await interaction.editReply({ embeds, components });
}