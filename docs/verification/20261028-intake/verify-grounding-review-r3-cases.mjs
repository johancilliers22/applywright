import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-review-r3-cases.mjs <stopped-candidate-root> <new-result.json>');
const root = resolve(candidatePath);
const { assertGrounded } = await import(pathToFileURL(join(root, 'server/lib/cv/tailor.js')));
const { groundChanges } = await import(pathToFileURL(join(root, 'server/lib/cv/refine.js')));
const cases = [
  ['design object provenance', 'Helped with design.\nPersonally owned successful migration.', 'Personally owned successful design.', false],
  ['design context cannot promote', 'Helped with design.', 'Personally owned successful design.', false, { context: 'Personally owned successful migration.' }],
  ['faithful design ownership', 'Personally owned design.', 'I personally owned design.', true],
  ['modifiers cannot outweigh object', 'Helped with testing.\nPersonally owned successful complex migration.', 'Personally owned successful complex testing.', false],
  ['wrapper support noun hides leadership', 'Helped with managing 12 engineers.', 'Experience in customer support leading 12 engineers.', false],
  ['wrapper leadership evidence retained', 'Experience in customer support leading 12 engineers.', 'Led 12 engineers.', true],
  ['multiword qualification noun', 'Holds a degree in computing.', 'Holds a degree in design engineering.', false],
  ['same multiword qualification', 'Holds a degree in design engineering.', 'Has a degree in design engineering.', true],
  ['hyphenated one-day is new count', 'Completed work in cycles.', 'Completed work in one-day cycles.', false],
  ['hyphenated one-day equivalent', 'Completed work in one-day cycles.', 'Completed work in 1-day cycles.', true],
  ['sentence-initial language list', 'Built services.', 'Built Go-based services.', true, { context: 'Go and Python.' }],
  ['ordinary go remains a verb', 'Built services and chose to go remote.', 'Built Go-based services and chose to go remote.', false],
];
const rows = [];
for (const [name, before, after, expected, options = {}] of cases) {
  for (const [predicate, fn] of [['assertGrounded', assertGrounded], ['groundChanges', groundChanges]]) {
    try {
      const actual = fn(before, after, options);
      rows.push({ name, predicate, before, after, options, expected, actual, pass: actual.ok === expected });
    } catch (error) {
      rows.push({ name, predicate, before, after, options, expected, pass: false, error: error.message });
    }
  }
}
const hashes = {};
for (const relative of ['server/lib/cv/tailor.js', 'server/lib/cv/refine.js']) hashes[relative] = createHash('sha256').update(await readFile(join(root, relative))).digest('hex');
const failed = rows.filter((row) => !row.pass);
const result = { atUtc: new Date().toISOString(), candidateRoot: root, hashes, provenance: 'Independent Sol R3 source report dated22:57; script authored without inspecting the R4 implementation', scope: 'Pure synthetic function calls; no server/network/model/credentials/live data', comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows };
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent R3-review-derived grounding fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length) process.exitCode = 1;
