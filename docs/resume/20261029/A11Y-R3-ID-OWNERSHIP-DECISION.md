# A11Y R3: preserve caller IDs and repair owned hint references

Operator architecture input after the exact R2 Sol finding F3. No runtime or AT
claim. Preserve the frozen R1/R2 histories and38 current test intents.

The reported case creates both distinct caller-owned controls before field()
calls: controlA id=name, controlB id=hint-1. A's detached hint first receives
hint-1; the later field(B) preserves its caller ID and collides with that hint.
Checking only the live document/current control/reserved Set cannot repair the
already created detached field. The same issue exists if B has no hint.

The helper owns its generated hint IDs and appended references; callers own
their control IDs, labels and pre-existing describedby tokens. Account for this
ownership explicitly: either pre-register a known control batch before any
allocation, or safely relocate an earlier helper-generated hint plus its OWN
reference when a later caller ID reserves that name. A prefix change/randomness
alone is not a proof against the stated predetermined detached-control case.

If relocating a helper-owned hint, preserve the original controls/labels and all
non-owned describedby tokens/order. Allocate against current known/reserved/live
IDs, update the hint and its controlled reference together before returning,
and avoid strong global references that retain detached route trees forever.
This is an implementation direction, not a requirement to add an elaborate
registry where a smaller correct design meets the whole current contract.

Add the exact fresh-module case, inverse field order, later no-hint caller and
multiple detached fields. Assert every caller ID/label, global uniqueness and
actual resolution of each appended hint token to its own paragraph. Keep R2's
same-call/live-ID and original ordinary multi-field controls, import cleanup,
single loading channel and quiet/enabled dedupe behavior. Do not narrow the
contract to generated-only IDs or solve it by changing caller-owned IDs.

Only DSH R3's assigned worktree/source/report paths may change; a new independent
Sol exact-source review and admitted execution follow. No tests under SOURCE.
