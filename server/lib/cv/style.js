/**
 * Voice engine for CV rewrites.
 *
 * Three jobs, all mechanical:
 *   1. `analyseStyle`  — measure how a person writes (rhythm, register, spelling, tense).
 *   2. `styleMatch`    — grade a rewrite against that voice, 0-100, with reasons.
 *   3. `rewriteInStyle` — apply only the edits that cannot invent a fact, then check
 *      the result with `assertStyleSafe`.
 *
 * This is about authenticity, not evasion: nothing here tries to make text read as
 * less machine-written, and no rule adds a claim, a number or a name.
 *
 * Pure and deterministic — no clock, no randomness, no I/O, no dependencies beyond
 * `server/lib/text.js`. The same text always produces the same object.
 */
import { STOPWORDS, extractKeywords, sentences, tokenize } from "../text.js";

/** Points available per signal in `styleMatch`. Sums to 100. */
export const STYLE_WEIGHTS = Object.freeze({
  rhythm: 30,
  formality: 20,
  spelling: 15,
  verbs: 15,
  buzzwords: 10,
  contractions: 10
});

/** Informal markers per 100 words at or above which a CV reads "plain". */
export const FORMALITY_THRESHOLD = 2.5;

/** A sentence longer than this is a candidate for splitting at a conjunction. */
export const LONG_SENTENCE_WORDS = 32;

/** Both halves of a split sentence must keep at least this many words. */
const MIN_HALF_WORDS = 4;

/** Keyword extraction limit, high enough that no real CV is truncated. */
const KEYWORD_LIMIT = 5000;

/** How many strong verbs `analyseStyle` reports. */
const VERB_LIMIT = 10;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const round1 = (value) => Math.round(value * 10) / 10;

/** 8 -> "8", 8.25 -> "8.3" — used in the reason strings. */
const fmt = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function countMatches(source, re) {
  const found = String(source ?? "").match(re);
  return found ? found.length : 0;
}

function capitaliseFirst(text) {
  const index = String(text).search(/[A-Za-z]/);
  if (index === -1) return text;
  return text.slice(0, index) + text[index].toUpperCase() + text.slice(index + 1);
}

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Lines first, then sentences: CV bullets rarely end in a full stop. */
function sentenceUnits(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .flatMap((line) => sentences(line));
}

const BULLET_PREFIX = /^\s*(?:[-*•▪◦‣·]|\d+[.)])\s*/;
const stripBullet = (line) => String(line ?? "").replace(BULLET_PREFIX, "").trim();

/* ------------------------------------------------------------------ *
 * Buzzwords — detection and plain replacements
 * ------------------------------------------------------------------ */

/**
 * Fixed table. `variants` are [matched form, plain replacement] pairs, so the same
 * entry serves detection and rewriting (`leverage` -> `use`, `leveraged` -> `used`).
 */
export const BUZZWORDS = Object.freeze([
  { term: "leverage", variants: [["leverage", "use"], ["leverages", "uses"], ["leveraged", "used"], ["leveraging", "using"]] },
  { term: "synergy", variants: [["synergy", "combined effect"], ["synergies", "combined effects"], ["synergistic", "collaborative"]] },
  { term: "utilise", variants: [["utilise", "use"], ["utilises", "uses"], ["utilised", "used"], ["utilising", "using"], ["utilize", "use"], ["utilizes", "uses"], ["utilized", "used"], ["utilizing", "using"]] },
  { term: "facilitate", variants: [["facilitate", "run"], ["facilitates", "runs"], ["facilitated", "ran"], ["facilitating", "running"]] },
  { term: "spearhead", variants: [["spearhead", "lead"], ["spearheads", "leads"], ["spearheaded", "led"], ["spearheading", "leading"]] },
  { term: "robust", variants: [["robust", "reliable"]] },
  { term: "holistic", variants: [["holistic", "end-to-end"]] },
  { term: "stakeholder engagement", variants: [["stakeholder engagement", "working with stakeholders"], ["stakeholder engagements", "working with stakeholders"]] },
  { term: "paradigm", variants: [["paradigm", "model"], ["paradigms", "models"]] },
  { term: "best-in-class", variants: [["best-in-class", "leading"], ["best in class", "leading"]] },
  { term: "results-driven", variants: [["results-driven", "focused on outcomes"], ["results driven", "focused on outcomes"]] },
  { term: "dynamic professional", variants: [["dynamic professional", "professional"], ["dynamic professionals", "professionals"]] },
  { term: "passionate", variants: [["passionate", "keen"], ["passionately", "keenly"]] },
  { term: "detail-oriented", variants: [["detail-oriented", "careful"], ["detail oriented", "careful"], ["detail-orientated", "careful"]] },
  { term: "going forward", variants: [["going forward", "from now on"]] },
  { term: "circle back", variants: [["circle back", "follow up"]] },
  { term: "touch base", variants: [["touch base", "check in"]] },
  { term: "deep dive", variants: [["deep dive", "close look"], ["deep dives", "close looks"]] },
  { term: "value-add", variants: [["value-add", "benefit"], ["value add", "benefit"], ["value-adds", "benefits"], ["value adds", "benefits"]] }
]);

/** Word-bounded, hyphen-or-space phrase pattern. */
function flexiblePattern(form) {
  return String(form)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(escapeRe)
    .join("[- ]+");
}

const flexibleRe = (form, flags) => new RegExp(`(?<![A-Za-z0-9])${flexiblePattern(form)}(?![A-Za-z0-9])`, flags);

/**
 * The shared keyword extractor cannot see a phrase when one of its words is a
 * STOPWORD (`best in class`), so those few shapes are probed directly.
 */
const needsDirectProbe = (form) => tokenize(form).some((token) => STOPWORDS.has(token));

const normalisedPhrase = (form) => tokenize(form).join(" ");

/** Canonical buzzword labels found in the text, in table order. */
function findBuzzwords(source) {
  const text = String(source ?? "");
  if (!text.trim()) return [];
  const keywordSet = new Set(extractKeywords(text, { limit: KEYWORD_LIMIT }).map((row) => row.term));
  const hits = [];
  for (const entry of BUZZWORDS) {
    const found = entry.variants.some(([form]) =>
      needsDirectProbe(form) ? flexibleRe(form, "i").test(text) : keywordSet.has(normalisedPhrase(form))
    );
    if (found) hits.push(entry.term);
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * Filler openers
 * ------------------------------------------------------------------ */

/**
 * Every entry is a phrase that carries no information on its own. Two of them also
 * hedge ("Assisted with"), so they are re-worded rather than deleted — deleting the
 * hedge would quietly upgrade the claim.
 */
export const FILLER_OPENER_RULES = Object.freeze([
  { label: "Responsible for", replacement: "" },
  { label: "Worked on", replacement: "" },
  { label: "Involved in", replacement: "Contributed to " },
  { label: "Tasked with", replacement: "" },
  { label: "Helped to", replacement: "Helped " },
  { label: "Assisted with", replacement: "Supported " },
  { label: "Participated in", replacement: "Took part in " },
  { label: "Duties included", replacement: "" }
]);

export const FILLER_OPENERS = Object.freeze(FILLER_OPENER_RULES.map((rule) => rule.label));

const openerRe = (label) => new RegExp(`^${escapeRe(label)}\\b`, "i");

/** The filler opener this unit starts with, if any. */
function matchOpener(unit) {
  const body = stripBullet(unit);
  for (const rule of FILLER_OPENER_RULES) if (openerRe(rule.label).test(body)) return rule.label;
  return null;
}

function findFillerOpeners(source) {
  const hits = new Set();
  for (const line of String(source ?? "").split(/\r?\n/)) {
    const body = stripBullet(line);
    if (!body) continue;
    for (const unit of sentences(body)) {
      const opener = matchOpener(unit);
      if (opener) hits.add(opener);
    }
  }
  return FILLER_OPENERS.filter((label) => hits.has(label));
}

/* ------------------------------------------------------------------ *
 * Spelling
 * ------------------------------------------------------------------ */

/** [UK, US] pairs. `utilise`/`utilize` stays out: that is a buzzword, not spelling. */
export const SPELLING_PAIRS = Object.freeze([
  ["organise", "organize"], ["organised", "organized"], ["organises", "organizes"], ["organising", "organizing"],
  ["organisation", "organization"], ["organisations", "organizations"],
  ["programme", "program"], ["programmes", "programs"],
  ["licence", "license"], ["licences", "licenses"],
  ["analyse", "analyze"], ["analysed", "analyzed"], ["analysing", "analyzing"], ["analyser", "analyzer"], ["analysers", "analyzers"],
  ["centre", "center"], ["centres", "centers"],
  ["behaviour", "behavior"], ["behaviours", "behaviors"],
  ["colour", "color"], ["colours", "colors"], ["colourful", "colorful"],
  ["prioritise", "prioritize"], ["prioritised", "prioritized"], ["prioritises", "prioritizes"], ["prioritising", "prioritizing"],
  ["specialise", "specialize"], ["specialised", "specialized"], ["specialises", "specializes"], ["specialising", "specializing"],
  ["realise", "realize"], ["realised", "realized"], ["recognise", "recognize"], ["recognised", "recognized"],
  ["optimise", "optimize"], ["optimised", "optimized"], ["summarise", "summarize"], ["summarised", "summarized"],
  ["minimise", "minimize"], ["minimised", "minimized"], ["maximise", "maximize"], ["maximised", "maximized"],
  ["emphasise", "emphasize"], ["emphasised", "emphasized"], ["standardise", "standardize"], ["categorise", "categorize"],
  ["customise", "customize"], ["characterise", "characterize"], ["favourite", "favorite"], ["favourites", "favorites"]
]);

const UK_FORMS = new Set(SPELLING_PAIRS.map(([uk]) => uk));
const US_FORMS = new Set(SPELLING_PAIRS.map(([, us]) => us));

const UK_SUFFIX = /^[a-z]{4,}isation(s)?$/;
const US_SUFFIX = /^[a-z]{4,}ization(s)?$/;

/**
 * Counts UK and US markers. `mixed` also means "no evidence": a CV with no
 * -ise/-ise-shaped words has no spelling signal to match against.
 */
function spellingEvidence(source) {
  let uk = 0;
  let us = 0;
  const ukExample = [];
  const usExample = [];
  for (const token of tokenize(source)) {
    if (UK_FORMS.has(token) || (!US_FORMS.has(token) && UK_SUFFIX.test(token))) {
      uk += 1;
      if (ukExample.length < 2) ukExample.push(token);
      continue;
    }
    if (US_FORMS.has(token) || US_SUFFIX.test(token)) {
      us += 1;
      if (usExample.length < 2) usExample.push(token);
    }
  }
  const label = uk && us ? "mixed" : uk ? "UK" : us ? "US" : "mixed";
  return { uk, us, ukExample, usExample, label };
}

/* ------------------------------------------------------------------ *
 * Person, tense, informality
 * ------------------------------------------------------------------ */

/** Capital `I` plus the lowercase first-person forms; case matters ("US" is not "us"). */
const FIRST_PERSON_RE = /\bI\b|\b(?:me|my|mine|myself|we|our|ours|us)\b/g;
// Case-insensitive so a sentence-initial "She" counts; no third-person form collides
// with an acronym the way lowercase "us" would collide with "US".
const THIRD_PERSON_RE = /\b(?:he|she|him|his|her|hers|they|them|their|theirs)\b/gi;

const CONTRACTION_RE =
  /\b(?:i['’](?:m|ve|ll|d)|(?:don|doesn|didn|couldn|wouldn|shouldn|isn|aren|wasn|weren|hasn|haven|hadn)['’]t|(?:it|that|there|what|who|he|she|here|let)['’]s|(?:you|we|they)['’](?:re|ve|ll|d))\b/gi;

const SLANG_PATTERNS = [
  /\bgonna\b/gi, /\bwanna\b/gi, /\bgotta\b/gi, /\bkinda\b/gi, /\bsorta\b/gi, /\byeah\b/gi,
  /\bcool\b/gi, /\bawesome\b/gi, /\breally\b/gi, /\bbasically\b/gi, /\bpretty much\b/gi,
  /\ba lot of\b/gi, /\bloads of\b/gi, /\blots of\b/gi, /\bstuff\b/gi, /\bcheers\b/gi
];

/** Contractions, first person and slang — the three things that make prose read plain. */
function informality(source) {
  const text = String(source ?? "");
  const words = tokenize(text).length;
  const contractions = countMatches(text, CONTRACTION_RE);
  const firstPerson = countMatches(text, FIRST_PERSON_RE);
  const slang = SLANG_PATTERNS.reduce((total, re) => total + countMatches(text, re), 0);
  const raw = contractions + firstPerson + slang;
  const density = words ? round1((raw / words) * 100) : 0;
  return {
    words,
    contractions,
    firstPerson,
    slang,
    raw,
    density,
    formality: density >= FORMALITY_THRESHOLD ? "plain" : "formal"
  };
}

function personOf(source) {
  const first = countMatches(source, FIRST_PERSON_RE);
  const third = countMatches(source, THIRD_PERSON_RE);
  if (first && third) return "mixed";
  if (first) return "first";
  // No pronouns at all is the impersonal CV voice: nearest to third person.
  return "third";
}

const PAST_IRREGULAR = new Set([
  "led", "built", "shipped", "launched", "delivered", "reduced", "increased", "grew", "saved", "automated",
  "migrated", "designed", "owned", "scaled", "cut", "drove", "rebuilt", "rewrote", "streamlined", "overhauled",
  "consolidated", "founded", "rescued", "won", "closed", "doubled", "tripled", "eliminated", "replaced",
  "introduced", "established", "trained", "coached", "coordinated", "architected", "implemented", "secured",
  "accelerated", "ran", "wrote", "made", "took", "gave", "brought", "taught", "spoke", "chose", "began",
  "found", "held", "kept", "left", "met", "paid", "sent", "set", "spent", "stood", "told", "thought",
  "understood", "went", "came", "became", "saw", "said", "got", "bought", "caught", "dealt", "drew",
  "fought", "lost", "was", "were"
]);

const PRESENT_FORMS = new Set([
  "am", "is", "are", "be", "being", "manage", "manages", "build", "builds", "lead", "leads", "deliver",
  "delivers", "drive", "drives", "own", "owns", "oversee", "oversees", "work", "works", "support",
  "supports", "ensure", "ensures", "maintain", "maintains", "run", "runs", "create", "creates", "design",
  "designs", "develop", "develops", "coordinate", "coordinates", "provide", "provides", "handle", "handles",
  "write", "writes", "analyse", "analyze", "use", "uses", "report", "reports", "assist", "assists",
  "review", "reviews", "mentor", "mentors", "shape", "shapes", "owning", "leading"
]);

/** -ed is past, -ing and the bare/third-person forms above are present. */
function tenseOf(source) {
  let past = 0;
  let present = 0;
  for (const token of tokenize(source)) {
    if (PAST_IRREGULAR.has(token)) {
      past += 1;
      continue;
    }
    if (PRESENT_FORMS.has(token)) {
      present += 1;
      continue;
    }
    if (token.endsWith("ed") && token.length > 4) {
      past += 1;
      continue;
    }
    if (token.endsWith("ing") && token.length > 5) present += 1;
  }
  const total = past + present;
  if (!total) return "mixed";
  const pastShare = past / total;
  if (pastShare >= 0.75) return "past";
  if (pastShare <= 0.3) return "present";
  return "mixed";
}

/* ------------------------------------------------------------------ *
 * Strong verbs
 * ------------------------------------------------------------------ */

export const STRONG_VERBS = Object.freeze([
  "led", "built", "shipped", "launched", "delivered", "reduced", "increased", "grew", "saved", "automated",
  "migrated", "designed", "owned", "scaled", "cut", "drove", "rebuilt", "rewrote", "streamlined",
  "overhauled", "consolidated", "founded", "rescued", "doubled", "tripled", "eliminated", "replaced",
  "introduced", "established", "trained", "coached", "coordinated", "implemented", "secured", "accelerated",
  "architected", "mentored", "negotiated", "hired", "ran"
]);

const STRONG_VERB_SET = new Set(STRONG_VERBS);

/** Counted from tokens, not keywords: several of these are STOPWORDS in text.js. */
function strongVerbCounts(source) {
  const counts = new Map();
  for (const token of tokenize(source)) {
    if (STRONG_VERB_SET.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([verb, count]) => ({ verb, count }))
    .sort((a, b) => b.count - a.count || (a.verb < b.verb ? -1 : 1));
}

/* ------------------------------------------------------------------ *
 * analyseStyle
 * ------------------------------------------------------------------ */

function pickSamples(units, average) {
  const scored = units
    .map((text, index) => ({ text, index, words: tokenize(text).length }))
    .filter((row) => row.words >= 4);
  const pool = scored.length ? scored : units.map((text, index) => ({ text, index, words: 0 }));
  return pool
    .slice()
    .sort((a, b) => Math.abs(a.words - average) - Math.abs(b.words - average) || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((row) => row.text);
}

/**
 * Measure how a text is written.
 * @param {string} text
 * @returns {{
 *   sentences: number, avgSentenceWords: number, medianSentenceWords: number,
 *   longestSentenceWords: number, formality: "plain"|"formal",
 *   person: "first"|"third"|"mixed", spelling: "UK"|"US"|"mixed",
 *   tense: "past"|"present"|"mixed", contractions: boolean,
 *   emDashPer100Words: number, buzzwords: string[], fillerOpeners: string[],
 *   strongVerbs: {verb: string, count: number}[], sampleSentences: string[]
 * }}
 */
export function analyseStyle(text) {
  const source = String(text ?? "");
  const units = sentenceUnits(source);
  const lengths = units.map((unit) => tokenize(unit).length).filter((count) => count > 0);
  const totalWords = lengths.reduce((sum, count) => sum + count, 0);
  const average = lengths.length ? round1(totalWords / lengths.length) : 0;
  const words = tokenize(source).length;
  const info = informality(source);

  return {
    sentences: units.length,
    avgSentenceWords: average,
    medianSentenceWords: medianOf(lengths),
    longestSentenceWords: lengths.length ? Math.max(...lengths) : 0,
    formality: info.formality,
    person: personOf(source),
    spelling: spellingEvidence(source).label,
    tense: tenseOf(source),
    contractions: info.contractions > 0,
    emDashPer100Words: words ? round1((countMatches(source, /—/g) / words) * 100) : 0,
    buzzwords: findBuzzwords(source),
    fillerOpeners: findFillerOpeners(source),
    strongVerbs: strongVerbCounts(source).slice(0, VERB_LIMIT),
    sampleSentences: pickSamples(units, average)
  };
}

/* ------------------------------------------------------------------ *
 * styleMatch
 * ------------------------------------------------------------------ */

function relativeGap(a, b) {
  const largest = Math.max(a, b);
  return largest ? Math.abs(a - b) / largest : 0;
}

const verbList = (verbs) => verbs.map((row) => row.verb);

function scoreRhythm(candidate, reference) {
  const averageGap = relativeGap(candidate.avgSentenceWords, reference.avgSentenceWords);
  const medianGap = relativeGap(candidate.medianSentenceWords, reference.medianSentenceWords);
  const penalty = Math.min(1, (0.7 * averageGap + 0.3 * medianGap) / 0.6);
  return {
    score: round1(STYLE_WEIGHTS.rhythm * (1 - penalty)),
    reason:
      `your sentences average ${fmt(candidate.avgSentenceWords)} words; ` +
      `the rewrite averages ${fmt(reference.avgSentenceWords)} ` +
      `(medians ${fmt(candidate.medianSentenceWords)} and ${fmt(reference.medianSentenceWords)})`
  };
}

function scoreFormality(candidate, reference, candidateDensity, referenceDensity) {
  const same = candidate.formality === reference.formality;
  return {
    score: same ? STYLE_WEIGHTS.formality : 0,
    reason:
      `your CV reads ${candidate.formality} (${fmt(candidateDensity)} informal markers per 100 words); ` +
      `the rewrite reads ${reference.formality} (${fmt(referenceDensity)})`
  };
}

function scoreSpelling(candidate, reference, evidenceA, evidenceB) {
  if (candidate.spelling === reference.spelling) {
    const same = candidate.spelling === "mixed" ? "no clear UK/US spelling signal in either text" : `both spell ${candidate.spelling} English`;
    return { score: STYLE_WEIGHTS.spelling, reason: same };
  }
  if (candidate.spelling === "mixed" || reference.spelling === "mixed") {
    const known = candidate.spelling === "mixed" ? reference : candidate;
    return {
      score: 8,
      reason: `only one text declares a spelling: ${known.spelling === "UK" ? "UK" : "US"} English — mid credit`
    };
  }
  const quoted = (evidence) => {
    const examples = evidence.label === "UK" ? evidence.ukExample : evidence.usExample;
    return examples.length ? `"${examples.join('", "')}"` : "no examples";
  };
  return {
    score: 0,
    reason: `your CV spells ${candidate.spelling} (${quoted(evidenceA)}); the rewrite spells ${reference.spelling} (${quoted(evidenceB)})`
  };
}

function scoreVerbs(candidateText, referenceText) {
  const candidateVerbs = verbList(strongVerbCounts(candidateText));
  const referenceVerbs = verbList(strongVerbCounts(referenceText));
  const candidateSet = new Set(candidateVerbs);
  const referenceSet = new Set(referenceVerbs);
  const union = new Set([...candidateSet, ...referenceSet]);
  const shared = [...candidateSet].filter((verb) => referenceSet.has(verb)).sort();

  if (!union.size) {
    return { score: STYLE_WEIGHTS.verbs, reason: "neither text uses achievement verbs" };
  }
  if (!shared.length) {
    return {
      score: 0,
      reason:
        `the rewrite uses none of your verbs (yours: ${candidateVerbs.join(", ") || "none"}; ` +
        `the rewrite's: ${referenceVerbs.join(", ") || "none"})`
    };
  }
  return {
    score: round1((STYLE_WEIGHTS.verbs * shared.length) / union.size),
    reason:
      `the rewrite shares ${shared.length} of ${union.size} achievement verbs with your CV: ${shared.join(", ")}`
  };
}

function scoreBuzzwords(candidate, reference, candidateWords, referenceWords) {
  const density = (hits, words) => (words ? round1((hits / words) * 100) : 0);
  const candidateDensity = density(candidate.buzzwords.length, candidateWords);
  const referenceDensity = density(reference.buzzwords.length, referenceWords);
  const delta = Math.abs(candidateDensity - referenceDensity);
  return {
    score: round1(STYLE_WEIGHTS.buzzwords * Math.max(0, 1 - delta / 2)),
    reason: `your CV uses ${fmt(candidateDensity)} buzzwords per 100 words; the rewrite uses ${fmt(referenceDensity)}`
  };
}

function scoreContractions(candidate, candidateCount, reference, referenceCount) {
  const same = candidate.contractions === reference.contractions;
  const describe = (count) => (count ? `${count} contraction${count === 1 ? "" : "s"}` : "no contractions");
  return {
    score: same ? STYLE_WEIGHTS.contractions : 0,
    reason: `your CV uses ${describe(candidateCount)}; the rewrite uses ${describe(referenceCount)}`
  };
}

/**
 * How much does `referenceText` sound like the person who wrote `candidateText`?
 * @param {string} candidateText the person's own CV
 * @param {string} referenceText the rewrite being judged
 * @returns {{ score: number, reasons: string[] }} score is an integer 0-100
 */
export function styleMatch(candidateText, referenceText) {
  const candidate = analyseStyle(candidateText);
  const reference = analyseStyle(referenceText);
  const candidateInfo = informality(candidateText);
  const referenceInfo = informality(referenceText);
  const candidateEvidence = spellingEvidence(candidateText);
  const referenceEvidence = spellingEvidence(referenceText);

  const parts = [
    scoreRhythm(candidate, reference),
    scoreFormality(candidate, reference, candidateInfo.density, referenceInfo.density),
    scoreSpelling(candidate, reference, candidateEvidence, referenceEvidence),
    scoreVerbs(candidateText, referenceText),
    scoreBuzzwords(candidate, reference, candidateInfo.words, referenceInfo.words),
    scoreContractions(candidate, candidateInfo.contractions, reference, referenceInfo.contractions)
  ];

  const total = parts.reduce((sum, part) => sum + part.score, 0);
  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    reasons: parts.map((part) => part.reason)
  };
}

/* ------------------------------------------------------------------ *
 * rewriteInStyle
 * ------------------------------------------------------------------ */

const SPLIT_CONJUNCTIONS = [", and ", ", but ", ", so ", ", yet ", " and ", " but ", " so "];

function splitLongSentence(unit) {
  const words = tokenize(unit).length;
  if (words <= LONG_SENTENCE_WORDS) return null;

  const lower = unit.toLowerCase();
  let best = null;
  SPLIT_CONJUNCTIONS.forEach((conjunction, order) => {
    let index = lower.indexOf(conjunction);
    while (index !== -1) {
      const headWords = tokenize(unit.slice(0, index)).length;
      const tailWords = words - headWords;
      if (headWords >= MIN_HALF_WORDS && tailWords >= MIN_HALF_WORDS) {
        // Closest to the middle wins; comma joins beat bare "and" on a tie.
        const score = Math.abs(headWords - words / 2) + order * 0.4;
        if (!best || score < best.score) best = { index, conjunction, score };
      }
      index = lower.indexOf(conjunction, index + 1);
    }
  });
  if (!best) return null;

  const head = unit.slice(0, best.index).replace(/[\s,]+$/, "");
  const tail = unit.slice(best.index + best.conjunction.length).trim();
  if (!head || !tail) return null;

  const conjunctionWord = best.conjunction.trim().replace(/^,/, "").trim();
  return {
    text: `${head}. ${capitaliseFirst(tail)}`,
    reason: `Split a ${words}-word sentence at "${conjunctionWord}" into two sentences.`
  };
}

function record(changes, before, after, reason) {
  if (before === after) return;
  if (changes.some((change) => change.before === before && change.after === after)) return;
  changes.push({ before, after, reason });
}

function stripFiller(unit, changes) {
  for (const rule of FILLER_OPENER_RULES) {
    const match = unit.match(new RegExp(`^${escapeRe(rule.label)}\\b[\\s:,-]*`, "i"));
    if (!match) continue;
    const rest = unit.slice(match[0].length).trim();
    if (!rest) return unit;

    if (rule.replacement) {
      // Keep the hedge, drop the padding: "Helped to manage" -> "Helped manage".
      const next = `${rule.replacement}${rest}`;
      record(changes, unit, next, `Replaced the filler opener "${rule.label}" with plain wording "${rule.replacement.trim()}".`);
      return next;
    }
    const next = capitaliseFirst(rest.replace(/^(?:the|a|an)\s+/i, ""));
    if (!next) return unit;
    record(changes, unit, next, `Removed the filler opener "${rule.label}".`);
    return next;
  }
  return unit;
}

function replaceBuzzwords(unit, changes) {
  let output = unit;
  for (const entry of BUZZWORDS) {
    for (const [form, plain] of entry.variants) {
      let matched = false;
      output = output.replace(flexibleRe(form, "gi"), (hit) => {
        matched = true;
        return /^[A-Z]/.test(hit) ? capitaliseFirst(plain) : plain;
      });
      if (matched) record(changes, form, plain, `Replaced buzzword "${form}" with plain wording "${plain}".`);
    }
  }
  return output;
}

function convertSpelling(unit, target, changes) {
  if (target !== "UK" && target !== "US") return unit;
  let output = unit;

  for (const [uk, us] of SPELLING_PAIRS) {
    const from = target === "UK" ? us : uk;
    const to = target === "UK" ? uk : us;
    let matched = false;
    output = output.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(from)}(?![A-Za-z0-9])`, "gi"), (hit) => {
      matched = true;
      return /^[A-Z]/.test(hit) ? capitaliseFirst(to) : to;
    });
    if (matched) record(changes, from, to, `Converted ${target === "UK" ? "US" : "UK"} spelling "${from}" to ${target} spelling "${to}".`);
  }

  // Nouns the table does not list: -isation / -ization.
  const suffixFrom = target === "UK" ? "ization" : "isation";
  const suffixTo = target === "UK" ? "isation" : "ization";
  const suffixRe = new RegExp(`(?<![A-Za-z0-9])([A-Za-z]{4,})${suffixFrom}(s?)(?![A-Za-z0-9])`, "gi");
  output = output.replace(suffixRe, (hit, stem, plural) => {
    const next = `${stem}${suffixTo}${plural}`;
    record(changes, hit, next, `Converted ${target === "UK" ? "US" : "UK"} spelling "${hit}" to ${target} spelling "${next}".`);
    return next;
  });
  return output;
}

function applyUnitRules(unit, style, changes) {
  let output = stripFiller(unit, changes);
  output = replaceBuzzwords(output, changes);
  output = convertSpelling(output, style?.spelling, changes);
  const split = splitLongSentence(output);
  if (!split) return output;
  record(changes, output, split.text, split.reason);
  return split.text;
}

function rewriteLine(line, style, changes) {
  const leadMatch = line.match(/^(\s*(?:[-*•▪◦‣·]|\d+[.)])?\s*)/);
  const lead = leadMatch ? leadMatch[1] : "";
  const rest = line.slice(lead.length);
  const trailMatch = rest.match(/\s*$/);
  const trail = trailMatch ? trailMatch[0] : "";
  const body = trail ? rest.slice(0, rest.length - trail.length) : rest;
  if (!body) return line;

  const before = changes.length;
  const units = sentences(body).map((unit) => applyUnitRules(unit, style, changes));
  // Only rebuild the line when a rule actually fired: untouched text stays byte-identical.
  if (changes.length === before) return line;
  return `${lead}${units.join(" ")}${trail}`;
}

/**
 * Apply the mechanical edits only. No rule adds a fact; every rule is reversible
 * from the returned `changes` list.
 * @param {string} text
 * @param {{ spelling?: "UK"|"US"|"mixed" }} style
 * @returns {{ text: string, changes: {before: string, after: string, reason: string}[] }}
 */
export function rewriteInStyle(text, style) {
  const source = String(text ?? "");
  const changes = [];
  const rewritten = source
    .split(/\r?\n/)
    .map((line) => rewriteLine(line, style ?? {}, changes))
    .join("\n");
  return { text: rewritten, changes };
}

/* ------------------------------------------------------------------ *
 * assertStyleSafe
 * ------------------------------------------------------------------ */

/** Digit runs, compared as written: "1,200" and "1200" are different numbers. */
function numberTokens(text) {
  return String(text ?? "").match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
}

const SENTENCE_STARTERS = new Set([
  "The", "A", "An", "This", "That", "These", "Those", "It", "Its", "We", "I", "In", "On", "At", "For",
  "With", "After", "Before", "During", "When", "While", "And", "But", "So", "As", "By", "From", "Our",
  "His", "Her", "Their", "They", "He", "She", "If", "To", "Of", "While"
]);

/**
 * Runs of two or more capitalised words. A leading sentence-starter ("The", "And")
 * is trimmed first, because a split sentence can legitimately capitalise one.
 */
function properNounSequences(text) {
  const found = new Set();
  const chunks = String(text ?? "").split(/(?<=[.!?])\s+|\r?\n/);

  for (const chunk of chunks) {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    let run = [];
    let runStart = -1;

    const flush = () => {
      if (run.length >= 2 && runStart === 0 && SENTENCE_STARTERS.has(run[0])) run = run.slice(1);
      if (run.length >= 2) found.add(run.join(" "));
      run = [];
      runStart = -1;
    };

    words.forEach((word, index) => {
      const cleaned = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const capitalised = cleaned.length > 1 && /^[A-Z]/.test(cleaned);
      if (!capitalised) {
        flush();
        return;
      }
      if (!run.length) runStart = index;
      run.push(cleaned);
    });
    flush();
  }
  return found;
}

/**
 * Would this rewrite be unsafe to show? Checks the three things that turn tailoring
 * into fabrication: a new number, a new name, or a text that changed size absurdly.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function assertStyleSafe(before, after) {
  const original = String(before ?? "");
  const rewritten = String(after ?? "");
  const reasons = [];

  const originalNumbers = new Set(numberTokens(original));
  const introduced = [...new Set(numberTokens(rewritten))].filter((value) => !originalNumbers.has(value));
  if (introduced.length) {
    reasons.push(
      `the rewrite introduces ${introduced.map((value) => `"${value}"`).join(", ")} — ` +
        `${introduced.length === 1 ? "that number is" : "those numbers are"} not in the original`
    );
  }

  const originalNouns = properNounSequences(original);
  const introducedNouns = [...properNounSequences(rewritten)].filter((name) => !originalNouns.has(name));
  if (introducedNouns.length) {
    reasons.push(
      `the rewrite introduces ${introducedNouns.length === 1 ? "a name" : "names"} that ` +
        `${introducedNouns.length === 1 ? "is" : "are"} not in the original: ` +
        introducedNouns.map((name) => `"${name}"`).join(", ")
    );
  }

  const beforeWords = tokenize(original).length;
  const afterWords = tokenize(rewritten).length;
  if (!beforeWords) {
    if (afterWords) reasons.push("the original has no words to rewrite, so no length ratio can hold");
  } else {
    const ratio = afterWords / beforeWords;
    if (ratio < 0.45) reasons.push(`the rewrite is ${Math.round(ratio * 100)}% of the original length (minimum 45%)`);
    if (ratio > 2.2) reasons.push(`the rewrite is ${Math.round(ratio * 100)}% of the original length (maximum 220%)`);
  }

  return { ok: reasons.length === 0, reasons };
}
