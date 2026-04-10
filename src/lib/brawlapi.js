const https = require('https');

async function getPlayer(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://bsproxy.royaleapi.dev/v1/players/%23${cleanTag}`;

  console.log(`[BS API] Fetching player: ${cleanTag}`);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[BS API] Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.log(`[BS API] Error: ${data}`);
          reject(new Error(`Tag introuvable (${res.statusCode})`));
        }
      });
    }).on('error', reject);
  });
}

async function getClub(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://bsproxy.royaleapi.dev/v1/clubs/%23${cleanTag}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Club introuvable (${res.statusCode})`));
        }
      });
    }).on('error', reject);
  });
}

module.exports = { getPlayer, getClub };