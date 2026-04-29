"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getCachedOrFetch } = require("../services/imageCache");
const { getRankedTierId, getRankedTierIdFromName } = require("../services/rankedTiers");

const ASSETS = path.resolve(__dirname, "..", "assets");
const BG_DIR = path.join(ASSETS, "backgrounds");
const PROFILE_ICONS_DIR = path.join(ASSETS, "profile-icons");
const RECORDS_DIR = path.join(ASSETS, "records");
const PORTRAITS_DIR = path.join(ASSETS, "brawlers", "portrait");
const PRESTIGES_DIR = path.join(ASSETS, "prestiges", "tiered");
const RANKED_DIR = path.join(ASSETS, "ranked", "tiered");
const ICONS_DIR = path.join(ASSETS, "icons");

const SCALE = 2;
const W = 1500;
const H = 1250;
const MARGIN = 14;

const PRESTIGE_THRESHOLDS = [
  { min: 0, level: 0, color: "#815b40" },
  { min: 250, level: 1, color: "#f5aa4d" },
  { min: 500, level: 2, color: "#b3b5d5" },
  { min: 750, level: 3, color: "#dec745" },
  { min: 1000, level: 4, color: "#b377e4" },
  { min: 2000, level: 5, color: "#ed599e" },
  { min: 3000, level: 6, color: "#f3cb66" },
  { min: 4000, level: 7, color: "#DAA520" },
  { min: 5000, level: 8, color: "#f3cb66" },
  { min: 6000, level: 9, color: "#f3cb66" },
  { min: 7000, level: 10, color: "#f3cb66" },
  { min: 8000, level: 11, color: "#f3cb66" },
  { min: 9000, level: 12, color: "#f3cb66" },
  { min: 10000, level: 13, color: "#f3cb66" },
];

const RANKED_LABELS = [
  { min: 0, name: "Bronze I" },
  { min: 250, name: "Bronze II" },
  { min: 500, name: "Bronze III" },
  { min: 750, name: "Silver I" },
  { min: 1000, name: "Silver II" },
  { min: 1250, name: "Silver III" },
  { min: 1500, name: "Gold I" },
  { min: 2000, name: "Gold II" },
  { min: 2500, name: "Gold III" },
  { min: 3000, name: "Diamond I" },
  { min: 3500, name: "Diamond II" },
  { min: 4000, name: "Diamond III" },
  { min: 4500, name: "Mythic I" },
  { min: 5000, name: "Mythic II" },
  { min: 5500, name: "Mythic III" },
  { min: 6000, name: "Legendary I" },
  { min: 6750, name: "Legendary II" },
  { min: 7500, name: "Legendary III" },
  { min: 8250, name: "Masters I" },
  { min: 9250, name: "Masters II" },
  { min: 10250, name: "Masters III" },
  { min: 11250, name: "Pro" },
];

function S(v) {
  return Math.round(v * SCALE);
}

function FONT(size, weight = 700) {
  return `${weight} ${S(size)}px "Lilita One", "Lilita", sans-serif`;
}

function fmt(n) {
  const num = Number(n || 0);
  return Number.isFinite(num) ? num.toLocaleString("fr-FR") : "0";
}

function normalizeTag(tag) {
  const raw = String(tag || "").toUpperCase().replace(/^#*/, "");
  return raw ? `#${raw}` : "#UNKNOWN";
}

function getPrestige(trophies) {
  const t = Number(trophies || 0);
  let result = PRESTIGE_THRESHOLDS[0];
  for (const p of PRESTIGE_THRESHOLDS) {
    if (t >= p.min) result = p;
    else break;
  }
  return result;
}

function getRankedLabel(score = 0) {
  const s = Number(score || 0);
  let tier = RANKED_LABELS[0];
  for (const item of RANKED_LABELS) {
    if (s >= item.min) tier = item;
    else break;
  }
  return s > 0 ? tier.name : "Unranked";
}

function getRecordIconFile(level = 0) {
  if (level <= 0) return "record0.png";
  if (level <= 12) return `record${level}.png`;
  return "record12.png";
}

function normalizeRankCardData(bsPlayer, extra = {}) {
  console.log('[DEBUG] totalBrawlers:', extra?.totalBrawlers, 'maxGadgets:', (extra?.totalBrawlers ?? bsPlayer?.brawlers?.length ?? 0) * 2);
  const currentRanked = extra?.currentRankedPts ?? 0;
  const highestRanked = extra?.highestRankedPts ?? 0;
  const BUFFIES_IDS = require('../assets/buffies.json');
  return {
    maxBuffies: 45,
    iconId: bsPlayer?.profile_avatar ?? bsPlayer?.icon?.id ?? 28000000,
    playerName: bsPlayer?.name || "Unknown",
    tag: normalizeTag(bsPlayer?.tag),
    clubName: bsPlayer?.club?.name || extra?.clubName || "",
    trophies: bsPlayer?.trophies ?? 0,
    highestTrophies: bsPlayer?.highestTrophies ?? bsPlayer?.highest_trophies ?? bsPlayer?.trophies ?? 0,
    wins3v3: bsPlayer?.["3vs3Victories"] ?? extra?.wins3v3 ?? 0,
    duoWins: bsPlayer?.duoVictories ?? extra?.duoWins ?? 0,
    soloWins: bsPlayer?.soloVictories ?? extra?.soloWins ?? 0,
    currentRanked,
    currentRankedLabel: getRankedLabel(currentRanked),
    highestRanked,
    highestRankedLabel: getRankedLabel(highestRanked),
    p11:       (bsPlayer?.brawlers ?? []).filter(b => b.power === 11).length,
    maxGadgets: (extra?.totalBrawlers ?? bsPlayer?.brawlers?.length ?? 0) * 2,
    maxSP:      (extra?.totalBrawlers ?? bsPlayer?.brawlers?.length ?? 0) * 2,
    currentRankedName: extra?.currentRankedName ?? '',
    highestRankedName: extra?.highestRankedName ?? '',
    recordPoints: extra?.recordPoints ?? 0,
    recordMax: extra?.recordMax ?? 45000,
    recordLevel: extra?.recordLevel ?? 0,
    ownedCount: bsPlayer?.brawlers?.length ?? 0,
    totalCount: extra?.totalBrawlers ?? (bsPlayer?.brawlers?.length ?? 0),
    accountCreation: extra?.accountCreation ?? null,
    winStreak: extra?.maxWinStreak ?? 0,
    prestigeTotal: extra?.totalPrestige ?? 0,
    brawlers: Array.isArray(bsPlayer?.brawlers) ? bsPlayer.brawlers : [],
    gadgets:      (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.gadgets?.length ?? 0), 0),
    starPowers:   (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.starPowers?.length ?? 0), 0),
    hyperCharges: (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.hyperCharges?.length ?? 0), 0),
    gears:    (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.gears?.length ?? 0), 0),
    maxGears: (extra?.totalBrawlers ?? bsPlayer?.brawlers?.length ?? 0) * 6,
    buffies:      (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.buffies ? Object.values(b.buffies).filter(Boolean).length : 0), 0),
  };
}

async function loadLocal(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await loadImage(filePath);
  } catch {
    return null;
  }
}

async function loadCachedRemote(cacheKey, url) {
  if (!cacheKey || !url) return null;
  try {
    return await getCachedOrFetch(cacheKey, url);
  } catch {
    return null;
  }
}

async function tryLoad(primaryLocalPath, fallbackLocalPath = null, remote = null) {
  for (const p of [primaryLocalPath, fallbackLocalPath].filter(Boolean)) {
    const img = await loadLocal(p);
    if (img) return img;
  }
  if (remote?.cacheKey && remote?.url) {
    const img = await loadCachedRemote(remote.cacheKey, remote.url);
    if (img) return img;
  }
  return null;
}

async function loadBorderlessIcon(filename, remote = null) {
  if (!filename) return null;
  return tryLoad(
    path.join(ICONS_DIR, "borderless", filename),
    path.join(ICONS_DIR, filename),
    remote,
  );
}

async function loadProfileIcon(iconId) {
  if (!iconId) return null;
  return tryLoad(
    path.join(PROFILE_ICONS_DIR, `${iconId}.png`),
    null,
    {
      cacheKey: `profile-icons/${iconId}.png`,
      url: `https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`,
    },
  );
}

async function loadRankedTieredIcon(score = 0) {
  if (Number(score || 0) <= 0) return null;
  const id = getRankedTierId(score);
  return tryLoad(path.join(RANKED_DIR, `${id}.png`));
}

async function loadRankedTieredIconFromName(rankName = '') {
  if (!rankName) return null;
  const id = getRankedTierIdFromName(rankName);
  return tryLoad(path.join(RANKED_DIR, `${id}.png`));
}

async function loadRecordIcon(level = 0) {
  return tryLoad(
    path.join(RECORDS_DIR, getRecordIconFile(level)),
    path.join(RECORDS_DIR, `340000${String(Math.max(0, Math.min(12, level))).padStart(2, "0")}.png`),
  );
}

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(S(x + r), S(y));
  ctx.lineTo(S(x + w - r), S(y));
  ctx.arcTo(S(x + w), S(y), S(x + w), S(y + r), S(r));
  ctx.lineTo(S(x + w), S(y + h - r));
  ctx.arcTo(S(x + w), S(y + h), S(x + w - r), S(y + h), S(r));
  ctx.lineTo(S(x + r), S(y + h));
  ctx.arcTo(S(x), S(y + h), S(x), S(y + h - r), S(r));
  ctx.lineTo(S(x), S(y + r));
  ctx.arcTo(S(x), S(y), S(x + r), S(y), S(r));
  ctx.closePath();
}

function outlined(ctx, text, x, y, fill, stroke, sw) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = S(sw);
  ctx.lineJoin = "round";
  ctx.strokeText(String(text), S(x), S(y));
  ctx.fillStyle = fill;
  ctx.fillText(String(text), S(x), S(y));
}

function drawPanel(ctx, x, y, w, h, radius = 10, fill = "rgba(0,0,0,0.38)", stroke = "rgba(255,255,255,0.12)") {
  rrPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  rrPath(ctx, x, y, w, h, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = S(1.5);
  ctx.stroke();
}

function drawProgressBar(ctx, x, y, w, h, progress, r = 7) {
  rrPath(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill();

  if (progress > 0) {
    const fillW = Math.max(h, (w - 2) * Math.min(progress, 1));
    ctx.save();
    rrPath(ctx, x, y, w, h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(S(x), S(y), S(x), S(y + h));
    g.addColorStop(0, "#FFE033");
    g.addColorStop(0.5, "#FFB800");
    g.addColorStop(1, "#CC8800");
    ctx.fillStyle = g;
    rrPath(ctx, x + 1, y + 1, fillW, h - 2, r - 1);
    ctx.fill();
    ctx.restore();
  }

  rrPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgba(255,200,0,0.65)";
  ctx.lineWidth = S(1.5);
  ctx.stroke();
}

function fitText(ctx, text, maxWidth, startSize, weight = 900) {
  let size = startSize;
  while (size > 10) {
    ctx.font = FONT(size, weight);
    if (ctx.measureText(text).width <= S(maxWidth)) return size;
    size -= 1;
  }
  return size;
}

// FIX 4 : icônes agrandis — iconSize = h - 4 au lieu de h - 12
function drawMiniStatChip(ctx, { x, y, w, h, img, value }) {
  drawPanel(ctx, x, y, w, h, 8, "rgba(0,0,0,0.42)", "rgba(255,255,255,0.12)");

  const iconSize = h - 4;
  if (img) ctx.drawImage(img, S(x + 2), S(y + (h - iconSize) / 2), S(iconSize), S(iconSize));

  const tx = x + iconSize + 5;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const size = fitText(ctx, String(value), Math.max(28, w - iconSize - 8), 15, 900);
  ctx.font = FONT(size, 900);
  outlined(ctx, value, tx, y + h / 2, "#ffffff", "#000000", 3);
}

function drawIdentityBlock(ctx, data, assets, x, y, w, h) {
  drawPanel(ctx, x, y, w, h, 14, "rgba(0,0,0,0.30)", "rgba(255,255,255,0.13)");

  const avatarSize = 150;
  const avX = x + 12;
  const avY = y + (h - avatarSize) / 2;

  if (assets.avatar) {
    ctx.save();
    rrPath(ctx, avX, avY, avatarSize, avatarSize, 14);
    ctx.clip();
    ctx.drawImage(assets.avatar, S(avX), S(avY), S(avatarSize), S(avatarSize));
    ctx.restore();
    rrPath(ctx, avX, avY, avatarSize, avatarSize, 14);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = S(2);
    ctx.stroke();
  }

  const textX = avX + avatarSize + 14;
  const textW = w - (textX - x) - 12;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const nameSize = fitText(ctx, data.playerName, textW, 30, 900);
  ctx.font = FONT(nameSize, 900);
  outlined(ctx, data.playerName, textX, y + 14, "#ffffff", "#000000", 5);

  ctx.font = FONT(14, 700);
  outlined(ctx, data.tag, textX, y + 52, "#b5b9c6", "#000000", 3);

  if (data.clubName) {
    ctx.font = FONT(15, 700);
    outlined(ctx, `★ ${data.clubName}`, textX, y + 76, "#a8cfff", "#000000", 3);
  }

  const pillY = y + h - 46;
  const pillH = 32;
  const pillGap = 10;
  const pillW = Math.floor((textW - pillGap) / 2);

  // FIX 4 : icônes pills agrandis — 28x28 au lieu de 24x24
  drawPanel(ctx, textX, pillY, pillW, pillH, 8, "rgba(0,0,0,0.42)", "rgba(255,255,255,0.08)");
  if (assets.icPrestige) ctx.drawImage(assets.icPrestige, S(textX + 2), S(pillY + 2), S(28), S(28));
  ctx.textBaseline = "middle";
  outlined(ctx, String(data.prestigeTotal), textX + 34, pillY + pillH / 2, "#ffffff", "#000000", 3);

  const wsX = textX + pillW + pillGap;
  drawPanel(ctx, wsX, pillY, pillW, pillH, 8, "rgba(0,0,0,0.42)", "rgba(255,255,255,0.08)");
  if (assets.icWinStreak) ctx.drawImage(assets.icWinStreak, S(wsX + 2), S(pillY + 2), S(28), S(28));
  outlined(ctx, String(data.winStreak), wsX + 34, pillY + pillH / 2, "#ffb15f", "#000000", 3);
}

function drawProgressBlock(ctx, data, assets, x, y, w, h) {
  drawPanel(ctx, x, y, w, h, 14, "rgba(0,0,0,0.26)", "rgba(255,255,255,0.12)");

  const line1Y = y + 24;
  const line2Y = y + 92;
  // FIX 4 : icônes trophées/record agrandis — 56 au lieu de 36
  const iconSize = 56;
  const barX = x + 18 + iconSize + 6;
  const barW = w - 18 - 14 - iconSize - 6;
  const barH = 26;

  if (assets.icTrophies) ctx.drawImage(assets.icTrophies, S(x + 10), S(line1Y - 5), S(iconSize), S(iconSize));
  drawProgressBar(ctx, barX, line1Y, barW, barH, data.trophies / Math.max(data.highestTrophies, 1));
  ctx.font = FONT(14, 900);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  outlined(ctx, `${fmt(data.trophies)} / ${fmt(data.highestTrophies)}`, barX + 8, line1Y + barH / 2, "#ffffff", "#000000", 3);

  if (assets.icRecord) ctx.drawImage(assets.icRecord, S(x + 10), S(line2Y - 5), S(iconSize), S(iconSize));
  drawProgressBar(ctx, barX, line2Y, barW, barH, data.recordPoints / Math.max(data.recordMax, 1));
  outlined(ctx, `${fmt(data.recordPoints)} / ${fmt(data.recordMax)}`, barX + 8, line2Y + barH / 2, "#ffffff", "#000000", 3);

  ctx.font = FONT(11, 900);
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  outlined(ctx, "TROPHÉES", barX, line1Y - 5, "#d9e3ff", "#000000", 3);
  outlined(ctx, "RECORD", barX, line2Y - 5, "#d9e3ff", "#000000", 3);
}

function drawMiniStatsBlock(ctx, data, assets, x, y, w, h) {
  drawPanel(ctx, x, y, w, h, 14, "rgba(0,0,0,0.24)", "rgba(255,255,255,0.12)");

  const cols = 5;
  const gap = 10;
  const sidePad = 12;
  const cellW = Math.floor((w - gap * (cols - 1) - sidePad * 2) / cols);
  const cellH = 44;
  const row1Y = y + 16;
  const row2Y = row1Y + cellH + 10;
  const startX = x + sidePad;

  // FIX 2 : "undefined" remplacé par "—"
  const accountDisplay = data.accountCreation ? String(data.accountCreation) : "—";

  const row1 = [
    { img: assets.ic3v3,     value: fmt(data.wins3v3) },
    { img: assets.icDuo,     value: fmt(data.duoWins) },
    { img: assets.icSolo,    value: fmt(data.soloWins) },
    { img: assets.icTrophies, value: `${data.ownedCount}/${data.totalCount}` },
    { img: assets.icAccount, value: accountDisplay },
  ];

  // FIX 3 : sous-labels ranked supprimés
  const row2 = [
    { img: assets.curTierImg,  value: fmt(data.currentRanked) },
    { img: assets.hiTierImg,   value: fmt(data.highestRanked) },
    { img: assets.icPrestige,  value: String(data.prestigeTotal) },
    { img: assets.icWinStreak, value: String(data.winStreak) },
    { img: assets.icBuffies,     value: `${data.buffies}/${data.maxBuffies}` },
  ];

  for (let i = 0; i < cols; i += 1) {
    const cellX = startX + i * (cellW + gap);
    drawMiniStatChip(ctx, { x: cellX, y: row1Y, w: cellW, h: cellH, ...row1[i] });
    if (i < row2.length) {
      drawMiniStatChip(ctx, { x: cellX, y: row2Y, w: cellW, h: cellH, ...row2[i] });
    }
  }
  const row3 = [
    { img: assets.icGadget,  value: `${data.gadgets}/${data.maxGadgets}` },
    { img: assets.icSP,      value: `${data.starPowers}/${data.maxSP}` },
    { img: assets.icHC,      value: String(data.hyperCharges) },
    { img: assets.icP11,     value: `${data.p11}/${data.ownedCount}` },
    { img: assets.icGear,             value: `${data.gears}/${data.maxGears}` },
  ];

  for (let i = 0; i < row3.length; i += 1) {
    const cellX = startX + i * (cellW + gap);
    drawMiniStatChip(ctx, { x: cellX, y: row2Y + cellH + 10, w: cellW, h: cellH, ...row3[i] });
  }
}

async function preloadHeaderAssets(data) {
  const [
    avatar,
    curTierImg,
    hiTierImg,
    icWinStreak,
    icPrestige,
    icTrophies,
    icRecord,
    ic3v3,
    icDuo,
    icSolo,
    icAccount,
    icBuffies,
    icGadget,
    icSP,
    icHC,
    icP11,
    icGear, 
  ] = await Promise.all([
    loadProfileIcon(data.iconId),
    loadRankedTieredIcon(data.currentRanked),
    data.highestRankedName ? loadRankedTieredIconFromName(data.highestRankedName) : loadRankedTieredIcon(data.highestRanked),
    loadBorderlessIcon("winstreak.png"),
    loadBorderlessIcon("prestige.png"),
    tryLoad(path.join(ICONS_DIR, "trophies.png")),
    loadRecordIcon(data.recordLevel),
    tryLoad(path.join(ICONS_DIR, "mode_3v3.png")),
    loadBorderlessIcon("duo.png"),
    loadBorderlessIcon("solo.png"),
    loadBorderlessIcon("exp.png"),
    tryLoad(path.join(ICONS_DIR, "buffies.png")),
    tryLoad(path.join(ICONS_DIR, "gadget.png")),
    tryLoad(path.join(ICONS_DIR, "sp.png")),
    tryLoad(path.join(ICONS_DIR, "hyper.png")),
    tryLoad(path.join(ICONS_DIR, "p11.png")),
    tryLoad(path.join(ICONS_DIR, "gear.png")),
  ]);

  return {
    avatar, curTierImg, hiTierImg,
    icWinStreak, icPrestige, icTrophies, icRecord,
    ic3v3, icDuo, icSolo, icAccount,
    icGadget, icSP, icHC,icP11, icGear, icBuffies,
  };
}

const BUFFIES_WITH_ABILITY = require('../assets/buffies.json');

async function drawHeader(ctx, bsPlayer, extra = {}) {
  const data = normalizeRankCardData(bsPlayer, extra);
  const assets = await preloadHeaderAssets(data);

  const headerX = MARGIN;
  const headerY = MARGIN;
  const headerW = W - MARGIN * 2;
  const headerH = 178;


  const leftW = 430;
  const midW = 390;
  const gap = 12;
  const rightW = headerW - leftW - midW - gap * 2;

  drawIdentityBlock(ctx, data, assets, headerX, headerY, leftW, headerH);
  drawProgressBlock(ctx, data, assets, headerX + leftW + gap, headerY, midW, headerH);
  drawMiniStatsBlock(ctx, data, assets, headerX + leftW + gap + midW + gap, headerY, rightW, headerH);

  return headerY + headerH + 16;
}

async function drawBrawlerGrid(ctx, brawlers, startY) {
  const sorted = [...brawlers].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));
  const COLS = 10;
  const GRID_W = W - MARGIN * 2;
  const GAP = 15;
  const CELL_W = Math.floor((GRID_W - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.6);
  const ROWS = Math.max(1, Math.ceil(sorted.length / COLS));
  const GRID_H = H - startY - MARGIN;
  const ACTUAL_H = Math.min(CELL_H, Math.floor(GRID_H / ROWS));

  const assets = await Promise.all(sorted.map(async (b) => {
    const id = b.id ?? b.brawler_id;
    const trophies = b.trophies ?? 0;
    const prestige = getPrestige(trophies);
    const [portrait, badge] = await Promise.all([
      tryLoad(
        path.join(PORTRAITS_DIR, `${id}.png`),
        null,
        {
          cacheKey: `brawlers/portrait/${id}.png`,
          url: `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png`,
        },
      ),
      tryLoad(path.join(PRESTIGES_DIR, `${prestige.level}.png`)),
    ]);
    return { trophies, prestige, portrait, badge };
  }));

  for (let i = 0; i < assets.length; i += 1) {
    const { trophies, prestige, portrait, badge } = assets[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = MARGIN + col * (CELL_W + GAP);
    const cy = startY + row * (ACTUAL_H + GAP);

    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 14);
    ctx.fillStyle = `${prestige.color}dd`;
    ctx.fill();

    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
      ctx.clip();
      const sc = (ACTUAL_H / portrait.height) * 2;
      const dW = portrait.width * sc;
      const dH = portrait.height * sc;
      ctx.drawImage(portrait, S(cx), S(cy), dW, dH);
      ctx.restore();
    }

    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = S(4);
    ctx.stroke();

    if (badge) {
      const bdS = Math.round(CELL_W * 0.45);
      const bdX = cx + Math.round(CELL_W * 0.52);
      const bdY = cy + (ACTUAL_H - bdS) / 2;
      ctx.drawImage(badge, S(bdX), S(bdY), S(bdS), S(bdS));
    }

    ctx.font = FONT(12, 900);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    outlined(ctx, fmt(trophies), cx + CELL_W - 6, cy + ACTUAL_H - 5, "#ffffff", "#000000", 3);
  }
}

async function generateRankCard(bsPlayer, extra = {}) {
  const data = normalizeRankCardData(bsPlayer, extra);
  const canvas = createCanvas(S(W), S(H));
  const ctx = canvas.getContext("2d");

  const bgImg = await tryLoad(path.join(BG_DIR, "rank_bg.png"));
  if (bgImg) {
    const sc = Math.max(S(W) / bgImg.width, S(H) / bgImg.height);
    const dW = bgImg.width * sc;
    const dH = bgImg.height * sc;
    ctx.drawImage(bgImg, (S(W) - dW) / 2, (S(H) - dH) / 2, dW, dH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, S(H));
    g.addColorStop(0, "#1a0a38");
    g.addColorStop(1, "#0d0520");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S(W), S(H));
  }

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, S(W), S(H));

  const headerEndY = await drawHeader(ctx, bsPlayer, extra);

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(S(MARGIN), S(headerEndY - 4), S(W - MARGIN * 2), S(2));

  await drawBrawlerGrid(ctx, data.brawlers, headerEndY);

  ctx.font = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText(new Date().toLocaleDateString("fr-FR"), S(W - 6), S(H - 4));

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateRankCard,
  drawHeader,
  normalizeRankCardData,
  getRecordIconFile,
  loadRankedTieredIcon,
};