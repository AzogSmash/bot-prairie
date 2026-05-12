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
const PORTRAITS_DIR = path.join(ASSETS, "brawlers", "emoji");
const PRESTIGES_DIR = path.join(ASSETS, "prestiges", "tiered");
const RANKED_DIR = path.join(ASSETS, "ranked", "tiered");
const ICONS_DIR = path.join(ASSETS, "icons");

const SCALE = 2;
const W = 1500;
const H = 1250;
const MARGIN = 14;

// ── Brawlers meta (généré par src/dev/generate-brawlers-meta.js) ──────────────
const BRAWLERS_META     = require('../assets/brawlers-meta.json');
const BRAWLERS_META_MAP = {};
for (const b of BRAWLERS_META) BRAWLERS_META_MAP[b.id] = b;

const TOTAL_BRAWLERS = BRAWLERS_META.length;
const MAX_GADGETS    = BRAWLERS_META.reduce((s, b) => s + b.totalGadgets, 0);
const MAX_SP         = BRAWLERS_META.reduce((s, b) => s + b.totalSP, 0);

const PRESTIGE_THRESHOLDS = [
  { min: 0,     level: 0,  color: "#c49060" },
  { min: 250,   level: 1,  color: "#ffb84a" },
  { min: 500,   level: 2,  color: "#b8c4f4" },
  { min: 750,   level: 3,  color: "#ffe454" },
  { min: 1000,  level: 4,  color: "#bf6eff" },
  { min: 2000,  level: 5,  color: "#ff5090" },
  { min: 3000,  level: 6,  color: "#ffd940" },
  { min: 4000,  level: 7,  color: "#ffc830" },
  { min: 5000,  level: 8,  color: "#ffd940" },
  { min: 6000,  level: 9,  color: "#ffd940" },
  { min: 7000,  level: 10, color: "#ffd940" },
  { min: 8000,  level: 11, color: "#ffd940" },
  { min: 9000,  level: 12, color: "#ffd940" },
  { min: 10000, level: 13, color: "#ffd940" },
];

// Seuils de tier Records (niveau → points requis pour atteindre ce niveau)
// Basé sur le data point connu : level 6 ≈ 27 000 pts
const RECORD_THRESHOLDS = [
  0, 2000, 5000, 9000, 14000, 20000, 27000, 35000, 44000, 54000, 65000, 77000, 90000,
];

function getRecordMax(level) {
  const next = RECORD_THRESHOLDS[Math.min(level + 1, RECORD_THRESHOLDS.length - 1)];
  return next ?? RECORD_THRESHOLDS[RECORD_THRESHOLDS.length - 1];
}

const RANKED_LABELS = [
  { min: 0,     name: "Bronze I"    },
  { min: 250,   name: "Bronze II"   },
  { min: 500,   name: "Bronze III"  },
  { min: 750,   name: "Silver I"    },
  { min: 1000,  name: "Silver II"   },
  { min: 1250,  name: "Silver III"  },
  { min: 1500,  name: "Gold I"      },
  { min: 2000,  name: "Gold II"     },
  { min: 2500,  name: "Gold III"    },
  { min: 3000,  name: "Diamond I"   },
  { min: 3500,  name: "Diamond II"  },
  { min: 4000,  name: "Diamond III" },
  { min: 4500,  name: "Mythic I"    },
  { min: 5000,  name: "Mythic II"   },
  { min: 5500,  name: "Mythic III"  },
  { min: 6000,  name: "Legendary I" },
  { min: 6750,  name: "Legendary II"},
  { min: 7500,  name: "Legendary III"},
  { min: 8250,  name: "Masters I"   },
  { min: 9250,  name: "Masters II"  },
  { min: 10250, name: "Masters III" },
  { min: 11250, name: "Pro"         },
];

function S(v) { return Math.round(v * SCALE); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function darkenHex(hex, amt = 50) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
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
  const currentRanked = extra?.currentRankedPts ?? 0;
  const highestRanked = extra?.highestRankedPts ?? 0;
  return {
    iconId:        bsPlayer?.profile_avatar ?? bsPlayer?.icon?.id ?? 28000000,
    playerName:    bsPlayer?.name || "Unknown",
    tag:           normalizeTag(bsPlayer?.tag),
    clubName:      bsPlayer?.club?.name || extra?.clubName || "",
    trophies:      bsPlayer?.trophies ?? 0,
    highestTrophies: bsPlayer?.highestTrophies ?? bsPlayer?.highest_trophies ?? bsPlayer?.trophies ?? 0,
    wins3v3:       bsPlayer?.["3vs3Victories"] ?? extra?.wins3v3 ?? 0,
    duoWins:       bsPlayer?.duoVictories ?? extra?.duoWins ?? 0,
    soloWins:      bsPlayer?.soloVictories ?? extra?.soloWins ?? 0,
    currentRanked,
    currentRankedLabel: getRankedLabel(currentRanked),
    highestRanked,
    highestRankedLabel: getRankedLabel(highestRanked),
    p11:           (bsPlayer?.brawlers ?? []).filter(b => b.power === 11).length,
    // Vrais totaux depuis brawlers-meta.json
    maxGadgets:    MAX_GADGETS,
    maxSP:         MAX_SP,
    totalCount:    TOTAL_BRAWLERS,
    maxGears:      TOTAL_BRAWLERS * 6,
    maxBuffies:    45,
    currentRankedName:  extra?.currentRankedName ?? '',
    highestRankedName:  extra?.highestRankedName ?? '',
    recordPoints:  extra?.recordPoints ?? 0,
    recordLevel:   extra?.recordLevel ?? 0,
    recordMax:     extra?.recordMax ?? getRecordMax(extra?.recordLevel ?? 0),
    ownedCount:    bsPlayer?.brawlers?.length ?? 0,
    accountCreation: extra?.accountCreation ?? null,
    winStreak:     extra?.maxWinStreak ?? 0,
    prestigeTotal: extra?.totalPrestige ?? 0,
    brawlers:      Array.isArray(bsPlayer?.brawlers) ? bsPlayer.brawlers : [],
    gadgets:       (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.gadgets?.length ?? 0), 0),
    starPowers:    (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.starPowers?.length ?? 0), 0),
    hyperCharges:  (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.hyperCharges?.length ?? 0), 0),
    gears:         (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.gears?.length ?? 0), 0),
    buffies:       (bsPlayer?.brawlers ?? []).reduce((sum, b) => sum + (b.buffies ? Object.values(b.buffies).filter(Boolean).length : 0), 0),
  };
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadLocal(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try { return await loadImage(filePath); } catch { return null; }
}

async function loadCachedRemote(cacheKey, url) {
  if (!cacheKey || !url) return null;
  try { return await getCachedOrFetch(cacheKey, url); } catch { return null; }
}

async function tryLoad(primaryLocalPath, fallbackLocalPath = null, remote = null) {
  for (const p of [primaryLocalPath, fallbackLocalPath].filter(Boolean)) {
    const img = await loadLocal(p);
    if (img) return img;
  }
  const remotes = Array.isArray(remote) ? remote : [remote].filter(Boolean);
  for (const r of remotes) {
    if (r?.cacheKey && r?.url) {
      const img = await loadCachedRemote(r.cacheKey, r.url);
      if (img) return img;
    }
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

// ── Helpers de dessin ─────────────────────────────────────────────────────────

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

function drawMiniStatChip(ctx, { x, y, w, h, img, value }) {
  drawPanel(ctx, x, y, w, h, 8, "rgba(8,4,22,0.82)", "rgba(255,255,255,0.22)");
  const iconSize = h;
  const iconY    = y - (iconSize - h) / 2;
  if (img) ctx.drawImage(img, S(x - iconSize / 2), S(iconY), S(iconSize), S(iconSize));
  const tx = x + iconSize / 2 + 5;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  const size = fitText(ctx, String(value), Math.max(20, w - iconSize / 2 - 10), 15, 900);
  ctx.font = FONT(size, 900);
  outlined(ctx, value, tx, y + h / 2, "#ffffff", "#000000", 3);
}

// ── Blocs header ──────────────────────────────────────────────────────────────

function drawIdentityBlock(ctx, data, assets, x, y, w, h) {
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

  const P_SZ  = 72; // prestige
  const WS_SZ = 62; // flamme (un peu plus petite)
  const iconY = y + h - Math.max(P_SZ, WS_SZ) - 16;

  if (assets.icPrestige) {
    ctx.drawImage(assets.icPrestige, S(textX), S(iconY), S(P_SZ), S(P_SZ));
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.font = FONT(18, 900);
    // centre visuel du shield légèrement au-dessus du centre géométrique
    outlined(ctx, String(data.prestigeTotal), textX + P_SZ / 2 - 2, iconY + P_SZ * 0.44, "#ffffff", "#000000", 4);
    ctx.textAlign = "left";
  }

  const wsIconX = textX + P_SZ + 18;
  if (assets.icWinStreak) {
    ctx.drawImage(assets.icWinStreak, S(wsIconX), S(iconY), S(WS_SZ), S(WS_SZ));
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.font = FONT(18, 900);
    // centre visuel de la flamme légèrement sous le centre géométrique
    outlined(ctx, String(data.winStreak), wsIconX + WS_SZ / 2, iconY + WS_SZ * 0.58, "#ffb15f", "#000000", 4);
    ctx.textAlign = "left";
  }
}

function drawProgressBlock(ctx, data, assets, x, y, w, h) {
  const iconSize = 58;
  const barH    = 34;
  const barX    = x - 6 + Math.round(iconSize / 2);
  const barW    = w - (barX - x) - 14;
  const textOff = Math.round(iconSize / 2) + 16;
  const line1Y  = y + Math.round(h / 2) - barH - 12;
  const line2Y  = y + Math.round(h / 2) + 17;
  const iconOff = Math.round((iconSize - barH) / 2);

  // Barre en premier, icône par-dessus
  drawProgressBar(ctx, barX, line1Y, barW, barH, data.trophies / Math.max(data.highestTrophies, 1));
  if (assets.icTrophies)
    ctx.drawImage(assets.icTrophies, S(x - 6), S(line1Y - iconOff), S(iconSize), S(iconSize));
  ctx.font = FONT(16, 900);
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  outlined(ctx, `${fmt(data.trophies)} / ${fmt(data.highestTrophies)}`, barX + textOff, line1Y + barH / 2, "#ffffff", "#000000", 3);

  drawProgressBar(ctx, barX, line2Y, barW, barH, data.recordPoints / Math.max(data.recordMax, 1));
  if (assets.icRecord)
    ctx.drawImage(assets.icRecord, S(x - 6), S(line2Y - iconOff), S(iconSize), S(iconSize));
  outlined(ctx, `${fmt(data.recordPoints)} / ${fmt(data.recordMax)}`, barX + textOff, line2Y + barH / 2, "#ffffff", "#000000", 3);
}

function drawMiniStatsBlock(ctx, data, assets, x, y, w, h) {

  const cols = 5;
  const gap = 26;
  const sidePad = 12;
  const cellW = Math.floor((w - gap * (cols - 1) - sidePad * 2) / cols);
  const cellH = 44;
  const row1Y = y + 16;
  const row2Y = row1Y + cellH + 10;
  const startX = x + sidePad;

  const accountDisplay = data.accountCreation ? String(data.accountCreation) : "—";

  const row1 = [
    { img: assets.ic3v3,      value: fmt(data.wins3v3) },
    { img: assets.icDuo,      value: fmt(data.duoWins) },
    { img: assets.icSolo,     value: fmt(data.soloWins) },
    { img: assets.icCadenas, value: `${data.ownedCount}/${data.totalCount}` },
    { img: assets.icAccount,  value: accountDisplay },
  ];

  const row2 = [
    { img: assets.curTierImg,  value: fmt(data.currentRanked) },
    { img: assets.hiTierImg,   value: fmt(data.highestRanked) },
    { img: assets.icPrestige,  value: String(data.prestigeTotal) },
    { img: assets.icWinStreak, value: String(data.winStreak) },
    { img: assets.icBuffies,   value: `${data.buffies}/${data.maxBuffies}` },
  ];

  for (let i = 0; i < cols; i += 1) {
    const cellX = startX + i * (cellW + gap);
    drawMiniStatChip(ctx, { x: cellX, y: row1Y, w: cellW, h: cellH, ...row1[i] });
    if (i < row2.length) {
      drawMiniStatChip(ctx, { x: cellX, y: row2Y, w: cellW, h: cellH, ...row2[i] });
    }
  }

  const row3 = [
    { img: assets.icGadget, value: `${data.gadgets}/${data.maxGadgets}` },
    { img: assets.icSP,     value: `${data.starPowers}/${data.maxSP}` },
    { img: assets.icHC,     value: String(data.hyperCharges) },
    { img: assets.icP11,    value: `${data.p11}/${data.ownedCount}` },
    { img: assets.icGear,   value: `${data.gears}/${data.maxGears}` },
  ];

  for (let i = 0; i < row3.length; i += 1) {
    const cellX = startX + i * (cellW + gap);
    drawMiniStatChip(ctx, { x: cellX, y: row2Y + cellH + 10, w: cellW, h: cellH, ...row3[i] });
  }
}

// ── Preload assets header ─────────────────────────────────────────────────────

async function preloadHeaderAssets(data) {
  const [
    avatar, curTierImg, hiTierImg,
    icWinStreak, icPrestige, icTrophies, icRecord,
    ic3v3, icDuo, icSolo,icCadenas, icAccount,
    icBuffies, icGadget, icSP, icHC, icP11, icGear,
  ] = await Promise.all([
    loadProfileIcon(data.iconId),
    loadRankedTieredIcon(data.currentRanked),
    data.highestRankedName
      ? loadRankedTieredIconFromName(data.highestRankedName)
      : loadRankedTieredIcon(data.highestRanked),
    loadBorderlessIcon("winstreak.png"),
    loadBorderlessIcon("prestige.png"),
    tryLoad(path.join(ICONS_DIR, "trophies.png")),
    loadRecordIcon(data.recordLevel),
    tryLoad(path.join(ICONS_DIR, "mode_3v3.png")),
    loadBorderlessIcon("duo.png"),
    loadBorderlessIcon("solo.png"),
    tryLoad(path.join(ICONS_DIR, "cadenas.png")),
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
    ic3v3, icDuo, icSolo,icCadenas, icAccount,
    icBuffies, icGadget, icSP, icHC, icP11, icGear,
  };
}

// ── Header ────────────────────────────────────────────────────────────────────

async function drawHeader(ctx, bsPlayer, extra = {}) {
  const data   = normalizeRankCardData(bsPlayer, extra);
  const assets = await preloadHeaderAssets(data);

  const headerX = MARGIN;
  const headerY = MARGIN;
  const headerW = W - MARGIN * 2;
  const headerH = 196;
  const leftW   = 430;
  const midW    = 390;
  const gap     = 12;
  const rightW  = headerW - leftW - midW - gap * 2;

  drawIdentityBlock(ctx, data, assets, headerX, headerY, leftW, headerH);
  drawProgressBlock(ctx, data, assets, headerX + leftW + gap, headerY, midW, headerH);
  drawMiniStatsBlock(ctx, data, assets, headerX + leftW + gap + midW + gap, headerY, rightW, headerH);

  return headerY + headerH + 16;
}

// ── Grille des brawlers ───────────────────────────────────────────────────────

async function drawBrawlerGrid(ctx, brawlers, startY) {
  // Brawlers possédés triés par trophées décroissants
  const ownedIds = new Set(brawlers.map(b => b.id ?? b.brawler_id));
  const ownedSorted = [...brawlers].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));

  // Brawlers non débloqués depuis brawlers-meta.json
  const unownedBrawlers = BRAWLERS_META
    .filter(b => !ownedIds.has(b.id))
    .map(b => ({ id: b.id, trophies: 0, _unowned: true }));

  const COLS   = 10;

  // Tous les brawlers : possédés d'abord, puis non débloqués
  const filled = [
    ...ownedSorted.map(b => ({ ...b, _unowned: false })),
    ...unownedBrawlers,
  ];

  // Cases grises pour compléter la dernière ligne
  const rem = filled.length % COLS;
  const padding = rem === 0 ? 0 : COLS - rem;
  const allBrawlers = [
    ...filled,
    ...Array.from({ length: padding }, () => ({ _placeholder: true })),
  ];
  const GRID_W = W - MARGIN * 2;
  const GAP    = 15;
  const CELL_W = Math.floor((GRID_W - GAP * (COLS - 1)) / COLS);
  const CELL_H = Math.round(CELL_W * 0.6);
  const ROWS   = Math.max(1, Math.ceil(allBrawlers.length / COLS));
  const GRID_H = H - startY - MARGIN;
  const ACTUAL_H = Math.min(CELL_H, Math.floor(GRID_H / ROWS));

  const assets = await Promise.all(allBrawlers.map(async (b) => {
    if (b._placeholder) return { placeholder: true };
    const id      = b.id ?? b.brawler_id;
    const trophies = b.trophies ?? 0;
    const prestige = getPrestige(trophies);
    const [portrait, badge] = await Promise.all([
      tryLoad(
        path.join(PORTRAITS_DIR, `${id}.png`),
        null,
        [
          { cacheKey: `brawlers/emoji/${id}.png`,    url: `https://cdn.brawlify.com/brawler-bs/regular/${id}.png` },
          { cacheKey: `brawlers/portrait/${id}.png`, url: `https://raw.githubusercontent.com/Brawlify/CDN/master/brawlers/portraits/${id}.png` },
        ],
      ),
      b._unowned ? Promise.resolve(null) : tryLoad(path.join(PRESTIGES_DIR, `${prestige.level}.png`)),
    ]);
    return { trophies, prestige, portrait, badge, unowned: b._unowned };
  }));

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = MARGIN + col * (CELL_W + GAP);
    const cy  = startY + row * (ACTUAL_H + GAP);

    // Case placeholder (brawler pas encore sorti)
    if (asset.placeholder) {
      const R = 12;
      ctx.globalAlpha = 0.30;
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
      ctx.fillStyle = "#1a1030";
      ctx.fill();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
      ctx.strokeStyle = "rgba(120,100,180,0.3)";
      ctx.lineWidth = S(1.5);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      continue;
    }

    const { trophies, prestige, portrait, badge, unowned } = asset;

    // Opacité réduite pour les brawlers non débloqués
    if (unowned) ctx.globalAlpha = 0.50;

    // 1. Fond assombri (pour que la bordure se distingue)
    const R = 12;
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
    ctx.fillStyle = unowned ? "#2a2040" : darkenHex(prestige.color, 45);
    ctx.fill();

    // 1b. Dégradé radial vers les bords (vignette interne)
    if (!unowned) {
      const gx = S(cx + CELL_W / 2);
      const gy = S(cy + ACTUAL_H / 2);
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, S(Math.max(CELL_W, ACTUAL_H) * 0.72));
      grad.addColorStop(0,   'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0)');
      grad.addColorStop(1,   'rgba(0,0,0,0.5)');
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 2. Emoji/portrait — taille raisonnable, légèrement décalé à gauche, clippé
    if (portrait) {
      ctx.save();
      rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
      ctx.clip();
      const iS = Math.round(ACTUAL_H * 0.82);
      const dx = cx + 3;
      const dy = cy + (ACTUAL_H - iS) / 2;
      ctx.drawImage(portrait, S(dx), S(dy), S(iS), S(iS));
      ctx.restore();
    }

    // 3. Bordure visible (couleur prestige pleine, plus épaisse)
    rrPath(ctx, cx, cy, CELL_W, ACTUAL_H, R);
    ctx.strokeStyle = unowned ? "rgba(100,80,160,0.45)" : prestige.color;
    ctx.lineWidth   = S(unowned ? 1.5 : 4);
    ctx.stroke();

    // 4. Badge prestige
    if (badge && !unowned) {
      const bdS = Math.round(CELL_W * 0.45);
      const bdX = cx + Math.round(CELL_W * 0.52);
      const bdY = cy + (ACTUAL_H - bdS) / 2;
      ctx.drawImage(badge, S(bdX), S(bdY), S(bdS), S(bdS));
    }

    // Réinitialise l'opacité
    ctx.globalAlpha = 1.0;
  }
}

// ── Génération finale ─────────────────────────────────────────────────────────

async function generateRankCard(bsPlayer, extra = {}) {
  const data   = normalizeRankCardData(bsPlayer, extra);
  const canvas = createCanvas(S(W), S(H));
  const ctx    = canvas.getContext("2d");

  const bgImg = await tryLoad(path.join(BG_DIR, "background_prestige.png"));
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

  await drawBrawlerGrid(ctx, data.brawlers, headerEndY - 10);

  ctx.font = FONT(10, 700);
  ctx.textBaseline = "bottom";
  ctx.textAlign    = "right";
  ctx.fillStyle    = "rgba(255,255,255,0.3)";
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