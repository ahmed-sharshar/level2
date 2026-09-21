# Red points: complete references and independent human labels

## Search the full material hierarchy

The reference-material control searches all **107 entries** in the bundled
`data/references/material_hierarchy_v2_7.json`, not an object-specific shortlist.
Material IDs, names, reference families and visual descriptions can help find
an entry. Other / no matching category and Not sure remain available. Reference
selection is a human judgment; it does not convert reference physics values
into image observations. Visible finishes and underlying substrates stay separate.

## Keep automatic and human object labels separate

The automatic label comes from the rendered instance-map pixel at the point's
anchor, then the native object-to-mpcat40 lookup. The instance map encodes native
object ID + 1 as three RGB bytes; zero denotes an unknown/no-hit pixel. A moved
researcher point must be sampled again: stale original metadata must not follow
the point to a different surface.

Exports retain this automatic object identity/category next to, but separate
from, the annotator's chosen object and material. Missing or unresolvable machine
labels remain explicitly unavailable; they do not fill any human answer.
mpcat40 is an **object category**, not a material label: compare the automatic
object category to the human object name, never to the selected material.
An exact-name comparison is lexical agreement only. Synonyms and finer-grained
human descriptions need a reviewed category mapping before reporting semantic
error rates. Blank or uncertain answers are not disagreements on a known class.
Machine labels remain fallible annotation aids, not human ground truth.

The additive export fields are:

- `automatic_surface_labels`: one record per shared point with episode/marker
  IDs, anchor frame and normalized coordinates, mask path and dimensions, sampled
  pixel coordinates, native `object_id`, `mpcat40_id`, `mpcat40_name`, and status.
  `sampled`, `background`, `unmapped_instance` and `unavailable` are distinct.
- `surface_label_audit`: pairs each automatic record with the raw human
  `object_name`, `material` and `hierarchy_id`; its comparison records eligibility,
  reason and `agree` / `disagree` / `not_comparable` for the **object category**.

For a categorical disagreement rate, divide `disagree` by `agree + disagree`,
and report the number of `not_comparable` records separately. No rate is defined
when that denominator is zero. These machine comparisons never enter two-rater
human consensus. Browser sampling reads the actual pixel, including newly moved
targets; offline schema validation checks provenance consistency, not the PNG
bytes. Exports wait for sampling; failed loads are explicit unavailable labels.
Both arrays are optional together for old exports, required together when supplied,
and audit snapshots are refreshed after human edits without changing the answers.

## Distinguish slatted shelter

Shelter choices distinguish Solid roof / overhang, **Slats or lattice (partial)**,
Open sky, other/generic partial cover, and Not sure. The dedicated stored value
is `slats_lattice`. Historical `partial` answers remain `partial`: they must not
be silently reinterpreted as slats or lattice. No material, exposure or
reachability answer is inferred from the shelter selection.

## Researcher-placed and locked for annotators

The collection targets **four indoor and four exterior points per scene**.
Only the researcher changes the shared placement and publishes reviewed tasks.
Annotators can flag a bad target; independently moving or deleting it would make
the two raters answer different questions. Existing add/move/delete controls in
researcher setup support trimming proposed candidates before shared publication.
New task publication checks the four-per-side setting. Legacy tasks and saved
answers remain readable; task changes must be explicit, not an invisible update.

Mask-based candidates are already pre-placed, using structural/category diversity
and then mask-interior distance and area. These are candidate suggestions, not
certified biggest surfaces or human-approved targets. All **445 earlier targets
remain unchanged**. The collection-readiness revision adds three mask-backed,
RGB-inspected exterior patch proposals: one in Scene 008 and two in Scene 038.
All 56 scenes now contain four indoor and four exterior points (**448 total**).
Unknown native categories remain unknown; an identifiable physical surface does
not imply that its machine object category or human material is known.

Annotators must still check each proposed target and correspondence. The update
does not assign human labels, approve research settings, or change routes.
The separate preparation provenance records additions and hypothetical direction
definitions; see `COLLECTION_RELEASE.md`.

## Reproduce the source audit

The verifier decodes every published anchor's actual instance-map pixel, resolves
its native category, compares both to frozen marker metadata, checks source hashes,
and verifies complete hierarchy coverage and reference-entry identity:

```bash
python3 scripts/verify_redpoint_sources.py
# Optional original-workstation reference comparison and a new saved report:
python3 scripts/verify_redpoint_sources.py \
  --source-hierarchy /data/Ahmed/mit/new/data/material_hierarchy_v2_7.json \
  --out /tmp/redpoint-source-audit.json
```

Requires Pillow. Inputs are read-only; only an explicit `--out` writes a report.
`validation/redpoint_source_audit.json` is the historical 445-point delivery audit.
Run the command above to verify the current 448-point revision. Top-level `passed`
concerns source integrity; `four_per_side_readiness` checks counts, not research
approval or physical correctness. A native category-0 label is preserved honestly,
not changed into a human category by this verifier.
