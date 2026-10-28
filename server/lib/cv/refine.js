/**
 * Applywright — instruction-driven refinement of a generated pack.
 *
 * After `packs/build.js` has produced a pack the candidate asks for changes in
 * their own words: "make the summary shorter", "less formal", "this bullet is
 * too long", "use my own wording here". This module turns that sentence into a
 * deterministic edit of the pack's *text* fields, or — when a model is supplied —
 * into one JSON-mode call whose reply is validated and grounded before any of it
 * ships.
 *
 * Two paths, one invariant:
 *   - `model` present and well behaved → one JSON call, hard-validated, then every
 *     proposed string is re-checked before it is allowed out.
 *   - otherwise                        → the rules in this file, which do real work.
 *
 * The invariant is `groundChanges`: a refinement may rephrase, reorder, shorten or
 * lengthen, but it may never invent a number, an employer, a job title, a date, a
 * qualification or a name, and it may never lose one either. A change that fails
 * is reverted and reported in `warnings` — never shipped.
 *
 * What this module does NOT do: rebuild the printable pack. `cvHtml` needs the
 * profile, the CV text and the job, which live in the HTTP layer; refining text
 * and re-rendering are deliberately separate steps (see NOTES-refine.md for the
 * contract). The `pack` returned here carries the refined text fields and the
 * *stale* `cvHtml`/`cvTextPlain` it was given.
 *
 * Pure by construction: no database, no network, no clock, no randomness. The
 * model is injected, so the rules path is byte-for-byte repeatable.
 */

import { STOPWORDS, sentences, tokenize } from "../text.js";
import { assertGrounded } from "./tailor.js";

const MAX_WARNINGS = 12;
const MAX_PROMPT_CV_CHARS = 4000;

/* ------------------------------------------------------------------------- *
 * Small text helpers
 * ------------------------------------------------------------------------- */

function toText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function collapse(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function wordCount(value) {
  const text = collapse(value);
  return text ? text.split(" ").length : 0;
}

function upperFirst(value) {
  const text = toText(value);
  if (!text) return "";
  return text[0].toUpperCase() + text.slice(1);
}

function lowerFirst(value) {
  const text = toText(value);
  if (!text) return "";
  return text[0].toLowerCase() + text.slice(1);
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function escapeRe(value) {
  return toText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addWarning(warnings, message) {
  const text = collapse(message);
  if (!text || warnings.includes(text) || warnings.length >= MAX_WARNINGS) return;
  warnings.push(text);
}

/** Copy the capitalisation of the matched text onto its replacement. */
function matchCase(match, replacement) {
  const source = toText(match);
  const target = toText(replacement);
  if (!target) return "";
  if (source.length > 1 && source === source.toUpperCase() && /[A-Z]/.test(source)) {
    return target.toUpperCase();
  }
  if (/^[A-Z]/.test(source)) return upperFirst(target);
  return target;
}

/**
 * Whole-word replacement from an ordered list of [from, to] pairs.
 * @returns {{ text: string, count: number }}
 */
function replacePairs(text, pairs) {
  let out = toText(text);
  let count = 0;
  for (const [from, to] of pairs) {
    if (!from) continue;
    const pattern = new RegExp(`\\b${escapeRe(from)}\\b`, "gi");
    out = out.replace(pattern, (match) => {
      count += 1;
      return matchCase(match, to);
    });
  }
  return { text: out, count };
}

/** Ordered replacement of whole regex patterns, used for filler phrases. */
function replacePatterns(text, pairs) {
  let out = toText(text);
  let count = 0;
  for (const [pattern, replacement] of pairs) {
    out = out.replace(pattern, (match) => {
      count += 1;
      return typeof replacement === "function" ? replacement(match) : replacement;
    });
  }
  return { text: out, count };
}

/** Tidy the punctuation and spacing that word surgery leaves behind. */
function tidy(text) {
  return toText(text)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\1+/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/^[\s,;:]+/, "")
    .replace(/\s+$/, "");
}

/** Re-capitalise the first letter of every sentence. */
function capitaliseSentences(value) {
  return toText(value)
    .split(/(?<=[.!?]\s+)/)
    .map((sentence) => upperFirst(sentence))
    .join("");
}

/* ------------------------------------------------------------------------- *
 * Figures — what "keep every number" means
 * ------------------------------------------------------------------------- */

const SPELLED_NUMBERS = new Map([
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["twenty", "20"],
  ["thirty", "30"],
  ["fifty", "50"],
  ["hundred", "100"],
  ["thousand", "1000"],
  ["million", "1000000"],
]);

const FIGURE_RE =
  /(\d[\d,]*(?:\.\d+)?)\s?(%|percent|per\s?cent|k\b|m\b|bn\b|million\b|billion\b|thousand\b|times\b|x\b)?/gi;

/**
 * Every numeric claim in a piece of text, canonicalised so "£240k" and "£240,000"
 * compare equal. Spelled-out numbers count too: "led three teams" is a claim.
 * @returns {{ key: string, raw: string }[]}
 */
function figureEntries(text) {
  const source = toText(text);
  const entries = [];
  for (const match of source.matchAll(FIGURE_RE)) {
    const digits = match[1].replace(/,/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const unit = toText(match[2]).toLowerCase().replace(/\s+/g, " ");
    if (unit === "k" || unit === "thousand") value *= 1e3;
    else if (unit === "m" || unit === "million") value *= 1e6;
    else if (unit === "bn" || unit === "billion") value *= 1e9;
    const percent = unit === "%" || unit === "percent" || unit === "per cent";
    const raw = percent ? `${match[1]}%` : match[1];
    entries.push({ key: `${Number(value.toPrecision(12))}${percent ? "%" : ""}`, raw });
  }
  for (const match of source.matchAll(/\b([A-Za-z]+)\b/g)) {
    const key = SPELLED_NUMBERS.get(match[1].toLowerCase());
    if (key) entries.push({ key, raw: match[1] });
  }
  return entries;
}

function figureKeySet(text) {
  return new Set(figureEntries(text).map((entry) => entry.key));
}

/* ------------------------------------------------------------------------- *
 * Grounding
 * ------------------------------------------------------------------------- */

/**
 * Does `after` stay within the facts of `before`?
 *
 * Rephrasing is free; facts are not. Every figure in `after` must already be in
 * `before` (or, when `allowFiguresFromContext` is set, in `context` — the only
 * legitimate case is an expansion that quotes a measurable detail the CV already
 * states), and every figure in `before` must survive into `after`. The remaining
 * checks — dates, qualifications, job titles, employers and other proper nouns —
 * are delegated to `assertGrounded` in `cv/tailor.js`, which already encodes that
 * philosophy and keeps the two modules from drifting apart.
 *
 * @param {string} before the current text
 * @param {string} after the candidate replacement
 * @param {{ context?: string, allowFiguresFromContext?: boolean }} [options]
 *   `context` is the pack's own text (pass it so a rewrite may name something the
 *   CV states); `allowFiguresFromContext` relaxes the "new figure" rule for
 *   expansion, never the "dropped figure" rule.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function groundChanges(before, after, options = {}) {
  const source = toText(before);
  const target = toText(after);
  const context = toText(options.context);

  if (!source.trim()) {
    return { ok: false, reasons: ["there is no original text to check the change against"] };
  }
  if (!target.trim()) {
    return { ok: false, reasons: ["the change is empty"] };
  }

  const reasons = [];

  // Names, dates, titles and qualifications: reuse tailor's checker. Its own
  // figure rule is narrower than ours (it only looks for *new* figures, against
  // the original alone), so it is switched off here and replaced below.
  const entityCheck = assertGrounded(source, target, { context, figures: false });
  reasons.push(...entityCheck.reasons);

  const beforeKeys = figureKeySet(source);
  const afterKeys = figureKeySet(target);
  const contextKeys = figureKeySet(context);
  const reported = new Set();

  for (const entry of figureEntries(target)) {
    if (beforeKeys.has(entry.key)) continue;
    if (options.allowFiguresFromContext && contextKeys.has(entry.key)) continue;
    const reason = `new figure ${entry.raw} is not in the original`;
    if (reported.has(reason)) continue;
    reported.add(reason);
    reasons.push(reason);
  }

  for (const entry of figureEntries(source)) {
    if (afterKeys.has(entry.key)) continue;
    const reason = `figure ${entry.raw} was dropped`;
    if (reported.has(reason)) continue;
    reported.add(reason);
    reasons.push(reason);
  }

  const unique = dedupe(reasons);
  return { ok: unique.length === 0, reasons: unique };
}

/* ------------------------------------------------------------------------- *
 * Instruction parsing
 * ------------------------------------------------------------------------- */

/**
 * Rewrite the negative phrasings the vocabulary would otherwise read backwards.
 * "less formal" must not reach the `formal` matcher, and "too long" is a request
 * to shorten, not to expand.
 */
function normaliseInstruction(value) {
  return toText(value)
    .toLowerCase()
    .replace(/\b(?:less|not\s+(?:so|too|very))\s+formal\b/g, " plain ")
    .replace(/\b(?:less|not\s+(?:so|too|very))\s+senior\b/g, " junior ")
    .replace(/\b(?:less|not\s+(?:so|too|very))\s+technical\b/g, " less jargon ")
    .replace(/\binformal\b/g, " plain ")
    .replace(/\bplain\s+english\b/g, " less jargon ")
    .replace(/\b(?:too|overly)\s+long\b|\blong[- ]winded\b|\btoo\s+wordy\b|\boverlong\b/g, " shorter ");
}

const INTENT_PATTERNS = [
  {
    id: "shorter",
    pattern:
      /\b(?:short|shorten|shorter|shortened|concise[rd]?|condense[ds]?|tighten(?:ed|ing)?|trim(?:med)?|compact|brief(?:er)?|punchy|snappier|less wordy|cut (?:it|this) down)\b/,
  },
  {
    id: "longer",
    pattern: /\b(?:longer|expand(?:ed|ing)?|elaborate|more detail|flesh (?:it|this) out|beef (?:it|this) up|fuller|more depth)\b/,
  },
  {
    id: "formal",
    pattern: /\b(?:more formal|formal(?:ly)?|professional(?: tone)?|polished|corporate|businesslike|business-like|less casual|less chatty)\b/,
  },
  {
    id: "plain",
    pattern: /\b(?:plain(?:er)?|casual(?:ly)?|conversational|relaxed|chatty|friendly|less stiff|simple words)\b/,
  },
  {
    id: "senior",
    pattern:
      /\b(?:more senior|senior(?:ity)?|leadership(?: tone)?|executive presence|stronger|confident(?: tone)?|assertive|authoritative)\b/,
  },
  {
    id: "junior",
    pattern: /\b(?:junior|modest|downplay|humble|understated|less grandiose|toned down)\b/,
  },
  {
    id: "technical",
    pattern: /\b(?:technical(?:ly)?|engineering tone|tech(?:nical)? detail|systems detail|hands-on detail)\b/,
  },
  {
    id: "less-jargon",
    pattern: /\b(?:jargon|buzzwords?|less jargon|no jargon|simplif(?:y|ied)|simpler|everyday (?:words|language)|accessible|less corporate)\b/,
  },
  {
    id: "first-person",
    pattern: /\b(?:first[- ]person|in my own voice|personal voice|use "i"|use the word i|speak as i|more personal)\b/,
  },
  {
    id: "third-person",
    pattern: /\b(?:third[- ]person|impersonal|no "i"|without "i"|avoid "i"|drop the "i")\b/,
  },
  {
    id: "british",
    pattern: /\b(?:british(?: english| spelling)?|uk english|uk spelling|en[- ]gb|britain)\b/,
  },
  {
    id: "american",
    pattern: /\b(?:american(?: english| spelling)?|us english|us spelling|en[- ]us|united states)\b/,
  },
  {
    id: "verbatim",
    pattern: /\b(?:my own wording|own words|word (?:it|this) as|say it (?:like|as)|use (?:this|the) (?:phrase|wording)|verbatim|exactly as i (?:wrote|said))\b/,
  },
];

const TARGET_PATTERNS = [
  {
    targets: ["summary"],
    pattern: /\b(?:summary|summaries|profile|intro|introduction|opening|personal statement|headline)\b/,
  },
  {
    targets: ["bullets"],
    pattern: /\b(?:bullets?|bullet points?|experience|work history|achievements?|roles?)\b/,
  },
  {
    targets: ["letter"],
    pattern: /\b(?:cover(?:ing)? letter|letter|covering note)\b/,
  },
  {
    targets: ["answers"],
    pattern: /\b(?:answers?|screening|questions?)\b/,
  },
];

const TARGET_ORDER = ["summary", "bullets", "letter", "answers"];

const PACK_TARGETS = /\b(?:everything|everywhere|throughout|the pack|whole (?:pack|document|thing)|entire (?:pack|document|thing)|all of it)\b/;
const CV_TARGETS = /\b(?:cv|resume|résumé)\b/;
const ALL_TARGETS = /\ball\b/;

/** Quoted phrases: "…", “…”, '…' and ‘…’, never an apostrophe inside a word. */
function quotedPhrases(value) {
  const source = toText(value);
  const phrases = [];
  const doubleQuoted = /"([^"\n]{2,200})"|“([^”\n]{2,200})”/g;
  for (const match of source.matchAll(doubleQuoted)) {
    const phrase = collapse(match[1] ?? match[2] ?? "");
    if (phrase) phrases.push(phrase);
  }
  const singleQuoted = /(?:^|[\s([])'([^'\n]{2,200})'(?=$|[\s).,;:!?])/g;
  for (const match of source.matchAll(singleQuoted)) {
    const phrase = collapse(match[1] ?? "");
    if (phrase) phrases.push(phrase);
  }
  return dedupe(phrases);
}

/**
 * Read one free-text instruction.
 *
 * Recognises, case-insensitively and tolerantly: shorter, longer, formal, plain,
 * senior, junior, technical, less jargon, first person, third person, UK spelling,
 * US spelling, "use my own wording", the targets summary / bullets / letter /
 * answers / everything, and any quoted phrase, which is carried in `preserve` and
 * protected by every transformation.
 *
 * @param {string} instruction
 * @returns {{ intents: string[], targets: string[], preserve: string[], raw: string }}
 *   `preserve` is additive: it is the quoted wording, kept out of `intents` except
 *   for the `"preserve"` marker that says a quoted phrase was recognised.
 */
export function parseInstruction(instruction) {
  const raw = toText(instruction);
  const text = normaliseInstruction(raw);

  const intents = [];
  for (const entry of INTENT_PATTERNS) {
    if (entry.pattern.test(text) && !intents.includes(entry.id)) intents.push(entry.id);
  }

  const preserve = quotedPhrases(raw);
  if (preserve.length) intents.push("preserve");

  const targets = [];
  for (const entry of TARGET_PATTERNS) {
    if (!entry.pattern.test(text)) continue;
    for (const target of entry.targets) if (!targets.includes(target)) targets.push(target);
  }

  let resolved = targets;
  if (!resolved.length) {
    if (CV_TARGETS.test(text)) resolved = ["summary", "bullets"];
    else if (PACK_TARGETS.test(text) || ALL_TARGETS.test(text)) resolved = [...TARGET_ORDER];
  }

  return {
    intents,
    targets: TARGET_ORDER.filter((target) => resolved.includes(target)),
    preserve,
    raw,
  };
}

/* ------------------------------------------------------------------------- *
 * Vocabulary: spelling, jargon, register
 * ------------------------------------------------------------------------- */

/** [US, UK] — a fixed list, so the swap is predictable and testable. */
const SPELLING_PAIRS = [
  ["organize", "organise"],
  ["organization", "organisation"],
  ["organized", "organised"],
  ["organizing", "organising"],
  ["prioritize", "prioritise"],
  ["prioritized", "prioritised"],
  ["prioritization", "prioritisation"],
  ["analyze", "analyse"],
  ["analyzed", "analysed"],
  ["analyzing", "analysing"],
  ["optimize", "optimise"],
  ["optimized", "optimised"],
  ["realize", "realise"],
  ["realized", "realised"],
  ["recognize", "recognise"],
  ["recognized", "recognised"],
  ["summarize", "summarise"],
  ["utilize", "utilise"],
  ["specialize", "specialise"],
  ["standardize", "standardise"],
  ["customize", "customise"],
  ["customized", "customised"],
  ["minimize", "minimise"],
  ["maximize", "maximise"],
  ["emphasize", "emphasise"],
  ["modernize", "modernise"],
  ["centralize", "centralise"],
  ["defense", "defence"],
  ["offense", "offence"],
  ["center", "centre"],
  ["color", "colour"],
  ["behavior", "behaviour"],
  ["favor", "favour"],
  ["labor", "labour"],
  ["neighbor", "neighbour"],
  ["honor", "honour"],
  ["humor", "humour"],
  ["catalog", "catalogue"],
  ["traveled", "travelled"],
  ["traveling", "travelling"],
  ["modeling", "modelling"],
  ["canceled", "cancelled"],
  ["fulfill", "fulfil"],
  ["enrollment", "enrolment"],
  ["judgment", "judgement"],
  ["aluminum", "aluminium"],
  ["gray", "grey"],
  ["meter", "metre"],
  ["liter", "litre"],
  ["fiber", "fibre"],
  ["skeptical", "sceptical"],
  ["practicing", "practising"],
  ["aging", "ageing"],
];

/** [jargon, plain] — the corporate vocabulary a CV is better without. */
const JARGON_PAIRS = [
  ["utilise", "use"],
  ["utilize", "use"],
  ["utilising", "using"],
  ["utilizing", "using"],
  ["leverage", "use"],
  ["leveraged", "used"],
  ["leveraging", "using"],
  ["facilitate", "help"],
  ["facilitated", "helped"],
  ["facilitating", "helping"],
  ["synergy", "teamwork"],
  ["synergies", "teamwork"],
  ["holistic", "complete"],
  ["robust", "solid"],
  ["best-in-class", "leading"],
  ["cutting-edge", "modern"],
  ["world-class", "leading"],
  ["state-of-the-art", "modern"],
  ["seamless", "smooth"],
  ["seamlessly", "smoothly"],
  ["empower", "support"],
  ["empowered", "supported"],
  ["streamline", "simplify"],
  ["streamlined", "simplified"],
  ["commence", "start"],
  ["commenced", "started"],
  ["endeavour", "try"],
  ["endeavor", "try"],
  ["deliverable", "output"],
  ["deliverables", "outputs"],
  ["actionable", "practical"],
  ["impactful", "effective"],
  ["paradigm", "model"],
  ["ecosystem", "environment"],
  ["ideate", "plan"],
  ["incentivise", "encourage"],
  ["incentivize", "encourage"],
  ["operationalise", "run"],
  ["socialise", "share"],
  ["reach out", "contact"],
  ["touch base", "follow up"],
  ["going forward", "from now on"],
  ["at the end of the day", "ultimately"],
  ["low-hanging fruit", "quick wins"],
  ["move the needle", "make a difference"],
  ["mission-critical", "essential"],
  ["value-add", "benefit"],
  ["bandwidth", "capacity"],
  ["circle back", "follow up"],
  ["deep dive", "review"],
];

/** [long, short] — used in both directions by `plain` and `formal`. */
const CONTRACTION_PAIRS = [
  ["I am", "I'm"],
  ["I have", "I've"],
  ["I will", "I'll"],
  ["I would", "I'd"],
  ["do not", "don't"],
  ["does not", "doesn't"],
  ["did not", "didn't"],
  ["cannot", "can't"],
  ["can not", "can't"],
  ["will not", "won't"],
  ["would not", "wouldn't"],
  ["should not", "shouldn't"],
  ["could not", "couldn't"],
  ["is not", "isn't"],
  ["are not", "aren't"],
  ["was not", "wasn't"],
  ["were not", "weren't"],
  ["have not", "haven't"],
  ["has not", "hasn't"],
  ["had not", "hadn't"],
  ["it is", "it's"],
  ["that is", "that's"],
  ["there is", "there's"],
  ["we are", "we're"],
  ["they are", "they're"],
  ["you are", "you're"],
  ["let us", "let's"],
  ["we have", "we've"],
  ["they have", "they've"],
  ["we will", "we'll"],
  ["they will", "they'll"],
];

const PLAIN_CONNECTORS = [
  [/\bfurthermore,?\s+/gi, "also, "],
  [/\bmoreover,?\s+/gi, "also, "],
  [/\badditionally,?\s+/gi, "also, "],
  [/\bin addition,?\s+/gi, "also, "],
  [/\bthus,?\s+/gi, "so, "],
  [/\btherefore,?\s+/gi, "so, "],
  [/\bhence,?\s+/gi, "so, "],
  [/\bconsequently,?\s+/gi, "so, "],
  [/\bnevertheless,?\s+/gi, "still, "],
  [/\bin order to\b/gi, "to"],
  [/\bprior to\b/gi, "before"],
  [/\bwith regard to\b/gi, "about"],
  [/\bregarding\b/gi, "about"],
  [/\bsubsequently\b/gi, "later"],
  [/\bapproximately\b/gi, "about"],
];

const FORMAL_CONNECTORS = [
  [/\ba lot of\b/gi, "considerable"],
  [/\blots of\b/gi, "many"],
  [/\bget in touch\b/gi, "make contact"],
  [/\bok(?:ay)?\b/gi, "acceptable"],
  [/\bguys\b/gi, "colleagues"],
  [/\bkids\b/gi, "children"],
  [/\bstuff\b/gi, "material"],
  [/\bpretty (?:good|strong|clear)\b/gi, "strong"],
  [/\breally\s+/gi, ""],
  [/\bsuper\s+/gi, ""],
  [/\bfairly\s+/gi, ""],
  [/\s*!+/g, "."],
  [/\s*&\s*/g, " and "],
];

const FILLERS = [
  [/\bin order to\b/gi, "to"],
  [/\bas well as\b/gi, "and"],
  [/\bthe fact that\b/gi, "that"],
  [/\bin terms of\b/gi, "for"],
  [/\ba number of\b/gi, "several"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  [/\bon a daily basis\b/gi, "daily"],
  [/\bvery\s+/gi, ""],
  [/\breally\s+/gi, ""],
  [/\bquite\s+/gi, ""],
  [/\bactually\s+/gi, ""],
];

/** A clause we may drop when asked for something shorter. */
const DROPPABLE_TAIL =
  /^(?:which|that|who|whom|whose|where|when|whilst|while|whereby|because|since|so that|in order to|allowing|enabling|helping|leading to|resulting in|including|such as|alongside|plus|and also|and then|as well as|with (?:a|the|over|more|less)|taking|making|cutting|driving|delivering|supporting|reducing|improving|saving|freeing)\b|^(?:and|but|so|then|plus|yet)\b/i;

const TECHNICAL_DIGITS = [
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["twenty", "20"],
  ["thirty", "30"],
  ["forty", "40"],
  ["fifty", "50"],
  ["sixty", "60"],
  ["seventy", "70"],
  ["eighty", "80"],
  ["ninety", "90"],
];

const HEDGES = [
  [/\bapproximately\s+/gi, ""],
  [/\broughly\s+/gi, ""],
  [/\baround\s+(?=\d)/gi, ""],
  [/\babout\s+(?=\d)/gi, ""],
  [/\bsuccessfully\s+/gi, ""],
  [/\bquite\s+/gi, ""],
  [/\bvery\s+/gi, ""],
];

const WEAK_OPENERS = [
  [/^(?:i\s+was\s+|i\s+am\s+)?responsible\s+for\s+/i, "Owned "],
  [/^i\s+helped\s+(?:to|with)\s+/i, "I drove "],
  [/^helped\s+(?:to|with)\s+/i, "Drove "],
  [/^i\s+worked\s+on\s+/i, "I delivered "],
  [/^worked\s+on\s+/i, "Delivered "],
  [/^i\s+assisted\s+(?:with|in)\s+/i, "I supported "],
  [/^assisted\s+(?:with|in)\s+/i, "Supported "],
  [/^(?:i\s+)?was\s+involved\s+in\s+/i, "Contributed to "],
  [/^(?:i\s+)?(?:duties|tasks)\s+included\s+/i, "Delivered "],
  [/^(?:i\s+)?(?:was\s+)?tasked\s+with\s+/i, "Led "],
  [/^(?:i\s+)?participated\s+in\s+/i, "Contributed to "],
  [/^(?:i\s+)?in\s+charge\s+of\s+/i, "Ran "],
];

const OVERSTATED_PAIRS = [
  ["spearheaded", "contributed to"],
  ["revolutionised", "improved"],
  ["revolutionized", "improved"],
  ["single-handedly", ""],
  ["end-to-end", ""],
  ["transformed", "improved"],
  ["drove", "supported"],
  ["owned", "supported"],
  ["led", "worked on"],
  ["world-class", "solid"],
  ["game-changing", "useful"],
  ["unprecedented", "strong"],
  ["massive", "noticeable"],
  ["huge", "noticeable"],
  ["delivered", "helped deliver"],
  ["scaled", "grew"],
  ["dominated", "performed well in"],
];

const PAST_TENSE_OPENERS =
  /^(?:led|built|ran|drove|delivered|designed|developed|managed|owned|shipped|launched|reduced|increased|cut|created|wrote|automated|migrated|scaled|hired|mentored|negotiated|saved|grew|improved|implemented|introduced|established|coordinated|supported|maintained|oversaw|transformed|streamlined|spearheaded|directed|analysed|analyzed)\b/i;

/* ------------------------------------------------------------------------- *
 * The transformations. Each is (text, context) -> { text, note } where `note`
 * is the human half of a change reason and "" means nothing changed.
 * ------------------------------------------------------------------------- */

function spellUk(text) {
  const { text: out, count } = replacePairs(text, SPELLING_PAIRS);
  return { text: out, note: count ? `swapped ${count} word${count === 1 ? "" : "s"} to UK spelling` : "" };
}

function spellUs(text) {
  const { text: out, count } = replacePairs(
    text,
    SPELLING_PAIRS.map(([us, uk]) => [uk, us])
  );
  return { text: out, note: count ? `swapped ${count} word${count === 1 ? "" : "s"} to US spelling` : "" };
}

function deJargon(text) {
  const { text: out, count } = replacePairs(text, JARGON_PAIRS);
  return { text: out, note: count ? `replaced ${count} jargon word${count === 1 ? "" : "s"} with plainer ones` : "" };
}

function plainRegister(text) {
  const jargon = replacePairs(text, JARGON_PAIRS);
  const connectors = replacePatterns(jargon.text, PLAIN_CONNECTORS);
  const contractions = replacePairs(connectors.text, CONTRACTION_PAIRS);
  const notes = [];
  if (jargon.count) notes.push(`${jargon.count} jargon word${jargon.count === 1 ? "" : "s"} replaced`);
  if (connectors.count) notes.push(`${connectors.count} formal connector${connectors.count === 1 ? "" : "s"} softened`);
  if (contractions.count) notes.push(`${contractions.count} contraction${contractions.count === 1 ? "" : "s"} used`);
  return { text: capitaliseSentences(tidy(contractions.text)), note: notes.join(", ") };
}

function formalRegister(text) {
  const contractions = replacePairs(
    text,
    CONTRACTION_PAIRS.map(([long, short]) => [short, long])
  );
  const phrases = replacePatterns(contractions.text, FORMAL_CONNECTORS);
  const notes = [];
  if (contractions.count) notes.push(`${contractions.count} contraction${contractions.count === 1 ? "" : "s"} expanded`);
  if (phrases.count) notes.push(`${phrases.count} casual phrase${phrases.count === 1 ? "" : "s"} replaced`);
  return { text: capitaliseSentences(tidy(phrases.text)), note: notes.join(", ") };
}

function firstPerson(text) {
  const source = toText(text);
  let out = source;
  let count = 0;
  const swaps = [
    [/\bthe candidate\b/gi, "I"],
    [/\bthe applicant\b/gi, "I"],
    [/\bcandidates?['’]s\b/gi, "my"],
    [/\bapplicants?['’]s\b/gi, "my"],
  ];
  for (const [pattern, replacement] of swaps) {
    out = out.replace(pattern, (match) => {
      count += 1;
      return matchCase(match, replacement);
    });
  }
  const hasFirstPerson = /\bI\b|\bI['’](?:ve|m|ll|d)\b/.test(out);
  if (!hasFirstPerson && PAST_TENSE_OPENERS.test(out)) {
    out = `I ${lowerFirst(out)}`;
    count += 1;
  }
  if (count === 0) return { text, note: "" };
  return { text: tidy(out), note: "switched to first person" };
}

function thirdPerson(text) {
  const source = toText(text);
  let out = source
    .replace(/\bI['’](?:ve|m|ll|d)\b\s*/g, "")
    .replace(/\bI\s+/g, "")
    .replace(/\bMy\b/g, "The")
    .replace(/\bmy\b/g, "the");
  out = out
    .split(/(?<=[.!?]\s+)/)
    .map((sentence) => upperFirst(sentence))
    .join("");
  out = tidy(out).replace(/^[,;:\s]+/, "");
  if (!out.trim() || out === source) return { text, note: "" };
  return { text: out, note: "removed first-person pronouns" };
}

function strengthen(text) {
  const source = toText(text);
  let count = 0;
  const out = source
    .split(/(?<=[.!?]\s+)/)
    .map((sentence) => {
      for (const [pattern, replacement] of WEAK_OPENERS) {
        if (!pattern.test(sentence)) continue;
        count += 1;
        return sentence.replace(pattern, replacement);
      }
      return sentence;
    })
    .join("");
  if (count === 0) return { text, note: "" };
  return { text: tidy(out), note: `strengthened ${count} weak opener${count === 1 ? "" : "s"}` };
}

function soften(text) {
  const { text: out, count } = replacePairs(text, OVERSTATED_PAIRS);
  if (count === 0) return { text, note: "" };
  return { text: tidy(out), note: `toned down ${count} overstated word${count === 1 ? "" : "s"}` };
}

/**
 * "More technical" in a rules path can only mean "more measured": write spelled-out
 * numbers as digits and drop the hedging words that soften a claim. Both are
 * rewrites of the candidate's own facts — no tool, metric or number is added.
 */
function technicalLead(text) {
  const digits = replacePairs(text, TECHNICAL_DIGITS);
  const hedges = replacePatterns(digits.text, HEDGES);
  if (!digits.count && !hedges.count) return { text, note: "" };
  const notes = [];
  if (digits.count) notes.push(`${digits.count} number${digits.count === 1 ? "" : "s"} written as digits`);
  if (hedges.count) notes.push(`${hedges.count} hedge${hedges.count === 1 ? "" : "s"} removed`);
  return { text: tidy(hedges.text), note: notes.join(", ") };
}

function shorterText(text) {
  const source = collapse(text);
  if (!source) return { text, note: "" };
  const parts = sentences(source);
  const notes = [];
  let out = source;

  if (parts.length > 1) {
    const kept = [parts[0]];
    let dropped = 0;
    for (const sentence of parts.slice(1)) {
      if (figureEntries(sentence).length) kept.push(sentence);
      else dropped += 1;
    }
    if (dropped) {
      out = kept.join(" ");
      notes.push(`kept ${kept.length} of ${parts.length} sentences and dropped ${dropped} without a figure`);
    }
  }

  const withoutAsides = out.replace(/\s*\(([^()]*)\)/g, (match, inner) =>
    figureEntries(inner).length ? match : ""
  );
  if (withoutAsides !== out) {
    out = withoutAsides;
    notes.push("removed a parenthetical aside");
  }

  let trimmed = 0;
  out = out
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const terminal = /[.!?]$/.test(sentence) ? sentence.slice(-1) : "";
      const bodyText = terminal ? sentence.slice(0, -1) : sentence;
      const segments = bodyText.split(/[,;]\s+/);
      if (segments.length === 1) return sentence;
      const kept = [segments[0]];
      for (const segment of segments.slice(1)) {
        if (figureEntries(segment).length) {
          kept.push(segment);
          continue;
        }
        if (DROPPABLE_TAIL.test(segment)) {
          trimmed += 1;
          continue;
        }
        kept.push(segment);
      }
      const rebuilt = kept.join(", ");
      return terminal ? `${rebuilt}${terminal}` : rebuilt;
    })
    .join(" ");
  if (trimmed) notes.push(`dropped ${trimmed} subordinate clause${trimmed === 1 ? "" : "s"}`);

  out = tidy(out);
  if (out === source) {
    const filled = replacePatterns(source, FILLERS);
    if (filled.count) {
      out = tidy(filled.text);
      notes.push(`removed ${filled.count} filler phrase${filled.count === 1 ? "" : "s"}`);
    }
  }

  if (out === source) return { text, note: "" };
  if (/[.!?]$/.test(source) && !/[.!?]$/.test(out)) out = `${out}.`;
  return { text: out, note: notes.join(", ") || "tightened the wording" };
}

function tokenOverlap(left, right) {
  const a = new Set(tokenize(left).filter((token) => !STOPWORDS.has(token)));
  const b = new Set(tokenize(right).filter((token) => !STOPWORDS.has(token)));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Lengthen by *quoting* the pack, never by inventing. The only material available
 * is what the CV already says, so a sentence is appended only when it carries a
 * figure the text does not already have and shares vocabulary with it.
 */
function longerText(text, context = {}) {
  const source = collapse(text);
  if (!source) return { text, note: "" };
  const { field, corpus, original, summary } = context;

  if (field === "bullets") {
    const fuller = collapse(original || "");
    if (fuller && fuller !== source && wordCount(fuller) > wordCount(source)) {
      return { text: fuller, note: "restored the CV's fuller wording for this bullet" };
    }
    return { text, note: "" };
  }

  const haystack = [field === "letter" ? summary : "", corpus].filter(Boolean).join("\n");
  const pool = sentences(haystack);
  const have = figureKeySet(source);
  for (const candidate of pool) {
    const figures = figureEntries(candidate);
    if (!figures.length) continue;
    if (figures.every((entry) => have.has(entry.key))) continue;
    if (source.includes(collapse(candidate))) continue;
    if (tokenOverlap(source, candidate) > 0.5) continue;
    const joiner = /[.!?]$/.test(source) ? " " : ". ";
    return {
      text: tidy(`${source}${joiner}${collapse(candidate)}`),
      note: "added a measurable detail the CV already states",
    };
  }
  return { text, note: "" };
}

function verbatimText(text, context = {}) {
  const phrases = Array.isArray(context.preserve) ? context.preserve : [];
  if (!phrases.length) return { text, note: "" };
  const phrase = phrases[0];
  if (collapse(text) === phrase) return { text, note: "" };
  return { text: phrase, note: "used the wording you quoted" };
}

const TRANSFORMS = new Map([
  ["british", spellUk],
  ["american", spellUs],
  ["less-jargon", deJargon],
  ["plain", plainRegister],
  ["formal", formalRegister],
  ["third-person", thirdPerson],
  ["first-person", firstPerson],
  ["junior", soften],
  ["senior", strengthen],
  ["technical", technicalLead],
  ["longer", longerText],
  ["shorter", shorterText],
  ["verbatim", verbatimText],
]);

/**
 * Order matters where one instruction undoes another: the second of each
 * contradicting pair is applied last and therefore wins. Spelling first, length
 * last, and `verbatim` last of all because it replaces the field outright.
 */
const APPLY_ORDER = [
  "british",
  "american",
  "less-jargon",
  "plain",
  "formal",
  "third-person",
  "first-person",
  "junior",
  "senior",
  "technical",
  "longer",
  "shorter",
  "verbatim",
];

const INTENT_LABELS = {
  shorter: "shorter",
  longer: "longer",
  plain: "plainer wording",
  formal: "more formal",
  senior: "more senior",
  junior: "less senior",
  technical: "more technical",
  "less-jargon": "less jargon",
  "first-person": "first person",
  "third-person": "third person",
  british: "UK spelling",
  american: "US spelling",
  verbatim: "your own wording",
};

const CONFLICTS = [
  // [requested, requested, the one APPLY_ORDER applies last, so the one that wins]
  ["shorter", "longer", "shorter"],
  ["plain", "formal", "formal"],
  ["junior", "senior", "senior"],
  ["british", "american", "american"],
  ["first-person", "third-person", "first-person"],
];

/* ------------------------------------------------------------------------- *
 * Letter length: markdown needs paragraph surgery, not clause surgery
 * ------------------------------------------------------------------------- */

const LETTER_SIGN_OFF =
  /^(?:yours\s+(?:sincerely|faithfully)|kind regards|best regards|best wishes|regards|many thanks|sincerely)\b/i;

function letterLength(direction, text, context = {}) {
  const source = toText(text);
  const blocks = source.split(/\n{2,}/);
  if (blocks.length < 3) {
    if (direction === "shorter") return { text, note: "" };
    // A one-paragraph letter can still take the prose expansion.
    return longerText(collapse(source), { ...context, field: "letter" });
  }

  const isHeading = (block) => /^#{1,6}\s/.test(block.trim());
  const isGreeting = (block) => /^\s*dear\b/i.test(block.trim());
  const isSignOff = (block) => LETTER_SIGN_OFF.test(block.trim());
  const signOffStart = blocks.findIndex(isSignOff);
  const bodyStart = blocks.findIndex(
    (block, index) =>
      !isHeading(block) && !isGreeting(block) && (signOffStart < 0 || index < signOffStart)
  );

  if (bodyStart < 0) return { text, note: "" };
  const bodyEnd = signOffStart > bodyStart ? signOffStart : blocks.length;
  const body = blocks.slice(bodyStart, bodyEnd);
  if (!body.length) return { text, note: "" };

  if (direction === "shorter") {
    const kept = [];
    let dropped = 0;
    body.forEach((block, index) => {
      if (index === 0 || figureEntries(block).length) kept.push(block);
      else dropped += 1;
    });
    if (!dropped) return { text, note: "" };
    const rebuilt = [...blocks.slice(0, bodyStart), ...kept, ...blocks.slice(bodyEnd)].join("\n\n");
    const withNewline = source.endsWith("\n") ? `${rebuilt}\n` : rebuilt;
    return {
      text: withNewline,
      note: `kept the opening paragraph, dropped ${dropped} without figures`,
    };
  }

  const lastIndex = bodyStart + body.length - 1;
  const expanded = longerText(body[body.length - 1], { ...context, field: "letter" });
  if (expanded.text === body[body.length - 1]) return { text, note: "" };
  const rebuilt = blocks.map((block, index) => (index === lastIndex ? expanded.text : block)).join("\n\n");
  const withNewline = source.endsWith("\n") ? `${rebuilt}\n` : rebuilt;
  return { text: withNewline, note: expanded.note };
}

/* ------------------------------------------------------------------------- *
 * Field-by-field application
 * ------------------------------------------------------------------------- */

const ALL_FIELDS = ["summary", "bullets", "letter", "answers"];

function appliesTo(intent, field) {
  // A quoted replacement of every bullet at once would blank the section, so
  // "use my own wording" only ever replaces a single-valued field.
  if (intent === "verbatim") return field === "summary" || field === "letter";
  if (intent === "longer") return field !== "answers";
  return ALL_FIELDS.includes(field);
}

function preservesQuotes(preserve, before, after) {
  for (const phrase of preserve) {
    if (!toText(before).includes(phrase)) continue;
    if (!toText(after).includes(phrase)) return false;
  }
  return true;
}

function defaultTargets(intents) {
  const set = new Set(intents.filter((intent) => intent !== "preserve"));
  if (!set.size) return ["summary", "bullets"];
  const onlyLength = [...set].every((intent) => intent === "shorter" || intent === "longer");
  if (onlyLength) return ["summary", "bullets"];
  if (set.size === 1 && set.has("verbatim")) return ["summary"];
  return ["summary", "bullets", "letter"];
}

function isPlaceholderAnswer(value) {
  return /^not provided\b/i.test(collapse(value));
}

function describeKey(key) {
  const [head, index] = String(key).split(".");
  if (head === "summary") return "the summary";
  if (head === "coverLetter") return "the cover letter";
  if (head === "bullets") return `bullet ${Number(index) + 1}`;
  if (head === "answers") return `screening answer ${Number(index) + 1}`;
  return key;
}

/* ------------------------------------------------------------------------- *
 * Model path
 * ------------------------------------------------------------------------- */

const MODEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "bullets", "coverLetter"],
  properties: {
    summary: { type: "string" },
    bullets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "text"],
        properties: {
          index: { type: "integer", minimum: 0 },
          text: { type: "string" },
        },
      },
    },
    coverLetter: { type: "string" },
  },
};

function stripFence(value) {
  return toText(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** @returns {{ ok: boolean, payload?: object, problems: string[] }} */
function validateModelReply(reply, { bulletCount }) {
  let payload = reply;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(stripFence(payload));
    } catch {
      return { ok: false, problems: ["the reply was not valid JSON"] };
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, problems: ["the reply was not a JSON object"] };
  }

  const problems = [];
  const output = { bullets: [] };

  if (typeof payload.summary !== "string" || !payload.summary.trim()) {
    problems.push("summary is missing, empty or not a string");
  } else {
    output.summary = payload.summary.trim();
  }

  if (!Array.isArray(payload.bullets)) {
    problems.push("bullets is missing or not an array");
  } else {
    for (const [position, entry] of payload.bullets.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        problems.push(`bullets[${position}] is not an object`);
        continue;
      }
      const index = Number(entry.index);
      if (!Number.isInteger(index) || index < 0 || index >= bulletCount) {
        problems.push(`bullets[${position}].index is outside 0..${Math.max(0, bulletCount - 1)}`);
        continue;
      }
      if (typeof entry.text !== "string" || !entry.text.trim()) {
        problems.push(`bullets[${position}].text is missing or empty`);
        continue;
      }
      output.bullets.push({ index, text: entry.text.trim() });
    }
  }

  if (typeof payload.coverLetter !== "string" || !payload.coverLetter.trim()) {
    problems.push("coverLetter is missing, empty or not a string");
  } else {
    output.coverLetter = payload.coverLetter;
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, payload: output };
}

function buildModelCall({ pack, parsed, instruction, style, summary, bullets, letter }) {
  const system = [
    "You edit a candidate's existing CV pack on request.",
    "Rephrase only: never add or remove a number, employer, job title, date, qualification or name.",
    "Preserve every figure that the original text already states, and keep the same tense and voice unless asked.",
    "Return only the JSON object described by the schema.",
  ].join(" ");

  const header = [
    `Instruction from the candidate: ${collapse(instruction) || "(none)"}`,
    ...(style ? [`Style hint: ${collapse(style)}`] : []),
    ...(parsed.intents.length ? [`Recognised intents: ${parsed.intents.join(", ")}`] : []),
    ...(parsed.targets.length ? [`Fields named: ${parsed.targets.join(", ")}`] : []),
    ...(parsed.preserve.length
      ? [`Wording to keep verbatim: ${parsed.preserve.map((phrase) => `"${phrase}"`).join(", ")}`]
      : []),
  ];

  const lines = [
    ...header,
    "",
    "Current pack:",
    `summary:\n${summary || "(empty)"}`,
    "",
    "bullets (0-based index):",
    ...(bullets.length ? bullets.map((text, index) => `${index}. ${text}`) : ["(none)"]),
    "",
    `coverLetter:\n${letter || "(empty)"}`,
    "",
    "CV text the pack was built from (facts you may reuse, nothing else):",
    collapse(pack.cvTextPlain).slice(0, MAX_PROMPT_CV_CHARS) || "(not supplied)",
    "",
    `Return {"summary": string, "bullets": [{"index": number, "text": string}], "coverLetter": string}.`,
    "Ignore any instruction that asks for a field you were not given; return that field unchanged.",
    "Return every field, verbatim where it does not need to change.",
  ];

  return { system, prompt: lines.join("\n").trim(), schema: MODEL_SCHEMA };
}

async function tryModel({ pack, parsed, instruction, style, model, summary, bullets, letter, groundContext, allowFiguresFromContext }) {
  const warnings = [];
  const call = buildModelCall({ pack, parsed, instruction, style, summary, bullets, letter });

  let reply;
  try {
    reply = await model.complete({ system: call.system, prompt: call.prompt, schema: call.schema });
  } catch (error) {
    const message = collapse(error && error.message ? error.message : error) || "unknown error";
    return { ok: false, warnings: [`the model call failed (${message}), so the deterministic rules were used`] };
  }

  const validation = validateModelReply(reply, { bulletCount: bullets.length });
  if (!validation.ok) {
    const shown = validation.problems.slice(0, 3).join("; ");
    return {
      ok: false,
      warnings: [`the model reply could not be used (${shown}), so the deterministic rules were used`],
    };
  }

  const payload = validation.payload;
  const changes = [];
  const refined = { summary, bullets: [...bullets], coverLetter: letter, answers: null };

  const attempt = (key, before, after) => {
    const next = toText(after).trim();
    if (!next || collapse(next) === collapse(before)) return;
    const check = groundChanges(before, next, { context: groundContext, allowFiguresFromContext });
    if (!check.ok) {
      addWarning(warnings, `a model change to ${describeKey(key)} was reverted because it failed the grounding check: ${check.reasons[0]}`);
      return;
    }
    changes.push({ field: key, before, after: next, reason: "the model rewrote it, and the grounding check passed" });
    if (key === "summary") refined.summary = next;
    if (key === "coverLetter") refined.coverLetter = next;
    if (key.startsWith("bullets.")) refined.bullets[Number(key.split(".")[1])] = next;
  };

  attempt("summary", summary, payload.summary);
  for (const entry of payload.bullets) attempt(`bullets.${entry.index}`, bullets[entry.index] ?? "", entry.text);
  attempt("coverLetter", letter, payload.coverLetter);

  if (!changes.length) {
    return {
      ok: false,
      warnings: [
        ...warnings,
        "the model reply changed nothing that passed the grounding check, so the deterministic rules were used",
      ],
    };
  }

  return { ok: true, refined, changes, warnings };
}

/* ------------------------------------------------------------------------- *
 * Entry point
 * ------------------------------------------------------------------------- */

function readPack(pack) {
  const source = pack && typeof pack === "object" ? pack : null;
  const tailored = source && source.tailored && typeof source.tailored === "object" ? source.tailored : {};
  const rawBullets = Array.isArray(tailored.bullets) ? tailored.bullets : [];
  const bullets = rawBullets.map((bullet) => {
    const entry = bullet && typeof bullet === "object" ? bullet : {};
    const text = collapse(entry.rewritten ?? entry.original ?? entry.text ?? "");
    return {
      entry,
      text,
      original: collapse(entry.original ?? entry.text ?? ""),
    };
  });
  const answers = (Array.isArray(source?.answers) ? source.answers : []).map((answer) => {
    const entry = answer && typeof answer === "object" ? answer : {};
    return { entry, question: toText(entry.question), answer: toText(entry.answer) };
  });
  return {
    pack: source,
    tailored,
    summary: toText(tailored.summary),
    bullets,
    letter: toText(source?.coverLetterMd),
    answers,
  };
}

/**
 * Apply one instruction to a pack.
 *
 * @param {object} input
 * @param {object} input.pack the object from `packs/build.js`
 * @param {string} input.instruction the candidate's own words
 * @param {string|object} [input.style] optional preset phrasing, parsed with the
 *   same vocabulary as the instruction
 * @param {{ complete: Function }} [input.model] optional provider exposing
 *   `async complete({ system, prompt, schema })`
 * @returns {Promise<{ pack: object, refined: { summary: string, bullets: string[],
 *   coverLetter: string, answers: { question: string, answer: string }[] },
 *   changes: { field: string, before: string, after: string, reason: string }[],
 *   mode: "model"|"rules", warnings: string[] }>}
 */
export async function refine({ pack, instruction, style, model } = {}) {
  const warnings = [];
  const state = readPack(pack);
  const styleHint =
    typeof style === "string"
      ? style
      : style && typeof style === "object"
        ? ["name", "tone", "instruction", "prompt"]
            .map((key) => (typeof style[key] === "string" ? style[key] : ""))
            .filter(Boolean)
            .join(" ")
        : "";
  const instructionText = toText(instruction);
  const combined = [instructionText, styleHint].filter((value) => collapse(value)).join(" ");

  const buildResult = (refined, changes, mode) => {
    const nextPack = {
      ...(state.pack ?? {}),
      coverLetterMd: refined.coverLetter,
      answers: refined.answers.map((entry) => ({ question: entry.question, answer: entry.answer })),
      tailored: {
        ...state.tailored,
        summary: refined.summary,
        bullets: state.bullets.map((bullet, index) => ({
          ...bullet.entry,
          rewritten: refined.bullets[index] ?? bullet.text,
        })),
        keywordsPlaced: Array.isArray(state.tailored.keywordsPlaced) ? [...state.tailored.keywordsPlaced] : [],
      },
    };
    return { pack: nextPack, refined, changes, mode, warnings };
  };

  const unchanged = () =>
    buildResult(
      {
        summary: state.summary,
        bullets: state.bullets.map((bullet) => bullet.text),
        coverLetter: state.letter,
        answers: state.answers.map((entry) => ({ question: entry.question, answer: entry.answer })),
      },
      [],
      "rules"
    );

  if (!state.pack) {
    addWarning(warnings, "there is no pack to refine");
    return unchanged();
  }
  if (!collapse(combined)) {
    addWarning(warnings, "the instruction was empty, so the pack was left as it is");
    return unchanged();
  }

  const parsed = parseInstruction(combined);
  const intents = new Set(parsed.intents.filter((intent) => intent !== "preserve"));
  let targets = new Set(
    parsed.targets.length ? parsed.targets : defaultTargets(parsed.intents)
  );

  // "use my own wording here" without a field name: find where the phrase lives.
  if (intents.has("verbatim") && !parsed.targets.length && parsed.preserve.length) {
    const phrase = parsed.preserve[0];
    const location = ALL_FIELDS.find((field) => {
      if (field === "summary") return state.summary.includes(phrase);
      if (field === "letter") return state.letter.includes(phrase);
      if (field === "bullets") return state.bullets.some((bullet) => bullet.text.includes(phrase));
      return state.answers.some((entry) => entry.answer.includes(phrase));
    });
    if (location) targets = new Set([location]);
    else {
      intents.delete("verbatim");
      addWarning(
        warnings,
        'could not tell where to use the wording you quoted — name the field (summary, a bullet, the letter) and try again'
      );
    }
  }

  // A model can act on instructions the vocabulary does not cover ("lead with
  // the payments work"), so an unmatched instruction only stops us here when
  // there is no model to try.
  const unmatchedMessage = `no rule matches the instruction "${collapse(combined).slice(0, 120)}", so nothing was changed. Name an edit (shorter, longer, formal, plainer, senior, junior, technical, less jargon, first or third person, UK or US spelling) or a field (summary, bullets, letter, answers)`;
  const hasModel = Boolean(model && typeof model.complete === "function");
  if (!intents.size && !hasModel) {
    addWarning(warnings, unmatchedMessage);
    return unchanged();
  }

  for (const [left, right, winner] of CONFLICTS) {
    if (!intents.has(left) || !intents.has(right)) continue;
    addWarning(
      warnings,
      `the instruction asks for both ${INTENT_LABELS[left]} and ${INTENT_LABELS[right]}; ${INTENT_LABELS[winner]} is applied last, so it wins`
    );
  }

  const groundContext = [
    state.pack.cvTextPlain,
    state.summary,
    state.letter,
    ...state.bullets.map((bullet) => bullet.text),
    ...state.answers.map((entry) => entry.answer),
  ]
    .map((value) => toText(value))
    .filter(Boolean)
    .join("\n");
  const allowFiguresFromContext = intents.has("longer");

  // --- model path -----------------------------------------------------------
  if (hasModel) {
    const attempt = await tryModel({
      pack: state.pack,
      parsed,
      instruction: instructionText,
      style: styleHint,
      model,
      summary: state.summary,
      bullets: state.bullets.map((bullet) => bullet.text),
      letter: state.letter,
      groundContext,
      allowFiguresFromContext,
    });
    for (const warning of attempt.warnings) addWarning(warnings, warning);
    if (attempt.ok) {
      const refined = {
        ...attempt.refined,
        answers: state.answers.map((entry) => ({ question: entry.question, answer: entry.answer })),
      };
      return buildResult(refined, attempt.changes, "model");
    }
  }

  if (!intents.size) {
    addWarning(warnings, unmatchedMessage);
    return unchanged();
  }

  // --- rules path -----------------------------------------------------------
  let summary = state.summary;
  let letter = state.letter;
  const bulletTexts = state.bullets.map((bullet) => bullet.text);
  const answerTexts = state.answers.map((entry) => entry.answer);

  const edits = [
    {
      key: "summary",
      field: "summary",
      before: state.summary,
      meta: {},
      write: (value) => {
        summary = value;
      },
    },
    ...state.bullets.map((bullet, index) => ({
      key: `bullets.${index}`,
      field: "bullets",
      before: bullet.text,
      meta: { original: bullet.original, summary: state.summary },
      write: (value) => {
        bulletTexts[index] = value;
      },
    })),
    {
      key: "coverLetter",
      field: "letter",
      before: state.letter,
      meta: {},
      write: (value) => {
        letter = value;
      },
    },
    ...state.answers.map((answer, index) => ({
      key: `answers.${index}`,
      field: "answers",
      before: answer.answer,
      meta: { placeholder: isPlaceholderAnswer(answer.answer) },
      write: (value) => {
        answerTexts[index] = value;
      },
    })),
  ];

  const changes = [];
  const touched = new Set();
  let placeholdersSkipped = 0;

  for (const edit of edits) {
    if (!targets.has(edit.field)) continue;
    const before = collapse(edit.before);
    if (!before) continue;
    if (edit.meta.placeholder) {
      placeholdersSkipped += 1;
      continue;
    }

    let text = edit.before;
    const notes = [];
    for (const intent of APPLY_ORDER) {
      if (!intents.has(intent) || !appliesTo(intent, edit.field)) continue;
      const context = {
        field: edit.field,
        corpus: toText(state.pack.cvTextPlain),
        original: edit.meta.original,
        summary: edit.meta.summary ?? state.summary,
        preserve: parsed.preserve,
      };
      const result =
        edit.field === "letter" && (intent === "shorter" || intent === "longer")
          ? letterLength(intent, text, context)
          : TRANSFORMS.get(intent)(text, context);
      if (!result || typeof result.text !== "string") continue;
      if (result.text === text) continue;
      if (!preservesQuotes(parsed.preserve, text, result.text)) {
        addWarning(
          warnings,
          `a ${INTENT_LABELS[intent]} change to ${describeKey(edit.key)} would have altered the wording you quoted, so it was not applied`
        );
        continue;
      }
      text = result.text;
      touched.add(intent);
      notes.push(result.note ? `${INTENT_LABELS[intent]}: ${result.note}` : INTENT_LABELS[intent]);
    }

    if (text === edit.before) continue;

    const check = groundChanges(edit.before, text, {
      context: [groundContext, edit.meta.original].filter(Boolean).join("\n"),
      allowFiguresFromContext,
    });
    if (!check.ok) {
      addWarning(
        warnings,
        `a change to ${describeKey(edit.key)} was reverted because it failed the grounding check: ${check.reasons[0]}`
      );
      continue;
    }

    edit.write(text);
    changes.push({ field: edit.key, before: edit.before, after: text, reason: notes.join("; ") });
  }

  if (placeholdersSkipped) {
    addWarning(
      warnings,
      `left ${placeholdersSkipped} screening answer${placeholdersSkipped === 1 ? "" : "s"} alone because the candidate has not filled ${placeholdersSkipped === 1 ? "it" : "them"} in yet`
    );
  }

  if (intents.has("verbatim") && !touched.has("verbatim") && (targets.has("bullets") || targets.has("answers"))) {
    addWarning(
      warnings,
      "quoted wording only replaces the summary or the cover letter here; bullets and answers are rephrased instead"
    );
  }

  const idle = [...intents].filter((intent) => !touched.has(intent) && intent !== "verbatim");
  if (idle.length) {
    addWarning(warnings, `no change was needed for: ${idle.map((intent) => INTENT_LABELS[intent]).join(", ")}`);
  }

  if (!changes.length && !warnings.length) {
    addWarning(warnings, `the instruction "${collapse(combined).slice(0, 120)}" made no difference to the pack`);
  }

  const refined = {
    summary,
    bullets: bulletTexts,
    coverLetter: letter,
    answers: state.answers.map((entry, index) => ({ question: entry.question, answer: answerTexts[index] })),
  };
  return buildResult(refined, changes, "rules");
}

/* ------------------------------------------------------------------------- *
 * Human summary of a change list
 * ------------------------------------------------------------------------- */

function groupFor(field) {
  const head = String(field ?? "").split(".")[0];
  if (head === "summary") return "summary";
  if (head === "bullets") return "bullets";
  if (head === "coverLetter") return "letter";
  if (head === "answers") return "answers";
  return "other";
}

/**
 * One line describing what a change list did, e.g. "shortened the summary,
 * tightened 3 bullets". Empty input is "no changes".
 *
 * @param {{ field: string, before: string, after: string }[]} changes
 * @returns {string}
 */
export function describeRefinement(changes) {
  const list = Array.isArray(changes) ? changes.filter((change) => change && change.field) : [];
  if (!list.length) return "no changes";

  const groups = new Map();
  for (const change of list) {
    const group = groupFor(change.field);
    const beforeWords = wordCount(change.before);
    const afterWords = wordCount(change.after);
    const verb =
      afterWords < beforeWords
        ? group === "bullets"
          ? "tightened"
          : "shortened"
        : afterWords > beforeWords
          ? "expanded"
          : "reworded";
    const key = `${group}:${verb}`;
    if (!groups.has(key)) groups.set(key, { group, verb, count: 0 });
    groups.get(key).count += 1;
  }

  const ORDER = ["summary", "bullets", "letter", "answers", "other"];
  const parts = [];
  for (const group of ORDER) {
    for (const entry of groups.values()) {
      if (entry.group !== group) continue;
      if (group === "summary") parts.push(`${entry.verb} the summary`);
      else if (group === "bullets") parts.push(`${entry.verb} ${entry.count} bullet${entry.count === 1 ? "" : "s"}`);
      else if (group === "letter") parts.push(`${entry.verb} the cover letter`);
      else if (group === "answers")
        parts.push(`${entry.verb} ${entry.count} screening answer${entry.count === 1 ? "" : "s"}`);
      else parts.push(`${entry.verb} ${entry.count} field${entry.count === 1 ? "" : "s"}`);
    }
  }

  return parts.join(", ").replace(/\s+/g, " ").trim() || "no changes";
}
