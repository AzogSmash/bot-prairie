// src/rankedTiers.js

const TIERS = [
  { min: 0,     max: 249,   id: "58000000" }, // Bronze I
  { min: 250,   max: 499,   id: "58000001" }, // Bronze II
  { min: 500,   max: 749,   id: "58000002" }, // Bronze III
  { min: 750,   max: 999,   id: "58000003" }, // Silver I
  { min: 1000,  max: 1249,  id: "58000004" }, // Silver II
  { min: 1250,  max: 1499,  id: "58000005" }, // Silver III
  { min: 1500,  max: 1999,  id: "58000006" }, // Gold I
  { min: 2000,  max: 2499,  id: "58000007" }, // Gold II
  { min: 2500,  max: 2999,  id: "58000008" }, // Gold III
  { min: 3000,  max: 3499,  id: "58000009" }, // Diamond I
  { min: 3500,  max: 3999,  id: "58000010" }, // Diamond II
  { min: 4000,  max: 4499,  id: "58000011" }, // Diamond III
  { min: 4500,  max: 4999,  id: "58000012" }, // Mythic I
  { min: 5000,  max: 5499,  id: "58000013" }, // Mythic II
  { min: 5500,  max: 5999,  id: "58000014" }, // Mythic III
  { min: 6000,  max: 6749,  id: "58000015" }, // Legendary I
  { min: 6750,  max: 7499,  id: "58000016" }, // Legendary II
  { min: 7500,  max: 8249,  id: "58000017" }, // Legendary III
  { min: 8250,  max: 9249,  id: "58000018" }, // Masters I
  { min: 9250,  max: 10249, id: "58000019" }, // Masters II
  { min: 10250, max: 11249, id: "58000020" }, // Masters III
  { min: 11250, max: Infinity, id: "58000021" }, // Pro
];

function getRankedTierId(score = 0) {
  const tier = TIERS.find(t => score >= t.min && score <= t.max);
  return tier ? tier.id : "58000000";
}

function getRankTierFromRankedScore(score = 0) {
  if (score <= 749)   return "bronze";
  if (score <= 1499)  return "silver";
  if (score <= 2999)  return "gold";
  if (score <= 4499)  return "diamond";
  if (score <= 5999)  return "mythic";
  if (score <= 8249)  return "legendary";
  if (score <= 11249) return "masters";
  return "pro";
}

module.exports = { getRankedTierId, getRankTierFromRankedScore };