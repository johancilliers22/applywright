import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) throw new Error('Usage: node verify-grounding-candidate.mjs <candidate-root> <new-result.json>');
const root = resolve(candidatePath);
const { assertGrounded } = await import(pathToFileURL(join(root, 'server/lib/cv/tailor.js')));
const { groundChanges } = await import(pathToFileURL(join(root, 'server/lib/cv/refine.js')));

// Fixed synthetic claims make this an independent semantic oracle, not a copy
// of a proposed implementation's token lists or test expectations.
const negatives = [
  ['employer opener', 'Built services.', 'Initech is my employer.'],
  ['hyphenated employer', 'Worked on services.', 'Worked at Initech-labs.'],
  ['lowercase employer', 'Worked on services.', 'Worked at initech.'],
  ['unverified Go', 'Reduced deploy time by 40% by rebuilding the pipeline.', 'Cut deploy time by 40% with Go-based services.'],
  ['ownership adverb', 'Helped with managing 12 engineers.', 'Effectively led 12 engineers.'],
  ['multiline ownership', 'Experience\nHelped with managing 12 engineers across two squads.', 'Led a team of 12 engineers across two squads.'],
  ['unrelated leadership', 'Helped audit 12 engineers.\nLed a sales team of 4.', 'Led audits of 12 engineers and a sales team of 4.'],
  ['qualification subject', 'Holds a degree in computing.', 'Holds a degree in medicine.'],
  ['title seniority', 'Worked as a software engineer.', 'Worked as a principal software engineer.'],
  ['new contextual May', 'Worked through spring.', 'Worked through May.'],
  ['new spelled count', 'Built services.', 'Built one service.'],
  ['currency swap', 'Saved £40,000 a year.', 'Saved $40,000 a year.'],
];
const positives = [
  ['Experience grammar', 'Built web services.', 'Experience building web services.'],
  ['Collaborates grammar', 'Worked effectively with colleagues.', 'Collaborates effectively with colleagues.'],
  ['degree idiom', 'Completed work accurately.', 'Completed work with a high degree of accuracy.'],
  ['backed Go', 'Reduced deploy time by 40% by rebuilding Go services.', 'Cut deploy time by 40% with Go-based services.'],
  ['backed ownership', 'Backend engineer. I led a team of 12 engineers.', 'Led a team of 12 engineers.'],
  ['support stays support', 'Helped with managing 12 engineers.', 'Supported management of 12 engineers.'],
  ['same qualification', 'Holds a degree in computing.', 'Has a degree in computing.'],
  ['same seniority', 'Worked as a software engineer.', 'Worked as a software engineer.'],
  ['backed May', 'Worked through May.', 'Worked until May.'],
  ['modal may', 'Work with colleagues.', 'May work with colleagues.'],
  ['one equivalent', 'Built one service.', 'Built 1 service.'],
  ['same currency', 'Saved £40,000 a year.', 'Saved £40,000 annually.'],
];

const rows = [];
for (const [kind, cases, expected] of [['unsupported', negatives, false], ['grounded', positives, true]]) {
  for (const [name, before, after] of cases) {
    for (const [predicate, fn] of [['assertGrounded', assertGrounded], ['groundChanges', groundChanges]]) {
      const actual = fn(before, after);
      rows.push({ kind, name, predicate, before, after, expected, actual, pass: actual.ok === expected });
    }
  }
}
for (const [predicate, fn] of [['assertGrounded', assertGrounded], ['groundChanges', groundChanges]]) {
  const actual = fn('Built services.', 'Zephyria delivers services.', { softSentenceStart: true });
  rows.push({ kind: 'unsupported', name: 'soft unknown opener', predicate, expected: false, actual, pass: actual.ok === false });
}
const hashes = {};
for (const relative of ['server/lib/cv/tailor.js', 'server/lib/cv/refine.js']) {
  hashes[relative] = createHash('sha256').update(await readFile(join(root, relative))).digest('hex');
}
const failed = rows.filter((row) => !row.pass);
const result = { atUtc: new Date().toISOString(), candidateRoot: root, hashes, scope: 'Synthetic direct pure functions; no live model/server/network/credentials; bounded known-claim coverage only', comparisons: rows.length, passed: rows.length - failed.length, failed: failed.length, rows };
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent grounding fixtures: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of failed) console.log(`FAIL ${row.predicate}: ${row.name}; expected ${row.expected}, actual ${row.actual.ok}; ${JSON.stringify(row.actual.reasons)}`);
if (failed.length) process.exitCode = 1;
