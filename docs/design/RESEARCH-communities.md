# Where good interface work is actually discussed and curated in 2026

Applywright already has a design system, so this is a survey of venues, not a proposal for a new one. `public/assets/tokens.css` fixes the palette (ink, bone, paper, accent, ember, lime), a serif display face against Segoe UI, mono eyebrows and a spacing scale; `public/assets/site.css` supplies `.card`, `.note`, `.chip`, `.table-wrap`, `.faq` and `.kv`, and tells authors to keep composition in the HTML, "not new colours". The screens that matter are forms (CV paste, job capture, alert rules), a score report made of findings, a status board and a print pack. Galleries help with the marketing pages; pattern libraries and standards help with everything else.

**What changed in 2026.** Godly now redirects to [Recent](https://recent.design/), which puts web, interface and branding work in one feed. [CSS-Tricks changed hands](https://css-tricks.com/css-tricks-has-a-new-owner/) in October 2026. [Hacker News](https://news.ycombinator.com/newsguidelines.html) now bans generated and AI-edited text in posts and comments, which makes its interface threads readable again. And the AI-slop problem has pushed editors into stated positions: [Piccalilli](https://piccalil.li/) says its articles are never produced by AI tools.

## Seeing finished work

| Venue | Good for | Access and cost | Reuse |
|---|---|---|---|
| [Recent](https://recent.design/) | Marketing-page direction; filters for web, interface, branding, motion | Free to browse | All rights reserved; reference only |
| [Mobbin](https://mobbin.com/pricing) | Real app screens, flows and animations; now sells an [MCP](https://mobbin.com/mcp) feed for agents | Free account; Pro £8/month billed yearly | Subscription licence; screens are third-party products, never ship copies |
| [Refero](https://refero.design/) | Search-driven library of real product screens — the fastest way to see a dozen empty states | Public gallery; pricing not verified (JavaScript app) | All rights reserved; reference only |
| [Land-book](https://land-book.com/) | Marketing pages filed by type, including sign-up and pricing | Free; [Pro](https://land-book.com/pro) tier | All rights reserved |
| [Are.na](https://www.are.na/about) | Human-built collections over time, private or shared, no feed algorithm | Free to browse public channels | Content belongs to its authors; check each channel |
| [Awwwards](https://www.awwwards.com/about-evaluation/) | Jury-scored showcase; publishes its evaluation system | Free to browse | All rights reserved |

For the site refresh, Recent and Land-book are the useful pair: Land-book files examples by page type, which matches the two pages Applywright must get right, sign-up and pricing. None of these licenses its screens, so treat every gallery as a reference wall and keep captures in `docs/design`, not `public/`.

## Arguing about craft

| Venue | Signal | Limits |
|---|---|---|
| [Hacker News](https://news.ycombinator.com/newsguidelines.html) | Mechanism-level arguments about CSS, forms and accessibility; guidelines now forbid generated text | Design is a minority interest; threads die fast |
| [Lobsters](https://lobste.rs/about) | Invitation tree, public moderation log, tag filters; sharp on platform changes | Explicitly computing-focused, so interface craft is thin |
| [A List Apart](https://alistapart.com/) | Long-form essays with substantial comments (59 on the [June 2026 piece](https://alistapart.com/article/designed-for-a-dead-language/)) | Low and irregular cadence — a handful of issues a year |
| [Smashing Magazine](https://www.smashingmagazine.com/) | Highest volume of practical UI writing; for example [accordion icons](https://www.smashingmagazine.com/2026/10/accordion-icons-which-work-best/), October 2026 | Articles free, depth behind membership and workshops |
| [CSS-Tricks](https://css-tricks.com/) | Almanac and guides; new owner as of October 2026 | Membership and Discord for community |
| [Piccalilli](https://piccalil.li/) | Weekly [curated links](https://piccalil.li/links/), standards-first articles; courses £249 | Small team, strong editorial line |
| [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/) | Research-backed heuristics, still the shared vocabulary for critique | Articles free, training paid |
| [Baymard](https://baymard.com/) | Form and checkout usability; 700+ guidelines from 200,000+ hours of research | Paid research; free articles such as [multicolumn forms](https://baymard.com/research-articles/avoid-multi-column-forms) |

Genre decides the venue. HN and Lobsters test a mechanism; A List Apart and Smashing test a craft argument; NN/g and Baymard test a claim against evidence. The one newsletter worth a subscription is Piccalilli's weekly links, because a human filters it.

## The parts Applywright cannot improvise

| Source | What to take | Licence |
|---|---|---|
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (W3C Recommendation, 12 December 2024) | 1.4.3 contrast, 3.3.1 and 3.3.3 error identification and suggestion, 3.3.7 redundant entry, 2.4.13 focus appearance | [W3C Document License](https://www.w3.org/copyright/document-license/): quote with attribution |
| [GOV.UK Design System](https://design-system.service.gov.uk/components/error-summary/) | Error summary behaviour: show it even for one error, move focus, link each message to its field, word it identically to the inline error | Code [MIT](https://github.com/alphagov/govuk-frontend/blob/main/LICENSE.txt) (Crown Copyright) |
| [USWDS](https://designsystem.digital.gov/) | Memorable-date, validation and combo-box patterns, plus a [complex-form pattern](https://designsystem.digital.gov/patterns/complete-a-complex-form/) that maps onto the CV profile | [CC0 1.0](https://github.com/uswds/uswds/blob/develop/LICENSE.md), with MIT and Apache components |
| [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) | Keyboard behaviour for the job-search combobox and the pack viewer's tabs | [W3C permissive licence](https://www.w3.org/WAI/about/using-wai-material/) |

This is where the product's credibility is won. SPEC §9 already demands 4.5:1 contrast and no colour-only status; WCAG 2.2 gives the testable version, and 3.3.7 is directly on point — do not ask again for an employer or date already parsed from the CV. The GOV.UK error summary is the pattern for upload and paste validation, and copying its behaviour costs one component, not a framework. Baymard's finding against extensive multi-column layouts should govern the alert-rule and profile forms, where `.grid` invites two columns. The APG covers the two interactive pieces the app cannot avoid.

A workable reading rhythm is about two hours a month: one pass of Recent and Land-book before marketing work starts, one targeted Refero search for the screen actually being built, and one NN/g or Baymard article tied to a live question. Galleries reward imitation, so time-box them; research rewards specificity, so spend the remainder on the component in front of you.

## What I would not use

Awwwards-style juries reward novelty on marketing pages; a findings table will never win one and should not try. The same goes for "best UI inspiration" listicles: they recycle the same twenty links, cite nothing, and several are now AI-generated. Every venue above is here because I fetched it and could name what it publishes.

*Checked live on 28 October 2026; prices as displayed that day.*

1. Subscribe to Piccalilli's weekly links and Smashing's newsletter, and read those two before adding any other feed.
2. Build a `.form-errors` component in `site.css` that reproduces GOV.UK's error summary rules (single-error case, focus move, linked messages, identical wording), carrying the MIT notice if any code is lifted.
3. Collect marketing references from Recent and Land-book, and app-screen references from Refero and Mobbin, into one `docs/design/references.md` file with source links and no copied assets.
4. Write the score-report and form specs against WCAG 2.2 SC 1.4.3, 3.3.1, 3.3.3, 3.3.7 and 2.4.13, plus Baymard's single-column finding, before visual work starts.
5. Drop award-jury criteria and uncited inspiration listicles from the design process; keep this file's links as the standing reading list and revisit it each quarter.
