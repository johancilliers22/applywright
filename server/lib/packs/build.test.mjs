import test from "node:test";
import assert from "node:assert/strict";

import { buildPack } from "./build.js";
import { slugify } from "../text.js";

/* ------------------------------------------------------------------------- *
 * Fixtures
 * ------------------------------------------------------------------------- */

const CV_TEXT = [
  "Ada Lovelace",
  "ada@example.com · +44 20 7946 0000",
  "linkedin.com/in/ada",
  "",
  "SUMMARY",
  "Analyst and programmer with 12 years of experience building calculation engines. Reduced error rates by 35% across 3 teams.",
  "",
  "EXPERIENCE",
  "Senior Programmer — Analytical Engines Ltd",
  "London · 2019 – 2023",
  "- Rewrote the difference engine control loop, cutting defect reports by 62%.",
  "- Led a team of 7 engineers and delivered the 1843 printing press integration on a £2.4m budget.",
  "- Documented 100% of the runtime API.",
  "",
  "Programmer — Babbage & Co",
  "2016 – 2019",
  "- Built 4 analysis pipelines processing 1200 records per hour.",
  "",
  "EDUCATION",
  "BSc Mathematics — University of London",
  "2008 – 2011",
  "",
  "SKILLS",
  "JavaScript, Node.js, SQL, technical writing",
].join("\n");

const JOB = {
  source: "fixture",
  external_id: "job-1",
  title: "Senior Programmer",
  company: "Analytical Engines Ltd",
  location: "London",
  remote: 0,
  url: "https://example.com/jobs/1",
  description: "Node.js, SQL, technical writing. Build calculation engines.",
};

const PROFILE = {
  contact: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+44 20 7946 0000",
    location: "London",
    links: ["linkedin.com/in/ada"],
  },
};

const TAILORED = {
  summary:
    "Programmer with 12 years building calculation engines and cutting defect rates by 35% across 3 teams.",
  bullets: [
    {
      section: "experience",
      original: "Rewrote the difference engine control loop, cutting defect reports by 62%.",
      rewritten: "Rebuilt the difference engine control loop, cutting defect reports by 62%.",
      evidence: "Rewrote the difference engine control loop, cutting defect reports by 62%.",
    },
  ],
  keywordsPlaced: ["node.js", "sql"],
  coverLetter:
    "Dear Hiring Manager,\n\nI am applying for the Senior Programmer role. I have spent 12 years on calculation engines.\n",
  screening: {
    motivation: "The team builds calculation engines, which is the work I have done for 12 years.",
    noticePeriod: "One month.",
    rightToWork: "Yes, I have the right to work in the United Kingdom.",
    salaryExpectation: "£65,000 to £75,000, depending on the package.",
  },
  warnings: [],
  mode: "rules",
};

const build = (overrides = {}) =>
  buildPack({ profile: PROFILE, cvText: CV_TEXT, job: JOB, tailored: TAILORED, ...overrides });

const numberTokens = (text) => new Set(String(text).match(/\d+(?:[.,]\d+)?/g) ?? []);

/* ------------------------------------------------------------------------- *
 * Contract shape
 * ------------------------------------------------------------------------- */

test("returns the five contract fields with the right types", () => {
  const pack = build();

  assert.deepEqual(Object.keys(pack).sort(), [
    "answers",
    "coverLetterMd",
    "cvHtml",
    "cvTextPlain",
    "filenameBase",
  ]);
  assert.equal(typeof pack.cvHtml, "string");
  assert.equal(typeof pack.cvTextPlain, "string");
  assert.equal(typeof pack.coverLetterMd, "string");
  assert.ok(Array.isArray(pack.answers));
  assert.equal(typeof pack.filenameBase, "string");
  assert.ok(pack.cvHtml.length > 1000);
  assert.ok(pack.cvTextPlain.includes("Ada Lovelace"));
});

test("is deterministic: the same input gives byte-identical output", () => {
  const first = build();
  const second = build();
  assert.deepEqual(first, second);
  assert.equal(first.cvHtml, second.cvHtml);
  assert.equal(first.cvTextPlain, second.cvTextPlain);
  assert.equal(first.coverLetterMd, second.coverLetterMd);
  assert.equal(first.filenameBase, second.filenameBase);
});

/* ------------------------------------------------------------------------- *
 * The document
 * ------------------------------------------------------------------------- */

test("cvHtml is a complete standalone A4 print document", () => {
  const html = build().cvHtml;

  assert.match(html, /^<!DOCTYPE html>\n<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<title>Ada Lovelace — CV<\/title>/);

  // Print CSS is inline and sets the page up for A4 with 18mm margins.
  assert.match(html, /<style>[\s\S]*@page\s*\{[\s\S]*size:\s*A4;/);
  assert.match(html, /@page\s*\{[\s\S]*margin:\s*18mm;/);
  assert.match(html, /@media print/);

  // Body size inside the required 10.5-11pt band.
  const bodySize = html.match(/font-size:\s*([\d.]+)pt/);
  assert.ok(bodySize, "a pt font size is declared");
  const sizes = [...html.matchAll(/font-size:\s*([\d.]+)pt/g)].map((row) => Number(row[1]));
  assert.ok(sizes.every((size) => size >= 10 && size <= 18), "no absurd type sizes");
  assert.ok(sizes.includes(10.5), "10.5pt body");
  assert.ok(sizes.every((size) => size <= 18), "nothing larger than the name");

  // System font stack, no web fonts.
  assert.match(html, /font-family:\s*"Segoe UI Variable Text"/);
  assert.doesNotMatch(html, /@font-face/i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /url\(/i);

  // Real headings, single column, nothing fetched from anywhere.
  assert.match(html, /<h1>Ada Lovelace<\/h1>/);
  assert.match(html, /<h2>SUMMARY<\/h2>/);
  assert.match(html, /<h2>EXPERIENCE<\/h2>/);
  assert.match(html, /<h3>Senior Programmer — Analytical Engines Ltd<\/h3>/);
  assert.doesNotMatch(html, /<table/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<iframe/i);
  assert.doesNotMatch(html, /<svg/i);
  assert.doesNotMatch(html, /<link/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /position:\s*(?:absolute|fixed)/i);
  assert.doesNotMatch(html, /column-count|columns:/i);
  assert.doesNotMatch(html, /float:/i);
});

test("print rules keep a bullet on one page", () => {
  const html = build().cvHtml;
  assert.match(html, /li\s*\{[^}]*break-inside:\s*avoid/);
  assert.match(html, /li\s*\{[^}]*page-break-inside:\s*avoid/);
  assert.match(html, /h2[\s\S]*?break-after:\s*avoid/);
});

test("experience is grouped into role blocks with their own headings", () => {
  const html = build().cvHtml;
  const titles = [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((row) => row[1]);

  assert.deepEqual(titles, [
    "Senior Programmer — Analytical Engines Ltd",
    "Programmer — Babbage &amp; Co",
    "BSc Mathematics — University of London",
  ]);
  assert.equal([...html.matchAll(/<article class="role">/g)].length, 3);
  assert.match(html, /<p class="role-meta">London · 2019 – 2023<\/p>/);

  // The role that opens with bullets rather than a title still gets a block.
  const bullets = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((row) => row[1]);
  assert.equal(bullets.length, 4);
  assert.ok(bullets[0].startsWith("Rebuilt the difference engine control loop"));
});

/* ------------------------------------------------------------------------- *
 * Escaping (the XSS case)
 * ------------------------------------------------------------------------- */

const XSS_CV = [
  "Ada Lovelace",
  "ada@example.com",
  "",
  "EXPERIENCE",
  "Programmer — Engines Ltd",
  "2019 – 2023",
  "- Built <img src=x onerror=alert(1)> dashboards for 4 teams.",
  "",
  "SKILLS",
  "JavaScript",
].join("\n");

test("XSS: a script payload in the company name and markup in an achievement stay inert", () => {
  const pack = buildPack({
    profile: PROFILE,
    cvText: XSS_CV,
    job: { ...JOB, company: "<script>alert(1)</script>" },
    tailored: null,
  });

  // The achievement is present as text, escaped, not as an element.
  assert.ok(pack.cvHtml.includes("&lt;img src=x onerror=alert(1)&gt; dashboards for 4 teams."));
  assert.doesNotMatch(pack.cvHtml, /<img/i);
  assert.doesNotMatch(pack.cvHtml, /<script/i);
  assert.doesNotMatch(pack.cvHtml, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(pack.cvHtml, /<table/i);
  assert.doesNotMatch(pack.cvHtml, /https?:\/\//i);

  // The company name is only used in the letter; it is escaped there too.
  assert.ok(pack.coverLetterMd.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(pack.coverLetterMd, /<script/i);

  // The escaped text is still readable as text when the markup is stripped.
  assert.ok(pack.cvTextPlain.includes("<img src=x onerror=alert(1)> dashboards for 4 teams."));
  assert.ok(pack.cvTextPlain.includes("4 teams"));
});

test("XSS: a payload in the name is escaped in the body and in the title", () => {
  const pack = buildPack({
    profile: {
      contact: {
        name: '<script>alert("x")</script> Ada',
        email: "ada@example.com",
        phone: "+44 20 7946 0000",
      },
    },
    cvText: CV_TEXT,
    job: JOB,
    tailored: null,
  });

  assert.match(pack.cvHtml, /<h1>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; Ada<\/h1>/);
  assert.match(pack.cvHtml, /<title>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; Ada — CV<\/title>/);
  assert.doesNotMatch(pack.cvHtml, /<script/i);
  assert.doesNotMatch(pack.cvHtml, /<h1>[^<]*<script/i);
  // The filename cannot recover the tag either.
  assert.match(pack.filenameBase, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("angle brackets and ampersands in ordinary text are escaped, not dropped", () => {
  const pack = buildPack({
    profile: PROFILE,
    cvText: [
      "EXPERIENCE",
      "Programmer — R&D Ltd",
      "- Cut costs by <15% on 2 pipelines.",
      "- Used C++ & SQL.",
    ].join("\n"),
    job: JOB,
    tailored: null,
  });

  assert.match(pack.cvHtml, /R&amp;D Ltd/);
  assert.match(pack.cvHtml, /Cut costs by &lt;15% on 2 pipelines\./);
  assert.match(pack.cvHtml, /C\+\+ &amp; SQL\./);
  assert.ok(pack.cvTextPlain.includes("Cut costs by <15% on 2 pipelines."));
});

/* ------------------------------------------------------------------------- *
 * Filename
 * ------------------------------------------------------------------------- */

test("filenameBase is a filesystem-safe slug built with slugify", () => {
  const pack = build();
  assert.equal(pack.filenameBase, "ada-lovelace-analytical-engines-ltd-senior-programmer");
  assert.equal(
    pack.filenameBase,
    [
      slugify("Ada Lovelace"),
      slugify("Analytical Engines Ltd"),
      slugify("Senior Programmer"),
    ].join("-")
  );
  assert.match(pack.filenameBase, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("filenameBase survives hostile company and title text", () => {
  const pack = buildPack({
    profile: PROFILE,
    cvText: CV_TEXT,
    job: { title: '../../etc/passwd', company: "Ünïcode <script> Ltd" },
    tailored: null,
  });

  assert.match(pack.filenameBase, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.doesNotMatch(pack.filenameBase, /[^a-z0-9-]/);
  assert.doesNotMatch(pack.filenameBase, /\.\./);
  assert.ok(pack.filenameBase.startsWith("ada-lovelace-"));
  assert.ok(pack.filenameBase.length <= 100);
});

test("filenameBase avoids Windows reserved device names", () => {
  const pack = buildPack({
    profile: { contact: { name: "CON" } },
    cvText: "",
    job: {},
    tailored: null,
  });

  assert.equal(pack.filenameBase, "cv-con");
});

test("filenameBase is bounded for very long names", () => {
  const pack = buildPack({
    profile: { contact: { name: "Ada ".repeat(60) } },
    cvText: "",
    job: { title: "Senior Programmer", company: "Analytical Engines Ltd" },
    tailored: null,
  });

  assert.ok(pack.filenameBase.length <= 100);
  assert.doesNotMatch(pack.filenameBase, /-$/);
});

/* ------------------------------------------------------------------------- *
 * Plain text
 * ------------------------------------------------------------------------- */

test("cvTextPlain keeps every number that was in the source CV", () => {
  const pack = build();
  const source = numberTokens(CV_TEXT);
  const plain = numberTokens(pack.cvTextPlain);

  for (const token of source) {
    assert.ok(plain.has(token), `number ${token} is missing from cvTextPlain`);
  }
  assert.ok(source.size >= 15, "the fixture really does carry a lot of numbers");
});

test("cvTextPlain is plain text: no markup, no CRLF, one trailing newline", () => {
  const pack = build();
  assert.doesNotMatch(pack.cvTextPlain, /<[a-z]/i);
  assert.doesNotMatch(pack.cvTextPlain, /\r/);
  assert.doesNotMatch(pack.cvTextPlain, /&[a-z]+;/);
  assert.ok(pack.cvTextPlain.endsWith("\n"));
  assert.ok(!pack.cvTextPlain.endsWith("\n\n"));
  assert.ok(pack.cvTextPlain.includes("EXPERIENCE"));
  assert.ok(pack.cvTextPlain.includes("- Documented 100% of the runtime API."));
});

test("a number dropped by a tailored summary is put back, never lost", () => {
  const pack = build({
    tailored: {
      ...TAILORED,
      summary: "Programmer building calculation engines for engineering teams.",
      bullets: [],
    },
  });

  const plain = numberTokens(pack.cvTextPlain);
  for (const token of numberTokens(CV_TEXT)) {
    assert.ok(plain.has(token), `number ${token} is missing after tailoring`);
  }
  assert.ok(pack.cvTextPlain.includes("ADDITIONAL DETAIL"));
  assert.ok(pack.cvTextPlain.includes("Reduced error rates by 35% across 3 teams."));
});

/* ------------------------------------------------------------------------- *
 * Tailoring
 * ------------------------------------------------------------------------- */

test("tailored bullets replace their source line and leave the rest alone", () => {
  const pack = build();

  assert.ok(pack.cvTextPlain.includes("Rebuilt the difference engine control loop, cutting defect reports by 62%."));
  assert.ok(!pack.cvTextPlain.includes("Rewrote the difference engine control loop"));
  assert.ok(pack.cvTextPlain.includes("- Documented 100% of the runtime API."));
  assert.ok(pack.cvTextPlain.includes("- Built 4 analysis pipelines processing 1200 records per hour."));
  assert.ok(!pack.cvTextPlain.includes("ADDITIONAL DETAIL"), "a faithful rewrite triggers no appendix");
});

test("a tailored summary replaces the CV summary without inventing a second one", () => {
  const pack = build();
  assert.ok(pack.cvTextPlain.includes("cutting defect rates by 35% across 3 teams"));
  assert.equal([...pack.cvTextPlain.matchAll(/^SUMMARY$/gm)].length, 1);
});

test("keywords are not injected into the skills line", () => {
  const pack = build();
  const skills = pack.cvTextPlain.split("SKILLS")[1];
  assert.ok(skills.includes("JavaScript, Node.js, SQL, technical writing"));
  assert.ok(!skills.includes("mongodb"));
});

/* ------------------------------------------------------------------------- *
 * Covering letter
 * ------------------------------------------------------------------------- */

test("coverLetterMd has a heading, a greeting, a signature and a trailing newline", () => {
  const letter = build().coverLetterMd;

  assert.match(letter, /^# Covering letter: Senior Programmer at Analytical Engines Ltd\n/);
  assert.ok(letter.includes("Dear Hiring Manager,"));
  assert.ok(letter.includes("Yours sincerely,"));
  assert.ok(letter.indexOf("Yours sincerely,") < letter.indexOf("Ada Lovelace"));
  assert.ok(letter.includes("ada@example.com · +44 20 7946 0000"));
  assert.ok(letter.endsWith("\n"));
  assert.ok(!letter.endsWith("\n\n"));
  assert.doesNotMatch(letter, /<script/i);
});

test("a tailored letter keeps its own greeting and is not signed twice", () => {
  const letter = build({
    tailored: {
      ...TAILORED,
      coverLetter: "Dear Selection Panel,\n\nI am writing about the role.\n\nYours,\n\nAda Lovelace\n",
    },
  }).coverLetterMd;

  assert.equal([...letter.matchAll(/Dear /g)].length, 1);
  assert.equal([...letter.matchAll(/Yours sincerely,/g)].length, 0);
  assert.equal([...letter.matchAll(/Ada Lovelace/g)].length, 1);
});

test("without tailoring the letter is still grounded in the CV, not a stub", () => {
  const letter = build({ tailored: null }).coverLetterMd;

  assert.ok(letter.includes("I am applying for the Senior Programmer role at Analytical Engines Ltd."));
  assert.ok(letter.includes("12 years of experience building calculation engines."));
  assert.ok(letter.includes("My CV is attached"));
  assert.ok(letter.includes("Yours sincerely,"));
  assert.ok(!letter.includes("Not provided"));
});

/* ------------------------------------------------------------------------- *
 * Answers
 * ------------------------------------------------------------------------- */

test("answers cover the four screening questions in a fixed order", () => {
  const answers = build().answers;

  assert.deepEqual(
    answers.map((row) => row.question),
    [
      "Why do you want this role?",
      "When could you start?",
      "Do you have the right to work in the country this role is based in?",
      "What are your salary expectations?",
    ]
  );
  assert.equal(answers[1].answer, "One month.");
  assert.equal(answers[2].answer, "Yes, I have the right to work in the United Kingdom.");
  assert.ok(answers[3].answer.includes("£65,000"));
});

test("missing screening answers are honest placeholders, not invented content", () => {
  const pack = build({ tailored: null });
  for (const row of pack.answers) {
    assert.match(row.answer, /^Not provided\./);
    assert.ok(row.answer.includes("before you send this application"));
  }
});

/* ------------------------------------------------------------------------- *
 * Fallbacks and tolerance
 * ------------------------------------------------------------------------- */

test("empty input still produces a usable, honest document", () => {
  const pack = buildPack();

  assert.match(pack.cvHtml, /^<!DOCTYPE html>/);
  assert.match(pack.cvHtml, /<h1>Curriculum Vitae<\/h1>/);
  assert.doesNotMatch(pack.cvHtml, /<h2>/);
  assert.ok(pack.cvTextPlain.includes("Curriculum Vitae"));
  assert.ok(pack.coverLetterMd.includes("Dear Hiring Manager,"));
  assert.equal(pack.filenameBase, "curriculum-vitae");
  assert.equal(pack.answers.length, 4);
});

test("a CV with no headings invents no headings and keeps every line", () => {
  const pack = buildPack({
    profile: { contact: { name: "Ada Lovelace", email: "ada@example.com" } },
    cvText: ["Ada Lovelace", "ada@example.com", "Senior programmer with 12 years of experience.", "Built 4 engines."].join("\n"),
    job: JOB,
    tailored: null,
  });

  assert.doesNotMatch(pack.cvHtml, /<h2>/);
  assert.ok(pack.cvHtml.includes("Senior programmer with 12 years of experience."));
  assert.ok(pack.cvHtml.includes("Built 4 engines."));
  assert.ok(pack.cvTextPlain.includes("Built 4 engines."));
});

test("a name written in capitals is the name, not a section heading", () => {
  const pack = buildPack({
    profile: {},
    cvText: ["CURRICULUM VITAE", "ADA LOVELACE", "ada@example.com", "", "SUMMARY", "Programmer with 12 years of experience."].join("\n"),
    job: JOB,
    tailored: null,
  });

  assert.match(pack.cvHtml, /<h1>ADA LOVELACE<\/h1>/);
  assert.doesNotMatch(pack.cvHtml, /<h2>ADA LOVELACE<\/h2>/);
  assert.doesNotMatch(pack.cvHtml, /<title>CURRICULUM VITAE/);
  assert.equal([...pack.cvHtml.matchAll(/<h2>/g)].length, 1);
  assert.ok(pack.cvTextPlain.includes("Programmer with 12 years of experience."));
});

test("a structured profile supplies the sections when there is no CV text", () => {
  const pack = buildPack({
    profile: {
      contact: { name: "Ada Lovelace", email: "ada@example.com", location: "London" },
      sections: {
        summary: "Programmer with 12 years on calculation engines.",
        experience: [
          {
            title: "Senior Programmer",
            company: "Analytical Engines Ltd",
            location: "London",
            start: "2019",
            end: "2023",
            bullets: ["Cut defect reports by 62%.", "Led a team of 7 engineers."],
          },
        ],
        skills: "JavaScript, SQL",
      },
    },
    cvText: "",
    job: JOB,
    tailored: null,
  });

  assert.match(pack.cvHtml, /<h2>Summary<\/h2>/);
  assert.match(pack.cvHtml, /<h3>Senior Programmer — Analytical Engines Ltd<\/h3>/);
  assert.match(pack.cvHtml, /<p class="role-meta">London · 2019 – 2023<\/p>/);
  assert.equal([...pack.cvHtml.matchAll(/<li>/g)].length, 2);
  assert.ok(pack.cvTextPlain.includes("- Cut defect reports by 62%."));
  assert.ok(pack.cvHtml.includes("ada@example.com"));
});

test("profile contact wins over the CV header without duplicating it", () => {
  const pack = buildPack({
    profile: { contact: { name: "Ada Lovelace", email: "ada@work.example", phone: "+44 20 7946 0000" } },
    cvText: ["Ada Lovelace", "ada@example.com · +44 20 7946 0000", "", "SKILLS", "SQL"].join("\n"),
    job: JOB,
    tailored: null,
  });

  assert.ok(pack.cvHtml.includes("ada@work.example"));
  assert.ok(!pack.cvHtml.includes("ada@example.com"));
  assert.equal([...pack.cvHtml.matchAll(/<p class="contact">/g)].length, 1);
});

test("URL schemes are stripped so the pack holds no external reference", () => {
  const pack = buildPack({
    profile: PROFILE,
    cvText: ["EXPERIENCE", "Programmer — Engines Ltd", "- Portfolio: https://example.com/ada (built 4 sites)."].join("\n"),
    job: JOB,
    tailored: null,
  });

  assert.ok(pack.cvHtml.includes("Portfolio: example.com/ada (built 4 sites)."));
  assert.doesNotMatch(pack.cvHtml, /https?:\/\//i);
  assert.doesNotMatch(pack.cvTextPlain, /https?:\/\//i);
  assert.ok(pack.cvTextPlain.includes("built 4 sites"));
});

test("JSON text is accepted where an object is expected", () => {
  const pack = buildPack({
    profile: JSON.stringify(PROFILE),
    cvText: CV_TEXT,
    job: JOB,
    tailored: null,
  });

  assert.ok(pack.cvHtml.includes("ada@example.com"));
  assert.match(pack.filenameBase, /^ada-lovelace-analytical-engines-ltd-senior-programmer$/);
});

test("tolerance: odd values for tailored and job do not throw", () => {
  for (const tailored of [null, undefined, {}, { bullets: "nope" }, { screening: "nope" }]) {
    for (const job of [null, undefined, {}, { title: 42, company: null }]) {
      const pack = buildPack({ profile: null, cvText: CV_TEXT, job, tailored });
      assert.equal(typeof pack.cvHtml, "string");
      assert.equal(pack.answers.length, 4);
    }
  }
});
