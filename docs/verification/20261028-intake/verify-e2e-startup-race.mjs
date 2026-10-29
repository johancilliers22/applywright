import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, resultPath] = process.argv.slice(2);
if (!candidatePath || !resultPath) throw new Error('Usage: node verify-e2e-startup-race.mjs <stopped-candidate-root> <new-result.json>');
const sourcePath = join(resolve(candidatePath), 'scripts/e2e-browser-child.mjs');
const { OWNED_CHILD_PROTOCOL, runOwnedBrowserChild } = await import(pathToFileURL(sourcePath));
const output = resolve(resultPath);
const fixture = join(dirname(output), 'synthetic-startup-fixture.txt');
await writeFile(fixture, 'synthetic nonempty fixture\n', { flag: 'wx' });

function scheduler() {
  let now = 0;
  let sequence = 0;
  const active = new Map();
  return {
    active,
    now: () => now,
    setTimeout(callback, milliseconds) {
      const id = ++sequence;
      active.set(id, { at: now + milliseconds, callback });
      return id;
    },
    clearTimeout(id) { active.delete(id); },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const next = [...active].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        active.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = target;
    },
  };
}

async function scenario(name, startedAfterMs, expected) {
  const wrapper = new EventEmitter();
  wrapper.pid = 5150;
  wrapper.stdout = new PassThrough();
  wrapper.stderr = new PassThrough();
  const writes = [];
  const kills = [];
  wrapper.stdin = new EventEmitter();
  wrapper.stdin.write = (chunk) => { writes.push(String(chunk)); return true; };
  wrapper.stdin.end = () => {};
  wrapper.kill = (signal) => { kills.push(signal); return true; };
  const clock = scheduler();
  const abort = new AbortController();
  const promise = runOwnedBrowserChild({
    executablePath: 'C:\\synthetic\\chrome.exe', args: [], cwd: 'C:\\synthetic',
    label: name, timeoutMs: 5000, startupTimeoutMs: 30000,
    terminationGraceMs: 30000, closeGraceMs: 5000, platform: 'win32',
    scheduler: clock, signal: abort.signal, expectFile: fixture,
    spawnImpl: () => wrapper,
  });
  const settled = promise.then(value => ({ kind: 'resolved', outcome: value }), error => ({ kind: 'rejected', code: error.code, message: error.message }));
  clock.advance(startedAfterMs);
  const line = message => wrapper.stdout.write(JSON.stringify({ protocol: OWNED_CHILD_PROTOCOL, ...message }) + '\n');
  line({ kind: 'started', pid: 6001 });
  line({ kind: 'exit', pid: 6001, exitCode: 0, activeProcesses: 0, jobClosed: true, forcedDescendants: false, created: true, started: true });
  wrapper.stdout.end();
  wrapper.stderr.end();
  wrapper.emit('close', 0, null);
  const actual = await settled;
  const listeners = ['error', 'exit', 'close'].map(event => ({ event, count: wrapper.listenerCount(event) }));
  const cleanup = clock.active.size === 0 && listeners.every(row => row.count === 0) && getEventListeners(abort.signal, 'abort').length === 0 && kills.length === 0;
  const outcomeCorrect = actual.kind === expected && (expected !== 'rejected' || /start|timeout|timed out/i.test(actual.message ?? ''));
  return { name, startedAfterMs, expected, actual, writes, kills, remainingTimers: clock.active.size, listeners, abortListeners: getEventListeners(abort.signal, 'abort').length, pass: outcomeCorrect && cleanup };
}

const rows = [
  await scenario('startup expiry survives late started and natural exit', 30001, 'rejected'),
  await scenario('within startup bound natural exit remains successful', 29999, 'resolved'),
];
const result = {
  atUtc: new Date().toISOString(), candidateRoot: resolve(candidatePath),
  sourceSha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex'),
  provenance: 'Independent literal Sol R4 startup-race trace plus timed natural-success control; synthetic scheduler/protocol only',
  actualProcessSpawned: false, nativeApisCalled: false, browserOrModelCalled: false,
  comparisons: rows.length, passed: rows.filter(row => row.pass).length, failed: rows.filter(row => !row.pass).length, rows,
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`Independent startup race: ${result.passed}/${result.comparisons}; ${result.failed} failed`);
for (const row of rows) console.log(JSON.stringify(row));
if (result.failed) process.exitCode = 1;
