const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, getBattleLog } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');

// Rang BS en emoji
function getRankEmoji(rank) {
  if (rank >= 35) return '🟣';
  if (rank >= 30) return '🔴';
  if (rank >= 25) return '🟠';
  if (rank >= 20) return '🟡';
  if (rank >= 15) return '🟢';
  if (rank >= 10) return '🔵';
  return '⚪';
}

// Convertit nameColor BS (#fff000ff) en hex Discord (#fff000)
function parseNameColor(nameColor) {
  if (!nameColor) return '#2ecc71';
  const hex = nameColor.replace('0x', '#').slice(0, 7);
  return hex.length === 7 ? hex : '#2ecc71';
}

// Palier suivant
function getNextMilestone(trophies) {
  const milestones = [5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000, 150000];
  return milestones.find(m => m > trophies) || null;
}

// Barre de progression
function progressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  return '█'.repeat(Math.min(filled, length)) + '░'.repeat(Math.max(length - filled, 0));
}

// Mode BS en français
function modeLabel(mode) {
  const modes = {
    gemGrab: '💎 Gem Grab',
    brawlBall: '⚽ Brawl Ball',
    heist: '💰 Heist',
    bounty: '⭐ Bounty',
    siege: '🤖 Siege',
    hotZone: '🔥 Hot Zone',
    knockout: '🥊 Knockout',
    duoShowdown: '👥 Duo Showdown',
    soloShowdown: '☠️ Solo Showdown',
    wipeout: '💥 Wipeout',
    payload: '🚂 Payload',
    present: '🎁 Present Plunder',
    superCity: '🦖 Super City',
    holdTheTrophy: '🏆 Hold The Trophy',
    trophyThieves: '🥷 Trophy Thieves',
    unknown: '❓ Autre',
  };
  return modes[mode] || `🎮 ${mode}`;
}

async function buildProfileEmbed(target, client) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('discord_id', target.id)
    .single();

  if (error || !data || !data.brawlstars_tag) return null;

  // Récupère player + battlelog en parallèle
  const [player, battleLogData] = await Promise.all([
    getPlayer(data.brawlstars_tag),
    getBattleLog(data.brawlstars_tag).catch(() => null),
  ]);

  // Rang interne Prairie
  const { data: rankData } = await supabase
    .from('members')
    .select('discord_id')
    .not('brawlstars_trophies', 'is', null)
    .order('brawlstars_trophies', { ascending: false });

  const rank = rankData ? rankData.findIndex(m => m.discord_id === target.id) + 1 : null;
  const totalMembers = rankData?.length || 0;

  // Met à jour Supabase
  await supabase
    .from('members')
    .update({
      brawlstars_trophies: player.trophies,
      club_name: player.club?.name || null,
      last_seen_at: new Date().toISOString(),
    })
    .eq('discord_id', target.id);

  // ── Brawlers ──────────────────────────────────────────────
  const brawlers = player.brawlers || [];
  const topBrawler = [...brawlers].sort((a, b) => b.trophies - a.trophies)[0];
  const maxedBrawlers = brawlers.filter(b => b.power === 11).length;
  const hyperchargeBrawlers = brawlers.filter(b => b.hyperCharges?.length > 0).length;
  const totalBrawlers = brawlers.length;

  // Win streak max global
  const maxWinStreak = brawlers.reduce((max, b) => Math.max(max, b.maxWinStreak || 0), 0);

  // ── Battle log ────────────────────────────────────────────
  let winRate = null;
  let favoriteMode = null;
  let recentBrawler = null;

  if (battleLogData?.items?.length > 0) {
    const battles = battleLogData.items.slice(0, 25);

    // Win rate
    const results = battles.filter(b => b.battle?.result);
    const wins = results.filter(b => b.battle.result === 'victory').length;
    winRate = results.length > 0 ? Math.round((wins / results.length) * 100) : null;

    // Mode favori
    const modeCounts = {};
    battles.forEach(b => {
      const mode = b.event?.mode || 'unknown';
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    });
    favoriteMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    // Brawler récent
    const lastBattle = battles[0];
    if (lastBattle?.battle?.teams) {
      const allPlayers = lastBattle.battle.teams.flat();
      const me = allPlayers.find(p => p.tag === player.tag);
      recentBrawler = me?.brawler?.name || null;
    } else if (lastBattle?.battle?.player) {
      recentBrawler = lastBattle.battle.player.brawler?.name || null;
    }
  }

  // ── Progression ───────────────────────────────────────────
  const nextMilestone = getNextMilestone(player.trophies);
  const prevMilestone = (() => {
    const milestones = [0, 5000, 10000, 15000, 25000, 40000, 55000, 75000, 100000, 125000];
    return [...milestones].reverse().find(m => m <= player.trophies) || 0;
  })();
  const progress = nextMilestone
    ? progressBar(player.trophies - prevMilestone, nextMilestone - prevMilestone)
    : '██████████';

  // ── Temps sur le serveur ──────────────────────────────────
  const joinedAt = data.joined_at
    ? `<t:${Math.floor(new Date(data.joined_at).getTime() / 1000)}:R>`
    : 'Inconnu';

  // ── Couleur dynamique depuis BS ───────────────────────────
  const color = parseNameColor(player.nameColor);

  // ── Rang emoji Prairie ────────────────────────────────────
  const rankEmojis = ['👑', '🥈', '🥉'];
  const rankEmoji = rank && rank <= 3 ? rankEmojis[rank - 1] : '🌿';

  // ── Build embed ───────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${player.name} • ${player.tag}`,
      iconURL: target.displayAvatarURL({ dynamic: true })
    })
    .setTitle(`${rankEmoji} Profil Prairie`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))

    // Bloc 1 — Identité
    .addFields(
      { name: '🌿 Club', value: player.club?.name || 'Sans club', inline: true },
      { name: '📅 Sur le serveur', value: joinedAt, inline: true },
      { name: `${rankEmoji} Rang Prairie`, value: rank ? `**#${rank}** / ${totalMembers}` : 'Non classé', inline: true },
    )

    // Bloc 2 — Trophées
    .addFields(
      { name: '🏆 Trophées', value: `**${player.trophies.toLocaleString('fr-FR')}**`, inline: true },
      { name: '🥇 Record', value: `${player.highestTrophies?.toLocaleString('fr-FR') || '?'}`, inline: true },
      { name: '🎯 Niveau', value: `${player.expLevel} • ⭐ Prestige ${player.totalPrestigeLevel || 0}`, inline: true },
    )

    // Bloc 3 — Progression
    .addFields({
      name: nextMilestone
        ? `📈 Progression → ${nextMilestone.toLocaleString('fr-FR')} 🏆`
        : '📈 Progression',
      value: nextMilestone
        ? `${progress} ${player.trophies.toLocaleString('fr-FR')} / ${nextMilestone.toLocaleString('fr-FR')}`
        : `${progress} Palier max atteint 🎉`,
      inline: false,
    })

    // Bloc 4 — Brawler favori
    .addFields({
      name: '🎮 Brawler favori',
      value: topBrawler ? [
        `**${topBrawler.name}** ${getRankEmoji(topBrawler.rank)} Rang ${topBrawler.rank}`,
        `🏆 ${topBrawler.trophies.toLocaleString('fr-FR')} • ⚡ Power ${topBrawler.power}`,
        topBrawler.hyperCharges?.length > 0 ? '⚡ Hypercharge ✅' : '⚡ Hypercharge ❌',
        topBrawler.skin?.name ? `🎨 Skin : ${topBrawler.skin.name}` : '',
        `🔥 Win streak max : ${topBrawler.maxWinStreak || 0}`,
      ].filter(Boolean).join(' • ') : 'Aucun brawler',
      inline: false,
    })

    // Bloc 5 — Collection
    .addFields(
      { name: '🗂️ Brawlers', value: `${totalBrawlers} débloqués`, inline: true },
      { name: '💪 Au max', value: `${maxedBrawlers} / ${totalBrawlers}`, inline: true },
      { name: '⚡ Hypercharges', value: `${hyperchargeBrawlers}`, inline: true },
    )

    // Bloc 6 — Victoires
    .addFields(
      { name: '⚔️ Victoires 3v3', value: player['3vs3Victories']?.toLocaleString('fr-FR') || '?', inline: true },
      { name: '☠️ Victoires Solo', value: player.soloVictories?.toLocaleString('fr-FR') || '?', inline: true },
      { name: '👥 Victoires Duo', value: player.duoVictories?.toLocaleString('fr-FR') || '?', inline: true },
    )

    // Bloc 7 — Battle log
    .addFields({
      name: '📊 25 dernières parties',
      value: [
        winRate !== null ? `🎯 Win rate : **${winRate}%**` : null,
        favoriteMode ? `🕹️ Mode favori : **${modeLabel(favoriteMode)}**` : null,
        recentBrawler ? `🎮 Dernier brawler : **${recentBrawler}**` : null,
        `🔥 Meilleure win streak : **${maxWinStreak}**`,
      ].filter(Boolean).join('\n') || 'Aucune partie récente',
      inline: false,
    })

    // Bloc 8 — Statut
    .addFields({
      name: '📋 Statut Prairie',
      value: data.status === 'nouveau' ? '🆕 Nouveau membre'
        : data.status === 'actif' ? '✅ Membre actif'
        : data.status === 'inactif' ? '⚠️ Inactif'
        : data.status === 'staff' ? '🛡️ Staff Prairie'
        : '✅ Membre actif',
      inline: false,
    })

    .setFooter({ text: 'Prairie Brawl Stars • Stats en temps réel' })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Affiche le profil Prairie d\'un membre')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('membre') || interaction.user;

    try {
      const embed = await buildProfileEmbed(target, interaction.client);

      if (!embed) {
        return interaction.editReply({
          content: `❌ **${target.username}** n'a pas encore lié son compte Brawl Stars.\nUtilise \`/lier #TAG\` pour commencer !`
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_${target.id}`)
          .setLabel('🔄 Actualiser')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`classement_goto_0_tous`)
          .setLabel('🏆 Classement Prairie')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error('[Profil]', err);
      await interaction.editReply({ content: '❌ Erreur lors de la récupération du profil.' });
    }
  }
};

module.exports.buildProfileEmbed = buildProfileEmbed;