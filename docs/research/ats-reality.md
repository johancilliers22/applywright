# How applicant tracking systems actually parse and rank CVs in 2026

Two systems hide under "the ATS". **Parsing** turns a file into database fields. **Ranking** orders the candidates those fields describe. Parsing is lossy and often licensed from a specialist. Ranking is where the change is — and in 2026 it is mostly a per-job configuration written by the employer, not a universal keyword judge.

## Parsing is field extraction, often by a third party

Not every big ATS parses in-house. Greenhouse treats resume parsing as a toggle separate from its AI matching, and both must be on for Talent Matching ([Greenhouse, Talent Matching](https://support.greenhouse.io/hc/en-us/articles/41396009937307-Talent-Matching)). Its marketplace also lists third-party parsers that push contact details and parsed skills into the candidate record ([Greenhouse, Parsetalent](https://support.greenhouse.io/hc/en-us/articles/37962063973403-Parsetalent-integration)). One common engine is Textkernel, now part of Bullhorn, whose public data model shows what "parsed" means: contact block, education with degree level normalised to local and international classifications, work history with per-role years computed from dates, and skills attributed back to the item they came from ([Textkernel data model](https://developer.textkernel.com/Parser/master/data_model/candidate-data-model/)).

Two documented limits matter more than formatting tips. The parser reports its own failures: a `partialExtractionIndicator` for over-long documents, and a resume-quality report running "from fatal problems ... to suggested improvements" ([Textkernel SDK](https://textkernel.github.io/tx-dotnet/Textkernel.Tx.Models.Resume.Metadata.ResumeMetadata.html)). And the blame sits with the document: "Great resumes will parse great. Horrible resumes will parse poorly... The Parser cannot fix candidate mistakes" (same page).

The hardest failure is structural. A scanned PDF has no text layer, so a parser sees an empty document unless OCR runs — and OCR is a separate product line even for a dedicated parser ([Textkernel OCR](https://www.textkernel.com/resume-parsing-ocr-addon/)). Column layouts and contact details confined to a header defeat the linear reading order these models assume; no vendor I checked documents that as fatal.

| Vendor | Documented on parsing | Documented on ranking |
|---|---|---|
| Greenhouse | Parsing is a distinct toggle; AI matching depends on it | Weighted calibration, five score bands, per-candidate explanations, override, recalculation on recalibration; "assistive AI, not automated-decision-making" |
| Ashby | Nothing public on parser internals | Criteria written as prompts; meets / does not meet / undecided with reasoning; sortable "AI Job Criteria Met Percentage" |
| Textkernel (Bullhorn) | Full field model, partial-extraction flag, resume-quality findings, OCR add-on | Not its product; matching sold separately |
| Workday | No citable public page found; only gated admin guides | Same |

## Ranking: four mechanisms that decide outcomes

| Mechanism | Reads | Rewards | Punishes |
|---|---|---|---|
| Exact keyword filter | Full CV text and internal notes | The literal term the recruiter typed | Synonyms, spelling variants, acronyms |
| Knockout rules | Application question answers | Consistent answers | "No" on eligibility, salary, location |
| AI criterion scoring | CV and/or structured profile | Evidence of that role's criteria | Criteria the CV never addresses |
| Human scorecards | Reviewer judgement | Citable evidence | Unstructured prose |

**1. Exact keyword filtering.** Greenhouse searches "the full text of resumes and internal notes", and "the keyword from your search must exactly match the keyword in the application", combined OR (preferred) or AND (required) ([Greenhouse, Talent Filtering](https://support.greenhouse.io/hc/en-us/articles/27104809835291-Talent-Filtering)). This is string matching, so "organisational" does not match "organizational" (inference from "exactly match", not a vendor statement).

**2. Knockout rules.** Rejection by rule is real but narrow. Auto-reject fires on a prospect's answer and "can be configured only for the following question types: Yes/No, Single select, Multi select" ([Greenhouse, Auto-Reject](https://support.greenhouse.io/hc/en-us/articles/360029081512-Auto-Reject-for-prospect-post)). Nothing there reads the CV.

**3. AI criterion scoring.** Ashby has employers write criteria as prompts, validates them for clarity and equal-opportunity risk, returns meets / does not meet / undecided per criterion with reasoning, and offers a sortable "AI Job Criteria Met Percentage" column. It scores education and work history from the profile even where there is no resume ([Ashby](https://docs.ashbyhq.com/ai-assisted-application-review)). Greenhouse weights four to six calibrated skills, sorts into five bands, shows matched skills and terms, and recalculates every score when calibration changes ([Greenhouse](https://support.greenhouse.io/hc/en-us/articles/41396009937307-Talent-Matching)). Greenhouse says its AI does not advance or reject anyone; Ashby makes no such claim.

**4. Human scorecards.** Ashby's Average Score "reflects the ratings given by human reviewers" and is "calculated independently from AI criteria evaluations" ([Ashby](https://docs.ashbyhq.com/ai-assisted-application-review)).

## The 75% claim

The familiar figure — 75% of CVs rejected before a human sees them — has no traceable primary source; I could not verify one. Vendor documentation contradicts the strong form: rule-based rejection covers select-type answers only, and Greenhouse calls its scoring assistive. The real failure is quieter. Greenhouse puts candidates in "Needs manual review" when "their resume could not be processed by AI" ([Talent Matching](https://support.greenhouse.io/hc/en-us/articles/41396009937307-Talent-Matching)). Unread is not rejected, but the outcome looks the same: the cause is parsing, not keywords.

## What is not documented, and what is contested

No vendor publishes ranking weights or accuracy figures, so a product claiming to know "the ATS algorithm" is inventing it. Ashby charges per evaluation and lets customers edit the prompts: the criteria are authored, not intrinsic. Workday documents parsing only in gated admin guides; I could not retrieve a citable public page, and secondary write-ups disagree. Whether AI screening helps is contested politically as well as empirically — the EU classifies recruitment and selection systems as high-risk by category, not on evidence of harm ([Recital 57](https://artificialintelligenceact.eu/recital/57/), anchoring [Annex III(4)](https://artificialintelligenceact.eu/annex/3/)). On script coverage the only vendor statement I found is Greenhouse's anonymisation model being "currently optimized for resumes written with Latin characters" ([Anonymize resumes](https://support.greenhouse.io/hc/en-us/articles/44504682355611-Anonymize-resumes)) — an anonymisation claim, not a parsing one.

## Implications for Applywright

1. **Add parse-fidelity findings to `score.js`'s `formatting` subscore**: no text layer, multi-column layout, section headings outside a recognised set, contact details only in a header or footer. Each finding needs a specific `fix`.
2. **Return literal exact-match coverage beside the normalised `keywordCoverage`**, because Greenhouse's filter is exact string matching. Flag British/American spellings and acronym variants as named findings instead of folding them away silently.
3. **Never label the 0–100 an "ATS score".** Present it as Applywright's rubric with named findings, and label any employer-side simulation as a simulation. No vendor publishes weights, so a claimed ATS score is unfalsifiable.
4. **Persist the ranking inputs in `report_json`**: the job's keyword set, weights and the exact terms matched. Employers recalculate scores when calibration changes, so a stored score without its inputs cannot be explained later.
5. **Treat `screening` answers as a scored surface.** Auto-reject fires on select-type answers, so generate answers consistent with the CV — right to work, location versus remote, salary against the stated range — and flag any mismatch.
