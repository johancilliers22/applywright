# style.js — voice notes

**What each signal measures.** `analyseStyle` counts sentence rhythm from line-then-sentence units
(CV bullets rarely end in full stops), register from contractions + first person + slang per 100
words, spelling from a fixed UK/US pair list, tense from -ed/-ing verbs, plus buzzwords, filler
openers and achievement verbs. `styleMatch` weights rhythm 30, formality 20, spelling 15, verb
overlap 15, buzzword density 10 and contractions 10, and explains every point in a reason sentence.
`rewriteInStyle` makes reversible mechanical edits only; `assertStyleSafe` rejects a new number, a
new capitalised name sequence, or a length outside 0.45–2.2×.

**What it does not do.** Authenticity, not evasion: no anti-AI-detection features, no synonym churn,
no claim generation. Tense and -isation detection are word-list heuristics, so a marker-free CV
reports `spelling: "mixed"`, and stripping "Responsible for" can leave a gerund fragment — the
`changes` list exists so a human finishes the edit.

**HTTP layer.** Show `styleMatch` as a 0–100 "sounds like you" badge beside the rewrite, `reasons` as
its tooltip, `changes` as the review diff.
