const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { getPlayer } = require("../lib/brawlapi");
const { fetchRntProfile } = require("../lib/rntapi");
const { getPreferredBsTag } = require("../lib/brawlAccounts");
const { supabase } = require("../lib/supabase");
const { generatePushStatsCard } = require("../modules/pushStatsCard");

const DAYS_FR = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function buildTodayPoints(rows) {
  return rows.map(r => ({
    value: r.trophies,
    label: DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris").toFormat("HH") + "h",
  }));
}

function buildWeekPoints(rows) {
  // Un point par jour (dernier snapshot horaire de chaque jour)
  const days = new Map();
  for (const r of rows) {
    const day = DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris").toISODate();
    days.set(day, r.trophies); // écrasé par le plus récent (ordre ASC)
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, trophies]) => ({
      value:  trophies,
      label:  DAYS_FR[DateTime.fromISO(date).setZone("Europe/Paris").weekday],
    }));
}

function buildSeasonPoints(rows) {
  return rows.map(r => ({
    value: r.trophies,
    label: DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris").toFormat("dd/MM"),
  }));
}

// Ajoute la valeur actuelle comme dernier point si différente
function appendCurrent(points, trophies, label) {
  if (!points.length) return [{ value: trophies, label }];
  if (points[points.length - 1].label === label) {
    points[points.length - 1].value = trophies; // mise à jour
    return points;
  }
  return [...points, { value: trophies, label }];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("push-stats")
    .setDescription("Affiche l'évolution de tes trophées (aujourd'hui, semaine, saison)")
    .addUserOption(o =>
      o.setName("membre")
        .setDescription("Le membre (toi par défaut)")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("membre") || interaction.user;
    const bsTag  = await getPreferredBsTag(target.id);

    if (!bsTag) {
      return interaction.editReply({
        content: `❌ **${target.username}** n'a pas encore lié son compte BS.\nUtilise \`/lier #TAG\` pour commencer !`,
      });
    }

    try {
      const now       = DateTime.now().setZone("Europe/Paris");
      const todayStart = now.startOf("day").toISO();
      const weekStart  = now.startOf("week").toISO();

      // 1re vague : joueur + RNT + saison en cours (parallèle)
      const [player, rnt, seasonRes] = await Promise.all([
        getPlayer(bsTag),
        fetchRntProfile(bsTag).catch(() => null),
        supabase
          .from("season_starts")
          .select("started_at, label")
          .order("started_at", { ascending: false })
          .limit(1),
      ]);

      const rntData   = rnt?.result || rnt || {};
      const stats     = rntData?.stats || [];
      const seasonRow = seasonRes.data?.[0] ?? null;
      const seasonStartDate = seasonRow?.started_at
        ?? now.minus({ days: 90 }).toISO();

      // 2e vague : snapshots (parallèle)
      const [todayRes, weekRes, seasonDataRes] = await Promise.all([
        supabase
          .from("trophies_snapshots")
          .select("trophies, snapshot_at")
          .eq("bs_tag", bsTag)
          .eq("type", "hourly")
          .gte("snapshot_at", todayStart)
          .order("snapshot_at", { ascending: true }),
        supabase
          .from("trophies_snapshots")
          .select("trophies, snapshot_at")
          .eq("bs_tag", bsTag)
          .eq("type", "hourly")
          .gte("snapshot_at", weekStart)
          .order("snapshot_at", { ascending: true }),
        supabase
          .from("trophies_snapshots")
          .select("trophies, snapshot_at")
          .eq("bs_tag", bsTag)
          .eq("type", "daily")
          .gte("snapshot_at", seasonStartDate)
          .order("snapshot_at", { ascending: true }),
      ]);

      const extra = {
        currentRankedPts:  stats.find(s => s.id === 24)?.value ?? 0,
        currentRankedName: player.rankedRankName ?? "",
        highestRankedPts:  stats.find(s => s.id === 25)?.value ?? 0,
        highestRankedName: player.highestAllTimeRankedRankName ?? "",
        recordPoints:      stats.find(s => s.id === 31)?.value ?? 0,
        recordLevel:       stats.find(s => s.id === 32)?.value ?? 0,
        accountCreation:   stats.find(s => s.id === 27)?.value ?? null,
        maxWinStreak:      rntData.max_winstreak ?? 0,
        totalPrestige:     player.totalPrestigeLevel ?? 0,
      };

      const currentTrophies = player.trophies ?? 0;
      const nowHLabel  = now.toFormat("HH") + "h";
      const nowDayLbl  = DAYS_FR[now.weekday];
      const nowDateLbl = now.toFormat("dd/MM");

      const todayPoints  = appendCurrent(buildTodayPoints(todayRes.data ?? []),  currentTrophies, nowHLabel);
      const weekPoints   = appendCurrent(buildWeekPoints(weekRes.data ?? []),     currentTrophies, nowDayLbl);
      const seasonPoints = appendCurrent(buildSeasonPoints(seasonDataRes.data ?? []), currentTrophies, nowDateLbl);

      const buffer = await generatePushStatsCard(player, extra, {
        todayPoints,
        weekPoints,
        seasonPoints,
        seasonLabel: seasonRow?.label ?? null,
      });

      await interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "push-stats.png" })],
      });

    } catch (err) {
      console.error("[PushStats]", err);
      await interaction.editReply({ content: `❌ Erreur lors de la génération : ${err.message}` });
    }
  },
};
