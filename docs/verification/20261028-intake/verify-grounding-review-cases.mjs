import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-review-cases.mjs <candidate-root> <new-result.json>');
const root = resolve(candidatePath);
const { assertGrounded } = await import(pathToFileURL(join(root, 'server/lib/cv/tailor.js')));
const { groundChanges } = await import(pathToFileURL(join(root, 'server/lib/cv/refine.js')));
const cases = [
  ['coordinated object promotion', 'Helped with the migration and rollout.', 'Delivered the rollout.', false],
  ['intro without comma', 'Helped with managing 12 engineers.', 'In this role I led 12 engineers.', false],
  ['leadership inflection', 'Helped with managing 12 engineers.', 'Effectively leads 12 engineers.', false],
  ['backed later leadership', 'Helped with the migration before I led the rollout.', 'Led the rollout.', true],
  ['unrelated overlap', 'Helped with testing.\nPersonally owned migration.', 'Personally owned testing.', false],
  ['unrelated context', 'Helped with testing.', 'Personally owned testing.', false, { context: 'Personally owned migration.' }],
  ['qualification conjunction', 'Holds a degree in computing.', 'Holds a degree in computing and medicine.', false],
  ['qualification prefix subject', 'Holds a computing degree.', 'Holds a medicine degree.', false],
  ['long title seniority', 'Worked as a backend software engineer.', 'Worked as a principal backend software engineer.', false],
  ['Go verb is not language', 'Built services and chose to go remote.', 'Built Go-based services and chose to go remote.', false],
  ['this May date', 'Worked through spring.', 'Worked this May.', false],
  ['new one-day duration', 'Completed work.', 'Completed work in one day.', false],
  ['one-day equivalent', 'Completed work in one day.', 'Completed work in 1 day.', true],
  ['thirteen equivalent', 'Built thirteen services.', 'Built 13 services.', true],
  ['forty equivalent', 'Built forty services.', 'Built 40 services.', true],
];
const rows = [];
for (const [name, before, after, expected, options = {}] of cases) {
  for (const [predicate, fn] of [['assertGrounded', assertGrounded], ['groundChanges', groundChanges]]) {
    try {
      const actual = fn(before, after, options);
      rows.push({ name, predicate, before, after, options, expected, actual, pass: actual.ok === expected });
    } catch (error) {
      rows.push({ name, predicate, expected, pass: false, error: error.message });
    }
  }
}
const phone = groundChanges('Product engineer. 07700 900123', 'Product engineer.');
rows.push({ name: 'dropped phone stays warning', predicate: 'groundChanges', expected: 'accepted with contact warning', actual: phone, pass: phone.ok === true && phone.warnings.length > 0 });
const hashes = {};
for (const relative of ['server/lib/cv/tailor.js', 'server/lib/cv/refine.js']) {
  hashes[relative] = createHash('sha256').update(await readFile(join(root, relative))).digest('hex');
}
const failed = rows.filter((row) => !row.pass);
const result = { atUtc: new Date().toISOString(), candidateRoot: root, hashes, provenance: 'Synthetic cases fixed from independent Sol SOURCE report; existing two unit files additionally cover rejected-model diagnostic propagation', scope: 'Direct pure functions only; no server/network/model/credentials/live data', comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows };
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent review-derived grounding fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length) process.exitCode = 1;
