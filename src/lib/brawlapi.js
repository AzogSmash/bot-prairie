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
          const contact = 'Si le problème persiste, contacte <@550678866839207937> en MP.';
          if (res.statusCode === 503 || body.reason === 'inMaintenance') {
            reject(new Error("🔧 L'API Brawl Stars est en cours de mise à jour, réessaie dans quelques minutes."));
          } else if (res.statusCode === 404) {
            reject(new Error('❓ Joueur introuvable. Vérifie que le tag est correct.'));
          } else if (res.statusCode === 429) {
            reject(new Error(`⏳ Trop de requêtes vers l'API Brawl Stars, réessaie dans quelques secondes. ${contact}`));
          } else if (res.statusCode === 403) {
            reject(new Error(`🔑 La clé API Brawl Stars est invalide ou expirée. ${contact}`));
          } else if (res.statusCode >= 500) {
            reject(new Error(`💥 Erreur serveur Brawl Stars (${res.statusCode}). ${contact}`));
          } else {
            reject(new Error(`❌ Erreur inattendue (${res.statusCode}). ${contact}`));
          }
        }
      });
    }).on('error', (err) => {
      reject(new Error(`🌐 Impossible de contacter l'API Brawl Stars. Vérifie ta connexion ou réessaie. Si le problème persiste, contacte <@550678866839207937> en MP.`));
    });
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