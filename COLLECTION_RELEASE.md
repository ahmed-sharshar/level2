# Collection-ready revision — 2026-09-21

This release makes the requested annotation sections usable without pretending
that research settings or human scene facts have already been approved.

## What changed

- All 56 scenes have four indoor and four exterior physical-patch proposals:
  448 targets. The original 445 coordinates and observations are unchanged.
- Three exterior patches were added after RGB and instance-mask inspection:
  Scene 8's balcony floor, and Scene 38's facade patch and door leaf.
  A raw region/category mismatch stays in provenance; no human object or material
  answer is inferred from those machine labels.
- Each scene has two shared, feature-relative hypothetical incoming directions,
  including saved reference-image anchors. They are provisional scenario inputs,
  not claims about actual sun/rain or approved physical ground truth.
- The explicit `settings.collection_mode: "provisional"` enables all four
  direction × opening-state scenarios after structural validation. Sun and rain
  remain separate per-point answers. Opening checklists remain consistency-only.
- Different annotator IDs distinguish drafts in the same browser. Separate
  profiles are optional. IDs are not passwords; use only your own ID and return
  downloaded answers privately.

## Collection completion is not benchmark approval

`episodeCollectionReady` checks that the actual shared inputs exist: exact point
counts, unique target anchors, usable directions/reference coordinates, correct
source/task identity and pre-crossing boundary boxes. Missing or malformed inputs
still block completion; no blank answer becomes No.

`episodeReady` remains the separate strict researcher-approval check. Scene,
hierarchy and protocol review flags stay false in the distributed revision.
Individual exports always retain `benchmark_ready: false`. Two-rater consensus
can report agreements and disagreements for provisional collections, but cannot
promote research-unapproved tasks to eligible benchmark GT. The final reviewed
opening rule table and VHC/allowed-pairs dependency remain downstream work.

Directions may need revision after the research pilot. If direction text or
reference geometry changes, directional answers must be recollected. The
reference arrow is a callout to a feature, not a simulated incident ray. Where
the photographs do not establish a path, annotators should choose Not sure.

## Existing annotations

The updated shared package gets a new content-derived task ID. Old local drafts
and downloaded exports are not overwritten by website deployment. Returning
with the same annotator ID offers an explicit migration preview:

- Existing surface labels transfer only for the same physical target.
- Unchanged scene/opening facts and compatible visibility checks are retained.
- Added targets start blank. Changed directional judgments start blank.
- Completion is reopened, and the original draft/source hash is preserved.
- Annotators must use the same task revision when their exports are compared.

No dataset images, depth/mask assets, original routes, human annotation files or
research audit votes are edited by this release. The full 107-entry reference
hierarchy and all requested opening, shelter, visibility and consistency fields
remain available. Measured boundary span is still labelled as an approximate
native-object bounding-box span, not a surveyed clear aperture.

## Reproduce checks

```bash
node --test tests/*.test.js
python -m unittest discover -s tests -p '*test*.py'
python tests/collection_release_browser.py
python scripts/verify_redpoint_sources.py
python scripts/verify_bundle.py
```

Use the project's `scannetpp` environment for Python/Playwright and put its
Playwright Node runtime on PATH if a separate Node installation is unavailable.
Browser tests use disposable synthetic answers; they are not human annotation
results or benchmark scores. Earlier reports in `validation/` are dated delivery
snapshots, not evidence that research approvals have been granted.
