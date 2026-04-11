const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const { getCache, isCacheValid } = require('../lib/cache');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée', color: '#1a237e' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie', color: '#1b5e20' },
  { tag: '#2JUVYQ0YV', emoji: '⚡', name: 'Prairie Céleste', color: '#0d47a1' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée', color: '#006064' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée', color: '#bf360c' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie', color: '#33691e' },
  { tag: '#C9JUYQQY',  emoji: '🍃', name: 'Prairie Sauvage', color: '#827717' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clubs')
    .setDescription('Vue globale des 7 clubs Prairie 🌿'),

  async execute(interaction) {
    await interaction.deferReply();

    const results = await Promise.allSettled(
      PRAIRIE_CLUBS.map(c => getClub(c.tag).then(data => ({ ...data, emoji: c.emoji, color: c.color })))
    );

    // Récupère les records depuis Supabase
    const { data: rankings } = await supabase
      .from('club_rankings')
      .select('*');

    const rankingsMap = {};
    if (rankings) {
      for (const r of rankings) rankingsMap[r.club_tag] = r;
    }

    // Récupère les membres liés Discord
    const { data: linkedMembers } = await supabase
      .from('members')
      .select('discord_username, brawlstars_tag')
      .not('brawlstars_tag', 'is', null);

    const linkedTags = new Set(linkedMembers?.map(m => m.brawlstars_tag) || []);

    let totalMembers = 0;
    let totalTrophies = 0;
    let totalPlaces = 0;
    const fields = [];

    for (const result of results) {
      if (result.status === 'rejected') continue;
      const club = result.value;
      const config = PRAIRIE_CLUBS.find(c => c.name === club.name || result.value.tag === club.tag);

      const members = club.members?.length || 0;
      const maxMembers = 30;
      const places = maxMembers - members;
      const avgTrophies = members
        ? Math.round(club.members.reduce((sum, m) => sum + m.trophies, 0) / members)
        : 0;
      const maxTrophies = members ? Math.max(...club.members.map(m => m.trophies)) : 0;

      // Membres liés Discord dans ce club
      const linkedCount = club.members?.filter(m => linkedTags.has(m.tag)).length || 0;

      // Top membre
      const topMember = [...(club.members || [])].sort((a, b) => b.trophies - a.trophies)[0];

      // Classements
      const clubTag = PRAIRIE_CLUBS.find(c => c.emoji === club.emoji)?.tag;
      const ranking = clubTag ? rankingsMap[clubTag] : null;

      const worldStr = ranking?.current_world_rank ? `🌍 #${ranking.current_world_rank}` : '🌍 +500';
      const frStr = ranking?.current_fr_rank ? `🇫🇷 #${ranking.current_fr_rank}` : '🇫🇷 +200';
      const bestWorldStr = ranking?.best_world_rank ? `#${ranking.best_world_rank}` : '+500';
      const bestFrStr = ranking?.best_fr_rank ? `#${ranking.best_fr_rank}` : '+200';

      totalMembers += members;
      totalTrophies += club.trophies || 0;
      totalPlaces += places;

      const fillBar = '█'.repeat(Math.round((members / maxMembers) * 12)) +
                      '░'.repeat(12 - Math.round((members / maxMembers) * 12));

      const statusText = places === 0 ? '🔴 **Complet**'
        : places <= 3 ? `🟠 **${places} place(s) disponible(s)**`
        : `🟢 **${places} places disponibles**`;

      // Lien Brawlify
      const cleanTag = clubTag?.replace('#', '') || '';
      const brawlifyUrl = `https://brawlify.com/stats/club/${cleanTag}`;

    fields.push({
      name: `${club.emoji} ${club.name} • [Brawlify ↗](${brawlifyUrl})`,
      value: [
        `${statusText}`,
        `${fillBar} **${members}/30** • 🔗 **${linkedCount}** liés Discord`,
        ``,
        `🏆 **${club.trophies?.toLocaleString('fr-FR')}** • 📊 **${avgTrophies.toLocaleString('fr-FR')}** moy • 🎯 **${club.requiredTrophies?.toLocaleString('fr-FR')}** requis`,
        `📈 Meilleur : **${maxTrophies.toLocaleString('fr-FR')}** 🏆 — 👑 **${topMember?.name || '?'}**`,
        ``,
        `🌍 Actuel : **${worldStr.replace('🌍 ', '')}** • Record : **${bestWorldStr}**`,
        `🇫🇷 Actuel : **${frStr.replace('🇫🇷 ', '')}** • Record : **${bestFrStr}**`,
        `\u200b`,
      ].join('\n'),
      inline: false,
    });
    }

    // Stats globales famille
    const avgFamily = totalMembers
      ? Math.round(totalTrophies / totalMembers)
      : 0;

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Famille Prairie — Vue d\'ensemble')
      .setDescription([
        `👥 **${totalMembers}** membres actifs sur **7 clubs**`,
        `🏆 Total famille : **${totalTrophies.toLocaleString('fr-FR')}** trophées`,
        `📊 Moyenne famille : **${avgFamily.toLocaleString('fr-FR')}** trophées`,
        `🟢 Places disponibles : **${totalPlaces}** au total`,
        `🔗 Membres liés Discord : **${linkedTags.size}**`,
      ].join('\n'))
      .addFields(fields)
      .setFooter({ text: 'Prairie Brawl Stars • Données en temps réel • Clique sur un club pour Brawlify' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};