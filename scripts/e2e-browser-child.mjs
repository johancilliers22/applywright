/**
 * Owned temporary-browser lifecycle for scripts/e2e-flow.mjs.
 *
 * Why this exists
 * ---------------
 * A Node ChildProcess object owns only the process Node spawned. Chrome makes
 * its own children (renderer, GPU, utility) immediately, so killing the root on
 * Windows does not prove the tree ended. The E2E harness must be able to prove
 * that every process it created for a fixture is gone before it may report
 * fixture success. Each temporary browser is therefore started by
 * `scripts/e2e-browser-child.ps1`, which:
 *
 *   1. creates a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
 *   2. starts the browser suspended and assigns it to that job *before* it can
 *      run (so every descendant is in the job by construction),
 *   3. keeps the job handle open for the whole browser lifetime, and
 *   4. reports on stdout, as JSON lines, the browser pid and then a final result
 *      carrying the job's `ActiveProcesses` count and whether the handle was
 *      closed only after that count reached zero.
 *
 * This module is the Node half: it starts the wrapper, parses that protocol,
 * enforces the bound, requests termination on timeout/cancel/error, and refuses
 * to treat anything as success unless the wrapper proved closure
 * (`activeProcesses === 0`, `jobClosed === true`, the same browser pid it
 * announced, and `created`/`started` both true) *and* the wrapper process
 * itself closed with code 0, no signal, and without having been force-killed.
 * A spawn failure, a nonzero browser exit, a timeout, a cancellation, a kill
 * failure, a nonzero wrapper close, a close signal, or a wrapper that dies
 * before reporting closure all reject; none of them can look like a generated
 * fixture. A cancellation decision is preserved independently of the wrapper's
 * final report kind, so an abort racing a natural exit still rejects as
 * cancelled rather than succeeding.
 *
 * Owned handles: exactly one ChildProcess, the wrapper. Termination is a
 * protocol message to that wrapper (`terminate\n` on stdin) so the job owner
 * does the killing. This module never scans process names, never reuses a stale
 * pid, and never kills a process it did not spawn. `child.kill()` is used only
 * as a last resort against the wrapper itself after the confirmation grace has
 * expired; that path always fails closed because closure is then unproved.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const OWNED_CHILD_PROTOCOL = "applywright-owned-child/1";
export const DEFAULT_FIXTURE_TIMEOUT_MS = 30_000;
// Separate bound for wrapper/browser startup. The operation deadline is armed
// only after the wrapper reports the browser started (or later, when a caller
// arms it explicitly after its own readiness proof), so a slow PowerShell setup
// cannot consume the fixture's working time.
export const DEFAULT_FIXTURE_STARTUP_TIMEOUT_MS = 30_000;
// The wrapper bounds its *complete* cleanup path (job termination, root wait,
// job-empty wait, forced wait, checked handle close and the final report) with
// one shared 20 s budget. This grace is deliberately larger, so honest cleanup
// always has room to prove itself before the last-resort wrapper kill.
export const NATIVE_CLEANUP_BUDGET_MS = 20_000;
export const DEFAULT_TERMINATION_GRACE_MS = 30_000;
// Only for the post-result/post-exit phase, where the wrapper has nothing left
// to clean. Error/abort paths use the termination grace, not this bound.
export const DEFAULT_CLOSE_GRACE_MS = 5_000;

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WRAPPER_PATH = join(HERE, "e2e-browser-child.ps1");

const POWERSHELL = process.env.SystemRoot
  ? join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

/** A lifecycle failure with a stable code and the diagnostics that explain it. */
export class OwnedBrowserChildError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OwnedBrowserChildError";
    this.code = code;
    this.details = details;
  }
}

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  // Callers legitimately await only one of `started`/`exited`; an unobserved
  // rejection must never escape as an unhandled event and abort the harness.
  promise.catch(() => {});
  return { promise, resolve, reject, done: false };
}

function defaultScheduler() {
  return {
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => clearTimeout(handle),
  };
}

/**
 * The exact wrapper invocation, exposed so a test can prove the executable and
 * every argument reach the ownership wrapper unmodified. `args` are encoded as
 * one base64 JSON request: PowerShell parameter binding cannot round-trip
 * Chrome flags that contain quotes or backslashes reliably.
 */
export function buildWrapperInvocation({ executablePath, args = [], cwd = process.cwd(), wrapperPath = DEFAULT_WRAPPER_PATH } = {}) {
  if (typeof executablePath !== "string" || !executablePath) {
    throw new OwnedBrowserChildError("setup_denied", "an owned browser needs an executable path");
  }
  const request = {
    protocol: OWNED_CHILD_PROTOCOL,
    executable: executablePath,
    args: args.map((value) => String(value)),
    cwd,
  };
  const encoded = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  return {
    request,
    command: POWERSHELL,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      wrapperPath,
      "-RequestBase64",
      encoded,
    ],
  };
}

/** Non-null when the wrapper's final line does not prove descendant closure. */
function closureGap(report) {
  if (!report || typeof report !== "object") return "the wrapper reported no final result";
  if (report.created !== true) return "the wrapper did not prove the browser process was created";
  if (report.started !== true) return "the wrapper did not prove the browser process was started";
  if (report.jobClosed !== true) return "the wrapper did not prove the job handle was closed after the tree was empty";
  if (report.activeProcesses !== 0) return `the job object still reported ${report.activeProcesses} active process(es) at closure`;
  if (!Number.isInteger(report.exitCode)) return "the wrapper did not report the browser exit code";
  if (report.terminateError !== undefined && report.terminateError !== null) {
    return `the wrapper reported a failed job termination (${report.terminateError})`;
  }
  return null;
}

/**
 * True only when a *pre-start* failure proves that no live owned process needs
 * disposal: either Node never created the wrapper (`created === false` with
 * closed handles), or the wrapper created a process, never started it, and
 * proved it terminated and that the job handle closed. Missing/null creation
 * state is unknown, never "already clean".
 */
export function provesNoCleanupNeeded(details) {
  if (!details || typeof details !== "object") return false;
  if (details.terminationProved !== true) return false;
  if (details.handlesClosed !== true) return false;
  if (details.jobClosed !== true) return false;
  // "No process was created" cannot also mean "a browser started"; contradictory
  // proof fields fail closed rather than suppressing cleanup.
  if (details.created === false) return details.started !== true;
  if (details.created === true) return true;
  return false;
}

class OwnedChildSupervision {
  constructor(child, { label, timeoutMs, startupTimeoutMs, terminationGraceMs, closeGraceMs, scheduler, onDiagnostic }) {
    this.child = child;
    this.label = label;
    this.timeoutMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0;
    this.startupTimeoutMs = Number.isFinite(startupTimeoutMs) ? Math.max(0, startupTimeoutMs) : 0;
    this.terminationGraceMs = Number.isFinite(terminationGraceMs)
      ? Math.max(1, terminationGraceMs)
      : DEFAULT_TERMINATION_GRACE_MS;
    this.closeGraceMs = Number.isFinite(closeGraceMs) ? Math.max(1, closeGraceMs) : DEFAULT_CLOSE_GRACE_MS;
    this.scheduler = scheduler ?? defaultScheduler();
    this.onDiagnostic = typeof onDiagnostic === "function" ? onDiagnostic : () => {};

    this.pid = Number.isInteger(child.pid) ? child.pid : null;
    this.stdoutBuffer = "";
    this.stderr = "";
    this.lines = [];
    this.startedReport = null;
    this.finalReport = null;
    this.reportedFailure = null;
    this.spawnFailure = null;
    this.exitInfo = null;
    this.closeInfo = null;
    this.termination = null;
    this.terminationSent = false;
    this.timeoutFired = false;
    this.startupTimedOut = false;
    this.forceKilled = false;
    this.stdinBroken = false;
    this.settled = false;
    this.outcome = null;
    this.failure = null;
    this.timers = new Set();
    this.timeoutTimer = null;
    this.startupTimer = null;
    this.terminationGraceTimer = null;
    this.closeGraceTimer = null;
    this.started = defer();
    this.exited = defer();

    this.handleStdout = (chunk) => this.consumeStdout(chunk);
    this.handleStderr = (chunk) => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-4000);
    };
    this.handleError = (error) => this.onSpawnError(error);
    this.handleExit = (code, signal) => this.onExit(code, signal);
    this.handleClose = (code, signal) => this.onClose(code, signal);
    this.handleStdinError = () => {
      this.stdinBroken = true;
    };
    this.handleTimeout = () => {
      this.timeoutTimer = null;
      this.timeoutFired = true;
      this.requestTermination("timeout");
    };
    this.handleStartupTimeout = () => {
      this.startupTimer = null;
      if (this.started.done || this.settled) return;
      this.startupTimedOut = true;
      this.requestTermination("startup-timeout");
    };
  }

  /**
   * All handlers are attached before anything is awaited. A spawn that fails
   * while the harness waits for `started` must reject that wait, not escape as
   * an unhandled `error` event; a wrapper that exits must reject too, rather
   * than leaving the run hanging forever.
   */
  attach() {
    this.child.on("error", this.handleError);
    this.child.on("exit", this.handleExit);
    this.child.on("close", this.handleClose);
    this.child.stdout?.on("data", this.handleStdout);
    this.child.stderr?.on("data", this.handleStderr);
    this.child.stdin?.on("error", this.handleStdinError);
    // Only startup is bounded here. The operation clock is armed by onStarted()
    // after the browser identity exists, or explicitly by the caller after its
    // own readiness validation; wrapper setup is never charged to that clock.
    if (this.startupTimeoutMs > 0) this.startupTimer = this.schedule(this.handleStartupTimeout, this.startupTimeoutMs);
  }

  detach() {
    this.child.removeListener?.("error", this.handleError);
    this.child.removeListener?.("exit", this.handleExit);
    this.child.removeListener?.("close", this.handleClose);
    this.child.stdout?.removeListener?.("data", this.handleStdout);
    this.child.stderr?.removeListener?.("data", this.handleStderr);
    this.child.stdin?.removeListener?.("error", this.handleStdinError);
  }

  schedule(callback, milliseconds) {
    if (!(milliseconds > 0)) return null;
    const timer = this.scheduler.setTimeout(() => {
      this.timers.delete(timer);
      try {
        callback();
      } catch (error) {
        this.fail(new OwnedBrowserChildError("internal_bug", `${this.label}: lifecycle timer failed: ${error.message}`, this.diagnostics()));
      }
    }, milliseconds);
    this.timers.add(timer);
    return timer;
  }

  clearTimers() {
    for (const timer of this.timers) this.scheduler.clearTimeout(timer);
    this.timers.clear();
    this.timeoutTimer = null;
    this.startupTimer = null;
    this.terminationGraceTimer = null;
    this.closeGraceTimer = null;
  }

  /**
   * Arm the fixture's operation deadline. `timeoutMs` does this automatically
   * when the wrapper reports `started`; callers that must wait for a stronger
   * readiness proof (for example a synthetic fixture's published process IDs)
   * pass `timeoutMs: 0` and arm this clock after that proof. Arming twice never
   * extends the first deadline.
   */
  armOperationTimeout(milliseconds = this.timeoutMs) {
    if (this.settled || this.finalReport || this.termination) return false;
    if (!this.startedReport) {
      throw new OwnedBrowserChildError(
        "not_started",
        `${this.label}: an operation timeout cannot be armed before the browser reports started`
      );
    }
    const bounded = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
    if (!(bounded > 0) || this.timeoutTimer) return false;
    this.timeoutMs = bounded;
    this.timeoutTimer = this.schedule(this.handleTimeout, bounded);
    return true;
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += String(chunk);
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.consumeLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
    if (this.stdoutBuffer.length > 1_000_000) this.protocolViolation("the wrapper emitted an oversized unterminated protocol line");
  }

  consumeLine(line) {
    if (this.settled) return; // late output after settlement is history, not state
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.protocolViolation(`non-JSON protocol line: ${line.slice(0, 200)}`);
      return;
    }
    if (!message || message.protocol !== OWNED_CHILD_PROTOCOL) {
      this.protocolViolation(`unexpected protocol ${JSON.stringify(message?.protocol ?? null)}`);
      return;
    }
    this.lines.push({ ...message, seenAt: Date.now() });
    if (message.kind === "started") return this.onStarted(message);
    if (message.kind === "exit" || message.kind === "terminated") return this.onFinal(message);
    if (message.kind === "error") return this.onReportedFailure(message);
    return this.protocolViolation(`unknown message kind ${JSON.stringify(message.kind)}`);
  }

  onStarted(message) {
    if (this.startedReport) return this.protocolViolation("the wrapper reported started twice");
    if (this.finalReport) return this.protocolViolation("the wrapper reported started after its result");
    if (!Number.isInteger(message.pid) || message.pid <= 0) return this.protocolViolation("the started message carried no browser pid");
    this.startedReport = message;
    if (this.startupTimer) {
      this.scheduler.clearTimeout(this.startupTimer);
      this.timers.delete(this.startupTimer);
      this.startupTimer = null;
    }
    this.started.done = true;
    if (this.startupTimedOut) {
      // The tree still gets the same bounded termination + closure proof; the
      // caller sees a startup failure instead of proceeding with a browser that
      // was already past its bound.
      this.started.reject(
        new OwnedBrowserChildError("startup_timeout", `${this.label}: the browser did not report started within ${this.startupTimeoutMs}ms`, this.diagnostics())
      );
    } else {
      this.started.resolve({ pid: message.pid, label: this.label });
    }
    if (this.termination) {
      if (!this.terminationSent) this.sendTerminate();
      return;
    }
    if (this.timeoutMs > 0) this.armOperationTimeout(this.timeoutMs);
  }

  onFinal(message) {
    if (!this.startedReport) return this.protocolViolation("the wrapper reported a result before started");
    if (this.finalReport) return this.protocolViolation("the wrapper reported a result twice");
    this.finalReport = message;
    this.scheduleCloseGrace();
    this.settleIfClosed();
  }

  onReportedFailure(message) {
    const report = {
      stage: typeof message.stage === "string" ? message.stage : "unknown",
      message: String(message.message ?? "the wrapper reported no message"),
      report: message,
    };
    if (!this.reportedFailure) {
      this.reportedFailure = report;
    } else if (this.reportedFailure.stage === "transport") {
      // The transport error itself says nothing about creation. A later wrapper
      // report is the authoritative creation/termination proof, so keep both
      // facts: the run still fails, but cleanup may now be affirmatively clean.
      this.reportedFailure = {
        stage: report.stage,
        message: `${this.reportedFailure.message}; the wrapper then reported: ${report.message}`,
        report: message,
      };
    }
    this.scheduleCloseGrace();
    this.settleIfClosed();
  }

  onSpawnError(error) {
    if (this.settled) return;
    this.spawnFailure = error;
    const message = `${this.label}: cannot start the ownership wrapper (${error.code ?? "error"}: ${error.message})${this.stderrSuffix()}`;
    // A ChildProcess `error` event is not proof that nothing was created: Node
    // also emits it for a failed kill of an already-running child, and a wrapper
    // that did spawn may have created a browser before any acknowledgement.
    // Only a missing wrapper pid is affirmative "Node created no process".
    if (this.pid === null && !this.startedReport) {
      this.fail(
        new OwnedBrowserChildError("spawn_failed", message, {
          ...this.diagnostics(),
          created: false,
          started: false,
          terminationProved: true,
          handlesClosed: true,
          jobClosed: true,
        })
      );
      return;
    }
    // A wrapper process exists (or existed): ask the job owner to terminate and
    // wait for wrapper closure before failing. The termination grace, not the
    // short post-result close grace, covers this cleanup.
    if (!this.reportedFailure) this.reportedFailure = { stage: "transport", message };
    this.requestTermination("wrapper-error");
  }

  onExit(code, signal) {
    this.exitInfo = { code, signal: signal ?? null };
    if (this.settled) return;
    // `close` normally follows. If the wrapper died without closing its stdio,
    // this bound guarantees the run fails instead of hanging on a final report.
    this.scheduleCloseGrace();
  }

  onClose(code, signal) {
    this.closeInfo = { code: Number.isInteger(code) ? code : null, signal: signal ?? null };
    if (this.settled) return;
    if (this.reportedFailure) {
      this.fail(this.failureFromReport());
      return;
    }
    if (!this.startedReport) {
      this.fail(
        new OwnedBrowserChildError(
          "wrapper_exit_unreported",
          `${this.label}: the ownership wrapper exited before the browser started (code ${code}, signal ${signal ?? "none"})${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    this.settleIfClosed();
  }

  settleIfClosed() {
    if (this.settled || !this.closeInfo) return;
    if (this.reportedFailure) {
      this.fail(this.failureFromReport());
      return;
    }
    if (!this.finalReport) {
      const terminated = Boolean(this.termination);
      this.fail(
        new OwnedBrowserChildError(
          terminated ? "closure_unproved" : "wrapper_exit_unreported",
          `${this.label}: the ownership wrapper exited (code ${this.closeInfo.code}, signal ${this.closeInfo.signal ?? "none"}) without reporting ${
            terminated ? "confirmed descendant closure" : "a browser result"
          }; cleanup cannot be proved${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    if (this.forceKilled) {
      this.fail(
        new OwnedBrowserChildError(
          "closure_unproved",
          `${this.label}: the ownership wrapper was force-killed, so its own cleanup proof cannot be trusted${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    if (this.closeInfo.signal) {
      this.fail(
        new OwnedBrowserChildError(
          "wrapper_signalled",
          `${this.label}: the ownership wrapper was terminated by signal ${this.closeInfo.signal}; its cleanup proof is incomplete${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    if (this.closeInfo.code !== 0) {
      this.fail(
        new OwnedBrowserChildError(
          "wrapper_exit_failed",
          `${this.label}: the ownership wrapper exited with code ${this.closeInfo.code} after reporting a result; failure is not success${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    if (!Number.isInteger(this.finalReport.pid) || this.finalReport.pid !== this.startedReport.pid) {
      this.fail(
        new OwnedBrowserChildError(
          "identity_mismatch",
          `${this.label}: the final result names pid ${JSON.stringify(this.finalReport.pid)}, but the wrapper started pid ${this.startedReport.pid}; the owned identity is unbound${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    const gap = closureGap(this.finalReport);
    if (gap) {
      this.fail(
        new OwnedBrowserChildError(
          "closure_unproved",
          `${this.label}: ${gap}; refusing to treat the process as finished${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
      return;
    }
    const shared = {
      exitCode: this.finalReport.exitCode,
      activeProcesses: 0,
      jobClosed: true,
      pid: this.startedReport.pid,
      wrapper: { ...this.closeInfo },
      forcedDescendants: Boolean(this.finalReport.forcedDescendants),
    };
    if (this.finalReport.kind === "terminated") {
      this.succeed({
        kind: "terminated",
        reason: this.termination?.reason ?? String(this.finalReport.reason ?? "unknown"),
        ...shared,
      });
      return;
    }
    this.succeed({ kind: "exit", ...shared });
  }

  failureFromReport() {
    const { stage, message } = this.reportedFailure;
    // A transport error has no creation proof of its own. If the wrapper later
    // reported a result, that result is the proof to carry into the failure.
    const report = this.reportedFailure.report ?? this.finalReport;
    const finalProvesTermination =
      report?.kind === "terminated" && report?.jobClosed === true && report?.activeProcesses === 0;
    const details = {
      ...this.diagnostics(),
      created: typeof report?.created === "boolean" ? report.created : null,
      started: typeof report?.started === "boolean" ? report.started : null,
      browserPid: Number.isInteger(report?.pid) ? report.pid : this.startedReport?.pid ?? null,
      terminationProved: report?.terminationProved === true || finalProvesTermination,
      handlesClosed: report?.handlesClosed === true || finalProvesTermination,
      jobClosed: report?.jobClosed === true,
      activeProcesses: Number.isInteger(report?.activeProcesses) ? report.activeProcesses : null,
      terminateError: report?.terminateError ?? null,
    };
    if (stage === "transport") {
      return new OwnedBrowserChildError("spawn_failed", `${message}${this.stderrSuffix()}`, details);
    }
    const code =
      stage === "setup"
        ? "wrapper_setup_failed"
        : stage === "terminate"
          ? "terminate_failed"
          : stage === "wait" || stage === "closure"
            ? "closure_unproved"
            : "wrapper_protocol_violation";
    return new OwnedBrowserChildError(code, `${this.label}: ${message}${this.stderrSuffix()}`, details);
  }

  protocolViolation(message) {
    if (this.settled) return;
    if (!this.reportedFailure) this.reportedFailure = { stage: "protocol", message };
    // Do not leave an unowned browser behind because its wrapper said something
    // unexpected: ask the job owner to terminate and let the termination grace
    // cover its cleanup. The close grace must not start here, or a legitimate
    // slow cleanup would be force-killed and misreported.
    this.requestTermination("protocol");
  }

  requestTermination(reason) {
    if (this.settled) return;
    if (!this.termination) {
      this.termination = { reason, at: Date.now() };
      this.onDiagnostic(`${this.label}: terminating the owned process tree (${reason})`);
    }
    this.sendTerminate();
    this.scheduleTerminationGrace();
  }

  sendTerminate() {
    if (this.terminationSent || this.settled) return;
    this.terminationSent = true;
    if (!this.child.stdin) {
      this.stdinBroken = true;
      this.onDiagnostic(`${this.label}: the wrapper has no stdin pipe; termination cannot be requested`);
      return;
    }
    try {
      this.child.stdin.write("terminate\n");
    } catch (error) {
      this.stdinBroken = true;
      this.onDiagnostic(`${this.label}: could not write the terminate control (${error.message})`);
    }
  }

  scheduleTerminationGrace() {
    if (this.settled || this.finalReport || this.terminationGraceTimer) return;
    this.terminationGraceTimer = this.schedule(() => {
      this.terminationGraceTimer = null;
      if (this.settled || this.finalReport) return;
      this.forceKillWrapper("the wrapper did not confirm descendant closure within the termination grace");
      this.scheduleCloseGrace();
    }, this.terminationGraceMs);
  }

  scheduleCloseGrace(milliseconds = this.closeGraceMs) {
    if (this.settled || this.closeInfo || this.closeGraceTimer) return;
    this.closeGraceTimer = this.schedule(() => {
      this.closeGraceTimer = null;
      if (this.settled || this.closeInfo) return;
      this.forceKillWrapper(`the wrapper did not close within ${milliseconds}ms of its last report`);
      this.fail(
        new OwnedBrowserChildError(
          "closure_unproved",
          `${this.label}: the ownership wrapper did not exit after its last report; descendant closure cannot be proved${this.stderrSuffix()}`,
          this.diagnostics()
        )
      );
    }, milliseconds);
  }

  forceKillWrapper(reason) {
    if (this.forceKilled) return;
    this.forceKilled = true;
    this.onDiagnostic(`${this.label}: ${reason}; killing the ownership wrapper as the last resort (closure will be reported unproved)`);
    try {
      this.child.kill("SIGKILL");
    } catch (error) {
      this.onDiagnostic(`${this.label}: the last-resort wrapper kill failed (${error.message})`);
    }
  }

  succeed(outcome) {
    if (this.settled) return;
    this.settled = true;
    this.outcome = outcome;
    this.clearTimers();
    if (!this.started.done) {
      this.started.done = true;
      this.started.reject(new OwnedBrowserChildError("closure_unproved", `${this.label}: settled before a browser started`, this.diagnostics()));
    }
    this.exited.done = true;
    this.exited.resolve(outcome);
  }

  fail(error) {
    if (this.settled) return;
    this.settled = true;
    this.failure = error;
    this.clearTimers();
    if (!this.started.done) {
      this.started.done = true;
      this.started.reject(error);
    }
    this.exited.done = true;
    this.exited.reject(error);
  }

  async terminate(reason = "cancelled") {
    if (!this.settled) {
      this.requestTermination(reason);
      try {
        await this.exited.promise;
      } catch {
        /* `this.failure` below is the authoritative rejection */
      }
    }
    if (this.failure) throw this.failure;
    return this.outcome;
  }

  stderrSuffix() {
    const text = this.stderr.trim();
    return text ? ` [wrapper stderr: ${text.slice(-600)}]` : "";
  }

  diagnostics() {
    return {
      label: this.label,
      wrapperPid: this.pid,
      browserPid: this.startedReport?.pid ?? null,
      timeoutMs: this.timeoutMs,
      timedOut: this.timeoutFired,
      startupTimedOut: this.startupTimedOut,
      termination: this.termination?.reason ?? null,
      terminationSent: this.terminationSent,
      started: Boolean(this.startedReport),
      final: this.finalReport,
      reportedFailure: this.reportedFailure,
      wrapperExit: this.closeInfo,
      wrapperSignalled: this.exitInfo,
      forceKilledWrapper: this.forceKilled,
      stderr: this.stderr.slice(-1500),
      protocolLines: this.lines.slice(-6),
    };
  }

  handle() {
    const supervision = this;
    return {
      label: supervision.label,
      get pid() {
        return supervision.startedReport?.pid ?? supervision.pid;
      },
      get timedOut() {
        return supervision.timeoutFired;
      },
      get startupTimedOut() {
        return supervision.startupTimedOut;
      },
      get everStarted() {
        return Boolean(supervision.startedReport);
      },
      get terminationReason() {
        return supervision.termination?.reason ?? null;
      },
      get outcome() {
        return supervision.outcome;
      },
      get failure() {
        return supervision.failure;
      },
      get activeTimerCount() {
        return supervision.timers.size;
      },
      started: supervision.started.promise,
      exited: supervision.exited.promise,
      armOperationTimeout: (milliseconds) => supervision.armOperationTimeout(milliseconds),
      terminate: (reason) => supervision.terminate(reason),
      diagnostics: () => supervision.diagnostics(),
      dispose: () => {
        supervision.clearTimers();
        supervision.detach();
        supervision.detachAbort?.();
      },
    };
  }
}

/**
 * Start one owned browser and return its handle immediately (after spawn).
 *
 * `timeoutMs: 0` (the main browser) means no overall deadline; the handle is
 * ended with `terminate()`. A positive timeout is armed when the browser reports
 * started, not while the wrapper is still setting up. A caller that needs the
 * clock to begin after a stronger readiness proof passes `timeoutMs: 0` and
 * calls `handle.armOperationTimeout(ms)` after that proof. One-shot fixtures use
 * `runOwnedBrowserChild()`.
 *
 * Setup is deliberately fail-closed: a non-Windows host, a missing wrapper, or
 * a failed spawn rejects before any browser can run unowned.
 */
export function startOwnedBrowserChild(options = {}) {
  const {
    executablePath,
    args = [],
    cwd,
    label = "owned browser",
    timeoutMs = 0,
    startupTimeoutMs = 0,
    terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS,
    closeGraceMs = DEFAULT_CLOSE_GRACE_MS,
    spawnImpl = spawn,
    platform = process.platform,
    wrapperPath = DEFAULT_WRAPPER_PATH,
    scheduler,
    onDiagnostic,
    signal,
  } = options;

  if (platform !== "win32") {
    throw new OwnedBrowserChildError(
      "setup_denied",
      `${label}: owned-child job objects are implemented for win32 only (platform ${platform}); refusing to run a browser whose descendants cannot be owned`
    );
  }
  if (!wrapperPath || !existsSync(wrapperPath)) {
    throw new OwnedBrowserChildError("setup_denied", `${label}: the owned-child wrapper is missing at ${wrapperPath}`);
  }
  if (!executablePath) {
    throw new OwnedBrowserChildError("setup_denied", `${label}: no browser executable was supplied`);
  }

  const invocation = buildWrapperInvocation({ executablePath, args, cwd, wrapperPath });
  let child;
  try {
    child = spawnImpl(invocation.command, invocation.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  } catch (error) {
    throw new OwnedBrowserChildError("spawn_failed", `${label}: could not spawn the ownership wrapper (${error.message})`, {
      command: invocation.command,
    });
  }

  const supervision = new OwnedChildSupervision(child, {
    label,
    timeoutMs,
    startupTimeoutMs,
    terminationGraceMs,
    closeGraceMs,
    scheduler,
    onDiagnostic,
  });
  supervision.attach();

  if (signal) {
    const onAbort = () => supervision.requestTermination("cancelled");
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener("abort", onAbort, { once: true });
      supervision.detachAbort = () => signal.removeEventListener("abort", onAbort);
    }
  }

  return supervision.handle();
}

/**
 * Run one temporary browser to completion and prove its tree closed.
 *
 * Success requires all of: the wrapper's final result is `exit`, its exit code
 * is 0, the same browser pid it announced, `created`/`started`/`jobClosed` all
 * true, `activeProcesses` 0, a wrapper close with code 0 and no signal, no
 * force-kill, neither the startup nor the operation deadline was hit, no
 * cancellation was recorded, and (when `expectFile` is given) the fixture output
 * exists and is non-empty. Everything else rejects; a timeout or cancellation is
 * never reported as a generated fixture.
 *
 * Startup and operation each have their own finite bound. The operation clock
 * begins only after the wrapper reports the browser started. A startup-bound
 * expiry is terminal for this one-shot path: it rejects after the owned tree's
 * bounded cleanup even when a late `started`, a natural exit 0, a valid non-empty
 * fixture and a clean wrapper close follow.
 */
export async function runOwnedBrowserChild(options = {}) {
  const {
    expectFile = null,
    label = "owned browser fixture",
    timeoutMs = DEFAULT_FIXTURE_TIMEOUT_MS,
    startupTimeoutMs = DEFAULT_FIXTURE_STARTUP_TIMEOUT_MS,
    ...rest
  } = options;
  const handle = startOwnedBrowserChild({ ...rest, label, timeoutMs, startupTimeoutMs });
  try {
    const outcome = await handle.exited;
    // A startup deadline is a terminal lifecycle decision, not merely a rejected
    // `started` promise. Once the bound has fired, a late acknowledgement and a
    // natural exit 0 with a valid fixture cannot rewrite that decision. Check it
    // first, for every final report kind, because `exited` may resolve normally
    // after the wrapper observed the browser finish while termination was queued.
    if (handle.startupTimedOut) {
      throw new OwnedBrowserChildError(
        "startup_timeout",
        `${label}: the browser did not report started within ${startupTimeoutMs}ms; a late start and a natural exit are never fixture success`,
        handle.diagnostics()
      );
    }
    if (handle.timedOut) {
      throw new OwnedBrowserChildError(
        "timeout",
        `${label}: did not finish within ${timeoutMs}ms; the owned process tree was terminated, and a timeout is never fixture success`,
        handle.diagnostics()
      );
    }
    // The cancellation decision is ours, not the wrapper's final kind. A
    // wrapper can legitimately observe the browser's natural exit after the
    // abort was recorded; that race is still a cancellation, never a fixture.
    if (handle.terminationReason === "cancelled") {
      throw new OwnedBrowserChildError(
        "cancelled",
        `${label}: the run was cancelled; a natural exit racing the cancellation is never fixture success`,
        handle.diagnostics()
      );
    }
    if (outcome.kind !== "exit") {
      const cancelled = outcome.reason === "cancelled";
      throw new OwnedBrowserChildError(
        cancelled ? "cancelled" : "unexpected_termination",
        `${label}: the browser was terminated (${outcome.reason}) instead of finishing`,
        handle.diagnostics()
      );
    }
    if (outcome.exitCode !== 0) {
      throw new OwnedBrowserChildError("fixture_failed", `${label}: the browser exited with code ${outcome.exitCode}`, handle.diagnostics());
    }
    if (expectFile) {
      let size = 0;
      try {
        size = statSync(expectFile).size;
      } catch {
        size = 0;
      }
      if (!(size > 0)) {
        throw new OwnedBrowserChildError(
          "fixture_output_missing",
          `${label}: the browser exited successfully but wrote no usable file at ${expectFile}`,
          handle.diagnostics()
        );
      }
    }
    return outcome;
  } finally {
    handle.dispose();
  }
}
