const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟' },
  { tag: '#2C9Y28JPP', emoji: '🌿' },
  { tag: '#2JUVYQ0YV', emoji: '⚡' },
  { tag: '#2CJJLLUQ9', emoji: '❄️' },
  { tag: '#2YGPRQYCC', emoji: '🔥' },
  { tag: '#JY89VGGP',  emoji: '🌱' },
  { tag: '#C9JUYQQY',  emoji: '🍃' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clubs')
    .setDescription('Vue globale des 7 clubs Prairie 🌿'),

  async execute(interaction) {
    await interaction.deferReply();

    const results = await Promise.allSettled(
      PRAIRIE_CLUBS.map(c => getClub(c.tag).then(data => ({ ...data, emoji: c.emoji })))
    );

    let totalMembers = 0;
    let totalTrophies = 0;
    let fields = [];

    for (const result of results) {
      if (result.status === 'rejected') continue;
      const club = result.value;

      const members = club.members?.length || 0;
      const maxMembers = 30;
      const places = maxMembers - members;
      const avgTrophies = club.members?.length
        ? Math.round(club.members.reduce((sum, m) => sum + m.trophies, 0) / club.members.length)
        : 0;

      totalMembers += members;
      totalTrophies += club.trophies || 0;

      // Barre de remplissage
      const fillBar = '█'.repeat(Math.round((members / maxMembers) * 10)) +
                      '░'.repeat(10 - Math.round((members / maxMembers) * 10));

      fields.push({
        name: `${club.emoji} ${club.name}`,
        value: [
          `🏆 **${club.trophies?.toLocaleString('fr-FR')}** trophées club`,
          `📊 Moyenne : **${avgTrophies.toLocaleString('fr-FR')}** trophées`,
          `👥 ${fillBar} ${members}/30 ${places > 0 ? `• **${places} place(s) dispo**` : '• **Complet**'}`,
          `🎯 Requis : **${club.requiredTrophies?.toLocaleString('fr-FR')}**`,
        ].join('\n'),
        inline: false,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Famille Prairie — Vue d\'ensemble')
      .setDescription(
        `**${totalMembers} membres actifs** répartis sur **7 clubs**\n` +
        `🏆 Total famille : **${totalTrophies.toLocaleString('fr-FR')}** trophées\n`
      )
      .addFields(fields)
      .setFooter({ text: 'Prairie Brawl Stars • Données en temps réel' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};