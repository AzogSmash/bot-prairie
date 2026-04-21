const path = require("node:path");
const fs = require("node:fs");
const {
  createCanvas,
  loadImage,
} = require("@napi-rs/canvas");

const { getCachedOrFetch } = require("../services/imageCache");
const { getRankedTierId, getRankTierFromRankedScore } = require("../services/rankedTiers");
const frameData = require("../services/frames.json");

const ASSETS            = path.resolve(__dirname, "..", "assets");
const RANKED_DIR        = path.join(ASSETS, "ranked");
const RANKED_TIERED_DIR = path.join(ASSETS, "ranked", "tiered");
const RECORDS_DIR       = path.join(ASSETS, "records");
const BRAWLERS_DIR      = path.join(ASSETS, "brawlers");
const PROFILE_ICONS_DIR = path.join(ASSETS, "profile-icons");
const BG_DIR            = path.join(ASSETS, "backgrounds");
const ICONS_DIR         = path.join(ASSETS, "icons");
const TIERS_DIR         = path.join(ASSETS, "tiers");
const WORLDS_DIR        = path.join(ASSETS, "worlds");
const FRAMES_DIR        = path.join(ASSETS, "frames");
const FRAMES_BG_DIR     = path.join(FRAMES_DIR, "bgs");
const FRAMES_ICONS_DIR  = path.join(FRAMES_DIR, "icons");
const FAME_DIR          = path.join(ASSETS, "fames");

const SCALE = 2;
const W     = 1450;
const H     = 880;

const FONT = (size, weight = 700) =>
  `${weight} ${size * SCALE}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;

const SKEW_RAD = (-4.5 * Math.PI) / 180;
const SKEW_X   = Math.tan(SKEW_RAD);



const STAT_ID = {
  THREE_V_THREE:      1,
  EXP_POINTS:         2,
  TROPHIES:           3,
  HIGHEST_TROPHIES:   4,
  OWNED_BRAWLERS:     5,
  SOLO_VICTORIES:     8,
  DUO_VICTORIES:      11,
  CURRENT_RANKED_PTS: 24,
  HIGHEST_RANKED_PTS: 25,
  ACCOUNT_CREATION:   27,
  PRESTIGE:           30,
  RECORD_POINTS:      31,
  RECORD_LEVEL:       32,
  FAME_POINTS:        20,
};

function getStat(player, statNameOrId, fallback = 0) {
  const statsArray = player?.stats || player?.result?.stats || null;
  if (Array.isArray(statsArray)) {
    if (typeof statNameOrId === "number") {
      const found = statsArray.find(s => s.id === statNameOrId);
      if (found && found.value != null) return found.value;
    }
    const nameToFind = String(statNameOrId).toLowerCase();
    const found = statsArray.find(s => s.name?.toLowerCase() === nameToFind);
    if (found && found.value != null) return found.value;
  }
  const directValue = player?.[statNameOrId];
  if (directValue != null) return directValue;
  return fallback;
}

function fmt(n) {
  if (n == null) return "0";
  const num = Number(n);
  return isNaN(num) ? "0" : num.toLocaleString("en-US");
}


const NAME_COLOR_GRADIENTS = {
  43000000: ["#ffffff", "#cccccc"],           // white
  43000001: ["#4ddba2", "#2ab880"],           // teal
  43000002: ["#ffce89", "#ffaa44"],           // peach
  43000003: ["#f9e44a", "#f9c908"],           // gold
  43000004: ["#ffb84d", "#ff9727"],           // orange
  43000005: ["#ffaa8a", "#f9775d"],           // salmon
  43000006: ["#ff8060", "#f05637"],           // red
  43000007: ["#ffb8fd", "#ff8afb"],           // pink
  43000008: ["#d0f0ff", "#a2e3fe"],           // light blue
  43000009: ["#60c8ff", "#1ba5f5"],           // blue
  43000010: ["#e09aff", "#cb5aff"],           // purple
  43000011: ["#d2f566", "#a8e132"],           // green
};


function getNameColors(raw) {
  if (raw == null) return ["#ffffff", "#cccccc"];
  const id = Number(raw);
  if (!isNaN(id) && NAME_COLOR_GRADIENTS[id]) return NAME_COLOR_GRADIENTS[id];
  // Legacy ARGB hex fallback
  const hex = String(raw).replace(/^0x/i, "");
  if (hex.length === 8) {
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    if (a < 0.05) return ["#ffffff", "#cccccc"];
    const c = `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${a.toFixed(3)})`;
    return [c, c];
  }
  const c = hex.length === 6 ? `#${hex}` : "#ffffff";
  return [c, c];
}


function outlinedGradient(ctx, text, x, y, x2, colors, stroke = "#000", lw = 8) {
  const g = ctx.createLinearGradient(x * SCALE, 0, x2 * SCALE, 0);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.lineJoin = "round"; ctx.miterLimit = 2;
  ctx.strokeStyle = stroke; ctx.lineWidth = lw * SCALE;
  ctx.strokeText(text, x * SCALE, y * SCALE);
  ctx.fillStyle = g;
  ctx.fillText(text, x * SCALE, y * SCALE);
}


const FONT_FALLBACK = (size) =>
  `400 ${size * SCALE}px 'Noto Color Emoji','Noto Sans','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;


function needsFallback(ch) {
  const cp = ch.codePointAt(0);
 
  if (cp <= 0x00FF) return false;

  if (cp <= 0x024F) return false;
  
  return true;
}


function drawMixedName(ctx, text, xStart, y, size, gradX2, colors, strokeColor = "#000", lw = 8) {
  if (!text) return;

  const grad = ctx.createLinearGradient(xStart * SCALE, 0, gradX2 * SCALE, 0);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);

  const runs = [];
  let cur = "", curFallback = needsFallback(text[0] ?? " ");
  for (const ch of text) {
    const fb = needsFallback(ch);
    if (fb !== curFallback) { runs.push([curFallback, cur]); cur = ""; curFallback = fb; }
    cur += ch;
  }
  if (cur) runs.push([curFallback, cur]);

  let curX = xStart * SCALE;
  ctx.lineJoin = "round"; ctx.miterLimit = 2;
  ctx.textBaseline = ctx.textBaseline; 

  for (const [isFallback, run] of runs) {
    ctx.font = isFallback ? FONT_FALLBACK(size) : FONT(size, 900);
    const w = ctx.measureText(run).width;

    // Stroke pass
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw * SCALE;
    ctx.strokeText(run, curX, y * SCALE);

    // Fill pass
    ctx.fillStyle = grad;
    ctx.fillText(run, curX, y * SCALE);

    curX += w;
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r * SCALE, (w * SCALE) / 2, (h * SCALE) / 2);
  const sx = x * SCALE, sy = y * SCALE, sw = w * SCALE, sh = h * SCALE;
  ctx.beginPath();
  ctx.moveTo(sx + rr, sy);
  ctx.arcTo(sx + sw, sy, sx + sw, sy + sh, rr);
  ctx.arcTo(sx + sw, sy + sh, sx, sy + sh, rr);
  ctx.arcTo(sx, sy + sh, sx, sy, rr);
  ctx.arcTo(sx, sy, sx + sw, sy, rr);
  ctx.closePath();
}

function drawRoundedRectRaw(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function outlined(ctx, text, x, y, fill = "#fff", stroke = "#000", lw = 8) {
  ctx.lineJoin = "round"; ctx.miterLimit = 2;
  ctx.strokeStyle = stroke; ctx.lineWidth = lw * SCALE;
  ctx.strokeText(text, x * SCALE, y * SCALE);
  ctx.fillStyle = fill; ctx.fillText(text, x * SCALE, y * SCALE);
}

function drawImageContain(ctx, img, x, y, w, h) {
  if (!img) return;
  const s = Math.min((w * SCALE) / img.width, (h * SCALE) / img.height);
  ctx.drawImage(
    img,
    x * SCALE + ((w * SCALE) - img.width * s) / 2,
    y * SCALE + ((h * SCALE) - img.height * s) / 2,
    img.width * s, img.height * s
  );
}

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const s = Math.max((w * SCALE) / img.width, (h * SCALE) / img.height);
  ctx.drawImage(
    img,
    x * SCALE + ((w * SCALE) - img.width * s) / 2,
    y * SCALE + ((h * SCALE) - img.height * s) / 2,
    img.width * s, img.height * s
  );
}

function drawBasicButton(ctx, x, y, width, height, color, skewAngle = 0) {
  ctx.save();
  ctx.translate(x * SCALE, y * SCALE);
  ctx.transform(1, 0, Math.tan(skewAngle), 1, 0, 0);
  const W2 = width * SCALE, H2 = height * SCALE;

  ctx.fillStyle = "#00000094";
  drawRoundedRectRaw(ctx, W2 * 0.007, H2 * 0.04, W2 * 0.99, H2, H2 * 0.09);
  ctx.fill();

  ctx.fillStyle = "#000000";
  drawRoundedRectRaw(ctx, 0, 0, W2, H2, H2 * 0.09);
  ctx.fill();

  ctx.fillStyle = color;
  drawRoundedRectRaw(ctx, H2 * 0.03, H2 * 0.03, W2 - H2 * 0.06, H2 - H2 * 0.06, H2 * 0.075);
  ctx.fill();

  ctx.clip();

  ctx.fillStyle = "#ffffff55";
  drawRoundedRectRaw(ctx, 0, 0, W2, H2 * 0.1, 0);
  ctx.fill();

  ctx.fillStyle = "#00000055";
  drawRoundedRectRaw(ctx, 0, H2 * 0.9, W2, H2 * 0.1, 0);
  ctx.fill();

  const ts = H2 * 0.25;
  ctx.beginPath(); ctx.moveTo(W2 - ts, 0); ctx.lineTo(W2, 0); ctx.lineTo(W2, ts); ctx.closePath();
  ctx.fillStyle = "#00000033"; ctx.fill();

  ctx.restore();
}

function getRecordIconFile(level = 0) {
  if (level <= 0)  return "record0.png";
  if (level <= 12) return `record${level}.png`;
  return "record12.png";
}

function getCollectionTotals(player, extra) {
  const owned = Array.isArray(player?.brawlers) ? player.brawlers : [];
  const all = (Array.isArray(extra?.allBrawlersData) && extra.allBrawlersData.length > 0 && extra.allBrawlersData)
    || (Array.isArray(extra?.brawlersMeta) && extra.brawlersMeta.length > 0 && extra.brawlersMeta)
    || owned;
  return { totalBrawlers: all.length };
}


function getBrawlerPrestigePoints(trophies) {
  if (trophies < 1000) return 0;
  const tier = Math.floor(trophies / 1000);
 
  return tier >= 3 ? tier + 1 : tier;
}

function calcTotalPrestigePoints(brawlers) {
  return brawlers.reduce((sum, b) => sum + getBrawlerPrestigePoints(b.trophies ?? 0), 0);
}

const WORLDS = [
  { thresholds: [140],   icon: "icon_trophyworld_townsquare" },
  { thresholds: [800],   icon: "icon_trophyworld_retropolis" },
  { thresholds: [2250],  icon: "icon_trophyworld_frontierworld" },
  { thresholds: [6500],  icon: "icon_trophyworld_hauntedhaven" },
  { thresholds: [11500], icon: "icon_trophyworld_adventureland" },
  { thresholds: [16500], icon: "icon_trophyworld_mysticmountain" },
  { thresholds: [21500], icon: "icon_trophyworld_brawliwood" },
  { thresholds: [26500], icon: "icon_trophyworld_fairytalecastle" },
  { thresholds: [33000], icon: "icon_trophyworld_tomorroworld" },
  { thresholds: [43000], icon: "icon_trophyworld_waterland" },
  { thresholds: [53000], icon: "icon_trophyworld_chronotrap" },
  { thresholds: [63000], icon: "icon_trophyworld_tunestown" },
  { thresholds: [73000], icon: "icon_trophyworld_creepsville" },
  { thresholds: [83000], icon: "icon_trophyworld_toyland" },
  { thresholds: [93000], icon: "icon_trophyworld_madevilmanor" },
];
function getWorldForTrophies(t) {
  let w = WORLDS[0];
  for (const x of WORLDS) { if (t >= x.thresholds[0]) w = x; else break; }
  return w;
}

async function loadLocal(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;

  try {
    return await loadImage(filePath);
  } catch (err) {
    console.error("[LOCAL LOAD FAIL]", filePath, err.message);
    return null;
  }
}

async function loadCachedRemote(cacheKey, url) {
  if (!cacheKey || !url) return null;

  try {
    return await getCachedOrFetch(cacheKey, url);
  } catch (err) {
    console.error("[REMOTE LOAD FAIL]", cacheKey, url, err.message);
    return null;
  }
}

async function tryLoad(primaryLocalPath, fallbackLocalPath = null, remote = null) {
  const locals = [primaryLocalPath, fallbackLocalPath].filter(Boolean);

  for (const localPath of locals) {
    const img = await loadLocal(localPath);
    if (img) return img;
  }

  if (remote?.cacheKey && remote?.url) {
    const remoteImg = await loadCachedRemote(remote.cacheKey, remote.url);
    if (remoteImg) return remoteImg;
  }

  for (const localPath of locals) {
    console.warn("[ASSET MISS]", localPath);
  }

  if (remote?.url) {
    console.warn("[REMOTE ASSET MISS]", remote.url);
  }

  return null;
}

async function loadBorderlessIcon(filename) {
  if (!filename) return null;

  return await tryLoad(
    path.join(ICONS_DIR, "borderless", filename),
    path.join(ICONS_DIR, filename)
  );
}

async function loadProfileIcon(iconId) {
  if (!iconId || String(iconId) === "Unknown") return null;

  return await tryLoad(
    path.join(PROFILE_ICONS_DIR, `${iconId}.png`),
    null,
    {
      cacheKey: `profile-icons/${iconId}.png`,
      url: `https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`,
    }
  );
}

async function loadRankedTieredIcon(score = 0) {
  const id = getRankedTierId(score);

  return await tryLoad(
    path.join(RANKED_TIERED_DIR, `${id}.png`),
    path.join(RANKED_DIR, `${id}.png`)
  );
}

async function loadBrawlerEmoji(id) {
  if (!id) return null;

  return await tryLoad(
    path.join(BRAWLERS_DIR, "emoji", `${id}.png`)
  );
}

async function loadBrawlerTieredIcon(brawlerId, trophies) {
  if (!brawlerId) return null;

  let folder;
  if      (trophies <= 249)  folder = "0";
  else if (trophies <= 499)  folder = "1";
  else if (trophies <= 749)  folder = "2";
  else if (trophies <= 999)  folder = "3";
  else if (trophies <= 1999) folder = "4";
  else if (trophies <= 2999) folder = "5";
  else                       folder = "6";

  return await tryLoad(
    path.join(TIERS_DIR, folder, `${brawlerId}.png`),
    path.join(BRAWLERS_DIR, "emoji", `${brawlerId}.png`)
  );
}

const _skinCache = {};
async function loadSkinFromCDN(skinId) {
  if (!skinId) return null;
  if (_skinCache[skinId]) return _skinCache[skinId];

  try {
    const url = `https://cdn.bsinfox.com/brawlers/skins/${skinId}.png`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    _skinCache[skinId] = img;
    return img;
  } catch {
    return null;
  }
}

async function loadFavBrawlerTieredIcon(brawlerId, trophies) {
  if (!brawlerId) return null;

  let folder;
  if      (trophies <= 249)  folder = "0";
  else if (trophies <= 499)  folder = "1";
  else if (trophies <= 749)  folder = "2";
  else if (trophies <= 999)  folder = "3";
  else if (trophies <= 1999) folder = "4";
  else if (trophies <= 2999) folder = "5";
  else                       folder = "6";

  return await tryLoad(
    path.join(TIERS_DIR, folder, `${brawlerId}.png`),
    path.join(BRAWLERS_DIR, "emoji", `${brawlerId}.png`)
  );
}


async function drawBrawlerSlot(ctx, brawlerId, trophies, cx, cy, slotSize) {
  const tiered = await loadBrawlerTieredIcon(brawlerId, trophies);
  const img    = tiered ?? await loadBrawlerEmoji(brawlerId);
  if (!img) return;
  const s = Math.min(slotSize / img.width, slotSize / img.height);
  ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
}

let _framesData = Array.isArray(frameData) ? frameData : [];

async function loadFramesJson() {
  return _framesData;
}

function findFrame(frameRawId) {
  const frames = _framesData || [];
  let f = frames.find(x => x.id === frameRawId);
  if (f) return f;
  const n = Number(frameRawId);
  if (!isNaN(n)) {
    f = frames.find(x => x.id === n);
    if (f) return f;
    f = frames.find(x => x.id === (n % 100000));
  }
  return f ?? null;
}
async function loadBattleCardFrame(frameRawId, starsCount) {
  await loadFramesJson();
  const frameDef = findFrame(frameRawId);
  let bgImg = null, starImg = null, prestigeText = null, iconImg = null, isRanked = false;
  if (frameDef) {
    isRanked = typeof frameDef.name === "string" && frameDef.name.includes("ranked");
    if (frameDef.bg) bgImg = await tryLoad(path.join(FRAMES_BG_DIR, `${frameDef.bg}.png`));
    if (isRanked) {
      if (Array.isArray(frameDef.stars) && frameDef.stars.length > 0) {
        const idx = Math.min(Math.max(starsCount, 0), frameDef.stars.length - 1);
        const raw = frameDef.stars[idx];
        if (raw) { const parts = raw.split("/"); starImg = await tryLoad(path.join(FRAMES_DIR, ...parts) + ".png"); }
      }
    } else {
      if (frameDef.text && frameDef.text !== "") prestigeText = frameDef.text;
      if (frameDef.icon && frameDef.icon !== "") iconImg = await tryLoad(path.join(FRAMES_ICONS_DIR, `${frameDef.icon}.png`));
    }
  } else if (frameRawId != null) {
    const n = Number(frameRawId);
    if (!isNaN(n)) bgImg = await tryLoad(path.join(FRAMES_BG_DIR, `${n}.png`));
  }
  return { bg: bgImg, star: starImg, prestigeText, icon: iconImg, isRanked };
}


const TITLE_GRADIENTS = {
  PlayerTitleGold: ["#ffdaac", "#ffd12e", "#f29928", "#ffd12e"],
  Plus:            ["#f9e6ff", "#e2a3ff", "#fffe98", "#c2f3f2"],
  TitlePrestige:   ["#443401", "#c2ad04", "#efd503", "#fff72a", "#fffb81", "#fef9d1"],
};
const _titleCache = new Map();
async function fetchTitle(id) {
  if (!id || id === 0) return null;
  if (_titleCache.has(id)) return _titleCache.get(id);
  try {
    const res  = await fetch(`https://api.bsinfox.com/title/${id}?lang=en`);
    if (!res.ok) return null;
    const json = await res.json();
    const name = json?.title?.name ?? json?.name ?? null;
    if (!name) return null;
    const gradient = json?.title?.gradient ?? json?.gradient ?? null;
    const colorMap = {};
    for (const tc of json?.titleColor ?? []) { if (tc?.id && Array.isArray(tc.colors)) colorMap[tc.id] = tc.colors; }
    const colors = (gradient && colorMap[gradient]) ? colorMap[gradient]
      : (gradient && TITLE_GRADIENTS[gradient]) ? TITLE_GRADIENTS[gradient] : ["#FFFFFF"];
    const result = { name, gradient, colors };
    _titleCache.set(id, result);
    return result;
  } catch { return null; }
}

// ---------- Fame ----------
let _fameTiersCache = null;
async function fetchFameTiers() {
  if (_fameTiersCache) return _fameTiersCache;
  try {
    const res  = await fetch('https://api.brawlify.com/game/csv_client/fame_tiers');
    const json = await res.json();
    const raw  = Array.isArray(json) ? json : (json?.list ?? Object.values(json));
    _fameTiersCache = Array.isArray(raw) ? raw : [];
    return _fameTiersCache;
  } catch { return []; }
}
async function getFameData(totalPoints) {
  const fameData = await fetchFameTiers();
  if (!fameData.length) return null;
  const groups = {};
  for (const tier of fameData) {
    const g = tier.Group ?? tier.group ?? 0;
    if (!groups[g]) groups[g] = [];
    groups[g].push(tier);
  }
  const groupKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const allPoints = groupKeys.reduce((sum, g) => sum + groups[g].reduce((s, t) => s + (t.FameToNext ?? 0), 0), 0);
  let pointsAccum = 0, currentGroup = groupKeys[0];
  if (totalPoints >= allPoints) {
    currentGroup = groupKeys[groupKeys.length - 1];
    const lastTiers = groups[currentGroup];
    const totalGroupPoints = lastTiers.reduce((s, t) => s + (t.FameToNext ?? 0), 0);
    const tierCount = lastTiers.length;
    return { currentGroup, currentTier: tierCount, currentPoints: totalGroupPoints, totalGroupPoints, progress: 1, iconFile: `icon_fame_tier_${currentGroup}_${tierCount}.png` };
  }
  for (const g of groupKeys) {
    const groupPoints = groups[g].reduce((s, t) => s + (t.FameToNext ?? 0), 0);
    if (totalPoints < pointsAccum + groupPoints) { currentGroup = g; break; }
    pointsAccum += groupPoints;
  }
  const groupTiers = groups[currentGroup];
  const totalGroupPoints = groupTiers.reduce((s, t) => s + (t.FameToNext ?? 0), 0);
  const currentGroupPoints = totalPoints - pointsAccum;
  const progress = totalGroupPoints > 0 ? currentGroupPoints / totalGroupPoints : 0;
  let tierAccum = 0, currentTier = 1;
  for (let i = 0; i < groupTiers.length; i++) {
    tierAccum += groupTiers[i].FameToNext ?? 0;
    if (currentGroupPoints < tierAccum) { currentTier = i + 1; break; }
    if (i === groupTiers.length - 1) currentTier = groupTiers.length;
  }
  return { currentGroup, currentTier, currentPoints: currentGroupPoints, totalGroupPoints, progress, iconFile: `icon_fame_tier_${currentGroup}_${currentTier}.png` };
}

// ---------- Experience ----------
let milestonesCache = null;
async function fetchMilestones() {
  if (milestonesCache) return milestonesCache;
  try {
    const res  = await fetch('https://api.brawlify.com/game/csv_logic/milestones');
    const json = await res.json();
    const data = Object.values(json).filter(m => m.Type === 5);
    data.sort((a, b) => a.ProgressStart - b.ProgressStart);
    milestonesCache = data;
    return data;
  } catch { return []; }
}
async function calcExperienceToSimpleJSON(points) {
  const ms = await fetchMilestones();
  if (!ms.length) return { currentLevel: 1, currentPointToNext: 0, pointsToNext: 100, progress: 0 };
  const cur = ms.find(m => m.ProgressStart <= points && points < m.ProgressStart + m.Progress);
  if (cur) {
    const currentPointToNext = points - cur.ProgressStart;
    const pointsToNext = cur.Progress;
    return {
      currentLevel: cur.Index + 1,
      currentPointToNext,
      pointsToNext,
      progress: parseFloat((currentPointToNext / pointsToNext).toFixed(2)),
      progressStart: cur.ProgressStart,
    };
  }
  const last      = ms[ms.length - 1];
  const lastFour  = ms.slice(-4);
  let growth = 0;
  for (let i = 1; i < lastFour.length; i++) growth += lastFour[i].Progress - lastFour[i - 1].Progress;
  growth /= (lastFour.length - 1);
  let levelAbove = 0, pointsToNext = last.Progress + growth,
      progressStart = last.ProgressStart + last.Progress,
      extraPoints = points - progressStart;
  while (extraPoints >= pointsToNext) {
    extraPoints   -= pointsToNext;
    progressStart += pointsToNext;
    pointsToNext  += growth;
    levelAbove++;
  }
  return {
    currentLevel: last.Index + 1 + levelAbove,
    currentPointToNext: extraPoints,
    pointsToNext,
    progress: parseFloat((extraPoints / pointsToNext).toFixed(2)),
    progressStart,
  };
}


function drawStraightVertical(ctx, x, y1, y2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x * SCALE, y1 * SCALE);
  ctx.lineTo(x * SCALE, y2 * SCALE);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 12 * SCALE;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo((x - 4) * SCALE, y1 * SCALE);
  ctx.lineTo((x - 4) * SCALE, y2 * SCALE);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 3 * SCALE;
  ctx.stroke();
  ctx.restore();
}

function drawThickHorizontal(ctx, x, y, w) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x * SCALE, y * SCALE); ctx.lineTo((x + w) * SCALE, y * SCALE);
  ctx.strokeStyle = "#000000"; ctx.lineWidth = 12 * SCALE; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x * SCALE, (y - 3) * SCALE); ctx.lineTo((x + w) * SCALE, (y - 3) * SCALE);
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 3 * SCALE; ctx.stroke();
  ctx.restore();
}

function drawStatCardNew(ctx, x, y, w, h, icon, iconSize, label, value, r = 10) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.lineWidth = 3 * SCALE;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();
  ctx.restore();

  
  const iconPad = 6;
  const iconX   = x + iconPad;
  const iconY   = y + (h - iconSize) / 2;
  if (icon) drawImageContain(ctx, icon, iconX, iconY, iconSize, iconSize);

  
  const textX = x + iconSize + iconPad + 8;
  ctx.font = FONT(10, 900); ctx.textBaseline = "top";
  outlined(ctx, label, textX, y + 8, "#FFFFFF", "#000", 3);

  ctx.font = FONT(24, 900);
  outlined(ctx, value, textX, y + 24, "#FFFFFF", "#000", 7);
}


async function renderProfileCard({ player, club, rankedTier, rankedScore, extra, playerTag: _playerTag }) {
  let p = (player?.ok !== undefined && player?.result !== undefined) ? player.result : player;

  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx    = canvas.getContext("2d");
  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = "high";

  const bc         = p?.battle_card ?? p?.battleCard ?? extra?.battleCard ?? null;
  const rankedBc   = p?.ranked_battle_card ?? p?.rankedBattleCard ?? null;
  const titleId    = bc?.title ?? p?.title ?? extra?.title ?? 0;
  const frameRawId = bc?.frame?.id ?? bc?.frame ?? null;
  const starsCount = Math.min(Math.max(rankedBc?.stars ?? 0, 0), 6);
  
  const favSkinId  = bc?.favorite_skin ?? null;

  const trophies         = getStat(p, STAT_ID.TROPHIES);
  const highestTrophies  = getStat(p, STAT_ID.HIGHEST_TROPHIES);
  const threeVsThreeWins = getStat(p, STAT_ID.THREE_V_THREE);
  const soloWins         = getStat(p, STAT_ID.SOLO_VICTORIES);
  const duoWins          = getStat(p, STAT_ID.DUO_VICTORIES);
  const currentRankedVal = getStat(p, STAT_ID.CURRENT_RANKED_PTS);
  const rankedVal        = getStat(p, STAT_ID.HIGHEST_RANKED_PTS);
  const acYear           = getStat(p, STAT_ID.ACCOUNT_CREATION);
  const recordPoints     = getStat(p, STAT_ID.RECORD_POINTS) ?? 0;
  const recordLevel      = getStat(p, STAT_ID.RECORD_LEVEL) ?? 0;
  const ownedCount       = getStat(p, STAT_ID.OWNED_BRAWLERS) || (Array.isArray(p?.brawlers) ? p.brawlers.length : 0);
  const totalCount       = getCollectionTotals(p, extra).totalBrawlers || ownedCount;
  const expPoints        = getStat(p, STAT_ID.EXP_POINTS) ?? extra?.expPoints ?? 0;
  const famePoints       = getStat(p, STAT_ID.FAME_POINTS) ?? extra?.famePoints ?? 0;

  const iconId       = p?.profile_avatar ?? p?.icon?.id ?? 28000000;
  const favBrawlerId = p?.favorite_brawler?.id ?? p?.favorite_brawler ?? extra?.favouriteBrawler ?? null;
  const firstIconId  = (bc?.first_profile_avatar != null && bc.first_profile_avatar !== 0) ? bc.first_profile_avatar : null;
  const secondIconId = (bc?.second_profile_avatar != null && bc.second_profile_avatar !== 0) ? bc.second_profile_avatar : null;

  const highestWinStreak   = p?.max_winstreak ?? 0;
  const nameColors         = getNameColors(p?.name_color ?? null);
  const brawlerList        = Array.isArray(p?.brawlers) ? p.brawlers : [];
  const normalizedBrawlers = brawlerList.map(b => ({ ...b, id: b.id ?? b.brawler_id }));
  const sortedBrawlers     = [...normalizedBrawlers].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));

  
  const prestigeBrawlerCount = extra?.totalPrestigeLevel ?? p?.totalPrestigeLevel ??
    calcTotalPrestigePoints(normalizedBrawlers);

  const playerName         = p?.name || "Unknown";
  const tagStr             = String(_playerTag ?? p?.account_tag?.tag ?? "").toUpperCase().replace(/^#*/, "#");
  const accountCreated     = acYear ? String(acYear) : null;
  const world              = getWorldForTrophies(trophies);
  const winstreakBrawlerId = p?.winstreak_brawler?.id ?? p?.winstreak_brawler ?? null;

  const favBrawlerTrophies = (() => {
    const b = normalizedBrawlers.find(b => b.id === favBrawlerId);
    return b?.trophies ?? 0;
  })();

  
  const MARGIN     = 14;
  const DIVIDER_X  = 555;
  const LINE_X     = DIVIDER_X - 5;
  const LINE_W     = W - LINE_X - MARGIN;
  const RX         = DIVIDER_X + 18;
  const RW         = W - DIVIDER_X - 18 - MARGIN;

  
  const ROW_COUNTS     = [9, 9, 8];
  const BI_MAX_PER_ROW = 9; 
  const BI_ROWS        = 3;
  const BI_GAP         = 8;

  const _pNumStr = String(prestigeBrawlerCount);
  ctx.font = FONT(32, 900);
  const _pIconS  = Math.max(110, Math.ceil(ctx.measureText(_pNumStr).width / SCALE * 2.5));
  const _pIconX  = W - MARGIN - _pIconS + 10;

  const BI_AVAIL = _pIconX - RX - BI_GAP;
  const BI_S     = Math.floor((BI_AVAIL - BI_GAP * (BI_MAX_PER_ROW + 1)) / BI_MAX_PER_ROW);
  const BI_ROW_H = BI_S + BI_GAP;

  const HEADER_H         = 38;
  
  const BRAWLERS_PANEL_H = HEADER_H + BI_ROWS * BI_ROW_H + BI_GAP + 8;
  const brawlersBgStartY = H - BRAWLERS_PANEL_H;

  
  const fameData = famePoints > 0 ? await getFameData(famePoints).catch(() => null) : null;

  const expData = expPoints ? await calcExperienceToSimpleJSON(expPoints) : null;

  const [
    titleResult, bgImg, avatarImg,
    currentTierIcon, highestTierIcon,
    firstIconImg, secondIconImg, worldIcon, frameResult,
    icTrophies, icRanked, icSolo, ic3v3, icDuo,
    icPrestige, icWinStreak, icAcc, icRecord,
    winstreakBrawlerEmoji, expIcon,
    favModelImg, favTieredIcon,
    stImg, fameIconImg,
  ] = await Promise.all([
    titleId ? fetchTitle(titleId) : Promise.resolve(null),
    loadLocal(path.join(BG_DIR, "fond_profil2.png")).catch(() => null),
    loadLocal(path.join(PROFILE_ICONS_DIR, `${iconId}.png`)).catch(() => null),
    loadRankedTieredIcon(currentRankedVal),
    loadRankedTieredIcon(rankedVal),
    firstIconId  ? loadProfileIcon(firstIconId)  : Promise.resolve(null),
    secondIconId ? loadProfileIcon(secondIconId) : Promise.resolve(null),
    tryLoad(path.join(WORLDS_DIR, `${world.icon}.png`)),
    loadBattleCardFrame(frameRawId, starsCount),
    loadBorderlessIcon("trophies.png"),
    loadBorderlessIcon("ranked.png"),
    loadBorderlessIcon("solo.png"),
    tryLoad(path.join(ICONS_DIR, "mode_3v3.png")).catch(() => loadBorderlessIcon("3v3.png")),
    loadBorderlessIcon("duo.png"),
    loadBorderlessIcon("prestige.png"),
    loadBorderlessIcon("winstreak.png"),
    tryLoad(path.join(ICONS_DIR, "acc.png")),
    tryLoad(path.join(RECORDS_DIR, `${34000000 + (recordLevel ?? 0)}.png`)).catch(() => loadBorderlessIcon("record.png")),
    winstreakBrawlerId ? loadBrawlerEmoji(winstreakBrawlerId) : Promise.resolve(null),
    loadBorderlessIcon("exp.png"),
    
    favSkinId ? loadSkinFromCDN(favSkinId) : Promise.resolve(null),
    favBrawlerId ? loadFavBrawlerTieredIcon(favBrawlerId, favBrawlerTrophies) : Promise.resolve(null),
    tryLoad(path.join(ICONS_DIR, "st.png")),
    fameData?.iconFile ? tryLoad(path.join(FAME_DIR, fameData.iconFile)) : Promise.resolve(null),
  ]);

  const { bg: frameBgImg, star: frameStarImg, prestigeText: framePrestigeText, icon: frameIconImg, isRanked: frameIsRanked } = frameResult ?? {};


  if (bgImg) {
    const s = Math.max((W * SCALE) / bgImg.width, (H * SCALE) / bgImg.height);
    ctx.drawImage(bgImg, ((W * SCALE) - bgImg.width * s) / 2, ((H * SCALE) - bgImg.height * s) / 2, bgImg.width * s, bgImg.height * s);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H * SCALE);
    g.addColorStop(0, "#1a0a38"); g.addColorStop(1, "#0d0520");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W * SCALE, H * SCALE);
  }
  ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(0, 0, W * SCALE, H * SCALE);


  const LP_X   = MARGIN;

  const AV_S   = 150;


  if (avatarImg) {
    ctx.save();
    roundRectPath(ctx, LP_X, MARGIN, AV_S, AV_S, 18);
    ctx.clip();
    ctx.drawImage(avatarImg, LP_X * SCALE, MARGIN * SCALE, AV_S * SCALE, AV_S * SCALE);
    ctx.restore();
  }

  
  ctx.font = FONT(24, 900); ctx.textBaseline = "top";
  outlined(ctx, tagStr, LP_X, MARGIN + AV_S + 6, "#FFFFFF", "#000", 6);

  const NX    = LP_X + AV_S + 20;
  const NY    = MARGIN;
  const BOX_W = DIVIDER_X - MARGIN - NX;
  
  const NAME_H = 68;
  
  const EXP_H  = 34;
  
  const GAP_NE = 4;
  const EY     = NY + NAME_H + GAP_NE;

  
  drawBasicButton(ctx, NX, NY, BOX_W, NAME_H, "#232439", SKEW_RAD);
  ctx.save();
  
  ctx.font = FONT(40, 900); ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * SCALE;
  drawMixedName(ctx, playerName, NX + 18, NY + NAME_H / 2, 40, NX + BOX_W, nameColors, "#000", 10);
  ctx.shadowBlur = 0; ctx.restore();

 
  if (expData && expIcon) {
    drawBasicButton(ctx, NX, EY, BOX_W, EXP_H, "#1a1a2e", SKEW_RAD);

    const EXP_BX = NX * SCALE;
    const EXP_BY = EY * SCALE;

    ctx.save();
    ctx.translate(EXP_BX, EXP_BY);
    ctx.transform(1, 0, SKEW_X, 1, 0, 0);

    const barW = BOX_W * SCALE - 130 * SCALE;
    const barH = EXP_H * SCALE;
    const barX = 72 * SCALE;
    const barY = 0;
    
    const barPad = 9 * SCALE;
    const progress = Math.min(expData.progress, 1);

    ctx.save();
    drawRoundedRectRaw(ctx, barX, barY + barPad, barW, barH - barPad * 2, 4 * SCALE);
    ctx.clip();
    ctx.fillStyle = "#232439";
    ctx.fillRect(barX, barY + barPad, barW, barH - barPad * 2);
    ctx.fillStyle = "#293043";
    ctx.fillRect(barX, barY + barH * 0.6, barW, barH * 0.4 - barPad);
    ctx.restore();

    const progressW = barW * progress;
    if (progressW > 0) {
      ctx.save();
      drawRoundedRectRaw(ctx, barX, barY + barPad, barW, barH - barPad * 2, 4 * SCALE);
      ctx.clip();
      ctx.fillStyle = "#00bbff";
      ctx.fillRect(barX, barY + barPad, progressW, barH - barPad * 2);
      ctx.fillStyle = "#287df7";
      ctx.fillRect(barX, barY + barH * 0.55, progressW, barH * 0.45 - barPad);
      ctx.restore();
    }

    const ptText = `${fmt(expData.currentPointToNext)}/${fmt(expData.pointsToNext)}`;
    ctx.font = FONT(20, 900);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#000"; ctx.lineWidth = 5 * SCALE;
    ctx.strokeText(ptText, barX + barW / 2, barY + barH / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ptText, barX + barW / 2, barY + barH / 2);

    ctx.restore();

 
    const ICON_S  = EXP_H + 8;
    const ICON_X  = NX + 2;
    const ICON_Y  = EY + (EXP_H - ICON_S) / 2;
    drawImageContain(ctx, expIcon, ICON_X, ICON_Y, ICON_S, ICON_S);

    const lvlStr = String(expData.currentLevel);
    const lvlFs  = Math.max(9, Math.floor(ICON_S * 0.28));
    ctx.save();
    ctx.font = FONT(lvlFs, 900); ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#000"; ctx.lineWidth = 5 * SCALE;
    ctx.strokeText(lvlStr, (ICON_X + ICON_S / 2) * SCALE, (ICON_Y + ICON_S / 2) * SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(lvlStr, (ICON_X + ICON_S / 2) * SCALE, (ICON_Y + ICON_S / 2) * SCALE);
    ctx.restore();
  }


  if (accountCreated) {
    const label  = `ACCOUNT CREATED: ${accountCreated}`;
    ctx.font     = FONT(20, 900); ctx.textBaseline = "middle";
    const acLW   = ctx.measureText(label).width / SCALE;
    const acH    = 56;
    const circR  = acH / 2;
    const acW    = acLW + circR + 28;
    const acX    = W - MARGIN - acW - circR;
    const acY    = MARGIN;

    ctx.save();
    roundRectPath(ctx, acX, acY, acW, acH, 16);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#111111"; ctx.font = FONT(20, 900); ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, (acX + 18) * SCALE, (acY + acH / 2) * SCALE);
    ctx.textAlign = "left";

    const circCX = acX + acW;
    const circCY = acY + acH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(circCX * SCALE, circCY * SCALE, circR * SCALE, 0, Math.PI * 2);
    ctx.fillStyle = "#2255cc"; ctx.fill();
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 4 * SCALE; ctx.stroke();
    ctx.restore();

    if (icAcc) drawImageContain(ctx, icAcc, circCX - circR * 0.72, circCY - circR * 0.72, circR * 1.44, circR * 1.44);
  }


  const CARD_W  = 500;
  const CARD_H  = 500;
 
  const LP_Y    = EY + EXP_H + 120;

  const ox     = LP_X * SCALE, oy = LP_Y * SCALE;
  const cardW  = CARD_W * SCALE, cardH = CARD_H * SCALE;
  const cSA    = (-4.6 * Math.PI) / 180, cSAW = (-2 * Math.PI) / 180;
  const refW   = 744, refH = 686;
  const scaleX = cardW / refW, scaleY = cardH / refH;

  function rrCard(cx, x, y, w, h, r, color, fill) {
    cx.save(); cx.fillStyle = color; cx.strokeStyle = color;
    cx.beginPath(); cx.moveTo(x + r, y); cx.lineTo(x + w - r, y); cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r); cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    cx.lineTo(x + r, y + h); cx.quadraticCurveTo(x, y + h, x, y + h - r);
    cx.lineTo(x, y + r); cx.quadraticCurveTo(x, y, x + r, y); cx.closePath();
    if (fill) cx.fill(); else cx.stroke(); cx.restore();
  }
  function clipToCard(cx) {
    cx.beginPath();
    cx.moveTo(64, 26); cx.lineTo(734, 26); cx.quadraticCurveTo(744, 26, 744, 36);
    cx.lineTo(744, 676); cx.quadraticCurveTo(744, 686, 734, 686);
    cx.lineTo(64, 686); cx.quadraticCurveTo(54, 686, 54, 676);
    cx.lineTo(54, 36); cx.quadraticCurveTo(54, 26, 64, 26); cx.closePath();
  }
  const toCanvas = (cx2, cy2) => ({
    x: ox + scaleX * (cx2 + cy2 * Math.tan(cSAW)),
    y: oy + scaleY * (cy2 + cx2 * Math.tan(cSA)),
  });

  
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
  ctx.transform(1, Math.tan(cSAW), Math.tan(cSA), 1, 0, 0);
  ctx.lineWidth = 6;
  rrCard(ctx, 53, 25, 692, 662, 11, "#FFFFFF", false);
  rrCard(ctx, 54, 26, 690, 660, 10, "#000000", true);
  ctx.restore();


  if (frameBgImg) {
    ctx.save(); ctx.translate(ox, oy);
    ctx.drawImage(frameBgImg, 8.5 * scaleX, 8 * scaleY, (484 / 2) * 3 * scaleX, (444 / 2) * 3 * scaleY);
    ctx.restore();
  }

 
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
  ctx.transform(1, Math.tan((-2.1 * Math.PI) / 180), Math.tan(cSA), 1, 0, 0);
  ctx.lineWidth = 10; rrCard(ctx, 59, 31, 681, 651, 8, "#000000", false); ctx.restore();


  if (favModelImg) {
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
    ctx.transform(1, Math.tan(cSAW), Math.tan(cSA), 1, 0, 0);
    clipToCard(ctx); ctx.clip();
    const mH = 660 * 1.1;
    const mW = Math.round(mH * (favModelImg.width / favModelImg.height));
  
    const mX = 54 + (690 - mW) / 2;
    const mY = 26 + (660 - mH) / 2 + 80;
    ctx.drawImage(favModelImg, mX, mY, mW, mH);
    ctx.restore();
  }

  // 5. Footer
  const footerTop = 560, footerH = 130;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
  ctx.transform(1, Math.tan(cSAW), Math.tan(cSA), 1, 0, 0);
  ctx.fillStyle = "#000000"; ctx.fillRect(54, footerTop, 690, footerH);
  ctx.beginPath(); ctx.moveTo(54, footerTop + footerH); ctx.lineTo(744, footerTop + footerH);
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3; ctx.stroke();
  const fS = SCALE / scaleX;
  let ftX = 66, ftY = footerTop + 14;
  ctx.font = `900 ${38 * fS}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;
  ctx.textBaseline = "top";
  
  {
    const _runs = [];
    let _cur = "", _curFb = false;
    for (const _ch of playerName) {
      const _cp = _ch.codePointAt(0);
      const _fb = _cp > 0x024F;
      if (_fb !== _curFb) { _runs.push([_curFb, _cur]); _cur = ""; _curFb = _fb; }
      _cur += _ch;
    }
    if (_cur) _runs.push([_curFb, _cur]);
    const _ng = ctx.createLinearGradient(ftX, 0, ftX + 500, 0);
    _ng.addColorStop(0, nameColors[0]); _ng.addColorStop(1, nameColors[1]);
    let _cx = ftX;
    for (const [_fb, _run] of _runs) {
      ctx.font = _fb
        ? `400 ${38 * fS}px 'Noto Color Emoji','Noto Sans','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`
        : `900 ${38 * fS}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;
      const _w = ctx.measureText(_run).width;
      ctx.strokeStyle = "#000"; ctx.lineWidth = 10 * fS; ctx.strokeText(_run, _cx, ftY);
      ctx.fillStyle = _ng; ctx.fillText(_run, _cx, ftY);
      _cx += _w;
    }
  }
  ftY += 44 * fS;
  if (titleResult) {
    ctx.font = `900 ${28 * fS}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;
    const tG = ctx.createLinearGradient(ftX, ftY, ftX + 500, ftY);
    if (Array.isArray(titleResult.colors)) titleResult.colors.forEach((c, i) => tG.addColorStop(i / Math.max(titleResult.colors.length - 1, 1), c));
    ctx.strokeStyle = "#000"; ctx.lineWidth = 6 * fS; ctx.strokeText(titleResult.name, ftX, ftY);
    ctx.fillStyle = titleResult.colors?.length > 0 ? tG : "#FFFFFF"; ctx.fillText(titleResult.name, ftX, ftY);
  }
  ctx.restore();


  const iSz = 70, iGap = 16, iPad = 65;
  const rightmostIconLeft = (54 + 690) - iPad - iSz;
  const leftIconLeft      = rightmostIconLeft - iSz - iGap - 10;
  const refYf             = footerTop + (footerH - iSz) / 2;
  const pL = toCanvas(leftIconLeft,      refYf);
  const pR = toCanvas(rightmostIconLeft, refYf);
  const commonY = pR.y / SCALE;
  if (firstIconImg)  drawImageContain(ctx, firstIconImg,  pL.x / SCALE, commonY, iSz, iSz);
  if (secondIconImg) drawImageContain(ctx, secondIconImg, pR.x / SCALE, commonY, iSz, iSz);

  
  if (favTieredIcon) {
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
    ctx.transform(1, Math.tan(cSAW), Math.tan(cSA), 1, 0, 0);
    const favSlotRef = (BI_S * SCALE / scaleX) * 1.3;
    
    const favRefX    = 54 + 690 - 10 - favSlotRef - 20;
    const favRefY    = footerTop - favSlotRef - 30;
    const s = Math.min(favSlotRef / favTieredIcon.width, favSlotRef / favTieredIcon.height);
    ctx.drawImage(favTieredIcon, favRefX + favSlotRef - favTieredIcon.width * s, favRefY + favSlotRef - favTieredIcon.height * s, favTieredIcon.width * s, favTieredIcon.height * s);
    ctx.restore();
  }

  
  if (fameIconImg) {
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(scaleX, scaleY);
    ctx.transform(1, Math.tan(cSAW), Math.tan(cSA), 1, 0, 0);
    clipToCard(ctx); ctx.clip();
    const fameSz = (BI_S * SCALE / scaleX) * 1.3;
    const fameRefX = 54 + 10, fameRefY = footerTop - fameSz - 30;
    const fs2 = Math.min(fameSz / fameIconImg.width, fameSz / fameIconImg.height);
    const fdw = fameIconImg.width * fs2, fdh = fameIconImg.height * fs2;
    ctx.drawImage(fameIconImg, fameRefX + (fameSz - fdw) / 2, fameRefY + (fameSz - fdh) / 2, fdw, fdh);
    ctx.restore();
  }


  if (frameIsRanked && frameStarImg) {
    const TH = 140, TW = Math.round(TH * frameStarImg.width / frameStarImg.height);
    const sx = LP_X + CARD_W / 2 - TW / 2, sy = LP_Y - TH * 0.42;
    ctx.drawImage(frameStarImg, sx * SCALE, sy * SCALE, TW * SCALE, TH * SCALE);
  } else if (!frameIsRanked && frameIconImg) {
    const label     = framePrestigeText ? String(prestigeBrawlerCount) : null;
    const ICON_SIZE = 140;
    const sx        = LP_X + CARD_W / 2 - ICON_SIZE / 2;
    const sy        = LP_Y - ICON_SIZE * 0.42;
    ctx.save(); drawImageCover(ctx, frameIconImg, sx, sy, ICON_SIZE, ICON_SIZE);
    if (label) {
      let fs = 52;
      ctx.font = `900 ${fs * SCALE}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`;
      while (fs > 28 && ctx.measureText(label).width / SCALE > ICON_SIZE * 0.65) { fs -= 2; ctx.font = `900 ${fs * SCALE}px 'Lilita One','Noto Sans','Noto Color Emoji','Noto Sans Arabic','Noto Sans CJK SC','Unifont Upper','Unifont','Arial Unicode MS',sans-serif`; }
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.lineJoin = "round"; ctx.strokeStyle = "#000"; ctx.lineWidth = 11 * SCALE;
      ctx.strokeText(label, (sx + ICON_SIZE / 2) * SCALE, (sy + ICON_SIZE / 2) * SCALE);
      ctx.fillStyle = "#ffffff"; ctx.fillText(label, (sx + ICON_SIZE / 2) * SCALE, (sy + ICON_SIZE / 2) * SCALE);
    }
    ctx.restore();
  }

try {
  const watermarkImg = await loadLocal(path.join(ICONS_DIR, "watermark.png"));
  const WM_H = 50;
  const WM_W = Math.round(WM_H * (watermarkImg.width / watermarkImg.height));
  
  const WM_X = MARGIN;
  const WM_Y = H - WM_H - MARGIN;
  ctx.globalAlpha = 0.9;
  drawImageContain(ctx, watermarkImg, WM_X, WM_Y, WM_W, WM_H);
  ctx.globalAlpha = 1.0;
} catch {}
  
  drawStraightVertical(ctx, LINE_X, 0, H);


  
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, (H - MARGIN) * SCALE);
  ctx.lineTo(LINE_X * SCALE, (H - MARGIN) * SCALE);
  ctx.strokeStyle = "#000000"; ctx.lineWidth = 8 * SCALE; ctx.stroke();
  ctx.restore();


  let RY = MARGIN + 40;

  if (worldIcon) drawImageContain(ctx, worldIcon, RX, RY, 172, 172);
  const tX = RX + 188;
  ctx.font = FONT(26, 900); ctx.textBaseline = "top";
  outlined(ctx, "TROPHY ROAD", tX, RY + 10, "#FFFFFF", "#000", 7);
  if (icTrophies) drawImageContain(ctx, icTrophies, tX - 4, RY + 44, 64, 64);
  ctx.font = FONT(66, 900);
  outlined(ctx, fmt(trophies), tX + 62, RY + 42, "#FFFFFF", "#000", 15);
  ctx.font = FONT(22, 700);
  outlined(ctx, `Highest: ${fmt(highestTrophies)}`, tX, RY + 120, "#ccccff", "#000", 5);

  // Win streak
  const wsStr      = fmt(highestWinStreak);
  ctx.font         = FONT(44, 900);
  const wsTextW    = ctx.measureText(wsStr).width / SCALE;
  const wsIconSize = Math.max(92, Math.ceil(wsTextW * 1.5));
  const wsX        = RX + RW - wsIconSize - 14;
  const wsY        = RY + 38;

  if (icWinStreak) {
    drawImageContain(ctx, icWinStreak, wsX, wsY, wsIconSize, wsIconSize);
    ctx.font = FONT(44, 900); ctx.textBaseline = "middle";
    ctx.strokeStyle = "#ff0000"; ctx.lineWidth = 7 * SCALE;
    const wsTx = wsX + wsIconSize / 2 - ctx.measureText(wsStr).width / SCALE / 2;
    ctx.strokeText(wsStr, wsTx * SCALE, (wsY + wsIconSize / 2) * SCALE);
    ctx.fillStyle = "#FFFFFF"; ctx.fillText(wsStr, wsTx * SCALE, (wsY + wsIconSize / 2) * SCALE);
  }

  if (winstreakBrawlerEmoji) {
    const emojiSize = 52;
    drawImageContain(ctx, winstreakBrawlerEmoji,
      wsX - emojiSize * 0.65,
      wsY + emojiSize * 1.2,        
      emojiSize, emojiSize
    );
  }

  ctx.font = FONT(15, 900);
  outlined(ctx, "MAX",        wsX + wsIconSize / 2 - ctx.measureText("MAX").width / SCALE / 2,        wsY + wsIconSize + 8,  "#FFD700", "#000", 4);
  ctx.font = FONT(13, 700);
  outlined(ctx, "WIN STREAK", wsX + wsIconSize / 2 - ctx.measureText("WIN STREAK").width / SCALE / 2, wsY + wsIconSize + 27, "#FFFFFF", "#000", 3);

  const trophyEndY = RY + 208;
  drawThickHorizontal(ctx, LINE_X, trophyEndY, LINE_W);

 
  const statsStartY = trophyEndY + 36;
  const STAT_COLS   = 3;
  const statGap     = 14;
  const statW       = (RW - statGap * (STAT_COLS - 1)) / STAT_COLS;
  const ICON_S_STAT = 56; 
  const CARD_H_STAT = 72;

  const row1 = [
    { icon: currentTierIcon ?? icRanked, label: "CURRENT",    value: fmt(currentRankedVal) },
    { icon: highestTierIcon ?? icRanked, label: "HIGHEST",    value: fmt(rankedVal) },
    { icon: icRecord,                    label: "RECORDS",    value: fmt(recordPoints) },
  ];
  for (let i = 0; i < STAT_COLS; i++) {
    const x = RX + i * (statW + statGap);
    drawStatCardNew(ctx, x, statsStartY, statW, CARD_H_STAT, row1[i].icon, ICON_S_STAT, row1[i].label, row1[i].value);
  }

  const row2Y = statsStartY + CARD_H_STAT + 12;
  const row2 = [
    { icon: ic3v3,  label: "3 VS 3 WINS", value: fmt(threeVsThreeWins) },
    { icon: icSolo, label: "SOLO WINS",   value: fmt(soloWins) },
    { icon: icDuo,  label: "DUO WINS",    value: fmt(duoWins) },
  ];
  for (let i = 0; i < STAT_COLS; i++) {
    const x = RX + i * (statW + statGap);
    drawStatCardNew(ctx, x, row2Y, statW, CARD_H_STAT, row2[i].icon, ICON_S_STAT, row2[i].label, row2[i].value);
  }

  ctx.save();
  const bGrad = ctx.createLinearGradient(LINE_X * SCALE, brawlersBgStartY * SCALE, LINE_X * SCALE, H * SCALE);
  bGrad.addColorStop(0, "#030942"); bGrad.addColorStop(1, "#03178d");
  ctx.fillStyle = bGrad;
  ctx.fillRect(LINE_X * SCALE, brawlersBgStartY * SCALE, (W - LINE_X) * SCALE, BRAWLERS_PANEL_H * SCALE);
  ctx.restore();

  

  drawThickHorizontal(ctx, LINE_X, brawlersBgStartY, LINE_W);

  
  ctx.font = FONT(22, 900); ctx.textBaseline = "middle";
  outlined(ctx, "BRAWLERS", RX + 10, brawlersBgStartY + 2 + HEADER_H / 2, "#FFFFFF", "#000", 6);

  
  const P_NUM_STR = String(prestigeBrawlerCount);
  let pfs = 36;
  ctx.font = FONT(pfs, 900);
  const P_ICON_S = Math.max(140, Math.ceil(ctx.measureText(P_NUM_STR).width / SCALE * 3.0));
  const P_ICON_X = W - MARGIN - P_ICON_S + 10;
  const P_ICON_Y = brawlersBgStartY - P_ICON_S * 0.45;

  
  const colStr = `${fmt(ownedCount)} / ${fmt(totalCount)} Collected`;
  ctx.font = FONT(16, 700);
  const colTW = ctx.measureText(colStr).width / SCALE;
  const pillW = colTW + 30, pillH = 32;
  const pillX = P_ICON_X - pillW - 20;
  const pillY = brawlersBgStartY + 2 + (HEADER_H - pillH) / 2;
  ctx.save();
  roundRectPath(ctx, pillX, pillY, pillW, pillH, 8);
  ctx.fillStyle = "rgba(3,23,141,0.8)"; ctx.fill();
  ctx.lineWidth = 2 * SCALE; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
  ctx.restore();
  ctx.font = FONT(16, 700); ctx.textBaseline = "middle";
  outlined(ctx, colStr, pillX + 15, pillY + pillH / 2, "#FFFFFF", "#000", 3);

  // Prestige badge
  if (icPrestige) {
    if (stImg) {
      const stH = 16, stY = P_ICON_Y + P_ICON_S - stH;
      ctx.save(); roundRectPath(ctx, P_ICON_X, stY, P_ICON_S, stH, 6); ctx.clip();
      drawImageCover(ctx, stImg, P_ICON_X, stY, P_ICON_S, stH); ctx.restore();
    }
    drawImageContain(ctx, icPrestige, P_ICON_X, P_ICON_Y, P_ICON_S, P_ICON_S);
    ctx.font = FONT(pfs, 900);
    while (pfs > 12 && ctx.measureText(P_NUM_STR).width / SCALE > P_ICON_S * 0.48) {
      pfs -= 2; ctx.font = FONT(pfs, 900);
    }
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const pCX = (P_ICON_X + P_ICON_S / 2 - 3) * SCALE;
    const pCY = (P_ICON_Y + P_ICON_S / 2 - 5) * SCALE;
    
    ctx.fillStyle = "#ffffff";
    ctx.fillText(P_NUM_STR, pCX, pCY);
    ctx.textAlign = "left";
  }

  
  const BI_Y_ROW1 = brawlersBgStartY + 2 + HEADER_H + BI_GAP;
  const BI_Y_ROW2 = BI_Y_ROW1 + BI_ROW_H;
  const BI_Y_ROW3 = BI_Y_ROW2 + BI_ROW_H;

  const brawlerRow1 = sortedBrawlers.slice(0, 9);
  const brawlerRow2 = sortedBrawlers.slice(9, 18);
  const brawlerRow3 = sortedBrawlers.slice(18, 26);

  await Promise.all([
    ...brawlerRow1.map(async (b, i) => {
      const bX = RX + BI_GAP + i * (BI_S + BI_GAP);
      await drawBrawlerSlot(ctx, b.id, b.trophies ?? 0, (bX + BI_S / 2) * SCALE, (BI_Y_ROW1 + BI_S / 2) * SCALE, BI_S * SCALE);
    }),
    ...brawlerRow2.map(async (b, i) => {
      const bX = RX + BI_GAP + i * (BI_S + BI_GAP);
      await drawBrawlerSlot(ctx, b.id, b.trophies ?? 0, (bX + BI_S / 2) * SCALE, (BI_Y_ROW2 + BI_S / 2) * SCALE, BI_S * SCALE);
    }),
    ...brawlerRow3.map(async (b, i) => {
      const bX = RX + BI_GAP + i * (BI_S + BI_GAP);
      await drawBrawlerSlot(ctx, b.id, b.trophies ?? 0, (bX + BI_S / 2) * SCALE, (BI_Y_ROW3 + BI_S / 2) * SCALE, BI_S * SCALE);
    }),
  ]);


  const shownCount = brawlerRow1.length + brawlerRow2.length + brawlerRow3.length;
  const remaining  = ownedCount - shownCount;
  if (remaining > 0) {
    const mX = RX + BI_GAP + brawlerRow3.length * (BI_S + BI_GAP) + 30;
    ctx.font = FONT(15, 900); ctx.textBaseline = "middle";
    outlined(ctx, `+${remaining} more`, mX, BI_Y_ROW3 + BI_S / 2, "#FFFFFF", "#000", 4);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileCard };