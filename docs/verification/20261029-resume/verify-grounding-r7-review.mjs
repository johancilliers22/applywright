import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-r7-review.mjs <stopped-candidate> <new-result.json>');
const root = resolve(candidatePath);
const sourcePaths = ['server/lib/cv/tailor.js', 'server/lib/cv/refine.js'];
const hashSources = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (relative) => [relative, createHash('sha256').update(await readFile(join(root, relative))).digest('hex')])));
const beforeHashes = await hashSources();
const { assertGrounded } = await import(pathToFileURL(join(root, sourcePaths[0])));
const { groundChanges } = await import(pathToFileURL(join(root, sourcePaths[1])));

// Literal independent review cases, adjudicated against the source-claim contract.
// Expectations are fixed before execution; no candidate source or old oracle is edited.
const cases = [
  ['owned object cannot gain reviews', 'Personally owned design.', 'Personally owned design reviews.', false],
  ['multiline owned modifier cannot promote reviews', 'Helped with reviews.\nPersonally owned platform design.', 'Personally owned platform design reviews.', false],
  ['context owned modifier cannot promote reviews', 'Helped with reviews.', 'Personally owned platform design reviews.', false, { context: 'Personally owned platform design.' }],
  ['migration count cannot license leadership of engineers', 'Helped with engineers.\nLed 12 migrations.', 'Led 12 engineers.', false],
  ['faithful owned object permits trailing adjunct removal', 'Personally owned platform design at scale.', 'I personally owned platform design.', true],
  ['faithful explicit engineer leadership', 'Led 12 engineers.', 'I led 12 engineers.', true],
  ['faithful support remains support', 'Helped with reviews.', 'Supported reviews.', true],
  ['tool use does not license employer', 'Worked on services using Azure.', 'Worked at Azure.', false],
  ['skills context does not license employer', 'Worked on services.', 'Worked at Azure.', false, { context: 'Skills: Azure.' }],
  ['colleague seniority is not own title', 'Worked as an engineer.\nSupported senior colleagues.', 'Worked as a senior engineer.', false],
  ['faithful employer casing', 'Worked at Azure.', 'Worked at azure.', true],
  ['faithful technology use remains technology use', 'Built services with Azure.', 'Built Azure-based services.', true],
  ['faithful evidenced senior title', 'Worked as a senior engineer.', 'Worked as a senior engineer.', true],
  ['faithful title omits colleague description', 'Worked as an engineer.\nSupported senior colleagues.', 'Worked as an engineer.', true],
  ['English opener cannot become employer', 'Built services.', 'Use is my employer.', false],
  ['English noun cannot become employer', 'Built services.', 'Innovation is my employer.', false],
  ['English noun cannot invent complete title', 'Worked as an engineer.', 'Innovation engineer.', false],
  ['English use opener remains supported', 'Built services.', 'Use the existing services.', true],
  ['English work opener remains supported', 'Worked on services.', 'Work on the services.', true],
  ['faithful complete innovation title', 'Worked as an innovation engineer.', 'Innovation engineer.', true],
  ['four-word invented qualification subject', 'Holds a degree in engineering.', 'Has a degree in digital product systems engineering.', false],
  ['IT work does not change qualification subject', 'Holds a degree in engineering.\nWorked in IT support.', 'Has a degree in IT engineering.', false],
  ['design work does not change qualification subject', 'Holds a degree in engineering.\nWorked on design.', 'Has a degree in design engineering.', false],
  ['faithful four-word qualification subject', 'Holds a degree in digital product systems engineering.', 'Has a degree in digital product systems engineering.', true],
  ['faithful IT qualification subject', 'Holds a degree in IT engineering.', 'Has a degree in IT engineering.', true],
  ['credential subject can be omitted', 'Holds a degree in engineering.', 'Has a degree.', true],
  ['degree idiom remains ordinary English', 'Completed work accurately.', 'Completed work with a high degree of accuracy.', true],
  ['new abbreviated June is a date invention', 'Worked through spring.', 'Worked through Jun.', false],
  ['new abbreviated September is a date invention', 'Worked through spring.', 'Worked through Sept.', false],
  ['abbreviated to full month is same date', 'Worked through Jun.', 'Worked through June.', true],
  ['full to abbreviated month is same date', 'Worked through June.', 'Worked through Jun.', true],
  ['faithful calendar May', 'Worked through May.', 'Worked until May.', true],
  ['modal May remains ordinary English', 'You may relocate.', 'May relocate.', true],
  ['multiplier cannot become milliseconds', 'Improved throughput by 3x.', 'Improved throughput by 3 ms.', false],
  ['hours cannot become days', 'Completed work in 3 hours.', 'Completed work in 3 days.', false],
  ['times and x are same multiplier', 'Improved throughput by 3 times.', 'Improved throughput by 3x.', true],
  ['spelled and digit count retain hour unit', 'Completed work in three hours.', 'Completed work in 3 hours.', true],
];
const rows = [];
function record(name, predicate, before, after, options, expected, actual, extra = {}) {
  const diagnostic = actual?.reasons ?? actual?.reason ?? actual?.errors;
  const hasRejectionDiagnostic = expected || (Array.isArray(diagnostic) ? diagnostic.length > 0 : typeof diagnostic === 'string' && diagnostic.length > 0);
  rows.push({ name, predicate, before, after, options, expected, actual, ...extra, pass: actual?.ok === expected && hasRejectionDiagnostic && extra.warningMatches !== false });
}
for (const [name, before, after, expected, options = {}] of cases) {
  for (const [predicate, fn] of [['assertGrounded', assertGrounded], ['groundChanges', groundChanges]]) {
    try { record(name, predicate, before, after, options, expected, fn(before, after, options)); }
    catch (error) { rows.push({ name, predicate, before, after, options, expected, pass: false, error: error.message }); }
  }
}
// Tailor is deliberately one-way; only refine promises to reject dropped metrics.
const metricBefore = 'Processed 100000000 requests.';
record('long metric is not dropped contact data', 'groundChanges', metricBefore, 'Processed requests.', {}, false, groundChanges(metricBefore, 'Processed requests.'));
const contactBefore = 'Contact: 07700 900123\nProcessed 100000000 requests.';
const contactAfter = 'Processed 100000000 requests.';
const contactResult = groundChanges(contactBefore, contactAfter);
record('actual phone may be omitted while metric stays', 'groundChanges', contactBefore, contactAfter, {}, true, contactResult, { warningMatches: /contact|phone|07700|900123/i.test(JSON.stringify(contactResult.warnings ?? [])) });

const afterHashes = await hashSources();
const sourceUnchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
const failed = rows.filter((row) => !row.pass);
const result = {
  atUtc: new Date().toISOString(), candidateRoot: root,
  provenance: 'Independent Sol R7 REQUEST_CHANGES plus operator source-contract adjudication; written before execution; older 211-case oracles and frozen candidate untouched',
  scope: 'Offline pure synthetic predicates only; no server, browser, live model, credentials or production data',
  beforeHashes, afterHashes, sourceUnchanged,
  comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows,
};
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent R7 review fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed; source unchanged ${sourceUnchanged}`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length || !sourceUnchanged) process.exitCode = 1;
