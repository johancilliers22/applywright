# Operator review of the DSH motion research

29 October 2026. The six-file DSH deliverable is research input, not a shipped
design, a browser result or a whole-project acceptance. Its terminal result and
all six byte hashes were verified/reaped through the native broker. Originals
remain frozen in t3-a4aeb610. No private bookmarks were fetched; ACCESS_ABSENT is
an access/discovery result, not evidence that no useful bookmarks exist.

## Accepted findings and bounded direction

The source-backed scroll/reduced-motion and stylesheet-delivery observations
justify scoped follow-up. Native CSS/WAAPI/View Transitions are reasonable
baseline candidates. Add motion to support actual navigation/state changes,
without narrowing Johan's larger professional design/UX objective to the four
currently enumerated transitions. Richer designs can justify a library later.
Zero transitions in a file is not itself a defect. A single main landmark does
not automatically violate accessibility rules merely because it is unnamed;
route announcement quality needs a rendered/assistive-technology check.

The existing save-success announcement was indeed missed by the old static
audit. The A11Y writer's brief already required inspecting real current markup
and avoiding duplicate speech. Review its controller/quiet-save behavior rather
than treating the old D2 wording as literal current truth.

## Library comparison corrections / limits

The report correctly labels npm dist.unpackedSize and identifies React as an
optional peer. Its phrase that total installed package size is the honest
adoption cost is insufficient for a browser-performance decision. Installation
footprint, shipped/minified/compressed bytes, execution and layout costs are
different measurements. No bundle/runtime comparison was executed here.

The official Motion JavaScript documentation supports vanilla HTML/script usage
and a motion/mini import. It advertises mini at3.2kb and hybrid at22kb; these are
vendor documentation figures, not our measured production bundles. Motion is
therefore retained as a candidate for useful spring/interruptible interaction,
not rejected simply because the npm installation also contains React support.
Sources checked live: https://motion.dev/docs/quick-start and
https://motion.dev/docs/animate .

The GSAP report accurately describes a non-OSI licence. That alone is not a
commercial-use ban. Its official pricing page describes the library as free;
the current no-charge licence permits website/web-application use and excludes
competing no-code visual-animation-builder uses. This app is a CV product, not
an animation builder. Keep licensing/notice checks at the adopted version, but
do not invent a paid requirement or discard GSAP solely because this repository
is MIT. Scope/complexity and actual measured benefit should decide adoption.
Sources checked live: https://gsap.com/pricing/ and
https://gsap.com/community/standard-license/ .

Specific browser-version tables in the DSH report are attributed to its dated
BCD fetch. Operator opened the official MDN startViewTransition and starting-style
references, but has not independently checked every browser/version cell. Use
feature detection and progressive fallbacks; preserve NOT RUN for real browsers.

## Next author/reviewer brief

Gemini may refine source-backed specifications after the report and these limits;
pixel observations require actual decoded media delivery. Root still owns Terra
and estate-cua qualification first. Muse is advisory and needs a fresh verified
contributor-OFF route. The DSH NEXT-GEMINI brief's absolute no-library restriction
is a proposed phase boundary, not a new permanent operator rule. Source-only
research cannot prove fluidity, performance or accessibility of the rendered UI.

Implementation ownership must wait for the current A11Y editor/app writer to be
terminal and frozen. No overlapping source writer, unreviewed library install,
preview restart or source merge follows from accepting useful research inputs.
