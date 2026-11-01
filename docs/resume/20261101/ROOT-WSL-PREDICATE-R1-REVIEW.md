# Independent Root review: Applywright WSL pure-predicate case R1

1 November 2026. Verdict: **REQUEST_CHANGES; not ready for execution**. Root is independent of the DSH source author. This review ran no candidate, parser, import, test, EX, Node or Python case body. The active Root reviewed both complete executable source files as text (parent534 lines, harness474 lines); broader pinned product-module/oracle qualification remains part of the next exact source review. This is not a whole-product or Windows review.

Frozen parent SHA56ddd1e0d0ce60ea01fb7db9ce6b2d7d1c36f59c639f4c55c4d3122f39574050; harness SHA3bec9512573e3bfe60c817033334831fcffa253a2fc5847d7a91d6eb5ff3a946. MANIFESTef1c1d97 is the submitted input, not an acceptance certificate. Preserve this R1 and all original histories/expectations.

## R1-01 HIGH: every harness run necessarily fails the live-history count

verify-grounding-g1-pure-js.mjs:339 increments historyLive only for boolean rows. The label row executes its real predicate at357 but never increments that counter. The declared corpus has210 boolean rows and one label. Thus historyLive is210, while399 requires211. counts.executions at392 also omits the live label. Parent503-505 independently requires historyLive211. Even otherwise-perfect predicate behavior cannot satisfy this protocol. This is a static arithmetic/control-flow contradiction, not observed RED.

Correct the actual executed-row accounting (including the label), retain exactly211 literal rows and244 total comparisons, and keep separate210 boolean/one-label counts where useful. Do not drop the label, change frozen expectations, reduce the required comparisons or label this instrumentation error behavioral RED. Add meaningful source controls for the exact count and label execution paths.

## R1-02 HIGH: mandatory host resource admission is absent

Parent311-321 checks guest MemAvailable only and explicitly records windowsObserved:false. No fresh Windows host RAM or already-running distro-name admission is performed inside the EX before G release. This does not meet the standing host/guest/native phase contract; calling the case WSL-only does not waive the host floor. The Linux-only Terra pattern was specifically admitted with a host observation; its receipt is not this case's authority.

Provide a concrete supported host-observation/admission bridge or reviewed existing-parent composition, bound to this exact case and fresh while its lifetime EX is held before each executable step. Preserve the applicable host floor (at least the existing2GiB Linux pure-JS floor, not an inferred Windows4GiB waiver), guest3GiB and all native resource rules. A stale JSON metric/author boolean is not a fresh observation. Do not introduce a generic Windows executor or interop escape; propose the smallest actual fixed-purpose resource port and its lifecycle. Root will adjudicate that concrete source, not require a new human permission merely for source preparation.

## R1-03 MEDIUM: a nonzero or timed-out child can be promoted to an expected direction

Parent494-496 checks raw exit0 for fixture76, but517-523 does not check exitCode/timedOut/interrupted for the GREEN harness. Parent526-529 similarly omits the actual exit contract and oracle/control health for baseline RED. A result file is not proof that its process completed successfully. Static witness: a harness writes PASS then hangs or exits nonzero; parent can kill/reap it and still match GREEN from its JSON. Baseline expected semantic FAIL must not absorb HARNESS_ERROR, timeout or unrelated oracle/control failure.

Require positive exit0 and no timeout/cancellation; expected semantic baseline failure uses the documented exit1 plus complete healthy instrumentation, named failed predicate witnesses and valid source/closure/positive controls. Preserve all raw outcomes and keep unexpected R10 behavior as legitimate diagnostic failure. Do not change expected data to make the target pass. A direction summary may describe expectation matching only, never product acceptance.

## R1-04 MEDIUM: the parent's exact input closure omits a live read

Harness318-320 reads LABEL_FIXTURE, pinned6c9d8a3a. Parent231-240 excludes that file from expected_inputs and rejects any extra path; Root therefore cannot include the full actual read closure in its exact plan without the parent refusing it. The harness's read-time hash is useful, but is not the promised parent whole-phase before/after input binding.

Add the exact public label fixture path/hash to the fixed parent closure and manifest/plan, before/after checks, and provenance documentation. Retain unchanged source and the independently derived label expectation. Do not add a wildcard. The full product-module imports/top-level initialization and unchanged76 fixture must also be reviewed before execution. The harness's lexical blacklist at237-247 is not a general OS confinement or complete ESM grammar proof; qualify the eventual cooperative frozen-source scope honestly.

## R1-05 MEDIUM: cancellation can be observed yet an unreleased child still receives G

The signal handler163-164 sets interrupted. Only the loop entry343 checks it;397-401 can then hash/check and send G after cancellation arrived during the pre-exec interval. Recheck cancellation at the final release decision. A cancelled blocked child must close/deny G and be reaped with custody retained, never start the next test. Preserve the owned-child wait/cleanup and inherited lock descriptor behavior; do not turn any cleanup exception into whole-tree terminal proof.

## Startup and next phase

Bind the exact Python executable/flags/stdlib startup separately as well as Node. The example -I -B alone still loads global site initialization; a reviewed stdlib-only -I -S -B launch is a suitable source proposal if compatible. No fake HOME or auth/config copy. The Root-issued approval plus externally observed digest is a specific trusted invocation input; its sourceAndClosureReviewed boolean cannot self-authorize an unknown caller.

Return one new coherent R2 in the SAME source owner's assigned scope, with corrected code, meaningful protocol controls, updated hashes/manifest/plan and honest change map. This is permission to prepare those source corrections, not execute them, rewrite frozen R1 or edit the product. Root will continue the independent exact safety review of R2 and actual pinned module/oracle/startup closure, then issue a NEW narrow approval only when ready. Current Root holds no EX/reservation/GUI lease. No extra reader process or4GiB reviewer-launch exemption was used.
