const https = require('https');

async function brawlFetch(path) {
  const url = `https://bsproxy.royaleapi.dev/v1${path}`;

  const options = {
    headers: {
      'Authorization': `Bearer ${process.env.BRAWLSTARS_API_KEY}`,
      'Accept': 'application/json',
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[BS API] ${path} → ${res.statusCode}`);
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.log(`[BS API] Error: ${data}`);
          let body = {};
          try { body = JSON.parse(data); } catch {}
          if (res.statusCode === 503 || body.reason === 'inMaintenance') {
            reject(new Error("L'API Brawl Stars est actuellement en mise à jour, elle devrait revenir sous peu."));
          } else {
            reject(new Error(`Erreur API (${res.statusCode})`));
          }
        }
      });
    }).on('error', reject);
  });
}

async function getPlayer(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  return brawlFetch(`/players/%23${cleanTag}`);
}

async function getClub(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  return brawlFetch(`/clubs/%23${cleanTag}`);
}

async function getBattleLog(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  return brawlFetch(`/players/%23${cleanTag}/battlelog`);
}

module.exports = { getPlayer, getClub, getBattleLog };