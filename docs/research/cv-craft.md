# What actually makes a tailored CV work

A tailored CV survives four filters in sequence: parsed into fields, found by a search,
read by a person, checked against reality. The evidence is strong on the first two,
moderate on the third, and thin on the folk rules that dominate careers writing.

## Table 1 — the four gates

| Gate | What happens | Typical failure | Primary evidence |
|---|---|---|---|
| Parse | The file becomes text; the text becomes candidate fields | Partial parse: employer, title or dates left blank; file attached but not searchable | [Greenhouse parse-failure guide](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) |
| Find | A recruiter searches the full text, filters, or sorts by an AI match score | The posting's term never appears; an exact-match search misses | [Talent Filtering](https://support.greenhouse.io/hc/en-us/articles/27104809835291-Talent-Filtering), [Talent Matching](https://support.greenhouse.io/hc/en-us/articles/48563080657435-Talent-Matching-setup) |
| Read | A short human pass, comparing the CV to the posting | Generic summary; irrelevant first bullets | [Cui, Dias and Ye](https://arxiv.org/abs/2509.25054) |
| Verify | Interview, references, screening answers | A claim that cannot be evidenced | [Fraud Act 2006 s.2](https://www.legislation.gov.uk/ukpga/2006/35/section/2), [application rules](https://support.greenhouse.io/hc/en-us/articles/203105595-Application-rules-overview) |

## Parsing is unglamorous and decisive

Greenhouse documents what breaks a parse: letter-spaced text, graphics and
word art, image uploads, "complex resumes with tables, headers, and footers", contact
details in a header or text box, "a columned layout", unclear or inconsistent sections,
company names without a legal suffix, abbreviated job titles, files over 2.5 MB. When
parsing fails the fields are filled in by hand: the CV is attached, not deleted. The
failure mode is invisibility in later searches, not rejection.

A 2025 paper on a system deployed on Alibaba's HR platform names "the extreme
heterogeneity of resume layouts" as the first obstacle and builds a layout-normalising
parser to cope ([arXiv:2510.09722](https://arxiv.org/abs/2510.09722)). iCIMS shows the
other end of the range, extracting text from PDF, DOCX and even image formats, and
returning nothing when extraction fails
([iCIMS developer docs](https://developer-community.icims.com/applications/applicant-tracking/binary-files)).
Vendors differ; text-based files with obvious structure are the safe baseline.

## The search, not the reader, is the first audience

Greenhouse's talent filtering searches "the full text of resumes and internal notes" for
job titles, skills and locations, and states that "the keyword from your search must
exactly match the keyword in the application". Keywords can be OR or AND ("preferred" /
"required"), and the tool suggests keywords generated from the job post. Two mechanisms
are in play: literal matching, where the posting's own phrasing wins, and AI scoring,
which Talent Matching computes only when a site admin enables it, only for new
applications, with an opt-out routing the candidate to manual review. Application rules
can auto-reject on answers to custom questions such as licences or location. None of this
rewards vocabulary you cannot support. All of it punishes vocabulary you never use.

## Tailoring moves outcomes, and the effect is decaying

The best causal evidence concerns cover letters, not CVs. Cui, Dias and Ye study an AI
cover-letter tool's rollout on Freelancer.com: 5 million letters across more than 100,000
jobs. Before it, letters that engaged with the job's content predicted callbacks and
awards, within and across workers. Using the tool raised alignment by 1.36 SD and callback
probability by 3.56 percentage points on a 7.02% base, though the callback estimates are
only loosely significant. Then the signal decayed: the correlation between alignment and
callbacks fell 51%, and with offers 79%, while employers shifted towards past reviews.
Editing mattered: a one-standard-deviation increase in revision time was associated with a
0.31 percentage point rise in offer probability, about half the average offer rate — and
most drafts were sent with little or no editing.

Relevance is real but no longer scarce; effort and evidence are.

## Claims that do not survive checking

Two claims fail. The "75% of CVs are rejected by ATS" figure, repeated widely including by
vendors, has no primary study I could find; Greenhouse documents partial parses and manual
entry, not rejection. And "quantify every bullet" is not evidenced: no controlled study I
found shows numerals themselves lift callbacks. What is defensible is specificity you can
evidence at interview. An invented metric is not a better CV but a false representation —
the Fraud Act 2006 covers representations that are "untrue or misleading", expressly
includes implied ones, and applies to anything "submitted in any form to any system or
device", an application form included.

Evidence on reading time is weaker than its repetition. The 7.4-second figure comes from a
Ladders eye-tracking study
([Ladders](https://www.theladders.com/career-advice/why-do-recruiters-spend-only-7-4-seconds-on-resumes));
Ladders blocks retrieval from this region, so I could not check its method.

## Regulatory backdrop

The ICO audited recruitment-AI providers in 2024, made almost 300 recommendations, found
tools that let recruiters "filter out candidates with certain protected characteristics",
and expects candidates to be told how to challenge automated decisions
([ICO](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/11/thinking-of-using-ai-to-assist-recruitment-our-key-data-protection-considerations/)).
Right-to-work checks must avoid unlawful discrimination under the Home Office code in
force from 1 October 2026
([GOV.UK](https://www.gov.uk/government/publications/right-to-work-checks-code-of-practice-on-avoiding-discrimination)).
A candidate-side tool is not bound by either directly, but both point one way: collect the
minimum, never dress a score as a decision, never encourage unevidenced claims.

## Table 2 — claim status

| Common claim | Status | What the evidence supports |
|---|---|---|
| "Most CVs are auto-rejected" | Undocumented | Vendor docs describe partial parses and manual entry, not rejection |
| "Mirror the job ad's words" | Supported, with limits | Exact-match keyword search is documented; AI scoring is fuzzier. Mirror terms for work you did; do not stuff |
| "Quantify every bullet" | Weak | No controlled evidence for numerals as such; verifiable specificity is the defensible version |
| "Tailoring doubles your chances" | Directionally supported, decaying | +3.56pp on a 7.02% base in one platform study; the signal's correlation with callbacks fell 51% after AI writing spread |
| "One page, never two" | Convention, not evidence | No study found; length is not a documented parse factor |
| "AI-written CVs get detected and binned" | Contested | Detectors are unreliable; employers shift to harder-to-fake signals instead |

## Implications for Applywright

1. Make formatting pass/fail, not a heuristic: `score.js` emits `parseRisk[]` from
   Greenhouse's documented causes (tables, columns, header/footer contact, text boxes,
   images, letter-spacing, absent headings, abbreviated titles, >2.5 MB); `packs/build.js`
   must be unable to produce any of them.
2. Anchor coverage to the posting's exact noun phrases: keep 2–3-word phrases in
   `extractKeywords`, prefer its wording over synonyms, and report each miss with the
   section where it could honestly go — never a "pass rate".
3. Extend grounding to implied claims: `assertGrounded` must reject title inflation, date
   shifts and employer renames, not only new numbers — s.2(4) covers implied
   representations.
4. Treat the cover letter as an editing task: keep the draft-to-edit diff, show what
   changed, and prompt a revision pass — most AI letters ship unedited, and editing time
   is the variable linked to offers.
5. Score the document, not the person: no callback probabilities, no "ATS pass rate", no
   employer-facing decision language, and a minimal CV field set (no date of birth, photo
   or nationality) with export and delete.
