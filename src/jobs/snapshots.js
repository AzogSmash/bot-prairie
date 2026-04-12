const { supabase } = require('../lib/supabase');
const { getCache, setProgressionCache } = require('../lib/cache');
const { getProgressionStats } = require('../lib/progression');
const { DateTime } = require('luxon');
const { PRAIRIE_CLUBS } = require('../modules/clubsPanel');

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

async function updateSnapshots() {
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

  // Recalcule et met en cache la progression
  const progression = {};
  for (const club of PRAIRIE_CLUBS) {
    progression[club.tag] = await getProgressionStats(club.tag);
  }
  progression['tous'] = await getProgressionStats('tous');
  setProgressionCache(progression);

  console.log('[Snapshots] ✅ Done');
}

module.exports = { updateSnapshots };