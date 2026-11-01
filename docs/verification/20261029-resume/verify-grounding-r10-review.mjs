import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-r10-review.mjs <stopped-candidate> <new-result.json>');
const root = resolve(candidatePath);
const sourcePaths = ['server/lib/cv/tailor.js', 'server/lib/cv/refine.js'];
const hashSources = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (relative) => [relative, createHash('sha256').update(await readFile(join(root, relative))).digest('hex')])));
const beforeHashes = await hashSources();
const { assertGrounded } = await import(pathToFileURL(join(root, sourcePaths[0])));
const { groundChanges } = await import(pathToFileURL(join(root, sourcePaths[1])));

// Literal claim-role controls fixed before any execution of the current candidate.
// Numbers, actors and units remain attached to the claim that originally states them.
const pairs = [
  ['same-clause measures cannot trade values', 'Latency was 3 ms and processing time was 5 ms.', 'Latency was 5 ms and processing time was 3 ms.', false],
  ['faithful same-clause measures retain associations', 'Latency was 3 ms and processing time was 5 ms.', 'Latency was 3 ms; processing time was 5 ms.', true],
  ['colleague employer is not candidate employment', 'My colleague worked at Initech.', 'I worked at Initech.', false],
  ['candidate employer may add explicit first person', 'Worked at Initech.', 'I worked at Initech.', true],
  ['colleague title and employer are not candidate claims', 'My colleague worked as a senior engineer at Initech. I worked as an engineer at Acme.', 'I worked as a senior engineer at Initech.', false],
  ['faithful own title and employer survive colleague context', 'My colleague worked as a senior engineer at Initech. I worked as an engineer at Acme.', 'I worked as an engineer at Acme.', true],
  ['storage units cannot be upgraded', 'Reduced storage to 3 GB.', 'Reduced storage to 3 TB.', false],
  ['storage units permit case-insensitive identity', 'Reduced storage to 3 GB.', 'Reduced storage to 3 gb.', true],
  ['owned design cannot acquire meetings', 'Personally owned design.', 'Personally owned design review meetings.', false],
  ['owned complete object can retain first-person actor', 'Personally owned design review meetings.', 'I personally owned design review meetings.', true],
  ['migration leadership cannot acquire people object', 'Led 12 migrations over two years.', 'Led 12 engineers over two years.', false],
  ['people leadership preserves people and duration', 'Led 12 engineers over two years.', 'I led 12 engineers over two years.', true],
  ['qualification owner cannot be changed', 'My colleague holds a degree in mechanical engineering.', 'I hold a degree in mechanical engineering.', false],
  ['own qualification retains complete subject', 'I hold a degree in mechanical engineering.', 'Holds a degree in mechanical engineering.', true],
];
const rows = [];
function run(name, predicate, fn, before, after, expected) {
  try {
    const actual = fn(before, after);
    const diagnostics = actual?.reasons ?? actual?.reason ?? actual?.errors;
    const explained = expected || (Array.isArray(diagnostics) ? diagnostics.length > 0 : typeof diagnostics === 'string' && diagnostics.length > 0);
    rows.push({ name, predicate, before, after, expected, actual, pass: actual?.ok === expected && explained });
  } catch (error) {
    rows.push({ name, predicate, before, after, expected, pass: false, error: error.message });
  }
}
for (const [name, before, after, expected] of pairs) {
  run(name, 'assertGrounded', assertGrounded, before, after, expected);
  run(name, 'groundChanges', groundChanges, before, after, expected);
}
// Only refine promises to reject dropping a source metric.
run('long metric with five ordinary modifiers is not a phone', 'groundChanges', groundChanges,
  'Processed 100000000 critical customer payment reconciliation service requests.',
  'Processed critical customer payment reconciliation service requests.', false);
const afterHashes = await hashSources();
const sourceUnchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
const failed = rows.filter((row) => !row.pass);
const result = {
  atUtc: new Date().toISOString(), candidateRoot: root,
  provenance: 'Operator literal adjudicated R10 adverse traces and faithful controls; authored before execution; previous211 and76 oracles unchanged',
  scope: 'Offline pure synthetic predicates; no model/API/network/server/browser/credentials or real CV data',
  beforeHashes, afterHashes, sourceUnchanged,
  comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows,
};
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent R10 review fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed; source unchanged ${sourceUnchanged}`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}; ${JSON.stringify(row.actual ?? row.error)}`);
if (failed.length || !sourceUnchanged) process.exitCode = 1;
