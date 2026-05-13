const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { getCache, setProgressionCache } = require('../lib/cache');
const { getProgressionStats } = require('../lib/progression');
const { DateTime } = require('luxon');
const { PRAIRIE_CLUBS } = require('../modules/clubsPanel');
const { getAccountsSummary } = require('../lib/brawlAccounts');
const { getPlayer } = require('../lib/brawlapi');

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
  { min: 75000,  roleId: '1489338610221060358', name: '+75k 🏆' },
  { min: 50000,  roleId: '1489338218301227078', name: '+50k 🏆' },
  { min: 25000,  roleId: '1489338230850453524', name: '+25k 🏆' },
  { min: 0,      roleId: '1469068880369553569', name: '-25k 🏆' },
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

async function updateMemberRoles(member, clubNames, trophies) {
  const rolesToAdd = [];
  const rolesToRemove = [];

  const expectedClubRoleIds = new Set(
    (clubNames || []).map(name => CLUB_ROLES[name]).filter(Boolean)
  );

  for (const roleId of ALL_CLUB_ROLE_IDS) {
    const hasRole = member.roles.cache.has(roleId);
    if (expectedClubRoleIds.has(roleId) && !hasRole) rolesToAdd.push(roleId);
    else if (!expectedClubRoleIds.has(roleId) && hasRole) rolesToRemove.push(roleId);
  }

  const expectedTrophyRoleId = getTrophyRole(trophies).roleId;

  for (const roleId of ALL_TROPHY_ROLE_IDS) {
    const hasRole = member.roles.cache.has(roleId);
    if (roleId === expectedTrophyRoleId && !hasRole) rolesToAdd.push(roleId);
    else if (roleId !== expectedTrophyRoleId && hasRole) rolesToRemove.push(roleId);
  }

  if (rolesToRemove.length) await member.roles.remove(rolesToRemove).catch(() => {});
  if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});

  return rolesToAdd.length > 0 || rolesToRemove.length > 0;
}

async function updateRolesAndNotify(client, options = {}) {
  const suppressNotifications = options.suppressNotifications === true;
  const onlyDiscordId = options.onlyDiscordId || null;
  const { clubMembersCache } = getCache();
  if (!clubMembersCache.length) return;

  console.log('[Roles] Mise à jour des rôles...');

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  await guild.members.fetch({ limit: 1000 }).catch(() => {});

  const { data: linkedMembers } = await supabase
    .from('members')
    .select('discord_id, brawlstars_tag, brawlstars_trophies, club_name, status')
    .not('brawlstars_tag', 'is', null);

  if (!linkedMembers?.length) return;

  // ── Construction du cache trophées ────────────────────────────────────────
  // 1. Membres des clubs Prairie (cache déjà dispo)
  const currentTrophiesMap = new Map();
  for (const m of clubMembersCache) {
    currentTrophiesMap.set(m.bsTag, { trophies: m.trophies, clubName: m.clubName, bsName: m.bsName });
  }

  // 2. Tous les comptes liés en une seule requête Supabase
  const { data: allLinkedAccounts } = await supabase
    .from('member_brawl_accounts')
    .select('discord_id, bs_tag');

  // Map discord_id → [bs_tags]
  const accountsByDiscordId = new Map();
  for (const acc of (allLinkedAccounts || [])) {
    if (!accountsByDiscordId.has(acc.discord_id)) accountsByDiscordId.set(acc.discord_id, []);
    accountsByDiscordId.get(acc.discord_id).push(acc.bs_tag);
  }

  // Map discord_id → dbMember pour le fallback
  const dbMemberMap = new Map(linkedMembers.map(m => [m.discord_id, m]));

  // 3. Pour les tags non encore dans le cache, appel API BS
  for (const [discordId, tags] of accountsByDiscordId) {
    const dbMember = dbMemberMap.get(discordId);
    for (const bsTag of tags) {
      if (!bsTag || currentTrophiesMap.has(bsTag)) continue;

      try {
        const player = await getPlayer(bsTag);
        currentTrophiesMap.set(bsTag, {
          trophies: player.trophies ?? 0,
          clubName: player.club?.name ?? null,
          bsName: player.name ?? null,
        });
      } catch {
        // Fallback sur les données en base si l'API échoue
        if (dbMember?.brawlstars_trophies) {
          currentTrophiesMap.set(bsTag, {
            trophies: dbMember.brawlstars_trophies,
            clubName: dbMember.club_name,
            bsName: null,
          });
        }
      }
    }
  }

  // ── Mise à jour des rôles et détection des paliers ────────────────────────
  const notifications = [];
  const dbUpdates = [];

  for (const dbMember of linkedMembers) {
    if (onlyDiscordId && dbMember.discord_id !== onlyDiscordId) continue;

    const member = guild.members.cache.get(dbMember.discord_id);
    if (!member) continue;

    const summary = await getAccountsSummary(dbMember.discord_id, currentTrophiesMap);
    if (!summary.accounts.length) continue;

    const oldTrophies = dbMember.brawlstars_trophies || 0;
    const newTrophies = summary.bestTrophies;
    const clubNames = summary.clubNames;
    const mainClubName = summary.mainAccount?.clubName || null;

    await updateMemberRoles(member, clubNames, newTrophies);

    const canNotifyProgress = !suppressNotifications && dbMember.status !== 'nouveau';

    if (canNotifyProgress && oldTrophies > 0 && newTrophies > oldTrophies) {
      const oldTier = getTrophyRole(oldTrophies);
      const newTier = getTrophyRole(newTrophies);

      if (oldTier.roleId !== newTier.roleId && newTier.min > oldTier.min) {
        notifications.push({
          member,
          clubName: mainClubName,
          oldTier: oldTier.name,
          newTier: newTier.name,
          trophies: newTrophies,
        });
      }
    }

    if (newTrophies !== oldTrophies || mainClubName !== dbMember.club_name || dbMember.status !== 'actif') {
      dbUpdates.push({
        discord_id: dbMember.discord_id,
        brawlstars_trophies: newTrophies,
        club_name: mainClubName,
        status: 'actif',
      });
    }
  }

  // ── Mise à jour Supabase ───────────────────────────────────────────────────
  for (const update of dbUpdates) {
    await supabase
      .from('members')
      .update({
        brawlstars_trophies: update.brawlstars_trophies,
        club_name: update.club_name,
        status: update.status,
      })
      .eq('discord_id', update.discord_id);
  }

  // ── Notifications paliers ─────────────────────────────────────────────────
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
          embeds: [embed],
        });

        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log(`[Roles] ✅ ${linkedMembers.length} membres, ${notifications.length} palier(s)`);
}

// ── Anniversaires ────────────────────────────────────────────────────────────
async function checkBirthdays(client) {
  const now = DateTime.now().setZone('Europe/Paris');
  if (now.hour !== 0) return;

  const { data: birthdays } = await supabase
    .from('birthdays')
    .select('discord_id, discord_username, day, month, last_wished_year')
    .eq('day', now.day)
    .eq('month', now.month);

  if (!birthdays?.length) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  await guild.members.fetch({ limit: 1000 }).catch(() => {});

  const generalChannel = await guild.channels.fetch(GENERAL_CHANNEL_ID).catch(() => null);

  for (const bday of birthdays) {
    const member = guild.members.cache.get(bday.discord_id);

    if (!member) {
      await supabase.from('birthdays').delete().eq('discord_id', bday.discord_id);
      console.log(`[Anniversaires] Supprimé : ${bday.discord_username} (a quitté le serveur)`);
      continue;
    }

    if (bday.last_wished_year === now.year) continue;

    await supabase
      .from('birthdays')
      .update({ last_wished_year: now.year })
      .eq('discord_id', bday.discord_id);

    if (!generalChannel) continue;

    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('🎂 Joyeux anniversaire !')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        `Aujourd'hui c'est l'anniversaire de **${member.displayName}** ! 🎉\n\n` +
        `Souhaitez-lui un joyeux anniversaire ! 🥳`
      )
      .setFooter({ text: 'Prairie Brawl Stars • Anniversaires' })
      .setTimestamp();

    await generalChannel.send({
      content: `🎊 ${member} fête son anniversaire aujourd'hui !`,
      embeds: [embed],
    });

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[Anniversaires] ✅ Check terminé (${birthdays.length} fête(s) aujourd'hui)`);
}

// ── Reset automatique des saisons ────────────────────────────────────────────
async function checkSeasonResets(client) {
  const nowUtc = DateTime.now().setZone('UTC');
  if (nowUtc.weekday !== 4 || nowUtc.hour !== 9) return; // jeudi 9h UTC uniquement

  const isFirstThursday = nowUtc.day <= 7;
  const isThirdThursday = nowUtc.day >= 15 && nowUtc.day <= 21;
  if (!isFirstThursday && !isThirdThursday) return;

  const type = isFirstThursday ? 'classique' : 'classée';
  const todayUtc = nowUtc.startOf('day').toISO();

  // Dédup — ne rien faire si déjà inséré aujourd'hui
  const { data: existing } = await supabase
    .from('season_starts')
    .select('id')
    .eq('type', type)
    .gte('started_at', todayUtc)
    .maybeSingle();
  if (existing) return;

  // Calcul du prochain numéro
  const { data: last } = await supabase
    .from('season_starts')
    .select('number')
    .eq('type', type)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNumber = last?.number ?? 0;
  let number, label;

  if (type === 'classique') {
    number = lastNumber + 1;
    label  = `Saison ${number}`;
  } else {
    number = (lastNumber % 4) + 1;
    label  = `Saison classée mois ${number}/4`;
  }

  await supabase.from('season_starts').insert({
    started_at: nowUtc.toISO(),
    label,
    type,
    number,
  });

  console.log(`[Saison] ✅ Nouveau reset automatique : ${label}`);

  if (client && process.env.STAFF_CHANNEL_ID) {
    try {
      const guild   = await client.guilds.fetch(process.env.GUILD_ID);
      const channel = await guild.channels.fetch(process.env.STAFF_CHANNEL_ID);
      const { EmbedBuilder } = require('discord.js');
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(type === 'classique' ? '#3498db' : '#9b59b6')
            .setTitle(`🔄 Nouvelle saison — ${label}`)
            .setDescription(
              type === 'classique'
                ? `La saison classique vient de se réinitialiser.\nLes trophées ont été remis à zéro dans le jeu.`
                : `La saison classée vient de se réinitialiser.\nLes elos ranked ont été remis à zéro dans le jeu.`
            )
            .setFooter({ text: 'Reset automatique • Prairie Brawl Stars' })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error('[Saison] Erreur notification staff :', err);
    }
  }
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
  if (now.hour === 0 && now.minute < 30) await saveSnapshots(clubMembersCache, 'daily');
  if (now.weekday === 1 && now.hour === 0 && now.minute < 30) await saveSnapshots(clubMembersCache, 'weekly');
  if (now.day === 1 && now.hour === 0 && now.minute < 30) await saveSnapshots(clubMembersCache, 'monthly');

  const progression = {};
  for (const club of PRAIRIE_CLUBS) {
    progression[club.tag] = await getProgressionStats(club.tag);
  }
  progression['tous'] = await getProgressionStats('tous');
  setProgressionCache(progression);

  console.log('[Snapshots] ✅ Done');

  if (client) {
    await updateRolesAndNotify(client);
    await checkSeasonResets(client);
    await checkBirthdays(client);
  }
}

module.exports = {
  updateSnapshots,
  updateRolesAndNotify,
  checkSeasonResets,
  checkBirthdays,
  CLUB_ROLES,
  TROPHY_ROLES,
  getTrophyRole,
  updateMemberRoles,
};