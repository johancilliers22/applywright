#!/usr/bin/env node
/** Applywright — single process: marketing pages, product app, JSON API. */
import { startServer } from "./app.js";

const instance = await startServer();

const banner = [
  "",
  "  Applywright  ·  your CV, tailored for every job.",
  "",
  `  URL        ${instance.url}`,
  `  tailoring  ${instance.model ? `live model (${instance.model.name})` : "deterministic rules (no MODEL_API_KEY)"}`,
  `  database   ${instance.config.databasePath}`,
  `  jobs       arbeitnow, remotive, remoteok`,
  `  billing    ${instance.config.stripe.configured ? "stripe configured" : "not configured (plans visible, checkout disabled)"}`,
  "",
  "  Ctrl+C to stop.",
  "",
];
console.log(banner.join("\n"));

let closing = false;
const shutdown = async (signal) => {
  if (closing) return;
  closing = true;
  console.log(`\n  ${signal} — closing…`);
  try {
    await instance.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => console.error("unhandled rejection:", reason));
