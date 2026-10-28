/** Runtime configuration: environment first, optional .env.local/.env second. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILES = [".env.local", ".env"];

export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function fileEnv(root) {
  for (const name of ENV_FILES) {
    const path = join(root, name);
    if (existsSync(path)) {
      try {
        return parseEnvFile(readFileSync(path, "utf8"));
      } catch {
        return {};
      }
    }
  }
  return {};
}

const num = (value, fallback, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

export function loadConfig(overrides = {}) {
  const file = fileEnv(ROOT);
  const pick = (key) => {
    if (overrides[key] !== undefined) return overrides[key];
    if (process.env[key] !== undefined && process.env[key] !== "") return process.env[key];
    return file[key];
  };

  // Estate canon: the org API key is ANTHROPIC_ORG_API_KEY, direct API only.
  // Never map it onto ANTHROPIC_API_KEY - that flips Claude Code to API billing.
  const orgApiKey = String(pick("ANTHROPIC_ORG_API_KEY") ?? "").trim();
  const apiKey = String(pick("MODEL_API_KEY") ?? "").trim();
  const stripeSecret = String(pick("STRIPE_SECRET_KEY") ?? "").trim();
  const stripeWebhook = String(pick("STRIPE_WEBHOOK_SECRET") ?? "").trim();

  return {
    root: ROOT,
    publicDir: join(ROOT, "public"),
    dataDir: overrides.dataDir || join(ROOT, "data"),
    databasePath: overrides.databasePath || overrides.DATABASE_PATH || join(ROOT, "data", "applywright.db"),
    version: "0.1.0",

    host: String(pick("HOST") ?? "127.0.0.1"),
    port: num(pick("PORT"), 3160, { min: 0, max: 65535 }),
    trustProxy: bool(pick("TRUST_PROXY"), false),
    secureCookies: bool(pick("SECURE_COOKIES"), false),
    // Set REGISTRATION_OPEN=0 when the app is exposed publicly and only invited
    // accounts should exist. Sign-in keeps working; new sign-ups are refused.
    registrationOpen: bool(pick("REGISTRATION_OPEN"), true),

    model: {
      provider: String(pick("MODEL_PROVIDER") ?? (orgApiKey ? "anthropic" : apiKey ? "openai" : "none")),
      apiKey,
      baseUrl: String(pick("MODEL_BASE_URL") ?? "https://api.deepseek.com/v1").replace(/\/+$/, ""),
      name: String(pick("MODEL_NAME") ?? "deepseek-chat"),
      timeoutMs: num(pick("MODEL_TIMEOUT_MS"), 60_000, { min: 5_000, max: 300_000 }),
      maxTokens: num(pick("MODEL_MAX_TOKENS"), 2_000, { min: 256, max: 8_192 }),
    },

    anthropic: {
      apiKey: orgApiKey,
      baseUrl: String(pick("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com/v1").replace(/\/+$/, ""),
      model: String(pick("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5"),
      timeoutMs: num(pick("ANTHROPIC_TIMEOUT_MS"), 60_000, { min: 5_000, max: 300_000 }),
      maxTokens: num(pick("ANTHROPIC_MAX_TOKENS"), 2_000, { min: 256, max: 8_192 }),
    },

    stripe: {
      secret: stripeSecret,
      webhookSecret: stripeWebhook,
      priceIds: {
        proMonthly: String(pick("STRIPE_PRICE_PRO_MONTHLY") ?? ""),
        proYearly: String(pick("STRIPE_PRICE_PRO_YEARLY") ?? ""),
        scaleMonthly: String(pick("STRIPE_PRICE_SCALE_MONTHLY") ?? ""),
        scaleYearly: String(pick("STRIPE_PRICE_SCALE_YEARLY") ?? ""),
      },
      configured: Boolean(stripeSecret && stripeWebhook),
    },

    limits: {
      authPerMinute: num(pick("AUTH_RATE_LIMIT_PER_MINUTE"), 10, { min: 1, max: 1_000 }),
      apiPerMinute: num(pick("RATE_LIMIT_PER_MINUTE"), 120, { min: 1, max: 100_000 }),
      maxBodyBytes: num(pick("MAX_BODY_BYTES"), 8_388_608, { min: 16_384, max: 33_554_432 }),
      maxCvBytes: num(pick("MAX_CV_BYTES"), 5_242_880, { min: 1_024, max: 20_971_520 }),
      maxJobDescription: 20_000,
      jobFeedLimit: num(pick("JOB_FEED_LIMIT"), 60, { min: 1, max: 300 }),
      feedCacheMinutes: num(pick("JOB_FEED_CACHE_MINUTES"), 15, { min: 0, max: 1_440 }),
      sessionDays: 30,
      // 0 disables the background alert scanner entirely.
      alertScanMinutes: num(pick("ALERTS_SCAN_MINUTES"), 30, { min: 0, max: 1440 }),
    },

    site: {
      brand: "Applywright",
      company: "Intelligent Artificial",
      tagline: "Your CV, tailored for every job.",
      contactEmail: String(pick("CONTACT_EMAIL") ?? "hello@applywright.example"),
      year: new Date().getFullYear(),
      // Canonical public origin, used for Stripe redirects and the RSS feed so a
      // spoofed Host header cannot rewrite them.
      publicUrl: String(pick("PUBLIC_URL") ?? "http://127.0.0.1:3160").replace(/\/+$/, ""),
    },
  };
}
