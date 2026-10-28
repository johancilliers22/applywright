/**
 * Alert execution, shared by the manual "run now" route and the background
 * scanner. One function, so the two paths can never drift.
 */
import { createHash } from "node:crypto";
import { fetchJobs } from "./lib/jobs/sources.js";
import { matchRule } from "./lib/jobs/match.js";
import { nowIso } from "./util.js";

const windowFor = (cadence) => {
  if (cadence === "weekly") return 7 * 24 * 60 * 60 * 1000;
  if (cadence === "manual") return Infinity;
  return 24 * 60 * 60 * 1000;
};

export const isDue = (alert, now = Date.now()) => {
  if (!alert.active) return false;
  const window = windowFor(alert.cadence);
  if (!Number.isFinite(window)) return false; // manual alerts only run when asked
  if (!alert.last_run_at) return true;
  const last = new Date(alert.last_run_at).getTime();
  return Number.isFinite(last) && now - last >= window;
};

/**
 * Run a set of alerts and create notifications for new matches.
 * @returns {Promise<{checked:number,matched:number,created:number,sources:Array}>}
 */
export async function runAlerts({ alerts, store, db, fetchImpl }) {
  let checked = 0;
  let matched = 0;
  let created = 0;
  const sources = [];

  for (const alert of alerts) {
    const keywords = String(alert.keywords ?? "").split(",").map((word) => word.trim()).filter(Boolean);
    const locations = String(alert.locations ?? "").split(",").map((word) => word.trim()).filter(Boolean);
    const rule = { keywords, locations, remoteOnly: Boolean(alert.remote_only), minSalary: alert.min_salary ?? null };

    try {
      const result = await fetchJobs({
        query: keywords.join(" "),
        location: locations[0] ?? "",
        remoteOnly: rule.remoteOnly,
        limit: 40,
        fetchImpl,
      });
      sources.push(...(result.errors ?? []));

      for (const job of result.jobs ?? []) {
        const dedupe_hash = job.dedupe_hash ?? createHash("sha256").update(`${job.company}|${job.title}|${job.location}`.toLowerCase()).digest("hex");
        const jobId = store.upsertJob({ ...job, dedupe_hash });
        checked += 1;
        const verdict = matchRule(rule, job);
        if (!verdict.matched) continue;
        matched += 1;
        const already = db
          .prepare("SELECT 1 AS x FROM notifications WHERE user_id = ? AND alert_id = ? AND job_id = ?")
          .get(alert.user_id, alert.id, jobId);
        if (already) continue;
        store.createNotification({
          userId: alert.user_id,
          alertId: alert.id,
          jobId,
          title: `${job.title} — ${job.company ?? "unknown company"}`,
          body: `${job.location ?? "location not stated"} · ${verdict.reasons.filter((reason) => reason.startsWith("match")).join(", ") || "your alert"}`,
        });
        created += 1;
      }
      store.updateAlert(alert.id, alert.user_id, { lastRunAt: nowIso() });
    } catch (error) {
      sources.push({ source: alert.name, message: error.message });
    }
  }

  return { checked, matched, created, sources };
}

/**
 * Background scanner. Deliberately a plain interval: one process, unref'd so it
 * never holds the loop open, and disabled with ALERTS_SCAN_MINUTES=0.
 */
export function startAlertScheduler({ store, db, config, log = console.log }) {
  const minutes = config.limits.alertScanMinutes;
  if (!minutes) return { stop() {}, enabled: false };

  const tick = async () => {
    try {
      const alerts = (await store.listActiveAlerts()).filter((alert) => isDue(alert));
      if (!alerts.length) return;
      const result = await runAlerts({ alerts, store, db });
      if (result.created) {
        log(JSON.stringify({ level: "info", event: "alerts.scan", alerts: alerts.length, ...result, sources: result.sources.length }));
      }
    } catch (error) {
      log(JSON.stringify({ level: "error", event: "alerts.scan.failed", message: error.message }));
    }
  };

  const timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  return { stop: () => clearInterval(timer), enabled: true, tick };
}
