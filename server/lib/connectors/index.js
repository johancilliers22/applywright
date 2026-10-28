/**
 * Applywright — import connectors.
 *
 * One registry of the ways a user can get their own material into the product,
 * and the functions that turn that material into a profile or a CV.
 *
 * The honesty rule this module enforces (SPEC §1):
 *   - every import is user-initiated and user-supplied;
 *   - nothing here fetches a URL, scrapes a page, or pretends to be an OAuth
 *     integration with LinkedIn;
 *   - the only network-shaped connector, `job-link`, hands a URL to
 *     `jobs/capture.js` and says so in its notes.
 *
 * The parsers are pure and synchronous. File bytes are the caller's job:
 * `cv/extract.js` turns an upload into text, and `ingest()` reads that text. That
 * keeps this module testable without fixtures on disk and stops two modules from
 * both claiming to read DOCX.
 */
import { isSupportedHost } from "../jobs/capture.js";
import { segmentSections } from "../cv/extract.js";
import { normalizeTerm, slugify } from "../text.js";
import {
  educationKey,
  emptyProfile,
  experienceKey,
  isLinkedInProfileText,
  parseEducationLines,
  parseExperienceLines,
  parseLinkedInProfile,
  parseSkillLines,
} from "./linkedin.js";

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

/**
 * The import methods this product actually offers, in the order the UI should
 * show them. `requiresUserAction` is always true: there is no background import
 * path, by design.
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   name: string,
 *   kind: "profile"|"cv"|"job",
 *   description: string,
 *   accepts: string[],
 *   requiresUserAction: true,
 *   notes: string
 * }>}
 */
export const CONNECTORS = Object.freeze([
  {
    id: "linkedin-paste",
    name: "LinkedIn profile (paste)",
    kind: "profile",
    description: "Paste the profile text you copied from your own signed-in LinkedIn profile.",
    accepts: ["text/plain"],
    requiresUserAction: true,
    notes:
      "Copy the profile page in your browser, then paste it here. Applywright never fetches the URL, never scrapes and is not an OAuth integration: LinkedIn's public API does not expose profile data to apps like this, so the copy is yours to bring.",
  },
  {
    id: "linkedin-export",
    name: "LinkedIn PDF export (paste its text)",
    kind: "profile",
    description: "Paste the text of the PDF you exported from LinkedIn yourself (Me → Resources → Save to PDF).",
    accepts: ["text/plain", "application/pdf"],
    requiresUserAction: true,
    notes:
      "The file is read locally by cv/extract.js; only its text reaches this parser. Nothing is sent to LinkedIn or to any third party, and the export is a file you chose to make — there is no account connection.",
  },
  {
    id: "cv-file",
    name: "Existing CV (.txt, .md, .docx, .pdf)",
    kind: "cv",
    description: "Import a CV you already have; it is split into contact, summary, experience, education and skills.",
    accepts: [
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
    ],
    requiresUserAction: true,
    notes:
      "Upload the file so cv/extract.js can extract its text, then pass { text } here. PDF reading needs a local pdftotext; without it the extractor says so rather than guessing.",
  },
  {
    id: "profile-manual",
    name: "Type it in",
    kind: "profile",
    description: "Fill in the profile fields yourself when you have no file worth importing.",
    accepts: ["application/json", "text/plain"],
    requiresUserAction: true,
    notes:
      "Pass { profile } with any subset of fields; nothing is inferred and no field is invented. This is the fallback that makes every other connector optional.",
  },
  {
    id: "job-paste",
    name: "Job description (paste)",
    kind: "job",
    description: "Paste a job advert; it feeds scoring and tailoring, not the profile.",
    accepts: ["text/plain"],
    requiresUserAction: true,
    notes:
      "ingest() validates the text and hands it back as jobText; cv/score.js and cv/tailor.js read it directly. This connector never produces a profile.",
  },
  {
    id: "job-link",
    name: "Job posting URL",
    kind: "job",
    description: "Paste the address of a posting you are looking at; jobs/capture.js reads the page when you ask it to.",
    accepts: ["text/uri-list", "text/plain"],
    requiresUserAction: true,
    notes:
      "Handled by jobs/capture.js: ingest() only records and validates the URL. Capture is user-initiated — there is no background crawling and no automated submission.",
  },
]);

const CONNECTOR_BY_ID = new Map(CONNECTORS.map((connector) => [connector.id, connector]));

/** The connector, or undefined. Export is additive; `ingest` throws for unknown ids. */
export function connectorById(id) {
  return CONNECTOR_BY_ID.get(String(id ?? ""));
}

/* ------------------------------------------------------------------ *
 * Small coercions
 * ------------------------------------------------------------------ */

function asText(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asLines(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/^(?:[\u2022\u25aa\u25e6\u2023\u00b7*\-]|\d{1,2}[.)])\s+/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function asStrings(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  if (typeof value === "string") return asLines(value);
  return [];
}

/** A date label from either `dates` or the start/end/current triple. */
function dateLabel(source) {
  const direct = asText(source.dates ?? source.datesLabel ?? source.period);
  if (direct) return direct;
  const start = asText(source.start ?? source.from);
  const rawEnd = source.end ?? source.to;
  const end = rawEnd == null || rawEnd === "" ? (source.current ? "Present" : null) : asText(rawEnd);
  return [start, end].filter(Boolean).join(" \u2013 ") || null;
}

function normaliseExperienceEntry(entry) {
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  return {
    title: asText(source.title ?? source.role ?? source.position),
    company: asText(source.company ?? source.employer ?? source.organisation ?? source.organization),
    dates: dateLabel(source),
    location: asText(source.location),
    bullets: asLines(source.bullets ?? source.description ?? source.highlights),
  };
}

function normaliseEducationEntry(entry) {
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const details = asLines(source.details ?? source.notes ?? source.activities);
  return {
    school: asText(source.school ?? source.institution ?? source.university ?? source.name),
    degree: asText(source.degree ?? source.qualification ?? source.programme ?? source.program),
    dates: dateLabel(source),
    details: details.length ? details.join(" ") : asText(source.details),
  };
}

function normaliseCertificationEntry(entry) {
  if (typeof entry === "string") return { name: asText(entry), issuer: null, date: null };
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  return {
    name: asText(source.name ?? source.title),
    issuer: asText(source.issuer ?? source.authority ?? source.organisation),
    date: asText(source.date ?? source.issued ?? source.year),
  };
}

/**
 * Coerce anything profile-shaped into the full shape.
 * Used for manual entry and on both sides of a merge, so `mergeProfiles` never
 * has to reason about a half-built object.
 */
export function normaliseProfile(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const contactSource =
    source.contact && typeof source.contact === "object" && !Array.isArray(source.contact) ? source.contact : {};

  const profile = emptyProfile();
  const links = contactSource.links;
  const firstLink = Array.isArray(links) ? links[0] : links;
  profile.name = asText(source.name ?? source.fullName ?? source.full_name);
  profile.headline = asText(source.headline ?? source.title);
  profile.location = asText(source.location ?? contactSource.location);
  profile.about = asText(source.about ?? source.summary);
  profile.contact = {
    email: asText(contactSource.email ?? source.email),
    phone: asText(contactSource.phone ?? source.phone),
    url: asText(contactSource.url ?? contactSource.website ?? firstLink ?? source.url ?? source.website),
  };
  profile.experience = (Array.isArray(source.experience) ? source.experience : []).map(normaliseExperienceEntry);
  profile.education = (Array.isArray(source.education) ? source.education : []).map(normaliseEducationEntry);
  profile.skills = asStrings(source.skills);
  profile.certifications = (Array.isArray(source.certifications) ? source.certifications : []).map(
    normaliseCertificationEntry
  );
  profile.languages = asStrings(source.languages);
  profile.detectedSections = asStrings(source.detectedSections);
  const confidence = Number(source.confidence);
  profile.confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  profile.warnings = asStrings(source.warnings);
  return profile;
}

/* ------------------------------------------------------------------ *
 * CV text -> profile
 * ------------------------------------------------------------------ */

const CV_SECTION_LABELS = Object.freeze({
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  other: "Other",
});

/**
 * Read an already-extracted CV into the profile shape.
 * The segmentation is `cv/extract.js`'s, so a CV imported here sees exactly the
 * section boundaries the scorer will see.
 */
function profileFromCvText(text) {
  const profile = emptyProfile();
  const raw = typeof text === "string" ? text : String(text ?? "");
  const segmented = segmentSections(raw);
  const contact = segmented.contact ?? {};
  const sections = segmented.sections ?? {};

  profile.name = asText(contact.name);
  profile.contact = {
    email: asText(contact.email),
    phone: asText(contact.phone),
    url: Array.isArray(contact.links) ? asText(contact.links[0]) : null,
  };
  profile.about = asText(sections.summary);
  profile.experience = parseExperienceLines(asLines(sections.experience));
  profile.education = parseEducationLines(asLines(sections.education));
  profile.skills = parseSkillLines(asLines(sections.skills));

  profile.detectedSections = Object.entries(CV_SECTION_LABELS)
    .filter(([key]) => (sections[key] ?? "").trim().length > 0)
    .map(([, label]) => label);

  let confidence = 0;
  if (profile.name) confidence += 0.2;
  if (profile.contact.email) confidence += 0.15;
  if (profile.experience.length) confidence += 0.3;
  if (profile.education.length) confidence += 0.2;
  if (profile.skills.length) confidence += 0.15;
  profile.confidence = Math.min(1, Math.round(confidence * 100) / 100);

  if (!profile.contact.email) profile.warnings.push("No email address was found in the CV text.");
  if (!profile.experience.length) profile.warnings.push("No experience section was found in the CV text.");
  if (!profile.education.length) profile.warnings.push("No education section was found in the CV text.");

  return profile;
}

/* ------------------------------------------------------------------ *
 * ingest
 * ------------------------------------------------------------------ */

function profileResult(connector, profile) {
  return { profile, connector, warnings: [...profile.warnings] };
}

function payloadText(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  return asText(payload.text ?? payload.content ?? payload.profileText ?? payload.body) ?? "";
}

/**
 * Route one import through the connector that owns it.
 *
 * @param {string} connectorId
 * @param {unknown} payload
 * @returns {{ profile: object|null, connector: object, warnings: string[] } | { error: string, connector: object }}
 * @throws {Error} when the connector id is unknown
 */
export function ingest(connectorId, payload) {
  const connector = CONNECTOR_BY_ID.get(String(connectorId ?? ""));
  if (!connector) {
    const known = CONNECTORS.map((entry) => entry.id).join(", ");
    throw new Error(`Unknown connector "${connectorId}". Known connectors: ${known}.`);
  }

  switch (connector.id) {
    case "linkedin-paste":
    case "linkedin-export": {
      const text = payloadText(payload);
      if (!text.trim()) {
        return {
          error:
            connector.id === "linkedin-export"
              ? "No export text was supplied. Paste the text from the PDF you exported, or upload the PDF so cv/extract.js can read it."
              : "No profile text was supplied. Copy your LinkedIn profile and paste it into the box.",
          connector,
        };
      }
      const profile = parseLinkedInProfile(text);
      // The PDF route is claimed as the same parser, so say so rather than
      // pretending two different readers exist.
      if (connector.id === "linkedin-export" && !isLinkedInProfileText(text)) {
        profile.warnings.push("The pasted text does not carry LinkedIn's section headings; check the import before saving it.");
      }
      return profileResult(connector, profile);
    }

    case "cv-file": {
      const data = payload && typeof payload === "object" ? payload : {};
      const text = payloadText(payload);
      if (!text.trim()) {
        return {
          error:
            data.buffer || data.filename
              ? "CV file bytes must be extracted by cv/extract.js (extractText) before import; ingest() reads text, not files."
              : "No CV text was supplied. Upload the file so cv/extract.js can extract its text, or paste it.",
          connector,
        };
      }
      return profileResult(connector, profileFromCvText(text));
    }

    case "profile-manual": {
      const data = payload && typeof payload === "object" ? payload : {};
      if (data.profile && typeof data.profile === "object" && !Array.isArray(data.profile)) {
        const profile = normaliseProfile(data.profile);
        if (!profile.name && !profile.experience.length && !profile.education.length && !profile.skills.length) {
          return { error: "The typed profile was empty. Add at least a name, a role or a skill.", connector };
        }
        return profileResult(connector, profile);
      }
      const text = payloadText(payload);
      if (text.trim()) {
        const profile = profileFromCvText(text);
        profile.warnings.unshift(
          "Typed free text was read like a CV. Use { profile } with named fields for an exact import."
        );
        return profileResult(connector, profile);
      }
      return {
        error: "profile-manual expects { profile } with named fields, or { text } to read as free text.",
        connector,
      };
    }

    case "job-paste": {
      const text = payloadText(payload);
      if (!text.trim()) return { error: "No job description was supplied.", connector };
      return { profile: null, connector, jobText: text, warnings: [] };
    }

    case "job-link": {
      const data = payload && typeof payload === "object" ? payload : {};
      const url = typeof payload === "string" ? payload.trim() : asText(data.url ?? data.text) ?? "";
      if (!url) return { error: "No posting URL was supplied.", connector };
      const source = isSupportedHost(url);
      if (!source) {
        return { error: "That is not an http or https address, so there is no posting to capture.", connector };
      }
      return { profile: null, connector, jobUrl: url, captureSource: source, warnings: [] };
    }

    default:
      // The registry and the switch disagree; that is a code defect, not input.
      throw new Error(`Connector "${connector.id}" is registered but has no handler.`);
  }
}

/* ------------------------------------------------------------------ *
 * Merging
 * ------------------------------------------------------------------ */

function mergeContact(base, incoming) {
  return {
    email: incoming.email || base.email,
    phone: incoming.phone || base.phone,
    url: incoming.url || base.url,
  };
}

/** Incoming values win field by field; an empty incoming field never erases a known one. */
function mergeEntry(base, incoming) {
  const merged = { ...base };
  for (const [field, value] of Object.entries(incoming)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length) merged[field] = [...value];
      continue;
    }
    if (typeof value === "string" && !value.trim()) continue;
    merged[field] = value;
  }
  return merged;
}

/**
 * Merge two entry lists, de-duplicating on a key function.
 * Base order is kept so the more familiar profile stays in charge of ordering;
 * a duplicate is replaced by the merged entry, with the incoming values winning.
 */
function mergeEntries(base, incoming, keyOf) {
  const result = base.map((entry) => ({ ...entry }));
  for (const entry of incoming) {
    const key = keyOf(entry);
    const index = key ? result.findIndex((candidate) => keyOf(candidate) === key) : -1;
    if (index === -1) result.push({ ...entry });
    else result[index] = mergeEntry(result[index], entry);
  }
  return result;
}

/** Union of two string lists, case-insensitive, base order first. */
function unionStrings(base, incoming, keyOf = (value) => normalizeTerm(value)) {
  const out = [];
  const seen = new Set();
  for (const value of [...base, ...incoming]) {
    const key = keyOf(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function certificationKey(entry) {
  return normalizeTerm(entry?.name ?? "");
}

/**
 * Merge a second profile into a first.
 *
 * Incoming non-empty fields win. Experience is de-duplicated by title+company and
 * education by school+degree; skills are unioned case-insensitively; warnings
 * and detected sections are concatenated. Neither argument is mutated.
 *
 * @param {object|null} base
 * @param {object|null} incoming
 * @returns {ReturnType<typeof emptyProfile>}
 */
export function mergeProfiles(base, incoming) {
  const left = normaliseProfile(base ?? {});
  const right = normaliseProfile(incoming ?? {});

  const merged = emptyProfile();
  merged.name = right.name || left.name;
  merged.headline = right.headline || left.headline;
  merged.location = right.location || left.location;
  merged.about = right.about || left.about;
  merged.contact = mergeContact(left.contact, right.contact);
  merged.experience = mergeEntries(left.experience, right.experience, experienceKey);
  merged.education = mergeEntries(left.education, right.education, educationKey);
  merged.skills = unionStrings(left.skills, right.skills);
  merged.certifications = mergeEntries(left.certifications, right.certifications, certificationKey);
  merged.languages = unionStrings(left.languages, right.languages);
  merged.detectedSections = unionStrings(left.detectedSections, right.detectedSections, (value) => normalizeTerm(value));
  merged.confidence = Math.max(left.confidence, right.confidence);
  merged.warnings = [...left.warnings, ...right.warnings];

  return merged;
}

/* ------------------------------------------------------------------ *
 * Profile -> plain-text CV
 * ------------------------------------------------------------------ */

/**
 * Build plain-text CV from a parsed profile.
 *
 * The shape is chosen for the rest of the pipeline, not for looks alone:
 *   - the name is the first line, so `cv/extract.js` finds it;
 *   - contact details sit under a "PERSONAL DETAILS" heading, because a bare
 *     "London, England, United Kingdom" line is otherwise mistaken for a skills
 *     list by the segmenter;
 *   - sections use headings the segmenter and the scorer both recognise;
 *   - every bullet starts with "- ", which both `bulletize` and the scorer read.
 *
 * @param {object|null} profile
 * @returns {string} plain text, ending in one newline, or "" when there is nothing to write
 */
export function profileToCvText(profile) {
  const source = normaliseProfile(profile ?? {});
  const out = [];

  if (source.name) out.push(source.name);

  const contactLines = [
    source.contact.email,
    source.contact.phone,
    source.contact.url,
    source.location,
  ].filter(Boolean);
  if (contactLines.length) {
    out.push("", "PERSONAL DETAILS", ...contactLines);
  }

  const summary = source.about || source.headline;
  if (summary) out.push("", "SUMMARY", summary);

  if (source.experience.length) {
    out.push("", "EXPERIENCE");
    source.experience.forEach((entry, index) => {
      if (index) out.push("");
      if (entry.title) out.push(entry.title);
      const meta = [entry.company, entry.dates, entry.location].filter(Boolean).join(" \u00b7 ");
      if (meta) out.push(meta);
      for (const bullet of entry.bullets ?? []) if (bullet) out.push(`- ${bullet}`);
    });
  }

  if (source.education.length) {
    out.push("", "EDUCATION");
    source.education.forEach((entry, index) => {
      if (index) out.push("");
      if (entry.school) out.push(entry.school);
      const meta = [entry.degree, entry.dates].filter(Boolean).join(" \u00b7 ");
      if (meta) out.push(meta);
      if (entry.details) out.push(entry.details);
    });
  }

  if (source.skills.length) out.push("", "SKILLS", source.skills.join(", "));

  if (source.certifications.length) {
    out.push("", "CERTIFICATIONS");
    for (const entry of source.certifications) {
      const line = [entry.name, entry.issuer].filter(Boolean).join(" \u2014 ");
      if (!line) continue;
      out.push(entry.date ? `${line} (${entry.date})` : line);
    }
  }

  if (source.languages.length) out.push("", "LANGUAGES", ...source.languages);

  const text = out
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text ? `${text}\n` : "";
}

/** Additive convenience for the UI: a filename stem from the profile's name. */
export function profileFilenameStem(profile) {
  const source = normaliseProfile(profile ?? {});
  return slugify(source.name, "profile");
}
