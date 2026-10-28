/**
 * The contrast gate, proved offline.
 *
 * The point of these tests is not that a duplicate calculator can add up: it is
 * that the real `scripts/check.js` process exits nonzero, naming the scheme and
 * pair, when a documented token pair is mutated below its threshold. The scratch
 * copy contains only the files the check reads — public/, server/, the two
 * scripts and package.json — never .git, node_modules, data/ or credential files.
 * The copy is explicit and recursive with a nested exclusion filter. Secret,
 * credential, password and API-key names are refused before any source
 * extension is considered; auth/token names are refused too unless they are one
 * of the named shipped source assets (tokens.css, auth.css, auth.js,
 * auth.local.css, logo-auth.svg); leading-dot names keep their basename, so
 * `.secret` is excluded rather than reduced to an empty stem. A partial scratch
 * directory is removed if setup fails, and reparse/symlink entries are refused
 * rather than followed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  PAIRS,
  TEXT_MIN,
  INDICATOR_MIN,
  checkContrast,
  compositeOver,
  contrastRatio,
  evaluateScheme,
  formatRatio,
  layerTokens,
  parseColor,
  parseTokenBlocks,
  resolveToken,
} from "../scripts/contrast.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function nearly(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
}

function runCheck(cwd) {
  const result = spawnSync(process.execPath, ["scripts/check.js"], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.error, undefined, `spawn failed: ${result.error?.message}`);
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const FORBIDDEN_NAMES = new Set([".git", "node_modules", "data", ".cache", ".ssh"]);
// Shipped source/assets that legitimately carry an auth/token-style name. This
// is a named copy guard, not a credential classifier: the exception stays an
// explicit list instead of letting every source extension bypass the families.
const PERMITTED_SOURCE_NAMES = new Set([
  "tokens.css",
  "auth.css",
  "auth.js",
  "auth.local.css",
  "logo-auth.svg",
]);
// Secret/credential names are refused before any source extension is considered:
// secrets.js, credentials.local.cjs, password.html and api-key.ts are excluded.
const SECRET_FAMILY =
  /(?:^|[._-])(?:secrets?|credentials?|password|passwd|api[-_.]?key|access[-_.]?token|refresh[-_.]?token)(?:[._-]|$)/i;
// Auth/token names stay out unless they are one of the permitted source assets:
// auth.local.json and tokens.prod.json are excluded; tokens.css and auth.js stay.
const AUTH_TOKEN_FAMILY =
  /(?:^|[._-])(?:auth|authentication|authorization|tokens?)(?:[._-]|$)/i;

function forbiddenScratchEntry(name) {
  const lower = name.toLowerCase();
  if (FORBIDDEN_NAMES.has(lower)) return true;
  if (/^\.env(?:\..*)?$/i.test(lower)) return true;
  if (/^id_(?:rsa|ed25519)(?:\.pub)?$/i.test(lower)) return true;
  if (/^\.npmrc$|^\.netrc$/i.test(lower)) return true;
  if (/\.(?:pem|key|pfx|p12|jks|keystore|sqlite3?|db|log|bak|tmp)$/i.test(lower)) return true;

  if (PERMITTED_SOURCE_NAMES.has(lower)) return false;
  // Leading-dot names keep their whole basename: ".secret" is a secret file,
  // not an extension with an empty stem.
  const basename = lower.startsWith(".") ? lower.slice(1) : lower;
  // These families are refused regardless of .js/.cjs/.css/.svg or any other
  // suffix, so a source extension can never reopen an explicit exclusion.
  if (SECRET_FAMILY.test(basename)) return true;
  return AUTH_TOKEN_FAMILY.test(basename);
}

async function isReparseEntry(source, stats) {
  if (stats.isSymbolicLink()) return true;
  if (process.platform !== "win32") return false;
  // A Windows junction can present as a directory to some providers; readlink
  // is the reliable discriminator and throws for an ordinary directory.
  try {
    await readlink(source);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(source, destination) {
  const stats = await lstat(source);
  if (await isReparseEntry(source, stats)) {
    throw new Error(`refusing to copy reparse/symlink entry: ${source}`);
  }
  if (stats.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (forbiddenScratchEntry(entry.name)) continue;
      await copyTree(join(source, entry.name), join(destination, entry.name));
    }
    return;
  }
  if (!stats.isFile()) throw new Error(`refusing to copy non-regular entry: ${source}`);
  await copyFile(source, destination);
}

async function assertScratchIsSafe(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(
      forbiddenScratchEntry(entry.name),
      false,
      `scratch excludes ${entry.name}`
    );
    if (entry.isDirectory()) await assertScratchIsSafe(join(directory, entry.name));
  }
}

async function scratchCheckout(sourceRoot = ROOT, temporaryRoot = tmpdir()) {
  const directory = await mkdtemp(join(temporaryRoot, "aw-contrast-"));
  try {
    await copyTree(join(sourceRoot, "public"), join(directory, "public"));
    await copyTree(join(sourceRoot, "server"), join(directory, "server"));
    await mkdir(join(directory, "scripts"));
    for (const file of ["check.js", "contrast.js"]) {
      await copyTree(join(sourceRoot, "scripts", file), join(directory, "scripts", file));
    }
    await copyTree(join(sourceRoot, "package.json"), join(directory, "package.json"));
    assert.equal(existsSync(join(directory, ".git")), false, "scratch excludes .git");
    assert.equal(existsSync(join(directory, "node_modules")), false, "scratch excludes node_modules");
    assert.equal(existsSync(join(directory, "data")), false, "scratch excludes data/");
    assert.equal(
      existsSync(join(directory, "public", "assets", "tokens.css")),
      true,
      "the permitted shipped tokens.css is present"
    );
    await assertScratchIsSafe(directory);
    return directory;
  } catch (error) {
    // Setup can fail before the caller's finally block exists; remove the
    // partial scratch tree here so no fixture or copied file is left behind.
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function mutate(directory, relative, from, to) {
  const path = join(directory, relative);
  const source = await readFile(path, "utf8");
  assert.ok(source.includes(from), `mutation target is present: ${from}`);
  await writeFile(path, source.replace(from, to));
}

test("the shipped tokens pass and cover 29 pairs in both schemes", async () => {
  const result = await checkContrast(ROOT);
  assert.deepEqual(result.errors, []);
  assert.equal(PAIRS.length, 29, "the documented pair set stays explicit");
  assert.equal(result.light.pairCount, 29);
  assert.equal(result.dark.pairCount, 29);
  assert.equal(result.pairCount, 58);
  assert.ok(result.light.comparisons.every((pair) => pair.pass));
  assert.ok(result.dark.comparisons.every((pair) => pair.pass));
  assert.ok(result.light.comparisons.every((pair) => pair.ratio >= pair.min));
  assert.ok(result.dark.comparisons.every((pair) => pair.ratio >= pair.min));
  assert.ok(result.light.comparisons.some((pair) => pair.min === INDICATOR_MIN));
  assert.ok(result.light.comparisons.some((pair) => pair.min === TEXT_MIN));
});

test("the cascade applies theme.css's re-key before the dark block", async () => {
  const result = await checkContrast(ROOT);
  const light = result.tokens.light;
  const dark = result.tokens.dark;

  const lightFocus = resolveToken(light, "--focus");
  assert.deepEqual(lightFocus, { r: 15, g: 92, b: 67, a: 1 });
  assert.deepEqual(resolveToken(light, "--accent"), lightFocus, "focus resolves through accent");
  assert.notDeepEqual(lightFocus, parseColor("#2f4bff"), "tokens.css's base blue is re-keyed by theme.css");

  const darkFocus = resolveToken(dark, "--focus");
  assert.deepEqual(darkFocus, { r: 71, g: 201, b: 154, a: 1 });
  assert.deepEqual(resolveToken(dark, "--accent"), darkFocus);
  assert.notDeepEqual(darkFocus, lightFocus, "the dark block wins over the light re-key");
});

test("the parser ignores the print palette and reads both root blocks", async () => {
  const tokens = await readFile(join(ROOT, "public/assets/tokens.css"), "utf8");
  const theme = await readFile(join(ROOT, "public/assets/theme.css"), "utf8");
  const parsedTokens = parseTokenBlocks(tokens);
  const parsedTheme = parseTokenBlocks(theme);
  assert.equal(parsedTokens.base.length, 1);
  assert.equal(parsedTokens.dark.length, 1);
  assert.equal(parsedTheme.base.length, 1);
  assert.equal(parsedTheme.dark.length, 0, "the @media print block is not a screen scheme");
});

test("aliases resolve, and a cycle is a named failure rather than a guess", () => {
  const tokens = new Map([
    ["--paper", "#ffffff"],
    ["--accent", "#0f5c43"],
    ["--focus", "var(--accent)"],
  ]);
  assert.equal(resolveToken(tokens, "--focus").g, 92);

  const cyclic = new Map([
    ["--a", "var(--b)"],
    ["--b", "var(--a)"],
  ]);
  assert.throws(() => resolveToken(cyclic, "--a"), /cyclic alias --a -> --b -> --a/);
});

test("a missing or invalid required token fails with the scheme and pair", () => {
  const pair = [{ foreground: "--text", background: "--paper", min: TEXT_MIN, role: "test pair" }];

  const missing = evaluateScheme("dark", new Map([["--paper", "#000000"]]), pair);
  assert.equal(missing.passed, false);
  assert.match(
    missing.errors[0],
    /^contrast dark: --text on --paper cannot be measured — required token --text is missing$/
  );

  const invalid = evaluateScheme(
    "light",
    new Map([
      ["--paper", "#ffffff"],
      ["--text", "chartreuse"],
    ]),
    pair
  );
  assert.equal(invalid.passed, false);
  assert.match(invalid.errors[0], /token --text has invalid value "chartreuse"/);
});

test("functional colour syntax is validated before any channel is converted", () => {
  assert.deepEqual(parseColor("rgba(11, 12, 14, 0.48)"), { r: 11, g: 12, b: 14, a: 0.48 });
  assert.deepEqual(parseColor("rgb(0 0 0 / 50%)"), { r: 0, g: 0, b: 0, a: 0.5 });
  const percentages = parseColor("rgb(10%, 20%, 30%)");
  nearly(percentages.r, 25.5, "10% channel");
  nearly(percentages.g, 51, "20% channel");
  nearly(percentages.b, 76.5, "30% channel");
  assert.equal(percentages.a, 1);

  // Legacy comma syntax requires one unit type across its three channels;
  // modern space syntax deliberately allows a mix, and alpha is independent.
  assert.deepEqual(parseColor("rgb(0% 0 0)"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("rgba(0%, 0%, 0%, 100%)"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("rgba(0%, 0%, 0%, 50%)"), { r: 0, g: 0, b: 0, a: 0.5 });
  const mixedModern = parseColor("rgb(0% 0 255 / 50%)");
  assert.equal(mixedModern.r, 0);
  assert.equal(mixedModern.g, 0);
  assert.equal(mixedModern.b, 255);
  assert.equal(mixedModern.a, 0.5);
  assert.throws(
    () => parseColor("rgb(0%, 0, 0)"),
    /legacy comma rgb\(\) channels must share one unit type/
  );
  assert.throws(
    () => parseColor("rgb(0, 0%, 0%)"),
    /legacy comma rgb\(\) channels must share one unit type/
  );
  assert.throws(
    () => parseColor("rgba(0%, 0, 0, 0.5)"),
    /legacy comma rgb\(\) channels must share one unit type/
  );

  assert.throws(() => parseColor("rgb(0,,0,0)"), /empty channel/);
  assert.throws(() => parseColor("rgb(0x0, 0, 0)"), /invalid channel "0x0"/);
  assert.throws(() => parseColor("rgb(1., 0, 0)"), /invalid channel "1\."/);
  assert.throws(() => parseColor("rgb(0, 0 0)"), /expected 3 or 4 channels/);
  assert.throws(() => parseColor("rgb(0, 0, 0 / 0.5)"), /mixed comma and slash separators/);
  assert.throws(
    () => parseColor("rgb(0 0 0 0.5)"),
    /expected exactly 3 channels without an alpha/
  );
  assert.throws(() => parseColor("rgb(0 0 0 /)"), /expected one alpha after "\/"/);
  assert.throws(() => parseColor("rgb(0 0 / 0.5)"), /expected exactly 3 channels before "\/"/);
  assert.throws(() => parseColor("rgba(0, 0, 0, 1.2)"), /invalid alpha "1\.2"/);
  assert.throws(() => parseColor(""), /has an empty value/);
});

test("an empty custom-property override survives the cascade and cannot resolve", () => {
  const parsed = parseTokenBlocks(":root { --text: #14161a; } :root { --text: ; }");
  assert.equal(parsed.base.length, 2);
  const tokens = layerTokens(parsed.base);
  assert.equal(tokens.get("--text"), "", "the later empty declaration wins the cascade");
  assert.throws(() => resolveToken(tokens, "--text"), /token --text has an empty value/);
});

test("rgba rules are composited on their named surface without 8-bit rounding", () => {
  const paper = parseColor("#fffdf8");
  const ink = parseColor("rgba(11, 12, 14, 0.48)");
  const painted = compositeOver(ink, paper);

  nearly(painted.r, 137.88, "red channel composites unrounded");
  nearly(painted.g, 137.32, "green channel composites unrounded");
  nearly(painted.b, 135.68, "blue channel composites unrounded");
  assert.notEqual(painted.r, Math.round(painted.r), "no premature 8-bit rounding");

  const ratio = contrastRatio(painted, paper);
  assert.ok(ratio >= INDICATOR_MIN && ratio < 4.5, `meaningful rule stays an indicator: ${ratio}`);
});

test("a ratio just below the threshold fails even though it prints as 4.50:1", () => {
  const near = parseColor("rgba(118.66, 118.66, 118.66, 1)");
  const white = parseColor("#ffffff");
  const ratio = contrastRatio(near, white);
  assert.ok(ratio < TEXT_MIN && ratio > 4.49, `unrounded ratio is just below: ${ratio}`);
  assert.equal(formatRatio(ratio), "4.50", "rounded output would look like a pass");

  const result = evaluateScheme(
    "light",
    new Map([
      ["--paper", "#ffffff"],
      ["--text", "rgba(118.66, 118.66, 118.66, 1)"],
    ]),
    [{ foreground: "--text", background: "--paper", min: TEXT_MIN, role: "near threshold" }]
  );
  assert.equal(result.comparisons[0].pass, false);
  assert.match(result.errors[0], /4\.50:1, below 4\.5:1/);
});

test("an indicator ratio just below 3.00 fails even though it prints as 3.00:1", () => {
  const near = parseColor("rgba(148.9, 148.9, 148.9, 1)");
  const white = parseColor("#ffffff");
  const ratio = contrastRatio(near, white);
  assert.ok(ratio < INDICATOR_MIN && ratio > 2.99, `unrounded ratio is just below: ${ratio}`);
  assert.equal(formatRatio(ratio), "3.00", "rounded output would look like a pass");

  const result = evaluateScheme(
    "light",
    new Map([
      ["--paper", "#ffffff"],
      ["--line-meaning", "rgba(148.9, 148.9, 148.9, 1)"],
    ]),
    [
      {
        foreground: "--line-meaning",
        background: "--paper",
        min: INDICATOR_MIN,
        role: "near threshold indicator",
      },
    ]
  );
  assert.equal(result.comparisons[0].pass, false);
  assert.match(result.errors[0], /3\.00:1, below 3:1/);
});

test("the real check exits nonzero when dark on-accent is forced to white", async () => {
  const directory = await scratchCheckout();
  try {
    const before = runCheck(directory);
    assert.equal(before.status, 0, before.output);
    assert.match(
      before.output,
      /contrast — 29 pairs light, 29 pairs dark \(58 comparisons; 4\.5:1 text, 3:1 indicators\)/
    );

    await mutate(directory, "public/assets/tokens.css", "--on-accent: #06130d;", "--on-accent: #ffffff;");
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast dark: --on-accent on --accent/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the real check exits nonzero when light muted text is painted on paper", async () => {
  const directory = await scratchCheckout();
  try {
    await mutate(directory, "public/assets/tokens.css", "--text-muted: #59606e;", "--text-muted: #fffdf8;");
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast light: --text-muted on --paper/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the real check rejects malformed rgb syntax with a named scheme and pair", async () => {
  const cases = [
    ["rgb(0,,0,0)", /empty channel/],
    ["rgb(0x0, 0, 0)", /invalid channel "0x0"/],
  ];
  for (const [value, detail] of cases) {
    const directory = await scratchCheckout();
    try {
      await mutate(directory, "public/assets/tokens.css", "--text: #14161a;", `--text: ${value};`);
      const after = runCheck(directory);
      assert.notEqual(after.status, 0, after.output);
      assert.match(after.output, /FAIL\s+contrast light: --text on --paper cannot be measured/);
      assert.match(after.output, detail);
      assert.doesNotMatch(after.output, /ok — 0 errors/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("the real check rejects legacy comma rgb with mixed channel units", async () => {
  const directory = await scratchCheckout();
  try {
    await mutate(directory, "public/assets/tokens.css", "--text: #14161a;", "--text: rgb(0%, 0, 0);");
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast light: --text on --paper cannot be measured/);
    assert.match(after.output, /legacy comma rgb\(\) channels must share one unit type/);
    assert.doesNotMatch(after.output, /ok — 0 errors/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the real check accepts homogeneous legacy rgb, mixed modern units and percentage alpha", async () => {
  const directory = await scratchCheckout();
  try {
    const values = ["rgb(0%, 0%, 0%)", "rgb(0% 0 0)", "rgba(0%, 0%, 0%, 100%)"];
    let current = "#14161a";
    for (const value of values) {
      await mutate(directory, "public/assets/tokens.css", `--text: ${current};`, `--text: ${value};`);
      const after = runCheck(directory);
      assert.equal(after.status, 0, `${value} is valid CSS: ${after.output}`);
      assert.match(after.output, /ok — 0 errors/);
      current = value;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the real check fails a later empty override instead of resurrecting the earlier value", async () => {
  const directory = await scratchCheckout();
  try {
    await appendFile(
      join(directory, "public/assets/theme.css"),
      "\n:root {\n  --text: ;\n}\n"
    );
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast light: --text on --paper cannot be measured/);
    assert.match(after.output, /token --text has an empty value/);
    assert.doesNotMatch(after.output, /ok — 0 errors/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the real check exits nonzero when line-meaning alpha is too low", async () => {
  const directory = await scratchCheckout();
  try {
    await mutate(
      directory,
      "public/assets/tokens.css",
      "--line-meaning: rgba(11, 12, 14, 0.48);",
      "--line-meaning: rgba(11, 12, 14, 0.3);"
    );
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast light: --line-meaning on --paper/);
    assert.doesNotMatch(after.output, /ok — 0 errors/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a parser failure is a visible nonzero check failure, never a silent green", async () => {
  const directory = await scratchCheckout();
  try {
    await writeFile(join(directory, "public/assets/tokens.css"), ":root {\n  --text: #000;\n");
    const after = runCheck(directory);
    assert.notEqual(after.status, 0, after.output);
    assert.match(after.output, /FAIL\s+contrast: .*unclosed block/);
    assert.doesNotMatch(after.output, /ok — 0 errors/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the scratch copier skips nested secrets/state and refuses reparse entries", async () => {
  const parent = await mkdtemp(join(tmpdir(), "aw-contrast-fixture-"));
  try {
    const source = join(parent, "source");
    await mkdir(join(source, "public", "assets"), { recursive: true });
    await mkdir(join(source, "public", "data"), { recursive: true });
    await mkdir(join(source, "public", "node_modules", "pkg"), { recursive: true });
    await writeFile(join(source, "public", "assets", "tokens.css"), ":root { --paper: #fff; }\n");
    await writeFile(join(source, "public", "assets", "auth.css"), ".auth { color: #000; }\n");
    await writeFile(join(source, "public", ".env"), "SECRET=not-copied\n");
    await writeFile(join(source, "public", "auth.json"), '{"token":"not-copied"}\n');
    await writeFile(join(source, "public", "token.json"), '{"value":"not-copied"}\n');
    await writeFile(join(source, "public", "data", "state.json"), "{}\n");
    await writeFile(join(source, "public", "node_modules", "pkg", "index.js"), "\n");
    await writeFile(join(source, "public", "notes.txt"), "keep\n");

    const destination = join(parent, "copy");
    await copyTree(join(source, "public"), destination);
    assert.equal(
      existsSync(join(destination, "assets", "tokens.css")),
      true,
      "the permitted shipped tokens.css is copied"
    );
    assert.equal(
      existsSync(join(destination, "assets", "auth.css")),
      true,
      "auth.css is source, not a credential"
    );
    assert.equal(existsSync(join(destination, "notes.txt")), true, "ordinary files are copied");
    assert.equal(existsSync(join(destination, ".env")), false, "nested .env is skipped");
    assert.equal(existsSync(join(destination, "auth.json")), false, "nested auth.json is skipped");
    assert.equal(existsSync(join(destination, "token.json")), false, "nested token.json is skipped");
    assert.equal(existsSync(join(destination, "data")), false, "nested data/ is skipped");
    assert.equal(
      existsSync(join(destination, "node_modules")),
      false,
      "nested node_modules is skipped"
    );

    const target = join(source, "link-target");
    await mkdir(target, { recursive: true });
    const link = join(source, "reparse-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      copyTree(link, join(parent, "link-copy")),
      /refusing to copy reparse\/symlink entry/
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the scratch copier refuses secret families before source extensions and keeps named auth source", async () => {
  const parent = await mkdtemp(join(tmpdir(), "aw-contrast-auth-"));
  try {
    const source = join(parent, "source");
    const keep = [
      ["public/assets/tokens.css", ":root { --paper: #fff; }\n"],
      ["public/assets/auth.css", ".auth { color: #000; }\n"],
      ["public/assets/auth.js", "export const auth = true;\n"],
      ["public/assets/auth.local.css", ".auth-local { color: #000; }\n"],
      ["public/assets/logo-auth.svg", "<svg/>\n"],
      ["server/auth.js", "export const auth = true;\n"],
      ["public/assets/site.css", ".site { color: #000; }\n"],
      ["server/index.js", "export const app = true;\n"],
    ];
    const drop = [
      ["public/assets/auth.local.json", '{"token":"not-copied"}\n'],
      ["public/assets/access-token.yaml", "token: not-copied\n"],
      ["public/assets/tokens.prod.json", '{"token":"not-copied"}\n'],
      ["public/assets/secrets.yaml", "secret: not-copied\n"],
      ["server/config/auth.local.json", '{"secret":"not-copied"}\n'],
      ["server/config/secrets.js", "export const secret = 'not-copied';\n"],
      ["server/config/Secrets.JS", "export const secret = 'not-copied';\n"],
      ["server/config/credentials.local.cjs", "module.exports = 'not-copied';\n"],
      ["server/config/API_KEY.mjs", "export const key = 'not-copied';\n"],
      ["server/config/access-token.js", "export const token = 'not-copied';\n"],
      ["server/config/tokens.prod.js", "export const tokens = 'not-copied';\n"],
      ["server/config/password.html", "<p>not-copied</p>\n"],
      ["public/.secret", "not-copied\n"],
      ["public/.credentials", "not-copied\n"],
    ];
    for (const [relative, body] of [...keep, ...drop]) {
      const path = join(source, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }

    const destination = join(parent, "copy");
    await copyTree(join(source, "public"), join(destination, "public"));
    await copyTree(join(source, "server"), join(destination, "server"));

    for (const [relative] of keep) {
      assert.equal(existsSync(join(destination, relative)), true, `${relative} is source and is copied`);
    }
    for (const [relative] of drop) {
      assert.equal(existsSync(join(destination, relative)), false, `${relative} is excluded`);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a scratch setup failure removes the partial scratch directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "aw-contrast-setup-"));
  try {
    const source = join(parent, "source");
    await mkdir(join(source, "public"), { recursive: true });
    await mkdir(join(source, "server"), { recursive: true });
    await mkdir(join(source, "scripts"), { recursive: true });
    await writeFile(join(source, "scripts", "check.js"), "\n");
    await writeFile(join(source, "scripts", "contrast.js"), "\n");
    // package.json is deliberately absent: setup fails after public/, server/
    // and scripts/ have already been copied into the scratch tree.

    const scratchParent = join(parent, "scratch");
    await mkdir(scratchParent, { recursive: true });
    await assert.rejects(scratchCheckout(source, scratchParent), /ENOENT/);
    assert.deepEqual(
      await readdir(scratchParent),
      [],
      "the partial scratch directory is removed"
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
