# RESULT — 20261029-design-motion research deliverable

**Status:** DELIVERED FOR OPERATOR REVIEW. Not accepted, not integrated, not committed.
No self-acceptance is claimed or implied.

---

## 1. Task and environment (actual, verified)

| Field | Actual value |
|---|---|
| Harness / route | T3 Code ACP research task, native Windows |
| Model | DSH Flash (high) — harness-reported `deepseek-official` / `deepseek-flash`; served identity otherwise **UNKNOWN** |
| Worktree | `C:\Users\johan\.t3\worktrees\applywright\t3-a4aeb610` |
| Branch | `t3/design-motion-research` |
| Base / HEAD | `6e6c13f5db5df83dc625c7197067b851f165f14f` (matches the expected base) |
| `git rev-parse --show-toplevel` | the worktree path above |
| Pre-write status | clean (`git status --porcelain` empty) |
| Post-write status | only `?? docs/research/20261029-design-motion/` |
| Git writes | none (no add/commit/branch/checkout/worktree/reset) |
| Broker | `46ac76de-4e76-42b4-a2b1-9f6d4e09c559` (existing; not contacted) |
| Project operator | `01a183ff-e374-7d32-ae0e-1938714e813c` (sole integrator/executor/acceptor) |
| Root | `01a183f2-68ec-7223-bb5b-0705764b0734` (estate coordination; not contacted) |
| Delegation | none; no child, no additional model/client, no research stream |

The two mandated operator documents were read through absolute main-repo paths
(`AGENTS.md`, `docs/resume/20261029/RESUME-PLAN.md`), not from the worktree; both are
uncommitted and absent here.

---

## 2. Input provenance

### 2.1 Design and product context (read-only, main repo unless noted)

- `docs/design/SPEC-V2.md` — SHA-256 `d54918cd7a0e979ff12d93d92c493c5cb85cc493892b193e8ddef0332185f635`, 29,032 bytes.
- `docs/design/DESIGN-INPUTS.md`, `RESEARCH-repos.md`, `RESEARCH-darkmode.md`,
  `RESEARCH-aesthetic.md`, `UX-REVIEW-20261028.md`.
- `docs/design/GEMINI-LEAD-REVIEW-20261028.md` — SHA-256 `9055707743e9a521389ec1606580df6dd810a07ef43f3d36395c1003d0587cef`, 43,383 bytes.
- `docs/MOTION.md` — SHA-256 `dd0d9327ca6a3c26a6dec4187caac2fdf693dc63b704875d25932795c10a42cd`, 42,922 bytes.
- `docs/IMPLEMENTATION-PLAN.md` (motion rows 3.3, 3.4, 3.7; accessibility rows 2.3, 2.6),
  `docs/verification/20261029-a11y-app-editor/STATIC-A11Y-AUDIT.md`,
  `docs/t3/GEMINI-DESIGN-BRIEF-20261028.md`.

### 2.2 Current source at `6e6c13f` (in the worktree, hashed)

See `SOURCES.json` → `local_product_sources` for all SHA-256 values. The load-bearing
files are `public/assets/motion.css` (`991f7c32…`), `public/app/app.js` (`f1c3cf34…`),
`public/assets/editor.js` (`0eac2b1f…`), `public/assets/editor.css` (`f53a2167…`),
`public/app/app.html` (`79c8e017…`), `public/editor.html` (`63d39dcc…`), and
`public/assets/tokens.css` (`466a777c…`).

### 2.3 Live public sources

24 source records in `SOURCES.json` (S01–S24), all fetched over HTTPS on 2026-10-29:
MDN reference pages, MDN browser-compat-data JSON, two Chrome for Developers View
Transitions guides, three WCAG 2.2 Understanding documents, GitHub REST metadata for five
repositories, npm registry metadata for two packages, the AutoAnimate source, and the GSAP
licence. No source was cloned, installed, or executed.

### 2.4 Bookmark discovery — `ACCESS_ABSENT`

No authorised public-safe X bookmark export or connector was available. The documented
routes are interactive Chrome captures (`MODEL-AND-BOOKMARK-INTAKE.md:3`,
`X-MEMORY-SOURCE-INTAKE-20260929.md:3`) and a private `estate-x-reader` profile referenced
by `CHECKPOINT-RESEARCH-20261019.md:27`. The triage document exists
(`CR1-X-TRIAGE-20261019.md`, 35,384 bytes), but the raw/list files it names are **not
present** in the directory listing. No private saved text, cookie, token, auth/profile
file, or account page was read. Public research continued without waiting for Grok or
Johan.

---

## 3. Output manifest

All files are in `docs/research/20261029-design-motion/` in this worktree.

| File | Bytes | SHA-256 |
|---|---:|---|
| `RESEARCH.md` | 28,597 | `5fbf8cc2b38d0c4edb3cf9f7a4cc1405770a44458f6837f53173ed2d089f6ed7` |
| `SOURCES.json` | 24,125 | `7393b5ce94b9b386cd588004e3802cc914d8a788aaa5aae7b125deb55c05ee22` |
| `ADOPTION-PLAN.md` | 20,893 | `706b432345714d5dbdba22e577ec24ef1ab84fa6823783db8aba30d2317d2a74` |
| `NEXT-GEMINI-BRIEF.md` | 8,633 | `0082560d8aeb0489b4f64ce914ce8e9ca994acb76947034c6e15dfb1175e3f06` |
| `NEXT-MUSE-BRIEF.md` | 5,749 | `9bbd9f364fbac983192b49b1e79ef17d92436ddb6ecbbb8d7099d63dd78d736c` |
| `RESULT.md` | this file | omitted — self-referential; the digest of the final bytes is reported in the broker handback, not embedded here |

No other file was created, modified, or deleted. No outside report path was written.

---

## 4. Findings (summary; full evidence in `RESEARCH.md`)

1. **The product already has a motion contract and a measured baseline.** `docs/MOTION.md`
   records 0 jank frames/long tasks at 6× CPU on `/` and `/app`, a +16/+108 ms
   cross-document View Transition cost, and a ~150-recalc scroll hairline. New work risks
   regression, not rescue.
2. **Two real defects remain in the contract.** Four unguarded
   `scrollIntoView({behavior:"smooth"})` calls (`app.js:1683,2196,2670`,
   `editor.js:1433`) ignore reduced motion; `#app-main` is focused after SPA navigation
   but has no `aria-labelledby` (`app.html:105`).
3. **Two absences.** The editor has **zero** CSS transitions/animations
   (`editor.css`), and `motion.css` is loaded only through `partials/nav.html`, so
   `/app`, `/editor` and the auth pages get neither the cross-document transition nor the
   shared hover/press reduce resets.
4. **Zero-dependency stack selected.** Native CSS transitions + `@starting-style`
   (Baseline 2024; Chrome 117 / Firefox 129 / Safari 17.5) and same-document View
   Transitions (Chrome 111 / Firefox 144 / Safari 18), retaining the existing
   cross-document transition (Chrome 126 / Safari 18.2 / Firefox none) and scroll hairline
   (Chrome 115 / Firefox 159 / Safari 26).
5. **Libraries rejected on evidence, not taste.** AutoAnimate (MIT, v0.10.0, 59,207 B
   unpacked, reduced-motion default) is deferred because it animates width/height and runs
   standing observers/timers; Motion (MIT, 14.7.1, 922,802 B unpacked, depends on
   `framer-motion`) is disproportionate; Lenis is a scroll hijack; GSAP's current licence
   is proprietary Webflow terms (effective 2025-04-30).
6. **The save-state finding in the static audit is partly stale.** At `6e6c13f`,
   `announce()` + `#ed-status` already announce a successful save
   (`editor.js:1391`, `editor.html:320`); busy/loading are not announced. The stale D2
   must be reconciled before it becomes a work item.
7. **SPA View Transitions need one prerequisite.** `renderRoute()` awaits
   `route.render(mount)`, which writes into the mount; wrapping that in a transition would
   hold the snapshot across data fetching, which Chrome's guide warns against. A 120 ms
   opacity fade is safe now; the VT is conditional on a synchronous commit point.

---

## 5. Execution ledger — every phase NOT RUN

| Activity | State |
|---|---|
| Node, npm, import, syntax check, test, oracle, build, bundler | **NOT RUN** |
| `node scripts/check.js`, `node --test …`, any project gate | **NOT RUN** |
| Browser/headless Chrome/Edge/CDP/Playwright, screenshot decode | **NOT RUN** |
| estate-cua, GUI, desktop input, device tools | **NOT RUN** |
| Product server, live model/API call, provider fallback, Terra benchmark | **NOT RUN** |
| Axe-core, contrast computation, AT/screen-reader session | **NOT RUN** |
| PowerShell `Add-Type`, native compiler, parser execution | **NOT RUN** |
| Git add/commit/branch/checkout/worktree/reset/push | **NOT RUN** |
| Install, clone, WSL start/stop, service/PM2/scheduler/goal/guard/slot/permission changes | **NOT RUN** |
| Bookmark export read, X access, sign-in, cookie/profile intake | **NOT RUN** (ACCESS_ABSENT) |
| Delegation, second model/client, new research stream | **NOT RUN** |
| Self-acceptance | **NOT CLAIMED** |

The only executed operations were read-only file reads, `Get-FileHash`, `Get-ChildItem`,
`Select-String`, `git rev-parse`/`status`, and authorised public HTTPS fetches.

---

## 6. Usage, identity, cost

| Field | Value |
|---|---|
| Input tokens | **UNKNOWN / null** (not exposed) |
| Output tokens | **UNKNOWN / null** |
| Cost | **UNKNOWN / null** |
| Served model identity | harness-reported `deepseek-official` / `deepseek-flash`; anything beyond that **UNKNOWN** |
| Provider billing / entitlement | **UNKNOWN**; no subscription or entitlement is claimed |
| Task/run ID | worktree `t3-a4aeb610` is the only identifier exposed |

---

## 7. Limitations and useful next steps

**Limitations.** No rendered evidence of any kind; no pixel was decoded; no Firefox run;
no AT session; package sizes are npm `unpackedSize`, not tree-shaken or gzipped; the
historical `docs/MOTION.md` numbers are quoted, not repeated.

**Next steps for the operator (all gated on your decision):**

1. Reconcile the stale D2 finding against `6e6c13f` (busy/loading announcement only).
2. Choose the `motion.css` delivery option (include vs co-locate resets) — Phase 0.3.
3. If approved, hand Phase 1 (editor state feedback) to the editor owner and Phase 2a
   (route opacity crossfade + `aria-labelledby`) to the SPA owner as separate, disjoint
   writes.
4. Commission the Gemini design brief only after the media-delivery receipt (Gate A) is
   produced; otherwise accept a source-only specification with no visual claims.
5. Send the Muse brief as advisory refutation; do not treat its verdict as acceptance.

No product, runtime, accessibility, or performance acceptance is implied by this
deliverable.
