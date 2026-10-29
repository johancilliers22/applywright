import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-review-r45-cases.mjs <stopped-candidate-root> <new-result.json>');
const root = resolve(candidatePath);
const { assertGrounded } = await import(pathToFileURL(join(root, 'server/lib/cv/tailor.js')));
const { groundChanges } = await import(pathToFileURL(join(root, 'server/lib/cv/refine.js')));
const cases = [
  ['r4 trailing scale cannot transfer ownership', 'Helped with design.\nPersonally owned successful migration at scale.', 'Personally owned successful design at scale.', false],
  ['r4 trailing scale context cannot transfer ownership', 'Helped with design.', 'Personally owned successful design at scale.', false, { context: 'Personally owned successful migration at scale.' }],
  ['r4 faithful trailing phrase drop', 'Personally owned design at scale.', 'I personally owned design.', true],
  ['r4 governing leading gerund', 'Helped with the support team.', 'Experience in leading the support team.', false],
  ['r4 evidenced leading gerund', 'Experience in leading the support team.', 'Led the support team.', true],
  ['r4 whole degree subject', 'Holds a degree in engineering.', 'Holds a degree in design engineering.', false],
  ['r4 whole prenominal degree subject', 'Holds an engineering degree.', 'Holds a design engineering degree.', false],
  ['r4 same full degree subject', 'Holds a degree in design engineering.', 'Has a degree in design engineering.', true],
  ['r4 Go and imperative is not language', 'Built services.', 'Built Go-based services.', false, { context: 'Go and build services.' }],
  ['r4 Go or imperative is not language', 'Built services.', 'Built Go-based services.', false, { context: 'Go or deploy services.' }],
  ['r4 Go and Python list', 'Built services.', 'Built Go-based services.', true, { context: 'Go and Python.' }],
  ['r4 Go or Rust list', 'Built services.', 'Built Go-based services.', true, { context: 'Go or Rust.' }],
  ['r5 modifier is not ownership object', 'Helped with design.\nPersonally owned platform design reviews.', 'Personally owned platform design.', false],
  ['r5 modifier context is not ownership object', 'Helped with design.', 'Personally owned platform design.', false, { context: 'Personally owned platform design reviews.' }],
  ['r5 duration does not anchor unrelated object', 'Helped with design.\nPersonally owned platform migration in 12 weeks.', 'Personally owned platform design in 12 weeks.', false],
  ['r5 contextual duration does not anchor unrelated object', 'Helped with design.', 'Personally owned platform design in 12 weeks.', false, { context: 'Personally owned platform migration in 12 weeks.' }],
  ['r5 faithful platform design trailing phrase', 'Personally owned platform design at scale.', 'I personally owned platform design.', true],
  ['r5 adverb does not hide leading gerund', 'Helped with support teams.', 'Experience in effectively leading support teams.', false],
  ['r5 evidenced adverb leading gerund', 'Experience in effectively leading support teams.', 'Led support teams.', true],
  ['r5 IT qualification is not pronoun', 'Holds a degree in engineering.', 'Holds a degree in IT engineering.', false],
  ['r5 IT prenominal qualification is not pronoun', 'Holds an engineering degree.', 'Holds an IT engineering degree.', false],
  ['r5 faithful IT engineering qualification', 'Holds a degree in IT engineering.', 'Has a degree in IT engineering.', true],
  ['r5 punctuated Build is not language', 'Built services.', 'Built Go-based services.', false, { context: 'Go and Build.' }],
  ['r5 punctuated Deploy is not language', 'Built services.', 'Built Go-based services.', false, { context: 'Go or Deploy.' }],
  ['r5 punctuated lowercase python list', 'Built services.', 'Built Go-based services.', true, { context: 'Go and python.' }],
  ['r5 punctuated lowercase rust list', 'Built services.', 'Built Go-based services.', true, { context: 'Go or rust.' }],
  ['r45 ordinary go remote remains verb', 'Built services and chose to go remote.', 'Built Go-based services and chose to go remote.', false],
  ['r45 both original and contextual ownership objects', 'Helped with design.', 'Helped with design.', true, { context: 'Personally owned platform design reviews.' }],
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
const result = { atUtc: new Date().toISOString(), candidateRoot: root, hashes, provenance: 'Literal independent Sol R4/R5 findings plus paired controls; authored without reading R5/R6 implementation; source reports retained, no older oracle edited', scope: 'Pure synthetic function calls; no server/network/model/credentials/live data', comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows };
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent R4/R5-review-derived grounding fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length) process.exitCode = 1;
