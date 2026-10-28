#!/usr/bin/env node
/**
 * Browser preview + verification through the DevTools protocol.
 *
 * Launches headless Chrome, signs in through the real API, then screenshots each
 * product route and reports console errors and layout overflow. No dependencies:
 * Node's global WebSocket does the talking.
 *
 *   node scripts/browser-preview.mjs [baseUrl]
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "screenshots");
const BASE = process.argv[2] || "http://127.0.0.1:3160";
const PORT = 9333;
const EMAIL = "demo@applywright.example";
const PASSWORD = "demo-password-123";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitForEndpoint(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error(`devtools endpoint did not appear at ${url}`);
}

/** Minimal CDP client over one flat session. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
      }
    });
  }

  send(method, params = {}, useSession = true) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (useSession && this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject });
      this.socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20_000);
    });
  }
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chromePath) throw new Error("no Chrome or Edge found");

  // Sign in first, over plain HTTP, so the browser only has to carry the cookie.
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed (${login.status}) — run scripts/seed.mjs first`);
  const cookieHeader = login.headers.get("set-cookie") || "";
  const session = cookieHeader.match(/aw_session=([^;]+)/)?.[1];
  if (!session) throw new Error("login returned no session cookie");

  const profileDir = await mkdtemp(join(tmpdir(), "aw-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--window-size=1440,1000",
    "about:blank",
  ], { stdio: "ignore" });

  const findings = { console: [], routes: [] };
  try {
    const version = await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((done, reject) => {
      socket.addEventListener("open", done, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(socket);

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }, false);
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true }, false);
    cdp.sessionId = attached.sessionId;

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Network.setCookie", {
      name: "aw_session",
      value: session,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
        findings.console.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ").slice(0, 200));
      }
      if (message.method === "Runtime.exceptionThrown") {
        findings.console.push(`exception: ${message.params.exceptionDetails?.text ?? "unknown"}`);
      }
    });

    const routes = [
      ["/app", "30-app-dashboard"],
      ["/app/cv", "31-app-cv"],
      ["/app/jobs", "32-app-jobs"],
      ["/app/applications", "33-app-applications"],
      ["/app/alerts", "34-app-alerts"],
      ["/app/billing", "35-app-billing"],
    ];

    for (const [route, name] of routes) {
      await cdp.send("Page.navigate", { url: `${BASE}${route}` });
      await sleep(1400);
      const probe = await cdp.send("Runtime.evaluate", {
        expression: `(() => ({
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim() ?? null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          text: (document.querySelector('#app-view')?.innerText ?? document.body.innerText).slice(0, 180).replace(/\\s+/g, ' ')
        }))()`,
        returnByValue: true,
      });
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(OUT, `${name}.png`), Buffer.from(shot.data, "base64"));
      findings.routes.push({ route, ...probe.result.value });
    }

    // A narrow pass to prove the layout holds.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Page.navigate", { url: `${BASE}/app/jobs` });
    await sleep(1200);
    const narrow = await cdp.send("Runtime.evaluate", {
      expression: "document.documentElement.scrollWidth - document.documentElement.clientWidth",
      returnByValue: true,
    });
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(OUT, "36-app-jobs-390.png"), Buffer.from(shot.data, "base64"));
    findings.mobileOverflow = narrow.result.value;

    socket.close();
  } finally {
    chrome.kill();
  }

  console.log(JSON.stringify(findings, null, 2));
  if (findings.console.length) {
    console.log(`\n${findings.console.length} console problem(s)`);
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error("preview failed:", error.message);
  process.exit(1);
});
