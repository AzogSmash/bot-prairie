const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const https = require('https');
const http = require('http');
const imageCache = new Map();

registerFont(path.join(__dirname, '../assets/LilitaOne-Regular.ttf'), { family: 'Lilita' });
registerFont(path.join(__dirname, '../assets/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });

// ═══════════════════════════════════════════════════════
// PALETTE PRAIRIE
// ═══════════════════════════════════════════════════════
const PRAIRIE = {
  panel: 'rgba(29, 37, 24, 0.86)',
  panelAlt: 'rgba(45, 32, 21, 0.84)',
  panelSoft: 'rgba(33, 43, 28, 0.78)',
  leftOverlay: 'rgba(19, 24, 16, 0.55)',
  rightOverlay: 'rgba(28, 35, 22, 0.30)',
  innerStroke: 'rgba(225, 190, 110, 0.32)',
  pattern: 'rgba(220, 190, 120, 0.08)',
  greenText: '#a8ff62',
  goldText: '#f0b43c',
  cream: '#f4f0e2',
  muted: '#d6cdb6',
  blueXP1: '#79dfff',
  blueXP2: '#3098ff',
};

// ═══════════════════════════════════════════════════════
// RANKED TIERS
// ═══════════════════════════════════════════════════════
const RANKED_TIERS = [
  { min: 0,     name: 'Bronze',    file: 'Bronze',    color: '#cd7f32' },
  { min: 750,   name: 'Silver',    file: 'Silver',    color: '#c0c0c0' },
  { min: 1500,  name: 'Gold',      file: 'Gold',      color: '#ffd700' },
  { min: 3000,  name: 'Diamond',   file: 'Diamond',   color: '#00bfff' },
  { min: 4500,  name: 'Mythic',    file: 'Mythic',    color: '#e84393' },
  { min: 6000,  name: 'Legendary', file: 'Legendary', color: '#e74c3c' },
  { min: 8250,  name: 'Masters',   file: 'Masters',   color: '#ff6b35' },
  { min: 11250, name: 'Pro',       file: 'Pro',       color: '#f1c40f' },
];
const RANKED_SUBTIERS = [
  { min: 0,     sub: 'I' },   { min: 250,  sub: 'II' },  { min: 500,  sub: 'III' },
  { min: 750,   sub: 'I' },   { min: 1000, sub: 'II' },  { min: 1250, sub: 'III' },
  { min: 1500,  sub: 'I' },   { min: 2000, sub: 'II' },  { min: 2500, sub: 'III' },
  { min: 3000,  sub: 'I' },   { min: 3500, sub: 'II' },  { min: 4000, sub: 'III' },
  { min: 4500,  sub: 'I' },   { min: 5000, sub: 'II' },  { min: 5500, sub: 'III' },
  { min: 6000,  sub: 'I' },   { min: 6750, sub: 'II' },  { min: 7500, sub: 'III' },
  { min: 8250,  sub: 'I' },   { min: 9250, sub: 'II' },  { min: 10250, sub: 'III' },
  { min: 11250, sub: '' },
];
function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Unranked', file: null, color: '#95a5a6', sub: '' };
  let tier = RANKED_TIERS[0];
  for (const t of RANKED_TIERS) { if (elo >= t.min) tier = t; }
  let sub = '';
  for (const s of RANKED_SUBTIERS) { if (elo >= s.min) sub = s.sub; }
  return { ...tier, sub };
}

// ═══════════════════════════════════════════════════════
// HELPERS DATA
// ═══════════════════════════════════════════════════════
function normalizeStr(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function getStat(stats, name) { return stats?.find(s => s.name === name)?.value || 0; }
function getStatLoose(stats, ...names) {
  const map = new Map((stats || []).map(s => [normalizeStr(s.name), Number(s.value) || 0]));
  for (const name of names) {
    const k = normalizeStr(name);
    if (map.has(k)) return map.get(k);
  }
  return 0;
}

function getFavoriteBrawlerEntry(rntData) {
  const favoriteBrawlerId = Number(rntData?.favorite_brawler || 0);
  if (!favoriteBrawlerId) return null;

  return (rntData?.brawlers || []).find(
    b => Number(b.brawler_id) === favoriteBrawlerId
  ) || null;
}

function getFavoriteSkinId(rntData) {
  const favoriteEntry = getFavoriteBrawlerEntry(rntData);

  return (
    Number(favoriteEntry?.skin_equipped || 0) ||
    Number(rntData?.battle_card?.favorite_skin || 0) ||
    0
  );
}

function getFamePoints(rntData) {
  return getStatLoose(rntData?.stats || [], 'FamePoints', 'fame_points') || 0;
}

function getFameTierFromPoints(points) {
  const p = Number(points || 0);

  if (p >= 449100) return 24;
  if (p >= 374100) return 23;
  if (p >= 299100) return 22;

  if (p >= 249100) return 21;
  if (p >= 199100) return 20;
  if (p >= 149100) return 19;

  if (p >= 129100) return 18;
  if (p >= 109100) return 17;
  if (p >= 89100)  return 16;

  if (p >= 77100) return 15;
  if (p >= 65100) return 14;
  if (p >= 53100) return 13;

  if (p >= 45100) return 12;
  if (p >= 37100) return 11;
  if (p >= 29100) return 10;

  if (p >= 24600) return 9;
  if (p >= 20100) return 8;
  if (p >= 15600) return 7;

  if (p >= 12400) return 6;
  if (p >= 9200)  return 5;
  if (p >= 6000)  return 4;

  if (p >= 4000) return 3;
  if (p >= 2000) return 2;
  return 1;
}

function getFameCdnUrl(points) {
  const tier = getFameTierFromPoints(points);
  return `https://cdn.bsinfox.com/fame/tier/${tier}.png`;
}

function getBattleCardEmoteCdnUrl(emoteId) {
  if (!emoteId) return null;
  return `https://cdn.bsinfox.com/emote/${emoteId}.png`;
}

function pickHeroBrawlerId(bsPlayer, rntData) {
  const favoriteId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  if (favoriteId) return favoriteId;

  const rntBrawlers = rntData?.brawlers || [];
  if (rntBrawlers.length) {
    const best = [...rntBrawlers].sort((a, b) => {
      const ah = Number(a.highest_trophies || 0), bh = Number(b.highest_trophies || 0);
      if (bh !== ah) return bh - ah;
      const at = Number(a.trophies || 0), bt = Number(b.trophies || 0);
      if (bt !== at) return bt - at;
      return Number(b.power_level || 0) - Number(a.power_level || 0);
    })[0];
    if (best?.brawler_id) return Number(best.brawler_id);
  }

  const bsBrawlers = bsPlayer?.brawlers || [];
  const best = [...bsBrawlers].sort((a, b) => {
    const ah = Number(a.highestTrophies || 0), bh = Number(b.highestTrophies || 0);
    if (bh !== ah) return bh - ah;
    const at = Number(a.trophies || 0), bt = Number(b.trophies || 0);
    if (bt !== at) return bt - at;
    return Number(b.power || 0) - Number(a.power || 0);
  })[0];
  return best?.id || 0;
}

function getTotalPrestigeFromRnt(rntData, bsPlayer) {
  // On ne fait confiance qu'à un vrai champ explicite total_prestige s'il existe
  const direct = Number(rntData?.total_prestige || 0);
  if (direct > 0) return direct;

  const rntBrawlers = rntData?.brawlers || [];
  if (rntBrawlers.length) {
    return rntBrawlers.reduce((sum, b) => {
      const trophies = Math.max(
        Number(b.highest_trophies || 0),
        Number(b.trophies || 0)
      );
      return sum + Math.floor(trophies / 1000);
    }, 0);
  }

  return (bsPlayer?.brawlers || []).reduce((sum, b) => {
    const trophies = Math.max(
      Number(b.highestTrophies || 0),
      Number(b.trophies || 0)
    );
    return sum + Math.floor(trophies / 1000);
  }, 0);
}

function getBsInfoTierFolderFromTrophies(trophies) {
  const t = Number(trophies || 0);

  if (t < 250) return '39000000';
  if (t < 500) return '39000001';
  if (t < 750) return '39000002';
  if (t < 1000) return '39000003';

  // 1000-1999 => 39000004
  // 2000-2999 => 39000005
  // 3000-3999 => 39000006
  const prestigeLevel = Math.floor(t / 1000);
  return String(39000003 + prestigeLevel);
}

function getBsInfoTierUrl(brawlerId, trophies) {
  const folder = getBsInfoTierFolderFromTrophies(trophies);
  return `https://cdn.bsinfox.com/tier/${folder}/${brawlerId}.png`;
}

function getTop10Brawlers(rntBrawlers = [], bsBrawlers = []) {
  if (rntBrawlers.length) {
    return [...rntBrawlers]
      .map(b => ({
        id: Number(b.brawler_id),
        trophies: Number(b.trophies || 0),
        highestTrophies: Number(b.highest_trophies || 0),
      }))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, 10);
  }

  return [...bsBrawlers]
    .map(b => ({
      id: Number(b.id),
      trophies: Number(b.trophies || 0),
      highestTrophies: Number(b.highestTrophies || 0),
    }))
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 10);
}

// ═══════════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════════
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

async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const lib = u.startsWith('https') ? https : http;

      const req = lib.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return go(res.headers.location);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }

        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          loadImage(Buffer.concat(chunks)).then(resolve).catch(reject);
        });
      });

      req.setTimeout(4000, () => {
        req.destroy(new Error(`Timeout image: ${u}`));
      });

      req.on('error', reject);
    };

    go(url);
  });
}

async function tryImg(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);

  try {
    const img = await fetchImage(url);
    imageCache.set(url, img);
    return img;
  } catch (err) {
    console.error('[IMG FAIL]', url, err.message);
    return null;
  }
}

async function tryLocalImg(filePath) {
  if (!filePath) return null;

  try {
    return await loadImage(filePath);
  } catch (err) {
    console.error('[LOCAL IMG FAIL]', filePath, err.message);
    return null;
  }
}

function buildFavoriteCardData(rntData, bsPlayer, allBrawlersMeta = []) {
  const favoriteBrawlerId = Number(rntData?.favorite_brawler || 0);

  const favoriteEntry = (rntData?.brawlers || []).find(
    b => Number(b.brawler_id) === favoriteBrawlerId
  ) || null;

  const meta = allBrawlersMeta.find(
    b => Number(b.id) === favoriteBrawlerId
  ) || null;

  return {
    brawlerId: favoriteBrawlerId,
    skinEquippedId: Number(favoriteEntry?.skin_equipped || 0),
    fallbackFavoriteSkinId: Number(rntData?.battle_card?.favorite_skin || 0),

    trophies: Number(favoriteEntry?.trophies || 0),
    highestTrophies: Number(favoriteEntry?.highest_trophies || 0),
    powerLevel: Number(favoriteEntry?.power_level || 0),
    mastery: Number(favoriteEntry?.mastery || 0),

    battleCardFrameId: Number(rntData?.battle_card?.frame || 0),
    battleCardEmoteId: Number(rntData?.battle_card?.battle_card_emote || 0),
    battleCardTitleId: Number(rntData?.battle_card?.title || 0),
    battleCardPrestigeId: Number(rntData?.battle_card?.prestige || 0),
    firstProfileAvatarId: Number(rntData?.battle_card?.first_profile_avatar || 0),
    secondProfileAvatarId: Number(rntData?.battle_card?.second_profile_avatar || 0),

    profileAvatarId: Number(rntData?.profile_avatar || bsPlayer?.icon?.id || 0),
    playerNameColor: rntData?.name_color || null,

    famePoints: getFamePoints(rntData),
    allianceName: rntData?.alliance?.name || bsPlayer?.club?.name || '',

    brawlerName: meta?.name || null,
    rarityName: meta?.rarity?.name || null,
    rarityColor: meta?.rarity?.color || '#ffffff',
    className: meta?.class?.name || null,

    imageUrl: meta?.imageUrl || null,
    imageUrl2: meta?.imageUrl2 || null,
    imageUrl3: meta?.imageUrl3 || null,
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS CANVAS
// ═══════════════════════════════════════════════════════
function fmt(n) {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

function drawOutlineText(ctx, text, x, y, fillColor, fontSize, font, outlineWidth = 6) {
  ctx.font = `${fontSize}px ${font}`;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

function fitTextSize(ctx, text, maxWidth, startSize, minSize, family, weight = '') {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight ? weight + ' ' : ''}${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size--;
  }
  return minSize;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function bsBox(ctx, x, y, w, h, bgColor, borderColor = '#000', r = 10) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // léger liseré interne
  rr(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2));
  ctx.strokeStyle = PRAIRIE.innerStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function statBox(ctx, x, y, w, h, alt = false) {
  rr(ctx, x, y, w, h, 10);
  ctx.fillStyle = alt ? PRAIRIE.panelAlt : PRAIRIE.panel;
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.stroke();

  rr(ctx, x + 2, y + 2, w - 4, h - 4, 8);
  ctx.strokeStyle = PRAIRIE.innerStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawBSPattern(ctx, x, y, w, h, baseColor, lineColor) {
  ctx.save();
  rr(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  const sz = 38;
  for (let row = -1; row < (h / sz) + 2; row++) {
    for (let col = -1; col < (w / sz) + 2; col++) {
      const cx = x + col * sz + (row % 2 === 0 ? 0 : sz / 2);
      const cy = y + row * sz * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sz * 0.32);
      ctx.lineTo(cx + sz * 0.44, cy);
      ctx.lineTo(cx, cy + sz * 0.32);
      ctx.lineTo(cx - sz * 0.44, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMarker(ctx, x, y, type) {
  ctx.save();

  if (type === 'star') {
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    const r1 = 7, r2 = 3.5, cx = x, cy = y;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * Math.PI / 5) - Math.PI / 2;
      i === 0
        ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
        : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (type === 'flame') {
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'trophy') {
    ctx.fillStyle = '#ffcf4a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - 5, y - 4, 10, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x - 2, y + 3, 4, 5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawTopBattleBadge(ctx, cx, cy, value) {
  ctx.save();

  // glow léger
  ctx.shadowColor = 'rgba(88, 180, 255, 0.35)';
  ctx.shadowBlur = 12;

  // chevrons gauche
  const leftChevrons = [
    { x: cx - 74, y: cy - 2, color: '#72c8ff' },
    { x: cx - 92, y: cy + 2, color: '#8a7dff' },
    { x: cx - 110, y: cy + 6, color: '#98ff8f' },
  ];

  for (const c of leftChevrons) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x - 12, c.y - 10);
    ctx.lineTo(c.x - 20, c.y - 6);
    ctx.lineTo(c.x - 8, c.y + 4);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // chevrons droite
  const rightChevrons = [
    { x: cx + 74, y: cy - 2, color: '#72c8ff' },
    { x: cx + 92, y: cy + 2, color: '#8a7dff' },
    { x: cx + 110, y: cy + 6, color: '#98ff8f' },
  ];

  for (const c of rightChevrons) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + 12, c.y - 10);
    ctx.lineTo(c.x + 20, c.y - 6);
    ctx.lineTo(c.x + 8, c.y + 4);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // hexagone central
  ctx.beginPath();
  ctx.moveTo(cx, cy - 34);
  ctx.lineTo(cx + 30, cy - 18);
  ctx.lineTo(cx + 30, cy + 18);
  ctx.lineTo(cx, cy + 34);
  ctx.lineTo(cx - 30, cy + 18);
  ctx.lineTo(cx - 30, cy - 18);
  ctx.closePath();

  const g = ctx.createLinearGradient(cx, cy - 34, cx, cy + 34);
  g.addColorStop(0, '#184dff');
  g.addColorStop(1, '#1f2f9f');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = '#ff7de8';
  ctx.lineWidth = 4;
  ctx.stroke();

  // liseré interne
  ctx.beginPath();
  ctx.moveTo(cx, cy - 28);
  ctx.lineTo(cx + 24, cy - 14);
  ctx.lineTo(cx + 24, cy + 14);
  ctx.lineTo(cx, cy + 28);
  ctx.lineTo(cx - 24, cy + 14);
  ctx.lineTo(cx - 24, cy - 14);
  ctx.closePath();
  ctx.strokeStyle = '#72deff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // petite étoile en haut
  ctx.beginPath();
  ctx.moveTo(cx, cy - 44);
  ctx.lineTo(cx + 4, cy - 38);
  ctx.lineTo(cx + 10, cy - 38);
  ctx.lineTo(cx + 5, cy - 32);
  ctx.lineTo(cx + 7, cy - 25);
  ctx.lineTo(cx, cy - 29);
  ctx.lineTo(cx - 7, cy - 25);
  ctx.lineTo(cx - 5, cy - 32);
  ctx.lineTo(cx - 10, cy - 38);
  ctx.lineTo(cx - 4, cy - 38);
  ctx.closePath();
  ctx.fillStyle = '#ffe88a';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  drawOutlineText(ctx, String(value), cx, cy + 12, '#ffffff', 30, 'Lilita', 5);

  ctx.restore();
}

let battleCardBgMap = {};

try {
  battleCardBgMap = require('../assets/bgs/battlecard_bg_map.json');
} catch (err) {
  console.error('[BATTLECARD MAP FAIL]', err.message);
}

function getBattleCardBgPath(frameId) {
  const fileName = battleCardBgMap[String(frameId)] || null;
  if (!fileName) return null;
  return path.join(__dirname, '../assets/battlecard-bg', fileName);
}

// ═══════════════════════════════════════════════════════
// GÉNÉRATION CARTE
// ═══════════════════════════════════════════════════════
async function generateProfileCard(bsTag, bsPlayer, rntDataFromCaller = null) {
  let rntData = rntDataFromCaller || null;

  if (!rntData) {
    try {
      const rnt = await fetchRntProfile(bsTag);
      rntData = rnt?.result || rnt || {};
    } catch (e) {
      console.error('[Card] RNT:', e.message);
      rntData = {};
    }
  }

  // ── Normalisation RNT ────────────────────────────────
  const stats = rntData?.stats || [];
  const rntBrawlers = rntData?.brawlers || [];
  const favoriteBrawlerId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  const winstreakBrawlerId = Number(rntData?.winstreak_brawler?.id || rntData?.winstreak_brawler || 0);
  const maxWS = Number(rntData?.max_winstreak || 0);
  const ownedBrawlers = Number(rntData?.brawler_count || 0);
  const allianceName = rntData?.alliance?.name || '';
  const allianceBadge = Number(rntData?.alliance?.badge || 0);
  const firstBattleCardAvatar = Number(rntData?.battle_card?.first_profile_avatar || 0);
  const profileAvatar = Number(rntData?.profile_avatar || 0);
  const creationYear =
    getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') ||
    rntData?.account_creation_year;

  // ── Données calculées ────────────────────────────────
  const bsBrawlers = bsPlayer?.brawlers || [];
  const displayBrawlers = getTop10Brawlers(rntBrawlers, bsBrawlers);
  const favoriteCard = buildFavoriteCardData(rntData, bsPlayer, []);
  const heroBrawlerId = pickHeroBrawlerId(bsPlayer, rntData);
  const brawlerCount = ownedBrawlers || bsBrawlers.length;
  const trophies = bsPlayer?.trophies || getStatLoose(stats, 'Trophies') || 0;
  const prestige = getTotalPrestigeFromRnt(rntData, bsPlayer);

  const currentElo = getStatLoose(stats, 'CurrentRankedPoints', 'current_ranked_points') || rntData?.ranked_elo || 0;
  const highestElo = getStatLoose(stats, 'HighestRankedPoints', 'highest_ranked_points') || rntData?.highest_ranked_elo || 0;
  const recordPts  = getStatLoose(stats, 'RecordPoints', 'record_points') || rntData?.record_points || 0;
  const recordLevel = getStatLoose(stats, 'RecordLevel', 'RecordTier') || Number(rntData?.record_level || rntData?.record_tier || 7);

  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStatLoose(stats, '3vs3Victories', '3v3victories') || 0;
  const soloWins = bsPlayer?.soloVictories || getStatLoose(stats, 'SoloVictories', 'solo_victories') || 0;
  const duoWins  = bsPlayer?.duoVictories  || getStatLoose(stats, 'DuoVictories', 'duo_victories') || 0;
  const expLevel  = bsPlayer?.expLevel  || getStatLoose(stats, 'ExpLevel', 'exp_level') || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;

  const curTier = getRankedTier(currentElo);
  const hiTier  = getRankedTier(highestElo);

  // ── Canvas ───────────────────────────────────────────
  const W = 1400, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── FOND GLOBAL : fond_profil.png visible ────────────
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil.png'));
    const scaleX = W / bg.width;
    const scaleY = H / bg.height;
    const scale = Math.max(scaleX, scaleY);
    const sw = bg.width * scale;
    const sh = bg.height * scale;
    ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } catch {
    ctx.fillStyle = '#3b5a2c';
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay très léger seulement pour la lisibilité
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, 'rgba(12, 14, 9, 0.18)');
  overlay.addColorStop(0.55, 'rgba(18, 15, 10, 0.10)');
  overlay.addColorStop(1, 'rgba(8, 6, 4, 0.22)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // léger assombrissement bas pour aider le texte
  const bottomGlow = ctx.createLinearGradient(0, H * 0.55, 0, H);
  bottomGlow.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGlow.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // ══ ZONE GAUCHE ══════════════════════════════════════
  const LW = 458;

  drawBSPattern(ctx, 0, 0, LW, H, PRAIRIE.leftOverlay, PRAIRIE.pattern);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(LW, 0);
  ctx.lineTo(LW, H);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(210, 180, 110, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LW - 1, 0);
  ctx.lineTo(LW - 1, H);
  ctx.stroke();

  // ── HEADER GAUCHE ────────────────────────────────────
  const iconSize = 84;
  bsBox(ctx, 0, 0, LW, 116, 'rgba(18, 15, 11, 0.86)', '#000000', 0);

  const avatarId = profileAvatar || bsPlayer?.icon?.id;
  if (avatarId) {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${avatarId}.png`);
    if (iconImg) {
      bsBox(ctx, 7, 7, iconSize + 4, iconSize + 4, '#324d25', '#000', 6);
      ctx.drawImage(iconImg, 9, 9, iconSize, iconSize);
    }
  }

  const tagText = '#' + bsTag.replace('#', '').toUpperCase();
  const tagFontSize = fitTextSize(ctx, tagText, iconSize + 8, 16, 10, 'Roboto', 'bold');
  ctx.font = `bold ${tagFontSize}px Roboto`;
  ctx.fillStyle = PRAIRIE.cream;
  ctx.textAlign = 'center';
  ctx.fillText(tagText, 9 + iconSize / 2, 9 + iconSize + 18);

  const playerName = bsPlayer?.name || 'Joueur';
  const nameBoxX = iconSize + 18;
  const nameBoxY = 12;
  const nameBoxW = LW - nameBoxX - 10;
  const nameBoxH = 50;
  bsBox(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, 'rgba(28, 38, 22, 0.92)', '#000', 8);

  const nameFontSize = fitTextSize(ctx, playerName, nameBoxW - 18, 32, 18, 'Lilita');
  ctx.textAlign = 'center';
  drawOutlineText(ctx, playerName, nameBoxX + nameBoxW / 2, nameBoxY + 36, PRAIRIE.greenText, nameFontSize, 'Lilita', 5);

  const xpPerLevel = 1000;
  const xpProgress = Math.max(0, expPoints % xpPerLevel);
  const xpRatio = Math.min(xpProgress / xpPerLevel, 1);

  bsBox(ctx, nameBoxX, 68, 52, 32, '#4b77d6', '#000', 6);
  ctx.font = 'bold 17px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(expLevel), nameBoxX + 26, 90);

  const barX = nameBoxX + 58;
  const barY = 75;
  const barW = nameBoxW - 58;
  const barH = 17;
  rr(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = '#12161a';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (xpRatio > 0) {
    const fillW = Math.max(6, Math.round((barW - 4) * xpRatio));
    rr(ctx, barX + 2, barY + 2, fillW, barH - 4, 3);
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, PRAIRIE.blueXP1);
    g.addColorStop(1, PRAIRIE.blueXP2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.font = 'bold 11px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`${xpProgress}/${xpPerLevel}`, barX + barW - 3, barY + 12);

// ── CARTE FAVORITE BRAWLER ───────────────────────────
const cardX = 22;
const cardY = 138;
const cardW = LW - 44;
const cardH = 438;
const footerH = 82;

// ── FRAME GLOBAL DE LA BATTLE CARD ───────────────────
ctx.save();
ctx.shadowColor = 'rgba(0,0,0,0.45)';
ctx.shadowBlur = 18;
ctx.shadowOffsetY = 8;
rr(ctx, cardX, cardY, cardW, cardH, 18);
ctx.fillStyle = '#0f0f14';
ctx.fill();
ctx.restore();

rr(ctx, cardX, cardY, cardW, cardH, 18);
ctx.strokeStyle = '#000000';
ctx.lineWidth = 5;
ctx.stroke();

rr(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, 15);
ctx.strokeStyle = 'rgba(255,255,255,0.12)';
ctx.lineWidth = 1.2;
ctx.stroke();

// fond intérieur : background officiel si dispo, sinon fallback maison
ctx.save();
rr(ctx, cardX + 5, cardY + 5, cardW - 10, cardH - 10, 14);
ctx.clip();

const bgPath = getBattleCardBgPath(favoriteCard?.battleCardFrameId);
const officialBg = bgPath ? await tryLocalImg(bgPath) : null;

if (officialBg) {
  const bgX = cardX + 5;
  const bgY = cardY + 5;
  const bgW = cardW - 10;
  const bgH = cardH - 10;

  const scale = Math.max(bgW / officialBg.width, bgH / officialBg.height);
  const drawW = officialBg.width * scale;
  const drawH = officialBg.height * scale;
  const drawX = bgX + (bgW - drawW) / 2;
  const drawY = bgY + (bgH - drawH) / 2;

  ctx.drawImage(officialBg, drawX, drawY, drawW, drawH);

  // léger voile pour harmoniser avec ton thème
  ctx.fillStyle = 'rgba(8, 10, 14, 0.18)';
  ctx.fillRect(bgX, bgY, bgW, bgH);
} else {
  const inner = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  inner.addColorStop(0, 'rgba(63, 48, 27, 0.72)');
  inner.addColorStop(0.5, 'rgba(33, 38, 58, 0.50)');
  inner.addColorStop(1, 'rgba(22, 26, 35, 0.68)');
  ctx.fillStyle = inner;
  ctx.fillRect(cardX + 5, cardY + 5, cardW - 10, cardH - 10);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const ds = 28;
  for (let yy = cardY - 10; yy < cardY + cardH; yy += ds) {
    for (let xx = cardX - 10; xx < cardX + cardW; xx += ds) {
      ctx.beginPath();
      ctx.moveTo(xx, yy - ds / 2);
      ctx.lineTo(xx + ds / 2, yy);
      ctx.lineTo(xx, yy + ds / 2);
      ctx.lineTo(xx - ds / 2, yy);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

// bordure blanche inclinée intérieure
ctx.strokeStyle = 'rgba(255,255,255,0.92)';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(cardX + 18, cardY + 22);
ctx.lineTo(cardX + cardW - 22, cardY + 10);
ctx.lineTo(cardX + cardW - 16, cardY + cardH - footerH - 14);
ctx.lineTo(cardX + 20, cardY + cardH - footerH - 6);
ctx.closePath();
ctx.stroke();

ctx.restore();

// barre noire du bas intégrée à la carte
rr(ctx, cardX + 4, cardY + cardH - footerH - 4, cardW - 8, footerH, 0);
ctx.fillStyle = '#050505';
ctx.fill();

// petite ligne de séparation au-dessus de la barre noire
ctx.fillStyle = 'rgba(255,255,255,0.06)';
ctx.fillRect(cardX + 8, cardY + cardH - footerH - 5, cardW - 16, 2);

// visuel principal du brawler préféré : skin équipée d'abord, modèle sinon
const mainBrawlerId = favoriteCard?.brawlerId || heroBrawlerId;
const mainSkinId =
  favoriteCard?.skinEquippedId ||
  favoriteCard?.fallbackFavoriteSkinId ||
  0;

if (mainBrawlerId) {
  let mainVisual = null;
  let usingSkinVisual = false;

  // 1) priorité à la skin équipée
  if (mainSkinId) {
    mainVisual = await tryImg(`https://cdn.bsinfox.com/brawlers/skins/${mainSkinId}.png`);
    if (mainVisual) usingSkinVisual = true;
  }

  // 2) fallback sur le modèle du brawler
  if (!mainVisual) {
    mainVisual = await tryImg(`https://cdn.brawlify.com/brawlers/model/${mainBrawlerId}.png`);
  }

  if (mainVisual) {
    const frameX = cardX + 10;
    const frameY = cardY + 14;
    const frameW = cardW - 20;
    const frameH = cardH - footerH - 24;

    const baseScale = Math.min(frameW / mainVisual.width, frameH / mainVisual.height);
    const scale = usingSkinVisual ? baseScale * 1.12 : baseScale * 1.26;

    const drawW = mainVisual.width * scale;
    const drawH = mainVisual.height * scale;
    const drawX = frameX + (frameW - drawW) / 2;
    const drawY = frameY + frameH - drawH + 12;

    ctx.save();
    rr(ctx, frameX, frameY, frameW, frameH, 10);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.70)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;

    const prevSmoothing = ctx.imageSmoothingEnabled;
    if (usingSkinVisual) {
      ctx.imageSmoothingEnabled = false;
    }

    ctx.drawImage(mainVisual, drawX, drawY, drawW, drawH);

    ctx.imageSmoothingEnabled = prevSmoothing;
    ctx.restore();
  }
}

// ── BADGE FLASHY EN HAUT DE LA CARTE ─────────────────
drawTopBattleBadge(
  ctx,
  cardX + cardW / 2,
  cardY - 2,
  prestige
);

// ── EMOTE EN HAUT DROITE ──────────────────────────────
if (favoriteCard?.battleCardEmoteId) {
  const emoteImg = await tryImg(getBattleCardEmoteCdnUrl(favoriteCard.battleCardEmoteId));

  if (emoteImg) {
    const bubbleX = cardX + cardW - 100;
    const bubbleY = cardY + 18;
    const bubbleW = 78;
    const bubbleH = 74;

    rr(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bubbleX + 16, bubbleY + bubbleH - 4);
    ctx.lineTo(bubbleX + 8, bubbleY + bubbleH + 12);
    ctx.lineTo(bubbleX + 26, bubbleY + bubbleH - 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.stroke();

    const pad = 8;
    ctx.drawImage(
      emoteImg,
      bubbleX + pad,
      bubbleY + pad,
      bubbleW - pad * 2,
      bubbleH - pad * 2
    );
  }
}

// ── FAME EN BAS GAUCHE ────────────────────────────────
if ((favoriteCard?.famePoints || 0) >= 0) {
  const fameImg = await tryImg(getFameCdnUrl(favoriteCard.famePoints));

  if (fameImg) {
    const boxX = cardX + 4;
    const boxY = cardY + cardH - footerH - 68;
    const boxW = 76;
    const boxH = 76;

    const scale = Math.min(boxW / fameImg.width, boxH / fameImg.height);
    const drawW = fameImg.width * scale;
    const drawH = fameImg.height * scale;
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    ctx.drawImage(fameImg, drawX, drawY, drawW, drawH);
  }
}

// ── DEUX AVATARS EN BAS DROITE ───────────────────────
const miniAvatars = [
  favoriteCard?.firstProfileAvatarId,
  favoriteCard?.secondProfileAvatarId,
].filter(Boolean);

for (let i = 0; i < miniAvatars.length; i++) {
  const avatar = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${miniAvatars[i]}.png`);
  if (!avatar) continue;

  const ax = cardX + cardW - 126 + i * 54;
  const ay = cardY + cardH - 62;

  rr(ctx, ax, ay, 46, 46, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  rr(ctx, ax + 2, ay + 2, 42, 42, 10);
  ctx.clip();
  ctx.drawImage(avatar, ax + 2, ay + 2, 42, 42);
  ctx.restore();
}

// ── NOM + TITLE / CLUB ───────────────────────────────
ctx.textAlign = 'left';
drawOutlineText(
  ctx,
  playerName,
  cardX + 12,
  cardY + cardH - 30,
  PRAIRIE.greenText,
  28,
  'Lilita',
  6
);

const titleText = favoriteCard?.allianceName || allianceName || bsPlayer?.club?.name || '';
if (titleText) {
  drawOutlineText(
    ctx,
    titleText,
    cardX + 12,
    cardY + cardH - 6,
    PRAIRIE.goldText,
    16,
    'Roboto',
    4
  );
}

// ── BADGE DU BRAWLER FAVORI À DROITE ─────────────────
if (favoriteCard?.brawlerId) {
  const favTierImg = await tryImg(
    getBsInfoTierUrl(
      favoriteCard.brawlerId,
      favoriteCard?.trophies || favoriteCard?.highestTrophies || 0
    )
  );

  if (favTierImg) {
    const badgeW = 72;
    const badgeH = 72;
    const bx = cardX + cardW - badgeW - 14;
    const by = cardY + Math.floor((cardH - footerH) * 0.58);
    ctx.drawImage(favTierImg, bx, by, badgeW, badgeH);
  }
}

  // ══ ZONE DROITE ══════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;

  drawBSPattern(ctx, RX, 0, RW, H, PRAIRIE.rightOverlay, PRAIRIE.pattern);

  const trY = 56;
  const trH = 90;

  // ── ICÔNE PROFIL (cercle Trophy Road) ────────────────
  const trophyIconId = firstBattleCardAvatar || profileAvatar || bsPlayer?.icon?.id;
  if (trophyIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${trophyIconId}.png`);
    if (pIcon) {
      const pr = 44, px = RX + 56, py = trY + trH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8d4e17';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(pIcon, px - pr, py - pr, pr * 2, pr * 2);
      ctx.restore();
    }
  }

  // ── TROPHY ROAD ──────────────────────────────────────
  const trX = RX + 112;
  const wsW = 170;
  const trW = RW - 112 - wsW - 14;

  statBox(ctx, trX, trY, trW, trH, true);
  ctx.font = 'bold 15px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trX + 12, trY + 22);
  drawOutlineText(ctx, fmt(trophies), trX + 12, trY + 74, '#ffffff', 58, 'Lilita', 5);

  // ── WIN STREAK ───────────────────────────────────────
  const wsX = trX + trW + 8;
  statBox(ctx, wsX, trY, wsW, trH);

  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#ffc83d';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + wsW / 2, trY + 18);
  ctx.fillText('WIN STREAK', wsX + wsW / 2, trY + 34);

  if (winstreakBrawlerId) {
    const wsBI = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${winstreakBrawlerId}.png`);
    if (wsBI) {
      const imgX = wsX + 8;
      const imgY = trY + 40;
      ctx.save();
      rr(ctx, imgX, imgY, 42, 42, 8);
      ctx.clip();
      ctx.drawImage(wsBI, imgX, imgY, 42, 42);
      ctx.restore();

      rr(ctx, imgX, imgY, 42, 42, 8);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      drawMarker(ctx, imgX + 36, imgY + 6, 'flame');
    }
  }

  // chiffre décalé à droite pour ne pas chevaucher l'icône
  drawOutlineText(ctx, String(maxWS), wsX + 110, trY + 74, '#ffffff', 40, 'Lilita', 5);

  // ── ACCOUNT CREATED ───────────────────────────────────
  if (creationYear) {
    const acW = 330, acH = 42, acX = W - acW - 14, acY = 10;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.50)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    bsBox(ctx, acX, acY, acW, acH, '#f3f1eb', '#222222', 8);
    ctx.restore();
    ctx.font = 'bold 18px Roboto';
    ctx.fillStyle = '#2a2a2a';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 28);
  }

  // ── Ligne séparatrice ────────────────────────────────
  let curY = trY + trH + 6;
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── CURRENT / HIGHEST / RECORDS ──────────────────────
  const R2H = 84;
  const colW = Math.floor((RW - 16) / 3);

  const row2 = [
    {
      label: 'CURRENT',
      val: currentElo,
      sub: curTier.name + (curTier.sub ? ' ' + curTier.sub : ''),
      color: curTier.color,
      badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null
    },
    {
      label: 'HIGHEST',
      val: highestElo,
      sub: hiTier.name + (hiTier.sub ? ' ' + hiTier.sub : ''),
      color: hiTier.color,
      badgeUrl: hiTier.file ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png` : null
    },
    {
      label: 'RECORDS',
      val: recordPts,
      sub: '',
      color: '#ffd700',
      badgeUrl: `https://cdn.brawlify.com/records/regular/${recordLevel}.png`
    },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R2H, i === 1);

    if (c.badgeUrl) {
      const b = await tryImg(c.badgeUrl);
      if (b) ctx.drawImage(b, cx + 6, curY + 8, 64, 64);
    }

    const tx = cx + 76;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = PRAIRIE.muted;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 16);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 58, '#ffffff', 38, 'Lilita', 4);
    if (c.sub) {
      ctx.font = 'bold 13px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 76);
    }
  }
  curY += R2H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── 3v3 / SOLO / DUO ─────────────────────────────────
  const R3H = 72;
  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e76345', modeId: null },
    { label: 'SOLO WINS',   val: soloWins, color: PRAIRIE.muted, modeId: '48000006' },
    { label: 'DUO WINS',    val: duoWins,  color: '#63b7ff', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + i * (colW + 4);
    statBox(ctx, cx, curY, colW - 2, R3H, i === 0);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 6, curY + 8, 56, 56);
    } else {
      const bx = cx + 8, by = curY + 10, sq = 17, gap = 2;
      [[0,0,'#e74c3c'], [sq+gap,0,'#e74c3c'], [0,sq+gap,'#e74c3c'],
       [sq+gap,sq+gap,'#3498db'], [(sq+gap)*2,0,'#3498db'], [(sq+gap)*2,sq+gap,'#3498db']]
        .forEach(([dx, dy, col]) => {
          ctx.fillStyle = col;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.fillRect(bx + dx, by + dy, sq, sq);
          ctx.strokeRect(bx + dx, by + dy, sq, sq);
        });
      ctx.font = 'bold 10px Roboto';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('VS', bx + sq + gap / 2 + sq / 2, by + sq + gap / 2 + sq / 2 + 3);
    }

    const tx = cx + 68;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 18);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 58, '#ffffff', 34, 'Lilita', 4);
  }
  curY += R3H + 6;

  // ── Ligne séparatrice ────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(RX, curY, RW - 8, 4);
  curY += 6;

  // ── BRAWLERS + PRESTIGE ──────────────────────────────
  const R4H = 188;
  const presW = 115;
  const brawlW = RW - presW - 12;

  statBox(ctx, RX, curY, brawlW, R4H, true);
  ctx.font = 'bold 14px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + 10, curY + 18);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, RX + brawlW - 10, curY + 18);

  // seulement les 10 premiers
const cols = 5;
const rows = 2;
const slotCount = 10;
const iSz = 64;
const gapX = 18;
const gapY = 8;

const gridW = cols * iSz + (cols - 1) * gapX;
const gridH = rows * iSz + (rows - 1) * gapY;

const startX = RX + Math.floor((brawlW - gridW) / 2) - 18;
const startY = curY + 36;

  for (let i = 0; i < Math.min(displayBrawlers.length, slotCount); i++) {
    const b = displayBrawlers[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = startX + col * (iSz + gapX);
    const by = startY + row * (iSz + gapY);

    const img = await tryImg(getBsInfoTierUrl(b.id, b.trophies));
    if (img) {
      ctx.drawImage(img, bx, by, iSz, iSz);
    } else {
      // fallback si jamais BSInfo rate
      const fallback = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`);
      if (fallback) ctx.drawImage(fallback, bx, by, iSz, iSz);
    }

  }

  if (brawlerCount > 10) {
    const moreX = startX + gridW + 22;
    ctx.font = 'bold 14px Roboto';
    ctx.fillStyle = PRAIRIE.cream;
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - 10} more`, moreX, startY + 34);
  }

// ── PRESTIGE ─────────────────────────────────────────
const presX = RX + brawlW + 6;
statBox(ctx, presX, curY, presW, R4H);

let pImg = null;
const presTierFile = Math.min(6, Math.max(0, Math.floor(prestige / 20)));
pImg = await tryImg(`https://cdn.brawlify.com/prestiges/regular/${presTierFile}.png`);

const badgeSize = Math.min(90, presW - 18);
const badgeX = presX + (presW - badgeSize) / 2;
const badgeY = curY + 16;

if (pImg) {
  ctx.drawImage(pImg, badgeX, badgeY, badgeSize, badgeSize);
}

ctx.textAlign = 'center';
drawOutlineText(
  ctx,
  String(prestige),
  presX + presW / 2,
  badgeY + badgeSize * 0.60,
  '#ffffff',
  30,
  'Lilita',
  5
);

ctx.font = 'bold 11px Roboto';
ctx.fillStyle = PRAIRIE.muted;
ctx.fillText('TOTAL', presX + presW / 2, curY + R4H - 24);

ctx.font = 'bold 14px Roboto';
ctx.fillStyle = PRAIRIE.goldText;
ctx.fillText('PRESTIGE', presX + presW / 2, curY + R4H - 8);

  // ── DATE ──────────────────────────────────────────────
  ctx.font = 'bold 12px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 7, H - 4);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard, fetchRntProfile, getStat, getRankedTier };