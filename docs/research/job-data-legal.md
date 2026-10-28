# Where a job product may legally get job data, and what automated applying actually costs

Research note for Applywright. Sources checked 28 October 2026. Descriptive, not legal advice; a solicitor should read anything that touches submissions.

## 1. Short version

Job data is lawfully available in three shapes: a published feed whose terms permit your use; an employer's or ATS's own public board endpoint, read-only and attributed; or a posting the applicant captures themselves. Everything else — LinkedIn above all, and most aggregator HTML — sits behind terms that forbid it and behind UK law on computer misuse, database right and copyright.

Automated submission is a different problem from data access. The sanctioned API routes require the **employer's** key, so a third-party auto-applier either has a commercial partnership or is in breach. That is why the spec's "the product prepares, you approve" boundary is the cheap option as well as the honest one.

## 2. Sources, and what each one permits

| Source | Access | Licence position | Constraint that bites |
|---|---|---|---|
| [Remotive](https://remotive.com/api/remote-jobs) | Public JSON, no key | Legal notice inside the feed: share jobs further, link back, credit Remotive | Jobs delayed 24h; ~4 fetches/day advised, excess blocked; collecting signups from listings is a breach; commercial API from **$5,000/month** |
| [Remote OK](https://remoteok.com/api) | Public JSON, no key | Terms inside the feed: link back with follow, no `nofollow`, credit "Remote OK" | Logo use needs written permission |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | Public JSON, no key (DE and UK) | Keyless, ATS-sourced (Greenhouse, SmartRecruiters, Teamtailor and others) | No reuse licence stated on the page or in the JSON; a private paid endpoint is the documented commercial route |
| [Adzuna](https://developer.adzuna.com/docs/terms_of_service) | Key, free tier | Permitted: personal job search, publishing Adzuna listings, research. "Any other use, including commercial analysis, resale of data" needs written agreement | A revenue-generating product needs a licence after a 14-day trial; each advert needs a 116×23px "Adzuna" label |
| [USAJOBS](https://developer.usajobs.gov/guides/terms-of-service) | Key | Public Data is open-licensed and may be used "for lawful commercial or noncommercial purposes" without prior approval | No implied government endorsement; applications "must be submitted according to the official instructions" |
| [Greenhouse job boards](https://docs.greenhouse.io/job-board.html) | Keyless GET | "Job Board data is publicly available, so authentication is not required for any GET endpoints" | Application POST needs a per-employer Basic Auth key |
| [Lever postings](https://github.com/lever/postings-api) | Keyless GET | Vendor states published postings "may be scraped by third parties" | Application POST needs a Super Admin key; more than 2 POSTs/second returns 429 |
| [Ashby job board](https://developers.ashbyhq.com/docs/public-job-posting-api.md) | Keyless GET | Public posting API, intended to populate careers pages | Read-only; the published API documents no submission endpoint |
| [Reed](https://www.reed.co.uk/developers/jobseeker) | Key | Search and details endpoints documented field by field | No reuse or attribution terms published on the developer pages I read |

Notes on the three the spec already ships. Remote OK's terms are the loosest of the three: attribution and a followed link, nothing about caching. Remotive's are the most restrictive in practice — a 24-hour lag exists so Remotive gets the traffic, and a commercial licence starts at $5k a month. Arbeitnow is the odd one: free, no key, sourced from ATSs, and silent on reuse. Silence is not permission; treat it as a source to credit and to keep low-volume until someone asks.

## 3. Scraping, and what the law actually says

Under the [Computer Misuse Act 1990 s.1](https://www.legislation.gov.uk/ukpga/1990/18/section/1) it is an offence to cause a computer to perform a function with intent to secure unauthorised access, knowing it is unauthorised; up to two years on indictment. Whether a public page is "unauthorised" is fact-specific, which is why contract does more work than the criminal law.

[Database right](https://www.legislation.gov.uk/uksi/1997/3032/regulation/16/made) is the sharper instrument for a job product: extracting or re-utilising a substantial part of a database without consent infringes, and repeated, systematic extraction of insubstantial parts can amount to the same. [Copyright s.16](https://www.legislation.gov.uk/ukpga/1988/48/section/16) bites on adverts themselves: copying a substantial part of a literary work without a licence infringes.

The platforms are explicit. LinkedIn's help centre says it does not allow "third-party software or browser extensions that scrape, modify the appearance of, or automate activity" and that this violates its User Agreement ([LinkedIn Help](https://www.linkedin.cn/help/sales-navigator/answer/a1340567)). Its [robots.txt](https://www.linkedin.com/robots.txt) states that automated access without express permission is "strictly prohibited", and disallows AI crawlers by name.

The US position is mixed and moving. Meta's contract claim against Bright Data failed: summary judgment was granted to the defendant on 23 January 2024 ([Meta v Bright Data, N.D. Cal.](https://www.govinfo.gov/app/details/USCOURTS-cand-3_23-cv-00077/USCOURTS-cand-3_23-cv-00077-7)). That shows claims turn on exact wording and facts; it is not a licence to scrape.

## 4. What automated applying actually costs

| Cost | What the source says | What it means for us |
|---|---|---|
| Sanctioned submit access | Greenhouse: POST needs the employer's Base64 job-board key. Lever: POST needs a Super Admin key | Without a key there is no lawful submit path. This is a partnerships cost |
| Throughput | Lever: above 2 application POSTs/second returns 429; queue and retry | Queues per employer, not one worker pool |
| Bot defences | Lever advises integrators to "implement spam mitigations such as captchas and session or IP based rate limits" | Solving is priced at [£0.80–£2.45 per 1,000 reCAPTCHA v2 solves](https://2captcha.com/p/recaptcha_v2). Cheap — and price is not permission |
| Data at scale | Remotive commercial API from $5k/month; Adzuna needs a licence for revenue use | The licence is the cost line, not the HTTP request |
| Legal exposure | CMA s.1, database right reg 16, breach of contract | Bans and takedowns land first; injunctions follow |
| Maintenance | No stable cross-vendor contract; Ashby read-only; public boards and `schema.org` JSON-LD are the dependable surfaces | Per-site adapters break. Estimate, not evidence |

Two observations. First, the marginal cost of a bot-submitted application is pennies — a CAPTCHA solve, a little bandwidth — which is precisely why the market is crowded and why enforcement, not price, is the binding constraint. Second, the cost that never appears in a unit-economics model is the applicant's: an account ban, a misrepresented answer, an application they never read.

One adjacent duty: if we score CVs for EU users, Annex III(4)(a) of the [EU AI Act](https://artificialintelligenceact.eu/annex/3/) lists systems used "for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates" as high-risk. Scoring is in scope, whatever we decide about applying.

## 5. Not verified

Reed's reuse terms; Arbeitnow's licence for its free feed; any lawful third-party submit route for Workday; the later stages of hiQ v LinkedIn (the filings are PDFs I could not read).

## Implications for Applywright

1. Store a `source_attribution` string and `source_url` on every `jobs` row at ingest, and render both in the feed, the pack and the RSS item — Remotive, Remote OK and Adzuna all make attribution a condition of access, and it is cheaper to carry the field from day one than to retrofit it.
2. Put per-source polling budgets in code, not cron comments: Remotive at four calls a day, one scheduler process, and a `/api/health` field per source showing last fetch and remaining budget, so a retry loop cannot silently breach a term.
3. Treat any paid feed (Adzuna, Remotive commercial) as a feature flag gated on `plan === 'scale'` plus a configured licence key; with no key, return the free sources and say so, rather than falling back to scraping.
4. Keep `capture.js` strictly user-initiated: no background fetch of a saved URL, `capture_method: 'user_paste' | 'json_ld'` recorded on the job, and a lint or test that fails if any module outside `capture.js` performs an outbound request to a board host.
5. Add a one-line AI Act note to `/security` and the tailor response: the score evaluates a candidate and is advisory, the human decides, and no score is sent to an employer — which is also the truthful description of what the code does.
