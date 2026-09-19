# Independent scientific coverage review

Review date: 2026-09-19. Scope: the complete text of `BLOCKMIND_Level2_Workplan_Sharshar.docx`, the website's README, annotation guide, proposal coverage, immutable dataset/catalogue, `core.js`, and the validation/consensus helpers. This is a scientific/data-contract review, not a substitute for browser integration testing or a new human annotation pass.

## Main judgment

The tool collects the main human facts required by the supplied workplan and keeps machine proposals separate from human ground truth. Its scientific claims are appropriately narrower than a completed benchmark: no simulation, no automatic reachability ground truth, no approved Family C table invented, no generated MCQs or model evaluation claimed. The later native reciprocal-navigation/reference-100px decisions correctly supersede the workplan's historical MST description.

All 56 candidates remain available, including the 10 previously flagged for visual review. They must not all be described as human-certified benchmark episodes. A coordinator can repair the setup or explicitly exclude a candidate before independent annotation.

## Issues raised during implementation review

1. **Dataset-to-layout integration:** proposed observations carry a mesh depth residual, but the shared-layout validator initially allowed only frame, coordinates and source. `makeLayout` must project observations to those contract keys. The core agent confirmed the fix and a zero-error live-dataset draft-layout validation. Residuals remain annotation-only dataset diagnostics.
2. **Visible coating versus substrate:** a boolean `substrate_known` alone does not identify a known substrate behind a painted/coated finish. Separate substrate material and hierarchy fields, conditionally required when the annotator claims knowledge, avoid an important later Family C/D ambiguity. The accepted extension is now present in the shared schema and validator. Consensus and agreement reports separately count conditionally inapplicable substrate nulls rather than misreporting them as unfinished annotations; those nulls do not become class ground truth.
3. **Human boundary certification:** numerical machine sightings do not replace two-rater RGB certification. Consensus now reports pre-crossing boundary visibility, object identity and box correctness and requires two confirmed direct/through-glass, hand-box-certified pre-sightings before declaring Family B annotation coverage ready. Reflections remain separately recorded as seen-in-RGB for Level 3. Requiring direct/through-glass rather than reflection for the stronger boundary-surface witness is an explicit conservative policy, not an inferred property of the workplan. Machine pixel counts are audit-only here; they do not override human RGB certification.
4. **Counterfactual interpretation:** both annotators need the same definition of open versus sealed and the same fixed geometry/directions. The final shared layout now includes immutable, versioned condition texts: open the existing closure while leaving other obstructions fixed; close and tightly seal that same closure without changing material/glazing; do not invent a closure when absent or unknown. These texts are included in the layout identity. Undefined sealed counterfactuals remain uncertified for known-answer GT.

## Coverage by scientific use

| Use | Human data retained | Remaining dependency |
|---|---|---|
| Family A: exposure and porosity/exposure traps | Persistent surface IDs; two shared feature-relative directions; per-surface sun/rain under open/sealed conditions; shelter; material/hierarchy/finish facts | Reviewed exposure item rules, exact-set construction, class mapping for stereotype tags, quotas and pair chance |
| Family B: pathways | One boundary identity; glazing/transparency, observed state, kind, air gap; directional direct-sun/diffuse-light/air/rain cells for both hypothetical states; per-frame boundary certification | Human sighting checks; unambiguous counterfactual semantics; transparent/obscured/opaque balance from actual labels; reviewed item templates |
| Family C: equal volume/energy comparison | Human material/hierarchy, finish and substrate evidence | Norhan's reviewed, versioned, hash-pinned VHC bands/allowed-pairs table; no such table is currently supplied |
| Family D: comparison versus invariance | Stable shared markers, separate indoor/exterior surfaces, material/hierarchy/finish facts and substrate evidence | Approved intrinsic-class mapping and paired rules; moving the observer never changes an intrinsic material class |
| Two-rater agreement | Exact shared layout/build identities, different annotator IDs, no automatic human values, explicit uncertainty, exclusions, field-level disagreements and kappa denominators | Real independent annotation; IDs alone are not proof of independent collection |
| Level 3 later visibility | Every surface and boundary receives 12-frame human visibility labels distinguishing direct view, glass, reflection, occlusion, outside-image and uncertainty | Confirm same-surface identity in all observations; build actual question rounds and horizon support; compute false-occlusion rate later; longer routes require extra judgments |
| Glass/geometry audit | Pane present, phantom geometry, separate leaf, mask/RGB agreement and hand-checkable boxes | Actual G2/G3 counts and gate decisions; machine masks cannot certify pane material or visible door-leaf area |

## Scientific safeguards that should remain in the delivered tool

- Human answers start blank. Machine instance categories, proposed points, depth checks and suggested materials are not a third annotator.
- Not determinable is an explicit answer, not the default for an unanswered field, and not a synonym for no.
- Surface visibility must refer to the intended persistent surface, not any visible fragment of the same broad native object instance.
- A reflected or through-glass sighting prevents an unqualified claim of true out-of-view status. Different visibility labels should not be collapsed silently.
- The existing hierarchy's contested/missing-source fields and material-suggestion provenance remain visible reference metadata. They are not automatically approved Level 2 physics GT.
- Agreeing on a human fact is not equivalent to validating a physical rule. Consensus coverage is not permission to skip reviewed item construction.
- Reference masks, poses, depths, native scene/object metadata and human answers must never be sent as model inputs. Only approved numbered RGB frames and reviewed condition/question text belong in prompts.
- Do not force transparency or cannot-determine quotas during labeling. Measure actual availability after independent annotation and construct a balanced retained benchmark afterward.

## Limits of a collect-once promise

The supplied DOCX references separate Protocol sections 3, 4 and 9 without including them, and does not provide Norhan's per-episode directions or the frozen VHC allowed-pairs table. The site honestly exposes those dependencies. It substantially reduces repeat annotation by sharing one fixed layout and storing per-frame visibility, material/substrate facts, all two-direction/open-sealed exposure cells and audit notes; it cannot guarantee that an unseen protocol or a future longer route requires no additional labels.

The current 12 frames contain six post-crossing frames, so an eight-frame Level 3 horizon after a last sighting near the crossing is not automatically available. This is a frame-budget/round-construction issue, not something an annotator should repair by inventing sightings.

## Independent data checks already performed

All 672 RGB frame appearances match 656 unique original RGB files byte-for-byte. All exported native-instance encodings and boundary masks match the fresh source geometry caches. A separate inverse-camera-matrix check reproduced all 1,112 proposed observations and verified their first-hit instance and depth consistency; all 445 anchor proposals belong to native side regions. These checks establish geometric reproducibility only, not human material identity, photographic pane visibility, exposure, or physics ground truth.

One exterior side has three meaningful distinct instance proposals and one has two. No extra unknown/void surface was invented to reach a target count. The latter remains setup-blocked until the coordinator supplies a legitimate additional surface or excludes the episode.

After the final contract extensions, the data bundle was deterministically rebuilt with unchanged images and geometry. Its final build identity is `086c77833a83310fa34a6d286c4c3d9c5f51bf12231d22f0f0143c9aac717bce`. An independent recomputation reproduced that identity from dataset/catalogue contents, asset hashes and source hashes; all 2,508 asset hashes and 1,812 source hashes matched. The live `makeLayout(dataset)` output validates as a draft across all 56 episodes, includes the canonical conditions, and carries no diagnostic-only observation fields.
