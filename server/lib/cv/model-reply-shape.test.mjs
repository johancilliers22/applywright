/**
 * MODEL-P2 reply-shape source definitions.
 *
 * SOURCE_DEFINITIONS / NOT_RUN under the current Source grant. These cases exercise
 * the existing public `refine` entrypoint with a synthetic in-memory model; they do
 * not import or reimplement the private validator.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { refine } from "./refine.js";

const CV_TEXT = `Ada Whitfield
Leeds, United Kingdom | ada.whitfield@example.com

PROFESSIONAL SUMMARY
Backend engineer with 9 years building Go services and Kubernetes platforms for payments and logistics.

WORK EXPERIENCE
- Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.
- Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.
`;

const LETTER = `Dear Hiring Manager,

I am applying for the Senior Backend Engineer role at Northgate Payments.

Yours sincerely,
Ada Whitfield
`;

const SUMMARY = "Backend engineer with 9 years building Go services and Kubernetes platforms.";
const SUMMARY_FROM_CV = SUMMARY;
const BULLET_0 =
  "Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.";
const BULLET_0_AFTER =
  "Led the migration of 14 payment services from virtual machines onto Kubernetes, cutting deploy time from 45 minutes to 6.";
const BULLET_1 =
  "Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.";
const BULLET_1_AFTER =
  "Reduced cloud spend by £240,000 per year by right-sizing 60 workloads and moving batch jobs to spot instances.";

function makePack({ summary = "", bullets = [], coverLetter = LETTER, cvTextPlain = CV_TEXT } = {}) {
  return {
    cvHtml: "<!DOCTYPE html><html><body><h1>Ada Whitfield</h1></body></html>",
    cvTextPlain,
    coverLetterMd: coverLetter,
    answers: [],
    filenameBase: "ada-whitfield-reply-shape",
    tailored: {
      summary,
      bullets: bullets.map((text) => ({
        original: text,
        rewritten: text,
        section: "experience",
        evidence: "Senior Backend Engineer | Northgate Payments",
      })),
      keywordsPlaced: [],
    },
  };
}

test("empty source and empty reply summaries stay unchanged while one grounded bullet edit is accepted", async () => {
  for (const [sourceSummary, replySummary] of [
    ["", ""],
    ["   ", " \t "],
  ]) {
    const model = {
      async complete() {
        return {
          summary: replySummary,
          bullets: [{ index: 0, text: BULLET_0_AFTER }],
          coverLetter: LETTER,
        };
      },
    };

    const result = await refine({
      pack: makePack({ summary: sourceSummary, bullets: [BULLET_0] }),
      instruction: "lead with the payments work",
      model,
    });

    assert.equal(result.mode, "model", JSON.stringify(result.warnings));
    assert.equal(result.changes.length, 1, JSON.stringify(result.changes));
    assert.equal(result.changes[0].field, "bullets.0");
    assert.equal(result.refined.bullets[0], BULLET_0_AFTER);
    assert.equal(result.refined.summary, sourceSummary);
    assert.equal(result.pack.tailored.summary, sourceSummary);
    assert.ok(!result.changes.some((change) => change.field === "summary"));
  }
});

test("empty reply against a nonempty source is refused; missing and nonstring summaries remain invalid", async () => {
  const nonemptySource = await refine({
    pack: makePack({ summary: SUMMARY, bullets: [] }),
    instruction: "make the summary shorter",
    model: {
      async complete() {
        return { summary: "", bullets: [], coverLetter: "" };
      },
    },
  });

  assert.equal(nonemptySource.mode, "rules");
  assert.ok(
    nonemptySource.warnings.some((warning) => /summary is missing, empty or not a string/.test(warning)),
    JSON.stringify(nonemptySource.warnings)
  );
  assert.notEqual(nonemptySource.refined.summary.trim(), "");
  assert.notEqual(nonemptySource.pack.tailored.summary.trim(), "");

  for (const invalidSummary of [undefined, 42]) {
    const model = {
      async complete() {
        const reply = { bullets: [], coverLetter: "" };
        if (invalidSummary !== undefined) reply.summary = invalidSummary;
        return reply;
      },
    };

    const result = await refine({
      pack: makePack({ summary: "", bullets: [] }),
      instruction: "lead with the payments work",
      model,
    });

    assert.equal(result.mode, "rules");
    assert.ok(
      result.warnings.some((warning) => /summary is missing, empty or not a string/.test(warning)),
      JSON.stringify(result.warnings)
    );
    assert.equal(result.refined.summary, "");
  }
});

test("nonempty grounded creation from the current CV keeps the existing cover-letter path", async () => {
  const result = await refine({
    pack: makePack({ summary: "", bullets: [] }),
    instruction: "write the summary",
    model: {
      async complete() {
        return { summary: SUMMARY_FROM_CV, bullets: [], coverLetter: LETTER };
      },
    },
  });

  assert.equal(result.mode, "model", JSON.stringify(result.warnings));
  assert.equal(result.refined.summary, SUMMARY_FROM_CV);
  assert.equal(result.pack.tailored.summary, SUMMARY_FROM_CV);
  assert.equal(result.pack.coverLetterMd, LETTER);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].field, "summary");
  assert.ok(!result.warnings.some((warning) => /no original text/.test(warning)));
});

test("identical and conflicting duplicate indices refuse before last-wins; distinct 0/1 is accepted", async () => {
  const duplicateReplies = [
    [
      { index: 0, text: BULLET_0_AFTER },
      { index: 0, text: BULLET_0_AFTER },
    ],
    [
      { index: 0, text: BULLET_0_AFTER },
      { index: 0, text: "Led the migration of 14 payment services to Kubernetes." },
    ],
  ];

  for (const duplicateBullets of duplicateReplies) {
    const result = await refine({
      pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
      instruction: "lead with the payments work",
      model: {
        async complete() {
          return { summary: SUMMARY, bullets: duplicateBullets, coverLetter: LETTER };
        },
      },
    });

    assert.equal(result.mode, "rules");
    assert.ok(
      result.warnings.some((warning) => /duplicates an earlier bullet index/.test(warning)),
      JSON.stringify(result.warnings)
    );
    assert.deepEqual(result.changes, []);
    assert.equal(result.refined.bullets[0], BULLET_0);
    assert.equal(result.refined.bullets.length, 1);
  }

  const distinct = await refine({
    pack: makePack({ summary: SUMMARY, bullets: [BULLET_0, BULLET_1] }),
    instruction: "lead with the payments work",
    model: {
      async complete() {
        return {
          summary: SUMMARY,
          bullets: [
            { index: 0, text: BULLET_0_AFTER },
            { index: 1, text: BULLET_1_AFTER },
          ],
          coverLetter: LETTER,
        };
      },
    },
  });

  assert.equal(distinct.mode, "model", JSON.stringify(distinct.warnings));
  assert.equal(distinct.changes.length, 2, JSON.stringify(distinct.changes));
  assert.deepEqual(distinct.changes.map((change) => change.field), ["bullets.0", "bullets.1"]);
  assert.equal(distinct.refined.bullets[0], BULLET_0_AFTER);
  assert.equal(distinct.refined.bullets[1], BULLET_1_AFTER);
  assert.ok(!distinct.warnings.some((warning) => /duplicates an earlier bullet index/.test(warning)));
});

test("null, string, fraction and out-of-range indices stay invalid beside a useful integer 0", async () => {
  for (const invalidIndex of [null, "0", 0.5, 99]) {
    const result = await refine({
      pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
      instruction: "lead with the payments work",
      model: {
        async complete() {
          return {
            summary: SUMMARY,
            bullets: [
              { index: invalidIndex, text: BULLET_0_AFTER },
              { index: 0, text: BULLET_0_AFTER },
            ],
            coverLetter: LETTER,
          };
        },
      },
    });

    assert.equal(result.mode, "rules");
    assert.ok(
      result.warnings.some((warning) => /index is outside 0\.\.0/.test(warning)),
      JSON.stringify(result.warnings)
    );
    assert.deepEqual(result.changes, []);
    assert.equal(result.refined.bullets[0], BULLET_0);
  }
});

test("unchanged and all-grounding-refused replies fall back honestly", async () => {
  const unchanged = await refine({
    pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
    instruction: "lead with the payments work",
    model: {
      async complete() {
        return {
          summary: SUMMARY,
          bullets: [{ index: 0, text: BULLET_0 }],
          coverLetter: LETTER,
        };
      },
    },
  });

  assert.equal(unchanged.mode, "rules");
  assert.ok(
    unchanged.warnings.some((warning) => /changed nothing that passed the grounding check/.test(warning)),
    JSON.stringify(unchanged.warnings)
  );
  assert.deepEqual(unchanged.changes, []);
  assert.equal(unchanged.refined.summary, SUMMARY);
  assert.equal(unchanged.refined.bullets[0], BULLET_0);

  const refused = await refine({
    pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
    instruction: "lead with the payments work",
    model: {
      async complete() {
        return {
          summary: `${SUMMARY} Cut cloud spend by 99%.`,
          bullets: [{ index: 0, text: "Managed 12 engineers." }],
          coverLetter: LETTER,
        };
      },
    },
  });

  assert.equal(refused.mode, "rules");
  assert.ok(
    refused.warnings.some((warning) => /reverted because it failed the grounding check/.test(warning)),
    JSON.stringify(refused.warnings)
  );
  assert.ok(
    refused.warnings.some((warning) => /changed nothing that passed/.test(warning)),
    JSON.stringify(refused.warnings)
  );
  assert.equal(refused.refined.summary, SUMMARY);
  assert.equal(refused.refined.bullets[0], BULLET_0);
});

test("optional coverLetter omitted, null, same string and invalid behavior is unchanged", async () => {
  for (const coverLetter of [undefined, null, LETTER]) {
    const model = {
      async complete() {
        const reply = {
          summary: SUMMARY,
          bullets: [{ index: 0, text: BULLET_0_AFTER }],
        };
        if (coverLetter !== undefined) reply.coverLetter = coverLetter;
        return reply;
      },
    };

    const result = await refine({
      pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
      instruction: "lead with the payments work",
      model,
    });

    assert.equal(result.mode, "model", JSON.stringify(result.warnings));
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].field, "bullets.0");
    assert.equal(result.pack.coverLetterMd, LETTER);
  }

  const invalid = await refine({
    pack: makePack({ summary: SUMMARY, bullets: [BULLET_0] }),
    instruction: "lead with the payments work",
    model: {
      async complete() {
        return {
          summary: SUMMARY,
          bullets: [{ index: 0, text: BULLET_0_AFTER }],
          coverLetter: 42,
        };
      },
    },
  });

  assert.equal(invalid.mode, "rules");
  assert.ok(
    invalid.warnings.some((warning) => /coverLetter is present but is not a string/.test(warning)),
    JSON.stringify(invalid.warnings)
  );
  assert.deepEqual(invalid.changes, []);
  assert.equal(invalid.pack.coverLetterMd, LETTER);
});
