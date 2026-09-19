# Workplan coverage and boundaries

Source: `/data/Ahmed/mit/BLOCKMIND_Level2_Workplan_Sharshar.docx`.

The default interface is the **compact complete v2 collector**: one form per point and grouped direction/condition scenarios, preserving every required field and all shared targets. See `COMPACT_WORKFLOW.md` for the UI-to-export conservation rules. Shared researcher preparation is separate at `setup.html`; later model-output/human-baseline review is at `review.html`. Earlier v1 interfaces remain intact. The user explicitly elected to build now and review the research settings separately; all shipped approvals remain pending.

| Requirement | Implementation / stored evidence | What is not claimed |
|---|---|---|
| T5: frame walkthrough, 3–5 markers per side | Frozen 12-frame sequence; shared coordinator layout; persistent IDs; per-frame point observations | Mesh-selected points are not already human approved |
| T5: boundary identity, transparency/state/shelter | Independent boundary and scene fields with explicit uncertainty; designated ID and hand-editable boxes | Native door labels alone do not establish correct physical identity |
| T5: mpcat40→hierarchy entry | Geometry category hints and separately selected human material/hierarchy | No automatic material GT from category |
| T5: two feature-relative directions | Two shared text prompts, each with reference-frame point; frozen in layout identity | Norhan's wording was not supplied and is not silently invented |
| T5: directional rain/sun reachability | Per-marker × direction × hypothetical open/sealed condition, each sun/rain separate | No quantitative irradiance, airflow, temperature or simulation |
| Two independent annotators | Separate local drafts; same frozen layout identity; no answer sharing in UI; exports record annotator | Static hosting is not authentication or a central collaborative database |
| Mandatory uncertainty | Every categorical/free-fact field supports Not determinable; null remains unanswered | Unknown does not mean no/false |
| T2 glass audit / T4 walkthroughs | Separate researcher pane/phantom/leaf audit with evidence frames, ten-trajectory review, counts and CSV exports | Inspect actual mesh evidence; RGB alone cannot certify pane triangulation; no audits are prefilled |
| T3 missing boxes | Researcher-editable shared boundary boxes; independent human box/object checks | Existing masks/replacement boxes do not establish external dataset coverage or licensing |
| Conditional T5b proposer | Mesh geometry/point suggestions clearly labelled, human answers start empty | Rain/sun auto-prefill is disabled; no certified reachability proposer supplied |
| Family A | Human surface exposure/reachability, shelter, materials and shared directions | Exact-set MCQs/chance values require later reviewed item rules |
| Family B | Transparency, observed state, open/sealed directional light/air/rain facts | Clear/obscured/opaque quotas are not fabricated from unannotated scenes |
| Family C | Material/hierarchy/finish/substrate facts retained | Family C disabled without approved frozen VHC and allowed material pairs; hierarchy alone is insufficient |
| Family D | Stable markers, cross-boundary materials and installed-surface descriptions | Property-class comparison requires an approved class mapping; moving observers does not create new intrinsic labels |
| T6 agreement / dropped facts | Strict export validation and exact two-rater consensus; per-attribute kappa/counts; disagreement retention | No adjudication; no forced agreement; not a finished scored benchmark |
| T14 later out-of-view audit | Optional Level 2 + Level 3 collection adds boundary/per-marker 12-frame visibility; glass/reflection/occlusion distinction | Full visibility is not required to finish ordinary L2; this does not guarantee every L3 horizon or certify the stored full route |
| T8 answer-matcher validation | Separate queue for hand-labeling actual model selections; exact-set/status match report and ≥100 usable/≥98% gate | No actual outputs have been reviewed; missing B/C option wording is not invented |
| Human building-scientist baseline | Separate baseline queue with supplied model-visible RGB and numbered markers, rejecting model-answer/GT fields | Does not recruit experts, generate benchmark items or score without separate frozen GT |
| T12 error analysis | Primary prompt/perception/reasoning/physics-application codes; counts and ≥30 targets by supplied family/model | Researcher must supply actual wrong outputs; no absent model/family coverage is assumed |
| Model input isolation | Clean numbered RGB preview; raw manifest/aids/answers remain annotation-only | Do not feed house IDs, region/material labels, depth or masks to models |
| Current route decisions | Reference geometry: native reciprocal navigation, ≤3m, ≤0.75m, ≥100px at160×128; same12 frames | Historical workplan MST wording is superseded; no new route selection performed |

## Dependencies still needing a research decision

1. Approve the exact two directional condition texts and interpretation of open/sealed closures per episode before freezing a layout.
2. Review the actual full Protocol §3/§4/§9 if it differs from the workplan summary; these separately referenced sections were not included in the supplied DOCX.
3. Supply Norhan's frozen VHC/allowed-pairs table and reviewed physical rule templates before emitting Family C or claiming final A–D item GT.
4. Use completed independent labels to determine transparency balance, cannot-determine availability and inter-rater targets. Do not bias annotation to manufacture quotas.
5. Resolve or exclude ambiguous boundaries/markers. The source pack's numerical pass is not a certificate of pixel-perfect masks or a guarantee that canonical views visually communicate exposure.

MCQ generation, model execution, statistical CIs, leakage experiments and capability cards remain downstream work. The manual review tools now exist for later matcher validation, expert baseline and error coding; no actual reviews, human labels or scores were produced by software tests. This delivery is the annotation workflow and validation support, not completed benchmark experiments.
