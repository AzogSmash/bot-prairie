const { supabase } = require('./supabase');

const PRAIRIE_CLUBS = [
  { tag: '#29UPLG8QQ', name: 'Prairie Étoilée' },
  { tag: '#2C9Y28JPP', name: 'Prairie Fleurie' },
  { tag: '#2JUVYQ0YV', name: 'Prairie Céleste' },
  { tag: '#2CJJLLUQ9', name: 'Prairie Gelée' },
  { tag: '#2YGPRQYCC', name: 'Prairie Brûlée' },
  { tag: '#JY89VGGP',  name: 'Mini Prairie' },
  { tag: '#C9JUYQQY',  name: 'Prairie Sauvage' },
];

async function getProgressionStats(clubFilter) {
  // Snapshot de référence selon le type
  async function getRefSnapshot(type, sinceDate = null) {
    let query = supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies, club_name')
      .eq('type', type)
      .order('snapshot_at', { ascending: false });

    if (sinceDate) query = query.gte('snapshot_at', sinceDate);
    const { data } = await query.limit(1000);
    // Garde uniquement le plus récent par membre
    const map = {};
    for (const r of (data || [])) {
      if (!map[r.bs_tag]) map[r.bs_tag] = r;
    }
    return Object.values(map);
  }

  // Snapshot début de saison = premier hourly après season_start
  async function getSeasonRef() {
    const { data: season } = await supabase
      .from('season_starts')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1);
    if (!season?.length) return [];

    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies, club_name')
      .eq('type', 'hourly')
      .gte('snapshot_at', season[0].started_at)
      .order('snapshot_at', { ascending: true })
      .limit(1000);

    // Garde uniquement le PREMIER par membre (le plus proche du début de saison)
    const map = {};
    for (const r of (data || [])) {
      if (!map[r.bs_tag]) map[r.bs_tag] = r;
    }
    return Object.values(map);
  }

  // Trophées actuels = dernier snapshot hourly
  async function getCurrentSnapshot() {
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('bs_tag, trophies, club_name')
      .eq('type', 'hourly')
      .order('snapshot_at', { ascending: false })
      .limit(1000);
    const map = {};
    for (const r of (data || [])) {
      if (!map[r.bs_tag]) map[r.bs_tag] = r;
    }
    return Object.values(map);
  }

  const [daily, weekly, seasonRef, current] = await Promise.all([
    getRefSnapshot('daily'),
    getRefSnapshot('weekly'),
    getSeasonRef(),
    getCurrentSnapshot(),
  ]);

  // Filtre par club
  const clubName = clubFilter !== 'tous'
    ? PRAIRIE_CLUBS.find(c => c.tag === clubFilter)?.name
    : null;

  const filterRows = (rows) => clubName
    ? rows.filter(r => r.club_name === clubName)
    : rows;

  const currentFiltered = filterRows(current);
  const tags = new Set(currentFiltered.map(r => r.bs_tag));
  const currentTotal = currentFiltered.reduce((a, r) => a + r.trophies, 0);

  const calcDelta = (refRows) => {
    const refFiltered = refRows.filter(r => tags.has(r.bs_tag));
    if (!refFiltered.length) return null;
    const refTotal = refFiltered.reduce((a, r) => a + r.trophies, 0);
    return currentTotal - refTotal;
  };

  return {
    today: calcDelta(daily),
    week: calcDelta(weekly),
    season: calcDelta(seasonRef),
  };
}

async function getMemberProgression(bsTag) {
  async function getDelta(type) {
    const { data } = await supabase
      .from('trophies_snapshots')
      .select('trophies')
      .eq('bs_tag', bsTag)
      .eq('type', type)
      .order('snapshot_at', { ascending: false })
      .limit(1);
    return data?.[0]?.trophies || null;
  }

  async function getSeasonDelta() {
    const { data: season } = await supabase
      .from('season_starts')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1);
    if (!season?.length) return null;

    const { data } = await supabase
      .from('trophies_snapshots')
      .select('trophies')
      .eq('bs_tag', bsTag)
      .eq('type', 'hourly')
      .gte('snapshot_at', season[0].started_at)
      .order('snapshot_at', { ascending: true })
      .limit(1);
    return data?.[0]?.trophies || null;
  }

  const [daily, weekly, seasonRef] = await Promise.all([
    getDelta('daily'),
    getDelta('weekly'),
    getSeasonDelta(),
  ]);

  return { daily, weekly, seasonRef };
}

module.exports = { getProgressionStats, getMemberProgression };