/**
 * Applywright — CV scoring against one job description.
 *
 * Pure, synchronous and deterministic: the same three inputs always produce the
 * same report. No network, no model, no clock, no randomness.
 *
 * Fixed weights (SPEC section 5, documented rule by rule in NOTES-score.md):
 *   keywords 35, structure 20, achievements 20, readability 15, formatting 10.
 *
 * Everything this module says about a CV comes from evidence it can point at in
 * the plain text: a counted heading, a line number, a word count, a quoted
 * number. Where the plain text cannot support a judgement, the report says so
 * instead of guessing.
 */
import { bulletize, keywordCoverage, metrics, pct, sentences } from "../text.js";

/** Public weights, so the UI renders the same numbers the score uses. */
export const WEIGHTS = Object.freeze({
  keywords: 35,
  structure: 20,
  achievements: 20,
  readability: 15,
  formatting: 10,
});

const MAX_TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0);

const SEVERITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });

/** Structure points (out of 100 inside the section). */
const STRUCTURE = Object.freeze({
  contact: 20,
  experience: 25,
  dates: 20,
  summary: 20,
  educationOrSkills: 15,
});

/** Achievement points (out of 100 inside the section). */
const ACHIEVEMENTS = Object.freeze({
  quantified: 60,
  strongVerbs: 25,
  outcomes: 15,
});

/** Readability points (out of 100 inside the section). */
const READABILITY = Object.freeze({
  lengthBand: 45,
  notLong: 35,
  notVeryLong: 20,
});

/** Formatting deductions from a starting 100. */
const FORMATTING = Object.freeze({
  headings: 20,
  contact: 10,
  paragraph: 10,
  paragraphCap: 20,
  bullet: 5,
  bulletCap: 15,
  capsBlock: 10,
  capsFew: 4,
  dates: 15,
  table: 15,
  thinCvCap: 20,
});

const LIMITS = Object.freeze({
  longParagraphWords: 120,
  longBulletWords: 45,
  longSentenceWords: 30,
  veryLongSentenceWords: 45,
  thinCvWords: 40,
  keywordLimit: 25,
  summaryWords: 8,
  experienceWords: 10,
  quotedTerms: 6,
});

const BULLET_RE = /^(?:[-*•▪◦‣·–—]|\(?\d{1,2}[.)])\s+/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LINK_RE = /\b(?:https?:\/\/|www\.|linkedin\.com\/|github\.com\/|gitlab\.com\/|bitbucket\.org\/)/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const PRESENT_RE = /\b(?:present|current|ongoing)\b/i;
const NUMBER_RE = /\d/;
const CURRENCY_RE = /[£$€]\s?\d/;
const PERCENT_RE = /\d(?:[.,]\d+)?\s?%/;

/* ------------------------------------------------------------------ *
 * Section headings
 * ------------------------------------------------------------------ */

const HEADING_SECTIONS = new Map();

function registerHeadings(section, labels) {
  for (const label of labels) HEADING_SECTIONS.set(label, section);
}

registerHeadings("summary", [
  "summary",
  "professional summary",
  "profile",
  "personal profile",
  "professional profile",
  "career summary",
  "about",
  "about me",
  "objective",
  "career objective",
  "personal statement",
  "executive summary",
]);

registerHeadings("experience", [
  "experience",
  "work experience",
  "professional experience",
  "relevant experience",
  "employment",
  "employment history",
  "work history",
  "career history",
  "positions held",
  "career",
]);

registerHeadings("education", [
  "education",
  "education and training",
  "qualifications",
  "academic qualifications",
  "academic background",
  "academic history",
  "schooling",
  "degrees",
]);

registerHeadings("skills", [
  "skills",
  "key skills",
  "core skills",
  "technical skills",
  "professional skills",
  "competencies",
  "core competencies",
  "expertise",
  "areas of expertise",
  "technical expertise",
  "technologies",
  "tools and technologies",
  "tech stack",
  "skills and tools",
]);

/** Headings that are recognised (so content is not misfiled) but not scored. */
const OTHER_HEADINGS = new Set([
  "projects",
  "key projects",
  "selected projects",
  "certifications",
  "certificates",
  "licences",
  "licenses",
  "awards",
  "achievements",
  "interests",
  "hobbies",
  "references",
  "referees",
  "publications",
  "languages",
  "volunteering",
  "volunteer work",
  "additional information",
  "professional development",
  "courses",
  "training",
  "memberships",
]);

/**
 * A heading is a short line that names a section, with or without a colon and
 * inline content ("Skills: Go, Python"). Long lines never qualify, so ordinary
 * prose cannot be mistaken for one.
 */
function detectHeading(line) {
  let raw = String(line ?? "").trim();
  if (!raw || raw.length > 64) return null;
  raw = raw.replace(/^#{1,6}\s*/, "").replace(/^[-*•▪◦‣·]\s*/, "").trim();
  const colon = raw.indexOf(":");
  const head = colon >= 0 ? raw.slice(0, colon) : raw;
  const rest = colon >= 0 ? raw.slice(colon + 1).trim() : "";
  const label = head
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:section\s+)?\d+\s+/, "")
    .trim();
  if (!label) return null;
  const words = label.split(" ").filter(Boolean);
  if (!words.length || words.length > 5) return null;
  if (HEADING_SECTIONS.has(label)) return { section: HEADING_SECTIONS.get(label), label, rest };
  if (OTHER_HEADINGS.has(label)) return { section: "other", label, rest };
  return null;
}

/* ------------------------------------------------------------------ *
 * Small text helpers (no reimplementation of the shared layer)
 * ------------------------------------------------------------------ */

const countWords = (text) => String(text ?? "").split(/\s+/).filter(Boolean).length;

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

const totalPoints = (section, sectionPoints) =>
  Math.round(sectionPoints * WEIGHTS[section]) / 100;

/** Digits that are not part of a year: 12 weeks, 38%, £240,000, 1.4 million. */
function hasQuantifiedMetric(text) {
  const withoutYears = String(text ?? "").replace(/\b(?:19|20)\d{2}\b/g, " ");
  return CURRENCY_RE.test(withoutYears) || NUMBER_RE.test(withoutYears);
}

const hasDate = (line) => YEAR_RE.test(line) || PRESENT_RE.test(line);

function findPhone(text) {
  const candidates = String(text ?? "").match(/\+?\d[\d\s().-]{6,}\d/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  });
}

function isCapsLine(text) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const alphaWords = words.filter((word) => /[A-Za-z]/.test(word));
  if (alphaWords.length < 4) return false;
  if ((text.match(/,/g) ?? []).length >= 2) return false; // comma-separated skill lists
  const letters = String(text).replace(/[^A-Za-z]/g, "");
  if (letters.length < 20) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= 0.85;
}

const listTerms = (terms, max = LIMITS.quotedTerms) => {
  if (!terms.length) return "";
  if (terms.length <= max) return terms.join(", ");
  return `${terms.slice(0, max).join(", ")} and ${terms.length - max} more`;
};

/** Quote the opening of a long line so the reader can find it. */
function quote(text, words = 8) {
  const parts = String(text ?? "").split(/\s+/).filter(Boolean);
  if (parts.length <= words) return parts.join(" ");
  return `${parts.slice(0, words).join(" ")} …`;
}

/* ------------------------------------------------------------------ *
 * Pass 1 — read the document
 * ------------------------------------------------------------------ */

function scan(cv) {
  const records = [];
  const lines = String(cv ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    const n = index + 1;
    if (!text) {
      records.push({ n, text: "", kind: "blank" });
      continue;
    }
    const heading = detectHeading(text);
    if (heading) {
      records.push({ n, text, kind: "heading", heading });
      continue;
    }
    if (BULLET_RE.test(text)) {
      // Keep the marker: bulletize() in the shared layer needs it to recognise a
      // bullet, and the marker is what tells a bullet apart from a wrapped line.
      records.push({ n, text: text.replace(BULLET_RE, "").trim(), raw: text, kind: "bullet" });
      continue;
    }
    records.push({ n, text, kind: "prose" });
  }
  return records;
}

function splitSections(records) {
  const sections = { summary: [], experience: [], education: [], skills: [], other: [] };
  const headings = [];
  let current = "other";
  for (const record of records) {
    if (record.kind === "heading") {
      current = record.heading.section;
      headings.push({ n: record.n, section: current, label: record.heading.label });
      if (record.heading.rest) {
        sections[current].push({ n: record.n, text: record.heading.rest, kind: "prose" });
      }
      continue;
    }
    sections[current].push(record);
  }
  return { sections, headings };
}

const sectionText = (records) =>
  records
    .filter((record) => record.kind !== "blank" && (record.raw || record.text))
    .map((record) => record.raw ?? record.text)
    .join("\n");

function buildBlocks(records) {
  const blocks = [];
  let current = null;
  for (const record of records) {
    if (record.kind === "blank") {
      current = null;
      continue;
    }
    if (!current) {
      current = { start: record.n, records: [] };
      blocks.push(current);
    }
    current.records.push(record);
  }
  for (const block of blocks) {
    const prose = block.records.filter((record) => record.kind === "prose");
    block.proseWords = prose.reduce((sum, record) => sum + countWords(record.text), 0);
    block.firstProse = prose.length ? prose[0].text : "";
  }
  return blocks;
}

/**
 * Sentences inside one block, without letting separate lines merge into one
 * enormous "sentence". A wrapped line continues its predecessor only when the
 * predecessor has no terminal punctuation and the line starts in lower case.
 */
function proseUnits(block) {
  const lines = block.records.filter((record) => record.kind === "prose").map((record) => record.text);
  const merged = [];
  let current = "";
  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }
    const continues = !/[.!?:;]$/.test(current) && /^[a-z0-9(]/.test(line);
    if (continues) current = `${current} ${line}`;
    else {
      merged.push(current);
      current = line;
    }
  }
  if (current) merged.push(current);
  return merged.flatMap((part) => sentences(part));
}

function buildContext(cvText, jobText, profile) {
  const cv = typeof cvText === "string" ? cvText : "";
  const job = typeof jobText === "string" ? jobText : "";
  const prof = profile && typeof profile === "object" ? profile : {};
  const records = scan(cv);
  const { sections, headings } = splitSections(records);
  return { cv, job, prof, records, sections, headings, cvWords: countWords(cv) };
}

/* ------------------------------------------------------------------ *
 * Pass 2 — evidence
 * ------------------------------------------------------------------ */

function measure(ctx) {
  const { cv, records, sections, headings, prof, cvWords } = ctx;
  const blocks = buildBlocks(records);
  const expRecords = sections.experience.filter((record) => record.kind !== "blank" && record.text);
  const expText = sectionText(sections.experience);
  const summaryText = sectionText(sections.summary);
  const skillsText = sectionText(sections.skills);
  const educationText = sectionText(sections.education);
  const experienceWords = countWords(expText);

  const profileContact = prof.contact && typeof prof.contact === "object" ? prof.contact : {};
  const contact = {
    email: EMAIL_RE.test(cv) || Boolean(profileContact.email || prof.email),
    phone: findPhone(cv) || Boolean(profileContact.phone || prof.phone),
    link: LINK_RE.test(cv) || Boolean(profileContact.links || profileContact.website || profileContact.url || prof.website),
  };
  let contactPoints = 0;
  if (contact.email && (contact.phone || contact.link)) contactPoints = STRUCTURE.contact;
  else if (contact.email || contact.phone || contact.link) contactPoints = Math.round(STRUCTURE.contact * 0.6);

  const datedExperience = expRecords.filter((record) => hasDate(record.text));
  const experienceEntryLines = expRecords.length;

  const bulletSource = expText || cv;
  const bullets = bulletize(bulletSource)
    .map((text) => text.trim())
    .filter((text) => countWords(text) > 2 && !detectHeading(text));
  const quantified = bullets.filter((text) => hasQuantifiedMetric(text)).length;

  const achievementMetrics = metrics(expText || cv);
  const docMetrics = metrics(cv);
  const hasOutcomeMetric =
    achievementMetrics.currency > 0 || PERCENT_RE.test(expText || cv) || CURRENCY_RE.test(expText || cv);

  const units = blocks.flatMap((block) => proseUnits(block));
  for (const record of records) if (record.kind === "bullet") units.push(record.text);
  const unitWords = units.map((unit) => countWords(unit)).filter((value) => value > 0);
  const unitTotal = unitWords.length;
  const unitSum = unitWords.reduce((sum, value) => sum + value, 0);
  const averageWords = unitTotal ? Math.round((unitSum / unitTotal) * 10) / 10 : 0;
  const longUnits = unitWords.filter((value) => value > LIMITS.longSentenceWords);
  const veryLongUnits = unitWords.filter((value) => value > LIMITS.veryLongSentenceWords);
  const longest = unitWords.length ? Math.max(...unitWords) : 0;

  const longParagraphs = blocks
    .filter((block) => block.proseWords > LIMITS.longParagraphWords)
    .map((block) => ({ n: block.start, words: block.proseWords, quote: quote(block.firstProse) }));

  const bulletish = records.filter(
    (record) =>
      record.kind === "bullet" ||
      (record.kind === "prose" && !/[.!?]$/.test(record.text) && record.text.length > 40)
  );
  const longBullets = bulletish
    .map((record) => ({ n: record.n, words: countWords(record.text), quote: quote(record.text) }))
    .filter((row) => row.words > LIMITS.longBulletWords);

  const textRecords = records.filter((record) => record.kind === "prose" || record.kind === "bullet");
  const capsRecords = textRecords.filter((record) => isCapsLine(record.text));
  let longestCapsRun = 0;
  let currentRun = 0;
  for (const record of records) {
    if (record.kind === "blank" || record.kind === "heading") {
      currentRun = 0;
      continue;
    }
    if (isCapsLine(record.text)) {
      currentRun += 1;
      longestCapsRun = Math.max(longestCapsRun, currentRun);
    } else currentRun = 0;
  }

  const pipeLines = records
    .filter((record) => record.kind !== "blank")
    .map((record) => ({ n: record.n, pipes: (record.text.match(/\|/g) ?? []).length }))
    .filter((row) => row.pipes >= 2);
  const tabLines = records.filter((record) => record.kind !== "blank" && /\t/.test(record.text));

  return {
    cvWords,
    blocks,
    blocksWithProse: blocks.filter((block) => block.proseWords > 0).length,
    headings,
    headingCount: headings.length,
    contact,
    contactPoints,
    summaryWords: countWords(summaryText),
    experienceWords,
    educationWords: countWords(educationText),
    skillsWords: countWords(skillsText),
    experienceEntryLines,
    datedExperience,
    bulletCount: bullets.length,
    quantifiedBullets: quantified,
    verbs: achievementMetrics.strongVerbs,
    currency: achievementMetrics.currency + docMetrics.currency,
    numbers: docMetrics.numbers,
    docWords: cvWords,
    hasOutcomeMetric,
    unitTotal,
    averageWords,
    longUnits: longUnits.length,
    veryLongUnits: veryLongUnits.length,
    longestUnit: longest,
    longestOver30: longUnits.length ? Math.max(...longUnits) : 0,
    longParagraphs,
    longBullets,
    capsCount: capsRecords.length,
    capsFirst: capsRecords.length ? capsRecords[0].n : 0,
    capsRun: longestCapsRun,
    pipeLines,
    tabLines: tabLines.length,
  };
}

/* ------------------------------------------------------------------ *
 * Pass 3 — points
 * ------------------------------------------------------------------ */

function grade(facts) {
  const experiencePoints = facts.experienceWords >= LIMITS.experienceWords ? STRUCTURE.experience : 0;
  let datesPoints = 0;
  if (facts.datedExperience.length >= 2) datesPoints = STRUCTURE.dates;
  else if (facts.datedExperience.length === 1)
    datesPoints = facts.experienceEntryLines <= 4 ? STRUCTURE.dates : Math.round(STRUCTURE.dates * 0.6);

  let summaryPoints = 0;
  if (facts.summaryWords >= LIMITS.summaryWords) summaryPoints = STRUCTURE.summary;
  else if (facts.summaryWords > 0) summaryPoints = Math.round(STRUCTURE.summary * 0.5);

  const hasEducation = facts.educationWords > 0;
  const hasSkills = facts.skillsWords > 0;
  let educationOrSkillsPoints = 0;
  if (hasEducation && hasSkills) educationOrSkillsPoints = STRUCTURE.educationOrSkills;
  else if (hasEducation || hasSkills) educationOrSkillsPoints = Math.round(STRUCTURE.educationOrSkills * 0.53);

  const structure = clamp(
    facts.contactPoints + experiencePoints + datesPoints + summaryPoints + educationOrSkillsPoints
  );

  const quantifiedShare = facts.bulletCount ? facts.quantifiedBullets / facts.bulletCount : 0;
  const verbPoints = Math.round((ACHIEVEMENTS.strongVerbs * Math.min(facts.verbs, 10)) / 10);
  const achievements = clamp(
    Math.round(ACHIEVEMENTS.quantified * quantifiedShare) + verbPoints + (facts.hasOutcomeMetric ? ACHIEVEMENTS.outcomes : 0)
  );

  let readability = 0;
  if (facts.unitTotal > 0) {
    const band = facts.averageWords;
    let bandPoints;
    if (band <= 24) bandPoints = READABILITY.lengthBand;
    else if (band <= 30) bandPoints = Math.round(READABILITY.lengthBand * 0.55);
    else if (band <= 40) bandPoints = Math.round(READABILITY.lengthBand * 0.27);
    else bandPoints = Math.round(READABILITY.lengthBand * 0.1);
    const notLong = Math.round(READABILITY.notLong * (1 - facts.longUnits / facts.unitTotal));
    const notVeryLong = Math.round(READABILITY.notVeryLong * (1 - facts.veryLongUnits / facts.unitTotal));
    readability = clamp(bandPoints + notLong + notVeryLong);
  }

  let penalty = 0;
  if (facts.headingCount === 0) penalty += FORMATTING.headings;
  if (!facts.contact.email && !facts.contact.phone && !facts.contact.link) penalty += FORMATTING.contact;
  penalty += Math.min(FORMATTING.paragraphCap, facts.longParagraphs.length * FORMATTING.paragraph);
  penalty += Math.min(FORMATTING.bulletCap, facts.longBullets.length * FORMATTING.bullet);
  if (facts.capsCount > 0) penalty += facts.capsCount >= 3 || facts.capsRun >= 3 ? FORMATTING.capsBlock : FORMATTING.capsFew;
  if (facts.experienceWords > 0 && facts.datedExperience.length === 0) penalty += FORMATTING.dates;
  // One line with pipes is usually a contact line and parses fine; two or more
  // lines with two or more pipes each is the shape of a table.
  if (facts.pipeLines.length >= 2 || facts.tabLines > 0) penalty += FORMATTING.table;
  let formatting = clamp(100 - penalty);

  // A CV too short to score cannot earn formatting credit for the parts it lacks.
  if (facts.cvWords < LIMITS.thinCvWords) formatting = Math.min(formatting, FORMATTING.thinCvCap);

  return { structure, achievements, readability, formatting };
}

/* ------------------------------------------------------------------ *
 * Pass 4 — findings
 * ------------------------------------------------------------------ */

function buildFindings(facts, points, coverage, keywordsMeasured, context) {
  const findings = [];
  const add = (id, severity, title, detail, fix) => findings.push({ id, severity, title, detail, fix });

  /* --- keywords --------------------------------------------------- */
  const keywordTotal = coverage.matched.length + coverage.missing.length;
  if (!keywordsMeasured) {
    add(
      "no-job-description",
      "medium",
      "No job description supplied",
      `The job text produced 0 usable keywords, so the ${WEIGHTS.keywords}-point keyword section could not be measured. ` +
        `It is set to ${points.keywords} — the weighted average of the other four sections — so the total stays on the 0–100 scale.`,
      "Paste the job description or the posting text before scoring: keyword coverage is the part of the score that swings most between jobs."
    );
  } else {
    const matchedShown = listTerms(coverage.matched);
    const missingShown = listTerms(coverage.missing);
    const evidence = [
      coverage.matched.length ? `Present: ${matchedShown}.` : "",
      coverage.missing.length ? `Absent: ${missingShown}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ratio = coverage.ratio;
    if (ratio < 40) {
      add(
        "keywords-low",
        "high",
        `Only ${coverage.matched.length} of ${keywordTotal} job keywords appear in your CV`,
        `${ratio}% coverage against this posting. ${evidence}`,
        `Rewrite the skills line and your two most recent bullets around the missing terms that name a tool, method or domain you can genuinely evidence — start with: ${listTerms(
          coverage.missing,
          3
        )}. Leave out anything you could not defend in an interview.`
      );
    } else if (ratio < 70) {
      add(
        "keywords-partial",
        "medium",
        `${coverage.matched.length} of ${keywordTotal} job keywords appear in your CV`,
        `${ratio}% coverage against this posting. ${evidence}`,
        `Place the ${coverage.missing.length} missing terms where they carry weight: the skills line first, then one bullet each for the ones with a real example behind them.`
      );
    } else if (ratio < 90) {
      add(
        "keywords-good",
        "low",
        `${coverage.matched.length} of ${keywordTotal} job keywords appear in your CV`,
        `${ratio}% coverage against this posting. ${evidence}`,
        coverage.missing.length
          ? `The gap is ${coverage.missing.length} term${coverage.missing.length === 1 ? "" : "s"} (${listTerms(
              coverage.missing,
              3
            )}); add only the ones you can back with an example.`
          : "No keyword gap to close; re-check after tailoring, since the posting's wording moves the set."
      );
    } else {
      add(
        "keywords-sound",
        "low",
        `All ${keywordTotal} job keywords appear in your CV`,
        `${ratio}% coverage against this posting: ${matchedShown}.`,
        "Nothing to fix here. Keep the wording in the posting's own vocabulary when you tailor, and re-score if you trim the skills line."
      );
    }

    if (context.experienceWords >= 20) {
      const inExperience = keywordCoverage(context.experienceText, context.job, { limit: LIMITS.keywordLimit });
      const expTotal = inExperience.matched.length + inExperience.missing.length;
      if (expTotal > 0) {
        const target = findings[findings.length - 1];
        target.detail += ` ${inExperience.matched.length} of ${expTotal} appear inside your experience section.`;
      }
    }
  }

  /* --- structure --------------------------------------------------- */
  if (facts.headingCount === 0) {
    add(
      "structure-no-headings",
      "high",
      "No section headings were found",
      `0 of ${facts.cvWords} words sit under a recognised heading, so an ATS has no summary, experience, education or skills field to read. ` +
        `This costs ${STRUCTURE.experience + STRUCTURE.summary + STRUCTURE.educationOrSkills} of the 100 structure points and a further ${FORMATTING.headings} formatting points.`,
      "Add four plain headings on their own lines — Summary, Experience, Education, Skills — and put the existing text underneath each one."
    );
  }

  if (!facts.contact.email && !facts.contact.phone && !facts.contact.link) {
    add(
      "structure-no-contact",
      "high",
      "No contact details were found",
      `0 of the three checks passed across ${facts.cvWords} words: no email address, no phone number of 9–15 digits and no profile link. ` +
        `This costs ${STRUCTURE.contact} of the 100 structure points (${totalPoints(
          "structure",
          STRUCTURE.contact
        )} of the total score) and ${FORMATTING.contact} formatting points.`,
      "Put an email address, a phone number and one profile link on separate lines directly under your name, without a text box or an image."
    );
  }

  if (facts.experienceWords < LIMITS.experienceWords) {
    add(
      "structure-no-experience",
      "high",
      "No experience section was found",
      `The experience section holds ${facts.experienceWords} words across ${facts.experienceEntryLines} line${
        facts.experienceEntryLines === 1 ? "" : "s"
      }, so ${STRUCTURE.experience} of the 100 structure points are lost and there is nothing for the achievement checks to count.`,
      "Add an Experience heading and list each role as: job title, employer, location, dates — then three to five bullets of what you did and what changed."
    );
  } else if (facts.datedExperience.length === 0) {
    add(
      "structure-undated-experience",
      "high",
      "No dates on any experience entry",
      `0 of ${facts.experienceEntryLines} experience lines contain a year or the word "present", so ${STRUCTURE.dates} structure points and ${FORMATTING.dates} formatting points are lost. ` +
        "Recruiters cannot place the work in time and ATS date fields stay empty.",
      "Add a start and end year to every role, oldest last, with the current role ending in \"present\" (for example: 2021 – present)."
    );
  }

  if (facts.summaryWords < LIMITS.summaryWords) {
    add(
      "structure-no-summary",
      "medium",
      facts.summaryWords > 0 ? `The summary is only ${facts.summaryWords} words` : "No summary section was found",
      `The summary holds ${facts.summaryWords} words across ${facts.headings.length} heading${
        facts.headings.length === 1 ? "" : "s"
      }; it needs at least ${LIMITS.summaryWords}. The section is worth ${STRUCTURE.summary} of the 100 structure points (${totalPoints(
        "structure",
        STRUCTURE.summary
      )} of the total).`,
      "Write three sentences under a Summary heading: what you do, the scale you have worked at, and the result you are known for. Keep it under 70 words."
    );
  }

  if (facts.educationWords === 0 && facts.skillsWords === 0) {
    add(
      "structure-no-education-skills",
      "medium",
      "No education or skills section",
      `Both sections are empty (0 words each) across ${facts.headingCount} heading${facts.headingCount === 1 ? "" : "s"}, so ${STRUCTURE.educationOrSkills} of the 100 structure points are lost. ` +
        "Keyword matching also has no skills line to read.",
      "Add a Skills heading with the tools and methods you actually use, and an Education heading with the qualification, institution and year."
    );
  }

  if (
    facts.headingCount > 0 &&
    facts.contact.email &&
    facts.experienceWords >= LIMITS.experienceWords &&
    facts.datedExperience.length > 0 &&
    facts.summaryWords >= LIMITS.summaryWords &&
    (facts.educationWords > 0 || facts.skillsWords > 0)
  ) {
    add(
      "structure-sound",
      "low",
      "Structure is complete",
      `${facts.headingCount} headings detected, contact details present, ${facts.datedExperience.length} dated experience line${
        facts.datedExperience.length === 1 ? "" : "s"
      }, a ${facts.summaryWords}-word summary and ${facts.educationWords + facts.skillsWords} words of education and skills.`,
      "Nothing to fix here. When you add a role, keep the same heading names and the same date format so the parse stays clean."
    );
  }

  /* --- achievements ------------------------------------------------- */
  if (facts.bulletCount === 0) {
    add(
      "achievements-no-bullets",
      "high",
      "No bullet points were found",
      `0 bullets in ${facts.experienceWords} words of experience text, so the ${ACHIEVEMENTS.quantified}-point quantified bullet check cannot score and ${ACHIEVEMENTS.strongVerbs + ACHIEVEMENTS.outcomes} further achievement points are unreachable.`,
      "Turn each role into three to five bullets that start with a verb and end with a result: what you built or changed, at what scale, and what moved."
    );
  } else {
    const share = pct(facts.quantifiedBullets, facts.bulletCount);
    if (share < 25) {
      add(
        "achievements-unquantified",
        "high",
        `Only ${facts.quantifiedBullets} of ${facts.bulletCount} bullets carry a number`,
        `${share}% of the experience bullets contain a figure. The CV holds ${facts.numbers} numbers in ${facts.docWords} words (${Math.round(
          (facts.numbers / Math.max(1, facts.docWords)) * 1000
        ) / 10} per 100 words), and ${facts.quantifiedBullets} bullet${
          facts.quantifiedBullets === 1 ? "" : "s"
        } of ${facts.bulletCount} is below the 25% the ${ACHIEVEMENTS.quantified}-point check expects.`,
        `Add a scale or an outcome to ${facts.bulletCount - facts.quantifiedBullets} bullets: team size, volume, latency, budget or a percentage change. Use real figures you could defend.`
      );
    } else if (share < 60) {
      add(
        "achievements-partly-quantified",
        "medium",
        `${facts.quantifiedBullets} of ${facts.bulletCount} bullets carry a number`,
        `${share}% of the experience bullets contain a figure, against ${facts.numbers} numbers in ${facts.docWords} words overall. The remaining ${
          facts.bulletCount - facts.quantifiedBullets
        } bullets describe activity without scale.`,
        "Add a figure to the unquantified bullets that describe work you owned rather than work you joined, and leave the supporting bullets as they are."
      );
    }
  }

  if (facts.verbs < 3) {
    add(
      "achievements-few-verbs",
      "medium",
      `Only ${facts.verbs} strong action verb${facts.verbs === 1 ? "" : "s"} in the experience text`,
      `${facts.verbs} of the verbs the scorer looks for (led, built, shipped, reduced, increased, migrated, automated and similar) appear across ${facts.experienceWords} words. The ${ACHIEVEMENTS.strongVerbs}-point verb check needs 10 to score in full.`,
      "Start each bullet with a different verb from that list, in the past tense, and drop openers such as \"Responsible for\" or \"Helped with\"."
    );
  }

  if (!facts.hasOutcomeMetric) {
    add(
      "achievements-no-outcomes",
      "medium",
      "No percentage or money figure in the experience",
      `0 percentages and 0 currency amounts across ${facts.experienceWords} words of experience; the ${ACHIEVEMENTS.outcomes}-point outcome check needs at least one of either.`,
      "Add one measured outcome per role in the form \"from X to Y\": latency, cost, conversion, error rate or headcount. One real figure beats five vague claims."
    );
  } else if (facts.verbs >= 3 && facts.bulletCount > 0 && facts.quantifiedBullets / facts.bulletCount >= 0.6) {
    add(
      "achievements-sound",
      "low",
      "Achievements are quantified",
      `${facts.quantifiedBullets} of ${facts.bulletCount} bullets carry a figure, with ${facts.verbs} strong verbs and ${facts.currency} currency figure${
        facts.currency === 1 ? "" : "s"
      } across ${facts.experienceWords} words.`,
      "Nothing to fix here. For the next role, keep the same pattern: verb, action, measured result."
    );
  }

  /* --- readability --------------------------------------------------- */
  if (facts.unitTotal === 0) {
    add(
      "readability-unmeasurable",
      "high",
      "There is nothing to read",
      `0 sentences and 0 bullets were found in ${facts.cvWords} words, so the ${WEIGHTS.readability}-point readability section scores 0.`,
      "Paste the full CV as text — contact block, summary, every role and its bullets, education and skills — then score again."
    );
  } else if (facts.longUnits > 0) {
    const share = pct(facts.longUnits, facts.unitTotal);
    const severe = facts.longUnits >= 3 || share > 25;
    add(
      "readability-long-sentences",
      severe ? "high" : "medium",
      `${facts.longUnits} of ${facts.unitTotal} sentences run past ${LIMITS.longSentenceWords} words`,
      `${share}% of the ${facts.unitTotal} sentences and bullets are over ${LIMITS.longSentenceWords} words; the longest is ${facts.longestOver30} words and the average is ${facts.averageWords}.`,
      `Split the sentences over ${LIMITS.longSentenceWords} words at their first natural break, starting with the ${facts.longestOver30}-word one. One idea per sentence reads faster in an eight-second scan.`
    );
  } else {
    add(
      "readability-sound",
      "low",
      "Sentence length is readable",
      `${facts.unitTotal} sentences and bullets, average ${facts.averageWords} words, longest ${facts.longestUnit}, none over ${LIMITS.longSentenceWords}.`,
      "Nothing to fix here. Keep new bullets in the same 12–24 word band and the average will hold."
    );
  }

  /* --- formatting ---------------------------------------------------- */
  for (const paragraph of facts.longParagraphs) {
    add(
      "formatting-long-paragraph",
      paragraph.words > 200 ? "high" : "medium",
      `A ${paragraph.words}-word paragraph starts on line ${paragraph.n}`,
      `Line ${paragraph.n} opens a run of ${paragraph.words} words of continuous prose (“${paragraph.quote}”), against the ${LIMITS.longParagraphWords}-word limit. This costs ${FORMATTING.paragraph} formatting points.`,
      "Break that run into bullets of one idea each, or cut it to under 70 words; readers skip paragraphs that fill the page."
    );
  }

  for (const bullet of facts.longBullets) {
    add(
      "formatting-long-bullet",
      bullet.words > 70 ? "high" : "medium",
      `A ${bullet.words}-word bullet on line ${bullet.n}`,
      `Line ${bullet.n} is a single bullet of ${bullet.words} words (“${bullet.quote}”), against the ${LIMITS.longBulletWords}-word limit. This costs ${FORMATTING.bullet} formatting points.`,
      "Split it into two bullets — the action and its result — and delete the clauses that only explain context."
    );
  }

  if (facts.capsCount > 0) {
    add(
      "formatting-all-caps",
      facts.capsCount >= 3 || facts.capsRun >= 3 ? "medium" : "low",
      `${facts.capsCount} line${facts.capsCount === 1 ? "" : "s"} set in full capitals`,
      `Line ${facts.capsFirst} onwards: ${facts.capsCount} lines are capitalised throughout, with a longest run of ${facts.capsRun}. Capitals slow reading and screen readers may spell them out. This costs ${
        facts.capsCount >= 3 || facts.capsRun >= 3 ? FORMATTING.capsBlock : FORMATTING.capsFew
      } formatting points.`,
      "Set those lines in sentence case and keep bold for emphasis; headings in capitals are fine, sentences are not."
    );
  }

  if (facts.pipeLines.length >= 2) {
    add(
      "formatting-tables-columns",
      "high",
      `${facts.pipeLines.length} lines use column separators`,
      `Lines ${facts.pipeLines
        .slice(0, 4)
        .map((row) => row.n)
        .join(", ")} contain two or more pipe characters, which is the shape of a table or a column layout. ATS parsers read those cells out of order. This costs ${FORMATTING.table} formatting points.`,
      "Replace the table with plain lines: one fact per line, no pipes, no tabs, no side-by-side blocks. A single column parses everywhere."
    );
  } else if (facts.tabLines > 0) {
    add(
      "formatting-tables-columns",
      "high",
      `${facts.tabLines} lines are tab-aligned`,
      `${facts.tabLines} lines contain tab characters, which usually means a two-column layout that an ATS will interleave. This costs ${FORMATTING.table} formatting points.`,
      "Remove the tabs and put each column on its own line, one fact per line."
    );
  }

  const layoutRisks =
    (facts.headingCount === 0 ? 1 : 0) +
    (!facts.contact.email && !facts.contact.phone && !facts.contact.link ? 1 : 0) +
    facts.longParagraphs.length +
    facts.longBullets.length +
    facts.capsCount +
    (facts.experienceWords > 0 && facts.datedExperience.length === 0 ? 1 : 0) +
    (facts.pipeLines.length >= 2 || facts.tabLines > 0 ? 1 : 0);

  if (layoutRisks === 0) {
    const separators =
      facts.pipeLines.length === 0 ? "no pipes or tabs" : `${facts.pipeLines.length} line with pipe separators`;
    add(
      "formatting-sound",
      "low",
      "No layout risks in the plain text",
      `0 risks across ${facts.cvWords} words: ${facts.headingCount} headings, a contact block, ${
        facts.longParagraphs.length
      } paragraphs over ${LIMITS.longParagraphWords} words, ${facts.longBullets.length} bullets over ${LIMITS.longBulletWords} words, ${
        facts.capsCount
      } all-caps lines and ${separators}.`,
      "Nothing to fix here. Keep the single-column layout and avoid text boxes and tables in the document you export."
    );
  }

  /* --- too short to score -------------------------------------------- */
  if (facts.cvWords < LIMITS.thinCvWords) {
    add(
      "cv-too-short",
      "high",
      `The CV is only ${facts.cvWords} words`,
      `${facts.cvWords} words across ${facts.blocks.length} block${facts.blocks.length === 1 ? "" : "s"} is below the ${
        LIMITS.thinCvWords
      }-word floor, so the structure, achievement and readability sections all score 0 and the formatting score is capped at ${FORMATTING.thinCvCap}.`,
      "Paste the whole CV as text — contact block, summary, each role with its bullets, education and skills — and score again."
    );
  }

  return sortFindings(findings);
}

function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ *
 * Pass 5 — advice
 * ------------------------------------------------------------------ */

const FALLBACK_ADVICE = Object.freeze({
  keywords:
    "Keyword coverage is the section to watch: it is the one that moves with each posting. Re-score after you tailor rather than editing the CV by hand.",
  structure:
    "Fix the section order once — summary, experience, education, skills — so later tailoring only touches wording, not layout.",
  achievements:
    "Add one more measured outcome to your most recent role: a scale, a percentage change or a saving, in the form \"from X to Y\".",
  readability:
    "Read the two longest bullets aloud; if you run out of breath, split them. That is the whole readability fix.",
  formatting:
    "Export the CV to plain text once and check it still reads in order: that is exactly what the ATS receives.",
});

function buildAdvice(findings, points) {
  const seen = new Set();
  const advice = [];
  for (const finding of findings) {
    if (finding.severity === "low") continue;
    if (seen.has(finding.fix)) continue;
    seen.add(finding.fix);
    advice.push(finding.fix);
    if (advice.length >= 6) break;
  }
  if (advice.length) return advice;

  const weakest = Object.entries(points).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0];
  return [
    `No section is below the pass mark; the weakest is ${weakest[0]} at ${weakest[1]} of 100. ${
      FALLBACK_ADVICE[weakest[0]] ?? FALLBACK_ADVICE.structure
    }`,
  ];
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Score one CV against one job description.
 * @param {{ cvText?: string, jobText?: string, profile?: object }} input
 * @returns {{
 *   score: number,
 *   subscores: { keywords: number, structure: number, achievements: number, readability: number, formatting: number },
 *   keywordCoverage: { matched: string[], missing: string[], ratio: number },
 *   findings: { id: string, severity: 'high'|'medium'|'low', title: string, detail: string, fix: string }[],
 *   advice: string[]
 * }}
 */
export function scoreCv({ cvText, jobText, profile } = {}) {
  const ctx = buildContext(cvText, jobText, profile);
  const facts = measure(ctx);

  const coverage = keywordCoverage(ctx.cv, ctx.job, { limit: LIMITS.keywordLimit });
  const keywordTotal = coverage.matched.length + coverage.missing.length;
  const keywordsMeasured = keywordTotal > 0;

  const rest = grade(facts);

  // With no job keywords there is nothing to measure. The keyword section is set
  // to the weighted average of the other four, which is exactly what
  // redistributing the 35 points over the measurable sections produces, so the
  // published weights stay fixed and the total stays on the 0–100 scale.
  let keywords;
  if (keywordsMeasured) keywords = clamp(coverage.ratio);
  else {
    const weighted =
      rest.structure * WEIGHTS.structure +
      rest.achievements * WEIGHTS.achievements +
      rest.readability * WEIGHTS.readability +
      rest.formatting * WEIGHTS.formatting;
    const measuredWeight = MAX_TOTAL_WEIGHT - WEIGHTS.keywords;
    keywords = clamp(weighted / measuredWeight);
  }

  const subscores = {
    keywords,
    structure: clamp(rest.structure),
    achievements: clamp(rest.achievements),
    readability: clamp(rest.readability),
    formatting: clamp(rest.formatting),
  };

  const score = clamp(
    (subscores.keywords * WEIGHTS.keywords +
      subscores.structure * WEIGHTS.structure +
      subscores.achievements * WEIGHTS.achievements +
      subscores.readability * WEIGHTS.readability +
      subscores.formatting * WEIGHTS.formatting) /
      MAX_TOTAL_WEIGHT
  );

  const rawFindings = buildFindings(facts, subscores, coverage, keywordsMeasured, {
    job: ctx.job,
    experienceText: sectionText(ctx.sections.experience),
    experienceWords: facts.experienceWords,
  });

  // A CV this thin has one cause, not eight: keep the finding that explains the
  // score and drop the ones that only restate it.
  const findings =
    facts.cvWords < LIMITS.thinCvWords
      ? rawFindings.filter(
          (finding) =>
            finding.id === "cv-too-short" || finding.id.startsWith("keywords-") || finding.id === "no-job-description"
        )
      : rawFindings;

  return {
    score,
    subscores,
    keywordCoverage: {
      matched: coverage.matched.slice(),
      missing: coverage.missing.slice(),
      ratio: coverage.ratio,
    },
    findings,
    advice: buildAdvice(findings, subscores),
  };
}
