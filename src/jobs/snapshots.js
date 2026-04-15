const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { getCache, setProgressionCache } = require('../lib/cache');
const { getProgressionStats } = require('../lib/progression');
const { DateTime } = require('luxon');
const { PRAIRIE_CLUBS } = require('../modules/clubsPanel');

const GENERAL_CHANNEL_ID = '1173550145955180618';

const CLUB_ROLES = {
  'Prairie Étoilée': '1187124591630487574',
  'Prairie Céleste': '1357378026626875545',
  'Prairie fleurie': '1178305128294531073',
  'Prairie Gelée': '1181187490896412743',
  'Prairie Brûlée': '1279895262512287856',
  'Prairie Sauvage': '1473454567533445191',
  'Mini Prairie': '1359272754922131716',
};

const TROPHY_ROLES = [
  { min: 200000, roleId: '1488793900029055156', name: '+200k 🏆' },
  { min: 180000, roleId: '1489338802672501017', name: '+180k 🏆' },
  { min: 160000, roleId: '1488793829497897071', name: '+160k 🏆' },
  { min: 140000, roleId: '1488793749709525022', name: '+140k 🏆' },
  { min: 120000, roleId: '1488793538916257812', name: '+120k 🏆' },
  { min: 100000, roleId: '1469069465189748878', name: '+100k 🏆' },
  { min: 75000, roleId: '1489338610221060358', name: '+75k 🏆' },
  { min: 50000, roleId: '1489338218301227078', name: '+50k 🏆' },
  { min: 25000, roleId: '1489338230850453524', name: '+25k 🏆' },
  { min: 0, roleId: '1469068880369553569', name: '-25k 🏆' },
];

const ALL_CLUB_ROLE_IDS = Object.values(CLUB_ROLES);
const ALL_TROPHY_ROLE_IDS = TROPHY_ROLES.map(t => t.roleId);

function getTrophyRole(trophies) {
  for (const tier of TROPHY_ROLES) {
    if (trophies >= tier.min) return tier;
  }
  return TROPHY_ROLES[TROPHY_ROLES.length - 1];
}

function getNowParis() {
  return DateTime.now().setZone('Europe/Paris');
}

async function saveSnapshots(members, type) {
  if (!members.length) return;
  const rows = members.map(m => ({
    bs_tag: m.bsTag,
    bs_name: m.bsName,
    trophies: m.trophies,
    club_name: m.clubName,
    type,
    snapshot_at: new Date().toISOString(),
  }));
  await supabase.from('trophies_snapshots').insert(rows);
}

async function updateMemberRoles(member, clubName, trophies) {
  const rolesToAdd = [];
  const rolesToRemove = [];

  // Rôle club attendu
  const expectedClubRoleId = clubName && CLUB_ROLES[clubName] ? CLUB_ROLES[clubName] : null;
  
  // Rôles clubs actuels
  for (const roleId of ALL_CLUB_ROLE_IDS) {
    const hasRole = member.roles.cache.has(roleId);
    if (roleId === expectedClubRoleId && !hasRole) {
      rolesToAdd.push(roleId);
    } else if (roleId !== expectedClubRoleId && hasRole) {
      rolesToRemove.push(roleId);
    }
  }

  // Rôle trophées attendu
  const expectedTrophyRoleId = getTrophyRole(trophies).roleId;
  
  // Rôles trophées actuels
  for (const roleId of ALL_TROPHY_ROLE_IDS) {
    const hasRole = member.roles.cache.has(roleId);
    if (roleId === expectedTrophyRoleId && !hasRole) {
      rolesToAdd.push(roleId);
    } else if (roleId !== expectedTrophyRoleId && hasRole) {
      rolesToRemove.push(roleId);
    }
  }

  // Applique les changements seulement si nécessaire
  if (rolesToRemove.length) await member.roles.remove(rolesToRemove).catch(() => {});
  if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});

  return rolesToAdd.length > 0 || rolesToRemove.length > 0;
}

async function updateRolesAndNotify(client) {
  const { clubMembersCache } = getCache();
  if (!clubMembersCache.length) return;

  console.log('[Roles] Mise à jour des rôles...');

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  // Fetch tous les membres du serveur en une fois
  await guild.members.fetch();

  // Récupère tous les membres liés
  const { data: linkedMembers } = await supabase
    .from('members')
    .select('discord_id, brawlstars_tag, brawlstars_trophies')
    .not('brawlstars_tag', 'is', null);

  if (!linkedMembers?.length) return;

  // Map des trophées actuels depuis le cache
  const currentTrophiesMap = new Map();
  for (const m of clubMembersCache) {
    currentTrophiesMap.set(m.bsTag, { trophies: m.trophies, clubName: m.clubName, bsName: m.bsName });
  }

  const notifications = [];
  const dbUpdates = [];

  for (const dbMember of linkedMembers) {
    const currentData = currentTrophiesMap.get(dbMember.brawlstars_tag);
    if (!currentData) continue;

    const member = guild.members.cache.get(dbMember.discord_id);
    if (!member) continue;

    const oldTrophies = dbMember.brawlstars_trophies || 0;
    const newTrophies = currentData.trophies;
    const clubName = currentData.clubName;

    // Met à jour les rôles (seulement si changement)
    await updateMemberRoles(member, clubName, newTrophies);

    // Vérifie si nouveau palier atteint
    if (oldTrophies > 0 && newTrophies > oldTrophies) {
      const oldTier = getTrophyRole(oldTrophies);
      const newTier = getTrophyRole(newTrophies);

      if (oldTier.roleId !== newTier.roleId && newTier.min > oldTier.min) {
        notifications.push({
          member,
          clubName,
          oldTier: oldTier.name,
          newTier: newTier.name,
          trophies: newTrophies,
        });
      }
    }

    // Prépare la mise à jour en batch
    if (newTrophies !== oldTrophies || clubName !== dbMember.club_name) {
      dbUpdates.push({
        discord_id: dbMember.discord_id,
        brawlstars_trophies: newTrophies,
        club_name: clubName,
      });
    }
  }

  // Mise à jour batch Supabase
  if (dbUpdates.length) {
    for (const update of dbUpdates) {
      await supabase
        .from('members')
        .update({ brawlstars_trophies: update.brawlstars_trophies, club_name: update.club_name })
        .eq('discord_id', update.discord_id);
    }
  }

  // Envoie les notifications
  if (notifications.length > 0) {
    const generalChannel = await guild.channels.fetch(GENERAL_CHANNEL_ID).catch(() => null);
    
    if (generalChannel) {
      for (const notif of notifications) {
        const embed = new EmbedBuilder()
          .setColor('#f1c40f')
          .setTitle('🎉 Nouveau palier atteint !')
          .setThumbnail(notif.member.user.displayAvatarURL({ dynamic: true }))
          .setDescription(
            `**${notif.member.displayName}** vient de passer au palier **${notif.newTier}** !\n\n` +
            `🏆 **${notif.trophies.toLocaleString('fr-FR')}** trophées\n` +
            `🌿 ${notif.clubName || 'Sans club'}\n\n` +
            `GG à toi ! Continue comme ça 💪`
          )
          .setFooter({ text: 'Prairie Brawl Stars • Progression' })
          .setTimestamp();

        await generalChannel.send({ 
          content: `Félicitations ${notif.member} ! 🎊`,
          embeds: [embed] 
        });

        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log(`[Roles] ✅ ${linkedMembers.length} membres, ${notifications.length} palier(s)`);
}

async function updateSnapshots(client) {
  const { clubMembersCache } = getCache();
  if (!clubMembersCache.length) {
    console.log('[Snapshots] Cache vide, skip');
    return;
  }

  console.log('[Snapshots] Sauvegarde des snapshots...');
  const now = getNowParis();

  await saveSnapshots(clubMembersCache, 'hourly');
  if (now.hour === 0 && now.minute < 60) await saveSnapshots(clubMembersCache, 'daily');
  if (now.weekday === 1 && now.hour === 0) await saveSnapshots(clubMembersCache, 'weekly');
  if (now.day === 1 && now.hour === 0) await saveSnapshots(clubMembersCache, 'monthly');

  const progression = {};
  for (const club of PRAIRIE_CLUBS) {
    progression[club.tag] = await getProgressionStats(club.tag);
  }
  progression['tous'] = await getProgressionStats('tous');
  setProgressionCache(progression);

  console.log('[Snapshots] ✅ Done');

  if (client) {
    await updateRolesAndNotify(client);
  }
}

module.exports = { updateSnapshots, CLUB_ROLES, TROPHY_ROLES, getTrophyRole, updateMemberRoles };