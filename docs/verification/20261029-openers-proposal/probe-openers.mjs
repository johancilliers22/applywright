/**
 * Evidence probe: which ordinary CV verbs does the grounding check refuse as
 * "new names"?
 *
 * Read-only. Does not modify the product, does not import anything that writes.
 * Run from the project root:
 *
 *   node docs/verification/20261029-openers-proposal/probe-openers.mjs
 *
 * Exits 1 when any verb in the corpus is refused for a reason other than the
 * ownership guard (the ownership refusals are correct by design).
 */
import { assertGrounded } from "../../../server/lib/cv/tailor.js";

const SOURCE = "Worked on the payments platform for two years.";

// Ordinary CV verbs, deliberately broad: British -ise forms, third-person -s,
// hyphenated, past tense, and a few that are already curated as controls.
const CORPUS = [
  "Revamps", "Streamlines", "Overhauls", "Champions", "Orchestrates", "Helms", "Pioneers",
  "Fortifies", "Unblocks", "De-risks", "Spearheads", "Steers", "Galvanises", "Rallies",
  "Cultivates", "Mentors", "Onboards", "Automates", "Consolidates", "Standardises",
  "Modernises", "Hardens", "Optimises", "Scales", "Ships", "Owns", "Drives", "Leads",
  "Manages", "Delivers", "Builds", "Designs", "Implements", "Migrates", "Reduces",
  "Improves", "Cuts", "Grows", "Accelerates", "Simplifies", "Secures", "Stabilises",
  "Troubleshoots", "Diagnoses", "Refactors", "Prototypes", "Benchmarks", "Audits",
  "Forecasts", "Negotiates", "Coordinates", "Facilitates", "Enables", "Unifies", "Aligns",
  "Prioritises", "Delegates", "Coaches", "Recruits", "Retains", "Upskills", "Documents",
  "Reports", "Presents", "Partners", "Collaborates", "Contributes", "Supports", "Assists",
  "Initiated",
];

// These must stay refused forever; the probe asserts the list does not weaken them.
const MUST_REFUSE = ["Initech is my employer.", "Worked at Initech-labs.", "Zephyria cut deploy time by 40%."];

const refusedAsName = [];
const refusedForOwnership = [];
const accepted = [];

for (const verb of CORPUS) {
  const result = assertGrounded(SOURCE, `${verb} the payments platform.`);
  const reasons = (result.reasons ?? []).join("; ");
  if (result.ok) accepted.push(verb);
  else if (/new name/i.test(reasons)) refusedAsName.push(verb);
  else refusedForOwnership.push(`${verb} (${reasons.slice(0, 70)})`);
}

const bypasses = [];
for (const attempt of MUST_REFUSE) {
  const result = assertGrounded("Built services. Worked on services. Cut deploy time by 40%.", attempt);
  if (result.ok) bypasses.push(attempt);
}

console.log(`corpus: ${CORPUS.length}`);
console.log(`accepted: ${accepted.length}`);
console.log(`refused as "new name" (false refusals): ${refusedAsName.length}`);
console.log(`refused for ownership (correct by design): ${refusedForOwnership.length}`);
if (refusedAsName.length) console.log("\nFALSE REFUSALS:\n  " + refusedAsName.join(", "));
if (refusedForOwnership.length) console.log("\nOWNERSHIP REFUSALS:\n  " + refusedForOwnership.join("\n  "));
console.log(`\nbypass controls still refused: ${MUST_REFUSE.length - bypasses.length}/${MUST_REFUSE.length}`);
if (bypasses.length) console.log("  LEAKED: " + bypasses.join(" | "));

process.exit(refusedAsName.length === 0 && bypasses.length === 0 ? 0 : 1);
