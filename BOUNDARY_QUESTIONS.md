# Opening overview: five short human checks

The current homepage presents these together under **Opening**, after checking
that the outline identifies the intended boundary:

| Question | Choices | Exported human field |
|---|---|---|
| What is it? | Door; Window; Open gap with no door; Not sure | `answers.boundary.kind` |
| How wide is it? | Single door; Double door; Wide glass wall; Not sure | `checks.boundary.width_class` |
| Can you see through it? | Clear glass; Frosted / tinted / patterned; Solid (can't see through); Not sure | `answers.boundary.pane_transparency` |
| Is anything blocking it? | Nothing; Curtains; Blinds; Screen; Furniture; Multiple blockers; Other; Not sure | `checks.boundary.blockage` |
| Is it open or closed in the images? | Open; Closed; Partly; No door / closure exists; Not sure | `answers.boundary.observed_state` |

Previously saved detailed door kinds are retained and shown as an additional
selected option. They are never silently replaced with the broader Door label.
For multiple blockers or Other, describe them in the existing scene note.
If a width category does not describe the opening, choose Not sure. The pane
question concerns the pane/panel, not an unobstructed gap beside an open leaf.
For an open gap with no pane, use Not sure for pane transparency and No door /
closure exists for the observed state. Nothing auto-fills any other answer.

## Automatic measurement is not a human label

`boundary-measurements.json` contains an annotation-only supplement for all 56
current boundary objects. The UI shows **Mesh object span: approximately X m**.
The estimator takes twice the larger horizontal radius of the native mesh
instance's oriented bounding box in the frozen `.house` object lookup. It
checks source hashes, object identity, unit axes, and the native Z-up orientation.
The dimensions are metres, not rendered pixel widths.

This is **not a certified clear-opening width**. An instance can be one open
leaf, several joined panels, or surrounding geometry; glass may be incomplete.
No aperture width or numerical error bound is invented. The UI checks dataset
and boundary identity before displaying a value; missing/mismatched estimates
say unavailable. The annotator confirms only the category, not a false claim
that this is the measured traversable aperture.

The supplement records a content-derived `measurement_id`, dataset build/hash,
per-episode object IDs, native OBB data, and source paths/hashes. It has
`model_visible: false` and `human_annotation: false`. Numeric estimates are not
copied into human answer fields. Join the exported categorical judgment to this
supplement using dataset build ID, episode ID, and its fixed boundary object.
The package builder independently reproduces the supplement before creating a ZIP.

## Compatibility and completion

New exports retain `blockmind_l2_annotations_v2` and add
`boundary_questions_version: 1`. Only width category and blockage are new
human fields. Every existing material/reflectance/pathway/surface question stays.
Shared tasks, research approval, all 56 scenes, and dataset/catalogue build IDs
are unchanged; this release does not apply the separate route-quality filter.

Old exports remain readable with their original scope. On browser resume, the
original storage envelope is archived under a `:before-boundary-v1:` key before
adding blank fields. If the original cannot be preserved, upgrade stops without
overwriting it. Imported files use a preview/confirmation. Existing answers and
exclusions are preserved; included completed scenes reopen for the two missing
answers. Upgrade provenance records the original hash and completion statuses.

Two-rater consensus rejects mixed boundary-question versions. New width/blocker
votes appear in per-field agreement; uncertainty is not agreement on a known
category. Old-old comparisons explicitly report that the new attributes were
not collected. Machine span values never become consensus human ground truth.

## Reproduce the measurement supplement

```bash
python3 scripts/build_boundary_measurements.py
python3 -m unittest discover -s tests -p 'test_boundary_measurements.py' -v
```

Regeneration is deterministic and does not rewrite an identical file. Changing a
different existing supplement requires the explicit `--replace` flag.
