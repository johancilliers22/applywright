/**
 * Applywright — LinkedIn profile import, "bring your own copy".
 *
 * What this module reads: text the user has already copied from their own
 * signed-in LinkedIn profile — the clipboard copy, or the text layer of a PDF
 * they exported themselves.
 *
 * What this module never does, by design:
 *   - it never fetches a LinkedIn URL, never opens a browser and never scrapes;
 *   - it is not an OAuth integration and is not presented as one;
 *   - it imports nothing except the string handed to it.
 *
 * Why: LinkedIn's public API does not expose member profile data to third-party
 * applications. "Sign in with LinkedIn" returns an identifier, a name and an
 * email address — not a career history — and scraping breaches LinkedIn's terms
 * and SPEC §1 ("No LinkedIn scraping"). The connector is therefore
 * bring-your-own-copy: the user exports or copies, and this module parses.
 *
 * Everything here is pure and synchronous. Same text in, same profile out: no
 * network, no clock, no randomness, no model.
 *
 * The parser is deliberately forgiving about the pasted shape, because the
 * clipboard copy and the PDF export are laid out slightly differently:
 *   - clipboard copy puts "Contact" then sections like "Top Skills";
 *   - the PDF omits bullets on some lines and interleaves page footers.
 * Both are handled by the same state machine: sections are found by their
 * heading, and experience and education entries are filled slot by slot in the
 * order LinkedIn prints them (title, company, dates, location, description).
 */
import { normalizeTerm, sentences, slugify, tokenize } from "../text.js";

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

/**
 * An empty profile with every field present.
 * Callers merge into this rather than inventing a second shape.
 */
export function emptyProfile() {
  return {
    name: null,
    headline: null,
    location: null,
    about: null,
    contact: { email: null, phone: null, url: null },
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    detectedSections: [],
    confidence: 0,
    warnings: [],
  };
}

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * Heading labels, normalised at construction time, mapped to the section key
 * this module understands. Both LinkedIn's own labels ("Top Skills", "Contact")
 * and ordinary CV labels (so a pasted CV still parses) are present: the
 * distinction between the two is made separately, when confidence is scored.
 */
const SECTION_BY_LABEL = new Map(
  /** @type {[string, string][]} */ ([
    ["contact", "contact"],
    ["top skills", "topSkills"],
    ["skills", "skills"],
    ["key skills", "skills"],
    ["core skills", "skills"],
    ["technical skills", "skills"],
    ["professional skills", "skills"],
    ["skills and competencies", "skills"],
    ["competencies", "skills"],
    ["core competencies", "skills"],
    ["technical competencies", "skills"],
    ["expertise", "skills"],
    ["areas of expertise", "skills"],
    ["technical expertise", "skills"],
    ["technologies", "skills"],
    ["tools and technologies", "skills"],
    ["tech stack", "skills"],
    ["languages", "languages"],
    ["certifications", "certifications"],
    ["certificates", "certifications"],
    ["licences", "certifications"],
    ["licenses", "certifications"],
    ["licences and certifications", "certifications"],
    ["licenses and certifications", "certifications"],
    ["experience", "experience"],
    ["work experience", "experience"],
    ["professional experience", "experience"],
    ["relevant experience", "experience"],
    ["employment", "experience"],
    ["employment history", "experience"],
    ["work history", "experience"],
    ["career history", "experience"],
    ["education", "education"],
    ["education and training", "education"],
    ["academic background", "education"],
    ["qualifications", "education"],
    ["training", "education"],
    ["about", "about"],
    ["about me", "about"],
    ["summary", "about"],
    ["professional summary", "about"],
    ["personal summary", "about"],
    ["career summary", "about"],
    ["personal profile", "about"],
    ["professional profile", "about"],
    ["profile", "about"],
    ["overview", "about"],
    ["objective", "about"],
    ["career objective", "about"],
    ["projects", "projects"],
    ["personal projects", "projects"],
    ["selected projects", "projects"],
    ["honors and awards", "honours"],
    ["honours and awards", "honours"],
    ["volunteer experience", "volunteer"],
    ["volunteering", "volunteer"],
    ["volunteer work", "volunteer"],
    ["publications", "publications"],
    ["interests", "interests"],
    ["courses", "courses"],
    ["organisations", "organisations"],
    ["organizations", "organisations"],
    ["recommendations", "recommendations"],
  ]).map(([label, key]) => [normaliseLabel(label), key])
);

/** Human labels for `detectedSections`, so the UI never invents its own. */
const SECTION_LABELS = Object.freeze({
  contact: "Contact",
  topSkills: "Top Skills",
  skills: "Skills",
  languages: "Languages",
  certifications: "Certifications",
  experience: "Experience",
  education: "Education",
  about: "About",
  projects: "Projects",
  honours: "Honours & Awards",
  volunteer: "Volunteer Experience",
  publications: "Publications",
  interests: "Interests",
  courses: "Courses",
  organisations: "Organisations",
  recommendations: "Recommendations",
});

/**
 * Sections that only a LinkedIn export or copy carries. These, not the shared
 * CV headings, are what make a text "a LinkedIn profile". "Experience" and
 * "Education" appear on every CV, so they cannot be evidence on their own.
 */
const LINKEDIN_MARKERS = Object.freeze([
  "contact",
  "topSkills",
  "languages",
  "certifications",
  "projects",
  "honours",
  "volunteer",
  "publications",
  "interests",
  "courses",
  "organisations",
  "recommendations",
]);

/** Sections this shape has no field for. Surfaced as one warning, not silently lost. */
const UNMAPPED_SECTIONS = Object.freeze(["projects", "honours", "volunteer", "publications", "interests", "courses", "organisations", "recommendations"]);

/**
 * Weight of each section in the confidence score. The two LinkedIn-only
 * sections dominate, so a pasted CV (no Contact, no Top Skills) cannot score
 * like a profile even though it has Experience and Education.
 */
const CONFIDENCE_WEIGHTS = Object.freeze({
  contact: 0.3,
  topSkills: 0.25,
  experience: 0.1,
  education: 0.08,
  languages: 0.08,
  certifications: 0.07,
  about: 0.05,
  projects: 0.05,
});

const MAX_HEADING_LENGTH = 64;
const MAX_NAME_LENGTH = 60;
const MAX_TITLE_LENGTH = 90;
const MAX_SKILL_LENGTH = 60;

/* ------------------------------------------------------------------ *
 * Line noise
 * ------------------------------------------------------------------ */

/** LinkedIn's "Show all 5 experiences" control, which is chrome rather than content. */
const SHOW_ALL = /^show all(?:\s+\d+)?\s+[a-z]+(?:\s+[a-z]+)*$/i;
/** Page footers in a PDF export: "Page 1 of 3". */
const PAGE_MARKER = /^page\s+\d+\s+of\s+\d+$/i;

/** Lines to drop before anything is parsed. */
function isNoise(line) {
  const value = String(line ?? "").trim();
  if (!value) return false;
  return SHOW_ALL.test(value) || PAGE_MARKER.test(value);
}

/**
 * Normalise the pasted text and drop the noise lines.
 * Blank lines are kept: they are the only reliable separator between two
 * experience entries when the copy has no bullet markers.
 */
function normaliseLines(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b\u200e\u200f]/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .filter((line) => !isNoise(line));
}

/** Lowercase a label and remove everything that is not a word or space. */
function normaliseLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The section key for a heading line, or null when the line is ordinary content. */
function headingKey(line) {
  const raw = String(line ?? "").trim();
  if (!raw || raw.length > MAX_HEADING_LENGTH) return null;
  const candidate = raw
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[\u2022\u25aa\u25e6\u2023\u00b7*\-]\s+/, "")
    .replace(/[*_`]+/g, "")
    .replace(/[:\uff1a]\s*$/, "")
    .trim();
  if (!candidate) return null;
  return SECTION_BY_LABEL.get(normaliseLabel(candidate)) ?? null;
}

/** Every section key a text mentions, in document order. */
function headingsIn(lines) {
  const keys = [];
  for (const line of lines) {
    const key = headingKey(line);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/* ------------------------------------------------------------------ *
 * Line roles
 * ------------------------------------------------------------------ */

/** Bullet characters LinkedIn and Word leave in copied text. */
const BULLET_START = /^(?:[\u2022\u25aa\u25e6\u2023\u00b7*\-\u2013\u2014]\s+|\d{1,2}[.)]\s+)/;

function isBullet(line) {
  return BULLET_START.test(String(line ?? ""));
}

function stripBullet(line) {
  return String(line ?? "").replace(BULLET_START, "").trim();
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_RANGE_RE = new RegExp(
  `(?:${MONTH}\\s*)?(?:19|20)\\d{2}\\s*(?:[\\u2013\\u2014-]|to|until|through)\\s*(?:(?:${MONTH}\\s*)?(?:19|20)\\d{2}|present|current|now|ongoing)`,
  "i"
);
const SINGLE_YEAR_RE = new RegExp(`^(?:${MONTH}\\s*)?(?:19|20)\\d{2}$`, "i");
const DURATION_RE = /\s*[\u00b7\u2022]\s*\d+\s*(?:yrs?|years?|mos?|months?)\b.*$/i;

/** "Jan 2019 - Present · 5 yrs" -> "Jan 2019 - Present". */
function cleanDates(line) {
  return String(line ?? "")
    .replace(DURATION_RE, "")
    .replace(/\s*[\u00b7\u2022]\s*$/, "")
    .trim();
}

const EMPLOYMENT_TYPE_RE =
  /\b(?:full[- ]?time|part[- ]?time|contract|freelance|internship|self[- ]?employed|seasonal|apprenticeship|temporary)\b/i;

const DEGREE_RE =
  /\b(?:bachelor|master|bsc|msc|beng|meng|ba|ma|mba|mphil|phd|doctorate|diploma|certificate|foundation|a-levels?|gcses?|hnc|hnd|degree)\b/i;

const DETAIL_LABEL_RE =
  /^(?:grades?|activities(?:\s+and\s+societies)?|societies|thesis|dissertation|modules|awards|honours|honors|minor|major|grade point average|gpa)\b\s*[:\u2013\u2014-]/i;

const PRONOUN_RE = /^(?:he|she|they)\s*\/\s*(?:him|her|them)(?:\s*\/\s*(?:his|hers|theirs))?$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"'`]+/i;
const PROFILE_URL_RE =
  /\b(?:linkedin\.com\/(?:in|pub)\/[\w%.-]+|github\.com\/[\w%.-]+|gitlab\.com\/[\w%.-]+)[^\s<>()"'`,;]*/i;

const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{2,6}(?:[\s.-]\d{2,6}){1,4}(?!\d)/g;

/* ------------------------------------------------------------------ *
 * Field heuristics
 * ------------------------------------------------------------------ */

/** A person's name: 2-5 capitalised words, no digits, no punctuation that names do not carry. */
function looksLikeName(line) {
  const value = String(line ?? "").trim();
  if (value.length < 3 || value.length > MAX_NAME_LENGTH) return false;
  if (/[@:0-9]|https?:\/\/|www\./i.test(value)) return false;
  if (/[.!?]$/.test(value) || /[,;\/]/.test(value)) return false;
  if (SECTION_BY_LABEL.has(normaliseLabel(value))) return false;
  const words = tokenize(value);
  if (words.length < 2 || words.length > 5) return false;
  return /^[A-Z\u00c0-\u00d6\u00d8-\u00de]/.test(value);
}

/**
 * A location: "London, England, United Kingdom". Two to four comma-separated
 * parts, capitalised, no digits. Deliberately conservative — a one-part line is
 * too ambiguous to claim.
 */
function looksLikeLocation(line) {
  const value = String(line ?? "").trim();
  if (!value || value.length > 80) return false;
  if (/\d|@|https?:\/\//i.test(value)) return false;
  if (DATE_RANGE_RE.test(value) || EMPLOYMENT_TYPE_RE.test(value)) return false;
  const parts = value.split(/\s*,\s*/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((part) => {
    const words = tokenize(part);
    return words.length > 0 && words.length <= 4 && /^[A-Z\u00c0-\u00d6\u00d8-\u00de]/.test(part);
  });
}

function looksLikeTitle(line) {
  const value = String(line ?? "").trim();
  if (!value || value.length > MAX_TITLE_LENGTH) return false;
  if (/[.!?]$/.test(value)) return false;
  if (DATE_RANGE_RE.test(value) || looksLikeLocation(value)) return false;
  const words = tokenize(value);
  return words.length >= 1 && words.length <= 14;
}

function looksLikeDegree(line) {
  const value = String(line ?? "").trim();
  if (!value || value.length > 120) return false;
  return DEGREE_RE.test(value);
}

/**
 * Past-tense openers that mark a description line rather than a job title.
 * Without this, a bullet that lost its marker and its full stop in the copy
 * ("Built pipelines for the engine") would be read as a new role.
 */
const BULLET_VERB_RE =
  /^(?:built|led|managed|developed|designed|delivered|created|improved|reduced|increased|wrote|ran|owned|drove|shipped|launched|implemented|migrated|automated|mentored|hired|negotiated|saved|cut|grew|scaled|maintained|supported|analysed|analyzed|architected|established|introduced|streamlined|coordinated|trained|taught|reviewed|tested|deployed|monitored)\b/i;

/** "Name — Company" / "Degree | School", with the dash shown in either direction. */
function splitOnDash(line) {
  const parts = String(line ?? "").split(/\s+[\u2014|]\s+/);
  if (parts.length !== 2) return null;
  const left = parts[0].trim();
  const right = parts[1].trim();
  if (!left || !right) return null;
  return { left, right };
}

/** The first plausible phone number in one line. */
function findPhone(line) {
  const value = String(line ?? "");
  for (const raw of value.match(PHONE_RE) ?? []) {
    const candidate = raw.trim();
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    if (DATE_RANGE_RE.test(candidate)) continue;
    if (/^(?:19|20)\d{2}[\s.-]+(?:19|20)\d{2}$/.test(candidate)) continue;
    if (/[\u00a3$\u20ac%]/.test(candidate)) continue;
    if (EMAIL_RE.test(candidate) || URL_RE.test(candidate)) continue;
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Section splitting
 * ------------------------------------------------------------------ */

/**
 * Split normalised lines into blocks keyed by section.
 * Everything before the first heading lands in the "header" block.
 */
function splitSections(lines) {
  const blocks = new Map([["header", []]]);
  const order = ["header"];
  let current = "header";

  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      current = key;
      if (!blocks.has(key)) {
        blocks.set(key, []);
        order.push(key);
      }
      continue;
    }
    blocks.get(current).push(line);
  }

  return { blocks, order };
}

function contentOf(blocks, key) {
  return (blocks.get(key) ?? []).map((line) => line.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

/** Pull an email, a phone number and a profile link out of any set of lines. */
function collectContact(lines, into) {
  const contact = into ?? { email: null, phone: null, url: null };
  for (const rawLine of lines) {
    const line = String(rawLine ?? "").trim();
    if (!line) continue;
    if (!contact.email) {
      const match = line.match(EMAIL_RE);
      if (match) contact.email = match[0];
    }
    if (!contact.phone) {
      const phone = findPhone(line);
      if (phone) contact.phone = phone;
    }
    if (!contact.url) {
      const match = line.match(PROFILE_URL_RE) ?? line.match(URL_RE);
      if (match) contact.url = match[0].replace(/[.,;]+$/, "").replace(/^https?:\/\//i, "");
    }
  }
  return contact;
}

/* ------------------------------------------------------------------ *
 * Header: name, headline, location
 * ------------------------------------------------------------------ */

/**
 * Read the top card. LinkedIn prints name, then (sometimes pronouns), then
 * headline, then location. The order is assumed; a location that appears where
 * the headline should be is swapped with the next line when that line is not
 * itself a location.
 */
function parseHeader(lines) {
  const candidates = [];
  for (const rawLine of lines) {
    const line = String(rawLine ?? "").trim();
    if (!line) continue;
    if (PRONOUN_RE.test(line)) continue;
    if (EMAIL_RE.test(line) || URL_RE.test(line) || PROFILE_URL_RE.test(line)) continue;
    if (findPhone(line)) continue;
    candidates.push(line);
  }

  let name = null;
  if (candidates.length && looksLikeName(candidates[0])) name = candidates.shift();
  else {
    const index = candidates.findIndex((line) => looksLikeName(line));
    if (index >= 0) name = candidates.splice(index, 1)[0];
  }

  let headline = null;
  let location = null;
  if (candidates.length === 1) {
    const only = candidates[0];
    if (looksLikeLocation(only)) location = only;
    else headline = only;
  } else if (candidates.length > 1) {
    if (looksLikeLocation(candidates[0]) && !looksLikeLocation(candidates[1])) {
      location = candidates[0];
      headline = candidates[1];
    } else {
      headline = candidates[0];
      location = candidates.slice(1).find((line) => looksLikeLocation(line)) ?? null;
    }
  }

  return { name, headline, location };
}

/* ------------------------------------------------------------------ *
 * Section parsers
 * ------------------------------------------------------------------ */

/**
 * Split a comma/semicolon separated list and de-duplicate case-insensitively.
 * Exported because the CV connector reads its SKILLS section with it too.
 */
export function parseSkillLines(lines) {
  const maxLength = MAX_SKILL_LENGTH;
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const value = stripBullet(raw).replace(/^[,;\s]+|[,;\s]+$/g, "").trim();
    if (!value || value.length > maxLength) return;
    if (!tokenize(value).length) return;
    const key = normalizeTerm(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };

  for (const rawLine of lines) {
    const line = String(rawLine ?? "").trim();
    if (!line || isNoise(line)) continue;
    for (const part of stripBullet(line).split(/\s*[,;|]\s*/)) add(part);
  }
  return out;
}

/** Languages keep their proficiency text; only the line structure is removed. */
function parseLanguages(lines) {
  const out = [];
  const seen = new Set();
  for (const rawLine of lines) {
    const value = stripBullet(rawLine);
    if (!value) continue;
    const key = normalizeTerm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Certifications. LinkedIn prints the name, the issuer and an "Issued" line;
 * a single line may also carry "Name — Issuer".
 */
function parseCertifications(lines) {
  const out = [];
  let current = null;

  for (const rawLine of lines) {
    const line = String(rawLine ?? "").trim();
    if (!line || isNoise(line)) continue;
    if (/^credential\s+id\b/i.test(line)) continue;

    const issued = line.match(/^(?:issued|date|issued on)\b\s*[:.]?\s*(.+)$/i);
    if (issued) {
      if (current) current.date = cleanDates(issued[1]);
      continue;
    }

    if (current && !current.date && (SINGLE_YEAR_RE.test(line) || /^(?:[a-z]{3,9}\.?\s+)(?:19|20)\d{2}$/i.test(line))) {
      current.date = cleanDates(line);
      continue;
    }

    const split = splitOnDash(line);
    if (split) {
      current = { name: split.left, issuer: split.right, date: null };
      out.push(current);
      continue;
    }

    if (!current) {
      current = { name: line, issuer: null, date: null };
      out.push(current);
      continue;
    }
    if (!current.issuer) {
      current.issuer = line;
      continue;
    }
    current = { name: line, issuer: null, date: null };
    out.push(current);
  }

  return out;
}

/**
 * Experience entries.
 *
 * A blank line closes an entry. Between entries the slots are filled in
 * LinkedIn's print order, which also survives the PDF export where the bullet
 * markers and the "· Full-time" separator are missing.
 *
 * @param {string[]} lines
 * @returns {{ title: string|null, company: string|null, dates: string|null,
 *             location: string|null, bullets: string[] }[]}
 */
export function parseExperienceLines(lines) {
  const entries = [];
  let current = null;

  const start = (line) => {
    const value = line == null ? "" : String(line).trim();
    const split = splitOnDash(value);
    current = {
      title: split ? split.left : value || null,
      company: split ? split.right : null,
      dates: null,
      location: null,
      bullets: [],
    };
    entries.push(current);
    return current;
  };

  for (const rawLine of Array.isArray(lines) ? lines : []) {
    const line = String(rawLine ?? "").trim();
    if (isNoise(line)) continue;
    if (!line) {
      current = null;
      continue;
    }

    if (isBullet(line)) {
      if (!current) start(null);
      current.bullets.push(stripBullet(line));
      continue;
    }

    if (!current) {
      start(line);
      continue;
    }

    if (!current.dates && DATE_RANGE_RE.test(line)) {
      current.dates = cleanDates(line);
      continue;
    }
    if (!current.company) {
      current.company = companyFrom(line);
      continue;
    }
    if (!current.location && looksLikeLocation(line)) {
      current.location = line;
      continue;
    }
    if (looksLikeTitle(line) && !BULLET_VERB_RE.test(line)) {
      start(line);
      continue;
    }
    current.bullets.push(stripBullet(line));
  }

  return entries.filter((entry) => entry.title || entry.company || entry.bullets.length > 0);
}

/** "Analytical Engines Ltd · Full-time" -> "Analytical Engines Ltd". */
function companyFrom(line) {
  const parts = String(line ?? "")
    .split(/\s*[\u00b7\u2022|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && EMPLOYMENT_TYPE_RE.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" \u00b7 ") || String(line ?? "").trim();
}

function joinDetail(existing, line) {
  const value = String(line ?? "").trim();
  if (!value) return existing;
  return existing ? `${existing} ${value}` : value;
}

/**
 * Education entries: school, degree, dates, then details.
 *
 * @param {string[]} lines
 * @returns {{ school: string|null, degree: string|null, dates: string|null, details: string|null }[]}
 */
export function parseEducationLines(lines) {
  const entries = [];
  let current = null;

  const start = (line) => {
    const value = line == null ? "" : String(line).trim();
    const split = splitOnDash(value);
    current = {
      school: split ? split.right : value || null,
      degree: split ? split.left : null,
      dates: null,
      details: null,
    };
    entries.push(current);
    return current;
  };

  for (const rawLine of Array.isArray(lines) ? lines : []) {
    const line = String(rawLine ?? "").trim();
    if (isNoise(line)) continue;
    if (!line) {
      current = null;
      continue;
    }

    if (isBullet(line)) {
      if (!current) start(null);
      current.details = joinDetail(current.details, stripBullet(line));
      continue;
    }

    if (!current) {
      start(line);
      continue;
    }

    if (!current.degree && looksLikeDegree(line)) {
      current.degree = line;
      continue;
    }
    if (!current.dates && (DATE_RANGE_RE.test(line) || SINGLE_YEAR_RE.test(line))) {
      current.dates = cleanDates(line);
      continue;
    }
    if (!current.degree && !DETAIL_LABEL_RE.test(line) && !looksLikeLocation(line) && line.length <= 120) {
      current.degree = line;
      continue;
    }
    current.details = joinDetail(current.details, line);
  }

  return entries.filter((entry) => entry.school || entry.degree || entry.details);
}

/** The About text as one paragraph: sentences, not raw line breaks. */
function parseAbout(lines) {
  const text = lines
    .map((line) => stripBullet(line))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return sentences(text).join(" ") || text;
}

/* ------------------------------------------------------------------ *
 * Public parser
 * ------------------------------------------------------------------ */

/**
 * Parse a LinkedIn profile the user copied or exported themselves.
 *
 * Always returns the full profile shape. Missing sections are empty and
 * explained in `warnings`; unparseable text yields a near-empty profile with
 * `confidence` below 0.3 rather than an exception.
 *
 * @param {string} text
 * @returns {ReturnType<typeof emptyProfile>}
 */
export function parseLinkedInProfile(text) {
  const profile = emptyProfile();
  const raw = typeof text === "string" ? text : String(text ?? "");
  const lines = normaliseLines(raw);

  if (!lines.some((line) => line.trim())) {
    profile.warnings.push("The text was empty, so nothing was imported.");
    return profile;
  }

  const { blocks, order } = splitSections(lines);
  const has = (key) => contentOf(blocks, key).length > 0;

  const header = parseHeader(contentOf(blocks, "header"));
  profile.name = header.name;
  profile.headline = header.headline;
  profile.location = header.location;

  // Contact details can sit in a CONTACT section (clipboard copy) or directly
  // under the name (PDF export), so both are read and the first value wins.
  const contact = collectContact(contentOf(blocks, "contact"));
  collectContact(contentOf(blocks, "header"), contact);
  profile.contact = contact;

  if (has("about")) profile.about = parseAbout(contentOf(blocks, "about"));

  const skills = parseSkillLines([...contentOf(blocks, "topSkills"), ...contentOf(blocks, "skills")]);
  profile.skills = skills;

  if (has("languages")) profile.languages = parseLanguages(contentOf(blocks, "languages"));
  if (has("certifications")) profile.certifications = parseCertifications(contentOf(blocks, "certifications"));
  if (has("experience")) profile.experience = parseExperienceLines(contentOf(blocks, "experience"));
  if (has("education")) profile.education = parseEducationLines(contentOf(blocks, "education"));

  // Sections this shape has no field for are named once rather than dropped in
  // silence; losing a Projects block without saying so would be dishonest.
  const unmapped = order.filter((key) => UNMAPPED_SECTIONS.includes(key) && has(key));
  if (unmapped.length) {
    const labels = unmapped.map((key) => SECTION_LABELS[key] ?? key).join(", ");
    profile.warnings.push(`These sections were recognised but not imported: ${labels}.`);
  }

  profile.detectedSections = order
    .filter((key) => key !== "header" && has(key) && SECTION_LABELS[key])
    .map((key) => SECTION_LABELS[key]);

  profile.confidence = scoreConfidence(profile, has);
  profile.warnings.push(...explainGaps(profile, order));

  return profile;
}

/** Weighted section evidence, rounded to two decimals and capped at 1. */
function scoreConfidence(profile, has) {
  let total = 0;
  if (has("contact")) total += CONFIDENCE_WEIGHTS.contact;
  if (has("topSkills")) total += CONFIDENCE_WEIGHTS.topSkills;
  if (profile.experience.length) total += CONFIDENCE_WEIGHTS.experience;
  if (profile.education.length) total += CONFIDENCE_WEIGHTS.education;
  if (profile.languages.length) total += CONFIDENCE_WEIGHTS.languages;
  if (profile.certifications.length) total += CONFIDENCE_WEIGHTS.certifications;
  if (profile.about) total += CONFIDENCE_WEIGHTS.about;
  if (has("projects")) total += CONFIDENCE_WEIGHTS.projects;
  return Math.min(1, Math.round(total * 100) / 100);
}

/** Plain sentences explaining what was absent, in a stable order. */
function explainGaps(profile, order) {
  const warnings = [];
  const keys = new Set(order);

  if (!profile.name) {
    warnings.push("No name was found in the first lines, so the profile has no name.");
  }
  if (!profile.contact.email && !profile.contact.phone && !profile.contact.url) {
    warnings.push("No email address, phone number or profile link was found in the text.");
  }
  if (!profile.experience.length) {
    warnings.push("No EXPERIENCE section was found, so the profile has no roles.");
  }
  if (!profile.education.length) {
    warnings.push("No EDUCATION section was found, so the profile has no education entries.");
  }
  if (!profile.skills.length) {
    warnings.push("No TOP SKILLS section was found, so the profile has no skills.");
  }

  const markers = LINKEDIN_MARKERS.filter((key) => keys.has(key));
  if (markers.length === 0) {
    warnings.push(
      "This does not look like a LinkedIn profile: there is no CONTACT, TOP SKILLS, LANGUAGES or CERTIFICATIONS section. It was read as an ordinary CV."
    );
  }

  return warnings;
}

/**
 * Does this text look like a LinkedIn profile rather than a CV?
 *
 * True when at least three LinkedIn-only section markers are present, or when
 * CONTACT and TOP SKILLS both are. Experience and Education do not count: every
 * CV has them.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isLinkedInProfileText(text) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const lines = normaliseLines(raw);
  if (!lines.some((line) => line.trim())) return false;
  const keys = headingsIn(lines);
  if (keys.includes("contact") && keys.includes("topSkills")) return true;
  return LINKEDIN_MARKERS.filter((key) => keys.includes(key)).length >= 3;
}

/**
 * Additive helper for the CV connector: the de-duplication key for a person's
 * experience entries, so a merge never repeats a role.
 */
export function experienceKey(entry) {
  const title = slugify(entry?.title, "");
  const company = slugify(entry?.company, "");
  return title || company ? `${title}|${company}` : "";
}

/** Additive helper for the CV connector: the key for an education entry. */
export function educationKey(entry) {
  const school = slugify(entry?.school, "");
  const degree = slugify(entry?.degree, "");
  return school || degree ? `${school}|${degree}` : "";
}
