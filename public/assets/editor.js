/* ==========================================================================
   Applywright — CV editor: the document model, the exports, and the page.

   Why this file is both a library and a page script: the document is plain
   text, and the exact same reconstruction has to run in three places — the
   browser before a save, the server when it previews an accepted proposal, and
   the test suite. Keeping one implementation is the only way those three cannot
   drift. Everything above the "browser" banner is pure: no DOM, no fetch, no
   clock. `bootEditor()` runs only when a document exists, so `node --test` can
   import this module directly (see tests/editor.test.js).

   The document is stored as text because the analyser (`lib/cv/score.js`) and
   the printable pack (`lib/packs/build.js`) both read text. The editor is a
   structured view over that text: contact fields, then five known sections,
   then the whole document reconstructed on save.
   ========================================================================== */

/** The five section keys `segmentSections` produces, in document order. */
export const SECTIONS = Object.freeze(["summary", "experience", "education", "skills", "other"]);

/** Heading written into the reconstructed text for each section. */
export const SECTION_HEADINGS = Object.freeze({
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  other: "Other",
});

export const SECTION_LABELS = Object.freeze({
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  other: "Other",
});

/** A line that carries a bullet marker (the analyser's `bulletize` set). */
const BULLET_LINE = /^(?:[-*•▪◦‣·]|\d+[.)])\s+/;
const BULLET_PREFIX = /^\s*(?:[-*•▪◦‣·]|\d+[.)])\s+/;
const PHONE_LABELLED = /^(?:phone|tel|telephone|mobile|mob|cell)\s*[:\u2013\u2014-]\s*/i;

function text(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function collapsed(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

function tidy(value) {
  return text(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * What the form holds mid-edit. Blank runs are *not* collapsed here: a textarea
 * that eats the second newline the user just typed is a broken editor. The save
 * path runs `reconstructCvText`, which tidies.
 */
function draft(value) {
  return text(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

function escapeRe(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------------- *
 * The document model
 * ------------------------------------------------------------------------- */

/**
 * The contact block, normalised to the shape `segmentSections` returns.
 * @param {object|null} contact
 * @returns {{ name: string, email: string, phone: string, links: string[] }}
 */
export function normaliseContact(contact) {
  const source = contact && typeof contact === "object" ? contact : {};
  const rawLinks = Array.isArray(source.links) ? source.links : source.link ? [source.link] : [];
  const links = [];
  for (const raw of rawLinks) {
    const value = text(raw).trim();
    if (value && !links.includes(value)) links.push(value);
  }
  return {
    name: text(source.name).trim(),
    email: text(source.email).trim(),
    phone: text(source.phone).trim(),
    links,
  };
}

/**
 * All five sections as trimmed strings. Unknown keys are dropped, so a stored
 * profile with extra fields cannot leak into the document.
 * @param {object|null} sections
 * @returns {{ summary: string, experience: string, education: string, skills: string, other: string }}
 */
export function normaliseSections(sections) {
  const source = sections && typeof sections === "object" ? sections : {};
  const out = {};
  for (const key of SECTIONS) out[key] = tidy(source[key]);
  return out;
}

/**
 * The phone as it appears in the contact block.
 *
 * This is the one place the editor adds a word to the user's CV, and it earns
 * it: `isContactOnlyLine` in `cv/extract.js` only treats a line as contact when
 * it carries an email, a URL or a phone *label*, so a bare number line would
 * fall out of the contact block and reappear inside `Other` on the next read.
 * `findPhone` also refuses an unlabelled national number. A `Phone:` label
 * fixes both, and matches how people write a CV anyway.
 * @param {string} phone
 */
function phoneForContactBlock(phone) {
  const value = text(phone).trim();
  if (!value) return "";
  if (PHONE_LABELLED.test(value)) return value;
  return `Phone: ${value}`;
}

/**
 * Rebuild the CV as the plain text the API stores.
 *
 * The shape is deliberate: contact lines first (so `guessName` and the phone
 * and email matchers find them), then a blank line and one recognised heading
 * per non-empty section. `segmentSections(reconstructCvText(x))` therefore
 * returns the same sections it was given — the round-trip test asserts that,
 * and it is what stops a save from shuffling the user's CV.
 *
 * @param {{ contact?: object, sections?: object }} document
 * @returns {string}
 */
export function reconstructCvText(document) {
  const source = document && typeof document === "object" ? document : {};
  const contact = normaliseContact(source.contact);
  const sections = normaliseSections(source.sections);
  const lines = [];

  if (contact.name) lines.push(contact.name);
  if (contact.email) lines.push(contact.email);
  const phone = phoneForContactBlock(contact.phone);
  if (phone) lines.push(phone);
  for (const link of contact.links) lines.push(link);

  for (const key of SECTIONS) {
    const body = sections[key];
    if (!body) continue;
    if (lines.length) lines.push("");
    lines.push(SECTION_HEADINGS[key]);
    for (const line of body.split("\n")) lines.push(line);
  }

  return tidy(lines.join("\n"));
}

/** The key two lines are compared on when looking for a contact duplicate. */
function contactKey(line) {
  return collapsed(line)
    .toLowerCase()
    .replace(PHONE_LABELLED, "")
    .replace(/[\s()\-.]/g, "");
}

/**
 * The editable document from a stored `profile`.
 *
 * `segmentSections` puts a bare contact line into a section as well as into
 * `contact` when the line is not contact-only (a phone number is the usual
 * case). Emitting the contact block from `contact` and then repeating that line
 * inside `Other` is exactly the kind of silent duplication a CV editor must not
 * commit, so the duplicate is removed here — once, for the editor, the export
 * and the assistant's preview alike.
 *
 * @param {object|null} profile
 * @returns {{ contact: object, sections: object }}
 */
export function documentFromProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const contact = normaliseContact(source.contact);
  const sections = normaliseSections(source.sections);
  const contactKeys = new Set(
    [contact.name, contact.email, contact.phone, ...contact.links].map(contactKey).filter(Boolean)
  );
  if (!contactKeys.size) return { contact, sections };

  for (const key of SECTIONS) {
    const kept = [];
    for (const line of sections[key].split("\n")) {
      if (!line.trim()) {
        kept.push(line);
        continue;
      }
      if (contactKeys.has(contactKey(line))) continue;
      kept.push(line);
    }
    sections[key] = tidy(kept.join("\n"));
  }
  return { contact, sections };
}

/**
 * Plain Markdown of the document: one H1, contact line, one H2 per section,
 * bullets as list items. No layout, no tables — the same single column the
 * printable pack produces.
 *
 * @param {{ contact?: object, sections?: object, title?: string }} document
 * @returns {string}
 */
export function markdownFor(document) {
  const source = document && typeof document === "object" ? document : {};
  const contact = normaliseContact(source.contact);
  const sections = normaliseSections(source.sections);
  const title = text(source.title).trim() || contact.name || "Curriculum vitae";
  const out = [`# ${title}`, ""];

  const meta = [contact.email, contact.phone, ...contact.links].filter(Boolean).join(" · ");
  if (meta) out.push(meta, "");

  for (const key of SECTIONS) {
    const body = sections[key];
    if (!body) continue;
    out.push(`## ${SECTION_HEADINGS[key]}`, "");
    let bullets = [];
    const flushBullets = () => {
      if (!bullets.length) return;
      for (const bullet of bullets) out.push(`- ${bullet}`);
      out.push("");
      bullets = [];
    };
    for (const line of body.split("\n")) {
      const value = line.trim();
      if (!value) {
        flushBullets();
        continue;
      }
      if (BULLET_LINE.test(value)) {
        bullets.push(value.replace(BULLET_LINE, "").trim());
        continue;
      }
      flushBullets();
      out.push(value, "");
    }
    flushBullets();
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/**
 * Apply one accepted proposal to a section's text.
 *
 * Matching is deliberately forgiving in one direction only: the proposal's
 * `before` may have been whitespace-collapsed by the refinement module, so a
 * single-line `before` is matched against the *body* of each line (the bullet
 * marker and indentation are preserved), and a multi-line `before` falls back to
 * a whitespace-tolerant search. Anything else returns null and the caller says
 * so — a proposal must never be applied to the wrong text.
 *
 * @param {string} sectionText
 * @param {string} before
 * @param {string} after
 * @returns {string|null} the new section text, or null when `before` is not there
 */
export function applyChange(sectionText, before, after) {
  const source = text(sectionText);
  const needle = text(before);
  const replacement = text(after);
  if (!needle.trim()) return null;

  const direct = source.indexOf(needle);
  if (needle.includes("\n") && direct !== -1) {
    return source.slice(0, direct) + replacement + source.slice(direct + needle.length);
  }

  const key = collapsed(needle);
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.match(BULLET_PREFIX)?.[0] ?? line.match(/^\s*/)?.[0] ?? "";
    const body = line.slice(marker.length);
    if (collapsed(body) !== key) continue;
    lines[index] = marker + replacement;
    return lines.join("\n");
  }

  if (direct !== -1) return source.slice(0, direct) + replacement + source.slice(direct + needle.length);

  const tolerant = new RegExp(escapeRe(needle).replace(/ /g, "\\s+"));
  if (tolerant.test(source)) return source.replace(tolerant, () => replacement);
  return null;
}

/** Words in a string, for the section list's counts and the merge preview. */
export function countWords(value) {
  const clean = collapsed(value);
  return clean ? clean.split(" ").length : 0;
}

/**
 * What to say before a save when the stored text did not parse into the sections
 * this page shows. Pure — no DOM, no state — so tests can pin the shapes.
 *
 * The editor rebuilds the whole document from these sections on the first save
 * after an edit, so a CV that came back as one blob under Summary would be
 * written back as one blob under a Summary heading. That is a silent restructure
 * of someone's CV, which is the worst outcome this product can produce; this
 * notice has to appear before the save, not in the diff afterwards.
 *
 * @param {{ sections?: object }} document
 * @returns {null | { code: string, title: string, body: string }}
 */
export function parseNotice({ sections } = {}) {
  const s = sections && typeof sections === "object" ? sections : {};
  const words = {
    summary: countWords(s.summary),
    experience: countWords(s.experience),
    education: countWords(s.education),
    skills: countWords(s.skills),
    other: countWords(s.other),
  };
  const structured = words.summary + words.experience + words.education + words.skills;
  const placed = words.experience + words.education + words.skills;
  const total = structured + words.other;

  if (total === 0) return null;

  if (structured === 0) {
    return {
      code: "nothing-placed",
      title: "No section headings were detected",
      body: `All ${words.other} words are under Other. The document below is the raw text the server stored. Saving after an edit writes it back with the headings this page shows, so check the split before you save.`,
    };
  }

  if (placed === 0 && words.summary >= 60) {
    return {
      code: "all-in-summary",
      title: "No Experience, Education or Skills heading was recognised",
      body: `${words.summary} words are sitting in Summary and the other sections are empty, so the split below is a guess from the raw text. Saving after an edit rewrites the stored CV in this split; fix the headings first if that is wrong.`,
    };
  }

  if (words.experience === 0 && words.other >= 40) {
    return {
      code: "experience-in-other",
      title: "No Experience section was recognised",
      body: `Experience is empty and Other holds ${words.other} words. The roles are still in the document, but if their heading was not recognised they stay where they are now and a save keeps them there.`,
    };
  }

  return null;
}

/**
 * Line diff for the "what changed on save" panel. Longest common subsequence
 * over lines, which is enough for a CV (a few hundred lines at most).
 * @param {string} before
 * @param {string} after
 * @returns {{ kind: "same"|"add"|"del", text: string }[]}
 */
export function diffLines(before, after) {
  const a = text(before).split("\n");
  const b = text(after).split("\n");
  // A pasted novel is not a CV; beyond this a line diff stops being a proof and
  // becomes a page of noise, so fall back to a whole-document replace.
  if (a.length > 800 || b.length > 800) {
    return [
      ...a.map((line) => ({ kind: "del", text: line })),
      ...b.map((line) => ({ kind: "add", text: line })),
    ];
  }

  const rows = new Int32Array((a.length + 1) * (b.length + 1));
  const width = b.length + 1;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      rows[i * width + j] =
        a[i] === b[j] ? rows[(i + 1) * width + j + 1] + 1 : Math.max(rows[(i + 1) * width + j], rows[i * width + j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (rows[(i + 1) * width + j] >= rows[i * width + j + 1]) {
      out.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: "del", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: "add", text: b[j] });
    j += 1;
  }
  return out;
}

/** Filesystem-safe stem for a download, from the CV's own name. */
export function exportFilename(name, extension) {
  const stem = text(name)
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = text(extension).replace(/^\./, "").replace(/[^a-z0-9]/gi, "") || "txt";
  return `${stem || "cv"}.${ext}`;
}

/**
 * Turn a parsed LinkedIn/connector profile (the shape
 * `POST /api/connectors/linkedin` returns) into editor sections. The ordering
 * mirrors `profileToCvText` in `lib/connectors/index.js`: title, then a
 * company · dates · location line, then the bullets. Anything without a home —
 * location, certifications, languages, a headline when there is also an about
 * paragraph — goes to `other` rather than being dropped.
 *
 * @param {object|null} profile
 * @returns {{ contact: object, sections: object }}
 */
export function sectionsFromProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const contact = {
    name: text(source.name).trim(),
    email: text(source.contact?.email).trim(),
    phone: text(source.contact?.phone).trim(),
    links: [],
  };
  const url = text(source.contact?.url).trim();
  if (url) contact.links.push(url);

  const sections = { summary: "", experience: "", education: "", skills: "", other: "" };
  const other = [];
  const location = text(source.location).trim();
  if (location) other.push(location);

  const about = text(source.about).trim();
  const headline = text(source.headline).trim();
  if (about) sections.summary = about;
  else if (headline) sections.summary = headline;
  if (about && headline) other.push(headline);

  const experience = Array.isArray(source.experience) ? source.experience : [];
  const experienceLines = [];
  for (const entry of experience) {
    if (!entry || typeof entry !== "object") continue;
    if (experienceLines.length) experienceLines.push("");
    const title = text(entry.title).trim();
    if (title) experienceLines.push(title);
    const meta = [text(entry.company).trim(), text(entry.dates).trim(), text(entry.location).trim()].filter(Boolean).join(" · ");
    if (meta) experienceLines.push(meta);
    for (const bullet of Array.isArray(entry.bullets) ? entry.bullets : []) {
      const value = text(bullet).trim();
      if (value) experienceLines.push(`- ${value}`);
    }
  }
  sections.experience = tidy(experienceLines.join("\n"));

  const education = Array.isArray(source.education) ? source.education : [];
  const educationLines = [];
  for (const entry of education) {
    if (!entry || typeof entry !== "object") continue;
    if (educationLines.length) educationLines.push("");
    const school = text(entry.school).trim();
    if (school) educationLines.push(school);
    const meta = [text(entry.degree).trim(), text(entry.dates).trim()].filter(Boolean).join(" · ");
    if (meta) educationLines.push(meta);
    const details = text(entry.details).trim();
    if (details) educationLines.push(details);
  }
  sections.education = tidy(educationLines.join("\n"));

  const skills = Array.isArray(source.skills) ? source.skills : [];
  sections.skills = tidy(
    skills
      .map((skill) => text(skill).trim())
      .filter(Boolean)
      .join(", ")
  );

  for (const entry of Array.isArray(source.certifications) ? source.certifications : []) {
    if (!entry || typeof entry !== "object") continue;
    const name = text(entry.name).trim();
    const issuer = text(entry.issuer).trim();
    const line = [name, issuer].filter(Boolean).join(" \u2014 ");
    if (!line) continue;
    other.push(text(entry.date).trim() ? `${line} (${text(entry.date).trim()})` : line);
  }

  const languages = (Array.isArray(source.languages) ? source.languages : [])
    .map((language) => text(language).trim())
    .filter(Boolean);
  if (languages.length) other.push(languages.join(", "));

  sections.other = tidy(other.join("\n"));
  return { contact, sections };
}

/* ------------------------------------------------------------------------- *
 * DOCX — three XML parts, a styles part for real headings, and a stored-only
 * zip writer. No dependency, no library, nothing fetched.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip with stored (uncompressed) entries. Stored is a legal zip and needs no
 * deflate implementation; Word, LibreOffice and the macOS Quick Look plugin all
 * open it. The timestamp is fixed so two exports of the same CV are byte
 * identical, which is what makes the format testable.
 */
function zipStored(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x0021; // 1980-01-01

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, data);

    const header = new Uint8Array(46 + name.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(6, 20, true);
    headerView.setUint16(8, 0, true);
    headerView.setUint16(10, 0, true);
    headerView.setUint16(12, dosTime, true);
    headerView.setUint16(14, dosDate, true);
    headerView.setUint32(16, crc, true);
    headerView.setUint32(20, data.length, true);
    headerView.setUint32(24, data.length, true);
    headerView.setUint16(28, name.length, true);
    headerView.setUint16(30, 0, true);
    headerView.setUint16(32, 0, true);
    headerView.setUint16(34, 0, true);
    headerView.setUint16(36, 0, true);
    headerView.setUint32(38, 0, true);
    headerView.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((total, header) => total + header.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const all = [...parts, ...central, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function xmlEscape(value) {
  return text(value)
    // Control characters are not legal in XML 1.0; drop them rather than
    // producing a document Word refuses to open.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const WORDPROCESSINGML = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const DOCX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCX_DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* Heading1 and Heading2 are real Word styles with outline levels, so an ATS
   that reads Word styles sees a name and section headings rather than bold
   paragraphs. 21 half-points = 10.5pt, the pack's body size. */
const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORDPROCESSINGML}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
</w:styles>`;

function docxParagraph(value, styleName) {
  const style = styleName ? `<w:pPr><w:pStyle w:val="${styleName}"/></w:pPr>` : "";
  return `<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`;
}

/**
 * A minimal, valid .docx: single column, A4, 18 mm margins, a Heading1 name,
 * Heading2 section headings and bullets as literal "- " lines so no numbering
 * part is needed (and every ATS reads them).
 *
 * @param {{ contact?: object, sections?: object, title?: string }} document
 * @returns {Uint8Array} the zip bytes
 */
export function buildDocx(document) {
  const source = document && typeof document === "object" ? document : {};
  const contact = normaliseContact(source.contact);
  const sections = normaliseSections(source.sections);
  const title = text(source.title).trim() || contact.name || "Curriculum vitae";
  const body = [];

  body.push(docxParagraph(title, "Heading1"));
  const meta = [contact.email, contact.phone, ...contact.links].filter(Boolean).join(" · ");
  if (meta) body.push(docxParagraph(meta));

  for (const key of SECTIONS) {
    const section = sections[key];
    if (!section) continue;
    body.push(docxParagraph(SECTION_HEADINGS[key], "Heading2"));
    for (const line of section.split("\n")) {
      const value = line.trim();
      if (!value) continue;
      if (BULLET_LINE.test(value)) body.push(docxParagraph(`- ${value.replace(BULLET_LINE, "").trim()}`));
      else body.push(docxParagraph(value));
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORDPROCESSINGML}"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1020" w:bottom="1020" w:left="1020" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const encoder = new TextEncoder();
  return zipStored([
    { name: "[Content_Types].xml", data: encoder.encode(DOCX_CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(DOCX_ROOT_RELS) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(DOCX_DOCUMENT_RELS) },
    { name: "word/styles.xml", data: encoder.encode(DOCX_STYLES) },
  ]);
}

/* ========================================================================== *
 * Browser layer
 * ========================================================================== */

const ASSIST_ADVISORY =
  "This is a proposal, not a save. Every changed string is checked against the CV first; a number, employer, job title, qualification or date that is not in the document rejects the change.";

const SCOPE_LABELS = Object.freeze({
  cv: "whole CV",
  summary: "summary",
  experience: "experience",
  education: "education",
  skills: "skills",
  other: "other",
});

/** The editor's state. Sections are the source of truth; the DOM mirrors it. */
function initialState() {
  return {
    cvId: "",
    cvName: "",
    contact: { name: "", email: "", phone: "", links: [] },
    sections: { summary: "", experience: "", education: "", skills: "", other: "" },
    // `savedText` is the reconstruction baseline (so Save with no edits is a
    // no-op); `storedText` is what the server actually holds, which is what the
    // save diff is measured against — the first save normalises headings and the
    // contact block, and that must be visible rather than silent.
    savedText: "",
    storedText: "",
    loaded: false,
    dirty: false,
    proposal: null,
    parsedProfile: null,
    mergePlan: null,
    busy: false,
    // DOM nodes created at boot: the proposal review block (moved out of the
    // rail) and the parse notice that sits above the paper.
    review: null,
    notice: null,
  };
}

function bootEditor() {
  const document_ = document;
  const state = initialState();

  const byId = (id) => document_.getElementById(id);

  function el(tag, props = {}, ...children) {
    const node = document_.createElement(tag);
    // `null` props mean "no attributes" — several call sites pass it to keep the
    // child list readable, and the default parameter would not catch it.
    const attributes = props && typeof props === "object" ? props : {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "text") node.textContent = String(value);
      else if (key === "class") node.className = String(value);
      // `onclick` (the DOM property) is lowercase, and an `onClick=` attribute
      // is an inline handler the CSP forbids. Handler props are listeners here.
      else if (/^on[A-Z]/.test(key) && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child);
    }
    return node;
  }

  function clear(node) {
    if (node) node.replaceChildren();
  }

  /* ------------------------------------------------------- page structure */

  // The proposals are rendered into a 340px rail that scrolls on its own, below
  // the instruction form: measured at 1440×900 the first hunk arrived at y=837,
  // clipped by the fold, and accepting an edit meant discovering that the rail
  // scrolls. They are the one thing on this page that must be read and acted on,
  // so the host is moved into the primary column, above the document, and the
  // block is revealed with a scroll when a proposal lands. The markup is
  // editor.html's; nothing here depends on it beyond the host id.
  {
    const docPane = document_.querySelector(".ed-pane--doc");
    const form = byId("ed-form");
    const proposalHost = byId("ed-proposals");
    const notice = el("aside", { class: "note", role: "note", hidden: true });
    notice.style.margin = "0 0 var(--sp-4)";

    if (docPane) {
      if (proposalHost) {
        state.review = el(
          "section",
          { class: "ed-review", hidden: true, tabindex: "-1" },
          el("h2", { class: "ed-diff__title", text: "Proposed changes" }),
          el("p", { class: "ed-diff__summary mono", text: "Nothing is saved until you accept a change." }),
          proposalHost
        );
        docPane.insertBefore(state.review, form);
      }
      docPane.insertBefore(notice, state.review ?? form);
    }
    state.notice = notice;
  }

  function renderParseNotice(notice) {
    const host = state.notice;
    if (!host) return;
    clear(host);
    if (!notice) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.append(el("strong", { text: `${notice.title}. ` }), el("span", { text: notice.body }));
  }

  function revealReview() {
    const review = state.review;
    if (!review) return;
    review.hidden = false;
    review.style.scrollMarginTop = "var(--sp-3)";
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof review.scrollIntoView === "function") {
      review.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    // Sequential focus continues inside the new block instead of stranding a
    // keyboard user on a button that has just scrolled out of view.
    review.focus({ preventScroll: true });
  }

  /* --------------------------------------------------------------- network */

  async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.error?.message || `The server refused that request (${response.status}).`);
      error.status = response.status;
      error.code = data?.error?.code ?? "";
      throw error;
    }
    return data ?? {};
  }

  /* ------------------------------------------------------------- messaging */

  function announce(message) {
    const live = byId("ed-status");
    if (live) live.textContent = message;
  }

  function showError(message) {
    const host = byId("ed-errors");
    if (!host) return;
    host.hidden = false;
    host.append(el("p", { role: "alert", text: message }));
  }

  function clearErrors() {
    const host = byId("ed-errors");
    if (!host) return;
    clear(host);
    host.hidden = true;
  }

  function setSaveState(kind) {
    const labels = {
      loading: "loading",
      saved: `saved ${stamp(state.savedAt)}`,
      dirty: "unsaved changes",
      busy: "saving…",
      error: "not saved",
    };
    const value = labels[kind] ?? kind;
    for (const node of document_.querySelectorAll("[data-savestate]")) {
      node.dataset.state = kind;
      node.textContent = value;
    }
  }

  function stamp(value) {
    if (!value) return "now";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "now";
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function setBusy(busy) {
    state.busy = busy;
    for (const button of document_.querySelectorAll("[data-save]")) button.disabled = busy || !state.loaded;
    for (const id of ["ed-ask", "ed-download-md", "ed-print", "ed-download-docx"]) {
      const button = byId(id);
      if (button) button.disabled = busy || !state.loaded;
    }
  }

  /* ---------------------------------------------------------------- render */

  function readForm() {
    state.contact = normaliseContact({
      name: byId("ed-contact-name")?.value ?? "",
      email: byId("ed-contact-email")?.value ?? "",
      phone: byId("ed-contact-phone")?.value ?? "",
      links: (byId("ed-contact-links")?.value ?? "").split("\n"),
    });
    const next = {};
    for (const key of SECTIONS) next[key] = draft(byId(`ed-text-${key}`)?.value ?? "");
    state.sections = next;
  }

  function writeForm() {
    const nameInput = byId("ed-contact-name");
    if (nameInput) nameInput.value = state.contact.name;
    byId("ed-contact-email").value = state.contact.email;
    byId("ed-contact-phone").value = state.contact.phone;
    byId("ed-contact-links").value = state.contact.links.join("\n");
    for (const key of SECTIONS) {
      const field = byId(`ed-text-${key}`);
      if (field) field.value = state.sections[key];
    }
    updateCounts();
    autoSizeAll();
  }

  /** A document, not a form: every field is as tall as its text. */
  function autoSize(field) {
    if (!field || !field.style) return;
    // `height: auto` on a textarea resolves to its `rows` attribute, and
    // scrollHeight can never be smaller than the client height — so the box has
    // to be collapsed to zero before it can be measured.
    field.style.height = "0px";
    field.style.height = `${Math.max(field.scrollHeight, 44)}px`;
  }

  function autoSizeAll() {
    for (const field of document_.querySelectorAll(".ed-input, .ed-input--compact")) autoSize(field);
  }

  function updateCounts() {
    const counts = { contact: countWords([state.contact.name, state.contact.email, state.contact.phone, ...state.contact.links].join(" ")) };
    for (const key of SECTIONS) counts[key] = countWords(state.sections[key]);
    for (const node of document_.querySelectorAll("[data-count]")) {
      const value = counts[node.dataset.count];
      node.textContent = value === undefined ? "—" : String(value);
    }
  }

  function setDirty(dirty) {
    const was = state.dirty;
    state.dirty = Boolean(dirty);
    if (!state.loaded) return;
    setSaveState(state.dirty ? "dirty" : "saved");
    // Announce the transition, not every keystroke: a live region that fires on
    // each character is unusable with a screen reader.
    if (state.dirty && !was) announce("Unsaved changes.");
  }

  /* ------------------------------------------------------------------ load */

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const cvId = params.get("cv");
    if (!cvId) {
      showFailure(
        "No CV chosen",
        "This page edits one CV at a time. Open it from a link that names the CV, for example /editor?cv=… .",
        "Go to the CV library",
        "/app/cv"
      );
      return;
    }
    state.cvId = cvId;
    setSaveState("loading");

    let data;
    try {
      data = await api(`/api/cvs/${encodeURIComponent(cvId)}`);
    } catch (error) {
      if (error.status === 401) {
        showFailure(
          "Sign in to edit",
          "Your session has expired or you are not signed in. The editor reads and writes with your own session cookie.",
          "Sign in",
          `/sign-in?next=${encodeURIComponent(`/editor?cv=${cvId}`)}`
        );
        return;
      }
      if (error.status === 404) {
        showFailure(
          "That CV is not here",
          "The id in the address does not belong to a CV on this account. It may have been deleted.",
          "Go to the CV library",
          "/app/cv"
        );
        return;
      }
      showFailure("The CV could not be loaded", error.message, "Try again", "");
      return;
    }

    const cv = data.cv ?? {};
    state.cvName = text(cv.name) || "CV";
    const profile = cv.profile;
    if (!profile || typeof profile !== "object" || !profile.sections) {
      showFailure(
        "This CV has no sections to edit",
        "It was stored without the section split the editor needs. Re-create it from the CV library, or paste the text again there.",
        "Go to the CV library",
        "/app/cv"
      );
      return;
    }

    const loadedDocument = documentFromProfile(profile);
    state.contact = loadedDocument.contact;
    state.sections = loadedDocument.sections;
    // The baseline is what this page would write, not the stored text: the
    // stored text may use headings and a contact order this editor normalises,
    // and clicking Save with no edits must not rewrite the user's CV. The first
    // real save does normalise it, which docs/EDITOR.md states plainly.
    state.savedText = reconstructCvText(state);
    state.storedText = text(cv.text) || state.savedText;
    state.savedAt = new Date();
    state.loaded = true;

    byId("ed-cv-name").textContent = state.cvName;
    document_.title = `${state.cvName} · CV editor · Applywright`;
    // Reveal the paper before measuring the fields: a hidden textarea has no
    // scrollHeight, so the auto-size pass would leave every section at 44px.
    byId("ed-loading").hidden = true;
    byId("ed-form").hidden = false;
    writeForm();
    // Say it before an edit can be saved, not in the diff afterwards: an
    // unrecognised parse is the one case where a save rewrites the shape of
    // someone's CV.
    renderParseNotice(parseNotice({ sections: state.sections }));
    setSaveState("saved");
    setBusy(false);

    // The section headings are anchor targets; tabindex lets a fragment jump
    // move focus there instead of only scrolling.
    for (const heading of document_.querySelectorAll(".ed-block__title")) heading.setAttribute("tabindex", "-1");
    observeSections();
  }

  function showFailure(title, body, label, href) {
    const loading = byId("ed-loading");
    if (loading) {
      loading.hidden = false;
      clear(loading);
      loading.append(
        el("h2", { class: "ed-block__title", text: title }),
        el("p", { class: "ed-block__hint", text: body }),
        href
          ? el("p", { class: "ed-actions" }, el("a", { class: "btn btn--ghost", href, text: label }))
          : el("p", { class: "ed-actions" }, el("button", { class: "btn btn--ghost", type: "button", text: label, onClick: () => window.location.reload() }))
      );
    }
    setSaveState("error");
  }

  /* ------------------------------------------------------------------ save */

  async function save({ quiet = false } = {}) {
    if (!state.loaded || state.busy) return false;
    readForm();
    const nextText = reconstructCvText(state);
    if (nextText === state.savedText) {
      setDirty(false);
      if (!quiet) announce("Nothing has changed since the last save.");
      return true;
    }

    setBusy(true);
    setSaveState("busy");
    clearErrors();
    try {
      const data = await api(`/api/cvs/${encodeURIComponent(state.cvId)}`, { method: "PATCH", body: { text: nextText } });
      const previous = state.storedText || state.savedText;
      state.savedText = text(data.cv?.text) || nextText;
      state.storedText = state.savedText;
      state.savedAt = new Date();
      const savedDocument = documentFromProfile(
        data.cv?.profile && typeof data.cv.profile === "object"
          ? data.cv.profile
          : { contact: state.contact, sections: state.sections }
      );
      state.contact = savedDocument.contact;
      state.sections = savedDocument.sections;
      writeForm();
      renderDiff(previous, state.savedText);
      state.dirty = false;
      setSaveState("saved");
      // A save is only stable if the server reads the text back into the same
      // sections. If it does not, say so now rather than at export time.
      if (reconstructCvText({ contact: state.contact, sections: state.sections }) !== state.savedText) {
        showError(
          "Saved, but the server read the text back into slightly different sections than the ones on screen. The text itself is stored; check it before exporting."
        );
      }
      if (!quiet) announce(`Saved at ${stamp(state.savedAt)}.`);
      return true;
    } catch (error) {
      setSaveState("error");
      showError(error.status === 400 ? `The server would not take that text: ${error.message}` : `Saving failed: ${error.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ diff */

  function renderDiff(before, after) {
    const region = byId("ed-diff-region");
    const rows = byId("ed-diff-rows");
    const summary = byId("ed-diff-summary");
    if (!region || !rows || !summary) return;
    const diff = diffLines(before, after);
    const added = diff.filter((row) => row.kind === "add").length;
    const removed = diff.filter((row) => row.kind === "del").length;

    clear(rows);
    if (!added && !removed) {
      summary.textContent = "No line changed — the server segmented the text back to the same sections.";
      region.hidden = false;
      return;
    }

    for (const row of diff) {
      if (row.kind === "same") continue;
      rows.append(
        el(
          "li",
          { class: "ed-diff__row", dataset: { kind: row.kind } },
          el("span", { class: "ed-diff__mark", "aria-hidden": "true", text: row.kind === "add" ? "+" : "−" }),
          el("span", { class: "ed-diff__text", text: row.text || "(blank line)" })
        )
      );
    }
    summary.textContent = `${added} line${added === 1 ? "" : "s"} added, ${removed} removed. Unchanged lines are hidden.`;
    region.hidden = false;
    region.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* --------------------------------------------------------------- the agent */

  function scopeLabel(scope) {
    return SCOPE_LABELS[scope] ?? "whole CV";
  }

  async function ask() {
    if (!state.loaded || state.busy) return;
    const instruction = byId("ed-instruction").value.trim();
    const scope = byId("ed-scope").value;
    const status = byId("ed-assist-state");
    clearErrors();
    clear(byId("ed-proposals"));
    if (state.review) state.review.hidden = true;
    state.proposal = null;

    if (instruction.length < 3) {
      status.dataset.tone = "err";
      status.textContent = "Describe the change first — for example “make the summary shorter and plainer”.";
      byId("ed-instruction").focus();
      return;
    }

    // The proposal is checked against the stored CV, so unsaved edits would
    // make the hunks point at text that is not there. Save first, say so.
    if (state.dirty) {
      status.dataset.tone = "";
      status.textContent = "Saving your edits first, so the proposal matches the document…";
      const saved = await save({ quiet: true });
      if (!saved) {
        status.dataset.tone = "err";
        status.textContent = "Your edits could not be saved, so no proposal was requested.";
        return;
      }
    }

    setBusy(true);
    status.dataset.tone = "";
    status.textContent = "Working out a proposal…";
    try {
      const data = await api(`/api/cvs/${encodeURIComponent(state.cvId)}/assist`, {
        method: "POST",
        body: { instruction, scope },
      });
      state.proposal = data;
      renderProposal(data, scope);
    } catch (error) {
      status.dataset.tone = "err";
      status.textContent =
        error.status === 401
          ? "Your session has expired. Reload and sign in again."
          : `No proposal: ${error.message}`;
    } finally {
      setBusy(false);
    }
  }

  function renderProposal(data, scope) {
    const status = byId("ed-assist-state");
    const host = byId("ed-proposals");
    const changes = Array.isArray(data.changes) ? data.changes : [];
    const rejected = Array.isArray(data.rejected) ? data.rejected : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const mode = data.mode === "model" ? "model" : "rules";

    clear(host);
    status.dataset.tone = "";
    const modeLine =
      mode === "model"
        ? "Proposed by the configured model, then checked against your CV."
        : "No model is configured on this server, so the deterministic rules produced this.";

    if (!changes.length) {
      status.textContent = `${modeLine} Nothing passed the check, so there is nothing to accept.`;
    } else {
      status.textContent = `${modeLine} ${changes.length} change${changes.length === 1 ? "" : "s"} in the ${scopeLabel(scope)}, nothing saved yet.`;
    }

    changes.forEach((change, index) => {
      const section = change.section ?? "summary";
      const article = el("article", { class: "ed-hunk", dataset: { state: "pending" } });
      const accept = el("button", {
        class: "btn btn--primary btn--sm",
        type: "button",
        text: "Accept and save",
        onClick: () => acceptHunk(index, article),
      });
      accept.setAttribute("aria-label", `Accept the change to ${SECTION_LABELS[section] ?? section} and save`);
      const reject = el("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        text: "Reject",
        onClick: () => rejectHunk(index, article),
      });
      reject.setAttribute("aria-label", `Reject the change to ${SECTION_LABELS[section] ?? section}`);

      article.append(
        el(
          "div",
          { class: "ed-hunk__head" },
          el("h4", { class: "ed-hunk__section", text: `${SECTION_LABELS[section] ?? section} · change ${index + 1} of ${changes.length}` })
        ),
        el("p", { class: "ed-hunk__why", text: change.why ? String(change.why) : "Reworded from your own text." }),
        el(
          "div",
          { class: "ed-hunk__pair" },
          el(
            "div",
            null,
            el("span", { class: "ed-hunk__label", text: "Now" }),
            el("p", { class: "ed-hunk__before", text: change.before })
          ),
          el(
            "div",
            null,
            el("span", { class: "ed-hunk__label", text: "Proposed" }),
            el("p", { class: "ed-hunk__after", text: change.after })
          )
        ),
        el("div", { class: "ed-hunk__actions" }, accept, reject)
      );
      host.append(article);
    });

    if (rejected.length) {
      const list = el("ul", { class: "ed-limits" });
      for (const entry of rejected) {
        const reasons = Array.isArray(entry.reasons) ? entry.reasons.join(" ") : "the change could not be checked";
        list.append(
          el(
            "li",
            null,
            el("strong", { text: `${SECTION_LABELS[entry.section] ?? entry.section ?? "change"}: ` }),
            el("span", { class: "mono", text: String(entry.before ?? "").slice(0, 120) }),
            document_.createTextNode(" — "),
            document_.createTextNode(reasons)
          )
        );
      }
      host.append(
        el(
          "details",
          { class: "ed-source" },
          el("summary", { text: `${rejected.length} proposed change${rejected.length === 1 ? "" : "s"} refused` }),
          el("div", { class: "ed-source__body" }, list)
        )
      );
    }

    if (warnings.length) {
      const list = el("ul", { class: "ed-limits" });
      for (const warning of warnings) list.append(el("li", { text: String(warning) }));
      host.append(
        el(
          "details",
          { class: "ed-source" },
          el("summary", { text: "What the refinement reported" }),
          el("div", { class: "ed-source__body" }, list, el("p", { class: "hint", text: ASSIST_ADVISORY }))
        )
      );
    }

    // Only a proposal with something to accept is worth interrupting for; a
    // refusal stays in the rail's status line with its reasons.
    if (changes.length) revealReview();
  }

  function focusNextPending(current) {
    const hunks = [...document_.querySelectorAll(".ed-hunk")];
    const index = hunks.indexOf(current);
    for (const hunk of [...hunks.slice(index + 1), ...hunks.slice(0, index)]) {
      if (hunk.dataset.state !== "pending") continue;
      hunk.querySelector("button")?.focus();
      return;
    }
    // Every hunk is decided: put the cursor back where the next instruction
    // would be typed, so a keyboard-only user is not dropped at the top.
    byId("ed-instruction")?.focus();
  }

  async function acceptHunk(index, article) {
    const proposal = state.proposal;
    const change = proposal?.changes?.[index];
    if (!change || article.dataset.state !== "pending" || state.busy) return;
    const section = change.section;
    if (!SECTIONS.includes(section)) {
      showError("That proposal does not name a section this editor knows, so it was not applied.");
      return;
    }

    readForm();
    const next = applyChange(state.sections[section], change.before, change.after);
    if (next === null) {
      article.dataset.state = "rejected";
      for (const button of article.querySelectorAll("button")) button.disabled = true;
      showError(
        `The ${SECTION_LABELS[section]} text changed since the proposal was made, so it was not applied. Ask for a new proposal.`
      );
      announce("Proposal not applied: the text it names is no longer in that section.");
      focusNextPending(article);
      return;
    }

    state.sections = { ...state.sections, [section]: next };
    byId(`ed-text-${section}`).value = next;
    updateCounts();
    article.dataset.state = "accepted";
    for (const button of article.querySelectorAll("button")) button.disabled = true;

    const saved = await save({ quiet: true });
    announce(
      saved
        ? `Accepted the change to ${SECTION_LABELS[section]} and saved.`
        : `The change to ${SECTION_LABELS[section]} is in the editor but could not be saved.`
    );
    focusNextPending(article);
  }

  function rejectHunk(index, article) {
    const change = state.proposal?.changes?.[index];
    article.dataset.state = "rejected";
    for (const button of article.querySelectorAll("button")) button.disabled = true;
    announce(`Rejected the change${change?.section ? ` to ${SECTION_LABELS[change.section] ?? change.section}` : ""}. Nothing was applied.`);
    focusNextPending(article);
  }

  /* ------------------------------------------------------------- sources */

  function confidenceLabel(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    const percent = Math.round(number <= 1 ? number * 100 : number);
    const word = percent >= 75 ? "high" : percent >= 45 ? "medium" : "low";
    return `${word} confidence (${percent}%)`;
  }

  async function readProfile() {
    const state_ = byId("ed-linkedin-state");
    const result = byId("ed-linkedin-result");
    const value = byId("ed-linkedin-text").value.trim();
    clear(result);
    state_.dataset.tone = "";
    state.parsedProfile = null;
    state.mergePlan = null;

    if (value.length < 80) {
      state_.dataset.tone = "err";
      state_.textContent = "Paste the whole profile first — headline, about and at least one role.";
      byId("ed-linkedin-text").focus();
      return;
    }

    state_.textContent = "Reading the profile…";
    try {
      const data = await api("/api/connectors/linkedin", { method: "POST", body: { text: value } });
      state.parsedProfile = data.profile ?? null;
      renderParsedProfile(data);
    } catch (error) {
      state_.dataset.tone = "err";
      state_.textContent = `That could not be read: ${error.message}`;
    }
  }

  function renderParsedProfile(data) {
    const status = byId("ed-linkedin-state");
    const host = byId("ed-linkedin-result");
    const profile = state.parsedProfile ?? {};
    const confidence = confidenceLabel(data.confidence);
    const plan = sectionsFromProfile(profile);
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];

    const roles = Array.isArray(profile.experience) ? profile.experience.length : 0;
    const schools = Array.isArray(profile.education) ? profile.education.length : 0;
    const skills = Array.isArray(profile.skills) ? profile.skills.length : 0;

    status.dataset.tone = "ok";
    status.textContent = confidence ? `Read with ${confidence}.` : "Profile read.";
    clear(host);

    const rows = el("div", { class: "ed-parse__rows" });
    const addRow = (label, value) => {
      if (!value) return;
      rows.append(
        el("div", { class: "ed-parse__row" }, el("span", { text: label }), el("span", { text: String(value) }))
      );
    };
    addRow("Name", profile.name);
    addRow("Headline", profile.headline);
    addRow("Roles", roles ? String(roles) : "");
    addRow("Education", schools ? String(schools) : "");
    addRow("Skills", skills ? String(skills) : "");
    if (data.looksLikeLinkedIn === false) addRow("Shape", "Not the usual LinkedIn layout — check the parse");

    const choices = el("fieldset", { class: "ed-merge" });
    choices.append(el("legend", { text: "Add to this CV" }));
    const checked = new Map();
    for (const key of SECTIONS) {
      const incoming = plan.sections[key];
      if (!incoming) continue;
      const existingWords = countWords(state.sections[key]);
      const id = `ed-merge-${key}`;
      const box = el("input", { type: "checkbox", id, checked: existingWords === 0 });
      checked.set(key, box);
      choices.append(
        el(
          "label",
          { for: id },
          box,
          el("span", {
            text:
              existingWords === 0
                ? `${SECTION_LABELS[key]} — ${countWords(incoming)} words, this section is empty`
                : `${SECTION_LABELS[key]} — append ${countWords(incoming)} words (this section already has ${existingWords}; appending may duplicate a role)`,
          })
        )
      );
    }
    if (!choices.querySelector("input")) {
      choices.append(el("p", { class: "hint", text: "Nothing in that profile maps to a section this CV has." }));
    }
    state.mergePlan = checked;

    const contactBits = [plan.contact.name, plan.contact.email, plan.contact.phone, ...plan.contact.links].filter(Boolean);

    host.append(
      el(
        "div",
        { class: "ed-parse" },
        el("p", { class: "mono", text: "Parsed profile — check it before it becomes text" }),
        rows,
        contactBits.length
          ? el("p", { class: "hint", text: `Contact block: ${contactBits.join(" · ")} (empty fields are filled; nothing is overwritten)` })
          : el("p", { class: "hint", text: "No contact details were found." }),
        warnings.length
          ? el("ul", { class: "ed-limits" }, ...warnings.map((warning) => el("li", { text: String(warning) })))
          : null,
        choices,
        el(
          "div",
          { class: "ed-actions" },
          el("button", {
            class: "btn btn--primary btn--sm",
            type: "button",
            text: "Add the ticked sections and save",
            onClick: () => mergeProfile(plan),
          }),
          el("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "Create a separate CV instead",
            onClick: () => createCvFromProfile(),
          })
        )
      )
    );
  }

  async function mergeProfile(plan) {
    if (!state.mergePlan) return;
    const chosen = [];
    for (const [key, box] of state.mergePlan) if (box.checked) chosen.push(key);
    if (!chosen.length) {
      announce("Nothing was ticked, so nothing was added.");
      return;
    }

    readForm();
    const next = { ...state.sections };
    for (const key of chosen) {
      const incoming = plan.sections[key];
      const current = next[key];
      next[key] = current ? `${current}\n${incoming}` : incoming;
    }
    const contact = { ...state.contact };
    if (!contact.name && plan.contact.name) contact.name = plan.contact.name;
    if (!contact.email && plan.contact.email) contact.email = plan.contact.email;
    if (!contact.phone && plan.contact.phone) contact.phone = plan.contact.phone;
    for (const link of plan.contact.links) if (!contact.links.includes(link)) contact.links = [...contact.links, link];

    state.sections = normaliseSections(next);
    state.contact = normaliseContact(contact);
    writeForm();
    setDirty(true);
    const saved = await save({ quiet: true });
    announce(
      saved
        ? `Added ${chosen.map((key) => SECTION_LABELS[key].toLowerCase()).join(", ")} and saved. Check the merged text before tailoring.`
        : "The merge is in the editor but could not be saved."
    );
  }

  async function createCvFromProfile() {
    if (!state.parsedProfile) return;
    const status = byId("ed-linkedin-state");
    try {
      const data = await api("/api/cvs/from-profile", {
        method: "POST",
        body: { profile: state.parsedProfile },
      });
      const created = data.cv ?? {};
      clear(byId("ed-linkedin-result"));
      byId("ed-linkedin-result").append(
        el(
          "p",
          { class: "hint" },
          el("span", { text: `${created.name ?? "A new CV"} was created. ` }),
          el("a", { href: `/editor?cv=${encodeURIComponent(created.id ?? "")}`, text: "Open it in this editor" })
        )
      );
      status.dataset.tone = "ok";
      status.textContent = "Separate CV created from the profile.";
    } catch (error) {
      status.dataset.tone = "err";
      status.textContent =
        error.code === "quota_exceeded"
          ? "Your plan is full, so a separate CV cannot be created. Compare the plans, or add the ticked sections to this CV instead."
          : `Creating a separate CV failed: ${error.message}`;
    }
  }

  async function checkCoverage() {
    const status = byId("ed-advert-state");
    const host = byId("ed-advert-result");
    const advert = byId("ed-advert-text").value.trim();
    clear(host);
    status.dataset.tone = "";
    if (advert.length < 40) {
      status.dataset.tone = "err";
      status.textContent = "Paste the advert first — the whole description, not just the title.";
      byId("ed-advert-text").focus();
      return;
    }

    status.textContent = "Saving and measuring…";
    try {
      if (state.dirty) {
        const saved = await save({ quiet: true });
        if (!saved) {
          status.dataset.tone = "err";
          status.textContent = "Your edits could not be saved, so coverage would measure the older text. Not run.";
          return;
        }
      }
      const data = await api("/api/analyse", { method: "POST", body: { cvId: state.cvId, jobText: advert } });
      renderCoverage(data);
      status.dataset.tone = "ok";
      status.textContent = "Coverage measured on the saved CV.";
    } catch (error) {
      status.dataset.tone = "err";
      status.textContent = `Coverage could not be measured: ${error.message}`;
    }
  }

  function renderCoverage(data) {
    const host = byId("ed-advert-result");
    const report = data.report ?? {};
    const coverage = report.keywordCoverage ?? { matched: [], missing: [], ratio: 0 };
    const matched = Array.isArray(coverage.matched) ? coverage.matched : [];
    const missing = Array.isArray(coverage.missing) ? coverage.missing : [];
    const ratio = Number(coverage.ratio) || 0;
    const score = Number(report.score) || 0;
    const findings = (Array.isArray(report.findings) ? report.findings : []).slice(0, 3);

    const tagList = (terms, kind) =>
      el(
        "ul",
        { class: "ed-taglist" },
        ...terms.map((term) => el("li", { class: "ed-tag", dataset: { state: kind }, text: String(term) }))
      );

    clear(host);
    host.append(
      el(
        "div",
        { class: "ed-coverage" },
        el(
          "div",
          { class: "ed-coverage__row" },
          el("span", { text: "Keyword coverage" }),
          el("span", { class: "ed-coverage__score", text: `${ratio}%` })
        ),
        el(
          "div",
          { class: "ed-coverage__row" },
          el("span", { text: "Rubric score" }),
          el("span", { class: "ed-coverage__score", text: `${score}/100` })
        ),
        matched.length
          ? el("div", null, el("p", { class: "mono", text: `Already covered (${matched.length})` }), tagList(matched, "covered"))
          : el("p", { class: "hint", text: "None of the advert's keywords appear in the saved CV." }),
        missing.length
          ? el("div", null, el("p", { class: "mono", text: `Not in the CV (${missing.length})` }), tagList(missing, "missing"))
          : null,
        findings.length
          ? el(
              "ul",
              { class: "ed-limits" },
              ...findings.map((finding) =>
                el("li", { text: `${finding.title ?? "Finding"} — ${finding.fix ?? finding.detail ?? ""}` })
              )
            )
          : null,
        el("p", {
          class: "hint",
          text:
            data.advisory ??
            "Our rubric, not an employer's verdict. Coverage counts the advert's keywords that appear anywhere in the saved CV.",
        })
      )
    );
  }

  /* ------------------------------------------------------------- exports */

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document_.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadMarkdown() {
    readForm();
    const markdown = markdownFor({ contact: state.contact, sections: state.sections, title: state.cvName });
    download(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), exportFilename(state.cvName, "md"));
    announce("Markdown downloaded.");
  }

  function downloadDocx() {
    readForm();
    const bytes = buildDocx({ contact: state.contact, sections: state.sections, title: state.cvName });
    download(
      new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      exportFilename(state.cvName, "docx")
    );
    announce("DOCX downloaded.");
  }

  /** The print sheet: semantic HTML, no controls, one column, A4. */
  function buildPrintSheet() {
    readForm();
    const sheet = el("article", { id: "ed-print-doc", lang: "en-GB" });
    const name = state.contact.name || state.cvName || "Curriculum vitae";
    sheet.append(el("h1", { text: name }));
    const meta = [state.contact.email, state.contact.phone, ...state.contact.links].filter(Boolean).join(" · ");
    if (meta) sheet.append(el("p", { class: "ed-print__contact", text: meta }));

    for (const key of SECTIONS) {
      const body = state.sections[key];
      if (!body) continue;
      sheet.append(el("h2", { text: SECTION_HEADINGS[key] }));
      let list = null;
      for (const line of body.split("\n")) {
        const value = line.trim();
        if (!value) continue;
        if (BULLET_LINE.test(value)) {
          if (!list) {
            list = el("ul");
            sheet.append(list);
          }
          list.append(el("li", { text: value.replace(BULLET_LINE, "").trim() }));
          continue;
        }
        list = null;
        sheet.append(el("p", { class: "ed-print__role", text: value }));
      }
    }
    return sheet;
  }

  function printDocument() {
    const existing = byId("ed-print-doc");
    const sheet = buildPrintSheet();
    if (existing) existing.replaceWith(sheet);
    else document_.body.append(sheet);
    announce("Opening the print dialogue. The sheet is A4 and single column.");
    window.print();
  }

  /* --------------------------------------------------------------- wiring */

  function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    const links = new Map();
    for (const link of document_.querySelectorAll(".ed-nav a")) {
      const id = link.getAttribute("href")?.slice(1);
      if (id) links.set(id, link);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const [id, link] of links) link.removeAttribute("aria-current");
          links.get(entry.target.id)?.setAttribute("aria-current", "true");
        }
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    for (const id of links.keys()) {
      const block = byId(id);
      if (block) observer.observe(block);
    }
  }

  function wire() {
    const form = byId("ed-form");
    form?.addEventListener("input", (event) => {
      readForm();
      updateCounts();
      setDirty(true);
      if (event.target instanceof HTMLTextAreaElement) autoSize(event.target);
    });
    window.addEventListener("resize", () => autoSizeAll());

    for (const button of document_.querySelectorAll("[data-save]")) {
      button.addEventListener("click", () => save());
    }

    byId("ed-agent-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      ask();
    });

    byId("ed-download-md")?.addEventListener("click", downloadMarkdown);
    byId("ed-download-docx")?.addEventListener("click", downloadDocx);
    byId("ed-print")?.addEventListener("click", printDocument);

    byId("ed-diff-close")?.addEventListener("click", () => {
      const region = byId("ed-diff-region");
      if (region) region.hidden = true;
      announce("Diff hidden. It stays available until the next save.");
    });

    byId("ed-linkedin-read")?.addEventListener("click", readProfile);
    byId("ed-linkedin-paste")?.addEventListener("click", async () => {
      const status = byId("ed-linkedin-state");
      try {
        const pasted = await navigator.clipboard.readText();
        if (!pasted.trim()) {
          status.dataset.tone = "err";
          status.textContent = "The clipboard is empty.";
          return;
        }
        byId("ed-linkedin-text").value = pasted;
        byId("ed-linkedin-text").focus();
        status.dataset.tone = "ok";
        status.textContent = "Pasted from the clipboard. Read it when you are ready.";
      } catch {
        byId("ed-linkedin-text").focus();
        status.dataset.tone = "err";
        status.textContent = "The clipboard could not be read — click the box and press Ctrl+V instead.";
      }
    });

    byId("ed-advert-check")?.addEventListener("click", checkCoverage);

    document_.addEventListener("keydown", (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && !event.altKey && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        save();
        return;
      }
      if (modifier && event.key === "Enter" && document_.activeElement === byId("ed-instruction")) {
        event.preventDefault();
        ask();
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  wire();
  load();
}

if (typeof document !== "undefined") bootEditor();
