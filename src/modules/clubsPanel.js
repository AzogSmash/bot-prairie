const { EmbedBuilder } = require('discord.js');
const { getClub } = require('../lib/brawlapi');
const { setCache } = require('../lib/cache');
const { supabase } = require('../lib/supabase');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', emoji: '🌟', name: 'Prairie Étoilée', color: '#1a237e', description: 'Le club élite de la famille Prairie. Discord obligatoire, Events 100%, Voc privilégié. Chill & actif, bonne ambiance.', level: '👑 Élite' },
  { tag: '#2C9Y28JPP', emoji: '🌿', name: 'Prairie Fleurie', color: '#1b5e20', description: 'Rush Mega Pig (tirelire), Discord obligatoire, Soit actif, Record 350, Voc privilégié.', level: '🥇 Confirmé' },
  { tag: '#2JUVYQ0YV', emoji: '⚡', name: 'Prairie Céleste', color: '#0d47a1', description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.', level: '🥇 Confirmé' },
  { tag: '#2CJJLLUQ9', emoji: '❄️', name: 'Prairie Gelée', color: '#006064', description: 'Event de club obligatoire, Club affilié à la Prairie, Discord obligatoire, Soit actif.', level: '🥈 Intermédiaire' },
  { tag: '#2YGPRQYCC', emoji: '🔥', name: 'Prairie Brûlée', color: '#bf360c', description: 'Évents & discord oblig. Être actif jeu & serveur. Mature, convivial & chill.', level: '🥈 Intermédiaire' },
  { tag: '#JY89VGGP',  emoji: '🌱', name: 'Mini Prairie', color: '#33691e', description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.', level: '🥉 Débutant' },
  { tag: '#C9JUYQQY',  emoji: '🍃', name: 'Prairie Sauvage', color: '#827717', description: 'Club d\'entrée de la famille Prairie. Parfait pour progresser et rejoindre la structure.', level: '🥉 Débutant' },
];

async function buildClubEmbed(clubData, clubConfig) {
  const members = clubData.members?.length || 0;
  const maxMembers = 30;
  const places = maxMembers - members;

  const avgTrophies = members
    ? Math.round(clubData.members.reduce((sum, m) => sum + m.trophies, 0) / members)
    : 0;

  const maxTrophies = members ? Math.max(...clubData.members.map(m => m.trophies)) : 0;
  const minTrophies = members ? Math.min(...clubData.members.map(m => m.trophies)) : 0;

  const top3 = [...(clubData.members || [])]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 3)
    .map((m, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      return `${medals[i]} **${m.name}** — ${m.trophies.toLocaleString('fr-FR')} 🏆`;
    })
    .join('\n');

  const presidents = clubData.members?.filter(m => m.role === 'president').length || 0;
  const vps = clubData.members?.filter(m => m.role === 'vicePresident').length || 0;
  const seniors = clubData.members?.filter(m => m.role === 'senior').length || 0;
  const regulars = clubData.members?.filter(m => m.role === 'member').length || 0;

  const fillBar = '█'.repeat(Math.round((members / maxMembers) * 12)) +
                  '░'.repeat(12 - Math.round((members / maxMembers) * 12));

  const statusText = places === 0 ? '🔴 Complet'
    : places <= 3 ? `🟠 ${places} place(s) dispo`
    : `🟢 ${places} places disponibles`;

  return new EmbedBuilder()
    .setColor(clubConfig.color)
    .setTitle(`${clubConfig.emoji} ${clubData.name}`)
    .setDescription(`*${clubConfig.description}*\n\n${clubConfig.level} • ${statusText}`)
    .addFields(
      { name: '🏆 Trophées club', value: `**${clubData.trophies?.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📊 Moyenne', value: `**${avgTrophies.toLocaleString('fr-FR')}**`, inline: true },
      { name: '🎯 Requis', value: `**${clubData.requiredTrophies?.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📈 Meilleur', value: `**${maxTrophies.toLocaleString('fr-FR')}** 🏆`, inline: true },
      { name: '📉 Plus bas', value: `**${minTrophies.toLocaleString('fr-FR')}** 🏆`, inline: true },
      { name: '🏷️ Tag', value: `\`${clubData.tag}\``, inline: true },
      {
        name: `👥 Membres ${fillBar} ${members}/30`,
        value: `👑 **${presidents}** • ⭐ **${vps}** • 🔰 **${seniors}** • 👤 **${regulars}**`,
        inline: false
      },
      { name: '🏅 Top 3', value: top3 || 'Aucun membre', inline: false },
    )
    .setFooter({ text: 'Prairie Brawl Stars • Mis à jour toutes les heures' })
    .setTimestamp();
}

async function updateClubsPanel(client) {
  let channel;
  try {
    channel = await client.channels.fetch(process.env.CLUBS_CHANNEL_ID);
  } catch (err) {
    console.error('[ClubsPanel] Channel introuvable:', err.message);
    return;
  }

  console.log('[ClubsPanel] Mise à jour des panels clubs...');

  // Récupère les IDs des messages depuis Supabase
  const { data: savedMessages } = await supabase
    .from('panel_messages')
    .select('*');

  const messageMap = {};
  if (savedMessages) {
    for (const row of savedMessages) {
      messageMap[row.club_tag] = row.message_id;
    }
  }

  const allMembers = [];

  for (const clubConfig of PRAIRIE_CLUBS) {
    try {
      const clubData = await getClub(clubConfig.tag);
      const embed = await buildClubEmbed(clubData, clubConfig);

      // Accumule pour le cache
      clubData.members?.forEach(m => allMembers.push({
        bsTag: m.tag,
        trophies: m.trophies,
        clubName: clubData.name,
      }));

      if (messageMap[clubConfig.tag]) {
        // Essaie de mettre à jour le message existant
        try {
          const msg = await channel.messages.fetch(messageMap[clubConfig.tag]);
          await msg.edit({ embeds: [embed] });
          console.log(`[ClubsPanel] ✏️ Mis à jour: ${clubConfig.name}`);
        } catch {
          // Message introuvable → en crée un nouveau
          const msg = await channel.send({ embeds: [embed] });
          await supabase
            .from('panel_messages')
            .upsert({ club_tag: clubConfig.tag, message_id: msg.id, channel_id: channel.id }, { onConflict: 'club_tag' });
          console.log(`[ClubsPanel] 📝 Recréé: ${clubConfig.name}`);
        }
      } else {
        // Crée un nouveau message et sauvegarde l'ID
        const msg = await channel.send({ embeds: [embed] });
        await supabase
          .from('panel_messages')
          .upsert({ club_tag: clubConfig.tag, message_id: msg.id, channel_id: channel.id }, { onConflict: 'club_tag' });
        console.log(`[ClubsPanel] 🆕 Créé: ${clubConfig.name}`);
      }

      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`[ClubsPanel] Erreur pour ${clubConfig.name}:`, err.message);
    }
  }

  // Met à jour le cache
  setCache(allMembers);
  console.log('[ClubsPanel] ✅ Panels mis à jour');
}

module.exports = { updateClubsPanel };