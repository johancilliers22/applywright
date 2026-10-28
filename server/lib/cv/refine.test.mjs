/**
 * Tests for `cv/refine.js` — the instruction parser, every rules transformation,
 * the grounding check, the model path and its fallbacks.
 *
 *   node --test server/lib/cv/refine.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { describeRefinement, groundChanges, parseInstruction, refine } from "./refine.js";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const CV_TEXT = `Ada Whitfield
Leeds, United Kingdom | ada.whitfield@example.com | linkedin.com/in/adawhitfield

PROFESSIONAL SUMMARY
Backend engineer with 9 years building Go services and Kubernetes platforms for payments and logistics. I care deeply about clean interfaces and thorough documentation, and I like to mentor new joiners. I have led migrations from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6, and I reduced cloud spend by £240,000 a year.

WORK EXPERIENCE

Senior Backend Engineer, Northgate Payments, Leeds - March 2021 to present
- Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.
- Cut p99 checkout latency from 820 ms to 505 ms (38%) by adding Redis caching and rewriting the PostgreSQL query path.
- Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.
- Led the standing engineering forum and wrote the onboarding guide, which every new joiner now uses.
- Responsible for the payments platform and worked on the reporting service.
`;

const SUMMARY =
  "Backend engineer with 9 years building Go services and Kubernetes platforms for payments and logistics. I care deeply about clean interfaces and thorough documentation, and I like to mentor new joiners. I have led migrations from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6, and I reduced cloud spend by £240,000 a year.";

const LETTER = `# Covering letter: Senior Backend Engineer at Northgate Payments

Dear Hiring Manager,

I am applying for the Senior Backend Engineer role at Northgate Payments, where I would own the payments platform.

I care deeply about clean interfaces and thorough documentation, and I like to mentor new joiners.

My CV is attached, and I would be glad to discuss the role.

Yours sincerely,

Ada Whitfield
ada.whitfield@example.com
`;

const ANSWERS = [
  {
    question: "Why do you want this role?",
    answer:
      "I want to own the payments platform because I have spent 9 years on payment systems and I care about reliability.",
  },
  { question: "When could you start?", answer: "I have a three month notice period, so I could start in April." },
  {
    question: "Do you have the right to work in the country this role is based in?",
    answer: "Yes, I have the right to work in the UK.",
  },
  {
    question: "What are your salary expectations?",
    answer: "I am looking for £95,000 a year, and I am flexible on the mix of salary and bonus.",
  },
];

const BULLETS = [
  {
    section: "experience",
    original:
      "Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.",
    rewritten:
      "Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.",
    evidence: "Senior Backend Engineer | Northgate Payments",
  },
  {
    section: "experience",
    original:
      "Cut p99 checkout latency from 820 ms to 505 ms (38%) by adding Redis caching and rewriting the PostgreSQL query path.",
    rewritten:
      "Cut p99 checkout latency from 820 ms to 505 ms (38%) by adding Redis caching and rewriting the PostgreSQL query path.",
    evidence: "Senior Backend Engineer | Northgate Payments",
  },
  {
    section: "experience",
    original:
      "Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.",
    rewritten:
      "Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.",
    evidence: "Senior Backend Engineer | Northgate Payments",
  },
  {
    section: "experience",
    original:
      "Led the standing engineering forum and wrote the onboarding guide, which every new joiner now uses.",
    rewritten:
      "Led the standing engineering forum and wrote the onboarding guide, which every new joiner now uses.",
    evidence: "Senior Backend Engineer | Northgate Payments",
  },
  {
    section: "experience",
    original: "Responsible for the payments platform and worked on the reporting service.",
    rewritten: "Responsible for the payments platform and worked on the reporting service.",
    evidence: "Senior Backend Engineer | Northgate Payments",
  },
];

function makePack({ tailored, ...rest } = {}) {
  return {
    cvHtml: "<!DOCTYPE html><html><body><h1>Ada Whitfield</h1></body></html>",
    cvTextPlain: CV_TEXT,
    coverLetterMd: LETTER,
    answers: ANSWERS.map((entry) => ({ ...entry })),
    filenameBase: "ada-whitfield-northgate-payments",
    tailored: {
      summary: SUMMARY,
      bullets: BULLETS.map((bullet) => ({ ...bullet })),
      keywordsPlaced: ["kubernetes", "go"],
      ...(tailored ?? {}),
    },
    ...rest,
  };
}

/** A pack whose summary is the only field we care about. */
function summaryPack(summary, extra = {}) {
  return makePack({
    tailored: { summary, bullets: [] },
    ...extra,
  });
}

/** Every digit run in a string, canonicalised enough for "kept every number". */
function numbers(value) {
  return new Set(
    (String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((number) => number.replace(/,/g, ""))
  );
}

function assertKeepsNumbers(before, after) {
  for (const number of numbers(before)) {
    assert.ok(numbers(after).has(number), `lost the number ${number}: "${after}"`);
  }
}

/* ------------------------------------------------------------------ *
 * parseInstruction
 * ------------------------------------------------------------------ */

test("parseInstruction recognises single intents and targets", () => {
  const shorter = parseInstruction("Make the summary shorter, please");
  assert.deepEqual(shorter.intents, ["shorter"]);
  assert.deepEqual(shorter.targets, ["summary"]);
  assert.deepEqual(shorter.preserve, []);
  assert.equal(shorter.raw, "Make the summary shorter, please");

  const plain = parseInstruction("less formal please");
  assert.deepEqual(plain.intents, ["plain"]);
  assert.deepEqual(plain.targets, []);

  const tooLong = parseInstruction("this bullet is too long");
  assert.deepEqual(tooLong.intents, ["shorter"]);
  assert.deepEqual(tooLong.targets, ["bullets"]);

  const senior = parseInstruction("make it sound more senior and more technical");
  assert.deepEqual(senior.intents, ["senior", "technical"]);

  const jargon = parseInstruction("no jargon, please");
  assert.deepEqual(jargon.intents, ["less-jargon"]);

  const british = parseInstruction("use British spelling everywhere");
  assert.deepEqual(british.intents, ["british"]);
  assert.deepEqual(british.targets, ["summary", "bullets", "letter", "answers"]);

  const american = parseInstruction("switch to American spelling in the cover letter");
  assert.deepEqual(american.intents, ["american"]);
  assert.deepEqual(american.targets, ["letter"]);
});

test("parseInstruction handles compound instructions and quoted wording", () => {
  const compound = parseInstruction(
    "shorten the summary, make the bullets more formal and use UK spelling in the letter"
  );
  assert.deepEqual(compound.intents, ["shorter", "formal", "british"]);
  assert.deepEqual(compound.targets, ["summary", "bullets", "letter"]);

  const quoted = parseInstruction('use my own wording in the summary: "Owned the payments platform"');
  assert.ok(quoted.intents.includes("verbatim"));
  assert.ok(quoted.intents.includes("preserve"));
  assert.deepEqual(quoted.targets, ["summary"]);
  assert.deepEqual(quoted.preserve, ["Owned the payments platform"]);

  const keepOnly = parseInstruction("keep 'the payments platform' as it is");
  assert.deepEqual(keepOnly.intents, ["preserve"]);
  assert.deepEqual(keepOnly.preserve, ["the payments platform"]);

  const curly = parseInstruction("shorter, but keep “payments platform”");
  assert.deepEqual(curly.preserve, ["payments platform"]);

  const apostrophe = parseInstruction("use the candidate's own words");
  assert.deepEqual(apostrophe.preserve, []);
  assert.ok(apostrophe.intents.includes("verbatim"));

  const nothing = parseInstruction("lead with the payments work");
  assert.deepEqual(nothing.intents, []);
  assert.deepEqual(nothing.targets, []);
});

/* ------------------------------------------------------------------ *
 * Rules path — each transformation
 * ------------------------------------------------------------------ */

test('"shorter" drops a sentence without figures and keeps every number', async () => {
  // No field named, so length intents default to the summary and the bullets.
  const result = await refine({ pack: makePack(), instruction: "make it shorter" });
  assert.equal(result.mode, "rules");

  const change = result.changes.find((entry) => entry.field === "summary");
  assert.ok(change, "the summary should have changed");
  assert.ok(!change.after.includes("clean interfaces"), "the sentence without figures should be gone");
  assert.ok(!change.after.includes("mentor new joiners"));
  assert.ok(change.after.includes("£240,000"), "the measured sentence must survive");
  assert.ok(change.after.includes("45 minutes"));
  assertKeepsNumbers(change.before, change.after);
  assert.ok(change.after.length < change.before.length);
  assert.match(change.reason, /dropped 1 without a figure/);

  const bulletChange = result.changes.find((entry) => entry.field === "bullets.3");
  assert.ok(bulletChange, "the subordinate clause should be cut from the fourth bullet");
  assert.equal(
    bulletChange.after,
    "Led the standing engineering forum and wrote the onboarding guide."
  );
  assert.ok(result.refined.bullets[3].startsWith("Led the standing engineering forum"));
});

test('"longer" quotes a measurable detail the CV already states', async () => {
  const pack = summaryPack("Backend engineer focused on payments platforms.");
  const result = await refine({ pack, instruction: "expand the summary" });
  const change = result.changes.find((entry) => entry.field === "summary");

  assert.ok(change, "the summary should have been expanded");
  assert.ok(change.after.startsWith("Backend engineer focused on payments platforms."));
  assert.ok(change.after.includes("9 years"), "the CV's own figure is quoted");
  assert.ok(change.after.length > change.before.length);
  assert.match(change.reason, /measurable detail/);
  assertKeepsNumbers(change.before, change.after);
});

test('"longer" refuses to invent when the CV holds no measurable detail', async () => {
  const pack = makePack({
    cvTextPlain: "Ada Whitfield\nLeeds, United Kingdom",
    tailored: { summary: "Backend engineer.", bullets: [] },
  });
  const result = await refine({ pack, instruction: "expand the summary" });
  assert.equal(result.changes.length, 0);
  assert.ok(result.warnings.some((warning) => /no change was needed/.test(warning)));
  assert.equal(result.refined.summary, "Backend engineer.");
});

test("formal and plain registers", async () => {
  const formal = await refine({
    pack: summaryPack("I'm a backend engineer and I don't cut corners on reliability!"),
    instruction: "make the summary more formal",
  });
  assert.equal(formal.refined.summary, "I am a backend engineer and I do not cut corners on reliability.");

  const plain = await refine({
    pack: summaryPack("Furthermore, I utilise Kubernetes to manage the payments platform."),
    instruction: "make the summary plainer",
  });
  assert.equal(plain.refined.summary, "Also, I use Kubernetes to manage the payments platform.");
});

test("senior strengthens a weak opener without raising the level of ownership", async () => {
  // The old map promoted: "Responsible for…" → "Owned…", "helped with…" → "Drove…",
  // "tasked with…" → "Led…". `/how-it-works` says the product cannot upgrade
  // *supported* to *led*, so the expectation changed with the fix — this assertion
  // is the evidence that the defect is closed, not a test bent to pass.
  const senior = await refine({
    pack: summaryPack("Responsible for the payments platform and worked on the reporting service."),
    instruction: "make the summary sound more senior",
  });
  assert.equal(senior.refined.summary, "Handled the payments platform and worked on the reporting service.");

  const helped = await refine({
    pack: summaryPack("Helped with managing 12 engineers."),
    instruction: "make the summary sound more senior",
  });
  assert.equal(helped.refined.summary, "Contributed to managing 12 engineers.");
  assert.doesNotMatch(helped.refined.summary, /\b(?:Led|Managed|Drove|Owned)\b/);

  const tasked = await refine({
    pack: summaryPack("Tasked with managing the migration of 14 services."),
    instruction: "make the summary more senior",
  });
  assert.equal(tasked.refined.summary, "Worked on managing the migration of 14 services.");

  // "Worked on" has no honest stronger form, so the strongest wording leaves it
  // exactly as the candidate wrote it and says so.
  const worked = await refine({
    pack: summaryPack("Worked on the reporting service."),
    instruction: "make the summary sound more senior",
  });
  assert.equal(worked.refined.summary, "Worked on the reporting service.");
  assert.ok(worked.warnings.some((warning) => /no change was needed/.test(warning)));

  const junior = await refine({
    pack: summaryPack("Spearheaded the payments rebuild."),
    instruction: "make the summary less senior",
  });
  assert.equal(junior.refined.summary, "Contributed to the payments rebuild.");
});

test("a model rewrite that promotes a verb is reverted by the grounding check", async () => {
  const model = {
    async complete() {
      return { summary: "Managed 12 engineers.", bullets: [], coverLetter: LETTER };
    },
  };
  const result = await refine({
    pack: summaryPack("Helped with managing 12 engineers."),
    instruction: "make the summary sound more senior",
    model,
  });

  // The model's promotion is refused, so nothing it offered survives and the rules
  // path answers instead.
  assert.equal(result.mode, "rules");
  assert.equal(result.refined.summary, "Contributed to managing 12 engineers.");
  assert.ok(!result.refined.summary.includes("Managed 12 engineers"));
  assert.ok(
    result.warnings.some((warning) =>
      /reverted because it failed the grounding check: .*stronger level of ownership/.test(warning)
    ),
    `expected an ownership rejection in: ${JSON.stringify(result.warnings)}`
  );
});

test("technical writes numbers as digits and drops hedging without changing a claim", async () => {
  const result = await refine({
    pack: summaryPack("Led three migrations and cut deploy time by roughly 40%."),
    instruction: "make the summary more technical",
  });
  assert.equal(result.refined.summary, "Led 3 migrations and cut deploy time by 40%.");
  const change = result.changes[0];
  assertKeepsNumbers(change.before, change.after);
  assert.equal(change.before, "Led three migrations and cut deploy time by roughly 40%.");
});

test("less jargon replaces corporate vocabulary", async () => {
  const result = await refine({
    pack: summaryPack("We leverage a robust, best-in-class platform to facilitate delivery."),
    instruction: "use less jargon in the summary",
  });
  assert.equal(result.refined.summary, "We use a solid, leading platform to help delivery.");
});

test("first person and third person switch the voice", async () => {
  const first = await refine({
    pack: summaryPack("Led the migration of 14 services to Kubernetes."),
    instruction: "write the summary in the first person",
  });
  assert.equal(first.refined.summary, "I led the migration of 14 services to Kubernetes.");

  const third = await refine({
    pack: summaryPack("I led a team of 6 and I cut latency by 40%."),
    instruction: "make the summary third person",
  });
  assert.equal(third.refined.summary, "Led a team of 6 and cut latency by 40%.");
});

test("UK and US spelling swap from the fixed list", async () => {
  const uk = await refine({
    pack: summaryPack("I organize the reporting work and analyze the data."),
    instruction: "use British spelling in the summary",
  });
  assert.equal(uk.refined.summary, "I organise the reporting work and analyse the data.");

  const us = await refine({
    pack: summaryPack("I organise the priorities and review the catalogue."),
    instruction: "use American spelling in the summary",
  });
  assert.equal(us.refined.summary, "I organize the priorities and review the catalog.");
});

test("quoted wording can replace a field, and is otherwise protected", async () => {
  // The candidate's own wording replaces the summary when no figure is at stake.
  const owned = await refine({
    pack: summaryPack("Backend engineer on the payments platform."),
    instruction: 'in the summary use my own wording: "Payments platform owner who ships reliable services."',
  });
  assert.equal(owned.refined.summary, "Payments platform owner who ships reliable services.");
  assert.equal(owned.changes[0].field, "summary");

  // Wording that would drop a figure is reverted rather than shipped.
  const refused = await refine({
    pack: makePack(),
    instruction: 'in the summary use my own wording: "Payments platform owner."',
  });
  assert.equal(refused.changes.length, 0);
  assert.ok(refused.warnings.some((warning) => /reverted because it failed the grounding check/.test(warning)));
  assert.equal(refused.refined.summary, SUMMARY);

  // A transformation that would rewrite the quoted word is skipped, not forced.
  const protectedRun = await refine({
    pack: summaryPack("I organize the reporting work."),
    instruction: 'use UK spelling and keep "organize"',
  });
  assert.equal(protectedRun.changes.length, 0);
  assert.ok(protectedRun.warnings.some((warning) => /wording you quoted/.test(warning)));
  assert.equal(protectedRun.refined.summary, "I organize the reporting work.");

  // Quoted wording never blanks a whole bullet list.
  const bullets = await refine({
    pack: makePack(),
    instruction: 'use my own wording in the bullets: "Delivered the platform."',
  });
  assert.equal(bullets.changes.length, 0);
  assert.ok(bullets.warnings.some((warning) => /only replaces the summary or the cover letter/.test(warning)));
});

test("a model reply whose sentences open with ordinary English is accepted", async () => {
  // Live failures: the summary was reverted for `new name "Delivers"` and
  // `new name "Use"`, so the whole reply fell back to the rules engine.
  for (const summary of [
    "Delivers a leaner cloud platform while keeping spend at £240,000 a year.",
    "Use the existing cloud platform to keep spend at £240,000 a year.",
  ]) {
    const model = {
      async complete() {
        return { summary, bullets: [], coverLetter: LETTER };
      },
    };
    const result = await refine({
      pack: summaryPack("Cut cloud spend by £240,000 a year."),
      instruction: "rewrite the summary in a more formal tone",
      model,
    });
    assert.equal(result.mode, "model", `expected the reply to survive: ${JSON.stringify(result.warnings)}`);
    assert.equal(result.refined.summary, summary);
    assert.ok(!result.warnings.some((warning) => /new name/.test(warning)), JSON.stringify(result.warnings));
  }
});

test("one sentence opener does not revert a prose reply, but still rejects a bullet", async () => {
  const summary = "Zephyria delivers a leaner payments platform after 9 years, cutting deploy time from 45 minutes to 6 and spending £240,000 a year.";
  const model = {
    async complete() {
      return {
        summary,
        bullets: [{ index: 3, text: "Zephyria led the engineering forum." }],
        coverLetter: LETTER,
      };
    },
  };
  const result = await refine({ pack: makePack(), instruction: "rewrite the summary in a more formal tone", model });

  // The prose field kept the change, with a warning naming the word to check.
  assert.equal(result.mode, "model");
  assert.equal(result.refined.summary, summary);
  assert.ok(
    result.warnings.some((warning) => /sentence opener "Zephyria"/.test(warning)),
    JSON.stringify(result.warnings)
  );

  // The bullet is a factual line: the same shape is still refused there.
  assert.ok(
    result.warnings.some((warning) => /reverted because it failed the grounding check: new name "Zephyria"/.test(warning)),
    JSON.stringify(result.warnings)
  );
  assert.match(result.refined.bullets[3], /^Led the standing engineering forum/);
});

test("length intents work on the cover letter without losing the sign-off", async () => {
  const result = await refine({ pack: makePack(), instruction: "make the cover letter shorter" });
  const change = result.changes.find((entry) => entry.field === "coverLetter");

  assert.ok(change, "the letter should have been shortened");
  assert.ok(!change.after.includes("clean interfaces"), "the middle paragraph should be gone");
  assert.ok(change.after.includes("# Covering letter"), "the heading survives");
  assert.ok(change.after.includes("Dear Hiring Manager,"), "the greeting survives");
  assert.ok(change.after.includes("Yours sincerely,"), "the sign-off survives");
  assert.ok(change.after.includes("payments platform"));
});

test("screening answers are refined, and unfilled ones are left alone", async () => {
  const result = await refine({ pack: makePack(), instruction: "shorten the screening answers" });
  const salary = result.changes.find((entry) => entry.field === "answers.3");
  assert.ok(salary, "the salary answer should have been shortened");
  assert.equal(salary.after, "I am looking for £95,000 a year.");
  assertKeepsNumbers(salary.before, salary.after);

  const placeholders = makePack({
    answers: [
      { question: "Why do you want this role?", answer: "Not provided. Add a short reason for applying." },
      { question: "When could you start?", answer: "I have a three month notice period." },
    ],
  });
  const guarded = await refine({ pack: placeholders, instruction: "shorten the screening answers" });
  assert.ok(guarded.warnings.some((warning) => /left 1 screening answer alone/.test(warning)));
  assert.equal(guarded.changes.length, 0);
});

/* ------------------------------------------------------------------ *
 * Grounding
 * ------------------------------------------------------------------ */

test("groundChanges rejects an introduced percentage", () => {
  const check = groundChanges("Cut checkout latency for the payments team.", "Cut checkout latency for the payments team by 63%.", {
    context: CV_TEXT,
  });
  assert.equal(check.ok, false);
  assert.ok(check.reasons.some((reason) => /63%/.test(reason)));
});

test("groundChanges rejects an introduced employer", () => {
  const check = groundChanges("Wrote Go services for the reporting team.", "Wrote Go services for Monzo.", {
    context: CV_TEXT,
  });
  assert.equal(check.ok, false);
  assert.ok(check.reasons.some((reason) => /Monzo/.test(reason)));
});

test("groundChanges rejects a dropped figure and accepts a faithful rephrase", () => {
  const dropped = groundChanges("Cut cloud spend by £240,000 a year.", "Cut cloud spend.");
  assert.equal(dropped.ok, false);
  assert.ok(dropped.reasons.some((reason) => /dropped/.test(reason)));

  const faithful = groundChanges("Cut cloud spend by £240,000 a year.", "Reduced annual cloud spend by £240k.");
  assert.equal(faithful.ok, true);
  assert.deepEqual(faithful.reasons, []);
});

test("groundChanges refuses a rewrite that raises the level of ownership", () => {
  // The same shared check runs under refine, the assist route and the tailor, so
  // this is where the product promise ("cannot upgrade supported to led") is kept.
  const promoted = groundChanges("Helped with managing 12 engineers.", "Managed 12 engineers.");
  assert.equal(promoted.ok, false);
  assert.ok(promoted.reasons.some((reason) => /stronger level of ownership/.test(reason)));

  const led = groundChanges("Helped with managing 12 engineers.", "Led 12 engineers.");
  assert.equal(led.ok, false);

  const faithful = groundChanges("Helped with managing 12 engineers.", "Contributed to managing 12 engineers.");
  assert.equal(faithful.ok, true);
});

test("a rejected change is reverted, never shipped", async () => {
  const model = {
    async complete() {
      return {
        summary: "Backend engineer with 9 years building Go services, cutting cost by 63%.",
        bullets: [],
        coverLetter: LETTER,
      };
    },
  };
  const result = await refine({ pack: makePack(), instruction: "make the summary shorter", model });

  assert.equal(result.mode, "rules");
  assert.ok(!result.refined.summary.includes("63%"));
  assert.ok(result.warnings.some((warning) => /reverted because it failed the grounding check/.test(warning)));
  assert.ok(result.warnings.some((warning) => /changed nothing that passed/.test(warning)));
});

/* ------------------------------------------------------------------ *
 * Model path
 * ------------------------------------------------------------------ */

test("model path falls back to rules when the model throws", async () => {
  const model = {
    async complete() {
      throw new Error("upstream 502");
    },
  };
  const result = await refine({ pack: makePack(), instruction: "make the summary shorter", model });

  assert.equal(result.mode, "rules");
  assert.ok(result.warnings.some((warning) => warning.includes("upstream 502")));
  assert.ok(result.refined.summary.length < SUMMARY.length);
  assert.ok(result.changes.length > 0);
});

test("model path falls back to rules on invalid JSON and on an invalid shape", async () => {
  const badJson = await refine({
    pack: makePack(),
    instruction: "make the summary shorter",
    model: { async complete() { return "Here you go: {not json}"; } },
  });
  assert.equal(badJson.mode, "rules");
  assert.ok(badJson.warnings.some((warning) => /not valid JSON/.test(warning)));

  const badShape = await refine({
    pack: makePack(),
    instruction: "make the summary shorter",
    model: { async complete() { return { summary: 42, bullets: "nope", coverLetter: null }; } },
  });
  assert.equal(badShape.mode, "rules");
  assert.ok(badShape.warnings.some((warning) => /summary is missing/.test(warning)));
  assert.ok(badShape.refined.summary.length < SUMMARY.length);
});

test("model path ships a validated reply and reports its changes", async () => {
  const seen = {};
  const model = {
    async complete({ system, prompt, schema }) {
      seen.system = system;
      seen.prompt = prompt;
      seen.schema = schema;
      return {
        summary:
          "Backend engineer with 9 years across Go services and Kubernetes payments platforms. I led migrations that cut deploy time from 45 minutes to 6 and cut cloud spend by £240,000 a year.",
        bullets: [
          { index: 3, text: "Led the engineering forum and wrote the onboarding guide every new joiner uses." },
        ],
        coverLetter: LETTER,
      };
    },
  };
  const result = await refine({ pack: makePack(), instruction: "tighten the summary and the fourth bullet", model });

  assert.equal(result.mode, "model");
  assert.ok(result.changes.some((change) => change.field === "summary"));
  assert.ok(result.changes.some((change) => change.field === "bullets.3"));
  assert.ok(!result.changes.some((change) => change.field === "coverLetter"), "unchanged fields are not changes");
  assert.match(seen.prompt, /Instruction from the candidate/);
  assert.match(seen.system, /never add or remove a number/);
  assert.equal(seen.schema.type, "object");
  assertKeepsNumbers(SUMMARY, result.refined.summary);
  assert.equal(result.pack.tailored.summary, result.refined.summary);
});

test("a model can act on an instruction the rules do not recognise", async () => {
  const model = {
    async complete() {
      return {
        summary: SUMMARY,
        bullets: [{ index: 2, text: "Reduced cloud spend by £240,000 a year across 60 workloads." }],
        coverLetter: LETTER,
      };
    },
  };
  const result = await refine({ pack: makePack(), instruction: "lead with the payments work", model });

  assert.equal(result.mode, "model");
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].field, "bullets.2");
  assert.equal(result.refined.bullets[2], "Reduced cloud spend by £240,000 a year across 60 workloads.");
});

/* ------------------------------------------------------------------ *
 * Refusals, determinism and the return contract
 * ------------------------------------------------------------------ */

test("an unknown instruction changes nothing and says so", async () => {
  const result = await refine({ pack: makePack(), instruction: "make it pop like a magazine cover" });
  assert.equal(result.mode, "rules");
  assert.deepEqual(result.changes, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /no rule matches the instruction/);
  assert.equal(result.refined.summary, SUMMARY);
});

test("an empty or partial pack does not throw", async () => {
  const bare = await refine({
    pack: { cvHtml: "", cvTextPlain: "", coverLetterMd: "", answers: [], filenameBase: "x" },
    instruction: "make it shorter",
  });
  assert.deepEqual(bare.changes, []);
  assert.equal(bare.mode, "rules");
  assert.ok(bare.warnings.length >= 1);
  assert.equal(bare.refined.summary, "");

  const missing = await refine({});
  assert.deepEqual(missing.changes, []);
  assert.ok(missing.warnings.some((warning) => /no pack to refine/.test(warning)));
});

test("an empty instruction is refused", async () => {
  const result = await refine({ pack: makePack(), instruction: "   " });
  assert.deepEqual(result.changes, []);
  assert.match(result.warnings[0], /instruction was empty/);
});

test("style is parsed with the same vocabulary as the instruction", async () => {
  const result = await refine({ pack: makePack(), instruction: "", style: "concise" });
  assert.equal(result.mode, "rules");
  assert.ok(result.changes.some((change) => change.field === "summary"));
  assert.ok(result.refined.summary.length < SUMMARY.length);
});

test("refine is deterministic and leaves the input pack untouched", async () => {
  const pack = makePack();
  const fingerprint = JSON.stringify(pack);
  const instruction = "make the summary shorter and less formal";

  const first = await refine({ pack, instruction });
  const second = await refine({ pack, instruction });

  assert.deepEqual(first, second);
  assert.deepEqual(first.changes, second.changes);
  assert.equal(JSON.stringify(pack), fingerprint, "the input pack is read-only");
  assert.notEqual(first.pack, pack);
  assert.equal(pack.tailored.summary, SUMMARY);
  assert.deepEqual(pack.tailored.bullets, BULLETS);
});

test("the returned pack and refined object carry the same text", async () => {
  const pack = makePack();
  const result = await refine({ pack, instruction: "make the summary shorter" });

  assert.equal(result.pack.tailored.summary, result.refined.summary);
  assert.equal(result.pack.coverLetterMd, result.refined.coverLetter);
  assert.equal(result.pack.answers.length, result.refined.answers.length);
  assert.equal(result.refined.bullets.length, pack.tailored.bullets.length);
  assert.equal(result.pack.cvHtml, pack.cvHtml, "cvHtml is not rebuilt here");
  assert.equal(result.pack.tailored.bullets[0].rewritten, result.refined.bullets[0]);
  assert.deepEqual(Object.keys(result).sort(), [
    "changes",
    "mode",
    "pack",
    "refined",
    "warnings",
  ]);
});

test("no rules intent ever loses a number", async () => {
  const instructions = [
    "make it shorter",
    "make it longer",
    "make it more formal",
    "make it plainer",
    "make it sound more senior",
    "make it sound less senior",
    "make it more technical",
    "use less jargon",
    "write it in the first person",
    "make it third person",
    "use British spelling",
    "use American spelling",
    "shorten the bullets",
  ];
  for (const instruction of instructions) {
    const result = await refine({ pack: makePack(), instruction });
    assert.equal(result.mode, "rules");
    for (const change of result.changes) {
      assertKeepsNumbers(change.before, change.after);
    }
  }
});

test("describeRefinement is a one-line account of the changes", () => {
  assert.equal(describeRefinement([]), "no changes");
  assert.equal(
    describeRefinement([{ field: "summary", before: "one two three four", after: "one two" }]),
    "shortened the summary"
  );
  assert.equal(
    describeRefinement([
      { field: "bullets.0", before: "one two three four", after: "one two" },
      { field: "bullets.1", before: "one two three four", after: "one two" },
      { field: "bullets.2", before: "one two three four", after: "one two" },
    ]),
    "tightened 3 bullets"
  );
  assert.equal(
    describeRefinement([
      { field: "summary", before: "one two three four", after: "one two" },
      { field: "coverLetter", before: "one two", after: "one two three" },
      { field: "bullets.7", before: "one two three four", after: "one two" },
    ]),
    "shortened the summary, tightened 1 bullet, expanded the cover letter"
  );
  assert.ok(!describeRefinement([{ field: "summary", before: "a", after: "b" }]).includes("\n"));
});
