# Editor design decision for the next visual brief

Operator source review29October2026, after manual resume. This is an architecture
decision for future design work, not a shipped UI change or rendered verification.

Current public/assets/editor.js:1442 ask() explicitly saves dirty edits before
requesting /api/cvs/:id/assist because server/app.js:1439 uses the stored CV.
The status explains the save. Proposal application is a separate user action:
the button at editor.js:1618 says Accept and save, and acceptHunk at1710 checks
the expected before text, updates the form and saves. This prevents silent
application of stale proposals; changing only labels or deleting save() calls
would create a contract mismatch.

For the present scope, preserve this behavior and make help copy consistent with
it. Any future two-step preview design requires an explicit design/implementation
assignment covering a version-bound draft request, server-side grounding against
that exact supplied draft, stale-version handling, acceptance and save errors,
and focused positive/negative controls. Do not commission it as a cosmetic patch.

Motion proposals must preserve reduced-motion behavior, keyboard/focus order,
readable and polite async status, responsive save reachability and truthful
proposal/refusal states. Do not add scroll hijacking, invented social proof or
decorative transitions that delay save/review. Compare small vanilla/CSS/Web
Animations approaches before adding a framework or animation dependency. Current
token theme and deterministic scoring/grounding contracts remain authoritative.

A11Y writer owns only describedby/save-state announcements for now. Design
authors must coordinate later overlapping editor.js changes after that writer
is terminal and reviewed. User authorises the larger design/research mission;
this file resolves the immediate API boundary without asking another permission.
