import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-review-r2-cases.mjs <stopped-candidate-root> <new-result.json>');
const root = resolve(candidatePath);
const { assertGrounded } = await import(pathToFileURL(join(root, 'server/lib/cv/tailor.js')));
const { groundChanges } = await import(pathToFileURL(join(root, 'server/lib/cv/refine.js')));
const cases = [
  ['object noun testing retains provenance', 'Helped with testing.\nPersonally owned successful migration.', 'Personally owned successful testing.', false],
  ['context cannot license unrelated testing', 'Helped with testing.', 'Personally owned successful testing.', false, { context: 'Personally owned successful migration.' }],
  ['grounded testing ownership', 'Personally owned testing.', 'I personally owned testing.', true],
  ['source wrapper support stays support', 'Experience supporting the rollout.', 'Delivered the rollout.', false],
  ['source wrapper leadership retained', 'Experience leading the rollout.', 'Led the rollout.', true],
  ['wrapper noun cannot hide leadership', 'Helped with managing 12 engineers.', 'Experience in payments leading 12 engineers.', false],
  ['third-person intro promotion', 'Helped with managing 12 engineers.', 'In this role he led 12 engineers.', false],
  ['implicit-subject intro promotion', 'Helped with managing 12 engineers.', 'In this role effectively led 12 engineers.', false],
  ['third-person temporal evidence', 'Helped with the migration before he led the rollout.', 'Led the rollout.', true],
  ['comma-separated degree additions', 'Holds a degree in computing.', 'Holds a degree in computing, medicine and physics.', false],
  ['honours descriptor cannot hide subject', 'Holds an honours computing degree.', 'Holds an honours medicine degree.', false],
  ['design is a qualification noun', 'Holds a degree in computing.', 'Holds a degree in design.', false],
  ['same honours subject', 'Holds an honours computing degree.', 'Holds a computing degree.', true],
  ['degree subject may be dropped', 'Holds a degree in computing.', 'Holds a degree.', true],
  ['one case is a new count', 'Handled cases.', 'Handled one case.', false],
  ['one case numeric equivalent', 'Handled one case.', 'Handled 1 case.', true],
  ['explicit Go list evidence', 'Built services.', 'Built Go-based services.', true, { context: 'Skills: Go and Python.' }],
  ['technology compound case equivalent', 'Built go-based services.', 'Built Go-based services.', true],
  ['ordinary go remains unsupported', 'Built services and chose to go remote.', 'Built Go-based services and chose to go remote.', false],
  ['same currency shortened', 'Saved £40,000 a year.', 'Saved £40k a year.', true],
  ['same currency expanded', 'Saved £40k a year.', 'Saved £40,000 a year.', true],
  ['currency symbol to code equivalent', 'Saved £40,000 a year.', 'Saved GBP 40,000 a year.', true],
  ['currency code to symbol equivalent', 'Saved GBP 40,000 a year.', 'Saved £40,000 a year.', true],
  ['currency identity cannot change', 'Saved £40,000 a year.', 'Saved $40,000 a year.', false],
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
const result = { atUtc: new Date().toISOString(), candidateRoot: root, hashes, provenance: 'Independent Sol R2 source report plus actual R2 unit currency regressions; fixed before the next candidate', scope: 'Pure synthetic function calls; no server/network/model/credentials/live data', comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows };
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent R2-review-derived grounding fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length) process.exitCode = 1;
