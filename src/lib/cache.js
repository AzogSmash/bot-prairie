let clubMembersCache = [];
let lastUpdate = null;

function getCache() {
  return { clubMembersCache, lastUpdate };
}

function setCache(members) {
  clubMembersCache = members;
  lastUpdate = new Date();
}

function isCacheValid() {
  if (!lastUpdate) return false;
  return (new Date() - lastUpdate) < 60 * 60 * 1000; // 1 heure
}

module.exports = { getCache, setCache, isCacheValid };