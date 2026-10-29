/**
 * The owned-process half of scripts/e2e-flow.mjs, proved without Chrome.
 *
 * The journey itself needs a real browser; what can be checked without one is
 * that a temporary browser cannot be reported as successful unless its whole
 * process tree was proved closed, and that every failure shape (spawn error,
 * nonzero exit, timeout, cancellation, kill failure, a wrapper that dies before
 * reporting, a job that still has members) rejects with an actionable error and
 * no leaked timer or listener.
 *
 * The wrapper is a real Windows Job Object owner (scripts/e2e-browser-child.ps1);
 * these tests drive the Node half with controlled dummy children that speak the
 * same JSON-line protocol. They execute no browser, no PowerShell and no Win32
 * job API, so they are safe to run beside other owners.
 *
 * Native opt-in
 * -------------
 * The `WINDOWS NATIVE OPT-IN` definitions execute the real wrapper, real
 * PowerShell Job Objects and synthetic Node child/grandchild processes. They are
 * skipped unless ALL hold: the host is Windows, and the explicit environment
 * variable APPLYWRIGHT_E2E_NATIVE_QUALIFIER is exactly "1". This is a
 * project-local test opt-in, not a global guard/slot change. Ordinary SOURCE
 * runs execute nothing native; the operator runs them only in the admitted EX
 * window, for example:
 *
 *   $env:APPLYWRIGHT_E2E_NATIVE_QUALIFIER = "1"
 *   node --test tests/e2e-browser-child.test.mjs
 *   Remove-Item Env:\APPLYWRIGHT_E2E_NATIVE_QUALIFIER
 *
 * The qualifiers give the wrapper a separate finite startup/readiness bound,
 * arm the short operation clock only after the captured root/grandchild record
 * is complete and both processes are alive, wire test cancellation to the
 * handle's owned termination, and give the wrapper the same 30 s supervision
 * grace the production path uses, above its 20 s shared cleanup budget. Their
 * post-termination probes use the test-context signal, never the deliberately
 * aborted operation controller.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CLOSE_GRACE_MS,
  DEFAULT_TERMINATION_GRACE_MS,
  DEFAULT_WRAPPER_PATH,
  NATIVE_CLEANUP_BUDGET_MS,
  OWNED_CHILD_PROTOCOL,
  OwnedBrowserChildError,
  buildWrapperInvocation,
  provesNoCleanupNeeded,
  runOwnedBrowserChild,
  startOwnedBrowserChild,
} from "../scripts/e2e-browser-child.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHROME = "C:\\fake\\chrome.exe";
const CWD = "C:\\fake\\work";
const NATIVE_QUALIFIER_FLAG = "APPLYWRIGHT_E2E_NATIVE_QUALIFIER";

/** A ChildProcess-shaped double: stdout/stderr are streams, stdin is a sink. */
class FakeWrapper extends EventEmitter {
  constructor({ pid = 5150 } = {}) {
    super();
    this.pid = pid;
    this.lastStartedPid = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdinWrites = [];
    this.kills = [];
    this.closed = false;
    this.stdin = new EventEmitter();
    this.stdin.write = (chunk) => {
      const text = String(chunk);
      this.stdinWrites.push(text);
      this.emit("stdin-write", text);
      return true;
    };
    this.stdin.end = () => {};
    this.kill = (signal) => {
      this.kills.push(signal ?? "SIGTERM");
      return true;
    };
  }

  line(message) {
    this.stdout.write(`${JSON.stringify({ protocol: OWNED_CHILD_PROTOCOL, ...message })}\n`);
  }

  raw(line) {
    this.stdout.write(`${line}\n`);
  }

  started(pid = 6001) {
    this.lastStartedPid = pid;
    this.line({ kind: "started", pid });
  }

  /**
   * A real wrapper final line carries the browser identity it announced, plus
   * the created/started proof. Mocks use the same fields; tests that need a
   * bad identity pass `pid` explicitly (including null for "missing").
   */
  finished(kind, { exitCode = 0, activeProcesses = 0, jobClosed = true, forcedDescendants = false, reason, pid } = {}) {
    const message = {
      kind,
      pid: pid === undefined ? this.lastStartedPid : pid,
      exitCode,
      activeProcesses,
      jobClosed,
      forcedDescendants,
      created: true,
      started: true,
    };
    if (reason) message.reason = reason;
    this.line(message);
  }

  /** A real wrapper error line: setup/closure failures carry the proof fields. */
  failed({
    stage = "setup",
    message = "wrapper failed",
    created = true,
    started = false,
    pid = 8123,
    terminationProved = true,
    handlesClosed,
    jobClosed,
  } = {}) {
    const report = { kind: "error", stage, message, created, started, pid, terminationProved };
    if (handlesClosed !== undefined) report.handlesClosed = handlesClosed;
    if (jobClosed !== undefined) report.jobClosed = jobClosed;
    this.line(report);
  }

  close(code = 0, signal = null) {
    if (this.closed) return;
    this.closed = true;
    this.stdout.end();
    this.stderr.end();
    this.emit("close", code, signal);
  }
}

/** Real timers, counted, so a test can prove nothing stayed armed. */
function countingScheduler() {
  const active = new Set();
  return {
    active,
    setTimeout(callback, milliseconds) {
      const handle = setTimeout(() => {
        active.delete(handle);
        callback();
      }, milliseconds);
      active.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      active.delete(handle);
      clearTimeout(handle);
    },
  };
}

/** Deterministic scheduler for tests about exactly when a deadline is armed. */
function manualScheduler() {
  let now = 0;
  let nextId = 0;
  const tasks = new Map();
  return {
    active: tasks,
    now: () => now,
    setTimeout(callback, milliseconds) {
      const id = ++nextId;
      tasks.set(id, { id, at: now + Math.max(0, milliseconds), callback });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const due = [...tasks.values()]
          .filter((task) => task.at <= target)
          .sort((left, right) => left.at - right.at || left.id - right.id)[0];
        if (!due) break;
        tasks.delete(due.id);
        now = due.at;
        due.callback();
      }
      now = target;
    },
  };
}

function spawnRecorder(wrapper) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return wrapper;
  };
  return { calls, spawnImpl };
}

function startFixture({ wrapper = new FakeWrapper(), options = {} } = {}) {
  const scheduler = countingScheduler();
  const { calls, spawnImpl } = spawnRecorder(wrapper);
  const handle = startOwnedBrowserChild({
    executablePath: CHROME,
    args: ["--headless=new", "--print-to-pdf=C:\\fake\\work\\cv.pdf"],
    cwd: CWD,
    label: "unit fixture",
    timeoutMs: 0,
    terminationGraceMs: 120,
    closeGraceMs: 60,
    spawnImpl,
    scheduler,
    platform: "win32",
    wrapperPath: DEFAULT_WRAPPER_PATH,
    ...options,
  });
  return { wrapper, handle, scheduler, calls };
}

function runFixture({ wrapper = new FakeWrapper(), options = {} } = {}) {
  const scheduler = countingScheduler();
  const { calls, spawnImpl } = spawnRecorder(wrapper);
  const promise = runOwnedBrowserChild({
    executablePath: CHROME,
    args: ["--headless=new", "--print-to-pdf=C:\\fake\\work\\cv.pdf"],
    cwd: CWD,
    label: "unit fixture",
    timeoutMs: 250,
    terminationGraceMs: 120,
    closeGraceMs: 60,
    spawnImpl,
    scheduler,
    platform: "win32",
    wrapperPath: DEFAULT_WRAPPER_PATH,
    ...options,
  });
  return { wrapper, promise, scheduler, calls };
}

function assertNoListeners(wrapper, label = "the finished run") {
  assert.equal(wrapper.listenerCount("error"), 0, `${label} leaves no error listener`);
  assert.equal(wrapper.listenerCount("exit"), 0, `${label} leaves no exit listener`);
  assert.equal(wrapper.listenerCount("close"), 0, `${label} leaves no close listener`);
  assert.equal(wrapper.stdout.listenerCount("data"), 0, `${label} leaves no stdout listener`);
  assert.equal(wrapper.stderr.listenerCount("data"), 0, `${label} leaves no stderr listener`);
  assert.equal(wrapper.stdin.listenerCount("error"), 0, `${label} leaves no stdin listener`);
}

/** Poll until `predicate` returns truthy, or fail with the waited-for label. */
async function waitFor(description, timeoutMs, predicate, signal) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw new Error(`cancelled while waiting for ${description}`);
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${description}`);
    await new Promise((done) => setTimeout(done, 25));
  }
}

/**
 * Test cancellation is linked to the handle's own termination: an aborted
 * `node:test` context (or a local controller) rejects the awaited step, and the
 * caller's `finally` still asks the owned job to terminate. The helper's
 * `signal` option does the same from inside the supervision object.
 */
function linkTestCancellation(context, assertionBudgetMs = 0) {
  const controller = new AbortController();
  const source = context?.signal;
  const forwardAbort = () => controller.abort();
  if (source) {
    if (source.aborted) controller.abort();
    else source.addEventListener("abort", forwardAbort, { once: true });
  }
  let budgetTimer = null;
  if (assertionBudgetMs > 0) {
    budgetTimer = setTimeout(() => controller.abort(), assertionBudgetMs);
  }
  controller.dispose = () => {
    if (budgetTimer) clearTimeout(budgetTimer);
    budgetTimer = null;
    source?.removeEventListener("abort", forwardAbort);
  };
  return controller;
}

/** Reject an await as soon as `signal` aborts, so a stalled await cannot hang the test. */
function abortable(promise, signal, label) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(`${label}: cancelled`));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error(`${label}: cancelled`));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

test("success resolves only after the job is empty, the handle closed and the wrapper exited", async () => {
  const { wrapper, promise, scheduler, calls } = runFixture();
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  wrapper.started(6001);
  wrapper.finished("exit", { exitCode: 0 });
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(settled, false, "the final line alone must not settle the run: wrapper closure is part of the proof");

  wrapper.close(0);
  const outcome = await promise;
  assert.equal(outcome.kind, "exit");
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.activeProcesses, 0);
  assert.equal(outcome.jobClosed, true);
  assert.equal(outcome.pid, 6001);
  assert.equal(outcome.wrapper.code, 0);
  assert.equal(scheduler.active.size, 0, "no lifecycle timer stays armed after success");
  assert.equal(calls.length, 1, "exactly one owned wrapper is spawned");
  assertNoListeners(wrapper);
});

test("the executable and every Chrome argument reach the wrapper unchanged", async () => {
  const { wrapper, promise, calls } = runFixture({
    options: { args: ["--headless=new", "--print-to-pdf=C:\\fake\\work\\a b\\cv.pdf", '--flag="quoted"'] },
  });
  wrapper.started();
  wrapper.finished("exit", { exitCode: 0 });
  wrapper.close(0);
  await promise;

  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /powershell\.exe$/i);
  assert.equal(calls[0].args[6], DEFAULT_WRAPPER_PATH, "the project-local wrapper is the process that is spawned");
  assert.equal(calls[0].args[7], "-RequestBase64");
  const request = JSON.parse(Buffer.from(calls[0].args[8], "base64").toString("utf8"));
  assert.deepEqual(request, {
    protocol: OWNED_CHILD_PROTOCOL,
    executable: CHROME,
    args: ["--headless=new", "--print-to-pdf=C:\\fake\\work\\a b\\cv.pdf", '--flag="quoted"'],
    cwd: CWD,
  });
  assert.deepEqual(buildWrapperInvocation({ executablePath: CHROME, args: [], cwd: CWD }).request.args, []);
});

test("a nonzero browser exit rejects instead of producing a fixture", async () => {
  const { wrapper, promise } = runFixture();
  wrapper.started();
  wrapper.finished("exit", { exitCode: 7 });
  wrapper.close(0);

  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof OwnedBrowserChildError);
    assert.equal(error.code, "fixture_failed");
    assert.match(error.message, /code 7/);
    return true;
  });
});

test("a synchronous spawn failure rejects before anything is owned", async () => {
  const scheduler = countingScheduler();
  const promise = runOwnedBrowserChild({
    executablePath: CHROME,
    cwd: CWD,
    label: "spawn failure",
    timeoutMs: 250,
    spawnImpl: () => {
      const error = new Error("spawn powershell ENOENT");
      error.code = "ENOENT";
      throw error;
    },
    scheduler,
    platform: "win32",
    wrapperPath: DEFAULT_WRAPPER_PATH,
  });

  await assert.rejects(promise, (error) => error.code === "spawn_failed" && /ENOENT/.test(error.message));
  assert.equal(scheduler.active.size, 0);
});

test("an asynchronous error with no wrapper pid is affirmative no-creation", async () => {
  const wrapper = new FakeWrapper({ pid: null });
  const { promise } = runFixture({ wrapper });
  wrapper.emit("error", Object.assign(new Error("spawn failed"), { code: "ENOENT" }));

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "spawn_failed");
    assert.equal(error.details.created, false, "Node never created the wrapper, so nothing exists to clean");
    assert.equal(error.details.terminationProved, true);
    assert.equal(error.details.handlesClosed, true);
    return true;
  });
  assert.deepEqual(wrapper.stdinWrites, [], "there is no owned process to terminate");
});

test("an asynchronous error with a wrapper pid awaits termination and closure, never 'already clean'", async () => {
  const wrapper = new FakeWrapper(); // a pid means Node created a wrapper that may own a browser
  const { promise, scheduler } = runFixture({
    wrapper,
    options: { timeoutMs: 0, terminationGraceMs: 200, closeGraceMs: 60 },
  });
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  wrapper.emit("error", Object.assign(new Error("spawn failed"), { code: "ENOENT" }));
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(settled, false, "absence of the browser acknowledgement does not prove the wrapper/browser never existed");
  assert.deepEqual(wrapper.stdinWrites, ["terminate\n"], "the job owner is asked to terminate the possibly-created tree");

  wrapper.close(2); // the wrapper died without proving closure
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "spawn_failed");
    assert.equal(error.details.created, null, "missing creation state is unknown, never clean");
    assert.equal(error.details.terminationProved, false);
    return true;
  });
  assert.equal(scheduler.active.size, 0);
});

test("a late wrapper report supplies the real no-creation proof after a transport error", async () => {
  const wrapper = new FakeWrapper();
  const { promise } = runFixture({
    wrapper,
    options: { timeoutMs: 0, terminationGraceMs: 200, closeGraceMs: 60 },
  });
  wrapper.emit("error", Object.assign(new Error("EPIPE"), { code: "EPIPE" }));
  wrapper.failed({
    stage: "setup",
    message: "CreateProcessInJob failed (2); no browser process was created",
    created: false,
    started: false,
    pid: null,
    terminationProved: true,
    handlesClosed: true,
    jobClosed: true,
  });
  wrapper.close(2);

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "wrapper_setup_failed");
    assert.equal(error.details.created, false);
    assert.equal(error.details.terminationProved, true);
    assert.equal(provesNoCleanupNeeded(error.details), true, "no process was created, so pre-start cleanup is affirmatively clean");
    assert.match(error.message, /EPIPE/, "the transport failure is still reported");
    assert.match(error.message, /CreateProcessInJob failed/, "the wrapper's proof is carried too");
    return true;
  });
});

test("a late acknowledgement cannot turn a pre-start transport error into a success", async () => {
  const wrapper = new FakeWrapper();
  const { promise } = runFixture({
    wrapper,
    options: { timeoutMs: 0, terminationGraceMs: 200, closeGraceMs: 60 },
  });
  wrapper.emit("error", Object.assign(new Error("EPIPE"), { code: "EPIPE" }));
  wrapper.started(6001);
  wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
  wrapper.close(0);

  await assert.rejects(promise, (error) => error.code === "spawn_failed");
});

test("only affirmative no-creation or proved termination may suppress pre-start cleanup", () => {
  const base = { handlesClosed: true, jobClosed: true, terminationProved: true };
  assert.equal(provesNoCleanupNeeded({ ...base, created: false }), true, "no wrapper was created");
  assert.equal(provesNoCleanupNeeded({ ...base, created: true, started: false }), true, "created, never started, termination proved");
  assert.equal(provesNoCleanupNeeded({ ...base, created: true, started: true }), true, "proved termination and closed handles is a proof, not a guess");
  assert.equal(provesNoCleanupNeeded({ ...base }), false, "missing created state is unknown");
  assert.equal(provesNoCleanupNeeded({ ...base, created: null }), false, "null created state is unknown");
  assert.equal(provesNoCleanupNeeded({ ...base, created: false, started: true }), false, "contradictory no-creation proof fails closed");
  assert.equal(provesNoCleanupNeeded({ ...base, created: true, terminationProved: false }), false);
  assert.equal(provesNoCleanupNeeded({ created: false, handlesClosed: true, jobClosed: true, terminationProved: false }), false);
  assert.equal(provesNoCleanupNeeded({ created: true, started: false, handlesClosed: false, jobClosed: true, terminationProved: true }), false);
  assert.equal(provesNoCleanupNeeded({ created: true, started: false, handlesClosed: true, jobClosed: false, terminationProved: true }), false);
  assert.equal(provesNoCleanupNeeded(null), false);
});

test("a transport error after start uses the termination grace, never the short close grace", async () => {
  // A response slower than closeGraceMs (60) but faster than terminationGraceMs
  // (200) proves cleanup is not force-killed at the post-result bound.
  const { wrapper, promise, scheduler } = runFixture({
    options: { timeoutMs: 0, terminationGraceMs: 200, closeGraceMs: 60 },
  });
  wrapper.started();
  wrapper.once("stdin-write", (control) => {
    assert.match(control, /^terminate\n$/);
    setTimeout(() => {
      wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
      wrapper.close(0);
    }, 80);
  });
  wrapper.emit("error", Object.assign(new Error("EPIPE"), { code: "EPIPE" }));

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "spawn_failed");
    assert.match(error.message, /EPIPE/);
    return true;
  });
  assert.deepEqual(wrapper.kills, [], "a delayed-but-honest cleanup is not force-killed");
  assert.equal(scheduler.active.size, 0);
});

test("timeout terminates only the owned tree, waits for proof, and still reports timeout", async () => {
  const { wrapper, promise, scheduler } = runFixture({ options: { timeoutMs: 25 } });
  wrapper.started();
  wrapper.once("stdin-write", (control) => {
    assert.match(control, /^terminate\n$/, "termination is a protocol message to the job owner");
    wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
    wrapper.close(0);
  });

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "timeout");
    assert.match(error.message, /never fixture success/);
    assert.equal(error.details.timedOut, true);
    return true;
  });
  assert.deepEqual(wrapper.kills, [], "the job owner terminated the tree; the wrapper was not killed");
  assert.equal(scheduler.active.size, 0);
});

test("cancellation is a termination with its own code, not a success", async () => {
  const controller = new AbortController();
  const { wrapper, promise } = runFixture({
    options: { timeoutMs: 0, signal: controller.signal },
  });
  wrapper.started();
  wrapper.once("stdin-write", () => {
    wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
    wrapper.close(0);
  });
  controller.abort();

  await assert.rejects(promise, (error) => error.code === "cancelled");
});

test("an abort racing a natural exit stays cancelled instead of becoming fixture success", async () => {
  const controller = new AbortController();
  const { wrapper, promise } = runFixture({ options: { timeoutMs: 0, signal: controller.signal } });
  wrapper.started();
  // The wrapper observed the browser exiting on its own after the abort was
  // recorded: kind "exit", exitCode 0, normal close. That must still be a
  // cancellation, because this run already decided to terminate it.
  wrapper.once("stdin-write", () => {
    setTimeout(() => {
      wrapper.finished("exit", { exitCode: 0 });
      wrapper.close(0);
    }, 30);
  });
  controller.abort();

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "cancelled");
    assert.match(error.message, /natural exit racing the cancellation/);
    return true;
  });
});

test("a kill failure or an unproved closure rejects and says cleanup is unproved", async () => {
  const { wrapper, promise, scheduler } = runFixture({
    options: { timeoutMs: 15, terminationGraceMs: 10, closeGraceMs: 10 },
  });
  wrapper.started();
  wrapper.line({ kind: "error", stage: "terminate", message: "TerminateJobObject failed (5)" });
  wrapper.close(5);

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "terminate_failed");
    assert.match(error.message, /TerminateJobObject failed/);
    return true;
  });
  assert.equal(scheduler.active.size, 0);
});

test("a wrapper that never confirms closure is killed last and fails closed", async () => {
  const { wrapper, promise, scheduler } = runFixture({
    options: { timeoutMs: 15, terminationGraceMs: 10, closeGraceMs: 10 },
  });
  wrapper.started();

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "closure_unproved");
    assert.match(error.message, /cannot be proved|unproved/);
    assert.equal(error.details.forceKilledWrapper, true);
    return true;
  });
  assert.ok(wrapper.kills.includes("SIGKILL"), "the last resort is a kill of the owned wrapper only");
  assert.equal(scheduler.active.size, 0);
  assertNoListeners(wrapper);
});

test("a late final result after a force-kill is still unproved closure, not success", async () => {
  const { wrapper, promise } = runFixture({
    options: { timeoutMs: 15, terminationGraceMs: 20, closeGraceMs: 80 },
  });
  wrapper.started(6001);
  await waitFor("the termination grace to force-kill the wrapper", 2_000, () => wrapper.kills.includes("SIGKILL"));

  // A good-looking final line and a clean close arriving after the last-resort
  // kill cannot retroactively prove the job's descendants were closed.
  wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
  wrapper.close(0);

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "closure_unproved");
    assert.equal(error.details.forceKilledWrapper, true);
    return true;
  });
});

// A late clean line cannot retroactively prove descendant closure.
test("a final result without created/started proof is rejected", async () => {
  const { wrapper, promise } = runFixture();
  wrapper.started(6001);
  // A real wrapper result always carries created/started; an old or malformed
  // one must not be read as proof.
  wrapper.line({ kind: "exit", pid: 6001, exitCode: 0, activeProcesses: 0, jobClosed: true, forcedDescendants: false });
  wrapper.close(0);

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "closure_unproved");
    assert.match(error.message, /created/);
    return true;
  });
});

test("a final result that leaves job members or the handle open is not success", async () => {
  for (const finish of [
    { exitCode: 0, activeProcesses: 2, jobClosed: true },
    { exitCode: 0, activeProcesses: 0, jobClosed: false },
  ]) {
    const { wrapper, promise } = runFixture();
    wrapper.started();
    wrapper.finished("exit", finish);
    wrapper.close(0);
    await assert.rejects(promise, (error) => error.code === "closure_unproved");
  }
});

test("a wrapper that exits without a result is an unreported exit, not success", async () => {
  const { wrapper, promise } = runFixture();
  wrapper.started();
  wrapper.close(3);

  await assert.rejects(promise, (error) => error.code === "wrapper_exit_unreported");
});

test("a nonzero wrapper close code after a good final result is rejected", async () => {
  const { wrapper, promise, scheduler } = runFixture();
  wrapper.started(6001);
  wrapper.finished("exit", { exitCode: 0 });
  wrapper.close(9);

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "wrapper_exit_failed");
    assert.match(error.message, /code 9/);
    return true;
  });
  assert.equal(scheduler.active.size, 0);
});

test("a wrapper closed by a signal is rejected even with a good final result", async () => {
  const { wrapper, promise } = runFixture();
  wrapper.started(6001);
  wrapper.finished("exit", { exitCode: 0 });
  wrapper.close(null, "SIGKILL");

  await assert.rejects(promise, (error) => {
    assert.equal(error.code, "wrapper_signalled");
    assert.match(error.message, /SIGKILL/);
    return true;
  });
});

test("a final result with a missing or different browser pid is rejected", async () => {
  for (const pid of [null, 9999]) {
    const { wrapper, promise } = runFixture();
    wrapper.started(6001);
    wrapper.finished("exit", { exitCode: 0, pid });
    wrapper.close(0);

    await assert.rejects(promise, (error) => {
      assert.equal(error.code, "identity_mismatch");
      assert.match(error.message, /started pid 6001/);
      return true;
    });
  }
});

test("a setup failure preserves the created identity and its unproved termination", async () => {
  for (const terminationProved of [false, true]) {
    const { wrapper, promise } = runFixture();
    wrapper.failed({
      stage: "setup",
      message: "ResumeThread failed (5); the created browser never ran and its owned tree closure is proved",
      created: true,
      pid: 8123,
      terminationProved,
      handlesClosed: terminationProved,
      jobClosed: terminationProved,
    });
    wrapper.close(2);

    await assert.rejects(promise, (error) => {
      assert.equal(error.code, "wrapper_setup_failed");
      assert.equal(error.details.created, true, "a created process is not 'nothing to clean'");
      assert.equal(error.details.browserPid, 8123);
      assert.equal(error.details.terminationProved, terminationProved);
      assert.equal(
        provesNoCleanupNeeded(error.details),
        terminationProved,
        "only proved termination with closed handles may suppress cleanup"
      );
      return true;
    });
  }
});

test("a missing fixture output rejects even when the process exited 0", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-owned-child-"));
  try {
    const missing = join(dir, "cv.pdf");
    const first = runFixture({ options: { expectFile: missing, timeoutMs: 250 } });
    first.wrapper.started();
    first.wrapper.finished("exit", { exitCode: 0 });
    first.wrapper.close(0);
    await assert.rejects(first.promise, (error) => error.code === "fixture_output_missing");

    const present = join(dir, "cv.png");
    await writeFile(present, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const second = runFixture({ options: { expectFile: present, timeoutMs: 250 } });
    second.wrapper.started();
    second.wrapper.finished("exit", { exitCode: 0 });
    second.wrapper.close(0);
    const outcome = await second.promise;
    assert.equal(outcome.kind, "exit");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("late close/exit events cannot re-settle a finished run or write a control", async () => {
  const { wrapper, handle } = startFixture();
  let settlements = 0;
  const observed = handle.exited.then((outcome) => {
    settlements += 1;
    return outcome;
  });

  wrapper.started(7100);
  wrapper.finished("exit", { exitCode: 0 });
  wrapper.close(0);
  const outcome = await observed;
  assert.equal(outcome.kind, "exit");

  wrapper.emit("close", 9, null);
  wrapper.emit("exit", 9, null);
  await new Promise((done) => setTimeout(done, 10));

  assert.equal(settlements, 1, "the outcome settles once");
  assert.equal(handle.outcome, outcome, "late events cannot replace the outcome");
  assert.equal(handle.activeTimerCount, 0);
  const again = await handle.terminate("late");
  assert.equal(again, outcome);
  assert.deepEqual(wrapper.stdinWrites, [], "a naturally finished browser is never told to terminate");
  handle.dispose();
  assertNoListeners(wrapper);
});

test("main-browser handle exposes the owned pid and terminate() resolves with proof", async () => {
  const { wrapper, handle } = startFixture();
  wrapper.started(7200);
  const started = await handle.started;
  assert.equal(started.pid, 7200);
  assert.equal(handle.pid, 7200);

  wrapper.once("stdin-write", (control) => {
    assert.match(control, /^terminate\n$/);
    wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
    wrapper.close(0);
  });
  const outcome = await handle.terminate("browser close");
  assert.equal(outcome.kind, "terminated");
  assert.equal(outcome.pid, 7200);
  assert.equal(outcome.jobClosed, true);
  assert.equal(handle.activeTimerCount, 0);
  handle.dispose();
  assertNoListeners(wrapper);
});

test("a browser that never reports started hits the startup bound and rejects", async () => {
  const { wrapper, handle, scheduler } = startFixture({
    options: { startupTimeoutMs: 15, terminationGraceMs: 60, closeGraceMs: 60 },
  });
  wrapper.once("stdin-write", (control) => {
    assert.match(control, /^terminate\n$/);
    // The wrapper did start, but only after the caller's startup bound. The
    // handle must reject `started` and still prove the tree closed.
    setTimeout(() => {
      wrapper.started(7300);
      wrapper.finished("terminated", { exitCode: 1, reason: "terminate" });
      wrapper.close(0);
    }, 5);
  });

  await assert.rejects(handle.started, (error) => error.code === "startup_timeout");
  const outcome = await handle.exited;
  assert.equal(outcome.kind, "terminated");
  assert.equal(outcome.jobClosed, true);
  assert.equal(handle.activeTimerCount, 0);
  assert.equal(scheduler.active.size, 0);
  handle.dispose();
});

test("startup expiry stays terminal when a late start and natural exit would otherwise succeed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-startup-race-"));
  try {
    const fixture = join(dir, "fixture.pdf");
    await writeFile(fixture, Buffer.from("%PDF-1.7 synthetic nonempty fixture\n"));
    const scheduler = manualScheduler();
    const wrapper = new FakeWrapper();
    const { calls, spawnImpl } = spawnRecorder(wrapper);
    let settlements = 0;
    const promise = runOwnedBrowserChild({
      executablePath: CHROME,
      args: [],
      cwd: CWD,
      label: "startup expiry race",
      timeoutMs: 5_000,
      startupTimeoutMs: 30_000,
      terminationGraceMs: DEFAULT_TERMINATION_GRACE_MS,
      closeGraceMs: DEFAULT_CLOSE_GRACE_MS,
      spawnImpl,
      scheduler,
      platform: "win32",
      wrapperPath: DEFAULT_WRAPPER_PATH,
      expectFile: fixture,
    });
    promise.then(
      () => {
        settlements += 1;
      },
      () => {
        settlements += 1;
      }
    );

    assert.equal(calls.length, 1, "exactly one owned wrapper is spawned");
    scheduler.advance(30_001);
    assert.deepEqual(wrapper.stdinWrites, ["terminate\n"], "startup expiry asks the job owner to terminate");

    // The exact R4 diagnostic route: a late acknowledgement, a natural exit 0
    // with an empty job, a valid nonempty fixture and a normal wrapper close.
    // The recorded startup decision must survive every one of them.
    wrapper.started(6001);
    wrapper.finished("exit", { exitCode: 0 });
    wrapper.close(0);

    await assert.rejects(promise, (error) => {
      assert.ok(error instanceof OwnedBrowserChildError);
      assert.equal(error.code, "startup_timeout");
      assert.match(error.message, /did not report started within 30000ms/);
      assert.match(error.message, /never fixture success/);
      assert.equal(error.details.startupTimedOut, true);
      assert.equal(error.details.timedOut, false, "the operation deadline never fired");
      assert.equal(error.details.termination, "startup-timeout");
      assert.equal(error.details.started, true, "the late acknowledgement is recorded, not followed");
      assert.equal(error.details.final?.kind, "exit", "settlement still waited for the wrapper's own final proof");
      return true;
    });

    assert.ok(readFileSync(fixture).length > 0, "the fixture is nonempty, so missing output cannot be the reason");
    assert.equal(settlements, 1, "the one-shot run settles exactly once");
    assert.equal(scheduler.active.size, 0, "no lifecycle timer remains armed");
    assertNoListeners(wrapper);
    assert.deepEqual(wrapper.kills, [], "the honest cleanup path never force-kills the wrapper");
    assert.deepEqual(wrapper.stdinWrites, ["terminate\n"], "a late start cannot send a second control line");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a natural exit inside the startup bound remains fixture success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-startup-control-"));
  try {
    const fixture = join(dir, "fixture.pdf");
    await writeFile(fixture, Buffer.from("%PDF-1.7 synthetic nonempty fixture\n"));
    const scheduler = manualScheduler();
    const wrapper = new FakeWrapper();
    const { spawnImpl } = spawnRecorder(wrapper);
    let settlements = 0;
    const promise = runOwnedBrowserChild({
      executablePath: CHROME,
      args: [],
      cwd: CWD,
      label: "startup within bound",
      timeoutMs: 5_000,
      startupTimeoutMs: 30_000,
      terminationGraceMs: DEFAULT_TERMINATION_GRACE_MS,
      closeGraceMs: DEFAULT_CLOSE_GRACE_MS,
      spawnImpl,
      scheduler,
      platform: "win32",
      wrapperPath: DEFAULT_WRAPPER_PATH,
      expectFile: fixture,
    });
    promise.then(
      () => {
        settlements += 1;
      },
      () => {
        settlements += 1;
      }
    );

    scheduler.advance(29_999);
    assert.deepEqual(wrapper.stdinWrites, [], "inside the startup bound no termination is requested");

    wrapper.started(6001);
    wrapper.finished("exit", { exitCode: 0 });
    wrapper.close(0);

    const outcome = await promise;
    assert.equal(outcome.kind, "exit");
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.pid, 6001);
    assert.equal(outcome.activeProcesses, 0);
    assert.equal(outcome.jobClosed, true);
    assert.ok(readFileSync(fixture).length > 0, "the successful fixture is nonempty");
    assert.equal(settlements, 1, "the successful control settles exactly once");
    assert.equal(scheduler.active.size, 0, "no lifecycle timer remains armed after success");
    assertNoListeners(wrapper);
    assert.deepEqual(wrapper.kills, []);
    assert.deepEqual(wrapper.stdinWrites, [], "a within-bound natural finish needs no control line");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a delayed startup does not consume the operation timeout", async () => {
  const scheduler = manualScheduler();
  const wrapper = new FakeWrapper();
  const handle = startOwnedBrowserChild({
    executablePath: CHROME,
    args: [],
    cwd: CWD,
    label: "delayed startup",
    timeoutMs: 40,
    startupTimeoutMs: 200,
    terminationGraceMs: 60,
    closeGraceMs: 20,
    spawnImpl: () => wrapper,
    scheduler,
    platform: "win32",
    wrapperPath: DEFAULT_WRAPPER_PATH,
  });

  assert.equal(scheduler.active.size, 1, "only the startup bound is armed while the wrapper sets up");
  scheduler.advance(150); // far beyond the 40 ms operation bound, still inside startup
  assert.deepEqual(wrapper.stdinWrites, [], "wrapper setup time cannot trigger the operation timeout");

  wrapper.started(6001);
  await handle.started;
  assert.equal(scheduler.active.size, 1, "the startup timer is replaced by the operation timer");
  scheduler.advance(39);
  assert.deepEqual(wrapper.stdinWrites, [], "the operation clock has not expired yet");
  scheduler.advance(1);
  assert.deepEqual(wrapper.stdinWrites, ["terminate\n"], "the operation bound starts only after started");

  wrapper.finished("terminated", { exitCode: 1, reason: "timeout" });
  wrapper.close(0);
  const outcome = await handle.exited;
  assert.equal(outcome.kind, "terminated");
  assert.equal(handle.timedOut, true);
  handle.dispose();
  assertNoListeners(wrapper);
});

test("the operation clock can be armed only after caller-validated readiness", async () => {
  const scheduler = manualScheduler();
  const wrapper = new FakeWrapper();
  const handle = startOwnedBrowserChild({
    executablePath: CHROME,
    args: [],
    cwd: CWD,
    label: "readiness-gated timeout",
    timeoutMs: 0,
    startupTimeoutMs: 200,
    terminationGraceMs: 60,
    closeGraceMs: 20,
    spawnImpl: () => wrapper,
    scheduler,
    platform: "win32",
    wrapperPath: DEFAULT_WRAPPER_PATH,
  });

  assert.throws(
    () => handle.armOperationTimeout(30),
    (error) => error.code === "not_started",
    "a readiness clock cannot arm before the browser exists"
  );
  wrapper.started(6001);
  await handle.started;
  scheduler.advance(150); // slow readiness proof: publication and liveness checks are not operation time
  assert.equal(scheduler.active.size, 0, "no operation clock is running before the caller's readiness proof");

  assert.equal(handle.armOperationTimeout(30), true);
  scheduler.advance(29);
  assert.deepEqual(wrapper.stdinWrites, []);
  assert.equal(handle.armOperationTimeout(30), false, "re-arming cannot extend the first deadline");
  scheduler.advance(1);
  assert.deepEqual(wrapper.stdinWrites, ["terminate\n"], "the clock begins at the explicit readiness point");

  wrapper.finished("terminated", { exitCode: 1, reason: "timeout" });
  wrapper.close(0);
  await handle.exited;
  assert.equal(handle.timedOut, true);
  handle.dispose();
  assertNoListeners(wrapper);
});

test("a non-Windows host fails closed before spawning a browser it cannot own", () => {
  assert.throws(
    () =>
      startOwnedBrowserChild({
        executablePath: CHROME,
        platform: "linux",
        spawnImpl: () => {
          throw new Error("must not spawn");
        },
      }),
    (error) => error.code === "setup_denied" && /win32 only/.test(error.message)
  );
});

test("the wrapper owns the browser before it resumes, reads one control line, and derives its proof fields", () => {
  const source = readFileSync(DEFAULT_WRAPPER_PATH, "utf8");
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE\s*=\s*0x00002000/);
  assert.match(source, /CREATE_SUSPENDED\s*=\s*0x00000004/);
  // Finding 2: containment is requested at creation, so there is no
  // create-then-assign window whose failure could leave an unowned process.
  assert.match(source, /PROC_THREAD_ATTRIBUTE_JOB_LIST\s*=\s*0x0002000D/);
  assert.match(source, /EXTENDED_STARTUPINFO_PRESENT\s*=\s*0x00080000/);
  assert.match(source, /CreateProcessInJob/);
  assert.doesNotMatch(source, /AssignProcessToJobObject/, "containment is atomic at creation, not patched afterwards");
  const created = source.indexOf("[OwnedChildNative]::CreateProcessInJob(");
  const resumed = source.indexOf("ResumeThread($script:ThreadHandle)");
  assert.ok(created > 0, "the wrapper creates the process inside the job");
  assert.ok(resumed > created, "the browser is resumed only after job-contained creation");
  assert.match(source, /TerminateJobObject\(/, "termination is job-scoped");
  assert.match(source, /ActiveProcesses/, "closure is read from the job object");
  assert.doesNotMatch(source, /Get-Process|Stop-Process|taskkill/, "no process-name or stale-pid killing");

  // Finding 1: the monitor loop must never call Console.In.ReadLineAsync (which
  // is synchronous on Windows PowerShell 5.1) and never start a second read.
  assert.doesNotMatch(source, /\[Console\]::In\.ReadLineAsync/, "no synchronous ReadLineAsync in the monitor loop");
  assert.doesNotMatch(source, /\$readTask/, "no chained second read");
  const readerStart = source.indexOf("[OwnedChildConsole]::Start([Console]::In)");
  const controlPoll = source.indexOf("[OwnedChildConsole]::Take()");
  assert.ok(readerStart > 0 && controlPoll > readerStart, "a background reader feeds a non-blocking poll");

  // Finding 3: one shared budget bounds the complete cleanup path and the
  // discarded duplicate root wait is gone.
  assert.match(source, /\$cleanupBudgetMilliseconds = 20000/);
  assert.match(source, /Get-RemainingCleanupMilliseconds/);
  assert.match(
    source,
    /\$rootWait = \[OwnedChildNative\]::WaitForSingleObject\(\$script:ProcessHandle, \[uint32\]\(Get-RemainingCleanupMilliseconds\)\)/,
    "the single cleanup root wait consumes the shared remaining budget"
  );
  assert.doesNotMatch(source, /WaitForSingleObject\(\$script:ProcessHandle, 10000\)/, "no duplicate fixed 10 s root wait");
  assert.match(source, /Stop-OwnedTree/);
  assert.match(source, /TerminateProcess\(/);
  assert.match(source, /terminationProved = \[bool\]\$cleanup\['terminationProved'\]/);

  // Finding 7: the final result is derived from checked close outcomes and the
  // job is closed before the result line.
  const checkedClose = source.indexOf("$closed = Close-OwnedHandles -CloseJob");
  const resultKind = source.indexOf("$resultKind = 'exit'");
  const checkedCloseGuard = source.indexOf("if (-not $closed['Closed'] -or -not $closed['JobClosed'])");
  assert.ok(checkedClose > 0 && checkedCloseGuard > checkedClose, "the close result is checked");
  assert.ok(resultKind > checkedCloseGuard, "the result line is written only after the checked close");
  assert.match(source, /jobClosed = \[bool\]\$closed\['JobClosed'\]/, "jobClosed is derived, never unconditional");
  assert.match(source, /pid = \$script:BrowserPid/);
  assert.match(source, /if \(\$null -ne \$terminationError\)/);
  for (const kind of ["started", "exit", "terminated", "error"]) {
    assert.match(source, new RegExp(`'${kind}'|kind = '${kind}'|kind\\s*=\\s*'${kind}'`));
  }
});

test("Node supervision exceeds the wrapper's complete native cleanup budget", () => {
  assert.ok(DEFAULT_TERMINATION_GRACE_MS > NATIVE_CLEANUP_BUDGET_MS, "the grace must cover the whole native path");
  assert.equal(NATIVE_CLEANUP_BUDGET_MS, 20_000);
  const source = readFileSync(DEFAULT_WRAPPER_PATH, "utf8");
  assert.match(source, new RegExp(`\\$cleanupBudgetMilliseconds = ${NATIVE_CLEANUP_BUDGET_MS}`));
});

test("the driver suppresses a pre-start cleanup failure only on affirmative proof", () => {
  const flow = readFileSync(join(HERE, "..", "scripts", "e2e-flow.mjs"), "utf8");
  assert.match(flow, /provesNoCleanupNeeded\(details\)/);
  assert.doesNotMatch(flow, /createdAndUnproved/, "the old error-code suppressions are gone");
  assert.doesNotMatch(flow, /details\.created === true && details\.terminationProved !== true/);
});

/* ========================================================================== *
 * Native opt-in qualifier — real wrapper, real Job Object, synthetic processes
 * ========================================================================== */

const NATIVE_STARTUP_BOUND_MS = 20_000;
const NATIVE_OPERATION_BOUND_MS = 45_000;
const NATIVE_HANG_BOUND_MS = 3_000;
const NATIVE_TERMINATION_GRACE_MS = DEFAULT_TERMINATION_GRACE_MS;
const NATIVE_PID_GONE_BOUND_MS = 5_000;
const NATIVE_TOTAL_BUDGET_MS = 120_000;
// Cleanup is reserved before the 120 s test limit: one termination grace, the
// production close grace, and two bounded post-termination PID probes.
const NATIVE_CLEANUP_RESERVE_MS =
  NATIVE_TERMINATION_GRACE_MS + DEFAULT_CLOSE_GRACE_MS + 2 * NATIVE_PID_GONE_BOUND_MS;
const NATIVE_ASSERTION_BUDGET_MS = NATIVE_TOTAL_BUDGET_MS - NATIVE_CLEANUP_RESERVE_MS;
const NATIVE_WORST_CASE_MS = NATIVE_STARTUP_BOUND_MS + NATIVE_OPERATION_BOUND_MS + NATIVE_CLEANUP_RESERVE_MS;

/** A PID record is usable only after its whole JSON object validates. */
function parsePublishedPids(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object") return null;
  if (!Number.isInteger(record.child) || record.child <= 0) return null;
  if (!Number.isInteger(record.grandchild) || record.grandchild <= 0) return null;
  if (record.child === record.grandchild) return null;
  return { child: record.child, grandchild: record.grandchild };
}

/**
 * Wait for the fixture's completion marker, then for one complete validated
 * record. Existence of pids.json is never enough: an empty or partial file is
 * ignored until the whole record is readable after the marker.
 */
function waitForPublishedPids({ pidsFile, readyFile, timeoutMs, signal }) {
  return waitFor(
    "a complete root/grandchild PID publication",
    timeoutMs,
    () => {
      if (!existsSync(readyFile)) return null;
      try {
        return parsePublishedPids(readFileSync(pidsFile, "utf8"));
      } catch {
        return null;
      }
    },
    signal
  );
}

function assertPublishedPidsAreLive(record, startedPid) {
  assert.equal(record.child, startedPid, "the wrapper owns the same root pid the fixture reports");
  assert.ok(Number.isInteger(record.grandchild) && record.grandchild > 0, "the grandchild pid is positive");
  assert.notEqual(record.grandchild, record.child, "the root and grandchild identities are distinct");
  assert.doesNotThrow(() => process.kill(record.child, 0), "the captured root is alive before termination");
  assert.doesNotThrow(() => process.kill(record.grandchild, 0), "the captured grandchild is alive before termination");
}

function waitForPidGone(pid, timeoutMs, signal) {
  return waitFor(
    `pid ${pid} to end with the owned job`,
    timeoutMs,
    () => {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        assert.equal(error.code, "ESRCH", `pid ${pid} ended rather than failing the probe for another reason`);
        return true;
      }
    },
    signal
  );
}

function nativeStartupDeadline() {
  const deadline = Date.now() + NATIVE_STARTUP_BOUND_MS;
  return {
    remaining() {
      return Math.max(0, deadline - Date.now());
    },
  };
}

function remainingStartup(deadline, label) {
  const remaining = deadline.remaining();
  if (!(remaining > 0)) throw new Error(`${label}: the ${NATIVE_STARTUP_BOUND_MS}ms startup/readiness bound is exhausted`);
  return remaining;
}

test("partial or empty PID publication is never accepted as a complete identity record", () => {
  assert.equal(parsePublishedPids(""), null, "empty is not a record");
  assert.equal(parsePublishedPids("   \n"), null, "whitespace is not a record");
  assert.equal(parsePublishedPids('{"child":6001,"grandchild":'), null, "partial JSON is not a record");
  assert.equal(parsePublishedPids(JSON.stringify({ child: 6001 })), null, "a missing grandchild is not a record");
  assert.equal(parsePublishedPids(JSON.stringify({ child: 0, grandchild: 6002 })), null, "a non-positive root is not a record");
  assert.equal(parsePublishedPids(JSON.stringify({ child: 6001, grandchild: 6001 })), null, "one pid twice is not two identities");
  assert.deepEqual(parsePublishedPids(JSON.stringify({ child: 6001, grandchild: 6002 })), {
    child: 6001,
    grandchild: 6002,
  });
});

test("PID file existence without a completion marker is not a publication", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-pid-marker-"));
  try {
    const pidsFile = join(dir, "pids.json");
    const readyFile = join(dir, "ready.json");
    await writeFile(pidsFile, JSON.stringify({ child: 6001, grandchild: 6002 }));
    await assert.rejects(
      waitForPublishedPids({ pidsFile, readyFile, timeoutMs: 30 }),
      /timed out after 30ms waiting for a complete root\/grandchild PID publication/,
      "a complete-looking JSON file is not complete until the fixture's marker exists"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("native qualifier arithmetic reserves cleanup inside its 120 s outer bound", () => {
  assert.equal(NATIVE_TERMINATION_GRACE_MS, 30_000);
  assert.equal(DEFAULT_CLOSE_GRACE_MS, 5_000, "qualifiers keep the production close grace");
  assert.equal(NATIVE_CLEANUP_RESERVE_MS, 45_000, "30 s termination + 5 s close + two 5 s PID probes");
  assert.equal(NATIVE_WORST_CASE_MS, 110_000, "20 s startup/readiness + 45 s operation + 45 s cleanup");
  assert.equal(NATIVE_TOTAL_BUDGET_MS - NATIVE_WORST_CASE_MS, 10_000, "10 s of protocol/scheduling slack remains");
  assert.ok(NATIVE_WORST_CASE_MS <= NATIVE_TOTAL_BUDGET_MS, "the complete path fits inside 120 s");
  assert.equal(NATIVE_ASSERTION_BUDGET_MS, 75_000, "the assertion phase leaves the full cleanup reserve");
  assert.ok(NATIVE_ASSERTION_BUDGET_MS >= NATIVE_STARTUP_BOUND_MS + NATIVE_OPERATION_BOUND_MS);
});

const nativeQualifierOptIn = process.platform === "win32" && process.env[NATIVE_QUALIFIER_FLAG] === "1";
const nativeQualifierSkip = nativeQualifierOptIn
  ? false
  : process.platform === "win32"
    ? `native execution is off by default; set ${NATIVE_QUALIFIER_FLAG}=1 for the explicit Windows synthetic qualifier`
    : "the owned-child synthetic qualifier is Windows only";

test(
  "WINDOWS NATIVE OPT-IN: a synthetic browser child and grandchild both end with the owned tree",
  { skip: nativeQualifierSkip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "aw-owned-tree-"));
    const fixture = join(dir, "fixture-browser.mjs");
    const pidsFile = join(dir, "pids.json");
    const readyFile = join(dir, "ready.json");
    const cancellation = linkTestCancellation(t, NATIVE_ASSERTION_BUDGET_MS);
    const startupDeadline = nativeStartupDeadline();
    let handle = null;
    try {
      await writeFile(
        fixture,
        [
          'import { spawn } from "node:child_process";',
          'import { renameSync, writeFileSync } from "node:fs";',
          'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
          'grandchild.on("spawn", () => {',
          "  const temporary = process.argv[2] + '.tmp';",
          "  writeFileSync(temporary, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));",
          "  renameSync(temporary, process.argv[2]);",
          '  writeFileSync(process.argv[3], "ready\\n");',
          "});",
          "setInterval(() => {}, 1000);",
        ].join("\n")
      );

      handle = startOwnedBrowserChild({
        executablePath: process.execPath,
        args: [fixture, pidsFile, readyFile],
        cwd: dir,
        label: "synthetic owned tree",
        timeoutMs: 0,
        startupTimeoutMs: NATIVE_STARTUP_BOUND_MS,
        terminationGraceMs: NATIVE_TERMINATION_GRACE_MS,
        signal: cancellation.signal,
      });
      // Startup/readiness share one bound, and every await is abortable. The
      // short operation clock is not armed until the complete PID record is
      // validated and both captured processes are known alive.
      const started = await abortable(handle.started, cancellation.signal, "synthetic owned tree startup");
      const pids = await waitForPublishedPids({
        pidsFile,
        readyFile,
        timeoutMs: remainingStartup(startupDeadline, "synthetic owned tree"),
        signal: cancellation.signal,
      });
      assertPublishedPidsAreLive(pids, started.pid);
      handle.armOperationTimeout(NATIVE_OPERATION_BOUND_MS);

      const outcome = await abortable(handle.terminate("qualifier termination"), cancellation.signal, "synthetic owned tree termination");
      assert.equal(outcome.kind, "terminated");
      assert.equal(outcome.pid, pids.child);
      assert.equal(outcome.activeProcesses, 0);
      assert.equal(outcome.jobClosed, true);

      // Post-termination probes use the test-context signal, independently of
      // the operation controller that may have requested termination.
      for (const pid of [pids.child, pids.grandchild]) {
        await waitForPidGone(pid, NATIVE_PID_GONE_BOUND_MS, t.signal);
      }
    } finally {
      try {
        if (handle && !handle.outcome && !handle.failure) await handle.terminate("qualifier cleanup");
      } catch {
        /* the assertion above is authoritative */
      }
      handle?.dispose();
      cancellation.dispose();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
);

test(
  "WINDOWS NATIVE OPT-IN: a browser that ends on its own completes with no control line and no timeout",
  { skip: nativeQualifierSkip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "aw-owned-natural-"));
    const fixture = join(dir, "fixture-exit.mjs");
    const cancellation = linkTestCancellation(t, NATIVE_ASSERTION_BUDGET_MS);
    let handle = null;
    try {
      await writeFile(fixture, "process.exit(0);\n");
      handle = startOwnedBrowserChild({
        executablePath: process.execPath,
        args: [fixture],
        cwd: dir,
        label: "synthetic natural exit",
        timeoutMs: 0,
        startupTimeoutMs: NATIVE_STARTUP_BOUND_MS,
        terminationGraceMs: NATIVE_TERMINATION_GRACE_MS,
        signal: cancellation.signal,
      });
      const started = await abortable(handle.started, cancellation.signal, "synthetic natural exit startup");
      handle.armOperationTimeout(NATIVE_OPERATION_BOUND_MS);
      const outcome = await abortable(handle.exited, cancellation.signal, "synthetic natural exit completion");
      assert.equal(outcome.kind, "exit");
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.pid, started.pid);
      assert.equal(outcome.activeProcesses, 0);
      assert.equal(outcome.jobClosed, true);
      const diagnostics = handle.diagnostics();
      assert.equal(diagnostics.termination, null, "the wrapper and Node needed no terminate control");
      assert.equal(diagnostics.terminationSent, false);
    } finally {
      try {
        if (handle && !handle.outcome && !handle.failure) await handle.terminate("qualifier cleanup");
      } catch {
        /* the assertion above is authoritative */
      }
      handle?.dispose();
      cancellation.dispose();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
);

test(
  "WINDOWS NATIVE OPT-IN: an operation that never finishes is timed out and its owned tree ends",
  { skip: nativeQualifierSkip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "aw-owned-hang-"));
    const fixture = join(dir, "fixture-hang.mjs");
    const pidsFile = join(dir, "pids.json");
    const readyFile = join(dir, "ready.json");
    const cancellation = linkTestCancellation(t, NATIVE_ASSERTION_BUDGET_MS);
    const startupDeadline = nativeStartupDeadline();
    let handle = null;
    try {
      await writeFile(
        fixture,
        [
          'import { spawn } from "node:child_process";',
          'import { renameSync, writeFileSync } from "node:fs";',
          'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
          'grandchild.on("spawn", () => {',
          "  const temporary = process.argv[2] + '.tmp';",
          "  writeFileSync(temporary, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));",
          "  renameSync(temporary, process.argv[2]);",
          '  writeFileSync(process.argv[3], "ready\\n");',
          "});",
          "setInterval(() => {}, 1000);",
        ].join("\n")
      );
      handle = startOwnedBrowserChild({
        executablePath: process.execPath,
        args: [fixture, pidsFile, readyFile],
        cwd: dir,
        label: "synthetic hanging browser",
        timeoutMs: 0,
        startupTimeoutMs: NATIVE_STARTUP_BOUND_MS,
        terminationGraceMs: NATIVE_TERMINATION_GRACE_MS,
        signal: cancellation.signal,
      });
      const started = await abortable(handle.started, cancellation.signal, "synthetic hanging startup");
      const pids = await waitForPublishedPids({
        pidsFile,
        readyFile,
        timeoutMs: remainingStartup(startupDeadline, "synthetic hanging browser"),
        signal: cancellation.signal,
      });
      assertPublishedPidsAreLive(pids, started.pid);

      // The short operation timeout begins only after complete publication and
      // the pre-termination liveness proof. It is the only thing that can end
      // this run, and it must still report timeout, never success.
      handle.armOperationTimeout(NATIVE_HANG_BOUND_MS);
      const outcome = await abortable(handle.exited, t.signal, "synthetic hang cleanup");
      assert.equal(outcome.kind, "terminated");
      assert.equal(handle.timedOut, true);
      assert.equal(outcome.pid, pids.child);
      assert.equal(outcome.activeProcesses, 0);
      assert.equal(outcome.jobClosed, true);
      for (const pid of [pids.child, pids.grandchild]) {
        await waitForPidGone(pid, NATIVE_PID_GONE_BOUND_MS, t.signal);
      }
    } finally {
      try {
        if (handle && !handle.outcome && !handle.failure) await handle.terminate("qualifier cleanup");
      } catch {
        /* the assertion above is authoritative */
      }
      handle?.dispose();
      cancellation.dispose();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
);

test(
  "WINDOWS NATIVE OPT-IN: test cancellation terminates the owned tree through the handle",
  { skip: nativeQualifierSkip, timeout: 120_000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "aw-owned-cancel-"));
    const fixture = join(dir, "fixture-cancel.mjs");
    const pidsFile = join(dir, "pids.json");
    const readyFile = join(dir, "ready.json");
    const cancellation = linkTestCancellation(t, NATIVE_ASSERTION_BUDGET_MS);
    const startupDeadline = nativeStartupDeadline();
    let handle = null;
    try {
      await writeFile(
        fixture,
        [
          'import { spawn } from "node:child_process";',
          'import { renameSync, writeFileSync } from "node:fs";',
          'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
          'grandchild.on("spawn", () => {',
          "  const temporary = process.argv[2] + '.tmp';",
          "  writeFileSync(temporary, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));",
          "  renameSync(temporary, process.argv[2]);",
          '  writeFileSync(process.argv[3], "ready\\n");',
          "});",
          "setInterval(() => {}, 1000);",
        ].join("\n")
      );
      handle = startOwnedBrowserChild({
        executablePath: process.execPath,
        args: [fixture, pidsFile, readyFile],
        cwd: dir,
        label: "synthetic cancelled browser",
        timeoutMs: 0,
        startupTimeoutMs: NATIVE_STARTUP_BOUND_MS,
        terminationGraceMs: NATIVE_TERMINATION_GRACE_MS,
        signal: cancellation.signal,
      });
      const started = await abortable(handle.started, cancellation.signal, "synthetic cancelled startup");
      const pids = await waitForPublishedPids({
        pidsFile,
        readyFile,
        timeoutMs: remainingStartup(startupDeadline, "synthetic cancelled browser"),
        signal: cancellation.signal,
      });
      assertPublishedPidsAreLive(pids, started.pid);
      handle.armOperationTimeout(NATIVE_OPERATION_BOUND_MS);

      cancellation.abort();
      // The operation controller is deliberately aborted here. Cleanup and the
      // post-termination probes must instead follow the test-context signal.
      const outcome = await abortable(handle.exited, t.signal, "synthetic cancellation cleanup");
      assert.equal(outcome.kind, "terminated");
      assert.equal(handle.terminationReason, "cancelled");
      assert.equal(outcome.pid, pids.child);
      assert.equal(outcome.activeProcesses, 0);
      assert.equal(outcome.jobClosed, true);
      for (const pid of [pids.child, pids.grandchild]) {
        await waitForPidGone(pid, NATIVE_PID_GONE_BOUND_MS, t.signal);
      }
    } finally {
      try {
        if (handle && !handle.outcome && !handle.failure) await handle.terminate("qualifier cleanup");
      } catch {
        /* the assertion above is authoritative */
      }
      handle?.dispose();
      cancellation.dispose();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
);
