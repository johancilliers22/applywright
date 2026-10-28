/**
 * Grounded CV tailoring — SPEC section 5.
 *
 * Two paths, one contract:
 *   - `model` present and well behaved  → one JSON-mode call, hard-validated, then
 *     every field re-checked against the CV before it is allowed out.
 *   - otherwise                          → a deterministic rule-based rewrite.
 *
 * The invariant that matters: `tailorCv` never returns a bullet that fails
 * `assertGrounded`. A rewrite that introduces a figure, a currency amount, an
 * employer, a job title, a qualification, a date range, a lower-case tool or
 * method, or a stronger level of ownership than the source claims is rejected;
 * the bullet falls back to the CV's own wording and the reason is recorded in
 * `warnings`. Nothing here invents a fact, and nothing here is a stub: when a
 * model is unavailable the rules path does real work.
 *
 * Scope note: this module reads `cvText`, `profile` and `job` and returns plain
 * data. It does not touch the database, the network or the clock.
 */

import {
  containsTerm,
  extractKeywords,
  keywordCoverage,
  normalizeTerm,
  sentences,
} from "../text.js";

const MAX_BULLETS = 12;
const MAX_SUMMARY_WORDS = 70;
const LETTER_MIN_WORDS = 150;
const LETTER_MAX_WORDS = 220;
const LETTER_TARGET_WORDS = 210;
const MAX_WARNINGS = 20;

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

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

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
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

function lowerFirst(value) {
  const text = toText(value);
  if (!text) return "";
  return text[0].toLowerCase() + text.slice(1);
}

function upperFirst(value) {
  const text = toText(value);
  if (!text) return "";
  return text[0].toUpperCase() + text.slice(1);
}

function stripTrailingStop(value) {
  return toText(value).replace(/[.;,\s]+$/, "").trim();
}

/** "a, b and c" — used in prose, so it reads properly. */
function listOf(items) {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

const SECTION_ALIASES = [
  [
    "summary",
    /^(?:professional\s+|personal\s+|career\s+)?(?:summary|profile|statement|about(?:\s+me)?|objective|intro(?:duction)?)$/,
  ],
  [
    "experience",
    /^(?:work\s+|professional\s+|employment\s+|relevant\s+|career\s+)?(?:experience|history|employment|career)$/,
  ],
  ["education", /^(?:education|qualifications?|academic(?:\s+background)?|training)$/],
  [
    "skills",
    /^(?:technical\s+|core\s+|key\s+|professional\s+|it\s+|software\s+)?(?:skills?|competenc(?:y|ies)|technologies|expertise|toolkit|stack)$/,
  ],
  [
    "other",
    /^(?:projects?|selected\s+projects|awards?|achievements?|publications?|certifications?|volunteering|interests|references|languages|hobbies)$/,
  ],
];

/** Return the canonical section key for a heading line, or "" for ordinary text. */
function sectionKeyFor(line) {
  const cleaned = toText(line)
    .replace(/^#+\s*/, "")
    .replace(/[:.\s]+$/, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!cleaned || cleaned.length > 40) return "";
  if (cleaned.split(/\s+/).length > 5) return "";
  const probe = cleaned.toLowerCase().replace(/\s+/g, " ");
  for (const [key, pattern] of SECTION_ALIASES) {
    if (pattern.test(probe)) return key;
  }
  return "";
}

/**
 * Split a CV into sections without depending on the ingester. Headings are
 * recognised by name only; anything before the first heading is the preamble
 * (name, contact lines) and never becomes a bullet.
 */
function splitCv(cvText) {
  const lines = toText(cvText).split(/\r?\n/);
  const parts = [{ key: "preamble", heading: "", lines: [] }];
  for (const raw of lines) {
    const line = raw.trim();
    const key = sectionKeyFor(line);
    if (key) {
      parts.push({
        key,
        heading: line.replace(/^#+\s*/, "").replace(/[:.\s]+$/, ""),
        lines: [],
      });
    } else {
      parts[parts.length - 1].lines.push(line);
    }
  }
  return parts;
}

const YEAR_RANGE =
  /(?:19|20)\d{2}\s*(?:-|–|—|to|until|through|till)\s*(?:(?:19|20)\d{2}|present|current|now|today|date)\b/i;

const ACTION_START =
  /^(?:led|built|managed|delivered|designed|developed|created|launched|shipped|reduced|increased|improved|automated|migrated|owned|scaled|cut|drove|negotiated|hired|mentored|ran|wrote|produced|directed|established|introduced|implemented|maintained|supported|presented|coordinated|analysed|analyzed|tested|deployed|trained|recruited|modernised|modernized|rebuilt|refactored|streamlined|consolidated|oversaw|supervised|awarded|selected|responsible|worked|helped|assisted|rebuilt|sold|won|saved)\b/i;

function isMarkedBullet(line) {
  return /^(?:[-*•▪◦‣·–—]|\d+[.)])\s+/.test(toText(line));
}

function stripBulletMarker(line) {
  return toText(line)
    .replace(/^(?:[-*•▪◦‣·–—]|\d+[.)])\s+/, "")
    .trim();
}

/**
 * A role header is "Acme Ltd — Senior Engineer | 2019–2024": a short line with a
 * date range or a separator, not written as an achievement. Getting this wrong
 * only affects the `evidence` label, never the grounding decision.
 */
function isRoleHeader(line) {
  const text = toText(line).trim();
  if (!text || text.length > 110) return false;
  if (isMarkedBullet(text)) return false;
  if (ACTION_START.test(text)) return false;
  const words = text.split(/\s+/).length;
  const dated = YEAR_RANGE.test(text);
  const separated = /[|·•]|\s[—–]\s|\s-\s/.test(text);
  if (dated && words <= 14) return true;
  if (separated && words <= 12 && !/[.!?]$/.test(text)) return true;
  return false;
}

const TITLE_WORDS = new Set([
  "engineer",
  "manager",
  "director",
  "developer",
  "analyst",
  "consultant",
  "architect",
  "designer",
  "administrator",
  "specialist",
  "coordinator",
  "officer",
  "accountant",
  "technician",
  "scientist",
  "supervisor",
  "president",
  "intern",
  "apprentice",
]);

const EMPLOYER_MARKERS =
  /\b(?:ltd|limited|plc|inc|llc|gmbh|group|holdings|partners|university|college|hospital|council|agency|studio|labs?|systems|solutions|services|bank)\b/i;

/**
 * Lowercase tools and methods that the proper-noun check cannot see, because they
 * are written in lower case ("terraform", "microservices", "cohort analysis").
 *
 * Deliberately modest and deliberately unambiguous: every entry is a term a
 * candidate cannot use by accident, so a matching rewrite is a real claim about a
 * tool or method the source does not mention. Ambiguous English words that are
 * also product names — "excel", "spark", "react", "swift", "go", "rust" — are
 * left out: rejecting an honest "react to incidents quickly" is worse than
 * missing an invented tool.
 */
const SKILL_TERMS = [
  "terraform",
  "kubernetes",
  "docker",
  "graphql",
  "postgresql",
  "postgres",
  "typescript",
  "javascript",
  "python",
  "django",
  "rails",
  "node.js",
  "microservices",
  "microservice",
  "ci/cd",
  "selenium",
  "pytest",
  "jenkins",
  "ansible",
  "airflow",
  "snowflake",
  "databricks",
  "tableau",
  "looker",
  "salesforce",
  "jira",
  "figma",
  "kafka",
  "redis",
  "mongodb",
  "mysql",
  "sql",
  "aws",
  "azure",
  "prometheus",
  "grafana",
  "opentelemetry",
  "elasticsearch",
  "rabbitmq",
  "cloudformation",
  "scrum",
  "kanban",
  "cohort analysis",
  "a/b testing",
  "etl",
  "spss",
  "matlab",
];

/** Pull an employer and a title out of a role header, conservatively. */
function roleFacts(header) {
  const text = collapse(header);
  if (!text) return { employer: "", title: "" };
  const cleaned = text
    .replace(new RegExp(YEAR_RANGE.source, "gi"), " ")
    .replace(/[()[\]]/g, " ")
    .replace(/[|·•]/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  const pieces = cleaned
    .split(/\s+[—–]\s+|\s+-\s+|,\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length === 1) {
    return EMPLOYER_MARKERS.test(pieces[0])
      ? { employer: pieces[0], title: "" }
      : { employer: "", title: pieces[0] };
  }
  const hasTitleWord = (piece) =>
    piece
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((word) => TITLE_WORDS.has(word));
  const titleIndex = pieces.findIndex(hasTitleWord);
  if (titleIndex >= 0) {
    return {
      title: pieces[titleIndex],
      employer: pieces.find((_, index) => index !== titleIndex) ?? "",
    };
  }
  const employerIndex = pieces.findIndex((piece) => EMPLOYER_MARKERS.test(piece));
  if (employerIndex >= 0) {
    return {
      employer: pieces[employerIndex],
      title: pieces.find((_, index) => index !== employerIndex) ?? "",
    };
  }
  return { employer: pieces[0], title: pieces[1] ?? "" };
}

// ---------------------------------------------------------------------------
// Numbers, currencies and units
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = { "£": "GBP", $: "USD", "€": "EUR" };
const CURRENCY_UNITS = new Set(["GBP", "USD", "EUR"]);

const NUMBER_WORDS = new Map([
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);

const SPELLED_RE =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi;

const UNIT_TAIL = /^(\s?)(%|pct|percent|per\s?cent|million|billion|thousand|times|k|m|bn|x)(?![a-z])/i;

function canonicalValue(digits, unitText) {
  let value = Number(toText(digits).replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = toText(unitText).toLowerCase();
  if (unit === "k" || unit === "thousand") value *= 1e3;
  else if (unit === "m" || unit === "million") value *= 1e6;
  else if (unit === "bn" || unit === "billion") value *= 1e9;
  return Number(value.toPrecision(12));
}

function unitKind(unitText, currencySymbol) {
  const unit = toText(unitText).toLowerCase();
  if (unit === "%" || unit === "pct" || unit === "percent" || /^per\s?cent$/.test(unit)) return "%";
  if (currencySymbol) return CURRENCY_SYMBOLS[currencySymbol] ?? "";
  if (unit === "x" || unit === "times") return "x";
  return "";
}

/**
 * Every numeric claim in a piece of text, canonicalised so that "£40k" and
 * "£40,000" compare equal. Spelled-out numbers are included because "led three
 * teams" is as much a claim as "led 3 teams".
 * @returns {{ key: string, unit: string, raw: string }[]}
 */
function numberMentions(text) {
  const source = toText(text);
  const out = [];
  const core = /(?<![A-Za-z0-9])([£$€])?\s?(\d[\d,]*(?:\.\d+)?)/g;
  let match;
  while ((match = core.exec(source)) !== null) {
    const [whole, symbol, digits] = match;
    const tail = source.slice(match.index + whole.length, match.index + whole.length + 16);
    const unitMatch = UNIT_TAIL.exec(tail);
    const unitText = unitMatch ? unitMatch[2] : "";
    const value = canonicalValue(digits, unitText);
    if (value === null) continue;
    const end = match.index + whole.length + (unitMatch ? unitMatch[0].length : 0);
    out.push({
      key: String(value),
      unit: unitKind(unitText, symbol),
      raw: collapse(source.slice(match.index, end)),
    });
  }
  for (const spelled of source.matchAll(SPELLED_RE)) {
    out.push({
      key: String(NUMBER_WORDS.get(spelled[1].toLowerCase())),
      unit: "",
      raw: spelled[1],
    });
  }
  return out;
}

function numberIndex(text) {
  const index = new Map();
  for (const mention of numberMentions(text)) {
    if (!index.has(mention.key)) index.set(mention.key, new Set());
    if (mention.unit) index.get(mention.key).add(mention.unit);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Dates, qualifications, titles, names
// ---------------------------------------------------------------------------

const MONTH_WORDS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const MONTH_ABBREVIATIONS = ["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];

/**
 * Months recognised as dates when a word stands alone. "may" is left out even
 * though it is a month: in CV prose it is almost always the modal verb, and
 * treating it as a date would reject honest rewrites.
 */
const MONTH_CHECK_WORDS = MONTH_WORDS.filter((word) => word !== "may");

/** Used to keep month names out of the proper-noun check, where they belong to dates. */
const MONTH_SET = new Set([...MONTH_WORDS, ...MONTH_ABBREVIATIONS]);

const DATE_RANGE_RE = new RegExp(
  String.raw`((?:19|20)\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(?:19|20)\d{2})\s*(?:-|–|—|to|until|through|till)\s*((?:19|20)\d{2}|present|current|now|today|date)`,
  "gi"
);

function normalizeRange(raw) {
  return collapse(toText(raw))
    .toLowerCase()
    .replace(/\s*(?:-|–|—|to|until|through|till)\s*/g, "-")
    .replace(/\s+/g, "");
}

const QUALIFICATIONS = [
  "degree",
  "bachelor",
  "bachelors",
  "bachelor's",
  "undergraduate",
  "postgraduate",
  "masters",
  "master's",
  "msc",
  "bsc",
  "mba",
  "phd",
  "doctorate",
  "diploma",
  "certificate",
  "certification",
  "certified",
  "chartered",
  "accredited",
  "gcse",
  "a-level",
  "a level",
  "hnd",
  "nvq",
  "acca",
  "cipd",
  "prince2",
  "itil",
  "cpa",
  "cfa",
  "cissp",
  "pmp",
];

const ENTITY_STOP = new Set(
  [
    "the",
    "a",
    "an",
    "i",
    "my",
    "we",
    "our",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "in",
    "at",
    "on",
    "for",
    "with",
    "as",
    "by",
    "from",
    "to",
    "during",
    "after",
    "before",
    "while",
    "when",
    "if",
    "and",
    "but",
    "or",
    "so",
    "then",
    "there",
    "here",
    "also",
    "plus",
    "using",
    "across",
    "within",
    "over",
    "under",
    "between",
    "since",
    "both",
    "each",
    "all",
    "no",
    "not",
    "their",
    "his",
    "her",
    "he",
    "she",
    "they",
    "itself",
    "who",
    "which",
    "where",
    "why",
    "how",
    "new",
    "later",
    "next",
    "last",
    "first",
    "second",
    "third",
  ].map((word) => word)
);

const ENTITY_CONNECTORS = new Set(["of", "the", "and", "de", "van", "von", "&", "for"]);

function cleanToken(token) {
  return toText(token).replace(/^[^\w£$€]+/, "").replace(/[^\w£$€'’.&-]+$/, "").replace(/\.$/, "");
}

function isCapitalised(token) {
  return /^[A-Z][A-Za-z0-9&'’-]*$/.test(token) && token.length >= 2;
}

/**
 * Capitalised phrases that are not at the start of a sentence. Some of these are
 * employers, some are job titles, some are technologies — all of them are
 * proper nouns, and all of them must come from the CV.
 *
 * A sentence-start capital is not evidence either way, so it is no longer skipped:
 * "Kubernetes cluster migration cut deploy time…" used to be invisible to this
 * check precisely because "Kubernetes" opened the sentence. What decides is the
 * word itself — see `couldBeName`.
 */
function properNounPhrases(text) {
  const tokens = toText(text).split(/\s+/).filter(Boolean);
  const phrases = [];
  let index = 0;
  while (index < tokens.length) {
    const token = cleanToken(tokens[index]);
    const previous = index > 0 ? tokens[index - 1] : "";
    const sentenceStart =
      index === 0 ||
      /[.!?:;•*—–-]$/.test(previous) ||
      isMarkedBullet(tokens[index]);
    const blocked =
      !isCapitalised(token) ||
      ENTITY_STOP.has(token.toLowerCase()) ||
      MONTH_SET.has(token.toLowerCase().replace(/\.$/, ""));
    if (blocked || (sentenceStart && !couldBeName(token))) {
      index += 1;
      continue;
    }
    const parts = [token];
    let cursor = index + 1;
    while (cursor < tokens.length) {
      const next = cleanToken(tokens[cursor]);
      if (
        isCapitalised(next) &&
        !ENTITY_STOP.has(next.toLowerCase()) &&
        !MONTH_SET.has(next.toLowerCase().replace(/\.$/, ""))
      ) {
        parts.push(next);
        cursor += 1;
        continue;
      }
      const after = cursor + 1 < tokens.length ? cleanToken(tokens[cursor + 1]) : "";
      if (ENTITY_CONNECTORS.has(next.toLowerCase()) && isCapitalised(after)) {
        parts.push(next);
        cursor += 1;
        continue;
      }
      break;
    }
    phrases.push(parts.join(" "));
    index = cursor;
  }
  return phrases;
}

/**
 * Irregular past-tense verbs and letter greetings: words that really do open CV
 * lines and letters without being names. Regular verbs and adverbs are covered by
 * their endings in `couldBeName`.
 */
const SENTENCE_START_WORDS = new Set([
  "led",
  "built",
  "ran",
  "cut",
  "drove",
  "wrote",
  "grew",
  "saved",
  "made",
  "took",
  "kept",
  "set",
  "spent",
  "brought",
  "found",
  "held",
  "bought",
  "sold",
  "taught",
  "met",
  "won",
  "began",
  "chose",
  "dealt",
  "did",
  "went",
  "gave",
  "got",
  "knew",
  "left",
  "lost",
  "paid",
  "put",
  "read",
  "saw",
  "sent",
  "showed",
  "told",
  "thought",
  "understood",
  "became",
  "came",
  "sought",
  "caught",
  "fought",
  "threw",
  "flew",
  "drew",
  "broke",
  "spoke",
  "stole",
  "tore",
  "dear",
  "hi",
  "hello",
  "sincerely",
  "faithfully",
  "regards",
  "yours",
  "kind",
  "best",
  "thank",
  "thanks",
]);

/**
 * Could a capitalised token at the start of a sentence be a name, or is it
 * capitalised only because of its position? CV lines open with verbs ("Improved…",
 * "Cut…") and letters with greetings, so those are never names; any other
 * capitalised word is a candidate and is checked like a mid-sentence proper noun.
 * The bias is deliberate: a missed name is a missed claim, while a verb mistaken
 * for a name would reject an honest rewrite.
 */
function couldBeName(token) {
  if (SENTENCE_START_WORDS.has(token.toLowerCase())) return false;
  // Regular past tense, gerund or adverb: "Improved", "Building", "Additionally".
  if (/^[A-Za-z]{3,}(?:ed|ing|ly)$/.test(token)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Ownership level: a rewrite may change emphasis, never the level of ownership
// ---------------------------------------------------------------------------

/**
 * `/how-it-works` promises that a rewrite "cannot upgrade *supported* to *led*
 * unless the source says so". A prompt cannot keep that promise, so this does:
 * classify the verb that governs the source line and the verb that governs the
 * rewrite, and refuse a rewrite whose verb claims more ownership.
 *
 * Three levels, because that is the distinction a reader of a CV actually makes:
 *   support    — helped, assisted, contributed, participated, worked on
 *   execution  — designed, built, delivered, launched, migrated, scaled
 *   leadership — led, owned, drove, managed, headed, directed, founded
 *
 * The check is one-sided and narrow. It only fires when the rewrite's own leading
 * verb is on one of these lists and stronger than the source's level; anything
 * else ("Cut checkout latency…") claims nothing this can measure and is allowed.
 * A rejection costs the candidate an edit they asked for, so an unknown verb is
 * never treated as an upgrade.
 */
const SUPPORT_VERBS = new Set([
  "helped",
  "help",
  "helping",
  "assisted",
  "assist",
  "assisting",
  "supported",
  "support",
  "supporting",
  "contributed",
  "contribute",
  "contributing",
  "participated",
  "participate",
  "participating",
  "worked",
  "work",
  "working",
  "collaborated",
  "collaborate",
  "collaborating",
  "involved",
  "tasked",
]);

const EXECUTION_VERBS = new Set([
  "designed",
  "design",
  "designing",
  "architected",
  "architect",
  "architecting",
  "built",
  "build",
  "building",
  "delivered",
  "deliver",
  "delivering",
  "launched",
  "launch",
  "launching",
  "scaled",
  "scale",
  "scaling",
  "implemented",
  "implement",
  "implementing",
  "developed",
  "develop",
  "developing",
  "created",
  "create",
  "creating",
  "shipped",
  "ship",
  "shipping",
  "migrated",
  "migrate",
  "migrating",
  "automated",
  "automate",
  "automating",
  "introduced",
  "introduce",
  "introducing",
  "established",
  "establish",
  "establishing",
  "streamlined",
  "streamline",
  "streamlining",
  "rebuilt",
  "rebuild",
  "rebuilding",
]);

const LEADERSHIP_VERBS = new Set([
  "led",
  "lead",
  "leading",
  "drove",
  "drive",
  "driving",
  "owned",
  "own",
  "owning",
  "managed",
  "manage",
  "managing",
  "headed",
  "head",
  "heading",
  "directed",
  "direct",
  "directing",
  "oversaw",
  "oversee",
  "overseeing",
  "founded",
  "found",
  "founding",
  "spearheaded",
  "spearhead",
  "spearheading",
  "championed",
  "champion",
  "championing",
]);

const OWNERSHIP_LEVELS = { support: 1, execution: 2, leadership: 3 };

/** Words that can sit before the verb without being it. */
const LEAD_SKIP_WORDS = new Set([
  "i",
  "we",
  "he",
  "she",
  "they",
  "also",
  "then",
  "later",
  "successfully",
  "personally",
  "have",
  "has",
  "had",
  "was",
  "were",
  "been",
  "being",
  "am",
  "is",
  "are",
  "and",
  "but",
  "so",
  "subsequently",
  "additionally",
  "furthermore",
  "again",
]);

/**
 * Openers that set the level without a listed verb: "Responsible for…" claims
 * less than "Owned…", and "Tasked with…" less than "Led…". Only recognised at the
 * start of the line, never anywhere inside it ("Led the migration and was
 * responsible for zero downtime" is a leadership line).
 */
const SUPPORT_OPENERS =
  /^(?:i\s+(?:was|were|am|have\s+been|had\s+been)\s+)?(?:responsible\s+for|tasked\s+with|involved\s+in|part\s+of|a\s+part\s+of)\b/i;

/** The first verb of the line, or null when the first content word is not one. */
function leadingVerb(text) {
  const source = collapse(toText(text)).replace(/^[^A-Za-z]+/, "");
  if (!source) return null;
  if (SUPPORT_OPENERS.test(source)) return { word: "responsible for", level: "support" };
  const words = source.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    if (LEAD_SKIP_WORDS.has(word)) continue;
    if (SUPPORT_VERBS.has(word)) return { word, level: "support" };
    if (EXECUTION_VERBS.has(word)) return { word, level: "execution" };
    if (LEADERSHIP_VERBS.has(word)) return { word, level: "leadership" };
    return null;
  }
  return null;
}

/**
 * The ownership level a line claims. An unrecognised line is treated as
 * "execution", the middle: that lets "Improved latency by 40%" become "Delivered a
 * 40% latency improvement" (same level) while still refusing "Led the latency
 * work" (a level the line never claimed).
 */
function ownershipLevel(text) {
  const verb = leadingVerb(text);
  return verb ? OWNERSHIP_LEVELS[verb.level] : OWNERSHIP_LEVELS.execution;
}

/**
 * Does `rewritten` stay within the facts of `original`?
 *
 * Figures and currency amounts must appear in `original` itself: a metric belongs
 * to the bullet that earned it, and moving it to another bullet is a false claim
 * even when the number exists elsewhere in the CV. Employers, job titles,
 * qualifications and date ranges are checked against `original` plus `context`
 * (pass the full CV), because a rewrite may legitimately name something the CV
 * states — it may never name something the CV does not.
 *
 * Two further promises are mechanical here, not stylistic: a rewrite of one line
 * may not promote the level of ownership (`ownership`, line-for-line only), and a
 * rewrite may not name a lower-case tool or method the CV does not mention
 * (`skills`).
 *
 * @param {string} original source text (a bullet, or the whole CV)
 * @param {string} rewritten candidate rewrite
 * @param {{ context?: string, figures?: boolean, dates?: boolean,
 *           qualifications?: boolean, titles?: boolean, names?: boolean,
 *           skills?: boolean, ownership?: boolean }} [options]
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function assertGrounded(original, rewritten, options = {}) {
  const source = toText(original);
  const target = toText(rewritten);
  const context = toText(options.context);
  const check = {
    figures: options.figures !== false,
    dates: options.dates !== false,
    qualifications: options.qualifications !== false,
    titles: options.titles !== false,
    names: options.names !== false,
    skills: options.skills !== false,
    ownership: options.ownership !== false,
  };

  if (!source.trim()) {
    return { ok: false, reasons: ["there is no original text to check the rewrite against"] };
  }
  if (!target.trim()) {
    return { ok: false, reasons: ["the rewrite is empty"] };
  }

  const corpus = context ? `${source}\n${context}` : source;
  const reasons = [];
  const seen = new Set();
  const add = (reason) => {
    if (seen.has(reason)) return;
    seen.add(reason);
    reasons.push(reason);
  };

  // --- dates first, so a bad range is reported once rather than as stray years
  const rangeFigures = new Set();
  const rangeWords = [];
  if (check.dates) {
    const sourceRanges = new Set();
    for (const match of source.concat("\n", context).matchAll(DATE_RANGE_RE)) {
      sourceRanges.add(normalizeRange(match[0]));
    }
    for (const match of target.matchAll(DATE_RANGE_RE)) {
      if (sourceRanges.has(normalizeRange(match[0]))) continue;
      add(`new date range ${collapse(match[0])} is not in the original`);
      rangeWords.push(collapse(match[0]));
      for (const figure of numberMentions(match[0])) rangeFigures.add(figure.key);
    }
    const sourceMonths = new Set();
    for (const match of source.concat("\n", context).matchAll(/\b([A-Za-z]{3,9})\b/g)) {
      const word = match[1].toLowerCase();
      if (MONTH_CHECK_WORDS.includes(word)) sourceMonths.add(word);
    }
    for (const match of target.matchAll(/\b([A-Za-z]{3,9})\b/g)) {
      const word = match[1].toLowerCase().replace(/\.$/, "");
      if (!MONTH_CHECK_WORDS.includes(word) || sourceMonths.has(word)) continue;
      if (rangeWords.some((range) => range.toLowerCase().includes(word))) continue;
      add(`new month ${match[1]} is not in the original`);
    }
  }

  // --- figures and units, strictly against the original item
  if (check.figures) {
    const index = numberIndex(source);
    for (const mention of numberMentions(target)) {
      if (rangeFigures.has(mention.key)) continue;
      const units = index.get(mention.key);
      if (!units) {
        add(`new figure ${mention.raw} is not in the original`);
        continue;
      }
      if (mention.unit === "%" && !units.has("%")) {
        add(`new percentage ${mention.raw} is not in the original`);
        continue;
      }
      if (CURRENCY_UNITS.has(mention.unit) && !units.has(mention.unit)) {
        add(`new currency amount ${mention.raw} is not in the original`);
      }
    }
  }

  // --- qualifications
  if (check.qualifications) {
    const lowerSource = source.toLowerCase();
    const lowerCorpus = corpus.toLowerCase();
    for (const qualification of QUALIFICATIONS) {
      const pattern = new RegExp(
        `(^|[^a-z])${qualification.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]/g, "[\\s-]")}([^a-z]|$)`
      );
      if (!pattern.test(target.toLowerCase())) continue;
      if (pattern.test(lowerSource) || pattern.test(lowerCorpus)) continue;
      add(`new qualification "${qualification}" is not in the original`);
    }
  }

  // --- job titles (lowercase or title case), checked against the CV corpus
  if (check.titles) {
    const targetWords = new Set(
      target
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter(Boolean)
    );
    for (const word of targetWords) {
      if (!TITLE_WORDS.has(word)) continue;
      if (containsTerm(corpus, word)) continue;
      add(`new job title containing "${word}" is not in the original`);
    }
  }

  // --- employers, names and other proper nouns
  const unknownNames = [];
  if (check.names) {
    for (const phrase of properNounPhrases(target)) {
      if (containsTerm(corpus, phrase)) continue;
      unknownNames.push(phrase);
      add(`new name "${phrase}" is not in the original`);
    }
  }

  // --- lower-case tools and methods ("terraform", "microservices")
  if (check.skills) {
    // A capitalised tool ("Kubernetes") is already reported by the name check;
    // one cause deserves one reason.
    const alreadyNamed = new Set(unknownNames.map((name) => name.toLowerCase()));
    for (const skill of SKILL_TERMS) {
      if (alreadyNamed.has(skill)) continue;
      if (!containsTerm(target, skill)) continue;
      if (containsTerm(corpus, skill)) continue;
      add(`new skill "${skill}" is not in the original`);
    }
  }

  // --- the level of ownership the line claims
  //
  // Only line-for-line rewrites are judged: a multi-line source is a document (the
  // whole CV, a covering letter), and its opening verb says nothing about what a
  // summary or letter derived from it may claim. Comparing those would reject a
  // model summary that opens "Led a team of 12 engineers" over a CV whose first
  // word is the candidate's name — a wrong rejection, which costs more than a
  // missed one.
  if (check.ownership && !/[\r\n]/.test(source)) {
    const claimed = leadingVerb(target);
    if (claimed && OWNERSHIP_LEVELS[claimed.level] > ownershipLevel(source)) {
      add(
        `the rewrite claims "${claimed.word}", a stronger level of ownership than the original line supports`
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Rule-based rewriting
// ---------------------------------------------------------------------------

const FILLER_OPENERS = [
  /^i\s+was\s+responsible\s+for\s+/i,
  /^responsible\s+for\s+/i,
  /^my\s+role\s+was\s+to\s+/i,
  /^duties\s+included\s+/i,
  /^duties:\s*/i,
  /^tasks\s+included\s+/i,
  // Ownership-softening openers are deliberately NOT stripped. "Helped with
  // managing 12 engineers" must never become "Managed 12 engineers", and stripping
  // "Tasked with" would hand the gerund to GERUND_TO_PAST, which would promote it.
  /^in\s+charge\s+of\s+/i,
  /^in\s+my\s+role\s+as\s+[^,]{1,40},\s*/i,
  /^as\s+part\s+of\s+my\s+role,?\s*/i,
  /^successfully\s+/i,
];

const GERUND_TO_PAST = new Map([
  ["managing", "managed"],
  ["leading", "led"],
  ["building", "built"],
  ["developing", "developed"],
  ["running", "ran"],
  ["delivering", "delivered"],
  ["designing", "designed"],
  ["owning", "owned"],
  ["supporting", "supported"],
  ["maintaining", "maintained"],
  ["creating", "created"],
  ["implementing", "implemented"],
  ["improving", "improved"],
  ["reducing", "reduced"],
  ["increasing", "increased"],
  ["driving", "drove"],
  ["writing", "wrote"],
  ["testing", "tested"],
  ["analysing", "analysed"],
  ["analyzing", "analysed"],
  ["coordinating", "coordinated"],
  ["mentoring", "mentored"],
  ["training", "trained"],
  ["recruiting", "recruited"],
  ["negotiating", "negotiated"],
  ["migrating", "migrated"],
  ["deploying", "deployed"],
  ["automating", "automated"],
  ["scaling", "scaled"],
  ["launching", "launched"],
  ["shipping", "shipped"],
  ["overseeing", "oversaw"],
  ["handling", "handled"],
  ["producing", "produced"],
  ["reviewing", "reviewed"],
  ["reporting", "reported"],
  ["presenting", "presented"],
  ["collaborating", "collaborated"],
  ["working", "worked"],
  ["providing", "provided"],
  ["ensuring", "ensured"],
  ["organising", "organised"],
  ["organizing", "organised"],
  ["planning", "planned"],
  ["budgeting", "budgeted"],
  ["auditing", "audited"],
  ["documenting", "documented"],
  ["debugging", "debugged"],
  ["refactoring", "refactored"],
  ["monitoring", "monitored"],
  ["streamlining", "streamlined"],
  ["modernising", "modernised"],
  ["modernizing", "modernised"],
  ["supervising", "supervised"],
]);

/**
 * Tighten one bullet: drop filler openers and "successfully", recast a leading
 * gerund as a past-tense verb when one is known, and tidy the spacing. Digits are
 * never touched — no number is added, removed or restated.
 */
function tightenBullet(original) {
  let text = collapse(original);
  if (!text) return "";
  const before = text;

  for (const opener of FILLER_OPENERS) {
    const next = text.replace(opener, "");
    if (next !== text) {
      text = next;
      break;
    }
  }
  text = text.replace(/\bsuccessfully\s+/gi, "");

  const firstWord = (/^([A-Za-z]+)/.exec(text) ?? [])[1] ?? "";
  const past = GERUND_TO_PAST.get(firstWord.toLowerCase());
  if (past) {
    text = `${past} ${text.slice(firstWord.length).trim()}`;
  }

  text = collapse(text)
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[.;,\s]+$/, "")
    .trim();
  if (!text) return before;
  if (text.length < 16) return before;
  return upperFirst(text);
}

function keywordScore(text, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (containsTerm(text, keyword.term)) score += keyword.weight;
  }
  return Math.round(score * 100) / 100;
}

function collectBullets(parts) {
  const items = [];
  let order = 0;
  for (const part of parts) {
    if (part.key !== "experience" && part.key !== "other") continue;
    let role = "";
    for (const line of part.lines) {
      if (!line) continue;
      if (isRoleHeader(line)) {
        role = line;
        continue;
      }
      if (isMarkedBullet(line)) {
        items.push({ section: part.key, original: stripBulletMarker(line), role, order: order++ });
        continue;
      }
      const long = line.length >= 40 && line.length <= 400 && !/[.!?]$/.test(line);
      if (long) {
        items.push({ section: part.key, original: line, role, order: order++ });
      }
    }
  }
  return items;
}

/** When a CV has no bullet points at all, use its experience sentences. */
function sentenceBullets(parts, wholeText) {
  const experience = parts.filter((part) => part.key === "experience");
  const pool = experience.length
    ? experience.flatMap((part) => part.lines).join(" ")
    : parts
        .filter((part) => part.key !== "preamble")
        .flatMap((part) => part.lines)
        .join(" ");
  const items = [];
  let order = 0;
  for (const sentence of sentences(pool || wholeText)) {
    if (sentence.length < 40 || sentence.length > 320) continue;
    items.push({ section: "experience", original: stripTrailingStop(sentence), role: "", order: order++ });
    if (items.length >= 8) break;
  }
  return items;
}

function orderBySection(items, warnings) {
  const experience = items.filter((item) => item.section === "experience");
  const other = items.filter((item) => item.section !== "experience");
  const average = (list) =>
    list.length ? list.reduce((sum, item) => sum + item.score, 0) / list.length : 0;
  const experienceScore = average(experience);
  const otherScore = average(other);
  let order = ["experience", "other"];
  if (
    other.length >= 2 &&
    otherScore > 0 &&
    (experience.length === 0 || otherScore >= experienceScore * 2)
  ) {
    order = ["other", "experience"];
    warnings.push(
      "the projects and awards section leads the pack because it matches the job description more closely than the experience bullets"
    );
  }
  const byScore = (a, b) => b.score - a.score || a.order - b.order;
  return order.flatMap((key) =>
    items.filter((item) => (item.section === "experience" ? "experience" : "other") === key).sort(byScore)
  );
}

// ---------------------------------------------------------------------------
// Summary, letter and screening (rules path)
// ---------------------------------------------------------------------------

function detectYears(text) {
  const source = toText(text);
  const digits = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i.exec(source);
  if (digits) {
    const value = Number(digits[1]);
    if (Number.isFinite(value) && value > 0 && value < 60) return value;
  }
  const spelled = new RegExp(
    String.raw`\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:years?|yrs?)\b`,
    "i"
  ).exec(source);
  if (spelled && NUMBER_WORDS.has(spelled[1].toLowerCase())) {
    return NUMBER_WORDS.get(spelled[1].toLowerCase());
  }
  return null;
}

function cvFacts(cvText, parts, profile) {
  const experienceLines = parts
    .filter((part) => part.key === "experience")
    .flatMap((part) => part.lines);
  const header = experienceLines.find((line) => isRoleHeader(line)) ?? "";
  const role = roleFacts(header);
  const summaryPart = parts.find((part) => part.key === "summary");
  const cvSummary = summaryPart
    ? collapse(summaryPart.lines.filter(Boolean).join(" "))
    : "";
  return {
    years: detectYears(cvText),
    role,
    employer: firstString(profile.currentEmployer, role.employer),
    title: firstString(profile.currentRole, role.title),
    cvSummary,
  };
}

function cvClaimSentence({ facts, areas, warnings }) {
  const fromSummary = sentences(facts.cvSummary).slice(0, 2).join(" ").trim();
  if (fromSummary && wordCount(fromSummary) <= 45) return stripTrailingStop(fromSummary);

  const roleLabel = facts.title;
  if (!roleLabel) {
    warnings.push("the CV has no recognisable job title, so the summary does not name a role");
    return "";
  }
  const experience = facts.years ? ` with ${facts.years} years' experience` : "";
  const areaText = areas.length ? ` across ${listOf(areas.slice(0, 3))}` : "";
  return stripTrailingStop(`${roleLabel}${experience}${areaText}`);
}

/**
 * The summary is built from the CV's own claims, then pointed at the job. Every
 * figure in it comes from the CV (checked by the caller), never from the advert.
 */
function buildSummary({ facts, job, cvMatched }) {
  const warnings = [];
  const areas = cvMatched;
  const claim = cvClaimSentence({ facts, areas, warnings });
  const roleName = job.title || "this role";
  const target = job.company
    ? `Tailored to the ${roleName} role at ${job.company}`
    : `Tailored to the ${roleName} role`;
  const emphasis = cvMatched.slice(0, 3);
  const emphasisText = emphasis.length
    ? `: ${listOf(emphasis)} are already evidenced in this CV`
    : "";
  let summary = collapse(`${claim ? `${claim}. ` : ""}${target}${emphasisText}.`);
  if (wordCount(summary) > MAX_SUMMARY_WORDS) {
    const trimmed = sentences(summary).slice(0, 2).join(" ");
    if (trimmed && wordCount(trimmed) <= MAX_SUMMARY_WORDS) summary = trimmed;
  }
  return { text: summary, warnings };
}

function achievementSentence(bullet) {
  const rewritten = stripTrailingStop(bullet.rewritten);
  if (!rewritten) return "";
  const header = bullet.evidence.includes(" | ") ? bullet.evidence.split(" | ")[0] : "";
  const role = roleFacts(header);
  if (role.employer) {
    return `At ${role.employer}, I ${lowerFirst(rewritten)}.`;
  }
  return `I ${lowerFirst(rewritten)}.`;
}

/**
 * A short covering letter: names the company and the role, quotes the CV's own
 * achievements with their numbers, borrows the description's vocabulary, and says
 * nothing the CV cannot support. Placeholders are explicit rather than invented.
 */
function buildCoverLetter({ facts, job, profile, bullets, cvMatched }) {
  const warnings = [];
  const title = job.title || "the advertised role";
  const company = job.company;
  const greeting = company ? `Dear ${company} hiring team,` : "Dear hiring manager,";
  const opening = company
    ? `I am applying for the ${title} role at ${company}.`
    : `I am applying for the ${title} role.`;
  const claim = cvClaimSentence({ facts, areas: cvMatched.slice(0, 3), warnings });
  const claimLine = claim ? `${stripTrailingStop(claim)}.` : "";
  const withFigures = bullets
    .filter((bullet) => bullet.rewritten && /\d/.test(bullet.rewritten))
    .slice(0, 5)
    .map(achievementSentence)
    .filter(Boolean);
  const plain = bullets
    .filter((bullet) => bullet.rewritten)
    .slice(0, 4)
    .map(achievementSentence)
    .filter(Boolean);
  const pool = withFigures.length ? withFigures : plain;
  const emphasis = cvMatched.slice(0, 3);
  const jobLanguage = emphasis.length
    ? `The description emphasises ${listOf(emphasis)}, which is where most of the work above was done.`
    : "";
  const availability = profile.noticePeriod ? `My notice period is ${profile.noticePeriod}.` : "";
  const close = "I would welcome the chance to discuss the role.";
  const signature = `Yours sincerely,\n${profile.name || "[Your name]"}`;

  const required = [greeting, opening, claimLine, close, signature].filter(Boolean);
  const optional = [...pool, jobLanguage, availability].filter(Boolean);
  const assemble = (extras) =>
    required.slice(0, 3).concat(extras, required.slice(3)).filter(Boolean).join("\n\n");

  let chosen = [];
  let letter = assemble(chosen);
  for (const sentence of optional) {
    const candidate = assemble([...chosen, sentence]);
    if (wordCount(candidate) > LETTER_TARGET_WORDS) continue;
    chosen = [...chosen, sentence];
    letter = candidate;
  }
  while (wordCount(letter) > LETTER_MAX_WORDS && chosen.length) {
    chosen = chosen.slice(0, -1);
    letter = assemble(chosen);
  }

  const count = wordCount(letter);
  if (count < LETTER_MIN_WORDS) {
    warnings.push(
      `the covering letter is ${count} words, below the ${LETTER_MIN_WORDS}-word target, because the CV does not supply more grounded material`
    );
  }
  return { text: letter, words: count, warnings };
}

function buildMotivation({ job, bullets, matchedKeywords }) {
  const title = job.title || "the role";
  const company = job.company ? ` at ${job.company}` : "";
  const emphasis = matchedKeywords.slice(0, 2);
  const evidence = bullets.find((bullet) => bullet.rewritten)?.rewritten ?? "";
  const parts = [`I am applying for the ${title} role${company}.`];
  if (emphasis.length) {
    parts.push(`The description puts ${listOf(emphasis)} at the centre, which is the work I have been doing.`);
  }
  if (evidence) parts.push(`For example: ${lowerFirst(stripTrailingStop(evidence))}.`);
  return collapse(parts.join(" "));
}

function formatSalary(value, currency) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const grouped = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const symbol = { GBP: "£", USD: "$", EUR: "€" }[toText(currency).toUpperCase()] ?? "";
    return `${symbol}${grouped}`;
  }
  return firstString(value);
}

function buildScreening({ job, profile, bullets, matchedKeywords, motivation }) {
  const warnings = [];
  const noticePeriod = profile.noticePeriod || "to confirm";
  const rightToWork = profile.rightToWork || "to confirm";
  const salaryExpectation =
    formatSalary(profile.salaryExpectation, profile.salaryCurrency) || "to confirm";

  if (noticePeriod === "to confirm") {
    warnings.push("the notice period is a placeholder: the profile does not state one");
  }
  if (rightToWork === "to confirm") {
    warnings.push("the right-to-work answer is a placeholder: the profile does not state one");
  }
  if (salaryExpectation === "to confirm") {
    warnings.push("the salary expectation is a placeholder: the profile does not state one");
  }

  return {
    screening: {
      motivation: motivation || buildMotivation({ job, bullets, matchedKeywords }),
      noticePeriod,
      rightToWork,
      salaryExpectation,
    },
    warnings,
  };
}

function placedKeywords(jobKeywords, haystack, limit = 25) {
  const placed = [];
  for (const keyword of jobKeywords) {
    if (!containsTerm(haystack, keyword.term)) continue;
    placed.push(keyword.term);
    if (placed.length >= limit) break;
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

function parseJob(job) {
  if (typeof job === "string") {
    return {
      title: "",
      company: "",
      description: job.trim(),
      location: "",
      currency: "",
    };
  }
  const source = job && typeof job === "object" ? job : {};
  return {
    title: firstString(source.title, source.jobTitle, source.job_title, source.role),
    company: firstString(source.company, source.companyName, source.company_name, source.employer),
    description: firstString(
      source.description,
      source.jobText,
      source.job_text,
      source.text,
      source.body
    ),
    location: firstString(source.location),
    currency: firstString(source.currency),
  };
}

function parseProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const screening =
    source.screening && typeof source.screening === "object" ? source.screening : {};
  return {
    name: firstString(source.name, source.fullName, source.full_name, screening.name),
    email: firstString(source.email, screening.email),
    currentRole: firstString(
      source.currentRole,
      source.current_role,
      source.title,
      source.headline
    ),
    currentEmployer: firstString(
      source.currentEmployer,
      source.current_employer,
      source.employer
    ),
    noticePeriod: firstString(
      source.noticePeriod,
      source.notice_period,
      source.availability,
      screening.noticePeriod,
      screening.notice_period
    ),
    rightToWork: firstString(
      source.rightToWork,
      source.right_to_work,
      source.workAuthorisation,
      source.work_authorisation,
      screening.rightToWork,
      screening.right_to_work
    ),
    salaryExpectation:
      source.salaryExpectation ??
      source.salary_expectation ??
      source.expectedSalary ??
      source.expected_salary ??
      screening.salaryExpectation ??
      screening.salary_expectation,
    salaryCurrency: firstString(
      source.salaryCurrency,
      source.salary_currency,
      source.currency,
      screening.salaryCurrency
    ),
  };
}

// ---------------------------------------------------------------------------
// Model path
// ---------------------------------------------------------------------------

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
        required: ["section", "original", "rewritten"],
        properties: {
          section: { type: "string" },
          original: { type: "string" },
          rewritten: { type: "string" },
        },
      },
    },
    coverLetter: { type: "string" },
    screening: {
      type: "object",
      additionalProperties: false,
      properties: { motivation: { type: "string" } },
    },
  },
};

const MODEL_SYSTEM = [
  "You rewrite CV content for one specific job.",
  "Use only facts stated in the CV. Never add an employer, a job title, a date, a qualification, a figure or a currency amount that the CV does not contain.",
  "Keep every figure from the original bullet you are rewriting, and keep it attached to the same claim.",
  "Rephrasing and reordering are allowed. Invention is not.",
  "Write in British English, plainly, with no hype and no exclamation marks.",
  "Reply with JSON only.",
].join(" ");

function buildModelPrompt({ cvText, profile, job, jobKeywords, bullets }) {
  const lines = [];
  lines.push("JOB");
  lines.push(`Title: ${job.title || "(not stated)"}`);
  lines.push(`Company: ${job.company || "(not stated)"}`);
  lines.push(`Description:\n${job.description.slice(0, 6000) || "(not supplied)"}`);
  lines.push("");
  lines.push("JOB KEYWORDS (in priority order)");
  lines.push(jobKeywords.slice(0, 30).map((row) => row.term).join(", ") || "(none extracted)");
  lines.push("");
  lines.push("CANDIDATE FACTS FROM THE PROFILE");
  lines.push(`Name: ${profile.name || "(not stated)"}`);
  lines.push(`Current role: ${profile.currentRole || "(not stated)"}`);
  lines.push(`Notice period: ${profile.noticePeriod || "(not stated)"}`);
  lines.push(`Salary expectation: ${formatSalary(profile.salaryExpectation, profile.salaryCurrency) || "(not stated)"}`);
  lines.push("");
  lines.push("CV TEXT");
  lines.push(cvText.slice(0, 12000));
  lines.push("");
  lines.push("BULLETS TO CONSIDER (rewrite these, keeping each original string exactly)");
  for (const bullet of bullets.slice(0, MAX_BULLETS)) {
    lines.push(`- ${bullet.original}`);
  }
  lines.push("");
  lines.push("TASK");
  lines.push(
    "Return one JSON object with: summary (2 sentences, at most 70 words); bullets (array of objects with section, original, rewritten — original must be copied verbatim from the CV); coverLetter (150 to 220 words, naming the company and the role, using only CV facts and the job description's own language); screening.motivation (2 sentences)."
  );
  return lines.join("\n");
}

/** Unwrap common provider envelopes without trusting anything inside them. */
function unwrapModelOutput(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.summary === "string" || Array.isArray(raw.bullets)) return raw;
  for (const key of ["data", "json", "output", "result", "content", "text"]) {
    const value = raw[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.summary === "string" || Array.isArray(value.bullets)) return value;
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to the next candidate
      }
    }
  }
  return null;
}

function normaliseForLookup(text) {
  return normalizeTerm(text);
}

/**
 * Hard shape validation. `original` strings must be copied from the CV — a model
 * that paraphrases the source is editing the record, not tailoring it.
 */
function validateModelPayload(payload, cvText) {
  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, problems: ["the payload is not a JSON object"] };
  }
  const summary = toText(payload.summary).trim();
  if (!summary) problems.push("summary is missing");
  const letter = toText(payload.coverLetter).trim();
  if (!letter) problems.push("coverLetter is missing");

  const cvLookup = normaliseForLookup(cvText);
  const bullets = payload.bullets;
  const acceptedBullets = [];
  if (!Array.isArray(bullets) || bullets.length === 0) {
    problems.push("bullets is missing or empty");
  } else if (bullets.length > 24) {
    problems.push(`bullets has ${bullets.length} entries, over the limit of 24`);
  } else {
    bullets.forEach((bullet, index) => {
      const where = `bullets[${index}]`;
      const local = [];
      if (!bullet || typeof bullet !== "object" || Array.isArray(bullet)) {
        problems.push(`${where} is not an object`);
        return;
      }
      const original = toText(bullet.original).trim();
      const rewritten = toText(bullet.rewritten).trim();
      if (!original) local.push(`${where}.original is empty`);
      else if (original.length > 600) local.push(`${where}.original is longer than 600 characters`);
      else if (!cvLookup.includes(normaliseForLookup(original))) {
        local.push(`${where}.original is not present in the CV`);
      }
      if (!rewritten) local.push(`${where}.rewritten is empty`);
      else if (rewritten.length > 600) local.push(`${where}.rewritten is longer than 600 characters`);
      if (local.length) {
        problems.push(...local);
        return;
      }
      acceptedBullets.push({
        section: toText(bullet.section).trim(),
        original,
        rewritten,
      });
    });
  }

  return {
    ok: problems.length === 0,
    problems,
    payload: {
      summary,
      coverLetter: letter,
      bullets: acceptedBullets,
      motivation: toText(payload.screening?.motivation).trim(),
    },
  };
}

async function requestModel({ model, cvText, profile, job, jobKeywords, bullets }) {
  if (!model || (typeof model !== "object" && typeof model !== "function")) {
    return { ok: false, reason: "no model was supplied" };
  }
  if (typeof model.complete !== "function") {
    return { ok: false, reason: "the supplied model has no complete() method" };
  }
  let raw;
  try {
    raw = await model.complete({
      system: MODEL_SYSTEM,
      prompt: buildModelPrompt({ cvText, profile, job, jobKeywords, bullets }),
      schema: MODEL_SCHEMA,
    });
  } catch (error) {
    const message = error && error.message ? collapse(error.message) : "the call threw";
    return { ok: false, reason: `the model call failed (${message.slice(0, 160)})` };
  }
  const payload = unwrapModelOutput(raw);
  if (!payload) {
    return { ok: false, reason: "the model did not return a JSON object" };
  }
  const validation = validateModelPayload(payload, cvText);
  if (!validation.ok) {
    const shown = validation.problems.slice(0, 3).join("; ");
    const rest = validation.problems.length > 3 ? ` (+${validation.problems.length - 3} more)` : "";
    return { ok: false, reason: `${shown}${rest}` };
  }
  return { ok: true, payload: validation.payload };
}

const SECTION_KEYS = new Set(["summary", "experience", "education", "skills", "other"]);

function canonicalSection(value, fallback = "experience") {
  const key = toText(value).toLowerCase().trim();
  if (SECTION_KEYS.has(key)) return key;
  const derived = sectionKeyFor(key);
  if (derived && derived !== "preamble") return derived;
  return fallback;
}

function letterMentionsJob(letter, job) {
  const text = toText(letter);
  if (job.company && !containsTerm(text, job.company)) return false;
  if (job.title && !containsTerm(text, job.title)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rules path orchestration
// ---------------------------------------------------------------------------

function rulesTailor({ cvText, parts, facts, job, profile, jobKeywords, cvMatched, roleIndex }) {
  const warnings = [];
  let candidates = collectBullets(parts);
  if (candidates.length === 0) {
    candidates = sentenceBullets(parts, cvText);
    if (candidates.length) {
      warnings.push(
        "the CV has no bullet points, so sentences from the experience section were used instead"
      );
    }
  }

  const scored = candidates.map((item) => ({
    ...item,
    score: keywordScore(item.original, jobKeywords),
  }));
  const matched = scored.filter((item) => item.score > 0);
  const unmatched = scored.filter((item) => item.score === 0);
  const selected = [...matched, ...unmatched].slice(0, MAX_BULLETS);

  const tightened = selected.map((item) => {
    const rewritten = tightenBullet(item.original);
    const grounded = assertGrounded(item.original, rewritten, { context: cvText });
    if (!grounded.ok) {
      warnings.push(
        `a bullet was kept verbatim because the tightened wording failed the grounding check: ${grounded.reasons[0]}`
      );
    }
    return {
      section: item.section,
      original: item.original,
      rewritten: grounded.ok ? rewritten : item.original,
      evidence: item.role ? `${item.role} | ${item.original}` : item.original,
      score: item.score,
      order: item.order,
    };
  });

  const bullets = orderBySection(tightened, warnings).map(
    ({ section, original, rewritten, evidence }) => ({ section, original, rewritten, evidence })
  );

  for (const bullet of bullets) {
    const key = normaliseForLookup(bullet.original);
    if (!roleIndex.has(key)) roleIndex.set(key, bullet.evidence);
  }

  const summary = buildSummary({ facts, job, cvMatched });
  const coverLetter = buildCoverLetter({ facts, job, profile, bullets, cvMatched });

  return { bullets, warnings, summary, coverLetter };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Tailor a CV to one job.
 *
 * @param {{ cvText: string, profile?: object, job?: object, model?: object }} input
 *   `model` is optional and, when present, must expose
 *   `complete({ system, prompt, schema })` resolving to parsed JSON.
 * @returns {Promise<{ summary: string, bullets: {section:string, original:string,
 *   rewritten:string, evidence:string}[], keywordsPlaced: string[], coverLetter: string,
 *   screening: { motivation: string, noticePeriod: string, rightToWork: string,
 *   salaryExpectation: string }, warnings: string[], mode: "model"|"rules" }>}
 */
export async function tailorCv({ cvText, profile, job, model } = {}) {
  const text = toText(cvText);
  const parsedJob = parseJob(job);
  const parsedProfile = parseProfile(profile);
  const warnings = [];

  if (!text.trim()) {
    warnings.push("the CV text is empty, so there is nothing to tailor");
    return {
      summary: "",
      bullets: [],
      keywordsPlaced: [],
      coverLetter: "",
      screening: {
        motivation: "",
        noticePeriod: parsedProfile.noticePeriod || "to confirm",
        rightToWork: parsedProfile.rightToWork || "to confirm",
        salaryExpectation:
          formatSalary(parsedProfile.salaryExpectation, parsedProfile.salaryCurrency) || "to confirm",
      },
      warnings,
      mode: "rules",
    };
  }

  const parts = splitCv(text);
  const facts = cvFacts(text, parts, parsedProfile);
  const jobKeywords = extractKeywords(parsedJob.description, { limit: 40 });
  const cvMatched = jobKeywords
    .filter((keyword) => containsTerm(text, keyword.term))
    .map((keyword) => keyword.term);
  const roleIndex = new Map();

  const rules = rulesTailor({
    cvText: text,
    parts,
    facts,
    job: parsedJob,
    profile: parsedProfile,
    jobKeywords,
    cvMatched,
    roleIndex,
  });

  warnings.push(...rules.warnings);
  let summary = rules.summary.text;
  let bullets = rules.bullets;
  let coverLetter = rules.coverLetter.text;
  let motivation = "";
  let mode = "rules";
  let modelSummaryUsed = false;
  let modelLetterUsed = false;

  if (model) {
    const attempt = await requestModel({
      model,
      cvText: text,
      profile: parsedProfile,
      job: parsedJob,
      jobKeywords,
      bullets,
    });

    if (!attempt.ok) {
      warnings.push(`model output rejected, rules used instead: ${attempt.reason}`);
    } else {
      const payload = attempt.payload;
      const summaryWords = wordCount(payload.summary);
      const summaryCheck = assertGrounded(text, payload.summary, { context: [parsedJob.title, parsedJob.company].filter(Boolean).join("\n") });
      if (summaryWords > MAX_SUMMARY_WORDS) {
        warnings.push(
          `model summary replaced: it is ${summaryWords} words, over the ${MAX_SUMMARY_WORDS}-word limit`
        );
      } else if (!summaryCheck.ok) {
        warnings.push(`model summary replaced: ${summaryCheck.reasons[0]}`);
      } else {
        summary = payload.summary;
        modelSummaryUsed = true;
      }

      const letterWords = wordCount(payload.coverLetter);
      const letterCheck = assertGrounded(text, payload.coverLetter, {
        context: [parsedJob.title, parsedJob.company].filter(Boolean).join("\n"),
      });
      if (!letterCheck.ok) {
        warnings.push(`model cover letter replaced: ${letterCheck.reasons[0]}`);
      } else if (letterWords < LETTER_MIN_WORDS || letterWords > LETTER_MAX_WORDS) {
        warnings.push(
          `model cover letter replaced: it is ${letterWords} words, outside the ${LETTER_MIN_WORDS} to ${LETTER_MAX_WORDS} word range`
        );
      } else if (!letterMentionsJob(payload.coverLetter, parsedJob)) {
        warnings.push("model cover letter replaced: it does not name the company and the role");
      } else {
        coverLetter = payload.coverLetter;
        modelLetterUsed = true;
      }

      const modelBullets = [];
      for (const bullet of payload.bullets) {
        const baseline = rules.bullets.find(
          (item) => normaliseForLookup(item.original) === normaliseForLookup(bullet.original)
        );
        const fallback = baseline
          ? baseline
          : {
              section: canonicalSection(bullet.section),
              original: bullet.original,
              rewritten: tightenBullet(bullet.original),
              evidence: roleIndex.get(normaliseForLookup(bullet.original)) ?? bullet.original,
            };
        const grounded = assertGrounded(bullet.original, bullet.rewritten, { context: text });
        if (!grounded.ok) {
          warnings.push(
            `a model bullet was replaced with the CV's own wording: ${grounded.reasons[0]}`
          );
          modelBullets.push(fallback);
          continue;
        }
        modelBullets.push({
          section: canonicalSection(bullet.section, fallback.section),
          original: bullet.original,
          rewritten: bullet.rewritten,
          evidence: fallback.evidence,
        });
      }

      if (modelBullets.length) {
        const seen = new Set();
        bullets = modelBullets
          .filter((bullet) => {
            const key = normaliseForLookup(bullet.original);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, MAX_BULLETS);
      }

      if (payload.motivation) {
        const motivationCheck = assertGrounded(text, payload.motivation, {
          context: [parsedJob.title, parsedJob.company].filter(Boolean).join("\n"),
        });
        if (motivationCheck.ok) motivation = payload.motivation;
        else warnings.push(`model motivation replaced: ${motivationCheck.reasons[0]}`);
      }
    }
  }

  // Final safety net: no ungrounded bullet leaves this function.
  bullets = bullets.map((bullet) => {
    const grounded = assertGrounded(bullet.original, bullet.rewritten, { context: text });
    if (grounded.ok) return bullet;
    warnings.push(`a bullet was reset to the CV's own wording: ${grounded.reasons[0]}`);
    return { ...bullet, rewritten: bullet.original };
  });

  if (!modelSummaryUsed) warnings.push(...rules.summary.warnings);
  if (!modelLetterUsed) warnings.push(...rules.coverLetter.warnings);

  const { screening, warnings: screeningWarnings } = buildScreening({
    job: parsedJob,
    profile: parsedProfile,
    bullets,
    matchedKeywords: cvMatched,
    motivation,
  });
  warnings.push(...screeningWarnings);

  const keywordsPlaced = placedKeywords(
    jobKeywords,
    [summary, ...bullets.map((bullet) => bullet.rewritten)].join("\n")
  );

  const coverage = keywordCoverage(text, parsedJob.description, { limit: 25 });
  if (coverage.missing.length) {
    warnings.push(
      `the description asks for terms the CV does not contain: ${coverage.missing.slice(0, 6).join(", ")}`
    );
  }
  if (!parsedJob.title) warnings.push("the job does not state a title, so the letter uses a generic role name");
  if (!parsedJob.company) warnings.push("the job does not state a company, so the letter does not name one");

  if (modelSummaryUsed && modelLetterUsed) mode = "model";

  return {
    summary,
    bullets,
    keywordsPlaced,
    coverLetter,
    screening,
    warnings: dedupe(warnings).slice(0, MAX_WARNINGS),
    mode,
  };
}
