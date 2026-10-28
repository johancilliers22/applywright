/**
 * Shared text primitives. Deliberately dependency-free and deterministic:
 * the same input always produces the same keywords, because scores, alerts and
 * tests all depend on that.
 */
import { createHash } from "node:crypto";

export const STOPWORDS = new Set(
  `a an and are as at be been being but by can could did do does doing for from had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
  about above after again against all also am any because before below between both during each few further get got make made may might must much need new next one two three work working works role roles job jobs position positions company team teams candidate candidates applicant applicants apply applying application applications experience experienced skills skill ability able strong good great excellent required require requirements required responsibilities responsibility including include includes etc via per plus using use used uses across within without able within across year years month months day days time full part remote hybrid onsite salary benefits offer offers looking seeking join joining help helping support supporting manage managing managed lead leading led build building built create creating created develop developing developed design designing designed deliver delivering delivered improve improving improved ensure ensuring provide providing provided`
    .split(/\s+/)
    .filter(Boolean)
);

const TRAILING_PUNCT = /^[^\w+#.]+|[^\w+#.]+$/g;

/** Lowercase, strip punctuation that carries no meaning, keep c++, c#, node.js. */
export function normalizeTerm(term) {
  return String(term ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text) {
  const normalised = normalizeTerm(text);
  if (!normalised) return [];
  return normalised
    .split(/[\s\-]+/)
    .map((token) => token.replace(TRAILING_PUNCT, ""))
    .filter((token) => token.length > 1);
}

const isMeaningful = (token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token);

/**
 * Keyword extraction with adjacent-phrase detection.
 * Unigrams score by frequency; bigrams and trigrams are kept when they repeat,
 * because "data pipeline" is a better signal than "data" plus "pipeline".
 * @returns {{ term: string, weight: number, count: number }[]}
 */
export function extractKeywords(text, { limit = 40, phrases = true } = {}) {
  const tokens = tokenize(text);
  if (!tokens.length) return [];

  const counts = new Map();
  const bump = (term, amount = 1) => counts.set(term, (counts.get(term) ?? 0) + amount);

  for (const token of tokens) if (isMeaningful(token)) bump(token, 1);

  if (phrases) {
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const pair = [tokens[i], tokens[i + 1]];
      if (!pair.every(isMeaningful)) continue;
      bump(`${pair[0]} ${pair[1]}`, 0.9);
    }
    for (let i = 0; i < tokens.length - 2; i += 1) {
      const triple = [tokens[i], tokens[i + 1], tokens[i + 2]];
      if (!triple.every(isMeaningful)) continue;
      bump(triple.join(" "), 0.7);
    }
  }

  const ranked = [...counts.entries()]
    .map(([term, weight]) => ({ term, weight: Math.round(weight * 100) / 100, count: Math.max(1, Math.round(weight)) }))
    .filter((row) => row.weight >= 1 || row.term.includes(" "))
    .sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1));

  // Drop a phrase when its unigram parts already cover it and it only appeared once.
  const seen = new Set();
  const output = [];
  for (const row of ranked) {
    if (seen.has(row.term)) continue;
    seen.add(row.term);
    output.push(row);
    if (output.length >= limit) break;
  }
  return output;
}

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does the term occur as a whole phrase in the text? */
export function containsTerm(haystack, term) {
  const normalised = normalizeTerm(haystack);
  if (!normalised || !term) return false;
  return new RegExp(`(^|[^a-z0-9+#.])${escapeRe(normalizeTerm(term))}([^a-z0-9+#.]|$)`, "i").test(normalised);
}

/**
 * Which of the job's keywords appear in the CV, and which are missing.
 * @returns {{ matched: string[], missing: string[], ratio: number }}
 */
export function keywordCoverage(cvText, jobText, { limit = 25 } = {}) {
  const jobKeywords = extractKeywords(jobText, { limit }).map((row) => row.term);
  const matched = [];
  const missing = [];
  for (const term of jobKeywords) {
    if (containsTerm(cvText, term)) matched.push(term);
    else missing.push(term);
  }
  return { matched, missing, ratio: pct(matched.length, jobKeywords.length) };
}

export function sentences(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function bulletize(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•▪◦‣·]|\d+[.)])\s+/.test(line) || (line.length > 40 && !/[.!?]$/.test(line)))
    .map((line) => line.replace(/^(?:[-*•▪◦‣·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** Rounded percentage, 0 when the whole is 0. */
export function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function sha256(text) {
  return createHash("sha256").update(String(text ?? "")).digest("hex");
}

export function slugify(text, fallback = "untitled") {
  const slug = String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

/** Count words, numbers and hard metrics — used by the achievement scorer. */
export function metrics(text) {
  const source = String(text ?? "");
  const numbers = source.match(/\b\d+(?:[.,]\d+)?\s?(?:%|k|m|bn|million|thousand|x)?\b/gi) ?? [];
  const currency = source.match(/[£$€]\s?\d[\d,.]*/g) ?? [];
  const verbs = source.match(
    /\b(led|built|shipped|launched|delivered|reduced|increased|grew|saved|automated|migrated|designed|owned|scaled|cut|drove|negotiated|hired|mentored)\b/gi
  ) ?? [];
  return {
    numbers: numbers.length,
    currency: currency.length,
    strongVerbs: verbs.length,
    words: source.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Layout that an extractor had to flatten before the text could be read.
 *
 * Lives in the shared text layer because both the extractor (which measures it)
 * and the scorer (which must dock formatting for it) need the same threshold, and
 * the scorer is deliberately allowed exactly one project dependency.
 *
 * @param {{ tables?: number, columns?: number, textBoxes?: number }|null|undefined} layout
 * @returns {boolean}
 */
export function hasLayoutRisk(layout) {
  if (!layout || typeof layout !== "object") return false;
  const tables = Number(layout.tables) || 0;
  const columns = Number(layout.columns) || 1;
  const textBoxes = Number(layout.textBoxes) || 0;
  return tables > 0 || columns > 1 || textBoxes > 0;
}