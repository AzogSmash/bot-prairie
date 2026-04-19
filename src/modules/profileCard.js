const { createCanvas, loadImage, registerFont } = require('canvas');

const path = require('path');
const https = require('https');
const http = require('http');

const imageCache = new Map();

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
  { min: 0, name: 'Bronze', file: 'Bronze', color: '#cd7f32' },
  { min: 750, name: 'Silver', file: 'Silver', color: '#c0c0c0' },
  { min: 1500, name: 'Gold', file: 'Gold', color: '#ffd700' },
  { min: 3000, name: 'Diamond', file: 'Diamond', color: '#00bfff' },
  { min: 4500, name: 'Mythic', file: 'Mythic', color: '#e84393' },
  { min: 6000, name: 'Legendary', file: 'Legendary', color: '#e74c3c' },
  { min: 8250, name: 'Masters', file: 'Masters', color: '#ff6b35' },
  { min: 11250, name: 'Pro', file: 'Pro', color: '#f1c40f' },
];

const RANKED_SUBTIERS = [
  { min: 0, sub: 'I' }, { min: 250, sub: 'II' }, { min: 500, sub: 'III' },
  { min: 750, sub: 'I' }, { min: 1000, sub: 'II' }, { min: 1250, sub: 'III' },
  { min: 1500, sub: 'I' }, { min: 2000, sub: 'II' }, { min: 2500, sub: 'III' },
  { min: 3000, sub: 'I' }, { min: 3500, sub: 'II' }, { min: 4000, sub: 'III' },
  { min: 4500, sub: 'I' }, { min: 5000, sub: 'II' }, { min: 5500, sub: 'III' },
  { min: 6000, sub: 'I' }, { min: 6750, sub: 'II' }, { min: 7500, sub: 'III' },
  { min: 8250, sub: 'I' }, { min: 9250, sub: 'II' }, { min: 10250, sub: 'III' },
  { min: 11250, sub: '' },
];

function getRankedTier(elo) {
  if (!elo || elo <= 0) return { name: 'Unranked', file: null, color: '#95a5a6', sub: '' };

  let tier = RANKED_TIERS[0];
  for (const t of RANKED_TIERS) {
    if (elo >= t.min) tier = t;
  }

  let sub = '';
  for (const s of RANKED_SUBTIERS) {
    if (elo >= s.min) sub = s.sub;
  }

  return { ...tier, sub };
}

// ═══════════════════════════════════════════════════════
// HELPERS DATA
// ═══════════════════════════════════════════════════════
function normalizeStr(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getStat(stats, name) {
  return stats?.find(s => s.name === name)?.value || 0;
}

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
  if (p >= 89100) return 16;

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
  if (p >= 9200) return 5;
  if (p >= 6000) return 4;

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
      const ah = Number(a.highest_trophies || 0);
      const bh = Number(b.highest_trophies || 0);
      if (bh !== ah) return bh - ah;

      const at = Number(a.trophies || 0);
      const bt = Number(b.trophies || 0);
      if (bt !== at) return bt - at;

      return Number(b.power_level || 0) - Number(a.power_level || 0);
    })[0];

    if (best?.brawler_id) return Number(best.brawler_id);
  }

  const bsBrawlers = bsPlayer?.brawlers || [];
  const best = [...bsBrawlers].sort((a, b) => {
    const ah = Number(a.highestTrophies || 0);
    const bh = Number(b.highestTrophies || 0);
    if (bh !== ah) return bh - ah;

    const at = Number(a.trophies || 0);
    const bt = Number(b.trophies || 0);
    if (bt !== at) return bt - at;

    return Number(b.power || 0) - Number(a.power || 0);
  })[0];

  return best?.id || 0;
}

function getTotalPrestigeFromRnt(rntData, bsPlayer) {
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

  const prestigeLevel = Math.floor(t / 1000);
  return String(39000003 + prestigeLevel);
}

function getBsInfoTierUrl(brawlerId, trophies) {
  const folder = getBsInfoTierFolderFromTrophies(trophies);
  return `https://cdn.bsinfox.com/tier/${folder}/${brawlerId}.png`;
}

function getTop27Brawlers(rntBrawlers = [], bsBrawlers = []) {
  if (rntBrawlers.length) {
    return [...rntBrawlers]
      .map(b => ({ id: Number(b.brawler_id), trophies: Number(b.trophies || 0), highestTrophies: Number(b.highest_trophies || 0) }))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, 27);
  }
  return [...bsBrawlers]
    .map(b => ({ id: Number(b.id), trophies: Number(b.trophies || 0), highestTrophies: Number(b.highestTrophies || 0) }))
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 27);
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
      if (!u || typeof u !== 'string') {
        return reject(new Error(`Invalid image url: ${u}`));
      }

      const lib = u.startsWith('https') ? https : http;

      let req;
      try {
        req = lib.get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location;

            if (!location) {
              res.resume();
              return reject(new Error(`Redirect without location for ${u}`));
            }

            let nextUrl;
            try {
              nextUrl = new URL(location, u).toString();
            } catch (err) {
              res.resume();
              return reject(new Error(`Invalid redirect URL: ${location} from ${u}`));
            }

            res.resume();
            return go(nextUrl);
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
      } catch (err) {
        return reject(err);
      }

      req.setTimeout(4000, () => {
        req.destroy(new Error(`Timeout image: ${u}`));
      });

      req.on('error', reject);
    };

    go(url);
  });
}

async function tryImg(url) {
  if (!url || typeof url !== 'string') return null;
  if (!/^https?:\/\//i.test(url)) {
    console.error('[IMG FAIL] Non-absolute URL:', url);
    return null;
  }

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

    battleCardFrameId: Number(rntData?.battle_card?.frame?.id ?? rntData?.battle_card?.frame ?? 0),
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
    ctx.font = `${weight ? `${weight} ` : ''}${size}px ${family}`;
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

function drawPolygonPath(ctx, points) {
  if (!points?.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function scaleNormPoints(points, x, y, w, h) {
  return points.map(p => ({
    x: x + p.x * w,
    y: y + p.y * h,
  }));
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function bsBox(ctx, x, y, w, h, bgColor, borderColor = '#000', r = 10) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();

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

    const r1 = 7;
    const r2 = 3.5;
    const cx = x;
    const cy = y;

    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * Math.PI / 5) - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
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

  ctx.shadowColor = 'rgba(88, 180, 255, 0.35)';
  ctx.shadowBlur = 12;

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

// ═══════════════════════════════════════════════════════
// BATTLE CARD FRAMES
// ═══════════════════════════════════════════════════════
let battleCardFrames = [];

try {
  battleCardFrames = require('../assets/battlecard-bgs/frames.json');
} catch (err) {
  console.error('[BATTLECARD FRAMES FAIL]', err.message);
}

const battleCardFrameById = new Map(
  (battleCardFrames || []).map(frame => [Number(frame.id), frame])
);

function getBattleCardFrameMeta(frameId) {
  const n = Number(frameId || 0);
  if (!n) return null;

  return (
    battleCardFrameById.get(n) ||
    battleCardFrameById.get(85000000 + n) ||
    battleCardFrameById.get(n - 85000000) ||
    null
  );
}

function getBattleCardBgPath(frameId) {
  const frameMeta = getBattleCardFrameMeta(frameId);
  if (!frameMeta?.bg) return null;
  return path.join(__dirname, '../assets/battlecard-bgs', `${frameMeta.bg}.png`);
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

  const stats = rntData?.stats || [];
  const rntBrawlers = rntData?.brawlers || [];
  const favoriteBrawlerId = Number(rntData?.favorite_brawler?.id || rntData?.favorite_brawler || 0);
  const winstreakBrawlerId = Number(rntData?.winstreak_brawler?.id || rntData?.winstreak_brawler || 0);
  const maxWS = Number(rntData?.max_winstreak || 0);
  const ownedBrawlers = Number(rntData?.brawler_count || 0);
  const allianceName = rntData?.alliance?.name || '';
  const firstBattleCardAvatar = Number(rntData?.battle_card?.first_profile_avatar || 0);
  const profileAvatar = Number(rntData?.profile_avatar || 0);

  const creationYear =
    getStatLoose(stats, 'AccountCreationYear', 'account_creation_year', 'createdYear') ||
    rntData?.account_creation_year;

  const bsBrawlers = bsPlayer?.brawlers || [];
  const displayBrawlers = getTop27Brawlers(rntBrawlers, bsBrawlers);
  const favoriteCard = buildFavoriteCardData(rntData, bsPlayer, []);
  const heroBrawlerId = pickHeroBrawlerId(bsPlayer, rntData);
  const brawlerCount = ownedBrawlers || bsBrawlers.length;
  const trophies = bsPlayer?.trophies || getStatLoose(stats, 'Trophies') || 0;
  const prestige = getTotalPrestigeFromRnt(rntData, bsPlayer);

  const currentElo = getStatLoose(stats, 'CurrentRankedPoints', 'current_ranked_points') || rntData?.ranked_elo || 0;
  const highestElo = getStatLoose(stats, 'HighestRankedPoints', 'highest_ranked_points') || rntData?.highest_ranked_elo || 0;
  const recordPts = getStatLoose(stats, 'RecordPoints', 'record_points') || rntData?.record_points || 0;
  const recordLevel = getStatLoose(stats, 'RecordLevel', 'RecordTier') || Number(rntData?.record_level || rntData?.record_tier || 7);

  const wins3v3 = bsPlayer?.['3vs3Victories'] || getStatLoose(stats, '3vs3Victories', '3v3victories') || 0;
  const soloWins = bsPlayer?.soloVictories || getStatLoose(stats, 'SoloVictories', 'solo_victories') || 0;
  const duoWins = bsPlayer?.duoVictories || getStatLoose(stats, 'DuoVictories', 'duo_victories') || 0;
  const expLevel = bsPlayer?.expLevel || getStatLoose(stats, 'ExpLevel', 'exp_level') || 1;
  const expPoints = bsPlayer?.expPoints || getStatLoose(stats, 'ExpPoints', 'exp_points') || 0;

  const curTier = getRankedTier(currentElo);
  const hiTier = getRankedTier(highestElo);

  const W = 1400;
  const H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ════════════════════════════════════════════════════
  // FOND GLOBAL
  // ════════════════════════════════════════════════════
  try {
    const bg = await loadImage(path.join(__dirname, '../assets/fond_profil2.png'));
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

  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, 'rgba(12, 14, 9, 0.18)');
  overlay.addColorStop(0.55, 'rgba(18, 15, 10, 0.10)');
  overlay.addColorStop(1, 'rgba(8, 6, 4, 0.22)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  const bottomGlow = ctx.createLinearGradient(0, H * 0.55, 0, H);
  bottomGlow.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGlow.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // ════════════════════════════════════════════════════
  // ZONE GAUCHE
  // ════════════════════════════════════════════════════
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

  // HEADER
  const iconSize = 84;
  bsBox(ctx, 0, 0, LW, 116, 'rgba(18, 15, 11, 0.86)', '#000000', 0);

  const avatarId = profileAvatar || bsPlayer?.icon?.id;
  if (avatarId && avatarId !== 'Unknown') {
    const iconImg = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${avatarId}.png`);
    if (iconImg) {
      bsBox(ctx, 7, 7, iconSize + 4, iconSize + 4, '#324d25', '#000', 6);
      ctx.drawImage(iconImg, 9, 9, iconSize, iconSize);
    }
  }

  const tagText = `#${bsTag.replace('#', '').toUpperCase()}`;
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

  // ════════════════════════════════════════════════════
  // BATTLE CARD GAUCHE
  // ════════════════════════════════════════════════════
  const cardX = 22;
  const cardY = 138;
  const cardW = LW - 44;  // ~414px
  const cardH = 438;

  // Zone transparente du cadre (500x500 -> cardW x cardH)
  // Points mesurés: TL(37,49) TR(488,31) BL(12,393) BR(462,379)
  const scaleW = cardW / 500;
  const scaleH = cardH / 500;
  const bgX = cardX + Math.round(37 * scaleW);
  const bgY = cardY + Math.round(31 * scaleH);   // top le plus haut (droite)
  const bgW = Math.round((488 - 37) * scaleW);   // 451px * scale
  const bgH = Math.round((393 - 31) * scaleH);   // zone jusqu'au bas de la fenêtre
  // Footer du cadre: à partir de y=379 (scaled)
  const footerY = cardY + Math.round(379 * scaleH);
  const footerH = cardH - Math.round(379 * scaleH);

  // Charge le cadre et les assets
  const cadreImg = await tryLocalImg(path.join(__dirname, '../assets/cadre.png'));
  const frameMeta = getBattleCardFrameMeta(favoriteCard?.battleCardFrameId);
  const bgPath = getBattleCardBgPath(favoriteCard?.battleCardFrameId);
  const officialBg = bgPath ? await tryLocalImg(bgPath) : null;

  // ── 1. BG (droit, clipé dans la zone transparente du cadre) ──
  ctx.save();
  // Clip polygone incliné correspondant à la zone transparente
  ctx.beginPath();
  ctx.moveTo(cardX + 37 * scaleW, cardY + 49 * scaleH);  // TL
  ctx.lineTo(cardX + 488 * scaleW, cardY + 31 * scaleH); // TR
  ctx.lineTo(cardX + 462 * scaleW, cardY + 379 * scaleH); // BR
  ctx.lineTo(cardX + 12 * scaleW, cardY + 393 * scaleH);  // BL
  ctx.closePath();
  ctx.clip();

  // Zone réelle du polygone : on prend les extrêmes pour couvrir tout l'espace
  const polyMinX = cardX + Math.round(12 * scaleW);
  const polyMinY = cardY + Math.round(31 * scaleH);
  const polyMaxX = cardX + Math.round(488 * scaleW);
  const polyMaxY = cardY + Math.round(393 * scaleH);
  const polyW = polyMaxX - polyMinX;
  const polyH = polyMaxY - polyMinY;

  if (officialBg) {
    // Scale pour couvrir tout le polygone (zoom, pas de déformation)
    const sc = Math.max(polyW / officialBg.width, polyH / officialBg.height) * 1.1;
    const dW = officialBg.width * sc;
    const dH = officialBg.height * sc;
    const dX = polyMinX + (polyW - dW) / 2;
    const dY = polyMinY + (polyH - dH) / 2;
    ctx.drawImage(officialBg, dX, dY, dW, dH);
  } else {
    const inner = ctx.createLinearGradient(polyMinX, polyMinY, polyMaxX, polyMaxY);
    inner.addColorStop(0, 'rgba(63, 48, 27, 0.95)');
    inner.addColorStop(0.5, 'rgba(33, 38, 58, 0.95)');
    inner.addColorStop(1, 'rgba(22, 26, 35, 0.95)');
    ctx.fillStyle = inner;
    ctx.fillRect(polyMinX, polyMinY, polyW, polyH);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const ds = 28;
    for (let yy = polyMinY - 10; yy < polyMaxY + 20; yy += ds) {
      for (let xx = polyMinX - 10; xx < polyMaxX + 20; xx += ds) {
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
  ctx.restore();

  // ── 2. BRAWLER (centré, grand, sera recouvert par le cadre en bas) ──
  const mainBrawlerId = favoriteCard?.brawlerId || heroBrawlerId;
  const mainSkinId = favoriteCard?.skinEquippedId || favoriteCard?.fallbackFavoriteSkinId || 0;

  if (mainBrawlerId) {
    let mainVisual = null;
    let usingSkinVisual = false;

    if (mainSkinId) {
      mainVisual = await tryImg(`https://cdn.bsinfox.com/brawlers/skins/${mainSkinId}.png`);
      if (mainVisual) usingSkinVisual = true;
    }
    if (!mainVisual) {
      mainVisual = await tryImg(`https://cdn.brawlify.com/brawlers/model/${mainBrawlerId}.png`);
    }

    if (mainVisual) {
      const targetH = bgH * 1.35 * 0.9;
      const sc = targetH / mainVisual.height;
      const dW = mainVisual.width * sc;
      const dH = mainVisual.height * sc;
      const dX = bgX + (bgW - dW) / 2 - 20;
      const dY = bgY + bgH - dH + dH * 0.08 + 76;

      // Clip pour couper le brawler au niveau du bandeau footer (footerY)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cardX + 37 * scaleW, cardY + 49 * scaleH);
      ctx.lineTo(cardX + 488 * scaleW, cardY + 31 * scaleH);
      ctx.lineTo(cardX + 462 * scaleW, cardY + 379 * scaleH);
      ctx.lineTo(cardX + 12 * scaleW, cardY + 393 * scaleH);
      ctx.closePath();
      ctx.clip();

      const prevSmoothing = ctx.imageSmoothingEnabled;
      if (usingSkinVisual) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mainVisual, dX, dY, dW, dH);
      ctx.imageSmoothingEnabled = prevSmoothing;
      ctx.restore();
    }
  }

  // ── 3. CADRE PNG (par-dessus bg et brawler) ──────────────────
  if (cadreImg) {
    ctx.drawImage(cadreImg, cardX, cardY, cardW, cardH);
  }

  // ── 4. ÉLÉMENTS FLOTTANTS (après le cadre) ───────────────────

  // Badge prestige total — à cheval sur le bord supérieur du cadre
  const topPrestigePath = path.join(__dirname, '../assets/total_prestiges.png');
  const topPrestigeImg = await tryLocalImg(topPrestigePath);

  if (topPrestigeImg) {
    const badgeW = 114*2;
    const badgeH = Math.round(badgeW * (topPrestigeImg.height / topPrestigeImg.width));
    const badgeX = cardX+3 + cardW / 2 - badgeW / 2;
    const badgeY = cardY - badgeH * 0.18;

    ctx.drawImage(topPrestigeImg, badgeX, badgeY, badgeW, badgeH);
    ctx.textAlign = 'center';
    drawOutlineText(
      ctx,
      String(prestige),
      badgeX + badgeW / 2.05,
      badgeY + Math.round(badgeH * 0.60),
      '#ffffff',
      36,
      'Lilita',
      5
    );
  } else {
    drawTopBattleBadge(ctx, cardX + cardW / 2, cardY - 2, prestige);
  }

  // Emote — haut droite dans le cadre
  if (favoriteCard?.battleCardEmoteId) {
    const emoteImg = await tryImg(getBattleCardEmoteCdnUrl(favoriteCard.battleCardEmoteId));
    if (emoteImg) {
      const bubbleW = 78;
      const bubbleH = 74;
      const bubbleX = cardX + cardW - bubbleW - 30;
      const bubbleY = cardY + 40;

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
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();

      const pad = 8;
      ctx.drawImage(emoteImg, bubbleX + pad, bubbleY + pad, bubbleW - pad * 2, bubbleH - pad * 2);
    }
  }

  // Fame icon — bas gauche dans le cadre
  if ((favoriteCard?.famePoints || 0) >= 0) {
    const fameImg = await tryImg(getFameCdnUrl(favoriteCard.famePoints));
    if (fameImg) {
      const boxW = Math.round(86 * 1.2 * 0.9);
      const boxH = Math.round(86 * 1.2 * 0.9);
      const boxX = cardX + 0;
      const boxY = footerY - boxH + 15;

      const sc = Math.min(boxW / fameImg.width, boxH / fameImg.height);
      const dW = fameImg.width * sc;
      const dH = fameImg.height * sc;
      ctx.drawImage(fameImg, boxX + (boxW - dW) / 2, boxY + (boxH - dH) / 2, dW, dH);
    }
  }

  // Badge mastery brawler favori — bas droite dans le cadre
  if (favoriteCard?.brawlerId) {
    const favTierImg = await tryImg(
      getBsInfoTierUrl(
        favoriteCard.brawlerId,
        favoriteCard?.trophies || favoriteCard?.highestTrophies || 0
      )
    );
    if (favTierImg) {
      const badgeW = Math.round(80 * 0.9);
      const badgeH = Math.round(80 * 1,1);
      const bx = cardX + cardW - badgeW - 32;
      const by = footerY - badgeH - 4;
      ctx.drawImage(favTierImg, bx, by, badgeW, badgeH);
    }
  }

  // Avatars footer — bas droite du bandeau noir
  const miniAvatars = [
    favoriteCard?.firstProfileAvatarId,
    favoriteCard?.secondProfileAvatarId,
  ].filter(Boolean);

  for (let i = 0; i < miniAvatars.length; i++) {
    const avatar = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${miniAvatars[i]}.png`);
    if (!avatar) continue;

    const avSize = Math.round((footerH - 20) * 0.7);
    const avSpacing = avSize + 10;
    const ax = cardX + cardW - 40 - avSize - (miniAvatars.length - 1 - i) * avSpacing;
    const ay = footerY + 13;

    rr(ctx, ax, ay, avSize, avSize, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    rr(ctx, ax + 2, ay + 2, avSize - 4, avSize - 4, 8);
    ctx.clip();
    ctx.drawImage(avatar, ax + 2, ay + 2, avSize - 4, avSize - 4);
    ctx.restore();
  }

  // Nom et club — bandeau noir footer
  const footerTextY = footerY + footerH * 0.48;
  ctx.textAlign = 'left';
  const nameColor = PRAIRIE.greenText;
  drawOutlineText(ctx, playerName, cardX + 12, footerTextY, nameColor, 26, 'Lilita', 5);

  const titleText = favoriteCard?.allianceName || allianceName || bsPlayer?.club?.name || '';
  if (titleText) {
    drawOutlineText(ctx, titleText, cardX + 12, footerY + footerH * 0.82 - 5, PRAIRIE.goldText, 15, 'Roboto', 3);
  }

// ════════════════════════════════════════════════════
  // ZONE DROITE
  // ════════════════════════════════════════════════════
  const RX = LW + 4;
  const RW = W - RX;
  const PAD = 14;

  drawBSPattern(ctx, RX, 0, RW, H, PRAIRIE.rightOverlay, PRAIRIE.pattern);

  // Helper : fond de section semi-transparent avec bordure subtile
  function sectionBg(x, y, w, h) {
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    rr(ctx, x, y, w, h, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  let curY = 10;

  // ── TROPHY ROAD ──────────────────────────────────────
  const trH = 110;
  sectionBg(RX + PAD, curY, RW - PAD * 2, trH);

  const trophyIconId = firstBattleCardAvatar || profileAvatar || bsPlayer?.icon?.id;
  if (trophyIconId) {
    const pIcon = await tryImg(`https://cdn.brawlify.com/profile-icons/regular/${trophyIconId}.png`);
    if (pIcon) {
      const pr = 46;
      const px = RX + PAD + 18 + pr;
      const py = curY + trH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(pIcon, px - pr, py - pr, pr * 2, pr * 2);
      ctx.restore();
    }
  }

  const trTextX = RX + PAD + 120;
  ctx.font = 'bold 12px Roboto';
  ctx.fillStyle = PRAIRIE.muted;
  ctx.textAlign = 'left';
  ctx.fillText('TROPHY ROAD', trTextX, curY + 24);

  ctx.font = 'bold 22px Roboto';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('🏆', trTextX - 2, curY + 66);
  drawOutlineText(ctx, fmt(trophies), trTextX + 34, curY + 68, '#ffffff', 48, 'Lilita One', 5);

  if (bsPlayer?.highestTrophies) {
    ctx.font = 'bold 11px Roboto';
    ctx.fillStyle = PRAIRIE.muted;
    ctx.fillText(`Highest: ${fmt(bsPlayer.highestTrophies)}`, trTextX, curY + 88);
  }

  if (creationYear) {
    const acW = 220;
    const acH = 32;
    const acX = W - acW - PAD;
    const acY = curY + 8;
    bsBox(ctx, acX, acY, acW, acH, '#f0eee8', '#cccccc', 8);
    ctx.font = 'bold 13px Roboto';
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.fillText(`ACCOUNT CREATED: ${creationYear}`, acX + acW / 2, acY + 22);
    ctx.fillStyle = '#3a8fff';
    ctx.beginPath();
    ctx.arc(acX + acW - 14, acY + acH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 10px Roboto';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('i', acX + acW - 14, acY + acH / 2 + 4);
  }

  const wsX = W - 140;
  const wsY = curY + (creationYear ? 50 : 12);
  ctx.font = 'bold 11px Roboto';
  ctx.fillStyle = '#ffc83d';
  ctx.textAlign = 'center';
  ctx.fillText('MAX', wsX + 50, wsY);
  ctx.fillText('WIN STREAK', wsX + 50, wsY + 14);

  if (winstreakBrawlerId) {
    const wsBI = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${winstreakBrawlerId}.png`);
    if (wsBI) {
      ctx.save();
      rr(ctx, wsX, wsY + 18, 44, 44, 8);
      ctx.clip();
      ctx.drawImage(wsBI, wsX, wsY + 18, 44, 44);
      ctx.restore();
    }
  } else {
    ctx.font = '28px Roboto';
    ctx.fillStyle = '#ffc83d';
    ctx.textAlign = 'left';
    ctx.fillText('🔥', wsX + 8, wsY + 50);
  }
  drawOutlineText(ctx, String(maxWS), wsX + 100, wsY + 54, '#ffffff', 36, 'Lilita One', 4);

  curY += trH + 8;

  // ── RANKED + RECORDS ─────────────────────────────────
  const colW = Math.floor((RW - PAD * 2 - 8) / 3);
  const R2H = 78;

  const row2 = [
    { label: 'CURRENT', val: currentElo, sub: curTier.name + (curTier.sub ? ` ${curTier.sub}` : ''), color: curTier.color, badgeUrl: curTier.file ? `https://cdn.brawlify.com/ranked/regular/${curTier.file}.png` : null },
    { label: 'HIGHEST', val: highestElo, sub: hiTier.name + (hiTier.sub ? ` ${hiTier.sub}` : ''), color: hiTier.color, badgeUrl: hiTier.file ? `https://cdn.brawlify.com/ranked/regular/${hiTier.file}.png` : null },
    { label: 'RECORDS', val: recordPts, sub: '', color: '#ffd700', badgeUrl: `https://cdn.brawlify.com/records/regular/${recordLevel}.png` },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row2[i];
    const cx = RX + PAD + i * (colW + 4);
    sectionBg(cx, curY, colW, R2H);

    if (c.badgeUrl) {
      const b = await tryImg(c.badgeUrl);
      if (b) ctx.drawImage(b, cx + 8, curY + 10, 54, 54);
    } else {
      ctx.font = '36px Roboto';
      ctx.fillText(i === 0 ? '🏅' : i === 1 ? '🥇' : '📀', cx + 10, curY + 52);
    }

    const tx = cx + 70;
    ctx.font = 'bold 10px Roboto';
    ctx.fillStyle = PRAIRIE.muted;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 18);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 54, '#ffffff', 30, 'Lilita One', 3);

    if (c.sub) {
      ctx.font = 'bold 11px Roboto';
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, tx, curY + 70);
    }
  }

  curY += R2H + 6;

  // ── WINS ─────────────────────────────────────────────
  const R3H = 66;
  const row3 = [
    { label: '3 VS 3 WINS', val: wins3v3, color: '#e76345', modeId: null },
    { label: 'SOLO WINS', val: soloWins, color: PRAIRIE.muted, modeId: '48000006' },
    { label: 'DUO WINS', val: duoWins, color: '#63b7ff', modeId: '48000009' },
  ];

  for (let i = 0; i < 3; i++) {
    const c = row3[i];
    const cx = RX + PAD + i * (colW + 4);
    sectionBg(cx, curY, colW, R3H);

    if (c.modeId) {
      const mImg = await tryImg(`https://cdn.brawlify.com/game-modes/regular/${c.modeId}.png`);
      if (mImg) ctx.drawImage(mImg, cx + 8, curY + 6, 50, 50);
      else { ctx.font = '32px Roboto'; ctx.fillText(i === 1 ? '☠️' : '👥', cx + 10, curY + 46); }
    } else {
      const bx = cx + 8, by = curY + 8, sq = 14, gap = 2;
      [[0,0,'#e74c3c'],[sq+gap,0,'#e74c3c'],[0,sq+gap,'#e74c3c'],[sq+gap,sq+gap,'#3498db'],[(sq+gap)*2,0,'#3498db'],[(sq+gap)*2,sq+gap,'#3498db']].forEach(([dx,dy,col]) => {
        ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.fillRect(bx+dx, by+dy, sq, sq); ctx.strokeRect(bx+dx, by+dy, sq, sq);
      });
      ctx.font = 'bold 8px Roboto'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('VS', bx+sq+gap/2+sq/2, by+sq+gap/2+sq/2+3);
    }

    const tx = cx + 66;
    ctx.font = 'bold 10px Roboto';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'left';
    ctx.fillText(c.label, tx, curY + 16);
    drawOutlineText(ctx, fmt(c.val), tx, curY + 52, '#ffffff', 28, 'Lilita One', 3);
  }

  curY += R3H + 8;

  // ── BRAWLERS + TOTAL PRESTIGE ─────────────────────────
  const R4H = H - curY - 14;

  // Fond bleu pour la section brawlers
  const bgGrad = ctx.createLinearGradient(RX + PAD, curY, RX + PAD, curY + R4H);
  bgGrad.addColorStop(0, 'rgba(20, 40, 120, 0.55)');
  bgGrad.addColorStop(1, 'rgba(10, 20, 80, 0.45)');
  rr(ctx, RX + PAD, curY, RW - PAD * 2, R4H, 10);
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,120,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 13px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('BRAWLERS', RX + PAD + 10, curY + 20);

  // Collected count
  const collW = 160;
  const collX = RX + RW - PAD - collW - 130;
  sectionBg(collX, curY + 6, collW, 22);
  ctx.font = 'bold 11px Roboto';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(`${brawlerCount} / ${brawlerCount} Collected`, collX + collW / 2, curY + 21);

  // Total prestige — barres.png + prestige.png à droite
  const barsImg = await tryLocalImg(path.join(__dirname, '../assets/barres.png'));
  const prestigePanelImg = await tryLocalImg(path.join(__dirname, '../assets/prestige.png'));
  const presColW = 120;
  const presColX = RX + RW - PAD - presColW;
  const presColY = curY + 10;

  if (prestigePanelImg) {
    const panelW = presColW - 10;
    const panelH = Math.round(panelW * (prestigePanelImg.height / prestigePanelImg.width));
    const panelX = presColX + 5;
    const panelY = presColY + Math.floor((R4H - panelH) / 2);

    // Barres horizontales derrière le badge prestige
    if (barsImg) {
      const barsH = 20;
      const barsY = panelY + panelH - barsH + 4;
      ctx.drawImage(barsImg, panelX - 5, barsY, panelW + 10, barsH);
    }

    ctx.drawImage(prestigePanelImg, panelX, panelY, panelW, panelH);
    ctx.textAlign = 'center';
    drawOutlineText(ctx, String(prestige), panelX + panelW / 2.2, panelY + panelH * 0.52, '#ffffff', 30, 'Lilita One', 4);
  }

  // Grille brawlers — 9 colonnes x 3 lignes
  const bCols = 9;
  const slotCount = 27;
  const gridAvailW = RW - PAD * 2 - presColW - 20;
  const iSz = Math.floor((gridAvailW - 10) / bCols) - 3;
  const gapX = Math.floor((gridAvailW - 10 - bCols * iSz) / (bCols - 1));
  const gapY = 6;
  const startX = RX + PAD + 10;
  const startY = curY + 30;

  for (let i = 0; i < Math.min(displayBrawlers.length, slotCount); i++) {
    const b = displayBrawlers[i];
    const col = i % bCols;
    const row = Math.floor(i / bCols);
    const bx = startX + col * (iSz + gapX);
    const by = startY + row * (iSz + gapY);

    const img = await tryImg(getBsInfoTierUrl(b.id, b.trophies));
    if (img) {
      ctx.drawImage(img, bx, by, iSz, iSz);
    } else {
      const fallback = await tryImg(`https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`);
      if (fallback) ctx.drawImage(fallback, bx, by, iSz, iSz);
    }
  }

  if (brawlerCount > slotCount) {
    const lastRow = Math.floor((slotCount - 1) / bCols);
    const moreY = startY + (lastRow + 1) * (iSz + gapY) + 14;
    ctx.font = 'bold 12px Roboto';
    ctx.fillStyle = PRAIRIE.cream;
    ctx.textAlign = 'left';
    ctx.fillText(`+${brawlerCount - slotCount} more`, startX, moreY);
  }

  // Date
  ctx.font = 'bold 11px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W - 7, H - 4);

  return canvas.toBuffer('image/png');
}

module.exports = {
  generateProfileCard,
  fetchRntProfile,
  getStat,
  getRankedTier
};