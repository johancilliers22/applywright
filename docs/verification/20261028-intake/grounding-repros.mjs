import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertGrounded } from '../../../server/lib/cv/tailor.js';
import { groundChanges } from '../../../server/lib/cv/refine.js';

const cases = [
  ['employer-opener', 'Built services.', 'Initech is my employer.'],
  ['hyphen-employer', 'Worked on services.', 'Worked at Initech-labs.'],
  ['unsupported-go', 'Reduced deploy time by 40% by rebuilding the pipeline.', 'Cut deploy time by 40% with Go-based services.'],
  ['ownership-adverb', 'Helped with managing 12 engineers.', 'Effectively led 12 engineers.'],
  ['ownership-multiline', 'Experience\nHelped with managing 12 engineers across two squads.', 'Led a team of 12 engineers across two squads.'],
  ['degree-subject', 'Holds a degree in computing.', 'Holds a degree in medicine.'],
  ['seniority', 'Worked as a software engineer.', 'Worked as a principal software engineer.'],
  ['month-may', 'Worked through spring.', 'Worked through May.'],
  ['spelled-one', 'Built services.', 'Built one service.'],
  ['currency', 'Saved £40,000 a year.', 'Saved $40,000 a year.'],
  ['ordinary-experience', 'Built web services.', 'Experience building web services.'],
  ['ordinary-collaborates', 'Worked effectively with colleagues.', 'Collaborates effectively with colleagues.'],
  ['ordinary-degree', 'Completed work accurately.', 'Completed work with a high degree of accuracy.'],
];
const output = {
  candidate: '86b74c3a1869255ce276cfe961474193d6080ca0',
  atUtc: new Date().toISOString(),
  scope: 'Synthetic fixtures; direct pure exported functions; no server, credentials, model/API/network, source writes or live data',
  cases: cases.map(([name, before, after]) => ({ name, before, after, assertGrounded: assertGrounded(before, after), groundChanges: groundChanges(before, after) })),
  softOpener: assertGrounded('Built services.', 'Zephyria delivers services.', { softSentenceStart: true }),
};
await writeFile(fileURLToPath(new URL('./grounding-repros.json', import.meta.url)), JSON.stringify(output, null, 2) + '\n');
for (const row of output.cases) console.log(`${row.name}: assert=${row.assertGrounded.ok} refine=${row.groundChanges.ok}`);
console.log(`soft-opener: assert=${output.softOpener.ok}`);
