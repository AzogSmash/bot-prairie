const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    const customId = interaction.customId;

    if (customId === 'pronostic_select_tournament') {
      await interaction.deferUpdate();
      const tournamentId = interaction.values[0];
      return showPronosticForm(interaction, tournamentId, 0);
    }

    if (customId.startsWith('pronostic_vote_')) {
      return handleVoteSelect(interaction);
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('pronostic_page_')) {
      await interaction.deferUpdate();
      const parts = customId.split('_');
      const tournamentId = parts[2];
      const page = parseInt(parts[3]);
      return showPronosticForm(interaction, tournamentId, page);
    }

    if (customId.startsWith('pronostic_submit_')) {
      return handleSubmit(interaction);
    }

    if (customId.startsWith('pronostic_view_')) {
      return handleViewPredictions(interaction);
    }
  },
};

async function showPronosticForm(interaction, tournamentId, page = 0) {
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (!tournament) {
    return interaction.editReply({ content: '❌ Tournoi introuvable.', components: [] });
  }

  const { data: existing } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('discord_id', interaction.user.id)
    .maybeSingle();

  if (existing?.locked_at) {
    return showMyPredictions(interaction, tournamentId, existing);
  }

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*, team1:team1_id(id, name, seed, side), team2:team2_id(id, name, seed, side)')
    .eq('tournament_id', tournamentId)
    .eq('round', 1)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .order('side')
    .order('match_order');

  if (!matches?.length) {
    return interaction.editReply({
      content: '❌ Le bracket n\'est pas encore généré pour ce tournoi.',
      components: [],
    });
  }

  const currentPreds = existing?.predictions || {};
  const leftMatches = matches.filter(m => m.side === 'left');
  const rightMatches = matches.filter(m => m.side === 'right');
  const allMatches = [...leftMatches, ...rightMatches];

  const pageSize = 4;
  const totalPages = Math.ceil(allMatches.length / pageSize);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * pageSize;
  const pageMatches = allMatches.slice(start, start + pageSize);

  const embed = new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle(`🏆 Pronostics — ${tournament.name}`)
    .setDescription(
      'Choisis le gagnant de chaque match du premier round.\n' +
      'Une fois soumis, **tu ne pourras plus modifier tes pronos**.\n\n' +
      '⚠️ Tu dois voter sur **tous les matchs** avant de soumettre.'
    )
    .addFields(
      {
        name: '⬅️ Tableau Gauche',
        value: leftMatches.map(m => {
          const voted = currentPreds[m.id];
          return `${voted ? '☑️' : '❓'} **${m.team1?.name}** vs **${m.team2?.name}**${voted ? ` → ${voted === m.team1?.id ? m.team1?.name : m.team2?.name}` : ''}`;
        }).join('\n') || 'Aucun match',
        inline: true,
      },
      {
        name: '➡️ Tableau Droit',
        value: rightMatches.map(m => {
          const voted = currentPreds[m.id];
          return `${voted ? '☑️' : '❓'} **${m.team1?.name}** vs **${m.team2?.name}**${voted ? ` → ${voted === m.team1?.id ? m.team1?.name : m.team2?.name}` : ''}`;
        }).join('\n') || 'Aucun match',
        inline: true,
      },
    )
    .setFooter({ text: `${Object.keys(currentPreds).length}/${allMatches.length} matchs votés • Page ${safePage + 1}/${totalPages}` })
    .setTimestamp();

  const components = [];

  for (const m of pageMatches) {
    const selected = currentPreds[m.id];
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`pronostic_vote_${tournamentId}_${m.id}_${safePage}`)
      .setPlaceholder(`${m.side === 'left' ? '⬅️ G' : '➡️ D'} — ${m.team1?.name} vs ${m.team2?.name}`)
      .addOptions([
        {
          label: m.team1?.name || 'Équipe 1',
          value: m.team1?.id,
          description: `Tableau ${m.side === 'left' ? 'Gauche' : 'Droit'}`,
          default: selected === m.team1?.id,
        },
        {
          label: m.team2?.name || 'Équipe 2',
          value: m.team2?.id,
          description: `Tableau ${m.side === 'left' ? 'Gauche' : 'Droit'}`,
          default: selected === m.team2?.id,
        },
      ]);
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  const navRow = new ActionRowBuilder();

  if (safePage > 0) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`pronostic_page_${tournamentId}_${safePage - 1}`)
        .setLabel('◀️ Précédent')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (safePage < totalPages - 1) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`pronostic_page_${tournamentId}_${safePage + 1}`)
        .setLabel('Suivant ▶️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const allVoted = allMatches.every(m => currentPreds[m.id]);
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`pronostic_submit_${tournamentId}`)
      .setLabel(allVoted ? '✅ Soumettre mes pronostics' : `⏳ ${Object.keys(currentPreds).length}/${allMatches.length} votés`)
      .setStyle(allVoted ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!allVoted)
  );

  components.push(navRow);

  await interaction.editReply({ embeds: [embed], components });
}

async function handleVoteSelect(interaction) {
  await interaction.deferUpdate();

  const parts = interaction.customId.split('_');
  const tournamentId = parts[2];
  const matchId = parts[3];
  const page = parseInt(parts[4]) || 0;
  const winnerId = interaction.values[0];

  const { data: existing } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('discord_id', interaction.user.id)
    .maybeSingle();

  const predictions = existing?.predictions || {};
  predictions[matchId] = winnerId;

  if (existing) {
    await supabase
      .from('tournament_predictions')
      .update({ predictions })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('tournament_predictions')
      .insert({
        tournament_id: tournamentId,
        discord_id: interaction.user.id,
        discord_username: interaction.user.username,
        predictions,
      });
  }

  await showPronosticForm(interaction, tournamentId, page);
}

async function handleSubmit(interaction) {
  await interaction.deferUpdate();

  const tournamentId = interaction.customId.split('_')[2];

  const { data: existing } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('discord_id', interaction.user.id)
    .maybeSingle();

  if (!existing) {
    return interaction.editReply({ content: '❌ Aucun pronostic trouvé.', components: [] });
  }

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round', 1)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null);

  const predictions = existing.predictions || {};
  const allVoted = matches?.every(m => predictions[m.id]);

  if (!allVoted) {
    return interaction.editReply({ content: '❌ Tu n\'as pas voté sur tous les matchs.', components: [] });
  }

  await supabase
    .from('tournament_predictions')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', existing.id);

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .single();

  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('✅ Pronostics soumis !')
    .setDescription(
      `Tes pronostics pour **${tournament?.name}** ont été enregistrés et verrouillés.\n\n` +
      'Tu ne peux plus les modifier. Bonne chance ! 🍀'
    )
    .setTimestamp();

  const viewBtn = new ButtonBuilder()
    .setCustomId(`pronostic_view_${tournamentId}`)
    .setLabel('👁️ Voir tous les pronostics')
    .setStyle(ButtonStyle.Primary);

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(viewBtn)],
  });
}

async function showMyPredictions(interaction, tournamentId, myPrediction) {
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .single();

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*, team1:team1_id(id, name), team2:team2_id(id, name)')
    .eq('tournament_id', tournamentId)
    .eq('round', 1)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .order('side')
    .order('match_order');

  const preds = myPrediction.predictions || {};

  const lines = matches?.map(m => {
    const winner = preds[m.id] === m.team1?.id ? m.team1?.name : m.team2?.name;
    const correct = m.winner_id
      ? (preds[m.id] === m.winner_id ? '✅' : '❌')
      : '⏳';
    return `${correct} **${m.team1?.name}** vs **${m.team2?.name}** → **${winner}**`;
  }).join('\n') || 'Aucun match';

  const scoreText = myPrediction.score > 0 || myPrediction.left_correct || myPrediction.right_correct
    ? `\n\n**Score : ${myPrediction.score}/3 pts**\n${myPrediction.left_correct ? '✅' : '❌'} Poule gauche • ${myPrediction.right_correct ? '✅' : '❌'} Poule droite • ${myPrediction.final_correct ? '✅' : '❌'} Finale`
    : '';

  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle(`🎯 Mes pronostics — ${tournament?.name}`)
    .setDescription(lines + scoreText)
    .setTimestamp();

  const viewBtn = new ButtonBuilder()
    .setCustomId(`pronostic_view_${tournamentId}`)
    .setLabel('👁️ Voir tous les pronostics')
    .setStyle(ButtonStyle.Primary);

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(viewBtn)],
  });
}

async function handleViewPredictions(interaction) {
  await interaction.deferUpdate();

  const tournamentId = interaction.customId.split('_')[2];

  const { data: myPred } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('discord_id', interaction.user.id)
    .maybeSingle();

  if (!myPred?.locked_at) {
    return interaction.editReply({
      content: '❌ Tu dois d\'abord soumettre tes propres pronostics pour voir ceux des autres.',
      components: [],
    });
  }

  const { data: allPreds } = await supabase
    .from('tournament_predictions')
    .select('*')
    .eq('tournament_id', tournamentId)
    .not('locked_at', 'is', null)
    .order('score', { ascending: false });

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*, team1:team1_id(id, name), team2:team2_id(id, name)')
    .eq('tournament_id', tournamentId)
    .eq('round', 1)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .order('side')
    .order('match_order');

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .single();

  if (!allPreds?.length) {
    return interaction.editReply({ content: '❌ Aucun pronostic soumis pour l\'instant.', components: [] });
  }

  const matchStats = {};
  for (const m of (matches || [])) {
    const votes = allPreds.map(p => p.predictions?.[m.id]).filter(Boolean);
    const team1Votes = votes.filter(v => v === m.team1?.id).length;
    const team2Votes = votes.filter(v => v === m.team2?.id).length;
    matchStats[m.id] = { team1Votes, team2Votes, total: votes.length };
  }

  const lines = matches?.map(m => {
    const stats = matchStats[m.id];
    const pct1 = stats.total ? Math.round((stats.team1Votes / stats.total) * 100) : 0;
    const pct2 = stats.total ? Math.round((stats.team2Votes / stats.total) * 100) : 0;
    const side = m.side === 'left' ? '⬅️' : '➡️';
    return `${side} **${m.team1?.name}** ${pct1}% vs ${pct2}% **${m.team2?.name}**`;
  }).join('\n') || 'Aucun match';

  const topPreds = allPreds.slice(0, 10).map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[i] || `**#${i + 1}**`;
    const score = p.score > 0 ? ` • **${p.score}pts**` : '';
    return `${medal} ${p.discord_username}${score}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle(`📊 Pronostics — ${tournament?.name}`)
    .addFields(
      { name: '📈 Tendances des votes', value: lines, inline: false },
      { name: `👥 Participants (${allPreds.length})`, value: topPreds || 'Aucun', inline: false },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
}