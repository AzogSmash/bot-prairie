const https = require('https');

async function fetchRntProfile(tag) {
  const cleanTag = tag.replace('#', '').toUpperCase();

  return new Promise((resolve, reject) => {
    https.get(`https://api.rnt.dev/profile?tag=${cleanTag}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.ok && j.result) resolve(j.result);
          else reject(new Error('RNT non trouvé'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

module.exports = { fetchRntProfile };