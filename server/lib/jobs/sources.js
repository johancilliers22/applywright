/**
 * Job sources for Applywright's feed: Arbeitnow, Remotive and Remote OK.
 *
 * Everything here is deterministic. The same payloads always produce the same
 * jobs, in the same order, with the same hashes — the store dedupes on
 * `dedupe_hash`, and tests compare whole result objects.
 *
 * There is no clock in this module: `fetched_at` is set by the store on insert,
 * not here. `posted_at` is only ever derived from a timestamp the source states.
 *
 * Never throws: a source that fails is reported in `errors` and the others still
 * contribute. What we cannot do honestly (a model, an annual figure for an
 * hourly rate, a location the posting does not state) we leave null and say so
 * in NOTES-sources.md.
 */
import { Buffer } from "node:buffer";
import { STOPWORDS, sha256, tokenize } from "../text.js";

/** Per-source request budget. Slow boards are dropped, not waited on. */
const SOURCE_TIMEOUT_MS = 6_000;

/** `jobs.description` is TEXT; keep it useful but bounded. */
const MAX_DESCRIPTION = 8_000;

/** Long enough for a real posting title, short enough to reject junk payloads. */
const MAX_SHORT_FIELD = 300;
const MAX_URL = 2_000;

/** Total jobs returned when the caller does not ask for a number, and the ceiling. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** A query is a filter, not a paragraph. */
const MAX_QUERY_TOKENS = 12;

/** Annual salaries below this are not annual salaries. */
const MIN_ANNUAL_SALARY = 1_000;
const MAX_ANNUAL_SALARY = 10_000_000;

/**
 * Identifies the client to the boards. Remote OK and Remotive both state that
 * they suspend access for vague or anonymous traffic; the URL is a placeholder
 * until the Lead has a real contact page.
 */
const USER_AGENT = "Applywright/0.1 (job search workspace; +https://applywright.example)";

const REQUEST_HEADERS = Object.freeze({
  "user-agent": USER_AGENT,
  accept: "application/json",
});

/** Raised for anything that makes one source unusable. Keeps messages specific. */
class SourceError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SourceError";
  }
}

// ---------------------------------------------------------------------------
// Small value helpers
// ---------------------------------------------------------------------------

function asString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Collapse runs of whitespace, normalise line endings and exotic spaces. */
function collapse(value) {
  return asString(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(value, max) {
  const text = asString(value);
  return text.length > max ? text.slice(0, max).replace(/\s+$/, "") : text;
}

/**
 * Reverse the "UTF-8 bytes read as Latin-1" damage some boards emit
 * ("company\u00e2\u0080\u0099s"). Only applied when the string is pure Latin-1,
 * which is the only case where the round trip is lossless, and abandoned if the
 * round trip produces replacement characters.
 */
const MOJIBAKE = /[\u00c2-\u00f4][\u0080-\u00bf]/;

function repairMojibake(value) {
  const text = asString(value);
  if (!MOJIBAKE.test(text)) return text;
  if (!/^[\u0000-\u00ff]*$/.test(text)) return text;
  const repaired = Buffer.from(text, "latin1").toString("utf8");
  return repaired.includes("\uFFFD") ? text : repaired;
}

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  bull: "\u2022",
  euro: "\u20ac",
  gt: ">",
  hellip: "\u2026",
  laquo: "\u00ab",
  ldquo: "\u201c",
  lsquo: "\u2018",
  lt: "<",
  mdash: "\u2014",
  nbsp: " ",
  ndash: "\u2013",
  pound: "\u00a3",
  quot: '"',
  raquo: "\u00bb",
  rdquo: "\u201d",
  rsquo: "\u2019",
  times: "\u00d7",
});

function decodeEntities(value) {
  return asString(value).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      const valid = Number.isFinite(code) && code > 0 && code <= 0x10ffff;
      return valid ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

const HTML_BLOCK = /<\s*\/?\s*(?:p|div|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|blockquote|table|br)\b[^>]*>/gi;
const HTML_ANY = /<[^>]*>/g;

/**
 * Job descriptions arrive as HTML, sometimes escaped twice (`&amp;lt;p&amp;gt;`).
 * Two rounds of strip-then-decode turn both cases into plain text, which is what
 * the score and tailor modules read.
 */
function htmlToText(value) {
  let text = asString(value);
  if (!text) return "";
  text = text.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ");
  for (let round = 0; round < 2; round += 1) {
    text = text.replace(HTML_BLOCK, "\n").replace(HTML_ANY, " ");
    text = decodeEntities(text);
  }
  return collapse(text);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MAX_TIMESTAMP_MS = 4_102_444_800_000; // 2100-01-01T00:00:00Z

function isoFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMESTAMP_MS) return null;
  return new Date(ms).toISOString();
}

function isoFromEpochSeconds(value) {
  const seconds = typeof value === "number" ? value : Number.parseFloat(asString(value));
  if (!Number.isFinite(seconds)) return null;
  return isoFromMs(seconds * 1000);
}

/** A compact ISO 8601 stamp with no zone, e.g. Remotive's "2026-10-22T18:40:19". */
const ZONELESS_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function isoFromDateString(value) {
  const text = collapse(value);
  if (!text) return null;
  // Without a zone, `Date.parse` reads the host's local time — that would make
  // the output depend on where the server runs. Read zoneless stamps as UTC.
  const parsed = Date.parse(ZONELESS_ISO.test(text) ? `${text}Z` : text);
  return isoFromMs(parsed);
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

/**
 * Rates that are not annual. "Per annum", "a year" and "annually" are annual and
 * must not appear here, or honest yearly figures would be thrown away.
 */
const NON_ANNUAL_PERIOD =
  /(?:per|\/|a)\s*(?:hour|hr|day|week|month|task|project)\b|\b(?:hourly|daily|weekly|monthly)\b|\bp\/?h\b/i;

function detectCurrency(text) {
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  if (/\bUSD\b/i.test(text)) return "USD";
  if (/\$/.test(text)) return "USD";
  return null;
}

/** "35,000" is thousands; "35,3" is a decimal comma; "1,234,567" is thousands. */
function toAmount(raw, suffix) {
  let digits = raw;
  if (/^\d{1,3}(?:,\d{3})+$/.test(digits)) digits = digits.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(",", ".");
  else digits = digits.replace(/,/g, "");
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = suffix === "k" || suffix === "K" ? 1_000 : suffix === "m" || suffix === "M" ? 1_000_000 : 1;
  return Math.round(value * factor);
}

/**
 * Parse a free-text salary line into integers.
 * Hourly, daily and monthly rates are deliberately dropped rather than
 * annualised: turning "€25/hour" into a yearly figure would invent numbers.
 */
function parseSalaryText(value) {
  const empty = { salary_min: null, salary_max: null, currency: null };
  const text = collapse(value);
  if (!text) return empty;
  if (NON_ANNUAL_PERIOD.test(text)) return empty;

  const amounts = [];
  const pattern = /(\d[\d.,]*)\s*([kKmM])?/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const amount = toAmount(match[1], match[2]);
    if (amount !== null) amounts.push(amount);
    match = pattern.exec(text);
  }
  if (!amounts.length) return empty;
  if (amounts.some((amount) => amount < MIN_ANNUAL_SALARY || amount > MAX_ANNUAL_SALARY)) return empty;

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { salary_min: min, salary_max: max, currency: detectCurrency(text) };
}

// ---------------------------------------------------------------------------
// Query matching
// ---------------------------------------------------------------------------

/**
 * Query words, minus stopwords ("developer in london" should not require "in").
 * The shared list also carries trade words such as "team" and "lead", so a query
 * made only of those falls back to the words actually typed — "team lead" would
 * otherwise filter nothing at all.
 */
function queryTokens(query) {
  const raw = Array.isArray(query) ? query.join(" ") : asString(query);
  const typed = tokenize(raw);
  const meaningful = typed.filter((token) => !STOPWORDS.has(token));
  const chosen = meaningful.length ? meaningful : typed;
  return [...new Set(chosen)].slice(0, MAX_QUERY_TOKENS);
}

function jobTokens(job) {
  const tags = asString(job.tags_json);
  return new Set(tokenize(`${job.title} ${job.company ?? ""} ${job.location ?? ""} ${tags} ${job.description}`));
}

/** Every query token must appear somewhere in the posting (AND, not OR). */
function matchesQuery(job, tokens) {
  if (!tokens.length) return true;
  const haystack = jobTokens(job);
  return tokens.every((token) => haystack.has(token));
}

// ---------------------------------------------------------------------------
// Job construction
// ---------------------------------------------------------------------------

function fold(value) {
  return asString(value).toLowerCase().replace(/\s+/g, " ").trim();
}

/** SPEC §5: sha256 of lowercased company|title|location. */
function jobHash(company, title, location) {
  return sha256(`${fold(company)}|${fold(title)}|${fold(location)}`);
}

function normaliseTags(values) {
  const seen = new Set();
  for (const value of values.flat(Infinity)) {
    const tag = collapse(value).toLowerCase();
    if (tag && tag.length <= 60) seen.add(tag);
  }
  // Default sort is code-unit order: deterministic, unlike localeCompare.
  return [...seen].sort();
}

function httpUrl(value) {
  const text = collapse(value);
  return /^https?:\/\/\S+$/i.test(text) ? clip(text, MAX_URL) : null;
}

function optionalAmount(value) {
  const amount = typeof value === "number" ? value : Number.parseFloat(asString(value));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

/**
 * Build one Job row (§3). Returns null when the row has no title, because the
 * column is NOT NULL and a posting without a title is not worth showing.
 */
function makeJob(fields) {
  const title = clip(collapse(fields.title), MAX_SHORT_FIELD);
  if (!title) return null;

  const company = clip(collapse(fields.company), MAX_SHORT_FIELD) || null;
  const location = clip(collapse(fields.location), MAX_SHORT_FIELD);
  const description = clip(collapse(fields.description), MAX_DESCRIPTION);
  const tags = normaliseTags(fields.tags ?? []);

  let salaryMin = Number.isInteger(fields.salary_min) ? fields.salary_min : null;
  let salaryMax = Number.isInteger(fields.salary_max) ? fields.salary_max : null;
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    [salaryMin, salaryMax] = [salaryMax, salaryMin];
  }

  return {
    source: fields.source,
    external_id: clip(collapse(fields.external_id), MAX_URL) || null,
    title,
    company,
    location,
    remote: fields.remote ? 1 : 0,
    salary_min: salaryMin,
    salary_max: salaryMax,
    currency: salaryMin === null && salaryMax === null ? null : fields.currency ?? null,
    url: httpUrl(fields.url),
    description,
    posted_at: fields.posted_at ?? null,
    // The column is `tags_json`; the array is here as well because the store
    // reads `job.tags` when it writes that column (see NOTES).
    tags,
    tags_json: JSON.stringify(tags),
    dedupe_hash: jobHash(company, title, location),
  };
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

/**
 * Arbeitnow: `{ data: [{ slug, company_name, title, description, remote, url,
 * tags, job_types, location, created_at }] }`. Descriptions are escaped HTML and
 * there is no salary field anywhere in the payload.
 */
export function normalizeArbeitnow(payload, query = "") {
  const rows = asArray(payload?.data);
  const tokens = queryTokens(query);
  const jobs = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const job = makeJob({
      source: "arbeitnow",
      external_id: row.slug || row.url,
      title: repairMojibake(row.title),
      company: repairMojibake(row.company_name),
      location: repairMojibake(row.location),
      // The board's own flag is authoritative; "Remote, OR" is a real place.
      remote: row.remote === true || row.remote === 1 || row.remote === "true",
      salary_min: null,
      salary_max: null,
      currency: null,
      url: row.url,
      description: htmlToText(repairMojibake(row.description)),
      posted_at: isoFromEpochSeconds(row.created_at),
      tags: [...asArray(row.tags), ...asArray(row.job_types)],
    });
    if (job && matchesQuery(job, tokens)) jobs.push(job);
  }
  return jobs;
}

/**
 * Remotive: `{ jobs: [{ id, url, title, company_name, category, tags, job_type,
 * publication_date, candidate_required_location, salary, description }] }`.
 * Every listing is remote (that is the whole board), and `salary` is free text.
 */
export function normalizeRemotive(payload, query = "") {
  const rows = asArray(payload?.jobs);
  const tokens = queryTokens(query);
  const jobs = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const job = makeJob({
      source: "remotive",
      external_id: row.id === null || row.id === undefined ? row.url : String(row.id),
      title: repairMojibake(row.title),
      company: repairMojibake(row.company_name),
      location: repairMojibake(row.candidate_required_location),
      remote: true,
      ...parseSalaryText(row.salary),
      url: row.url,
      description: htmlToText(repairMojibake(row.description)),
      posted_at: isoFromDateString(row.publication_date),
      tags: [...asArray(row.tags), row.job_type],
    });
    if (job && matchesQuery(job, tokens)) jobs.push(job);
  }
  return jobs;
}

/**
 * Remote OK: a bare array whose first element is a legal-notice object
 * (`{ last_updated, legal }`) with no posting fields. Rows use `position` for the
 * title, a string `id`, and `salary_min`/`salary_max` in whole US dollars where
 * 0 means "not stated". Every listing is remote.
 */
export function normalizeRemoteok(payload, query = "") {
  const rows = asArray(payload);
  const tokens = queryTokens(query);
  const jobs = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    // The legal notice has no position; skipping on that drops it and any junk.
    if (!asString(row.position)) continue;

    const salaryMin = optionalAmount(row.salary_min);
    const salaryMax = optionalAmount(row.salary_max);
    const job = makeJob({
      source: "remoteok",
      external_id: row.id ?? row.slug,
      title: repairMojibake(row.position),
      company: repairMojibake(row.company),
      location: repairMojibake(row.location),
      remote: true,
      // The API states no currency; its figures are US dollars on the site.
      salary_min: salaryMin,
      salary_max: salaryMax,
      currency: salaryMin === null && salaryMax === null ? null : "USD",
      url: row.url || row.apply_url,
      description: htmlToText(repairMojibake(row.description)),
      posted_at: isoFromDateString(row.date) ?? isoFromEpochSeconds(row.epoch),
      tags: asArray(row.tags),
    });
    if (job && matchesQuery(job, tokens)) jobs.push(job);
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// Source registry
// ---------------------------------------------------------------------------

function hasDataArray(payload) {
  return Array.isArray(payload?.data);
}

function hasJobsArray(payload) {
  return Array.isArray(payload?.jobs);
}

function hasRowArray(payload) {
  return Array.isArray(payload);
}

/**
 * The three boards we read, in priority order. `url` is the endpoint exactly as
 * SPEC §5 records it; `requestUrl` is what we actually request.
 * Remote OK and Remotive both require the listing to be attributed and linked
 * back to them, so each entry carries its `attribution` line for the UI.
 */
export const SOURCES = Object.freeze({
  arbeitnow: Object.freeze({
    id: "arbeitnow",
    label: "Arbeitnow",
    url: "https://www.arbeitnow.com/api/job-board-api",
    requestUrl: () => "https://www.arbeitnow.com/api/job-board-api",
    attribution: "Listings from Arbeitnow; link back to the original posting.",
    expect: hasDataArray,
    normalize: normalizeArbeitnow,
  }),
  remotive: Object.freeze({
    id: "remotive",
    label: "Remotive",
    url: "https://remotive.com/api/remote-jobs?limit=50",
    // Remotive asks for at most a handful of requests a day, so one page of 50.
    requestUrl: () => "https://remotive.com/api/remote-jobs?limit=50",
    attribution: "Listings from Remotive; mention Remotive as the source and link to the original posting.",
    expect: hasJobsArray,
    normalize: normalizeRemotive,
  }),
  remoteok: Object.freeze({
    id: "remoteok",
    label: "Remote OK",
    url: "https://remoteok.com/api",
    requestUrl: () => "https://remoteok.com/api",
    attribution: "Listings from Remote OK; mention Remote OK as the source and link back to the original posting.",
    expect: hasRowArray,
    normalize: normalizeRemoteok,
  }),
});

const SOURCE_ENTRIES = Object.values(SOURCES);
const SOURCE_RANK = new Map(SOURCE_ENTRIES.map((entry, index) => [entry.id, index]));

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function timeoutReason(label) {
  return `${label} did not respond within ${SOURCE_TIMEOUT_MS / 1000} seconds.`;
}

/**
 * One request per source: caller cancellation and the 6s budget are combined, so
 * whichever fires first aborts the request. The timeout flag tells the two apart
 * in the error message.
 */
async function requestPayload(entry, { fetchFn, signal }) {
  const timeoutSignal = AbortSignal.timeout(SOURCE_TIMEOUT_MS);
  let timedOut = false;
  timeoutSignal.addEventListener("abort", () => { timedOut = true; }, { once: true });

  const abortSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response;
  try {
    response = await fetchFn(entry.requestUrl(), { headers: { ...REQUEST_HEADERS }, signal: abortSignal });
  } catch (error) {
    if (timedOut) throw new SourceError(timeoutReason(entry.label), { cause: error });
    if (signal?.aborted) throw new SourceError(`${entry.label} request was cancelled.`, { cause: error });
    throw new SourceError(`${entry.label} request failed (${error?.message ?? "unknown error"}).`, { cause: error });
  }

  const status = typeof response?.status === "number" ? response.status : 200;
  const ok = typeof response?.ok === "boolean" ? response.ok : status >= 200 && status < 300;
  if (!ok) {
    const text = collapse(response?.statusText);
    throw new SourceError(`${entry.label} responded ${status}${text ? ` ${text}` : ""}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new SourceError(`${entry.label} returned a response that is not valid JSON.`, { cause: error });
  }

  if (!entry.expect(payload)) {
    throw new SourceError(`${entry.label} returned an unexpected response shape (no job list).`);
  }
  return payload;
}

function messageFor(entry, error) {
  if (error instanceof SourceError) return error.message;
  return `${entry.label} returned data that could not be read (${error?.message ?? "unknown error"}).`;
}

function normaliseLimit(value) {
  const amount = typeof value === "number" ? value : Number.parseFloat(asString(value));
  if (!Number.isFinite(amount) || amount < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(amount), MAX_LIMIT);
}

function wantedRemote(remoteOnly) {
  return remoteOnly === true || remoteOnly === 1 || remoteOnly === "1" || remoteOnly === "true";
}

/**
 * A posting with no stated location passes a location search only when the
 * caller is filtering for remote work — Remote OK and many Remotive listings
 * never state a place, and "remote" is the answer to "where".
 */
function matchesLocation(job, location, remoteOnly) {
  const needle = collapse(location).toLowerCase();
  if (!needle) return true;
  const haystack = collapse(job.location).toLowerCase();
  if (!haystack) return remoteOnly;
  return haystack.includes(needle);
}

/** More detail wins when two boards describe the same posting. */
function richness(job) {
  return (
    job.description.length +
    (job.salary_min !== null || job.salary_max !== null ? 1_000 : 0) +
    (job.url ? 500 : 0) +
    (job.posted_at ? 100 : 0)
  );
}

/** Newest first; then source priority; then hash so ties never flip. */
function compareJobs(a, b) {
  if (a.posted_at !== b.posted_at) {
    if (!a.posted_at) return 1;
    if (!b.posted_at) return -1;
    return a.posted_at < b.posted_at ? 1 : -1;
  }
  const rankA = SOURCE_RANK.get(a.source) ?? Number.MAX_SAFE_INTEGER;
  const rankB = SOURCE_RANK.get(b.source) ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  if (a.dedupe_hash === b.dedupe_hash) return 0;
  return a.dedupe_hash < b.dedupe_hash ? -1 : 1;
}

/**
 * Read every source, normalise, filter, dedupe and cap.
 *
 * @param {object} [options]
 * @param {string} [options.query] words that must all appear in the posting
 * @param {string} [options.location] case-insensitive location substring
 * @param {boolean} [options.remoteOnly] keep only remote postings
 * @param {number} [options.limit] maximum jobs returned (default 50, ceiling 200)
 * @param {AbortSignal} [options.signal] caller cancellation, combined with the 6s budget
 * @param {Function} [options.fetchImpl] injectable fetch, for tests and fixtures
 * @returns {Promise<{ jobs: object[], errors: { source: string, message: string }[] }>}
 */
export async function fetchJobs({ query = "", location = "", remoteOnly = false, limit = DEFAULT_LIMIT, signal, fetchImpl } = {}) {
  const fetchFn = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return {
      jobs: [],
      errors: SOURCE_ENTRIES.map((entry) => ({
        source: entry.id,
        message: "No fetch implementation is available in this runtime.",
      })),
    };
  }

  const tokens = queryTokens(query);
  const wantRemote = wantedRemote(remoteOnly);
  const maxJobs = normaliseLimit(limit);

  // Each source settles independently, in source order, so `errors` is stable
  // no matter which request finishes first.
  const results = await Promise.all(
    SOURCE_ENTRIES.map(async (entry) => {
      try {
        const payload = await requestPayload(entry, { fetchFn, signal });
        return { entry, jobs: entry.normalize(payload, tokens.join(" ")), error: null };
      } catch (error) {
        return { entry, jobs: null, error: messageFor(entry, error) };
      }
    })
  );

  const errors = [];
  const collected = [];
  for (const result of results) {
    if (result.error) errors.push({ source: result.entry.id, message: result.error });
    else if (Array.isArray(result.jobs)) collected.push(...result.jobs);
  }

  const survivors = collected.filter(
    (job) => (!wantRemote || job.remote === 1) && matchesLocation(job, location, wantRemote)
  );

  const byHash = new Map();
  for (const job of survivors) {
    const existing = byHash.get(job.dedupe_hash);
    if (!existing || richness(job) > richness(existing)) byHash.set(job.dedupe_hash, job);
  }

  const jobs = [...byHash.values()].sort(compareJobs).slice(0, maxJobs);
  return { jobs, errors };
}
