/** Data access. Every query is prepared once and reused. */
import { statements } from "./db.js";
import { id, nowIso } from "./util.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const dayStartIso = (now = Date.now()) => new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString();
export const monthStartIso = (now = Date.now()) => {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
};

export function createStore(db) {
  const q = statements(db);

  const parseJson = (value, fallback = null) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  return {
    db,

    // ---------------------------------------------------------------- users
    createUser({ email, passwordHash, passwordSalt, name }) {
      const userId = id("u");
      q(`INSERT INTO users (id, email, pass_hash, pass_salt, name, plan, created_at)
         VALUES (?, ?, ?, ?, ?, 'free', ?)`).run(
        userId,
        email.toLowerCase(),
        passwordHash,
        passwordSalt,
        name || null,
        nowIso()
      );
      return this.userById(userId);
    },

    userById(userId) {
      return q("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").get(userId) ?? null;
    },

    userByEmail(email) {
      return q("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL").get(String(email).toLowerCase()) ?? null;
    },

    updateUserPlan(userId, plan, renewsAt = null, stripeCustomerId = null) {
      q("UPDATE users SET plan = ?, plan_renews_at = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?").run(
        plan,
        renewsAt,
        stripeCustomerId,
        userId
      );
      return this.userById(userId);
    },

    updateProfile(userId, { name }) {
      q("UPDATE users SET name = ? WHERE id = ?").run(name ?? null, userId);
      return this.userById(userId);
    },

    /** Hard delete: ON DELETE CASCADE removes sessions, cvs, apps, alerts, usage. */
    deleteUser(userId) {
      q("DELETE FROM users WHERE id = ?").run(userId);
    },

    // ------------------------------------------------------------- sessions
    createSession({ userId, userAgent, ip, days = 30 }) {
      const sessionId = id("s", 24);
      const expires = new Date(Date.now() + days * DAY_MS).toISOString();
      q("INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)").run(
        sessionId,
        userId,
        nowIso(),
        expires,
        String(userAgent ?? "").slice(0, 300),
        String(ip ?? "").slice(0, 60)
      );
      return { id: sessionId, expiresAt: expires };
    },

    sessionUser(sessionId) {
      if (!sessionId) return null;
      const row = q(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ? AND u.deleted_at IS NULL`
      ).get(sessionId, nowIso());
      return row ?? null;
    },

    deleteSession(sessionId) {
      q("DELETE FROM sessions WHERE id = ?").run(sessionId);
    },

    purgeExpiredSessions() {
      q("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
    },

    // ------------------------------------------------------------------ cvs
    createCv({ userId, name, format, text, profile, primary = false }) {
      const cvId = id("cv");
      if (primary) q("UPDATE cvs SET primary_flag = 0 WHERE user_id = ?").run(userId);
      q(`INSERT INTO cvs (id, user_id, name, format, text, profile_json, primary_flag, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        cvId,
        userId,
        name,
        format,
        text,
        JSON.stringify(profile ?? {}),
        primary ? 1 : 0,
        nowIso()
      );
      return this.cvById(cvId, userId);
    },

    cvById(cvId, userId) {
      const row = q("SELECT * FROM cvs WHERE id = ? AND user_id = ?").get(cvId, userId);
      return row ? { ...row, profile: parseJson(row.profile_json, {}) } : null;
    },

    listCvs(userId) {
      return q("SELECT * FROM cvs WHERE user_id = ? ORDER BY primary_flag DESC, created_at DESC")
        .all(userId)
        .map((row) => ({ ...row, profile: parseJson(row.profile_json, {}) }));
    },

    countCvs(userId) {
      return q("SELECT COUNT(*) AS n FROM cvs WHERE user_id = ?").get(userId).n;
    },

    updateCv(cvId, userId, { name, primary, text, profile }) {
      if (name !== undefined) q("UPDATE cvs SET name = ? WHERE id = ? AND user_id = ?").run(name, cvId, userId);
      if (text !== undefined) {
        q("UPDATE cvs SET text = ?, profile_json = ?, format = 'edited' WHERE id = ? AND user_id = ?").run(
          text,
          JSON.stringify(profile ?? {}),
          cvId,
          userId
        );
      }
      if (primary === true) {
        q("UPDATE cvs SET primary_flag = 0 WHERE user_id = ?").run(userId);
        q("UPDATE cvs SET primary_flag = 1 WHERE id = ? AND user_id = ?").run(cvId, userId);
      }
      return this.cvById(cvId, userId);
    },

    deleteCv(cvId, userId) {
      return q("DELETE FROM cvs WHERE id = ? AND user_id = ?").run(cvId, userId).changes > 0;
    },

    // ----------------------------------------------------------------- jobs
    upsertJob(job) {
      const existing = q("SELECT id FROM jobs WHERE dedupe_hash = ?").get(job.dedupe_hash);
      if (existing) {
        q("UPDATE jobs SET fetched_at = ?, description = COALESCE(?, description), salary_min = COALESCE(?, salary_min), salary_max = COALESCE(?, salary_max) WHERE id = ?").run(
          nowIso(),
          job.description ?? null,
          job.salary_min ?? null,
          job.salary_max ?? null,
          existing.id
        );
        return existing.id;
      }
      const jobId = job.id ?? id("j");
      q(`INSERT INTO jobs (id, source, external_id, title, company, location, remote, salary_min, salary_max,
                           currency, url, description, posted_at, fetched_at, tags_json, dedupe_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        jobId,
        job.source,
        job.external_id ?? null,
        job.title,
        job.company ?? null,
        job.location ?? null,
        job.remote ? 1 : 0,
        job.salary_min ?? null,
        job.salary_max ?? null,
        job.currency ?? null,
        job.url ?? null,
        job.description ?? null,
        job.posted_at ?? null,
        nowIso(),
        JSON.stringify(job.tags ?? []),
        job.dedupe_hash
      );
      return jobId;
    },

    jobById(jobId) {
      const row = q("SELECT * FROM jobs WHERE id = ?").get(jobId);
      return row ? { ...row, tags: parseJson(row.tags_json, []) } : null;
    },

    searchJobs({ query = "", location = "", remoteOnly = false, limit = 60 } = {}) {
      const clauses = [];
      const params = [];
      if (query) {
        clauses.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)");
        const like = `%${query.toLowerCase()}%`;
        params.push(like, like, like);
      }
      if (location) {
        clauses.push("LOWER(COALESCE(location,'')) LIKE ?");
        params.push(`%${location.toLowerCase()}%`);
      }
      if (remoteOnly) clauses.push("remote = 1");
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = q(`SELECT * FROM jobs ${where} ORDER BY COALESCE(posted_at, fetched_at) DESC LIMIT ?`)
        .all(...params, limit);
      return rows.map((row) => ({ ...row, tags: parseJson(row.tags_json, []) }));
    },

    recentJobs(limit = 20) {
      return q("SELECT * FROM jobs ORDER BY fetched_at DESC LIMIT ?")
        .all(limit)
        .map((row) => ({ ...row, tags: parseJson(row.tags_json, []) }));
    },

    countJobs() {
      return q("SELECT COUNT(*) AS n FROM jobs").get().n;
    },

    pruneJobs(keep = 20_000) {
      q("DELETE FROM jobs WHERE id NOT IN (SELECT id FROM jobs ORDER BY fetched_at DESC LIMIT ?)").run(keep);
    },

    // -------------------------------------------------------------- reports
    createReport({ userId, cvId, jobId, jobTitle, score, report }) {
      const reportId = id("r");
      q(`INSERT INTO reports (id, user_id, cv_id, job_id, job_title, score, report_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        reportId,
        userId,
        cvId,
        jobId ?? null,
        jobTitle ?? null,
        Math.round(score),
        JSON.stringify(report),
        nowIso()
      );
      return { id: reportId, ...report };
    },

    listReports(userId, limit = 20) {
      return q("SELECT id, cv_id, job_id, job_title, score, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(
        userId,
        limit
      );
    },

    // --------------------------------------------------------- applications
    createApplication({ userId, jobId, cvId, title, company, url, status, score, pack }) {
      const appId = id("a");
      const at = nowIso();
      q(`INSERT INTO applications (id, user_id, job_id, cv_id, title, company, url, status, score, pack_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        appId,
        userId,
        jobId ?? null,
        cvId,
        title,
        company ?? null,
        url ?? null,
        status ?? "pack_ready",
        score ?? null,
        JSON.stringify(pack),
        at,
        at
      );
      return this.applicationById(appId, userId);
    },

    applicationById(appId, userId) {
      const row = q("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(appId, userId);
      return row ? { ...row, pack: parseJson(row.pack_json, {}) } : null;
    },

    listApplications(userId, limit = 100) {
      return q("SELECT * FROM applications WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?")
        .all(userId, limit)
        .map((row) => ({ ...row, pack: parseJson(row.pack_json, {}) }));
    },

    updateApplication(appId, userId, { status, notes, pack }) {
      const current = q("SELECT status, pack_json FROM applications WHERE id = ? AND user_id = ?").get(appId, userId);
      if (!current) return null;
      const nextStatus = status ?? current.status;
      const appliedAt = nextStatus === "submitted" ? nowIso() : null;
      q("UPDATE applications SET status = ?, notes = COALESCE(?, notes), pack_json = COALESCE(?, pack_json), updated_at = ?, applied_at = COALESCE(?, applied_at) WHERE id = ? AND user_id = ?").run(
        nextStatus,
        notes ?? null,
        pack ? JSON.stringify(pack) : null,
        nowIso(),
        appliedAt,
        appId,
        userId
      );
      return this.applicationById(appId, userId);
    },

    deleteApplication(appId, userId) {
      return q("DELETE FROM applications WHERE id = ? AND user_id = ?").run(appId, userId).changes > 0;
    },

    countApplications(userId) {
      return q("SELECT COUNT(*) AS n FROM applications WHERE user_id = ?").get(userId).n;
    },

    // ---------------------------------------------------------------- alerts
    createAlert({ userId, name, keywords, locations, remoteOnly, minSalary, cadence }) {
      const alertId = id("al");
      q(`INSERT INTO alerts (id, user_id, name, keywords, locations, remote_only, min_salary, cadence, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(
        alertId,
        userId,
        name,
        keywords,
        locations ?? null,
        remoteOnly ? 1 : 0,
        minSalary ?? null,
        cadence ?? "daily",
        nowIso()
      );
      return this.alertById(alertId, userId);
    },

    alertById(alertId, userId) {
      return q("SELECT * FROM alerts WHERE id = ? AND user_id = ?").get(alertId, userId) ?? null;
    },

    listAlerts(userId) {
      return q("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    },

    listActiveAlerts() {
      return q("SELECT * FROM alerts WHERE active = 1").all();
    },

    updateAlert(alertId, userId, patch) {
      const current = q("SELECT * FROM alerts WHERE id = ? AND user_id = ?").get(alertId, userId);
      if (!current) return null;
      const next = {
        name: patch.name ?? current.name,
        keywords: patch.keywords ?? current.keywords,
        locations: patch.locations ?? current.locations,
        remote_only: patch.remoteOnly === undefined ? current.remote_only : patch.remoteOnly ? 1 : 0,
        min_salary: patch.minSalary === undefined ? current.min_salary : patch.minSalary,
        cadence: patch.cadence ?? current.cadence,
        active: patch.active === undefined ? current.active : patch.active ? 1 : 0,
        last_run_at: patch.lastRunAt ?? current.last_run_at,
      };
      q(`UPDATE alerts SET name = ?, keywords = ?, locations = ?, remote_only = ?, min_salary = ?,
                          cadence = ?, active = ?, last_run_at = ? WHERE id = ? AND user_id = ?`).run(
        next.name,
        next.keywords,
        next.locations,
        next.remote_only,
        next.min_salary,
        next.cadence,
        next.active,
        next.last_run_at,
        alertId,
        userId
      );
      return this.alertById(alertId, userId);
    },

    deleteAlert(alertId, userId) {
      return q("DELETE FROM alerts WHERE id = ? AND user_id = ?").run(alertId, userId).changes > 0;
    },

    // --------------------------------------------------------- notifications
    createNotification({ userId, alertId, jobId, title, body }) {
      const notificationId = id("n");
      q("INSERT INTO notifications (id, user_id, alert_id, job_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        notificationId,
        userId,
        alertId ?? null,
        jobId ?? null,
        title,
        body ?? null,
        nowIso()
      );
      return notificationId;
    },

    listNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
      const sql = `SELECT * FROM notifications WHERE user_id = ?${unreadOnly ? " AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT ?`;
      return q(sql).all(userId, limit);
    },

    countUnread(userId) {
      return q("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId).n;
    },

    markNotificationRead(notificationId, userId) {
      return q("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), notificationId, userId).changes > 0;
    },

    // ----------------------------------------------------------------- usage
    recordUsage(userId, feature, amount = 1) {
      q("INSERT INTO usage (id, user_id, feature, amount, at) VALUES (?, ?, ?, ?, ?)").run(
        id("us"),
        userId,
        feature,
        amount,
        nowIso()
      );
    },

    countUsage(userId, feature, sinceIso, untilIso = null) {
      const row = untilIso
        ? q("SELECT COALESCE(SUM(amount),0) AS n FROM usage WHERE user_id = ? AND feature = ? AND at >= ? AND at < ?").get(
            userId,
            feature,
            sinceIso,
            untilIso
          )
        : q("SELECT COALESCE(SUM(amount),0) AS n FROM usage WHERE user_id = ? AND feature = ? AND at >= ?").get(
            userId,
            feature,
            sinceIso
          );
      return row?.n ?? 0;
    },

    // -------------------------------------------------------------- settings
    getSettings(userId) {
      const row = q("SELECT json FROM settings WHERE user_id = ?").get(userId);
      return row ? parseJson(row.json, {}) : {};
    },

    putSettings(userId, json) {
      q("INSERT INTO settings (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json").run(
        userId,
        JSON.stringify(json ?? {})
      );
      return json ?? {};
    },

    // -------------------------------------------------------- stripe events
    /**
     * Record one webhook delivery by event id. `inserted: false` means the id was
     * already there — a replay — and the caller must change nothing. The primary
     * key decides, not a read-then-write, so two deliveries racing each other
     * cannot both apply the same event.
     */
    recordStripeEvent(eventId, type = null) {
      const result = q("INSERT OR IGNORE INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)").run(
        eventId,
        type ?? null,
        nowIso()
      );
      return { inserted: result.changes === 1 };
    },

    hasStripeEvent(eventId) {
      return Boolean(q("SELECT 1 AS present FROM stripe_events WHERE id = ?").get(eventId));
    },

    // ---------------------------------------------------------------- export
    exportUser(userId) {
      const user = this.userById(userId);
      if (!user) return null;
      return {
        exportedAt: nowIso(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          createdAt: user.created_at,
        },
        cvs: this.listCvs(userId).map((cv) => ({
          id: cv.id,
          name: cv.name,
          format: cv.format,
          text: cv.text,
          primary: Boolean(cv.primary_flag),
          createdAt: cv.created_at,
        })),
        reports: this.listReports(userId, 1000),
        applications: this.listApplications(userId, 1000),
        alerts: this.listAlerts(userId),
        notifications: this.listNotifications(userId, { limit: 1000 }),
        usage: q("SELECT feature, amount, at FROM usage WHERE user_id = ? ORDER BY at").all(userId),
        settings: this.getSettings(userId),
      };
    },
  };
}
