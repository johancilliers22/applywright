/**
 * Capture a job posting from a page the user is looking at.
 *
 * The user pastes a URL (and, when the page is behind a login or rendered by
 * JavaScript, the page HTML or its visible text). This module turns that into a
 * Job row for the `jobs` table, with an honest confidence score and warnings for
 * everything it could not find.
 *
 * Extraction order, most trustworthy first:
 *   1. schema.org JobPosting JSON-LD, on any host (that is the reliable path).
 *   2. Board-specific page structure for Greenhouse, Lever, Workable, Ashby and
 *      Workday.
 *   3. Open Graph / Twitter meta tags, then visible headings.
 *
 * Nothing here reads the network, the clock or the filesystem. Same input, same
 * output, always: the caller stamps `fetched_at` and any id when it persists the
 * job. `description` is capped at 8 000 characters, matching `sources.js`.
 *
 * Salary is recorded only when a currency and a number are both explicitly
 * stated. Hourly, daily and weekly rates are reported in `warnings` but not
 * annualised, because that would need assumptions about the working year; a
 * monthly figure is multiplied by twelve and the warning says so.
 *
 * Company names and job titles are never invented. If the page does not state
 * them they come back as null, with a warning telling the user to add them.
 *
 * @see docs/SPEC.md §5 (module contract), §3 (jobs table), §9 (quality bar)
 */
import { normalizeTerm, sha256 } from "../text.js";

/** Longest description kept, in characters. Matches the feed cap in sources.js. */
const MAX_DESCRIPTION = 8000;
const MAX_WARNINGS = 24;
const MAX_TAGS = 8;

/** Longest field values kept, in characters — guards against a hostile page. */
const MAX_TITLE = 140;
const MAX_COMPANY = 120;
const MAX_LOCATION = 160;
const MAX_EXTERNAL_ID = 120;

/**
 * Hosts this module knows by name. `myworkdayjobs.com` is a wildcard over the
 * tenant subdomain (`acme.wd5.myworkdayjobs.com`). Anything else is captured
 * through the generic path, which is a real path (JSON-LD, Open Graph, visible
 * headings) and not a stub.
 */
export const CAPTURE_SOURCES = Object.freeze([
  Object.freeze({
    source: "greenhouse",
    label: "Greenhouse",
    hosts: Object.freeze([
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io",
      "job-boards.eu.greenhouse.io",
    ]),
  }),
  Object.freeze({
    source: "lever",
    label: "Lever",
    hosts: Object.freeze(["jobs.lever.co", "jobs.eu.lever.co"]),
  }),
  Object.freeze({ source: "workable", label: "Workable", hosts: Object.freeze(["apply.workable.com"]) }),
  Object.freeze({ source: "ashby", label: "Ashby", hosts: Object.freeze(["jobs.ashbyhq.com"]) }),
  Object.freeze({ source: "workday", label: "Workday", hosts: Object.freeze(["*.myworkdayjobs.com"]) }),
]);

const HOST_MATCHERS = Object.freeze([
  ["greenhouse", /^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/],
  ["lever", /^jobs(?:\.eu)?\.lever\.co$/],
  ["workable", /^apply\.workable\.com$/],
  ["ashby", /^jobs\.ashbyhq\.com$/],
  ["workday", /^(?:[a-z0-9-]+\.)*myworkdayjobs\.com$/],
]);

/** Tags that are never page copy: script bodies must not become facts. */
const DANGEROUS_TAGS = "script|style|noscript|template|iframe|object|embed|svg|canvas|head";
const CHROME_TAGS = new Set(["header", "nav", "footer", "aside"]);
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const GENERIC_HEADINGS = new Set([
  "career",
  "careers",
  "current openings",
  "home",
  "job",
  "job board",
  "job search",
  "jobs",
  "join us",
  "loading",
  "loading…",
  "open positions",
  "open roles",
  "recruitment",
  "search jobs",
  "vacancies",
  "vacancy",
  "welcome",
  "work with us",
]);

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  eacute: "é",
  emdash: "—",
  ensp: " ",
  euro: "€",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  pound: "£",
  quot: '"',
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  shy: "",
  times: "×",
  trade: "™",
  yen: "¥",
});

const CURRENCY_SYMBOLS = Object.freeze({ "£": "GBP", $: "USD", "€": "EUR", "¥": "JPY", "₹": "INR" });
const CURRENCY_CODES = Object.freeze([
  "GBP",
  "USD",
  "EUR",
  "CAD",
  "AUD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "INR",
  "JPY",
  "SGD",
  "NZD",
  "ZAR",
  "BRL",
  "MXN",
  "HKD",
  "ILS",
  "AED",
]);
const CURRENCY_CODE_SET = new Set(CURRENCY_CODES);
const CURRENCY_TOKEN = `(?:[£$€¥₹]|(?:${CURRENCY_CODES.join("|")})\\b)`;

/** Words that must be near a currency amount before it counts as a salary. */
const SALARY_CUE =
  /\b(?:salar(?:y|ies)|compensation|remuneration|package|pay|wage|rate|per annum|p\.?\s?a\.?|annum|pro rata|ote|base)\b/i;

const RANGE_GAP = /^\s*(?:-|–|—|to|and|up to)\s*$/i;
const UP_TO_PREFIX = /(?:up to|maximum of|max\.?|no more than)\s*$/i;
const FROM_PREFIX = /(?:from|starting at|at least|minimum of|min\.?)\s*$/i;

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gh_src",
  "lever-origin",
  "lever-source",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "s_cid",
  "src",
  "trk",
  "trackingid",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const APPLICATION_TITLE = /^Job Application for (.+?) at (.+)$/i;
const TITLE_SEPARATOR = /\s+[|–—·]\s+|\s+-\s+/;

/**
 * Board-specific selectors, tried in order. Matchers are deliberately tiny
 * objects rather than CSS strings: the page is scanned with tag/attribute
 * matching, not parsed into a DOM, so only the shapes below are supported.
 *
 * These selectors are best effort. When a board changes its markup the generic
 * path still works, which is why JSON-LD is preferred and why confidence drops.
 */
const HOST_RULES = Object.freeze({
  greenhouse: {
    title: [{ tag: "h1", class: "app-title" }, { tag: "h1" }],
    company: [{ class: "company-name" }, { class: "company" }],
    location: [{ class: "location" }, { class: "job-location" }],
    description: [{ attrs: { id: "content" } }, { attrs: { id: "app_body" } }, { tag: "main" }],
    externalId: (url) =>
      url.searchParams.get("gh_jid") || matchOr(url.pathname, /\/jobs\/(\d{6,})\b/) || "",
  },
  lever: {
    title: [{ tag: "h2" }, { tag: "h1" }],
    company: [{ class: "posting-header-company" }, { class: "company" }],
    location: [{ class: "location" }],
    workplace: [{ class: "workplaceTypes" }],
    department: [{ class: "department" }],
    description: [{ class: "posting-page" }, { tag: "main" }],
    externalId: (url) => matchOr(url.pathname, /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i),
  },
  workable: {
    title: [{ attrs: { "data-ui": "job-title" } }, { tag: "h1" }],
    company: [{ attrs: { "data-ui": "company-name" } }, { class: "company-name" }],
    location: [{ attrs: { "data-ui": "job-location" } }, { class: "location" }],
    description: [{ attrs: { "data-ui": "job-description" } }, { tag: "main" }],
    externalId: (url) => matchOr(url.pathname, /\/j\/([A-Za-z0-9]{6,})\b/),
  },
  ashby: {
    title: [{ tag: "h1" }],
    company: [{ class: "ashby-job-posting-company" }, { class: "company" }],
    location: [{ class: "ashby-job-posting-location" }, { class: "location" }],
    description: [{ tag: "main" }, { class: "ashby-job-posting-description" }],
    externalId: (url) => lastPathSegment(url.pathname, /^[A-Za-z0-9-]{8,}$/),
    javascriptRendered: true,
  },
  workday: {
    title: [{ attrs: { "data-automation-id": "jobPostingHeader" } }, { tag: "h1" }, { tag: "h2" }],
    company: [{ attrs: { "data-automation-id": "company" } }],
    location: [{ attrs: { "data-automation-id": "locations" } }, { attrs: { "data-automation-id": "location" } }],
    description: [{ attrs: { "data-automation-id": "jobPostingDescription" } }, { tag: "main" }],
    externalId: (url) => matchOr(url.pathname.replace(/\/+$/, ""), /_([A-Za-z0-9-]+)$/),
    javascriptRendered: true,
  },
});

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const round2 = (value) => Math.round(value * 100) / 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBlock(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return text.slice(0, limit).trim();
}

function uniq(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function matchOr(source, pattern) {
  const match = pattern.exec(String(source ?? ""));
  return match && match[1] ? match[1] : "";
}

function lastPathSegment(pathname, pattern) {
  const segments = String(pathname ?? "")
    .split("/")
    .filter(Boolean);
  const last = segments.length ? segments[segments.length - 1] : "";
  return pattern.test(last) ? last : "";
}

function pushList(target, value) {
  if (value === undefined || value === null) return;
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (typeof item === "string" || typeof item === "number") target.push(item);
    else if (isObject(item) && typeof item.name === "string") target.push(item.name);
  }
}

/* ------------------------------------------------------------------ *
 * HTML scanning
 *
 * A regex scanner, not a parser. It is enough for the tags this module looks
 * for and it cannot be tricked into executing anything. Attribute values that
 * contain ">" are the known blind spot; see NOTES-capture.md.
 * ------------------------------------------------------------------ */

function tagPattern() {
  return /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
}

function moneyPattern() {
  return new RegExp(`(${CURRENCY_TOKEN})?\\s?(\\d{1,3}(?:[ ,.]\\d{3})+|\\d+)\\s?([kK])?(?:\\s?(${CURRENCY_TOKEN}))?`, "gi");
}

function parseAttributes(source) {
  const attrs = Object.create(null);
  const pattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let match;
  while ((match = pattern.exec(String(source ?? "")))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(name in attrs)) attrs[name] = value;
  }
  return attrs;
}

function matchesElement(tag, attrs, matcher) {
  if (!matcher) return false;
  if (matcher.tag && matcher.tag.toLowerCase() !== tag) return false;
  if (matcher.id && attrs.id !== matcher.id) return false;
  if (matcher.class) {
    const classes = String(attrs.class ?? "").split(/\s+/).filter(Boolean);
    if (!classes.includes(matcher.class)) return false;
  }
  if (matcher.classContains) {
    const classes = String(attrs.class ?? "").toLowerCase();
    if (!classes.includes(matcher.classContains.toLowerCase())) return false;
  }
  if (matcher.attrs) {
    for (const [name, expected] of Object.entries(matcher.attrs)) {
      if ((attrs[name] ?? null) !== expected) return false;
    }
  }
  return true;
}

/** Inner HTML of the element that opens at `innerStart`, with its end offset. */
function readElement(html, tagName, innerStart) {
  const tag = tagName.toLowerCase();
  if (VOID_TAGS.has(tag)) return { inner: "", end: innerStart };
  const pattern = new RegExp(`<(/?)${escapeRegex(tag)}\\b[^>]*>`, "gi");
  pattern.lastIndex = innerStart;
  let depth = 1;
  let match;
  while ((match = pattern.exec(html))) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) return { inner: html.slice(innerStart, match.index), end: match.index + match[0].length };
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }
  return { inner: html.slice(innerStart), end: html.length };
}

function findElements(html, matcher) {
  const source = String(html ?? "");
  const pattern = tagPattern();
  const found = [];
  let match;
  while ((match = pattern.exec(source))) {
    const tag = match[1].toLowerCase();
    const attrs = parseAttributes(match[2]);
    if (!matchesElement(tag, attrs, matcher)) continue;
    const innerStart = match.index + match[0].length;
    const { inner } = readElement(source, tag, innerStart);
    found.push({ tag, attrs, inner, text: htmlToText(inner) });
  }
  return found;
}

/** Drop elements (and their contents) that match `predicate`. */
function removeMatchingElements(html, predicate) {
  const source = String(html ?? "");
  const pattern = tagPattern();
  const parts = [];
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const tag = match[1].toLowerCase();
    const attrs = parseAttributes(match[2]);
    if (!predicate(tag, attrs)) continue;
    parts.push(source.slice(last, match.index));
    const innerStart = match.index + match[0].length;
    const { end } = readElement(source, tag, innerStart);
    last = end;
    pattern.lastIndex = end;
  }
  parts.push(source.slice(last));
  return parts.join("");
}

function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/**
 * Remove comments and anything that is code rather than page copy.
 * Script bodies are dropped before text extraction, so a fake salary in a
 * <script> tag cannot become a fact. JSON-LD is read separately, from the raw
 * HTML, before this runs.
 */
function stripDangerous(html) {
  let out = String(html ?? "").replace(/<!--[\s\S]*?-->/g, " ");
  const paired = new RegExp(`<(${DANGEROUS_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  const unclosed = new RegExp(`<(${DANGEROUS_TAGS})\\b[^>]*>[\\s\\S]*$`, "gi");
  // Nested blocks of the same tag survive one pass, so repeat before the
  // unclosed sweep catches whatever is left.
  for (let pass = 0; pass < 3; pass += 1) out = out.replace(paired, " ");
  return out.replace(unclosed, " ");
}

function removeHiddenElements(html) {
  return removeMatchingElements(html, (tag, attrs) => {
    if (Object.prototype.hasOwnProperty.call(attrs, "hidden")) return true;
    const style = String(attrs.style ?? "")
      .toLowerCase()
      .replace(/\s+/g, "");
    return style.includes("display:none") || style.includes("visibility:hidden");
  });
}

/** Visible text: block tags become line breaks, list items become bullets. */
function htmlToText(html) {
  let out = stripDangerous(html);
  out = removeHiddenElements(out);
  out = out.replace(/<\s*(?:br|hr)\s*\/?\s*>/gi, "\n");
  out = out.replace(/<\s*li\b[^>]*>/gi, "\n- ");
  out = out.replace(
    /<\s*\/\s*(?:p|div|section|article|main|aside|header|footer|nav|ul|ol|li|dl|dt|dd|h[1-6]|tr|blockquote|pre|figure|figcaption|table|tbody|thead|form|fieldset)\s*>/gi,
    "\n"
  );
  out = out.replace(/<\s*(?:td|th)\b[^>]*>/gi, " | ");
  out = out.replace(/<[^>]*>/g, " ");
  out = decodeEntities(out);
  out = out.replace(/\r\n?/g, "\n").replace(/[ \t\f\v\u00a0]+/g, " ");
  const lines = out
    .split("\n")
    .map((line) => line.replace(/^[ \t]+|[ \t]+$/g, "").replace(/^[|\s]+|[|\s]+$/g, ""))
    .filter((line) => line.length > 0 && line !== "|");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function readMeta(html) {
  const map = new Map();
  for (const element of findElements(html, { tag: "meta" })) {
    const key = cleanText(element.attrs.property || element.attrs.name || element.attrs.itemprop || "").toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, cleanText(decodeEntities(element.attrs.content ?? "")));
  }
  return map;
}

function firstElementText(html, matchers, minLength = 1) {
  for (const matcher of matchers ?? []) {
    const [element] = findElements(html, matcher);
    if (!element) continue;
    const text = cleanText(element.text);
    if (text.length >= minLength) return text;
  }
  return "";
}

function firstElementBlock(html, matchers, minLength = 1) {
  for (const matcher of matchers ?? []) {
    const [element] = findElements(html, matcher);
    if (!element) continue;
    const text = cleanBlock(element.text);
    if (text.length >= minLength) return text;
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

/** Parse a pasted URL, tolerating a missing scheme. Returns null when it is not http(s). */
function readUrl(value) {
  if (value instanceof URL) return value.protocol === "http:" || value.protocol === "https:" ? value : null;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}

function normaliseHost(hostname) {
  return String(hostname ?? "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function sourceForHost(host) {
  for (const [source, pattern] of HOST_MATCHERS) {
    if (pattern.test(host)) return source;
  }
  return null;
}

/**
 * Drop tracking parameters and the fragment so the same posting always hashes
 * and displays the same way. Keeps `gh_jid`, which identifies the posting.
 */
function canonicalUrl(url) {
  if (!url) return null;
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort((left, right) => {
      if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
      if (left[1] !== right[1]) return left[1] < right[1] ? -1 : 1;
      return 0;
    });
  const query = params.length
    ? `?${params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`
    : "";
  const port = url.port ? `:${url.port}` : "";
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
  return `${url.protocol}//${url.hostname}${port}${path}${query}`;
}

/* ------------------------------------------------------------------ *
 * JSON-LD
 * ------------------------------------------------------------------ */

function readTypes(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isJobPostingNode(node) {
  return readTypes(node?.["@type"]).some((type) => /(?:^|[/#])jobposting$/i.test(type.replace(/\s+/g, "")));
}

/** Depth-first search for the first JobPosting, through arrays and @graph. */
function findJobPosting(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findJobPosting(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (isJobPostingNode(value)) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith("@")) continue;
    const child = value[key];
    if (child && typeof child === "object") {
      const hit = findJobPosting(child, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function readJsonLdBlocks(html, warnings) {
  const blocks = [];
  const pattern = /<script\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = parseAttributes(match[1]);
    if (!String(attrs.type ?? "").toLowerCase().includes("ld+json")) continue;
    const raw = match[2].trim().replace(/^\uFEFF/, "");
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      warnings.push("A JSON-LD block on the page is not valid JSON and was ignored.");
    }
  }
  return blocks;
}

function readOrganisation(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = readOrganisation(item);
      if (name) return name;
    }
    return "";
  }
  if (isObject(value)) return cleanText(value.name ?? value.legalName ?? "");
  return "";
}

function readPlaces(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const places = [];
  for (const item of list) {
    if (typeof item === "string") {
      places.push(item);
      continue;
    }
    if (!isObject(item)) continue;
    const address = item.address ?? item;
    if (typeof address === "string") {
      places.push(address);
      continue;
    }
    if (!isObject(address)) {
      places.push(item.name ?? "");
      continue;
    }
    const locality = cleanText(address.addressLocality ?? "");
    const region = cleanText(address.addressRegion ?? "");
    const country = isObject(address.addressCountry)
      ? cleanText(address.addressCountry.name ?? "")
      : cleanText(address.addressCountry ?? "");
    const parts = uniq([locality, region, country]);
    if (parts.length) places.push(parts.join(", "));
    else if (item.name) places.push(item.name);
  }
  return uniq(places);
}

function readIdentifier(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = readIdentifier(item);
      if (id) return id;
    }
    return "";
  }
  if (isObject(value)) return cleanText(value.value ?? value.name ?? value["@id"] ?? "");
  return "";
}

/** `datePosted` is reduced to the calendar date as stated; no time zone games. */
function normaliseDate(value) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/* ------------------------------------------------------------------ *
 * Salary
 * ------------------------------------------------------------------ */

function readCurrency(token) {
  const value = cleanText(token);
  if (!value) return "";
  if (value.length === 1 && CURRENCY_SYMBOLS[value]) return CURRENCY_SYMBOLS[value];
  const upper = value.toUpperCase();
  return CURRENCY_CODE_SET.has(upper) ? upper : "";
}

/**
 * "45,000" -> 45000, "45.000" -> 45000 (European grouping), "45,000.00" -> 45000.
 * Grouped forms are decided by shape, not by locale, so the result is stable.
 */
function parseAmount(token, thousandsSuffix) {
  const raw = String(token ?? "").replace(/[\s\u00a0]/g, "");
  if (!raw) return null;
  let value = null;
  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(raw)) {
    const decimals = raw.split(/[.,]/).pop();
    const whole = raw.slice(0, raw.length - decimals.length - 1).replace(/[.,]/g, "");
    value = Number(`${whole}.${decimals}`);
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
    value = Number(raw.replace(/[.,]/g, ""));
  } else if (/^\d+$/.test(raw)) {
    value = Number(raw);
  } else if (/^\d+[.,]\d{1,2}$/.test(raw)) {
    value = Number(raw.replace(",", "."));
  }
  if (value === null || !Number.isFinite(value)) return null;
  if (thousandsSuffix) value *= 1000;
  return Math.round(value);
}

function readPeriod(text) {
  const value = String(text ?? "").toLowerCase();
  const order = [
    ["hour", /\b(?:per hour|hourly|an hour|p\/h)\b/],
    ["day", /\b(?:per day|daily|day rate|a day)\b/],
    ["week", /\b(?:per week|weekly|a week)\b/],
    ["month", /\b(?:per month|monthly|pcm|a month)\b/],
    ["year", /\b(?:per annum|p\.?\s?a\.?|annual(?:ly)?|per year|a year|annum)\b/],
  ];
  for (const [period, pattern] of order) {
    if (pattern.test(value)) return period;
  }
  return null;
}

function readUnit(value) {
  const text = cleanText(value).toUpperCase();
  if (!text) return null;
  if (/YEAR|ANNUAL|ANNUM/.test(text)) return "year";
  if (/MONTH/.test(text)) return "month";
  if (/WEEK/.test(text)) return "week";
  if (/DAY/.test(text)) return "day";
  if (/HOUR/.test(text)) return "hour";
  return null;
}

function acceptableTextSalary(amount, period, cue) {
  if (period === "hour" || period === "day" || period === "week") return amount > 0;
  if (amount < 1000) return false;
  return Boolean(cue) || amount >= 10000;
}

function annualise({ min, max, period, label }, warnings) {
  if (period === null || period === "year") return { min, max };
  if (period === "month") {
    warnings.push("The salary was stated per month; it was annualised by multiplying by 12.");
    return { min: min === null ? null : min * 12, max: max === null ? null : max * 12 };
  }
  warnings.push(`The salary was stated per ${label}; it was not converted to an annual figure.`);
  return null;
}

/**
 * Read a salary from visible text. A currency token must be attached to the
 * number, and the surrounding sentence must look like pay: this keeps "£100
 * voucher" and "£5m funding" out of the salary columns.
 */
function scanSalaryFromText(value, warnings) {
  const source = String(value ?? "");
  if (!source) return null;

  const found = [];
  const pattern = moneyPattern();
  let match;
  while ((match = pattern.exec(source))) {
    if (match[0] === "") {
      pattern.lastIndex += 1;
      continue;
    }
    const token = cleanText(match[1] ?? "") || cleanText(match[4] ?? "");
    const currency = readCurrency(token);
    if (!currency) continue;
    const amount = parseAmount(match[2], Boolean(match[3]));
    if (amount === null || amount <= 0) continue;
    found.push({
      currency,
      amount,
      token,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (!found.length) return null;

  const pairs = [];
  for (let index = 0; index < found.length; index += 1) {
    const first = found[index];
    const second = found[index + 1];
    if (!second || second.currency !== first.currency) continue;
    if (!RANGE_GAP.test(source.slice(first.end, second.start))) continue;
    const windowText = source.slice(Math.max(0, first.start - 90), Math.min(source.length, second.end + 90));
    const period = readPeriod(windowText);
    const cue = SALARY_CUE.test(windowText);
    if (!acceptableTextSalary(first.amount, period, cue)) continue;
    if (!acceptableTextSalary(second.amount, period, cue)) continue;
    pairs.push({ first, second, period, cue });
  }

  const chosenPair = pairs[0] ?? null;
  let chosenSingle = null;
  if (!chosenPair) {
    for (const item of found) {
      const windowText = source.slice(Math.max(0, item.start - 90), Math.min(source.length, item.end + 90));
      const period = readPeriod(windowText);
      const cue = SALARY_CUE.test(windowText);
      if (acceptableTextSalary(item.amount, period, cue)) {
        chosenSingle = { item, period, cue };
        break;
      }
    }
  }
  if (!chosenPair && !chosenSingle) return null;

  const anchor = chosenPair ? chosenPair.first : chosenSingle.item;
  const before = source.slice(Math.max(0, anchor.start - 24), anchor.start).toLowerCase();
  const upTo = UP_TO_PREFIX.test(before);
  const from = FROM_PREFIX.test(before);

  let min = null;
  let max = null;
  let period = null;
  let label = "";
  if (chosenPair) {
    min = Math.min(chosenPair.first.amount, chosenPair.second.amount);
    max = Math.max(chosenPair.first.amount, chosenPair.second.amount);
    period = chosenPair.period;
    label = period ?? "year";
    if (upTo) min = null;
    if (from) max = null;
  } else {
    const amount = chosenSingle.item.amount;
    period = chosenSingle.period;
    label = period ?? "year";
    if (upTo) max = amount;
    else if (from) min = amount;
    else {
      min = amount;
      max = amount;
    }
  }

  if (chosenPair && chosenPair.first.token === "$") {
    warnings.push("The salary was written with a dollar sign; USD was assumed. Check the currency before saving.");
  } else if (!chosenPair && chosenSingle.item.token === "$") {
    warnings.push("The salary was written with a dollar sign; USD was assumed. Check the currency before saving.");
  }

  const annual = annualise({ min, max, period, label }, warnings);
  if (!annual) return null;

  return {
    salary_min: annual.min,
    salary_max: annual.max,
    currency: (chosenPair ? chosenPair.first.currency : chosenSingle.item.currency) ?? null,
  };
}

function readNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") return parseAmount(value, false);
  return null;
}

/** One MonetaryAmount / QuantitativeValue node from JSON-LD. */
function parseMonetaryItem(item, warnings) {
  if (typeof item === "string") return scanSalaryFromText(item, warnings);
  if (!isObject(item)) return null; // a bare number has no currency, so it is not a stated salary

  const currency = readCurrency(item.currency ?? item.currencyCode ?? "");
  const value = item.value ?? item;
  const unit =
    readUnit(isObject(value) ? value.unitText ?? item.unitText : item.unitText ?? item.unit) ?? null;

  let single = null;
  let min = null;
  let max = null;

  if (typeof value === "number" || typeof value === "string") {
    if (typeof value === "string" && !currency) return scanSalaryFromText(value, warnings);
    single = readNumber(value);
    if (single === null && typeof value === "string") {
      const range = /(\d[\d,.]*)\s*(?:-|–|—|to)\s*(\d[\d,.]*)/.exec(value);
      if (range) {
        min = parseAmount(range[1], false);
        max = parseAmount(range[2], false);
      }
    }
  } else if (isObject(value)) {
    single = readNumber(value.value);
    min = readNumber(value.minValue);
    max = readNumber(value.maxValue);
  }

  if (single === null && min === null && max === null) return null;
  if (!currency) {
    warnings.push("Structured salary data had no currency, so no salary was recorded.");
    return null;
  }

  const annual = annualise(
    {
      min: min === null ? (single === null ? null : single) : min,
      max: max === null ? (single === null ? null : single) : max,
      period: unit,
      label: unit ?? "year",
    },
    warnings
  );
  if (!annual) return null;

  const lower = annual.min === null ? annual.max : annual.min;
  const upper = annual.max === null ? annual.min : annual.max;
  if (lower === null && upper === null) return null;
  return {
    salary_min: lower === null ? null : Math.min(lower, upper ?? lower),
    salary_max: upper === null ? null : Math.max(upper, lower ?? upper),
    currency,
  };
}

function salaryFromJsonLd(posting, warnings) {
  const base = posting.baseSalary;
  const estimated = posting.estimatedSalary;
  if (base) {
    const items = Array.isArray(base) ? base : [base];
    for (const item of items) {
      const parsed = parseMonetaryItem(item, warnings);
      if (parsed) return parsed;
    }
  }
  if (estimated) {
    warnings.push("Only an estimated salary was published; it was not recorded as a stated salary.");
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Titles, companies, locations
 * ------------------------------------------------------------------ */

function isPlausibleTitle(value) {
  const text = cleanText(value);
  if (text.length < 3 || text.length > MAX_TITLE) return false;
  if (/https?:|www\./i.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;
  return !GENERIC_HEADINGS.has(text.toLowerCase());
}

function isPlausibleCompany(value) {
  const text = cleanText(value);
  if (text.length < 2 || text.length > MAX_COMPANY) return false;
  if (/https?:|www\./i.test(text)) return false;
  return !GENERIC_HEADINGS.has(text.toLowerCase());
}

/**
 * Pull a title and a company out of one page-title string.
 * Only patterns with explicit evidence are used: the board's own
 * "Job Application for X at Y" wording, or a separator where one segment
 * already matches the page heading. Otherwise only the title is offered.
 */
function splitTitleString(value, knownTitle) {
  const raw = cleanText(value);
  if (!raw) return { title: "", company: "" };

  const application = APPLICATION_TITLE.exec(raw);
  if (application) {
    return {
      title: cleanText(application[1]),
      company: cleanText(application[2]),
    };
  }

  const segments = raw
    .split(TITLE_SEPARATOR)
    .map(cleanText)
    .filter(Boolean);

  if (segments.length === 2 && knownTitle) {
    const key = normalizeTerm(knownTitle);
    if (normalizeTerm(segments[0]) === key && isPlausibleCompany(segments[1])) {
      return { title: segments[0], company: segments[1] };
    }
    if (normalizeTerm(segments[1]) === key && isPlausibleCompany(segments[0])) {
      return { title: segments[1], company: segments[0] };
    }
  }

  const at = /^(.+?) at (.+)$/i.exec(raw);
  if (at) {
    const left = cleanText(at[1]);
    const right = cleanText(at[2]);
    const anchored = knownTitle ? normalizeTerm(left) === normalizeTerm(knownTitle) : isPlausibleTitle(left);
    if (anchored && isPlausibleCompany(right)) return { title: left, company: right };
  }

  return { title: "", company: "" };
}

/** The page <title>, used only as a last resort and reported as such. */
function titleFromTitleTag(value) {
  const segments = cleanText(value)
    .split(TITLE_SEPARATOR)
    .map(cleanText)
    .filter(Boolean);
  if (!segments.length) return "";
  if (segments.length > 1 && GENERIC_HEADINGS.has(segments[0].toLowerCase())) return "";
  const first = segments[0];
  return isPlausibleTitle(first) ? first : "";
}

function readRemote({ location, workplace, description }) {
  const local = [workplace, location].filter(Boolean).join(" ").toLowerCase();
  if (/\bremote\b/.test(local) && !/\bhybrid|on[- ]?site|in[- ]office\b/.test(local)) return true;
  if (/\b(?:hybrid|on[- ]?site|in[- ]?office)\b/.test(local)) return false;

  const intro = String(description ?? "")
    .slice(0, 400)
    .toLowerCase();
  if (/\b(?:fully remote|remote[- ]first|remote within|remote[- ]friendly|100% remote|work from home|home[- ]based|telecommute)\b/.test(intro)) {
    return true;
  }
  if (/\bhybrid\b/.test(intro)) return false;
  return null;
}

/** A "Location: Manchester" style line, which is explicit evidence when present. */
function labelledLocation(text) {
  const match = /\b(?:location|based in|office)\s*[:\-–]\s*([^.;|\n]{2,80})/i.exec(String(text ?? ""));
  if (!match) return "";
  const value = cleanText(match[1]);
  if (!value || value.length > MAX_LOCATION) return "";
  if (/^(?:see|varies|tbc|tbd|flexible|multiple)\b/i.test(value)) return "";
  return value;
}

function readHostFields(html, source, url) {
  const rules = HOST_RULES[source];
  if (!rules) return {};
  const fields = {};
  const title = firstElementText(html, rules.title);
  if (title) fields.title = title;
  const company = firstElementText(html, rules.company);
  if (company) fields.company = company;
  const location = firstElementText(html, rules.location);
  if (location) fields.location = location;
  const workplace = firstElementText(html, rules.workplace);
  if (workplace) fields.workplace = workplace;
  const department = firstElementText(html, rules.department);
  if (department) fields.department = department;
  const description = firstElementBlock(html, rules.description, 40);
  if (description) fields.description = description;
  if (url && typeof rules.externalId === "function") {
    const externalId = rules.externalId(url);
    if (externalId) fields.externalId = cleanText(externalId).slice(0, MAX_EXTERNAL_ID);
  }
  return fields;
}

/* ------------------------------------------------------------------ *
 * Description ladder
 * ------------------------------------------------------------------ */

function longestBlock(html, tag) {
  let best = "";
  for (const element of findElements(html, { tag })) {
    const text = cleanBlock(element.text);
    if (text.length > best.length) best = text;
  }
  return best;
}

function fallbackDescription(html) {
  for (const tag of ["main", "article"]) {
    const text = longestBlock(html, tag);
    if (text.length >= 120) return text;
  }
  const [body] = findElements(html, { tag: "body" });
  if (!body) return "";
  const stripped = removeMatchingElements(body.inner, (tag) => CHROME_TAGS.has(tag));
  const text = cleanBlock(htmlToText(stripped));
  return text.length >= 120 ? text : "";
}

function capDescription(value, warnings) {
  const text = cleanBlock(value);
  if (text.length <= MAX_DESCRIPTION) return text;
  const cut = text.slice(0, MAX_DESCRIPTION);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  const kept = boundary > MAX_DESCRIPTION * 0.8 ? cut.slice(0, boundary) : cut;
  warnings.push(`The description was longer than ${MAX_DESCRIPTION} characters and was truncated.`);
  return kept.trim();
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

/**
 * Additive and visible on purpose: the user can see why a capture is weak.
 * Maximum 1.00, reached only by a complete JSON-LD JobPosting.
 */
const CONFIDENCE = Object.freeze({
  jsonLd: 0.2,
  hostRule: 0.1,
  generic: 0.02,
  title: 0.3,
  company: 0.2,
  location: 0.1,
  descriptionFull: 0.12,
  descriptionShort: 0.05,
  postedAt: 0.04,
  salary: 0.04,
});

function scoreConfidence({ layer, title, company, location, description, postedAt, salary }) {
  let score = layer === "jsonld" ? CONFIDENCE.jsonLd : layer === "host" ? CONFIDENCE.hostRule : CONFIDENCE.generic;
  if (title) score += CONFIDENCE.title;
  if (company) score += CONFIDENCE.company;
  if (location) score += CONFIDENCE.location;
  if (description.length >= 200) score += CONFIDENCE.descriptionFull;
  else if (description.length > 0) score += CONFIDENCE.descriptionShort;
  if (postedAt) score += CONFIDENCE.postedAt;
  if (salary) score += CONFIDENCE.salary;
  return round2(clamp(score, 0, 1));
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Can capture attempt this URL, and which extractor would run?
 *
 * Returns the source name (`"greenhouse"`, `"lever"`, `"workable"`, `"ashby"`,
 * `"workday"`) for a recognised board, `"generic"` for any other http(s) page
 * — the generic path is real, because schema.org data is read on every host —
 * and `false` when the value is not an http(s) URL at all.
 *
 * The string is truthy, so `if (!isSupportedHost(url)) reject();` reads
 * correctly, and the name is available for the UI without a second call.
 *
 * @param {string|URL} url
 * @returns {string|false}
 */
export function isSupportedHost(url) {
  const parsed = readUrl(url);
  if (!parsed) return false;
  return sourceForHost(normaliseHost(parsed.hostname)) ?? "generic";
}

/**
 * Turn a captured page into a Job.
 *
 * @param {{url?: string|URL, html?: string, text?: string}} [input]
 * @returns {{
 *   source: string,
 *   url: string|null,
 *   external_id: string|null,
 *   title: string|null,
 *   company: string|null,
 *   location: string|null,
 *   remote: boolean|null,
 *   salary_min: number|null,
 *   salary_max: number|null,
 *   currency: string|null,
 *   description: string|null,
 *   posted_at: string|null,
 *   tags: string[],
 *   dedupe_hash: string,
 *   confidence: number,
 *   warnings: string[]
 * }}
 */
export function parseCapturedPosting(input = {}) {
  const { url: rawUrl, html: rawHtml, text: rawText } = input ?? {};
  const warnings = [];
  const html = typeof rawHtml === "string" ? rawHtml : "";
  const providedText = typeof rawText === "string" ? rawText : "";

  const parsedUrl = readUrl(rawUrl);
  if (cleanText(rawUrl) && !parsedUrl) {
    warnings.push("The URL is not an http or https address, so no posting URL was recorded.");
  }
  const host = parsedUrl ? normaliseHost(parsedUrl.hostname) : "";
  const hostSource = host ? sourceForHost(host) : null;

  let layer = "generic";
  let source = hostSource ?? "generic";

  /* 1. JSON-LD ------------------------------------------------------ */
  let jsonLd = null;
  let sawJsonLd = false;
  if (html) {
    const blocks = readJsonLdBlocks(html, warnings);
    sawJsonLd = blocks.length > 0;
    const posting = blocks.map((block) => findJobPosting(block)).find(Boolean) ?? null;
    if (posting) {
      jsonLd = readJobPostingPosting(posting, warnings);
      layer = "jsonld";
      source = hostSource ?? "jsonld";
    } else if (sawJsonLd) {
      warnings.push("JSON-LD was found but it does not describe a schema.org JobPosting; page structure was used instead.");
    }
  }

  /* 2. Board structure ---------------------------------------------- */
  const hostFields = html && hostSource ? readHostFields(html, hostSource, parsedUrl) : {};
  if (layer !== "jsonld" && hostSource && hasContent(hostFields)) layer = "host";

  /* 3. Meta tags and headings --------------------------------------- */
  const meta = html ? readMeta(html) : new Map();
  const heading = html ? firstElementText(html, [{ tag: "h1" }]) : "";
  const titleTag = html ? firstElementText(html, [{ tag: "title" }]) : "";
  const ogTitle = meta.get("og:title") ?? "";
  const twitterTitle = meta.get("twitter:title") ?? "";

  /* Title ----------------------------------------------------------- */
  let title = "";
  let titleFromTag = false;
  const split = splitTitleString(ogTitle, cleanText(jsonLd?.title || hostFields.title || heading));
  if (jsonLd?.title) title = cleanText(jsonLd.title);
  if (!title && hostFields.title) title = cleanText(hostFields.title);
  if (!title && split.title) title = split.title;
  if (!title) {
    for (const candidate of [ogTitle, twitterTitle, heading]) {
      const text = cleanText(candidate);
      if (isPlausibleTitle(text)) {
        title = text;
        break;
      }
    }
  }
  if (!title) {
    const fromTag = titleFromTitleTag(titleTag);
    if (fromTag) {
      title = fromTag;
      titleFromTag = true;
    }
  }
  if (!isPlausibleTitle(title)) title = "";
  if (titleFromTag) {
    warnings.push("The job title was read from the page's <title> tag; check it before saving.");
  }

  /* Company --------------------------------------------------------- */
  let company = cleanText(jsonLd?.company ?? "");
  if (!company) company = cleanText(hostFields.company ?? "");
  if (!company) company = cleanText(split.company ?? "");
  // og:site_name is the site owner, which is only a fair signal on a page that
  // is not one of the known boards (their site_name can be the platform).
  if (!company && !hostSource) company = cleanText(meta.get("og:site_name") ?? "");
  if (!company && html) {
    company = firstElementText(html, [
      { attrs: { itemprop: "hiringOrganization" } },
      { class: "company-name" },
      { class: "company" },
    ]);
  }
  if (company.length > MAX_COMPANY) company = truncate(company, MAX_COMPANY);
  if (!isPlausibleCompany(company)) company = "";
  if (company && title && normalizeTerm(company) === normalizeTerm(title)) company = "";

  /* Location and remote --------------------------------------------- */
  let location = cleanText(jsonLd?.location ?? "");
  if (!location) location = cleanText(hostFields.location ?? "");
  if (!location && html) {
    location = firstElementText(html, [{ attrs: { itemprop: "jobLocation" } }, { class: "job-location" }, { class: "location" }]);
  }
  if (location.length > MAX_LOCATION) location = truncate(location, MAX_LOCATION);

  const pageText = html ? visiblePageText(html) : "";
  if (!location) location = labelledLocation(pageText || providedText);
  if (location.length > MAX_LOCATION) location = truncate(location, MAX_LOCATION);
  if (/\bremote\b/i.test(location) && !/\bhybrid\b/i.test(location)) {
    // keep the stated location text as given
  }

  /* Description ------------------------------------------------------ */
  let description = "";
  if (jsonLd?.description) description = jsonLd.description;
  if (!description && html) description = firstElementBlock(html, HOST_RULES[hostSource]?.description, 40);
  if (!description && providedText.length >= 120) description = cleanBlock(providedText);
  if (!description && html) {
    const metaDescription = cleanBlock(meta.get("og:description") ?? meta.get("description") ?? "");
    if (metaDescription.length >= 80) description = metaDescription;
  }
  if (!description && html) description = fallbackDescription(html);
  description = capDescription(description, warnings);

  const remote = readRemote({
    location,
    workplace: hostFields.workplace,
    description,
  });

  /* Salary ---------------------------------------------------------- */
  let salary = jsonLd?.salary ?? null;
  if (!salary) {
    salary = scanSalaryFromText(description.length >= 40 ? `${description}\n${pageText}` : pageText || providedText, warnings);
  }

  /* Posted date ------------------------------------------------------ */
  let postedAt = cleanText(jsonLd?.posted_at ?? "");
  if (!postedAt && html) {
    const [element] = findElements(html, { attrs: { itemprop: "datePosted" } });
    if (element) postedAt = normaliseDate(element.attrs.datetime ?? element.text);
  }

  /* Tags ------------------------------------------------------------- */
  const tags = uniq([
    ...(jsonLd?.tags ?? []),
    hostFields.department ?? "",
    hostFields.workplace ?? "",
  ]).slice(0, MAX_TAGS);

  /* External id and the record itself -------------------------------- */
  const externalId = cleanText(hostFields.externalId || jsonLd?.external_id || "").slice(0, MAX_EXTERNAL_ID);
  const canonical = canonicalUrl(parsedUrl);

  if (!title) {
    warnings.push("No job title was found on the page; add it before saving.");
  }
  if (!company) {
    warnings.push("No company name was found on the page; add it before saving.");
  }
  if (!location) {
    warnings.push("No location was stated on the page.");
  }
  if (!description) {
    warnings.push("No description text was found on the page; paste the posting text instead.");
  }
  if (!salary) {
    warnings.push("No salary was stated with both a currency and a number, so none was recorded.");
  }
  if (!postedAt) {
    warnings.push("No posted date was found on the page.");
  }
  if (html && !jsonLd && !sawJsonLd) {
    warnings.push("No JSON-LD JobPosting was found; the page's structure and metadata were used instead.");
  }
  if (html && !jsonLd && !hostSource) {
    warnings.push("This host is not a recognised job board; only generic page metadata and headings were read.");
  }
  if (hostSource && HOST_RULES[hostSource]?.javascriptRendered && !jsonLd) {
    warnings.push(
      `${CAPTURE_SOURCES.find((entry) => entry.source === hostSource)?.label ?? hostSource} renders postings with JavaScript; without JSON-LD only the static markup was read.`
    );
  }
  if (!html && !providedText) {
    warnings.push("No page HTML or text was supplied, so nothing could be captured.");
  } else if (!html) {
    warnings.push("No page HTML was supplied; only the pasted text was read.");
  }

  if (!html && !providedText) {
    // Nothing to go on: no layer evidence at all.
    layer = "generic";
  }

  const confidence = html || providedText
    ? scoreConfidence({ layer, title, company, location, description, postedAt, salary })
    : 0;

  const finalWarnings = [];
  const seenWarnings = new Set();
  for (const warning of warnings) {
    const key = warning.toLowerCase();
    if (seenWarnings.has(key)) continue;
    seenWarnings.add(key);
    finalWarnings.push(warning);
    if (finalWarnings.length >= MAX_WARNINGS) break;
  }

  return {
    source,
    url: canonical,
    external_id: externalId || null,
    title: title || null,
    company: company || null,
    location: location || null,
    remote,
    salary_min: salary?.salary_min ?? null,
    salary_max: salary?.salary_max ?? null,
    currency: salary?.currency ?? null,
    description: description || null,
    posted_at: postedAt || null,
    tags,
    dedupe_hash: buildDedupeHash({ source, externalId, title, company, location, url: canonical }),
    confidence,
    warnings: finalWarnings,
  };
}

/* ------------------------------------------------------------------ *
 * Internal helpers that depend on the public shape
 * ------------------------------------------------------------------ */

function hasContent(fields) {
  return Boolean(
    fields.title || fields.company || fields.location || fields.description || fields.externalId
  );
}

function visiblePageText(html) {
  const [body] = findElements(html, { tag: "body" });
  const source = body ? body.inner : html;
  return htmlToText(source);
}

function readJobPostingPosting(posting, warnings) {
  const remoteType = readTypes(posting.jobLocationType).join(" ");
  const places = readPlaces(posting.jobLocation);
  const tags = [];
  pushList(tags, posting.employmentType);
  pushList(tags, posting.occupationalCategory);
  pushList(tags, posting.industry);

  return {
    title: cleanText(posting.title ?? posting.name ?? ""),
    company: readOrganisation(posting.hiringOrganization),
    location: places.join("; "),
    remote: /telecommute/i.test(remoteType) ? true : null,
    description: posting.description ? htmlToText(String(posting.description)) : "",
    posted_at: normaliseDate(posting.datePosted),
    salary: salaryFromJsonLd(posting, warnings),
    external_id: readIdentifier(posting.identifier),
    tags,
  };
}

/**
 * Stable dedupe key. Board ids are board-scoped, so the source is part of that
 * key; otherwise the shared feed convention (company|title|location) is used,
 * with the canonical URL as the last resort.
 */
function buildDedupeHash({ source, externalId, title, company, location, url }) {
  if (externalId) return sha256(`${source}|${normalizeTerm(externalId)}`);
  if (title || company || location) {
    return sha256(`${normalizeTerm(company)}|${normalizeTerm(title)}|${normalizeTerm(location)}`);
  }
  if (url) return sha256(url);
  return sha256("");
}
