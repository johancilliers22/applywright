#!/usr/bin/env node
/**
 * Static self-check. No dependencies, no browser.
 *
 *   node scripts/check.js [--strict]
 *
 * Answers what the test suite cannot: does every page hold together as HTML, do
 * the includes and assets resolve, is the copy honest to the spec, and does any
 * server module reach for eval or carry a literal secret.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const strict = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const read = (p) => readFile(p, "utf8");

const HTML_ONLY_CLASSES = new Set(['no-js', 'js', 'reveal-on', 'is-visible', 'reveal-off']);

const HYPE = [
  "revolutionary", "game-changing", "game changing", "unleash", "supercharge", "seamless",
  "cutting-edge", "cutting edge", "world-class", "best-in-class", "empower", "leverage",
  "synergy", "next-generation", "state-of-the-art", "effortless", "magic",
];

const BANNED = [
  { pattern: /trusted by \d/i, why: "fabricated customer count" },
  { pattern: /lorem ipsum/i, why: "placeholder copy" },
  { pattern: /href\s*=\s*["']#["']/, why: "placeholder link" },
  { pattern: /\bTODO\b|\bFIXME\b/, why: "unfinished marker" },
  { pattern: /\bapply(?:ing)? for you automatically\b/i, why: "claims automated submission, which the product deliberately does not do" },
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

async function loadCssClasses() {
  const defined = new Set();
  for (const file of await walk(join(PUBLIC, "assets"))) {
    if (!file.endsWith(".css")) continue;
    const css = await read(file);
    for (const match of css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) defined.add(match[1]);
  }
  return defined;
}

async function checkPages(definedClasses) {
  const files = (await walk(PUBLIC)).filter((file) => file.endsWith(".html") && !file.includes(`${sep}partials${sep}`));
  if (!files.length) fail("no HTML pages found under public/");

  for (const file of files) {
    const label = file.slice(ROOT.length + 1).replace(/\\/g, "/");
    const html = await read(file);

    const h1s = [...html.matchAll(/<h1\b/gi)].length;
    if (h1s !== 1) fail(`${label}: expected exactly one <h1>, found ${h1s}`);
    if (!/<html lang=/i.test(html)) fail(`${label}: <html> has no lang attribute`);
    if (!/<meta name="viewport"/i.test(html)) fail(`${label}: no viewport meta`);

    const includes = [...html.matchAll(/<!--#include\s+([\w.-]+)\s*-->/g)].map((m) => m[1]);
    for (const name of includes) {
      try {
        await read(join(PUBLIC, "partials", name));
      } catch {
        fail(`${label}: include "${name}" missing from public/partials/`);
      }
    }

    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail(`${label}: inline <script> is blocked by the CSP`);
    if (/\son[a-z]+\s*=\s*["']/i.test(html)) fail(`${label}: inline event handler attribute (CSP forbids)`);

    for (const match of html.matchAll(/(?:src|href)="(\/(?:assets|favicon)[^"?#]*)"/g)) {
      try {
        await read(join(PUBLIC, match[1].replace(/^\//, "")));
      } catch {
        fail(`${label}: references ${match[1]} which does not exist`);
      }
    }
    const remote = [...html.matchAll(/<(?:img|script|iframe|source|video|audio|link|embed|object)\b[^>]*(?:src|href)="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
    if (remote.length) fail(`${label}: loads remote resources: ${remote.join(", ")}`);

    const text = html.toLowerCase();
    for (const word of HYPE) if (text.includes(word)) warn(`${label}: hype vocabulary "${word}"`);
    for (const rule of BANNED) if (rule.pattern.test(html)) fail(`${label}: ${rule.why}`);

    for (const match of html.matchAll(/class="([^"]+)"/g)) {
      for (const token of match[1].split(/\s+/).filter(Boolean)) {
        if (!definedClasses.has(token) && !HTML_ONLY_CLASSES.has(token)) warn(`${label}: class "${token}" is not defined in any stylesheet`);
      }
    }
  }
  return files.length;
}

async function checkServer() {
  const files = (await walk(join(ROOT, "server"))).filter((file) => file.endsWith(".js"));
  if (!files.length) fail("no server sources found");
  const secretRules = [
    { pattern: /sk-[A-Za-z0-9]{16,}/, why: "possible literal API key" },
    { pattern: /(?:api[_-]?key|token)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i, why: "possible literal credential" },
  ];
  for (const file of files) {
    const label = file.slice(ROOT.length + 1).replace(/\\/g, "/");
    const source = await read(file);
    for (const rule of secretRules) if (rule.pattern.test(source)) fail(`${label}: ${rule.why}`);
    if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) fail(`${label}: eval/new Function is not allowed`);
  }
  return files.length;
}

/**
 * A bookmarklet is a URL, not just JavaScript: `node --check` passes on a file
 * whose scheme is on line 186, and that file is silently a relative path in a
 * browser. This asserts the properties that actually matter.
 */
async function checkBookmarklet() {
  let source;
  try {
    source = (await read(join(PUBLIC, "assets", "bookmarklet.js"))).trim();
  } catch {
    return 0;
  }
  const label = "public/assets/bookmarklet.js";
  let protocol = null;
  try {
    protocol = new URL(source).protocol;
  } catch {
    protocol = null;
  }
  const schemes = (source.match(/javascript:/g) ?? []).length;
  const tokens = (source.match(/__ORIGIN__/g) ?? []).length;
  if (protocol !== "javascript:") {
    fail(`${label}: address does not parse as a javascript: URL (got ${protocol ?? "no scheme"}) — a banner-first line is a relative http path and never runs`);
  }
  if (schemes !== 1) fail(`${label}: expected exactly one "javascript:" scheme, found ${schemes}`);
  if (tokens !== 1) fail(`${label}: expected exactly one __ORIGIN__ token, found ${tokens}`);
  if (/\r?\n/.test(source)) fail(`${label}: the bookmarklet must be a single line`);
  if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(source)) fail(`${label}: must not make network calls`);
  return 1;
}

const bookmarkletChecked = await checkBookmarklet();
const definedClasses = await loadCssClasses();
const pageCount = await checkPages(definedClasses);
const sourceCount = await checkServer();

console.log(`applywright check — ${pageCount} pages, ${sourceCount} server modules, ${definedClasses.size} css classes`);
for (const message of warnings) console.log(`  warn  ${message}`);
for (const message of errors) console.log(`  FAIL  ${message}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
if (strict && warnings.length) {
  console.log(`\n0 errors, ${warnings.length} warning(s) — strict mode fails`);
  process.exit(1);
}
console.log(`\nok — 0 errors, ${warnings.length} warning(s)`);
