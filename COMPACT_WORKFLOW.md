# Compact collection without dropping benchmark information

This revision changes the presentation and repeated data entry, not the annotation contract or research scope. The existing `blockmind_l2_annotations_v2` export remains authoritative. Dataset assets, shared task identities, all selected points, both directions and open/sealed conditions remain unchanged.

## What annotators see

| Area | Earlier interface, for an eight-point scene | Compact interface |
|---|---|---|
| Red points | 80 separate question screens, plus conditional substrate questions | Eight point forms, one per physical target |
| Sun and rain | 64 separate question screens | Four direction/condition scenarios, with sunlight and rain side by side for each point |
| Through the opening | 16 separate question screens | Four direction/condition forms, each with the four pathway channels |

Numbers of point forms follow the actual shared targets; the site does not delete points to reach a smaller count. Scenario rows provide a way to show the relevant point in its anchor image. One photograph need not contain every point. The frame sequence and direction-reference controls remain available.

This is a reduction in navigation and duplicated entry, not a claim that 64 physical judgments have become four independent labels. All 64 sun/rain values remain available for later benchmark construction. Unchecked or unselected values are never interpreted as No.

## Safe shortcuts

- Selecting an installed-material reference can record its canonical name and hierarchy ID together, because the annotator explicitly chooses that named entry. Merely typing a material name does not assign its class. Custom descriptions, Other and Not sure remain supported; earlier custom values are not silently rewritten on load.
- Related point-validity/correspondence checks can be confirmed together only by an explicit affirmative action describing both checks. Problems and uncertainty can still be recorded separately.
- Shelter and obstruction controls appear together. The two stored fields remain distinct; neither is guessed from the material.
- Substrate details appear only when the annotator explicitly says the underlying material can be identified. Finish, substrate uncertainty and existing values remain preserved.

## Preservation guarantees

`compact-core.js` groups the question definitions from `full-core.js`; it does not create a replacement ground-truth schema. Every required question path occurs exactly once in the grouped presentation. Dynamic substrate questions and optional L3 visibility remain governed by the original definitions.

Exports still pass the same validator, completeness checks and two-rater consensus. Finishing a panel requires its applicable fields, not just visiting it. A remaining blank still blocks completion; Not sure is explicit and requires the existing scene note. Pending research directions still block physics questions. Completed records remain locked until reopened.

Both raters retain independent answers. No physical labels are derived from geometry, inferred from unchecked boxes, copied between points, or transferred from open to sealed automatically. Researcher setup, audits and later benchmark review tools are unchanged.

This update intentionally does not reduce target counts, remove reflectance, remove a direction, or prune counterfactuals. Those changes could remove future comparisons, which the user asked us to preserve. Full Protocol wording, direction approval and the frozen VHC/allowed-pairs table remain research dependencies rather than software-generated facts.
