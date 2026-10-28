#!/usr/bin/env node
/**
 * Start the server with a model key that arrives on stdin.
 *
 * The estate rule is that a key comes from the selected-variable loader, never
 * from a file, a log or a prompt. This helper lets the loader pipe a key into a
 * Windows-side process without the value being printed, written or echoed:
 *
 *   wsl -e bash -lc 'estate-env-run deepseek-api -- bash -lc "printf %s \"$DEEPSEEK_API_KEY\""' \
 *     | node scripts/model-boot.mjs
 *
 * It reads stdin, refuses to proceed on an empty stream, and starts
 * `server/index.js` detached with the OpenAI-compatible provider configured. It
 * prints the provider and base URL, never the key.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!key) {
    console.error("model-boot: no key arrived on stdin — nothing was started");
    process.exit(1);
  }

  // Which provider the piped key belongs to. The Anthropic org key is a direct
  // API credential and must never be mapped onto ANTHROPIC_API_KEY (that would
  // flip Claude Code onto API billing), so it goes in under its own name.
  const provider = String(process.env.BOOT_PROVIDER || "openai").toLowerCase();
  const env = { ...process.env, MODEL_PROVIDER: provider };
  if (provider === "anthropic") {
    env.ANTHROPIC_ORG_API_KEY = key;
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  } else {
    env.MODEL_API_KEY = key;
    env.MODEL_BASE_URL = process.env.MODEL_BASE_URL || "https://api.deepseek.com/v1";
    env.MODEL_NAME = process.env.MODEL_NAME || "deepseek-chat";
  }

  // Detached so the server outlives this wrapper; the wrapper exits immediately.
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  console.log(
    `model-boot: server starting (pid ${child.pid}) with provider=${provider}` + (provider === "anthropic" ? `, model=${env.ANTHROPIC_MODEL}` : `, base=${env.MODEL_BASE_URL}, model=${env.MODEL_NAME}`) + `, key length ${key.length}`,
  );
});
