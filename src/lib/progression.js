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
  // ... colle ici la fonction getProgressionStats complète
}

async function getMemberProgression(bsTag) {
  // ... colle ici la fonction getMemberProgression complète
}

module.exports = { getProgressionStats, getMemberProgression };