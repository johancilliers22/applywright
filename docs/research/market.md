# Market: who is already doing this, what they charge, and where the gap is

*28 October 2026. Prices are what vendors' own pages returned that day unless flagged; no accounts were created, so limits are as advertised, not tested. Client-rendered pages that returned nothing are marked, not guessed.*

## Three clusters, not one market

Three shapes, sold by different companies at different prices.

**Scoring and tailoring.** Jobscan, Teal, Rezi, Huntr, Enhancv. Paste a CV and a job description, get a match percentage, missing keywords and rewrite suggestions, edit in a builder, export a PDF.

**Tracking and autofill.** Huntr, Teal, Simplify. A board of applications with statuses, plus a browser extension that fills the employer's own form from a stored profile. Simplify does this free and claims support for Workday, Greenhouse, iCIMS, Taleo, Avature, Lever and SmartRecruiters.

**Auto-apply.** LoopCV, LazyApply, JobCopilot and open-source agents. These submit without a human. LoopCV's free plan includes auto-apply, and its own FAQ answers "Will my employer find out I used Auto Apply?" with "No".

Applywright spans the first two and refuses the third — the product's central claim, and where much of the category's revenue sits.

## What they charge

| Product | Core job | Price seen (28 Oct 2026) | Submits for you? |
|---|---|---|---|
| Jobscan | CV-to-job match score, keyword gaps | ~$49.95/month, ~$89.95/quarter (third-party figures; vendor plan page did not render) | No |
| Teal | Tracker, builder, match score | Free tier; Teal+ $13 per 7 days, $29 per 30 days, $79 per 90 days | No |
| Rezi | Resume builder, "Rezi Score" | Free; Pro $29/month; lifetime $149 | No |
| Simplify | Autofill, tracking, resume score | Free extension | No — fills the form, you click submit |
| Huntr | Tracker and tailoring | Free tier plus paid Pro (price not verified) | No |
| LoopCV | Auto-apply agent | Free plan includes auto-apply; paid from €9.99/month | Yes |
| LazyApply, JobCopilot | Auto-apply | Not verified (pages are JavaScript-only) | Yes |

Three patterns. Tracking is free — Teal gives unlimited job tracking on the free tier, Simplify gives away autofill — so a status board is acquisition cost, not a paid feature. The paid axis is volume: unlimited rewrites, unlimited scans, more documents. Billing is awkward on purpose: Teal's headline $13 is per *seven days*, about $56 a month unless you switch to the $29/30-day option. Every priced vendor bills in USD or EUR; none publishes GBP with VAT.

Applywright's £19 and £49 sit inside that band, not under it. The fight is over what the pack contains, not the number.

## Auto-apply: the segment we are refusing

LinkedIn is explicit. Its help centre prohibits "any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website" (User Agreement §8.2), warning that users risk accounts being "restricted or shut down". A platform rule, not a statute — but it governs exactly the behaviour our spec refuses.

The open-source end of the segment is instructive. GitHub redirects `feder-cr/Jobs_Applier_AI_Agent_AIHawk` to `feder-cr/invisible_dots` — 32,275 stars, MIT — now described as an agent "built to be undetectable by anti-bot systems". The engineering energy there goes into evasion: a race we need not run. The refusal is a marketing asset if we explain it in the customer's terms — bans, fraudulent applications — not ours.

## The ATS-rejection story is contested

"75% of CVs are rejected by ATS before a human sees them" is repeated everywhere and sourced almost nowhere. The best counter-evidence I found is an Enhancv-commissioned study: 25 structured interviews with US recruiters in September–October 2025, of whom 23 said their ATS does not auto-reject on formatting or content, 8% had content-based auto-reject switched on, and 100% used knockout questions. Caveats: n=25, US-only, and the sponsor sells resume software. Treat it as a signal, not proof.

The consequence is copy discipline: promise a better read from a human under time pressure, not a pass rate. "ATS-proof" and "beats the bots" are unprovable and, on this evidence, misleading.

## Where the gap is

| Capability | Jobscan | Teal | Rezi | Simplify | LoopCV | Applywright (spec) |
|---|---|---|---|---|---|---|
| Published, deterministic score weights | Not found | Not found | Not found | Not found | Not found | Yes (§5) |
| Per-rewrite provenance check | Not found | Not found | Not found | Not found | Not found | Yes (§1, §5) |
| CV, letter and screening answers as one pack | Partial | Partial | Partial | Partial | Not found | Yes (§5 packs) |
| Human submits | Yes | Yes | Yes | Yes | No | Yes (§1) |
| GBP pricing, VAT stated | No | No | No | n/a | No | Yes (§2) |
| Documented export and delete | Not found | Not found | Not found | Not found | Not found | Yes (§6) |

"Not found" means not evidenced on the public pages I read for this note — not proof of absence. It is still the gap's shape: four claims cheap to make and expensive to prove.

The strongest is provenance. The incumbents generate rewritten bullets; whether a number or an employer was invented is left to the user to notice. Applywright's grounding check turns that into a visible feature. Second is the auditable score: Match Rate, Rezi Score and Teal's Match Score are proprietary percentages with no published weights, whereas ours can be published and self-tested. Third is the finished pack — a print-ready CV, a letter and screening answers tied to a tracked application, rather than a PDF plus upsells. Fourth is UK framing: £ pricing, UK spelling, right-to-work and notice-period answers, and export/delete that fits UK GDPR expectations (the ICO publishes recruitment guidance on candidate data, retention and automated decision-making).

## Implications for Applywright

1. Make grounding visible, not merely enforced: have `/api/tailor` return the `evidence` string for every rewritten bullet and render it in the pack viewer as "traced to your CV", failing closed when `assertGrounded` rejects.
2. Publish the score weights (35/20/20/15/10) on `/how-it-works` and inside `report_json`, and add a self-test asserting the weights sum to 100 and that every finding carries a non-empty `fix`; never render a score without its findings.
3. Treat capture as an allowlist, not a fetcher: keep `isSupportedHost` to the ATS hosts plus JSON-LD, add `linkedin.com` and `indeed.com` to an explicit rejection list with a plain-English error, and test that no server-side fetch of a captured URL is ever added.
4. Price in GBP with VAT handled once: `priceFor` returns pence ex-VAT, the plans table renders VAT-inclusive totals, and the annual option is computed as ten months (Pro £190, Scale £490) with a test asserting both figures.
5. Prove the deletion promise: extend `/api/export` to include `report_json` and `pack_json`, and add a test that `DELETE /api/account` leaves no rows in `cvs`, `reports`, `applications` or `notifications` and revokes the RSS token, since retention is the claim most likely to be challenged.
