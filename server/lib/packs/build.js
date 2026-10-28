/**
 * Applywright — pack builder.
 *
 *   buildPack({ profile, cvText, job, tailored })
 *     -> { cvHtml, cvTextPlain, coverLetterMd, answers, filenameBase }
 *
 * One pure function. No DB, no network, no clock, no randomness: the same input
 * produces byte-identical output on every run, which is what lets a stored pack
 * be re-rendered and diffed later.
 *
 * What the pack is for: a CV that prints on A4, survives a copy-paste into Word,
 * and reads as plain text when an ATS strips the markup. That drives the shape of
 * `cvHtml` — one column of real headings and lists, inline CSS only, nothing
 * fetched from anywhere.
 *
 * Input tolerance. `profile` is whatever the caller has: the segmented shape from
 * `cv/extract.js` (`{ contact, sections }`), a flat object (`{ name, email, ... }`),
 * or JSON text of either. `tailored` is optional — a pack built without it is
 * still a complete pack, just a plainer one.
 *
 * Everything user-supplied is escaped before it reaches the HTML. Plain-text
 * fields (`cvTextPlain`, `answers`) are text by contract and are NOT HTML-escaped:
 * a caller that puts them in a page must set them as text content, never as HTML.
 */
import { normalizeTerm, sentences, slugify } from "../text.js";

/* ------------------------------------------------------------------------- *
 * Vocabulary
 * ------------------------------------------------------------------------- */

/** Headings we understand in a pasted CV, mapped to the section they belong to. */
const HEADING_KINDS = new Map([
  ["summary", "summary"],
  ["profile", "summary"],
  ["about", "summary"],
  ["about me", "summary"],
  ["personal statement", "summary"],
  ["personal profile", "summary"],
  ["professional summary", "summary"],
  ["career summary", "summary"],
  ["objective", "summary"],
  ["overview", "summary"],
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
  ["skills", "skills"],
  ["technical skills", "skills"],
  ["core skills", "skills"],
  ["key skills", "skills"],
  ["core competencies", "skills"],
  ["competencies", "skills"],
  ["tools", "skills"],
  ["technologies", "skills"],
  ["tech stack", "skills"],
  ["certifications", "certifications"],
  ["certificates", "certifications"],
  ["licences", "certifications"],
  ["licenses", "certifications"],
  ["projects", "projects"],
  ["selected projects", "projects"],
  ["languages", "languages"],
  ["publications", "other"],
  ["awards", "other"],
  ["interests", "other"],
  ["volunteering", "other"],
  ["references", "other"],
  ["additional information", "other"],
  ["other", "other"],
]);

/** Sections that read as a list of roles rather than a block of prose. */
const ROLE_SECTIONS = new Set(["experience", "education", "projects"]);

/** Ordering used when a structured profile supplies its own section keys. */
const SECTION_ORDER = [
  "summary",
  "experience",
  "education",
  "skills",
  "certifications",
  "projects",
  "languages",
  "other",
];

/** Acronyms we keep upper-cased when a profile key is turned into a heading. */
const ACRONYMS = new Set([
  "cv", "it", "qa", "hr", "ai", "sql", "aws", "api", "ux", "ui", "phd", "bsc",
  "msc", "ceo", "cto", "ios", "ci", "cd", "seo", "crm", "erp", "llm", "nlp",
]);

const FALLBACK_NAME = "Curriculum Vitae";
const MAX_FILENAME_LENGTH = 100;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;

/** Lines that label the document rather than name the person. */
const CV_LABEL = /^(?:curriculum vitae|curriculum vit(?:ae|æ)|resume|r[eé]sum[eé]|cv|my cv)$/i;

/* ------------------------------------------------------------------------- *
 * Small text helpers. Tokenising, keywords and hashing live in ../text.js;
 * these only clean and compare the strings this module prints.
 * ------------------------------------------------------------------------- */

/** Collapse whitespace, drop control characters, keep the line structure. */
function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Remove URL schemes so a pack never carries an external reference. The address
 * stays readable ("github.com/ada"), which is also how an ATS prefers it.
 */
function withoutScheme(value) {
  return String(value ?? "").replace(/\b(?:https?:\/\/|mailto:)/gi, "");
}

function cleanForPack(value) {
  return withoutScheme(cleanText(value));
}

function oneLine(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escaping for text this module injects into Markdown: backslash escapes cover
 * the Markdown syntax. Angle brackets are handled separately, in one pass over
 * the finished letter, so nothing is escaped twice.
 */
function escapeMdInline(value) {
  return String(value ?? "").replace(/[\\`*_[\]|]/g, (character) => `\\${character}`);
}

/**
 * Neutralise HTML in Markdown text so an unguarded Markdown-to-HTML renderer
 * cannot be handed a tag. Applied once, to the whole letter.
 */
function neutraliseHtml(value) {
  return String(value ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Key used to match a tailored rewrite back to the source line. */
function matchKey(value) {
  const stripped = String(value ?? "")
    .replace(/^[\s\-*•▪◦‣·]+/, "")
    .replace(/^\d+[.)]\s*/, "");
  return normalizeTerm(stripped);
}

function isBulletLine(line) {
  return /^(?:[-*•▪◦‣·]|\d+[.)])\s+/.test(line);
}

function stripBulletMarker(line) {
  return line.replace(/^(?:[-*•▪◦‣·]|\d+[.)])\s+/, "").trim();
}

function numberTokens(text) {
  return String(text ?? "").match(NUMBER_TOKEN) ?? [];
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/* ------------------------------------------------------------------------- *
 * Reading the CV
 * ------------------------------------------------------------------------- */

/**
 * Split a heading off a line that carries content, e.g. "SKILLS: SQL, Node.js".
 * Returns null when the line is ordinary content.
 */
function splitInlineHeading(line) {
  if (isBulletLine(line)) return null;
  const match = line.match(/^([A-Za-z][A-Za-z &/]{1,30}):\s*(\S.*)$/);
  if (!match) return null;
  const heading = match[1].trim();
  const kind = sectionKindFor(heading);
  if (!kind) return null;
  return { heading, kind, rest: match[2].trim() };
}

/** Words that make an unrecognised capitalised line a section heading rather than a name. */
const SECTION_WORDS = new Set([
  "summary", "profile", "about", "objective", "experience", "employment", "work",
  "career", "history", "education", "qualifications", "training", "courses",
  "skills", "technical", "technologies", "tools", "stack", "competencies",
  "projects", "certifications", "certificates", "licences", "licenses",
  "awards", "achievements", "highlights", "publications", "languages",
  "interests", "hobbies", "volunteering", "references", "contact", "details",
  "personal", "additional", "other", "memberships", "software", "expertise",
  "strengths", "accomplishments", "education",
]);

/**
 * Which section does this heading line belong to? null when it is not a heading.
 * `allowUnknown` is false for the first line of a CV, so a name written in
 * capitals ("ADA LOVELACE") is kept as the name rather than turned into a section.
 */
function sectionKindFor(line, { allowUnknown = true } = {}) {
  const heading = line.replace(/[:\s]+$/, "").trim();
  if (!heading || heading.length > 60) return null;
  if (/[.!?]$/.test(heading)) return null;
  if (isBulletLine(heading)) return null;

  const known = HEADING_KINDS.get(heading.toLowerCase());
  if (known) return known;

  if (!allowUnknown) return null;
  const words = heading.split(/\s+/);
  const looksShouted = heading === heading.toUpperCase() && /[A-Z]/.test(heading);
  const sectionish = words.some((word) => SECTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, "")));
  if (looksShouted && sectionish && words.length <= 6 && !/\d/.test(heading)) return "other";
  return null;
}

function classifyLine(line) {
  return isBulletLine(line)
    ? { kind: "bullet", text: cleanForPack(stripBulletMarker(line)) }
    : { kind: "text", text: cleanForPack(line) };
}

/** Every non-empty line of a block, classified, in order. */
function toParts(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(classifyLine)
    .filter((part) => part.text);
}

/**
 * Read a pasted CV into header lines plus sections. Unknown heading lines are
 * kept as their own sections rather than dropped, and a CV with no headings at
 * all simply yields no sections — we do not invent structure that is not there.
 */
function readCvText(cvText) {
  const lines = String(cvText ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  const header = [];
  const sections = [];
  const bodyLines = [];
  let current = null;
  let seenContent = false;

  for (const line of lines) {
    if (!line) continue;
    const inline = splitInlineHeading(line);
    if (inline) {
      current = { heading: cleanForPack(inline.heading), kind: inline.kind, parts: [] };
      sections.push(current);
      current.parts.push(classifyLine(inline.rest));
      bodyLines.push(cleanForPack(line));
      seenContent = true;
      continue;
    }
    const kind = sectionKindFor(line, { allowUnknown: seenContent });
    if (kind) {
      current = { heading: cleanForPack(line.replace(/[:\s]+$/, "")), kind, parts: [] };
      sections.push(current);
      bodyLines.push(cleanForPack(line));
      seenContent = true;
      continue;
    }
    seenContent = true;
    if (!current) {
      header.push(cleanForPack(line));
      continue;
    }
    current.parts.push(classifyLine(line));
    bodyLines.push(cleanForPack(line));
  }

  return { header, sections, bodyLines };
}

/** Turn one profile section value (string, string[] or role[]) into part lines. */
function sectionValueToLines(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const title = textOf(item.title ?? item.role ?? item.name);
        const company = textOf(item.company ?? item.employer ?? item.institution);
        const location = textOf(item.location);
        const start = textOf(item.start ?? item.from);
        const rawEnd = item.end ?? item.to;
        const end = rawEnd == null || rawEnd === "" ? (item.current ? "present" : "") : textOf(rawEnd);
        const dates = [start, end].filter(Boolean).join(" – ");
        const head = [title, company].filter(Boolean).join(" — ");
        const meta = [location, dates].filter(Boolean).join(" · ");
        const bullets = Array.isArray(item.bullets)
          ? item.bullets.map((bullet) => `- ${textOf(bullet)}`).filter((line) => line.length > 2)
          : [];
        return [head, meta, ...bullets].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n");
  }
  return textOf(value);
}

function headingFromKey(key) {
  const words = String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "Additional";
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(" ");
}

/**
 * Sections supplied as structured data. Returned in a fixed order so a pack is
 * deterministic even if the caller built the object in a different sequence.
 */
function profileSections(profile) {
  const raw = profile.sections;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const rows = Object.entries(raw)
    .map(([key, value], index) => ({ key: String(key).trim(), value, index }))
    .filter((row) => row.key && sectionValueToLines(row.value).trim());

  if (!rows.length) return null;

  const rank = (key) => {
    const position = SECTION_ORDER.indexOf(key.toLowerCase());
    return position === -1 ? SECTION_ORDER.length : position;
  };
  rows.sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index);

  return rows.map((row) => {
    const lower = row.key.toLowerCase();
    const kind = SECTION_ORDER.includes(lower) ? lower : "other";
    return {
      heading: HEADING_KINDS.has(lower) ? headingFromKey(lower) : headingFromKey(row.key),
      kind,
      parts: toParts(sectionValueToLines(row.value)),
    };
  });
}

/* ------------------------------------------------------------------------- *
 * Contact block
 * ------------------------------------------------------------------------- */

function isPhoneish(value) {
  const digits = (String(value).match(/\d/g) ?? []).length;
  const matchesShape = /\d[\d\s()+-]{6,}\d/.test(String(value));
  return matchesShape && digits >= 9 && digits <= 15;
}

function looksLikeEmail(value) {
  return /[\w.+-]+@[\w-]+\.[\w.-]+/.test(String(value));
}

function looksLikeLink(value) {
  return /(?:www\.|\.(?:com|co|io|dev|org|net|me|ai)\b|linkedin\.|github\.|gitlab\.|behance\.|dribbble\.|orcid\.)/i.test(
    String(value)
  );
}

/** Contact details from a structured profile, falling back to the CV header. */
function readContact(profile, headerLines) {
  const contactObject = asObject(profile.contact);
  const pick = (...values) => {
    for (const value of values) {
      const text = oneLine(textOf(value));
      if (text) return text;
    }
    return "";
  };

  const headerText = headerLines.join("\n");
  const headerEmail = (headerText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) ?? [])[0] ?? "";
  const headerPhone =
    (headerText
      .split(/\n/)
      .flatMap((line) => line.match(/\+?\d[\d\s()+-]{5,}\d/g) ?? [])
      .find((candidate) => isPhoneish(candidate)) ?? "").trim();

  const name = pick(profile.name, contactObject.name, fullNameFromHeader(headerLines));

  const providedLinks = []
    .concat(profile.links ?? [])
    .concat(contactObject.links ?? [])
    .map((link) => {
      if (typeof link === "string") return link;
      if (link && typeof link === "object") return textOf(link.url ?? link.href ?? link.label);
      return "";
    })
    .map(oneLine)
    .filter(Boolean);

  const headerLinks = headerLines.filter((line) => looksLikeLink(line) && !looksLikeEmail(line));

  const email = pick(contactObject.email, profile.email, headerEmail);
  const phone = pick(contactObject.phone, profile.phone, headerPhone);
  const location = pick(contactObject.location, profile.location);

  const links = [];
  for (const link of [...providedLinks, ...headerLinks]) {
    const cleaned = withoutScheme(link).replace(/[.,;]+$/, "");
    if (cleaned && !links.some((existing) => existing.toLowerCase() === cleaned.toLowerCase())) {
      links.push(cleaned);
    }
  }

  const parts = [];
  for (const part of [email, phone, location, ...links]) {
    const value = withoutScheme(oneLine(part));
    if (!value) continue;
    if (parts.some((existing) => existing.toLowerCase() === value.toLowerCase())) continue;
    parts.push(value);
  }

  return { name, parts, links };
}

function fullNameFromHeader(headerLines) {
  for (const line of headerLines) {
    if (!line) continue;
    if (CV_LABEL.test(line)) continue;
    if (looksLikeEmail(line) || looksLikeLink(line) || isPhoneish(line)) continue;
    if (line.length > 60) continue;
    if (/[:|·•]/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    if (!/^[A-Z]/.test(line)) continue;
    return line;
  }
  return "";
}

/**
 * Header lines that the contact block does not already say — a headline such as
 * "Senior programmer · London". Keeping them visible also keeps their facts
 * (dates, numbers) in the pack.
 */
function leftoverHeaderLines(headerLines, name, contactParts) {
  const known = [name, ...contactParts]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value) => value.length >= 3);

  return headerLines.filter((line) => {
    const lower = line.toLowerCase();
    if (!lower || CV_LABEL.test(line)) return false;
    return !known.some((value) => lower.includes(value) || value.includes(lower));
  });
}

/* ------------------------------------------------------------------------- *
 * Sections, roles and rewrites
 * ------------------------------------------------------------------------- */

function isMetaLine(line) {
  return /\b(?:19|20)\d{2}\b/.test(line) || /^(?:remote|hybrid|on-?site|full-time|part-time|contract)\b/i.test(line);
}

function isProseLine(line) {
  return line.length > 60 || /[:;]$/.test(line);
}

/**
 * Group an experience/education block into roles: title, then meta (company,
 * location, dates), then bullets. Deliberately conservative — a long line is
 * treated as prose, never as a job title, so a wrapped paragraph cannot become
 * a heading.
 */
function groupRoles(parts) {
  const roles = [];
  let role = null;

  for (const part of parts) {
    if (part.kind === "bullet") {
      if (!role) {
        role = { title: "", meta: [], parts: [] };
        roles.push(role);
      }
      role.parts.push(part);
      continue;
    }
    if (!role) {
      role = { title: part.text, meta: [], parts: [] };
      roles.push(role);
      continue;
    }
    const hasBody = role.meta.length > 0 || role.parts.length > 0;
    if (!hasBody && (isMetaLine(part.text) || !isProseLine(part.text))) {
      role.meta.push(part.text);
      continue;
    }
    if (isProseLine(part.text) || isMetaLine(part.text)) {
      role.parts.push(part);
      continue;
    }
    role = { title: part.text, meta: [], parts: [] };
    roles.push(role);
  }

  return roles;
}

/** Original line -> tailored line, matched on normalised text. */
function rewriteMap(tailored) {
  const map = new Map();
  const bullets = Array.isArray(tailored?.bullets) ? tailored.bullets : [];
  for (const row of bullets) {
    if (!row || typeof row !== "object") continue;
    const original = textOf(row.original);
    const rewritten = cleanForPack(row.rewritten);
    const key = matchKey(original);
    if (!key || !rewritten) continue;
    if (!map.has(key)) map.set(key, rewritten);
  }
  return map;
}

function applyRewrite(part, rewrites) {
  if (part.kind !== "bullet" && part.kind !== "text") return part;
  const rewritten = rewrites.get(matchKey(part.text));
  return rewritten ? { kind: part.kind, text: rewritten } : part;
}

function summaryParagraphs(tailored, profile) {
  const source = textOf(tailored?.summary) || textOf(profile.summary) || textOf(asObject(profile.sections).summary);
  return cleanText(source)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Assemble the CV document model: name, contact, optional headline, ordered
 * sections with roles, and every fact the tailoring rewrote.
 */
function buildDocument({ profile, cvText, tailored }) {
  const parsed = readCvText(cvText);
  const structured = profileSections(profile);
  const sections = (structured ?? parsed.sections).map((section) => {
    const heading = cleanForPack(section.heading) || "Additional";
    const kind = section.kind ?? "other";
    return { heading, kind, parts: section.parts.map((part) => ({ ...part })) };
  });

  const contact = readContact(profile, parsed.header);
  const name = oneLine(contact.name) || FALLBACK_NAME;
  const notes = leftoverHeaderLines(parsed.header, contact.name, contact.parts)
    .map(oneLine)
    .filter(Boolean);

  const rewrites = rewriteMap(tailored);

  const summary = summaryParagraphs(tailored, profile);
  if (summary.length) {
    const existing = sections.findIndex((section) => section.kind === "summary");
    const replacement = {
      heading: existing >= 0 ? sections[existing].heading : "Summary",
      kind: "summary",
      parts: summary.map((paragraph) => ({ kind: "text", text: paragraph })),
    };
    if (existing >= 0) sections[existing] = replacement;
    else sections.unshift(replacement);
  }

  for (const section of sections) {
    section.roles = ROLE_SECTIONS.has(section.kind) ? groupRoles(section.parts) : null;
    if (section.roles) {
      for (const role of section.roles) {
        role.parts = role.parts.map((part) => applyRewrite(part, rewrites));
      }
    } else {
      section.parts = section.parts.map((part) => applyRewrite(part, rewrites));
    }
  }

  const firstRole = sections.flatMap((section) => section.roles ?? []).find((role) => role.title) ?? null;

  // The letter may quote the summary, so it must know about a summary that came
  // from the CV itself, not only one supplied by the tailoring step.
  const ownSummary = sections
    .filter((section) => section.kind === "summary")
    .flatMap((section) => (section.roles ? [] : section.parts))
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join(" ");

  return {
    name,
    contact: contact.parts,
    notes,
    sections,
    firstRole,
    summaryPlain: summary.join(" ") || ownSummary,
    sourceLines: parsed.bodyLines,
  };
}

/* ------------------------------------------------------------------------- *
 * Plain text
 * ------------------------------------------------------------------------- */

function renderPlain(doc) {
  const out = [doc.name];
  for (const note of doc.notes) out.push(note);
  if (doc.contact.length) out.push(doc.contact.join(" · "));

  const pushParts = (parts) => {
    for (const part of parts) {
      out.push(part.kind === "bullet" ? `- ${part.text}` : part.text);
    }
  };

  for (const section of doc.sections) {
    out.push("", section.heading.toUpperCase());
    if (section.roles) {
      section.roles.forEach((role, index) => {
        if (index) out.push("");
        if (role.title) out.push(role.title);
        if (role.meta.length) out.push(role.meta.join(" · "));
        pushParts(role.parts);
      });
    } else {
      pushParts(section.parts);
    }
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/**
 * Safety net for the packing rule "never lose a fact": if composing the pack
 * removed a number that the source CV contained (a summary replaced by a shorter
 * tailored one, say), put the source lines carrying it back under an appendix.
 * The guard is expected to stay silent for a faithfully tailored CV.
 */
function appendMissingNumbers(doc, plain) {
  const present = new Set(numberTokens(plain));
  const missingLines = [];
  const seen = new Set();

  for (const line of doc.sourceLines) {
    const tokens = numberTokens(line);
    if (!tokens.length) continue;
    if (tokens.every((token) => present.has(token))) continue;
    const key = matchKey(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    missingLines.push({ kind: isBulletLine(line) ? "bullet" : "text", text: cleanForPack(stripBulletMarker(line)) });
  }

  if (!missingLines.length) return plain;

  doc.sections.push({ heading: "Additional detail", kind: "other", parts: missingLines, roles: null });
  return renderPlain(doc);
}

/* ------------------------------------------------------------------------- *
 * HTML
 * ------------------------------------------------------------------------- */

const PRINT_CSS = `
@page {
  size: A4;
  margin: 18mm;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: #ffffff;
  color: #14161a;
  font-family: "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.42;
}

main {
  max-width: 210mm;
  margin: 0 auto;
  padding: 18mm;
}

h1 {
  margin: 0 0 1.5mm;
  font-size: 18pt;
  line-height: 1.15;
  font-weight: 600;
}

h2 {
  margin: 5.5mm 0 1.5mm;
  padding-bottom: 1mm;
  border-bottom: 0.5pt solid #b9bcc2;
  font-size: 11pt;
  font-weight: 600;
  letter-spacing: 0.04em;
}

h3 {
  margin: 3.5mm 0 0.5mm;
  font-size: 11pt;
  font-weight: 600;
}

p {
  margin: 0 0 1.8mm;
}

ul {
  margin: 0 0 1.8mm;
  padding-left: 5mm;
}

li {
  margin: 0 0 0.8mm;
}

.contact {
  margin: 0 0 1mm;
  color: #333842;
  overflow-wrap: break-word;
}

.headline {
  margin: 0 0 1mm;
  color: #333842;
}

.role-meta {
  margin: 0 0 1.2mm;
  color: #333842;
}

.cv-section {
  margin: 0;
}

.role {
  margin: 0;
}

h1,
h2,
h3,
.role-meta {
  break-after: avoid;
  page-break-after: avoid;
}

h1,
h2,
h3 {
  break-inside: avoid;
  page-break-inside: avoid;
}

p,
li {
  orphans: 3;
  widows: 3;
}

/* Keep a bullet on one page. This is the rule that stops a single line of a
   bullet list being orphaned at the top of page two. */
li {
  break-inside: avoid;
  page-break-inside: avoid;
}

ul {
  break-inside: auto;
  page-break-inside: auto;
}

@media print {
  main {
    max-width: none;
    margin: 0;
    padding: 0;
  }
}
`.trim();

function renderPartsHtml(parts) {
  const out = [];
  let listOpen = false;

  for (const part of parts) {
    if (part.kind === "bullet") {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${escapeHtml(part.text)}</li>`);
      continue;
    }
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
    out.push(`<p>${escapeHtml(part.text)}</p>`);
  }

  if (listOpen) out.push("</ul>");
  return out;
}

function renderSectionHtml(section) {
  const out = ['<section class="cv-section">', `<h2>${escapeHtml(section.heading)}</h2>`];

  if (section.roles) {
    for (const role of section.roles) {
      out.push('<article class="role">');
      if (role.title) out.push(`<h3>${escapeHtml(role.title)}</h3>`);
      if (role.meta.length) out.push(`<p class="role-meta">${escapeHtml(role.meta.join(" · "))}</p>`);
      out.push(...renderPartsHtml(role.parts));
      out.push("</article>");
    }
  } else {
    out.push(...renderPartsHtml(section.parts));
  }

  out.push("</section>");
  return out.join("\n");
}

function renderHtml(doc) {
  const body = ["<header>", `<h1>${escapeHtml(doc.name)}</h1>`];
  for (const note of doc.notes) body.push(`<p class="headline">${escapeHtml(note)}</p>`);
  if (doc.contact.length) body.push(`<p class="contact">${escapeHtml(doc.contact.join(" · "))}</p>`);
  body.push("</header>");

  for (const section of doc.sections) body.push(renderSectionHtml(section));

  const documentTitle = doc.name === FALLBACK_NAME ? doc.name : `${doc.name} — CV`;

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="Applywright">',
    `<title>${escapeHtml(documentTitle)}</title>`,
    "<style>",
    PRINT_CSS,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    ...body,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------------- *
 * Covering letter
 * ------------------------------------------------------------------------- */

function markdownParagraphs(value) {
  return cleanText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function groundedLetterParagraphs(doc, job) {
  const title = oneLine(job?.title);
  const company = oneLine(job?.company);

  let opening;
  if (title && company) opening = `I am applying for the ${title} role at ${company}.`;
  else if (title) opening = `I am applying for the ${title} role.`;
  else if (company) opening = `I am applying for the advertised role at ${company}.`;
  else opening = "I am applying for the advertised role.";

  const paragraphs = [opening];

  const summarySentences = doc.summaryPlain ? sentences(doc.summaryPlain).slice(0, 2) : [];
  if (summarySentences.length) {
    paragraphs.push(summarySentences.join(" "));
  } else if (doc.firstRole?.title) {
    paragraphs.push(`My most recent role: ${doc.firstRole.title}.`);
  }

  paragraphs.push("My CV is attached, and I would be glad to discuss the role.");
  return paragraphs;
}

function buildCoverLetter({ doc, job, tailored }) {
  const title = oneLine(job?.title);
  const company = oneLine(job?.company);
  const subject = [title, company ? `at ${company}` : ""].filter(Boolean).join(" ");
  const provided = markdownParagraphs(tailored?.coverLetter);
  const alreadyHeaded = provided.length > 0 && /^#{1,3}\s/.test(provided[0]);

  const out = [];
  if (!alreadyHeaded) out.push(`# Covering letter${subject ? `: ${escapeMdInline(subject)}` : ""}`, "");

  const hasGreeting = provided.some((paragraph) => /^\s*dear\b/i.test(paragraph));
  const bodyParagraphs = provided.length ? provided : groundedLetterParagraphs(doc, job);

  if (!hasGreeting) out.push("Dear Hiring Manager,", "");
  for (const paragraph of bodyParagraphs) out.push(paragraph, "");

  const nameLine = doc.name && doc.name !== FALLBACK_NAME ? doc.name : "";
  const contactLine = doc.contact.join(" · ");
  const lastParagraph = bodyParagraphs[bodyParagraphs.length - 1] ?? "";
  const alreadySigned = nameLine ? lastParagraph.toLowerCase().includes(nameLine.toLowerCase()) : false;
  const hasClosing = provided.some((paragraph) =>
    /^(?:yours (?:sincerely|faithfully)|kind regards|best regards|best wishes|regards|many thanks)\b/i.test(paragraph)
  );

  if (!alreadySigned && !hasClosing && (nameLine || contactLine)) {
    out.push("Yours sincerely,", "");
    if (nameLine) out.push(escapeMdInline(nameLine));
    if (contactLine) out.push(escapeMdInline(contactLine));
    out.push("");
  }

  return `${neutraliseHtml(out.join("\n").trimEnd())}\n`;
}

/* ------------------------------------------------------------------------- *
 * Screening answers
 * ------------------------------------------------------------------------- */

const SCREENING_QUESTIONS = [
  {
    key: "motivation",
    question: "Why do you want this role?",
    fallback: "Not provided. Add a short reason for applying before you send this application.",
  },
  {
    key: "noticePeriod",
    question: "When could you start?",
    fallback: "Not provided. State your notice period before you send this application.",
  },
  {
    key: "rightToWork",
    question: "Do you have the right to work in the country this role is based in?",
    fallback: "Not provided. State your right-to-work status before you send this application.",
  },
  {
    key: "salaryExpectation",
    question: "What are your salary expectations?",
    fallback: "Not provided. State a salary range before you send this application.",
  },
];

function buildAnswers(tailored) {
  const screening = asObject(tailored?.screening);
  return SCREENING_QUESTIONS.map((entry) => {
    const answer = oneLine(screening[entry.key]);
    return { question: entry.question, answer: answer || entry.fallback };
  });
}

/* ------------------------------------------------------------------------- *
 * Filename
 * ------------------------------------------------------------------------- */

function safeFilenameBase(value) {
  let base = String(value ?? "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  const first = base.split("-")[0] ?? "";
  if (WINDOWS_RESERVED.test(base) || WINDOWS_RESERVED.test(first)) base = `cv-${base}`;

  base = base.slice(0, MAX_FILENAME_LENGTH).replace(/-+$/, "");
  return base || "cv-pack";
}

function buildFilenameBase({ name, job }) {
  const parts = [
    slugify(name, ""),
    slugify(oneLine(job?.company), ""),
    slugify(oneLine(job?.title), ""),
  ].filter(Boolean);
  return safeFilenameBase(parts.join("-"));
}

/* ------------------------------------------------------------------------- *
 * Entry point
 * ------------------------------------------------------------------------- */

/**
 * Build every artefact for one application.
 *
 * @param {object} input
 * @param {object|string} [input.profile] structured profile or segmented CV
 * @param {string} input.cvText pasted CV text
 * @param {object} [input.job] `{ title, company, location, url, description }`
 * @param {object} [input.tailored] output of `cv/tailor.js`, when a model ran
 * @returns {{ cvHtml: string, cvTextPlain: string, coverLetterMd: string,
 *             answers: { question: string, answer: string }[], filenameBase: string }}
 */
export function buildPack({ profile, cvText, job, tailored } = {}) {
  const safeProfile = asObject(profile);
  const safeJob = asObject(job);
  const safeTailored = tailored && typeof tailored === "object" ? tailored : null;

  const doc = buildDocument({ profile: safeProfile, cvText, tailored: safeTailored });
  const cvTextPlain = appendMissingNumbers(doc, renderPlain(doc));
  const cvHtml = renderHtml(doc);

  return {
    cvHtml,
    cvTextPlain,
    coverLetterMd: buildCoverLetter({ doc, job: safeJob, tailored: safeTailored }),
    answers: buildAnswers(safeTailored),
    filenameBase: buildFilenameBase({ name: doc.name, job: safeJob }),
  };
}

export default buildPack;
