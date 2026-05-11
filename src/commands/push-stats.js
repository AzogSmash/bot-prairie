const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { getPlayer } = require("../lib/brawlapi");
const { fetchRntProfile } = require("../lib/rntapi");
const { getPreferredBsTag } = require("../lib/brawlAccounts");
const { supabase } = require("../lib/supabase");
const { generatePushStatsCard } = require("../modules/pushStatsCard");

const DAYS_FR   = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = ["", "jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];

// Aujourd'hui : un point par heure, label "HHh"
function buildTodayPoints(rows) {
  return rows.map(r => {
    const dt = DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris");
    return { value: r.trophies, label: dt.toFormat("HH") + "h", time: dt.toMillis() };
  });
}

// Semaine : 1 point toutes les 3h (≈ 56 pts sur 7 jours) → dots visibles, courbe lisible
function buildWeekPoints(rows) {
  return rows
    .filter(r => DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris").hour % 3 === 0)
    .map(r => {
      const dt = DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris");
      let label = "";
      if (dt.hour === 0)          label = DAYS_FR[dt.weekday];
      else if (dt.hour % 6 === 0) label = `${String(dt.hour).padStart(2, "0")}h`;
      return { value: r.trophies, label, time: dt.toMillis() };
    });
}

// Saison : daily (historique) + 1 point toutes les 6h pour les 7 derniers jours
// rows portent un flag isDaily pour distinguer les deux types
function buildSeasonPoints(rows) {
  return rows
    .filter(r => r.isDaily || DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris").hour % 6 === 0)
    .map(r => {
      const dt = DateTime.fromISO(r.snapshot_at).setZone("Europe/Paris");
      let label = "";
      if (r.isDaily || dt.hour === 0) {
        label = `${dt.day} ${MONTHS_FR[dt.month]}`;
      }
      // pas de label pour 06h/12h/18h : trop dense sur 7+ jours
      return { value: r.trophies, label, time: dt.toMillis() };
    });
}

// Ajoute la valeur courante en dernier point avec son timestamp
function appendCurrent(points, trophies, label, nowMs) {
  if (!points.length) return [{ value: trophies, label, time: nowMs }];
  const lastLabel = points[points.length - 1].label;
  return [...points, { value: trophies, label: lastLabel === label ? "" : label, time: nowMs }];
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
      const now            = DateTime.now().setZone("Europe/Paris");
      const todayStart     = now.startOf("day").toISO();
      const weekStart      = now.startOf("week").toISO();
      const sevenDaysAgo   = now.minus({ days: 7 }).toISO();

      // 1re vague : joueur + RNT + saison
      const [player, rnt, seasonRes] = await Promise.all([
        getPlayer(bsTag),
        fetchRntProfile(bsTag).catch(() => null),
        supabase.from("season_starts").select("started_at, label")
          .order("started_at", { ascending: false }).limit(1),
      ]);

      const rntData        = rnt?.result || rnt || {};
      const stats          = rntData?.stats || [];
      const seasonRow      = seasonRes.data?.[0] ?? null;
      const seasonStartDate = seasonRow?.started_at ?? now.minus({ days: 90 }).toISO();

      // 2e vague : 4 requêtes parallèles
      const [todayRes, weekRes, seasonDailyRes, seasonRecentRes] = await Promise.all([
        // Aujourd'hui : horaire depuis minuit
        supabase.from("trophies_snapshots").select("trophies, snapshot_at")
          .eq("bs_tag", bsTag).eq("type", "hourly")
          .gte("snapshot_at", todayStart)
          .order("snapshot_at", { ascending: true }),

        // Semaine : TOUS les points horaires depuis lundi
        supabase.from("trophies_snapshots").select("trophies, snapshot_at")
          .eq("bs_tag", bsTag).eq("type", "hourly")
          .gte("snapshot_at", weekStart)
          .order("snapshot_at", { ascending: true }),

        // Saison ancienne : daily avant les 7 derniers jours
        supabase.from("trophies_snapshots").select("trophies, snapshot_at")
          .eq("bs_tag", bsTag).eq("type", "daily")
          .gte("snapshot_at", seasonStartDate)
          .lt("snapshot_at", sevenDaysAgo)
          .order("snapshot_at", { ascending: true }),

        // Saison récente : horaire des 7 derniers jours
        supabase.from("trophies_snapshots").select("trophies, snapshot_at")
          .eq("bs_tag", bsTag).eq("type", "hourly")
          .gte("snapshot_at", sevenDaysAgo)
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
      const nowHLabel       = now.toFormat("HH") + "h";
      const nowDayLbl       = now.hour === 0 ? DAYS_FR[now.weekday]
        : now.hour % 6 === 0 ? `${now.toFormat("HH")}h` : "";
      const nowDateLbl      = `${now.day} ${MONTHS_FR[now.month]}`;

      // Fusion données saison : daily (plus ancien) + hourly (7 derniers jours)
      const seasonRows = [
        ...(seasonDailyRes.data ?? []).map(r => ({ ...r, isDaily: true })),
        ...(seasonRecentRes.data ?? []).map(r => ({ ...r, isDaily: false })),
      ];

      const nowMs        = now.toMillis();
      const todayPoints  = appendCurrent(buildTodayPoints(todayRes.data ?? []), currentTrophies, nowHLabel,  nowMs);
      const weekPoints   = appendCurrent(buildWeekPoints(weekRes.data ?? []),   currentTrophies, nowDayLbl,  nowMs);
      const seasonPoints = appendCurrent(buildSeasonPoints(seasonRows),          currentTrophies, nowDateLbl, nowMs);

      const buffer = await generatePushStatsCard(player, extra, {
        todayPoints,
        weekPoints,
        seasonPoints,
        seasonLabel: seasonRow?.label ?? null,
        seasonStartDate,
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
