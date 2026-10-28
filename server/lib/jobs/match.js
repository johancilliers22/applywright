/**
 * Applywright — saved-search matching and profile scoring.
 *
 * Two pure functions, no database, no network, no clock:
 *
 *   matchRule(rule, job)             -> { matched, reasons[] }
 *   scoreJobForProfile(job, profile) -> 0-100
 *
 * Both are deterministic. Alerts are re-polled on a cadence and a score is shown in
 * the UI, so the same rule, job and profile must always produce the same answer.
 *
 * `rule`    is an `alerts` row: { keywords, locations, remoteOnly, minSalary }.
 * `job`     is a `jobs` row: { title, description, location, remote, salaryMin, salaryMax }.
 * `profile` is the structured CV profile: { titles, skills, keywords, location, remote,
 *           seniority | years, summary, text }.
 *
 * Underscored column names (remote_only, min_salary, salary_min, salary_max) are
 * accepted too, so a raw SQLite row can be passed straight in.
 *
 * Nothing here calls a model. A job that does not state a salary is never treated as
 * if it did, and an unknown field never counts as a match. The weights, the reason
 * wording and the interpretations are documented in NOTES-match.md.
 */
import { extractKeywords, tokenize } from "../text.js";

/**
 * Component weights for scoreJobForProfile. They sum to 100 and are exported so the
 * UI can label a breakdown without repeating the numbers.
 */
export const SCORE_WEIGHTS = Object.freeze({
  keywords: 35,
  title: 25,
  location: 15,
  seniority: 15,
  salary: 10
});

/* ------------------------------------------------------------------ *
 * Small shared helpers
 * ------------------------------------------------------------------ */

/** Collapse whitespace and trim. Never returns null. */
const collapse = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Collapse, then lowercase — the only case folding used anywhere in this module. */
const lower = (value) => collapse(value).toLowerCase();

/** A value safe to sit inside double quotes in a reason string. */
const forDisplay = (value) => collapse(value).replace(/["\u201c\u201d]/g, "").trim();

/** Truthy for true, 1 and "1" — SQLite stores booleans as integers. */
function isTrue(value) {
  return value === true || value === 1 || value === "1" || lower(value) === "true";
}

/**
 * Turn a rule column into a list of alternatives.
 * Accepts an array, or the comma/semicolon/newline/pipe separated TEXT the `alerts`
 * table stores. Anything else (null, an object) is no criterion at all.
 */
function asList(value) {
  if (value == null || typeof value === "boolean") return [];
  if (Array.isArray(value)) return value.flatMap((entry) => asList(entry));
  if (typeof value === "object") return [];
  return String(value)
    .split(/[,;\n|]+/)
    .map((part) => collapse(part))
    .filter(Boolean);
}

/** Drop repeated alternatives, keeping the first spelling and the input order. */
function uniqueTerms(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = lower(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

/**
 * A whole number of pounds/euros/dollars, or null when nothing usable was given.
 * A string with thousands separators or a currency symbol ("45,000", "£45000") is
 * accepted, because that is what a client can send over JSON; anything else is not.
 */
function toAmount(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const raw =
    typeof value === "number" ? value : Number(String(value).replace(/[,\s\u00a3$\u20ac]/g, ""));
  return Number.isFinite(raw) ? Math.round(raw) : null;
}

/** Everything a keyword test is allowed to search. Company and URL are excluded. */
function jobText(job) {
  return [collapse(job?.title), collapse(job?.description)].filter(Boolean).join("\n");
}

/**
 * The salary a job states, in a shape both matchers can reason about.
 * `from` is the figure the job actually offers: the bottom of a band, or the single
 * stated figure when only one was given.
 */
function readSalary(job) {
  const min = toAmount(job?.salaryMin ?? job?.salary_min);
  const max = toAmount(job?.salaryMax ?? job?.salary_max);
  const from = min ?? max;
  const to = max ?? min;
  return {
    known: from != null,
    from,
    to,
    banded: from != null && to != null && to !== from
  };
}

/** "65000–80000" for a band, "65000" for a single figure. */
function salaryLabel(salary) {
  return salary.banded ? `${salary.from}\u2013${salary.to}` : String(salary.from);
}

/* ------------------------------------------------------------------ *
 * matchRule
 * ------------------------------------------------------------------ */

/**
 * Does this saved search match this job?
 *
 * A rule matches when every dimension it sets passes. Within `keywords` and within
 * `locations` the listed alternatives are OR-ed: a saved search lists "data engineer,
 * analytics engineer" because either will do. A keyword matches when all of its words
 * appear in the job's title or description (token subset, via the shared tokenizer).
 *
 * @returns {{ matched: boolean, reasons: string[] }} one plain-words line per test run.
 */
export function matchRule(rule, job) {
  const safeRule = rule ?? {};
  const safeJob = job ?? {};
  const keywords = uniqueTerms(asList(safeRule.keywords));
  const locations = uniqueTerms(asList(safeRule.locations));
  const remoteOnly = isTrue(safeRule.remoteOnly ?? safeRule.remote_only);
  const minSalary = toAmount(safeRule.minSalary ?? safeRule.min_salary);

  const hasCriteria = keywords.length > 0 || locations.length > 0 || remoteOnly || minSalary != null;
  if (!hasCriteria) {
    return { matched: true, reasons: ["the rule sets no criteria, so every job matches"] };
  }

  const reasons = [];
  const outcomes = [];

  if (keywords.length) {
    const tokens = new Set(tokenize(jobText(safeJob)));
    let any = false;
    for (const keyword of keywords) {
      const test = keywordTest(keyword, tokens);
      reasons.push(test.reason);
      if (test.ok) any = true;
    }
    outcomes.push(any);
  }

  if (locations.length) {
    let any = false;
    for (const location of locations) {
      const test = locationTest(location, safeJob?.location);
      reasons.push(test.reason);
      if (test.ok) any = true;
    }
    outcomes.push(any);
  }

  if (remoteOnly) {
    const ok = isTrue(safeJob?.remote);
    reasons.push(ok ? "job is marked remote" : "job is not marked remote");
    outcomes.push(ok);
  }

  if (minSalary != null) {
    const test = salaryTest(minSalary, safeJob);
    reasons.push(test.reason);
    outcomes.push(test.ok);
  }

  return { matched: outcomes.every(Boolean), reasons };
}

function keywordTest(keyword, tokens) {
  const label = forDisplay(keyword);
  const wanted = tokenize(keyword);
  if (!wanted.length) {
    return { ok: false, reason: `keyword "${label}" has no searchable words` };
  }
  const missing = wanted.filter((token) => !tokens.has(token));
  if (!missing.length) {
    return { ok: true, reason: `title or description contains "${label}"` };
  }
  const detail = wanted.length > 1 ? ` (missing ${missing.map((token) => `"${token}"`).join(", ")})` : "";
  return { ok: false, reason: `title or description does not contain "${label}"${detail}` };
}

function locationTest(location, jobLocation) {
  const label = forDisplay(location);
  const have = collapse(jobLocation);
  if (!have) {
    return { ok: false, reason: `job location is unknown, so it cannot meet "${label}"` };
  }
  if (lower(have).includes(lower(location))) {
    return { ok: true, reason: `job location "${forDisplay(have)}" contains "${label}"` };
  }
  return { ok: false, reason: `job location "${forDisplay(have)}" does not contain "${label}"` };
}

/**
 * A salary floor is met only by a salary the job actually states, at or above it.
 * The figure that decides is the bottom of the stated band, because that is the pay
 * the job guarantees. An unknown salary is a miss, not a neutral.
 */
function salaryTest(floor, job) {
  const salary = readSalary(job);
  if (!salary.known) {
    return { ok: false, reason: `salary unknown, so it cannot meet the ${floor} floor` };
  }
  const band = salaryLabel(salary);
  if (salary.from >= floor) {
    return {
      ok: true,
      reason: salary.banded
        ? `stated salary band ${band} meets the ${floor} floor`
        : `stated salary ${band} meets the ${floor} floor`
    };
  }
  return {
    ok: false,
    reason: salary.banded
      ? `stated salary band ${band} starts below the ${floor} floor`
      : `stated salary ${band} is below the ${floor} floor`
  };
}

/* ------------------------------------------------------------------ *
 * scoreJobForProfile
 * ------------------------------------------------------------------ */

/**
 * How well does this job fit this profile, 0-100?
 *
 * The number is the sum of five weighted components (see SCORE_WEIGHTS). It is
 * deliberately not a prediction of success: it only says how much of this job the
 * profile can evidence. `explainJobScore` returns the same number with the working.
 */
export function scoreJobForProfile(job, profile) {
  return explainJobScore(job, profile).score;
}

/**
 * The score with its parts. Each part carries the weight, a 0-1 ratio and a plain
 * sentence explaining the ratio. Points are rounded to two decimals first so the
 * parts always reconcile with the total.
 *
 * This is an additive helper for the UI; the SPEC contract is scoreJobForProfile.
 *
 * @returns {{ score: number, parts: { id: string, weight: number, ratio: number, points: number, detail: string }[] }}
 */
export function explainJobScore(job, profile) {
  const safeJob = job ?? {};
  const safeProfile = profile ?? {};

  const parts = [
    makePart("keywords", SCORE_WEIGHTS.keywords, keywordPart(safeJob, safeProfile)),
    makePart("title", SCORE_WEIGHTS.title, titlePart(safeJob, safeProfile)),
    makePart("location", SCORE_WEIGHTS.location, locationPart(safeJob, safeProfile)),
    makePart("seniority", SCORE_WEIGHTS.seniority, seniorityPart(safeJob, safeProfile)),
    makePart("salary", SCORE_WEIGHTS.salary, salaryPart(safeJob))
  ];

  const total = parts.reduce((sum, part) => sum + part.points, 0);
  return { score: Math.max(0, Math.min(100, Math.round(total))), parts };
}

function makePart(id, weight, { ratio, detail }) {
  const safeRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return {
    id,
    weight,
    ratio: safeRatio,
    points: Math.round(safeRatio * weight * 100) / 100,
    detail
  };
}

/** Every word the profile can legitimately claim to know. */
function profileTokenSet(profile) {
  const parts = [
    ...asList(profile?.skills),
    ...asList(profile?.keywords),
    ...asList(profile?.titles ?? profile?.targetTitles ?? profile?.target_titles),
    collapse(profile?.summary),
    collapse(profile?.text)
  ];
  const tokens = new Set();
  for (const part of parts) {
    for (const token of tokenize(part)) tokens.add(token);
  }
  return tokens;
}

/** Weighted share of the job's own keywords that the profile can evidence. */
function keywordPart(job, profile) {
  const terms = extractKeywords(jobText(job), { limit: 25 });
  if (!terms.length) {
    return { ratio: 0, detail: "the job has no words to compare" };
  }
  const tokens = profileTokenSet(profile);
  if (!tokens.size) {
    return { ratio: 0, detail: "the profile states no skills, titles or summary" };
  }

  let total = 0;
  let hit = 0;
  let matched = 0;
  for (const term of terms) {
    total += term.weight;
    if (tokenize(term.term).every((token) => tokens.has(token))) {
      hit += term.weight;
      matched += 1;
    }
  }

  const ratio = total > 0 ? hit / total : 0;
  const detail = matched
    ? `${matched} of ${terms.length} job keywords appear in the profile`
    : `none of the ${terms.length} job keywords appear in the profile`;
  return { ratio, detail };
}

/**
 * Best coverage of a target title. Coverage (how much of the target title the job
 * title contains), not Jaccard, because real job titles carry location, salary and
 * noise: "Senior Data Engineer - London - £60k" should still cover "Data Engineer".
 */
function titlePart(job, profile) {
  const targets = uniqueTerms(asList(profile?.titles ?? profile?.targetTitles ?? profile?.target_titles));
  if (!targets.length) {
    return { ratio: 0, detail: "the profile names no target titles" };
  }
  const jobTokens = new Set(tokenize(job?.title));
  if (!jobTokens.size) {
    return { ratio: 0, detail: "the job has no title to compare" };
  }

  let best = null;
  for (const target of targets) {
    const wanted = [...new Set(tokenize(target))];
    if (!wanted.length) continue;
    const hits = wanted.filter((token) => jobTokens.has(token)).length;
    const ratio = hits / wanted.length;
    if (!best || ratio > best.ratio) {
      best = { ratio, label: forDisplay(target), hits, size: wanted.length };
    }
  }

  if (!best) {
    return { ratio: 0, detail: "the profile's target titles have no searchable words" };
  }
  if (best.ratio === 1) {
    return { ratio: 1, detail: `the job title covers "${best.label}"` };
  }
  return {
    ratio: best.ratio,
    detail: `the job title covers ${best.hits} of ${best.size} words of "${best.label}"`
  };
}

/** Can, and may, the candidate do this job where it is? */
function locationPart(job, profile) {
  const wants = uniqueTerms(
    asList(profile?.locations ?? profile?.location).map((place) => forDisplay(place))
  );
  const acceptsRemote = isTrue(profile?.remote ?? profile?.remoteOnly);
  const jobLocation = collapse(job?.location);

  if (acceptsRemote && isTrue(job?.remote)) {
    return { ratio: 1, detail: "the profile accepts remote work and the job is marked remote" };
  }
  if (!wants.length && !acceptsRemote) {
    return jobLocation
      ? { ratio: 1, detail: "the profile states no location preference" }
      : { ratio: 0, detail: "the job states no location" };
  }
  if (!wants.length) {
    return jobLocation
      ? { ratio: 0, detail: "the profile wants remote work and the job is not marked remote" }
      : { ratio: 0, detail: "the job is neither remote nor located, so it cannot meet a remote preference" };
  }
  if (!jobLocation) {
    return { ratio: 0, detail: "the job states no location" };
  }

  const match = wants.find((want) => lower(jobLocation).includes(lower(want)));
  if (match) {
    return {
      ratio: 1,
      detail: `the job location "${forDisplay(jobLocation)}" matches "${forDisplay(match)}"`
    };
  }
  return {
    ratio: 0,
    detail: `the job location "${forDisplay(jobLocation)}" does not match the profile's locations`
  };
}

const LEVEL_LABELS = Object.freeze(["unknown", "junior", "mid", "senior", "lead"]);
/** Points by distance in levels: 0 apart, 1 apart, 2 apart, 3 or more. */
const LEVEL_RATIO = Object.freeze([1, 0.6, 0.25, 0]);

const LEAD_MARKERS = /\b(lead|principal|staff|head|director|chief|manager|supervisor|vp)\b/;
const SENIOR_MARKERS = /\b(senior|sr)\b/;
const MID_MARKERS = /\b(mid|intermediate|medior)\b/;
const JUNIOR_MARKERS = /\b(junior|jr|graduate|trainee|entry|intern|internship|apprentice)\b/;

/** 1-4 from an explicit seniority word in the text, or 0 when it says nothing. */
function seniorityMarker(text) {
  const value = lower(text);
  if (!value) return 0;
  if (LEAD_MARKERS.test(value)) return 4;
  if (SENIOR_MARKERS.test(value)) return 3;
  if (MID_MARKERS.test(value)) return 2;
  if (JUNIOR_MARKERS.test(value)) return 1;
  return 0;
}

/**
 * The job's level, read from its title. A title with no marker at all is treated as
 * mid-level rather than unknown: "Data Engineer" is a mid-level posting, and refusing
 * to guess there would silently remove 15 points from most of the feed.
 */
function jobSeniorityLevel(job) {
  const explicit = toAmount(job?.seniority ?? job?.seniorityLevel ?? job?.level);
  if (explicit != null && explicit >= 1 && explicit <= 4) return Math.round(explicit);
  const title = collapse(job?.title);
  if (!title) return 0;
  return seniorityMarker(title) || 2;
}

/**
 * The profile's level: an explicit field, then the seniority word in a target title,
 * then years of experience. A target title with no marker is NOT read as mid-level —
 * for the candidate that would be a guess, not a reading.
 */
function profileSeniorityLevel(profile) {
  const explicit = profile?.seniority ?? profile?.seniorityLevel ?? profile?.level;
  if (explicit != null) {
    const amount = toAmount(explicit);
    if (amount != null && amount >= 1 && amount <= 4) return Math.round(amount);
    const marker = seniorityMarker(String(explicit));
    if (marker) return marker;
  }

  const targets = asList(profile?.titles ?? profile?.targetTitles ?? profile?.target_titles).join(" ");
  const fromTitles = seniorityMarker(targets);
  if (fromTitles) return fromTitles;

  const years = toAmount(profile?.years ?? profile?.yearsExperience ?? profile?.experienceYears);
  if (years != null && years >= 0) {
    if (years < 2) return 1;
    if (years < 5) return 2;
    if (years < 9) return 3;
    return 4;
  }
  return 0;
}

/** Seniority sanity: a near-miss is a mild penalty, a three-level gap is a miss. */
function seniorityPart(job, profile) {
  const jobLevel = jobSeniorityLevel(job);
  const profileLevel = profileSeniorityLevel(profile);

  if (!jobLevel) return { ratio: 0, detail: "the job states no title or seniority" };
  if (!profileLevel) {
    return { ratio: 0, detail: "the profile states no seniority, target title or years" };
  }

  const distance = Math.abs(jobLevel - profileLevel);
  const ratio = LEVEL_RATIO[Math.min(distance, LEVEL_RATIO.length - 1)];
  const detail =
    distance === 0
      ? `the job and the profile both read ${LEVEL_LABELS[jobLevel]}`
      : `the job reads ${LEVEL_LABELS[jobLevel]} against a ${LEVEL_LABELS[profileLevel]} profile`;
  return { ratio, detail };
}

/** Salary presence is a fact about the posting, not a judgement about the pay. */
function salaryPart(job) {
  const salary = readSalary(job);
  if (!salary.known) return { ratio: 0, detail: "the job states no salary" };
  const label = salaryLabel(salary);
  return {
    ratio: 1,
    detail: salary.banded ? `the job states a salary band of ${label}` : `the job states a salary of ${label}`
  };
}
