# Overnight log

Append-only. Newest last. One entry per shift: timestamp, verified, changed, left, gate output.

## 2026-10-28T11:05Z — Lead session (desktop unlocked, full access)

**Verified before work:** HEAD `24eb0e7`, tree clean, all 11 routes 200 (/ /how-it-works /pricing /about /security /sign-in /sign-up /reset /app /editor /bookmarklet), health 200, 113/113 HTTP tests, 309/309 module tests, `check.js` 0 errors 0 warnings, 2 cloudflared processes alive.

**In flight this session (5 workstreams, disjoint scopes):**
- `flow-aw` — end-to-end browser verification of the full journey (sign-up → upload PDF/DOCX/OCR → score → tailor → editor proposals → exports → tracking → alerts → recovery), ledger in `docs/E2E-VERIFICATION.md`.
- `motion-aw` — motion inventory, interaction feedback, reduced-motion, CPU-throttled jank numbers, `docs/MOTION.md`.
- `design-lead` — UX review of /editor /app /sign-in /sign-up /reset with screenshots and fixes, `docs/design/UX-REVIEW-20261028.md`.
- `handoff-aw` — `docs/ESTATE-RELAY.md`, `docs/CLAUDE-CODEX-NOTES.md`, `docs/FRIEND-COPY.md`, hub stub `APPLYWRIGHT-RELAY-ESTATE-20261028.md`.
- Gemini 4 Argon subagent — `docs/research/SOTA-20261028.md` (ATS reality, competitor teardown, grounded-rewrite gap, pricing, distribution, five recommendations).

**Vault:** `brain/applywright-platform.md` refreshed (surfaces, canon order, decisions, open questions).
**Live URL (28 Oct, 11:07):** https://logging-powered-warnings-manner.trycloudflare.com — verified `/api/health` 200 after 4 attempts (quick tunnels need ~10s for DNS). The previous URL `chest-shipment-arnold-uncle.trycloudflare.com` is dead; its cloudflared process was replaced. Record any future URL change here and in `docs/SHARE.md`.
**11:25 — research + copy integrity pass (Lead).** Gemini research written to `docs/research/SOTA-20261028.md` (250 lines). Corrected 13 copy claims that contradicted the code (skills line, alert polling, ingestion list, VAT, placeholder mailto). Committed `f14023e`. Delegated: `extract-aw` (DOCX header/footer + table layout signal), `flags-aw` (verb-escalation guard, sentence-start proper nouns, lowercase skills), `app-ui-aw` (`/app` has no theme layer — wiring it plus a dark palette). `flow-aw`, `motion-aw`, `design-lead` still running.
## 2026-10-28T11:35Z — Lead session, second wave (desktop unlocked, full access)

**Verified live:** all ten routes 200 locally and over the public tunnel; gates 141/141 HTTP, 329/329 module, `check.js` 0 errors / 0 warnings; tree pushed, `main` == `origin/main`.

**Shipped this wave (commits `f14023e`..`5e5b546`):**
- Layout-risk scoring: extraction reports `{tables, columns, textBoxes}` and reads DOCX header/footer parts; the scorer docks formatting instead of awarding 10/10 on flattened table text. Four new tests.
- Grounding integrity: promoting substitutions removed from `refine.js`; one ownership guard (support < execution < leadership) shared by refine, assist and tailor; sentence-start proper nouns and lowercase tool names checked. Two-path evidence recorded.
- Motion pass: infinite spinner loop and a `width` transition removed; one duration >320ms remains; rail bullets and icon alignment fixed by measurement (icon x 68/67 → 28.19); page-head dead space 137 → 85px; view transitions behind `@supports` with measured cost.
- `/app` dark theme: `theme.js` wired, dark palette, 26 contrast pairs, no colour literals left.
- UX pass: P0 `[hidden]` bug in the editor, sticky save-failure banner, recovery-code primacy, six editor defects; editor proposals moved into the primary column (first hunk y 837 → 167); parse notice before any save on an unparsed CV.
- D1 fixed in the SPA: the score panel now mounts after a first CV import (`renderScreen` derives from state; `refreshScreen` after every mutation).
- Dead CSS deleted; two "redundant" rules restored after a pixel diff showed one was a 9.12:1 → 1.86:1 contrast regression.
- Copy: 13 claims corrected; `API access`/`priority refresh` no longer sold.
- Docs: SOTA research, relay, Claude/Codex notes, friend-copy, E2E verification ledger (9 steps, 203 assertions at `1a0b17a`), MOTION, UX-REVIEW.

**Open defects:** D2 exported `.docx` headed with the CV record name (editor-aw), D3 trailing comma in a letter built from a role header (flags-aw). Both dispatched with repro lines.
**12:15 — visual release.** Artwork set (registration marks, pipeline schematic, three empty-state drawings, seam-proved grain, OG card, favicon family), one 68ch reading measure replacing four, `/security` steps as a 2×2 band, `/pricing` subgrid alignment with a no-JS interval control, `/app` and `/editor` dark themes, two-tier dashboard hierarchy, marketing gauge replacing the donut, shape-coded status, drawn empty states in all three slots. Motion round two measured at 6× CPU: 0 frames over 32ms, 0 long tasks. Commits `bc9eba9`..`706b741`. Gates: 143 HTTP, 332 module, `check.js` 0 errors.

Caught in the verification loop rather than by a user: the E2E harness failed at STEP 3 because it still waited for the deleted score ring — the product was correct (screenshot shows `Scored 57 of 100` on the new gauge), the harness was stale. `flow-aw` is updating the selector to assert rendered text and ARIA rather than a class name.

**16:55 — orchestration handover.** Codex usage reset: a new Codex desktop chat becomes main orchestrator/validator, DSH keeps doing the bulk of implementation, T3 Mission Control tracks and reviews missions. Tunnel restarted and recorded in SHARE.md. Wrote docs/T3-MISSIONS.md plus three ready mission specs in docs/t3/ (plan, grounding+model review, gates+E2E test). Claude-agent route in T3 stays disabled by ROLES.json policy until Johan enables it and records why.

**17:22 — relay executed now, not Saturday.** Claude usage limit hit, so Codex takes over immediately as orchestrator/validator; DSH implements; T3 tracks and verifies; Claude returns as a T3 reviewer child when the limit resets. Added §10 to `docs/CODEX-ORCHESTRATOR-HANDOFF.md` (live status, the living-docs contract with a per-file table, the delegation model at authorised scale, and what happens when Claude returns) and a status banner to `docs/CLAUDE-ESTATE-RELAY.md`. Also noted that `ROLES.json`'s recorded reason is stale and only Johan should edit it — it now matches reality (Claude unavailable) rather than merely recording 16 Oct policy. The product's own model path is unaffected: it uses the Claude org API key through the loader, verified live tonight.