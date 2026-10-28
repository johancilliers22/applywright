# NOTES — `cv/refine.js`

`parseInstruction` recognises shorter, longer, formal, plain, senior, junior,
technical, less jargon, first/third person, UK/US spelling, "use my own wording",
the targets (summary, bullets, letter, answers) and any quoted phrase, protected
verbatim. Length intents default to summary + bullets, others to all prose.

It refuses to invent or drop a number, employer, title, date, qualification or
name; `groundChanges` checks both ways and reverts failures into warnings. Unfilled
"Not provided" answers are untouched; unrecognised instructions change nothing and
say so (only a model can).

`refine()` returns `refined = { summary, bullets[], coverLetter, answers }` indexed
to `pack.tailored.bullets`; the returned pack's `cvHtml` is stale. Rebuild with
`buildPack({ profile, cvText, job, tailored: { ...pack.tailored, summary,
bullets: refined.bullets.map((text, i) => ({ ...pack.tailored.bullets[i],
rewritten: text })), coverLetter, screening } })`, mapping answers by index
(motivation, noticePeriod, rightToWork, salaryExpectation), never an unchanged
placeholder.

Extend by adding an `INTENT_PATTERNS` regex, a `TRANSFORMS` function, an
`APPLY_ORDER` entry and a test.
