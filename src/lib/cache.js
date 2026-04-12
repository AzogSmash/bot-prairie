let clubMembersCache = [];
let progressionCache = {};
let lastUpdate = null;

function getCache() {
  return { clubMembersCache, progressionCache, lastUpdate };
}

function setCache(members, progression = {}) {
  clubMembersCache = members;
  progressionCache = progression;
  lastUpdate = new Date();
}

function isCacheValid() {
  if (!lastUpdate) return false;
  return (new Date() - lastUpdate) < 60 * 60 * 1000;
}

module.exports = { getCache, setCache, isCacheValid };