import assert from "node:assert/strict";
import test from "node:test";

import { segmentSections } from "../cv/extract.js";
import {
  CONNECTORS,
  connectorById,
  ingest,
  mergeProfiles,
  profileFilenameStem,
  profileToCvText,
  normaliseProfile,
} from "./index.js";
import { emptyProfile, isLinkedInProfileText, parseLinkedInProfile } from "./linkedin.js";

/* ------------------------------------------------------------------------- *
 * Fixtures
 * ------------------------------------------------------------------------- */

/** A complete profile as the clipboard copy lays it out. */
const FULL_PROFILE = [
  "Ada Lovelace",
  "Senior Data Engineer at Analytical Engines",
  "London, England, United Kingdom",
  "",
  "Contact",
  "ada@example.com",
  "linkedin.com/in/ada",
  "+44 20 7946 0000",
  "",
  "Top Skills",
  "Data Pipelines",
  "SQL",
  "Python",
  "",
  "Languages",
  "English (Native or bilingual)",
  "French (Professional working)",
  "",
  "Certifications",
  "AWS Certified Data Analytics – Specialty",
  "Amazon Web Services",
  "Issued Jan 2023",
  "",
  "Experience",
  "Senior Data Engineer",
  "Analytical Engines Ltd · Full-time",
  "Jan 2019 - Present · 5 yrs",
  "London, England, United Kingdom",
  "• Built 12 pipelines processing 4 million events a day.",
  "• Cut warehouse costs by 35%.",
  "• Mentored 4 engineers.",
  "",
  "Data Engineer",
  "Babbage & Co · Full-time",
  "2016 - 2019 · 3 yrs",
  "London, England, United Kingdom",
  "• Built 4 analysis pipelines processing 1200 records per hour.",
  "",
  "Show all 5 experiences",
  "",
  "Education",
  "University of London",
  "BSc Mathematics",
  "2008 - 2011",
  "First Class Honours",
].join("\n");

/** No Education and no Top Skills: the two most commonly missing sections. */
const PARTIAL_PROFILE = [
  "Grace Hopper",
  "Rear Admiral and Computer Scientist",
  "Arlington, Virginia, United States",
  "",
  "Contact",
  "grace@example.com",
  "linkedin.com/in/gracehopper",
  "",
  "Languages",
  "English (Native or bilingual)",
  "",
  "Certifications",
  "CompTIA Security+",
  "CompTIA",
  "Issued Mar 2020",
  "",
  "Experience",
  "Computer Scientist",
  "US Navy · Full-time",
  "1944 - 1969 · 25 yrs",
  "Arlington, Virginia, United States",
  "• Invented the first compiler.",
].join("\n");

/** A CV, not a profile: same shared headings, none of LinkedIn's own. */
const PLAIN_CV = [
  "Ada Lovelace",
  "ada@example.com · +44 20 7946 0000",
  "",
  "PROFESSIONAL SUMMARY",
  "Analyst and programmer with 12 years of experience building calculation engines.",
  "",
  "EXPERIENCE",
  "Senior Programmer — Analytical Engines Ltd",
  "2019 – 2023",
  "- Rewrote the difference engine control loop, cutting defect reports by 62%.",
  "- Led a team of 7 engineers.",
  "",
  "EDUCATION",
  "BSc Mathematics — University of London",
  "2008 – 2011",
  "",
  "SKILLS",
  "JavaScript, SQL, technical writing",
].join("\n");

/** Bullet noise, the "Show all" chrome, and a section the shape has no field for. */
const NOISY_PROFILE = [
  "Ada Lovelace",
  "Programmer",
  "London, England, United Kingdom",
  "",
  "Contact",
  "ada@example.com",
  "",
  "About",
  "Programmer and mathematician. Wrote the first published algorithm for the Analytical Engine.",
  "",
  "Top Skills",
  "- Analytical Engines",
  "‣ Difference Engines",
  "· Notation",
  "",
  "Experience",
  "Programmer",
  "Analytical Engines Ltd · Full-time",
  "2019 - Present · 5 yrs",
  "London, England, United Kingdom",
  "– Wrote the first algorithm.",
  "— Documented 100% of the runtime API.",
  "· Trained 3 analysts.",
  "",
  "Show all 12 skills",
  "",
  "Projects",
  "Difference Engine API",
  "Public API for the engine.",
].join("\n");

/* ------------------------------------------------------------------------- *
 * A realistic, complete profile
 * ------------------------------------------------------------------------- */

test("parses every field of a complete profile", () => {
  const profile = parseLinkedInProfile(FULL_PROFILE);

  assert.equal(profile.name, "Ada Lovelace");
  assert.equal(profile.headline, "Senior Data Engineer at Analytical Engines");
  assert.equal(profile.location, "London, England, United Kingdom");
  assert.equal(profile.about, null);

  assert.deepEqual(profile.contact, {
    email: "ada@example.com",
    phone: "+44 20 7946 0000",
    url: "linkedin.com/in/ada",
  });

  assert.equal(profile.experience.length, 2);
  assert.deepEqual(profile.experience[0], {
    title: "Senior Data Engineer",
    company: "Analytical Engines Ltd",
    dates: "Jan 2019 - Present",
    location: "London, England, United Kingdom",
    bullets: [
      "Built 12 pipelines processing 4 million events a day.",
      "Cut warehouse costs by 35%.",
      "Mentored 4 engineers.",
    ],
  });
  assert.equal(profile.experience[1].title, "Data Engineer");
  assert.equal(profile.experience[1].company, "Babbage & Co");
  assert.equal(profile.experience[1].dates, "2016 - 2019");

  assert.deepEqual(profile.education, [
    { school: "University of London", degree: "BSc Mathematics", dates: "2008 - 2011", details: "First Class Honours" },
  ]);

  assert.deepEqual(profile.skills, ["Data Pipelines", "SQL", "Python"]);
  assert.deepEqual(profile.languages, ["English (Native or bilingual)", "French (Professional working)"]);
  assert.deepEqual(profile.certifications, [
    { name: "AWS Certified Data Analytics – Specialty", issuer: "Amazon Web Services", date: "Jan 2023" },
  ]);
});

test("reports the sections it found, in document order", () => {
  const profile = parseLinkedInProfile(FULL_PROFILE);
  assert.deepEqual(profile.detectedSections, [
    "Contact",
    "Top Skills",
    "Languages",
    "Certifications",
    "Experience",
    "Education",
  ]);
  assert.deepEqual(profile.warnings, []);
  assert.ok(profile.confidence >= 0.8, `confidence was ${profile.confidence}`);
  assert.ok(profile.confidence <= 1);
});

test("drops the 'Show all N experiences' control line", () => {
  const profile = parseLinkedInProfile(FULL_PROFILE);
  const serialised = JSON.stringify(profile);
  assert.ok(!/show all/i.test(serialised));
  assert.equal(profile.experience.length, 2);
});

/* ------------------------------------------------------------------------- *
 * A partial profile
 * ------------------------------------------------------------------------- */

test("returns what exists for a partial profile and explains the gaps", () => {
  const profile = parseLinkedInProfile(PARTIAL_PROFILE);

  assert.equal(profile.name, "Grace Hopper");
  assert.equal(profile.experience.length, 1);
  assert.equal(profile.experience[0].company, "US Navy");
  assert.deepEqual(profile.education, []);
  assert.deepEqual(profile.skills, []);
  assert.deepEqual(profile.languages, ["English (Native or bilingual)"]);
  assert.equal(profile.certifications[0].issuer, "CompTIA");
  assert.equal(profile.certifications[0].date, "Mar 2020");

  assert.ok(profile.warnings.some((warning) => /EDUCATION/.test(warning)), profile.warnings.join(" | "));
  assert.ok(profile.warnings.some((warning) => /TOP SKILLS/.test(warning)), profile.warnings.join(" | "));
  assert.ok(!profile.warnings.some((warning) => /EXPERIENCE section/.test(warning)));
  assert.ok(!profile.warnings.some((warning) => /CONTACT/.test(warning)));
});

test("confidence orders complete above partial above plain CV", () => {
  const full = parseLinkedInProfile(FULL_PROFILE).confidence;
  const partial = parseLinkedInProfile(PARTIAL_PROFILE).confidence;
  const plain = parseLinkedInProfile(PLAIN_CV).confidence;

  assert.ok(full > partial, `${full} should exceed ${partial}`);
  assert.ok(partial > plain, `${partial} should exceed ${plain}`);
  assert.ok(plain < 0.3, `plain CV confidence was ${plain}`);
  assert.ok(partial >= 0.3 && partial <= 0.7, `partial confidence was ${partial}`);
});

/* ------------------------------------------------------------------------- *
 * A plain CV
 * ------------------------------------------------------------------------- */

test("reads a plain CV but says it does not look like a profile", () => {
  const profile = parseLinkedInProfile(PLAIN_CV);

  assert.equal(profile.name, "Ada Lovelace");
  assert.equal(profile.contact.email, "ada@example.com");
  assert.equal(profile.contact.phone, "+44 20 7946 0000");
  assert.ok(profile.confidence < 0.3);
  assert.ok(
    profile.warnings.some((warning) => /does not look like a LinkedIn profile/i.test(warning)),
    profile.warnings.join(" | ")
  );

  // The shared sections are still read, so a CV import is not wasted.
  assert.equal(profile.experience.length, 1);
  assert.equal(profile.experience[0].title, "Senior Programmer");
  assert.equal(profile.experience[0].company, "Analytical Engines Ltd");
  assert.equal(profile.experience[0].bullets.length, 2);
  assert.equal(profile.education[0].school, "University of London");
  assert.deepEqual(profile.skills, ["JavaScript", "SQL", "technical writing"]);
  assert.ok(profile.detectedSections.includes("About"));
});

/* ------------------------------------------------------------------------- *
 * Bullet noise
 * ------------------------------------------------------------------------- */

test("strips every bullet character LinkedIn and Word produce", () => {
  const profile = parseLinkedInProfile(NOISY_PROFILE);
  assert.deepEqual(profile.experience[0].bullets, [
    "Wrote the first algorithm.",
    "Documented 100% of the runtime API.",
    "Trained 3 analysts.",
  ]);
  assert.deepEqual(profile.skills, ["Analytical Engines", "Difference Engines", "Notation"]);
  assert.ok(!/show all/i.test(JSON.stringify(profile)));
  assert.equal(profile.about, "Programmer and mathematician. Wrote the first published algorithm for the Analytical Engine.");
  assert.ok(profile.confidence > 0.3);
});

test("names an unmapped section instead of losing it silently", () => {
  const profile = parseLinkedInProfile(NOISY_PROFILE);
  assert.ok(profile.detectedSections.includes("Projects"));
  assert.ok(profile.warnings.some((warning) => /recognised but not imported: Projects/.test(warning)));
});

test("a description line without a marker or a full stop stays a bullet, not a role", () => {
  const text = [
    "Experience",
    "Programmer",
    "Analytical Engines Ltd · Full-time",
    "2019 - Present · 5 yrs",
    "London, England, United Kingdom",
    "Built pipelines for the difference engine",
    "Managed the punch-card archive",
    "",
    "Education",
    "University of London",
    "BSc Mathematics",
    "2008 - 2011",
  ].join("\n");

  const profile = parseLinkedInProfile(text);
  assert.equal(profile.experience.length, 1);
  assert.deepEqual(profile.experience[0].bullets, [
    "Built pipelines for the difference engine",
    "Managed the punch-card archive",
  ]);
  assert.equal(profile.education[0].school, "University of London");
});

/* ------------------------------------------------------------------------- *
 * Empty and junk input
 * ------------------------------------------------------------------------- */

test("returns an empty profile for empty text rather than throwing", () => {
  for (const value of ["", "   \n\n \t ", null, undefined]) {
    const profile = parseLinkedInProfile(value);
    assert.deepEqual(profile, { ...emptyProfile(), warnings: ["The text was empty, so nothing was imported."] });
  }
});

test("never throws on junk that is not a profile at all", () => {
  const profile = parseLinkedInProfile("@@@\n\n---\n\n12345");
  assert.equal(profile.name, null);
  assert.equal(profile.confidence, 0);
  assert.ok(profile.warnings.length > 0);
  assert.deepEqual(profile.experience, []);
});

/* ------------------------------------------------------------------------- *
 * isLinkedInProfileText
 * ------------------------------------------------------------------------- */

test("isLinkedInProfileText separates profiles from CVs and empty text", () => {
  assert.equal(isLinkedInProfileText(FULL_PROFILE), true);
  assert.equal(isLinkedInProfileText(PARTIAL_PROFILE), true);
  assert.equal(isLinkedInProfileText(NOISY_PROFILE), true);
  assert.equal(isLinkedInProfileText(PLAIN_CV), false);
  assert.equal(isLinkedInProfileText(""), false);
  assert.equal(isLinkedInProfileText(null), false);
  assert.equal(isLinkedInProfileText("Ada Lovelace\nSenior Engineer\nLondon, England"), false);
});

test("a CONTACT and TOP SKILLS pair is enough on its own", () => {
  const pair = ["Ada Lovelace", "Contact", "ada@example.com", "Top Skills", "SQL"].join("\n");
  assert.equal(isLinkedInProfileText(pair), true);
});

/* ------------------------------------------------------------------------- *
 * mergeProfiles
 * ------------------------------------------------------------------------- */

test("mergeProfiles lets incoming values win and keeps what only the base knows", () => {
  const base = {
    name: "Ada",
    location: "London",
    contact: { email: "old@example.com", phone: null, url: null },
    warnings: ["base warning"],
  };
  const incoming = {
    name: "Ada Lovelace",
    headline: "Senior Data Engineer",
    contact: { email: "new@example.com", phone: "+44 20 7946 0000", url: "linkedin.com/in/ada" },
    warnings: ["incoming warning"],
  };

  const merged = mergeProfiles(base, incoming);
  assert.equal(merged.name, "Ada Lovelace");
  assert.equal(merged.headline, "Senior Data Engineer");
  assert.equal(merged.location, "London");
  assert.equal(merged.contact.email, "new@example.com");
  assert.equal(merged.contact.phone, "+44 20 7946 0000");
  assert.deepEqual(merged.warnings, ["base warning", "incoming warning"]);
});

test("mergeProfiles de-duplicates experience by title and company", () => {
  const base = {
    experience: [
      { title: "Senior Data Engineer", company: "Analytical Engines Ltd", dates: "2019 – 2023", bullets: ["old"] },
      { title: "Data Engineer", company: "Babbage & Co", bullets: ["kept"] },
    ],
  };
  const incoming = {
    experience: [
      { title: "senior data engineer", company: "analytical engines ltd", bullets: ["new one", "new two"] },
      { title: "Lead Engineer", company: "Difference Ltd", bullets: ["added"] },
    ],
  };

  const merged = mergeProfiles(base, incoming);
  assert.equal(merged.experience.length, 3);
  assert.equal(merged.experience[0].title, "senior data engineer");
  assert.deepEqual(merged.experience[0].bullets, ["new one", "new two"]);
  assert.equal(merged.experience[0].dates, "2019 – 2023");
  assert.equal(merged.experience[1].title, "Data Engineer");
  assert.equal(merged.experience[2].title, "Lead Engineer");
});

test("mergeProfiles de-duplicates education by school and degree and unions skills case-insensitively", () => {
  const merged = mergeProfiles(
    {
      education: [{ school: "University of London", degree: "BSc Mathematics", dates: "2008 – 2011" }],
      skills: ["SQL", "Python", "c++"],
    },
    {
      education: [{ school: "university of london", degree: "bsc mathematics", details: "First Class" }],
      skills: ["PyThOn", "dbt", "SQL"],
    }
  );

  assert.equal(merged.education.length, 1);
  assert.equal(merged.education[0].details, "First Class");
  assert.equal(merged.education[0].dates, "2008 – 2011");
  assert.deepEqual(merged.skills, ["SQL", "Python", "c++", "dbt"]);
});

test("mergeProfiles does not mutate its arguments and tolerates nulls", () => {
  const base = { name: "Ada", experience: [{ title: "Engineer", company: "Acme" }], skills: ["SQL"] };
  const snapshot = JSON.stringify(base);
  mergeProfiles(base, { name: "Ada Lovelace" });
  assert.equal(JSON.stringify(base), snapshot);

  assert.equal(mergeProfiles(null, null).name, null);
  assert.deepEqual(mergeProfiles(null, null).experience, []);
  assert.equal(mergeProfiles(undefined, { name: "Grace" }).name, "Grace");
});

test("mergeProfiles keeps the stronger confidence score", () => {
  const merged = mergeProfiles({ confidence: 0.2 }, { confidence: 0.9 });
  assert.equal(merged.confidence, 0.9);
  assert.equal(mergeProfiles({ confidence: 0.9 }, {}).confidence, 0.9);
});

/* ------------------------------------------------------------------------- *
 * profileToCvText
 * ------------------------------------------------------------------------- */

test("profileToCvText writes a CV with the name, roles and bullets", () => {
  const profile = parseLinkedInProfile(FULL_PROFILE);
  const cvText = profileToCvText(profile);

  assert.ok(cvText.startsWith("Ada Lovelace\n"), cvText.slice(0, 40));
  assert.ok(cvText.includes("Senior Data Engineer"));
  assert.ok(cvText.includes("Analytical Engines Ltd"));
  assert.ok(cvText.includes("University of London"));
  assert.ok(cvText.includes("Data Pipelines, SQL, Python"));
  assert.ok(cvText.includes("AWS Certified Data Analytics – Specialty — Amazon Web Services (Jan 2023)"));

  const bullets = cvText.split("\n").filter((line) => line.startsWith("- "));
  assert.ok(bullets.length >= 2, `found ${bullets.length} bullets`);
  assert.ok(bullets.some((line) => line.includes("Cut warehouse costs by 35%.")));
});

test("profileToCvText survives the CV segmenter and keeps every section", () => {
  const cvText = profileToCvText(parseLinkedInProfile(FULL_PROFILE));
  const segmented = segmentSections(cvText);

  assert.equal(segmented.contact.name, "Ada Lovelace");
  assert.equal(segmented.contact.email, "ada@example.com");
  assert.equal(segmented.contact.phone, "+44 20 7946 0000");
  assert.ok(segmented.sections.experience.includes("Analytical Engines Ltd"));
  assert.ok(segmented.sections.experience.includes("Babbage & Co"));
  assert.equal(segmented.sections.experience.split("\n").filter((line) => line.startsWith("- ")).length, 4);
  assert.ok(segmented.sections.education.includes("University of London"));
  assert.ok(segmented.sections.summary.includes("Senior Data Engineer at Analytical Engines"));
  assert.equal(segmented.sections.skills, "Data Pipelines, SQL, Python");
});

test("profileToCvText returns nothing for an empty profile", () => {
  assert.equal(profileToCvText(null), "");
  assert.equal(profileToCvText({}), "");
  assert.equal(profileToCvText(emptyProfile()), "");
});

test("profileToCvText uses the about text for the summary when present", () => {
  const cvText = profileToCvText(parseLinkedInProfile(NOISY_PROFILE));
  assert.ok(cvText.includes("SUMMARY\nProgrammer and mathematician."));
  assert.ok(!/SUMMARY\nProgrammer\n/.test(cvText));
});

/* ------------------------------------------------------------------------- *
 * ingest
 * ------------------------------------------------------------------------- */

test("the registry lists the connectors the product actually offers", () => {
  assert.deepEqual(
    CONNECTORS.map((connector) => connector.id),
    ["linkedin-paste", "linkedin-export", "cv-file", "profile-manual", "job-paste", "job-link"]
  );
  for (const connector of CONNECTORS) {
    assert.equal(connector.requiresUserAction, true, connector.id);
    assert.ok(connector.name && connector.description && connector.notes, connector.id);
    assert.ok(Array.isArray(connector.accepts) && connector.accepts.length > 0, connector.id);
    assert.ok(["profile", "cv", "job"].includes(connector.kind), connector.id);
    assert.ok(!("oauth" in connector) && !("authorize" in connector), connector.id);
  }
  assert.equal(connectorById("linkedin-paste").kind, "profile");
  assert.equal(connectorById("nope"), undefined);
});

test("the LinkedIn connectors say plainly that nothing is fetched", () => {
  const paste = connectorById("linkedin-paste");
  assert.match(paste.notes, /never fetches/);
  assert.match(paste.notes, /not an OAuth integration/);
  assert.match(connectorById("linkedin-export").notes, /cv\/extract\.js/);
});

test("ingest routes a pasted profile through the LinkedIn parser", () => {
  const result = ingest("linkedin-paste", { text: FULL_PROFILE });
  assert.equal(result.connector.id, "linkedin-paste");
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.deepEqual(result.warnings, []);
  assert.equal(result.error, undefined);
});

test("ingest treats the PDF export text the same way and flags text that is not a profile", () => {
  const exported = ingest("linkedin-export", { text: FULL_PROFILE });
  assert.equal(exported.profile.experience.length, 2);

  const notAProfile = ingest("linkedin-export", { text: PLAIN_CV });
  assert.equal(notAProfile.connector.id, "linkedin-export");
  assert.ok(notAProfile.profile.warnings.some((warning) => /section headings/.test(warning)));
});

test("ingest throws for an unknown connector id", () => {
  assert.throws(() => ingest("linkedin-oauth", {}), /Unknown connector "linkedin-oauth"/);
  assert.throws(() => ingest(undefined, {}), /Unknown connector/);
});

test("ingest returns an error object, not an exception, for unparseable input", () => {
  const empty = ingest("linkedin-paste", {});
  assert.match(empty.error, /No profile text/);
  assert.equal(empty.profile, undefined);
  assert.equal(empty.connector.id, "linkedin-paste");

  const emptyCv = ingest("cv-file", {});
  assert.match(emptyCv.error, /No CV text/);

  const bytesOnly = ingest("cv-file", { buffer: Buffer.from("PK"), filename: "cv.docx" });
  assert.match(bytesOnly.error, /cv\/extract\.js/);
});

test("ingest reads a CV through cv/extract.js segmentation", () => {
  const result = ingest("cv-file", { text: PLAIN_CV });
  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(result.profile.experience.length, 1);
  assert.equal(result.profile.education.length, 1);
  assert.deepEqual(result.profile.skills, ["JavaScript", "SQL", "technical writing"]);
  assert.equal(result.connector.id, "cv-file");
});

test("ingest normalises a typed profile and rejects an empty one", () => {
  const typed = ingest("profile-manual", {
    profile: { name: "Ada Lovelace", skills: ["SQL"], experience: [{ title: "Programmer", company: "Acme" }] },
  });
  assert.equal(typed.profile.name, "Ada Lovelace");
  assert.deepEqual(typed.profile.skills, ["SQL"]);
  assert.equal(typed.profile.experience[0].title, "Programmer");

  assert.match(ingest("profile-manual", { profile: {} }).error, /empty/);
  assert.match(ingest("profile-manual", {}).error, /expects \{ profile \}/);
});

test("ingest hands job material on without pretending it is a profile", () => {
  const pasted = ingest("job-paste", { text: "Senior Data Engineer at Acme" });
  assert.equal(pasted.profile, null);
  assert.equal(pasted.jobText, "Senior Data Engineer at Acme");

  const linked = ingest("job-link", { url: "https://boards.greenhouse.io/acme/jobs/1" });
  assert.equal(linked.profile, null);
  assert.equal(linked.connector.id, "job-link");
  assert.equal(linked.jobUrl, "https://boards.greenhouse.io/acme/jobs/1");
  assert.ok(linked.captureSource);

  assert.match(ingest("job-link", { url: "javascript:alert(1)" }).error, /not an http or https address/);
  assert.match(ingest("job-paste", {}).error, /No job description/);
});

/* ------------------------------------------------------------------------- *
 * Supporting helpers
 * ------------------------------------------------------------------------- */

test("normaliseProfile fills every field and never invents content", () => {
  const profile = normaliseProfile({ full_name: "Grace Hopper", summary: "Computer scientist." });
  assert.deepEqual(profile, {
    ...emptyProfile(),
    name: "Grace Hopper",
    about: "Computer scientist.",
  });
  assert.equal(normaliseProfile("not an object").name, null);
});

test("normaliseProfile reads a contact link given as a string or a list", () => {
  assert.equal(normaliseProfile({ contact: { links: "linkedin.com/in/ada" } }).contact.url, "linkedin.com/in/ada");
  assert.equal(
    normaliseProfile({ contact: { links: ["github.com/ada", "x.com/ada"] } }).contact.url,
    "github.com/ada"
  );
});

test("profileFilenameStem is filesystem-safe", () => {
  assert.equal(profileFilenameStem({ name: "Ada Lovelace" }), "ada-lovelace");
  assert.equal(profileFilenameStem({}), "profile");
  assert.equal(profileFilenameStem({ name: "../../etc/passwd" }), "etc-passwd");
});
