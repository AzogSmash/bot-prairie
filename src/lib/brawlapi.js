require('dotenv').config();
const https = require('https');

async function getPlayer(tag) {
  // Nettoie le tag — enlève le # et encode
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://api.brawlstars.com/v1/players/%23${cleanTag}`;

  const options = {
    headers: {
      'Authorization': `Bearer ${process.env.BRAWLSTARS_API_KEY}`,
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Tag introuvable (${res.statusCode})`));
        }
      });
    }).on('error', reject);
  });
}

async function getClub(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();
  const url = `https://api.brawlstars.com/v1/clubs/%23${cleanTag}`;

  const options = {
    headers: {
      'Authorization': `Bearer ${process.env.BRAWLSTARS_API_KEY}`,
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
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