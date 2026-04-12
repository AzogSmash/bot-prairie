let clubMembersCache = [];
let progressionCache = {};
let lastUpdate = null;

function getCache() {
  return { clubMembersCache, progressionCache, lastUpdate };
}

function setCache(members) {
  clubMembersCache = members;
  lastUpdate = new Date();
}

function setProgressionCache(progression) {
  progressionCache = progression;
}

function isCacheValid() {
  if (!lastUpdate) return false;
  return (new Date() - lastUpdate) < 60 * 60 * 1000;
}

module.exports = { getCache, setCache, setProgressionCache, isCacheValid };