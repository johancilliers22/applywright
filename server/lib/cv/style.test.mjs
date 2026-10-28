/**
 * Tests for server/lib/cv/style.js — the voice engine.
 *
 * node --test server/lib/cv/style.test.mjs
 *
 * Offline, clock-free and file-free: every function here is pure, so the same
 * fixture must produce the same object on every run.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BUZZWORDS,
  FILLER_OPENERS,
  FORMALITY_THRESHOLD,
  LONG_SENTENCE_WORDS,
  SPELLING_PAIRS,
  STRONG_VERBS,
  STYLE_WEIGHTS,
  analyseStyle,
  assertStyleSafe,
  rewriteInStyle,
  styleMatch
} from "./style.js";

const UK_CV = [
  "Organised the payments programme across three centres.",
  "Analysed customer behaviour and prioritised fixes.",
  "Led delivery of the colour management system for the London team."
].join("\n");

const US_CV = [
  "Organized the payments program across three centers.",
  "Analyzed customer behavior and prioritized fixes.",
  "Led delivery of the color management system for the London team."
].join("\n");

const FORMAL_CV =
  "Led delivery of the payments platform. Managed a team of six engineers. Built reporting pipelines in Python. " +
  "Reduced batch runtime by 40 per cent.";

/** 35 tokens once single letters are dropped, so it is over LONG_SENTENCE_WORDS. */
const LONG_RUN_ON =
  "Led the migration of the payments platform for Northwind Analytics and delivered a reporting service " +
  "that reduced batch runtime by 40 per cent across three regions and mentored four engineers through " +
  "the change across two countries.";

const PLAIN_CV = "I'm a backend developer. I've worked with Python for six years. I really enjoy mentoring.";

const BUZZWORDY =
  "We leverage synergy to facilitate robust holistic delivery. Best-in-class results-driven work with " +
  "stakeholder engagement and a deep dive on value-add.";

/* ------------------------------------------------------------------ *
 * spelling
 * ------------------------------------------------------------------ */

test("UK spelling is detected from the fixed word list", () => {
  const style = analyseStyle(UK_CV);
  assert.equal(style.spelling, "UK");
  assert.ok(SPELLING_PAIRS.some(([uk]) => uk === "organise"));
  assert.ok(SPELLING_PAIRS.some(([uk, us]) => uk === "centre" && us === "center"));
});

test("US spelling is detected from the fixed word list", () => {
  assert.equal(analyseStyle(US_CV).spelling, "US");
});

test("a text using both spellings is reported as mixed", () => {
  const mixed = analyseStyle("Organised the payments program and analyzed the behaviour of three teams.");
  assert.equal(mixed.spelling, "mixed");
});

test("a text with no spelling markers reports mixed rather than guessing", () => {
  const neutral = analyseStyle("Led delivery of the payments platform. Managed a team of six engineers.");
  assert.equal(neutral.spelling, "mixed");
});

/* ------------------------------------------------------------------ *
 * formality, person, tense, contractions
 * ------------------------------------------------------------------ */

test("plain first-person prose reads plain; impersonal bullets read formal", () => {
  const plain = analyseStyle(PLAIN_CV);
  const formal = analyseStyle(FORMAL_CV);
  assert.equal(plain.formality, "plain");
  assert.equal(formal.formality, "formal");
  assert.equal(plain.contractions, true);
  assert.equal(formal.contractions, false);
  assert.ok(FORMALITY_THRESHOLD > 0);
});

test("person separates I from he/she/they", () => {
  assert.equal(analyseStyle(PLAIN_CV).person, "first");
  assert.equal(analyseStyle("She led the payments team.").person, "third");
  assert.equal(analyseStyle("I led the team. She signed it off.").person, "mixed");
  assert.equal(analyseStyle(FORMAL_CV).person, "third");
});

test("tense follows the verb endings actually used", () => {
  assert.equal(analyseStyle(FORMAL_CV).tense, "past");
  assert.equal(analyseStyle("Manages a team of six engineers. Builds reporting pipelines in Python.").tense, "present");
  assert.equal(analyseStyle("").tense, "mixed");
});

test("em dashes are counted per hundred words", () => {
  const text = "Led delivery — reduced runtime — for three teams.";
  assert.equal(analyseStyle(text).emDashPer100Words, 28.6);
  assert.equal(analyseStyle("Led delivery of the platform.").emDashPer100Words, 0);
});

/* ------------------------------------------------------------------ *
 * buzzwords and filler openers
 * ------------------------------------------------------------------ */

test("every spec buzzword is in the table", () => {
  const terms = BUZZWORDS.map((entry) => entry.term);
  for (const term of [
    "leverage", "synergy", "utilise", "facilitate", "spearhead", "robust", "holistic",
    "stakeholder engagement", "paradigm", "best-in-class", "results-driven", "dynamic professional",
    "passionate", "detail-oriented", "going forward", "circle back", "touch base", "deep dive", "value-add"
  ]) {
    assert.ok(terms.includes(term), `missing buzzword ${term}`);
  }
});

test("buzzwords are found in table order, inflections and hyphenated phrases included", () => {
  const found = analyseStyle(BUZZWORDY).buzzwords;
  assert.deepEqual(found, [
    "leverage", "synergy", "facilitate", "robust", "holistic", "stakeholder engagement",
    "best-in-class", "results-driven", "deep dive", "value-add"
  ]);
  assert.deepEqual(analyseStyle("She leveraged synergies and spearheaded change.").buzzwords, [
    "leverage", "synergy", "spearhead"
  ]);
});

test("plain prose has no buzzwords", () => {
  assert.deepEqual(analyseStyle(FORMAL_CV).buzzwords, []);
});

test("filler openers are recognised at the start of a bullet and its sentences", () => {
  const bullets = [
    "Responsible for managing the payments team.",
    "- Worked on the migration of three services.",
    "Duties included: reporting and forecasting."
  ].join("\n");
  assert.deepEqual(analyseStyle(bullets).fillerOpeners, ["Responsible for", "Worked on", "Duties included"]);
  assert.equal(FILLER_OPENERS.length, 8);
  assert.deepEqual(analyseStyle(FORMAL_CV).fillerOpeners, []);
});

/* ------------------------------------------------------------------ *
 * rhythm, verbs, samples
 * ------------------------------------------------------------------ */

test("sentence rhythm reports count, average, median and longest", () => {
  const style = analyseStyle("One two three four five six seven eight nine ten.\nOne two three four five six.");
  assert.equal(style.sentences, 2);
  assert.equal(style.avgSentenceWords, 8);
  assert.equal(style.medianSentenceWords, 8);
  assert.equal(style.longestSentenceWords, 10);
});

test("strong verbs are counted and ranked", () => {
  const style = analyseStyle(FORMAL_CV);
  assert.deepEqual(style.strongVerbs.map((row) => row.verb), ["built", "led", "reduced"]);
  assert.equal(style.strongVerbs[0].count, 1);
  assert.ok(STRONG_VERBS.includes("mentored"));
});

test("sample sentences are real sentences from the text, at most three", () => {
  const style = analyseStyle(UK_CV);
  assert.ok(style.sampleSentences.length > 0 && style.sampleSentences.length <= 3);
  for (const sample of style.sampleSentences) assert.ok(UK_CV.includes(sample));
});

test("empty input returns a coherent zero object instead of throwing", () => {
  const style = analyseStyle("");
  assert.equal(style.sentences, 0);
  assert.equal(style.avgSentenceWords, 0);
  assert.equal(style.longestSentenceWords, 0);
  assert.equal(style.contractions, false);
  assert.deepEqual(style.buzzwords, []);
  assert.deepEqual(style.strongVerbs, []);
});

/* ------------------------------------------------------------------ *
 * styleMatch
 * ------------------------------------------------------------------ */

test("a text scoring against itself is a perfect match, and a foreign voice scores lower", () => {
  const perfect = styleMatch(UK_CV, UK_CV);
  const foreign = styleMatch(
    "I'm a developer who really organized lots of cool stuff. I've basically prioritized my own things. " +
      "I really leverage synergy when I circle back with stakeholders.",
    UK_CV
  );
  assert.equal(perfect.score, 100);
  assert.ok(perfect.score > foreign.score, `${perfect.score} should beat ${foreign.score}`);
  assert.ok(foreign.score < 60);
});

test("styleMatch replies with one specific reason per signal", () => {
  const result = styleMatch(UK_CV, US_CV);
  assert.equal(result.reasons.length, 6);
  assert.ok(result.reasons.some((reason) => /^your sentences average \d+(\.\d)? words; the rewrite averages/.test(reason)));
  assert.ok(result.reasons.some((reason) => /spells UK/.test(reason) && /spells US/.test(reason)));
  assert.ok(result.reasons.some((reason) => /buzzwords per 100 words/.test(reason)));
  assert.ok(result.reasons.some((reason) => /contractions/.test(reason)));
  assert.equal(STYLE_WEIGHTS.rhythm + STYLE_WEIGHTS.formality + STYLE_WEIGHTS.spelling + STYLE_WEIGHTS.verbs + STYLE_WEIGHTS.buzzwords + STYLE_WEIGHTS.contractions, 100);
});

test("styleMatch is symmetric in shape and bounded to 0-100", () => {
  const a = styleMatch(UK_CV, FORMAL_CV);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.ok(30 + 20 + 15 + 15 + 10 + 10 >= a.score);
});

/* ------------------------------------------------------------------ *
 * rewriteInStyle
 * ------------------------------------------------------------------ */

test("the rewriter removes filler, fixes spelling, replaces buzzwords and keeps numbers", () => {
  const before = [
    "Responsible for managing the payments team of 6 engineers.",
    "Organized the migration of 12 services and delivered a robust platform."
  ].join("\n");

  const { text, changes } = rewriteInStyle(before, { spelling: "UK" });

  assert.ok(!/Responsible for/i.test(text), text);
  assert.ok(/Managing the payments team of 6 engineers/.test(text), text);
  assert.ok(/Organised/.test(text) && !/Organized/.test(text), text);
  assert.ok(/reliable/.test(text) && !/robust/.test(text), text);
  assert.ok(text.includes("6") && text.includes("12"));
  assert.ok(changes.length >= 3);
  assert.ok(changes.some((change) => /filler opener/.test(change.reason)));
  assert.ok(changes.some((change) => /spelling/.test(change.reason)));
  assert.ok(changes.some((change) => /buzzword/.test(change.reason)));
  assert.equal(assertStyleSafe(before, text).ok, true);
});

test("a hedge is re-worded, not deleted, so the claim is not upgraded", () => {
  const { text } = rewriteInStyle("Assisted with the migration of three services.", { spelling: "UK" });
  assert.ok(/^Supported the migration of three services\.$/.test(text), text);
});

test("a sentence over the limit is split at a conjunction", () => {
  assert.equal(LONG_SENTENCE_WORDS, 32);

  const { text, changes } = rewriteInStyle(LONG_RUN_ON, { spelling: "UK" });
  assert.ok(/^Led the migration of the payments platform for Northwind Analytics\. Delivered/.test(text), text);
  assert.equal(analyseStyle(text).sentences, 2);
  assert.ok(changes.some((change) => /^Split a \d+-word sentence at "and"/.test(change.reason)));
  assert.equal(assertStyleSafe(LONG_RUN_ON, text).ok, true);
});

test("clean text is returned byte-identical with no changes", () => {
  const clean = "Led delivery of the payments platform for three teams.";
  const result = rewriteInStyle(clean, { spelling: "UK" });
  assert.equal(result.text, clean);
  assert.deepEqual(result.changes, []);
});

test("US spelling is converted in the other direction too", () => {
  const { text } = rewriteInStyle("Organised the programme for the centre.", { spelling: "US" });
  assert.equal(text, "Organized the program for the center.");
  assert.equal(rewriteInStyle("Organised it.", { spelling: "mixed" }).text, "Organised it.");
});

/* ------------------------------------------------------------------ *
 * assertStyleSafe
 * ------------------------------------------------------------------ */

test("a new number is rejected", () => {
  const result = assertStyleSafe("Led a team of 6 engineers.", "Led a team of 9 engineers.");
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('"9"') && /not in the original/.test(reason)));
});

test("a new proper-noun sequence is rejected", () => {
  const result = assertStyleSafe("Delivered reporting for the business.", "Delivered reporting for Northwind Analytics.");
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => /Northwind Analytics/.test(reason) && /not in the original/.test(reason)));
});

test("the rewriter's own output passes the safety check", () => {
  assert.deepEqual(assertStyleSafe("Led delivery of 3 services.", "Led delivery of 3 services."), { ok: true, reasons: [] });
});

test("a corrupted length is rejected in both directions", () => {
  const shrunk = assertStyleSafe(LONG_RUN_ON, "Led delivery.");
  const grown = assertStyleSafe("Led delivery of 3 services.", LONG_RUN_ON);
  assert.equal(shrunk.ok, false);
  assert.ok(shrunk.reasons.some((reason) => /minimum 45%/.test(reason)));
  assert.equal(grown.ok, false);
  assert.ok(grown.reasons.some((reason) => /maximum 220%/.test(reason)));
});

/* ------------------------------------------------------------------ *
 * determinism
 * ------------------------------------------------------------------ */

test("the same text always produces the same object", () => {
  assert.deepEqual(analyseStyle(UK_CV), analyseStyle(UK_CV));
  assert.deepEqual(analyseStyle(BUZZWORDY), analyseStyle(BUZZWORDY));
  assert.deepEqual(styleMatch(UK_CV, US_CV), styleMatch(UK_CV, US_CV));
  assert.deepEqual(rewriteInStyle(BUZZWORDY, { spelling: "UK" }), rewriteInStyle(BUZZWORDY, { spelling: "UK" }));
  assert.equal(JSON.stringify(analyseStyle(UK_CV)), JSON.stringify(analyseStyle(UK_CV)));
});
