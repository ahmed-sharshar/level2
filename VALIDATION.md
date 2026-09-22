# Direction provenance and timing — 2026-09-22

The direction-version release passed 260 JavaScript checks, 49 Python tests,
and 413 browser checks. The new browser suite exercises published-task changes,
legacy upgrades, explicit redo/history, active timing, ID isolation, conflicts,
two complete 56-scene drafts with mask audits, and storage-exhaustion recovery.
All 2,508 frozen dataset asset hashes still match. Research settings and human
annotation files were not modified.

See `validation/direction_version_release_summary.json` and
[DIRECTION_VERSIONS.md](DIRECTION_VERSIONS.md). Earlier reports below remain
historical delivery evidence, not claims of current research approval.

# Previous delivery validation — 2026-09-21

This is software and data-delivery validation, **not a completed human annotation exercise or model benchmark**.

## Provisional collection-ready release — previous delivery

The current release has 56 scenes with four indoor and four exterior targets
each (448 total), preserving every original 445 target value and adding three
RGB-inspected, mask-backed patches. There are 112 explicit feature-relative
hypothetical direction definitions. All 56 scenes pass structural collection
readiness; all 56 still correctly fail ungranted research approval. Native
category/region conflicts remain documented, not relabelled as human facts.

- **223 JavaScript checks** and **43 Python tests** passed.
- **375 Chromium checks** passed: new collection release/ID/migration (19),
  researcher setup (69), compact workflow (66), opening (53), collection checks
  (79), sun/rain (51), and red points (38). No JavaScript exceptions or unexpected
  failed asset requests were recorded. The final 19-check release test also ran
  after adding cache-versioned HTML script references.
- Every **448/448 anchor** matches its sampled native instance/category metadata;
  the complete **107-entry** hierarchy is retained. All **2,508 frozen data asset
  hashes** match, and the original dataset build identity is unchanged.
- Annotation completion and draft migration work in explicit provisional mode,
  without setting human/research approvals or `benchmark_ready`. Unanimous
  synthetic provisional answers still yield zero eligible benchmark GT fields.
- Different annotator IDs isolate local drafts in the same browser; IDs are not
  passwords. Switching away preserves the previous ID's draft, and foreign-ID
  imports cannot merge votes. No adjudication feature is introduced.
- Changed task inputs get a new task identity. Old browser data remain available,
  migration requires confirmation, original unchanged labels are retained, and
  new/changed targets or scenarios require their own answers.

Current task: `l2tasks-9e0423d9884953639fc227b72bdb38cbb6839cbc891837574e0783cff970c18b`.
Task SHA256: `e4164fe8c9be7db76d9d1bc09623287c066874c7ae4886e8117dc84496b43576`.
See `COLLECTION_RELEASE.md`, `data/provisional_collection_preparation.json`,
`tests/collection_readiness_core.test.js`, `tests/collection_release_browser.py`
and `validation/collection_release_summary.json`. Preparation reruns produce
byte-identical tasks. Earlier reports below are historical release snapshots.

## Passage checks, indoor visibility and independence — current delivery

Four multi-select passage checklists are consistency-only; they never supply GT,
including agreed legacy votes. Each indoor point has one after-crossing image-set
question in Level 2. The six boundary checks and optional detailed L3 visibility
remain. Disputed facts/sets preserve raw votes but exclude dependent items.

- **79 focused Chromium checks passed**: channel and frame choices, exclusive
  Nothing/None/Not sure, unanswered versus empty sets, image preview, locked
  targets, exports/imports/reloads, original-envelope archive, completed legacy
  upgrade, separate profiles/IDs, foreign-file rejection, no adjudication,
  explicit shared-profile security warning, consensus exclusions and non-GT
  checklists, mobile and project-subdirectory hosting.
- **197 JavaScript checks passed**, including 26 new schema/consensus tests and
  two strict multi-select editing tests. **43 Python tests passed**, including
  three legacy-v1 consistency-only policy/report tests.
- **66 compact-workflow and 53 opening browser regressions passed** on the
  updated collector. No browser JS exceptions, unexpected failed HTTP responses
  or external requests were recorded. The local test server may log harmless
  broken pipes when disposable pages close during background mask loads.
- Current collection-path coverage: 9,802 Level 2 fields and 16,822 Level 2 + L3
  fields, each represented exactly once. Includes 224 passage checklists and
  224 indoor visibility sets. All 2,508 frozen asset hashes still match.

The 2026-09-19 `compact_conservation.json` is historical, not a claim that the
current JavaScript is unchanged. Current tests verify the versioned checklist
scope and preservation of all raw historical answers. The published task file,
dataset, catalogue and point coordinates are unchanged.

Evidence: `validation/collection_checks_browser_report.json`,
`tests/collection_checks_core.test.js`, `COLLECTION_CHECKS.md`. Screenshots use
synthetic answers. Authenticated access control and a reviewed complete opening
rule table are **not** implemented; candidate rule outputs remain explicitly
unapproved/non-GT, and separate profiles/devices remain required for independence.

## Sun/rain clarification — earlier same-day delivery

Every point keeps two independent answers in each of four scenarios. Display
labels are Hit directly / Not hit / Not sure; stored yes/no/ND values are unchanged.
Clear-glass and slats/lattice rules appear immediately above the exposure table.
The direction arrow is a reference-feature callout, not a simulated incident ray;
unreviewed directions remain gated and none were invented for production.

- **15 focused schema tests passed**, checking all 56 scenes, 445 points and
  3,560 independent exposure judgments, unchanged values, no shelter-driven
  autofill, preserved unrelated choices and pending-direction safeguards.
- **51 focused Chromium checks passed**, covering separate point/channel/scenario
  choices, adjacent rules, direction wording/escaping, exact arrow endpoints and
  reference-frame binding, point-view return, mobile/subdirectory hosting, all
  64 answers in a synthetic eight-point scene, export/import/reload and offline
  validation. No JavaScript errors, HTTP failures or external requests occurred.
- The full JavaScript regression passes **169 checks** and Python regression
  passes **40 tests**. All 2,508 frozen dataset hashes still match.

See `validation/sunrain_browser_report.json` and `SUN_RAIN.md`. Screenshots and
fixture directions/answers are synthetic tests, not approvals or human ground truth.
No new required annotation fields, task identities or production direction
definitions were added. Existing saved answers remain unchanged.

## Red-point refinement — earlier same-day delivery

All 107 entries from the original hierarchy remain available, searchable by ID,
name, family and visual description; no reference values are converted into human
answers. Slats/lattice is a distinct shelter code; earlier `partial` answers remain
other partial cover. New exports carry the separately sampled native instance /
mpcat40 label beside human answers, with an explicit object-only comparison.

- **38 focused Chromium checks passed**, including all 445 anchors independently
  checked against actual instance-map pixels, moved/new targets, missing masks,
  full-list search, preserved selections/answers, export/import, locked points,
  subdirectory hosting and desktop/mobile layouts. No JavaScript exceptions,
  unexpected failed requests or external requests; intentional mask failure is
  recorded separately. See `validation/redpoint_browser_report.json`.
- **69 researcher-setup Chromium checks passed**, including four-per-side
  enforcement in new drafts and unchanged published tasks/point coordinates.
- **16 focused schema checks passed**, covering legacy compatibility, provenance
  binding, stale audit snapshots, exact object-only comparisons, consensus
  independence and new four-per-side task policy.
- `validation/redpoint_source_audit.json` reproduces all 107 reference entries
  and all 445 anchor pixels with zero mismatches. This is source consistency,
  not human certification of a meaningful surface. **54 scenes have 4+4 points;
  scene 8 has 4+3 and scene 38 has 4+2.** Their published points were not invented
  or replaced; new researcher approval waits for legitimate targets or exclusion.

No new human annotation fields are required. Frozen dataset, catalogue and shared
task package remain unchanged. See `RED_POINTS.md` for the additive export fields.

The current complete regression run passed **154 JavaScript checks**, **40 Python
tests**, and **226 Chromium checks** across red-point (38), researcher setup (69),
compact workflow (66) and opening (53) suites. All **2,508 frozen asset hashes**
still match; `git diff --check` is clean. Browser-test servers can log an expected
broken pipe when a disposable page is closed during background mask loading;
the browser reports contain no unexpected failed HTTP responses or JS errors.

## Five-question opening overview — earlier same-day delivery

The current homepage adds human width category and blockage, groups them with
type/transparency/state, and shows a separately labelled approximate native
mesh-object span. No dataset, catalogue, shared tasks, approvals, prior human
answers, images or route selections were changed.

- **53 focused Chromium checks passed:** five controls, no defaults, exact
  export values, desktop/mobile layout, legacy JSON imports, archived browser
  drafts, open-gap semantics, blocker-note completion, project-subdirectory
  hosting, and missing/wrong-build/wrong-object width fallbacks.
  `validation/boundary_browser_report.json` records no JavaScript errors,
  unexpected failed requests or external requests. The intentional optional
  measurement-file 404 is recorded separately as an expected test case.
- **66 compact-workflow Chromium regression checks passed.**
- **136 JavaScript checks passed**, including 21 new boundary schema/upgrade/
  consensus cases. **40 Python tests passed**, including 13 geometry/provenance
  tests for the deterministic measurement supplement.
- All 56 measurements reproduce from hash-checked native-instance OBB metadata.
  They are mesh-object spans, not measured clear apertures; human categories
  remain blank until explicitly chosen.
- Per-field conservation across all 56 scenes: Level 2 grows from 10,138 to
  **10,250** required fields; Level 2 + Level 3 from 17,158 to **17,270**.
  Exactly two fields per scene were added; no prior fields are missing or
  duplicated. The shared task hash remains unchanged.
- All **2,508 frozen dataset asset hashes** and the recomputed dataset build
  identity still match. The independently versioned width supplement is outside
  that original immutable inventory and is rechecked by the package builder.

See [BOUNDARY_QUESTIONS.md](BOUNDARY_QUESTIONS.md) for the stored fields,
scope-version compatibility, and measurement caveats. Browser screenshots are
synthetic test sessions, not human annotation ground truth.

## Compact complete v2 — 2026-09-19 baseline

The homepage now groups surfaces and scenarios rather than presenting each field as its own screen. The eight-point example has eight point forms, four sun/rain panels retaining all 64 values, and four pathway panels retaining all 16 values. No target, direction, boundary state, required field or completion gate was removed.

- **21 compact-core tests** verify exact field coverage, conditional fields, explicit compound edits, null versus uncertainty, compatibility and identical consensus output before/after grouping. All **115 JavaScript checks** and **27 Python tests** pass across new and preserved schemas.
- `validation/compact_conservation.json` independently verifies every required field exactly once across all 56 scenes, for both L2 and L2+L3. The original schema/validator, task file, dataset, catalogue and frozen contract hashes are unchanged.
- **66 Chromium checks passed on the current `index.html`.** `tests/compact_browser.py` tests the actual grouped controls, custom-name preservation, canonical material selection, all scenario cells, point/image focus, old cursor restoration, no-loss completed-export round-trip, one-missing-answer completion blocking, CLI consensus/reporting, mobile layout, subdirectory hosting, quota failures and stale tabs. No JavaScript exceptions, failed asset requests or external requests occurred. It writes `validation/compact_browser_report.json`; `tests/full_browser.py` remains a compatibility entry for this updated full workflow and writes matching `full_browser_report.json` evidence.
- Current screenshots: `compact-desktop.png`, `compact-mobile.png`, `compact-exposure.png`, `compact-exposure-mobile.png` under `validation/`. They show synthetic test sessions, never human GT.

Run `node tests/compact_core.test.js` and `python tests/compact_browser.py --entry index.html`. This release does not change research setup, later-review tools, or the earlier basic/advanced interfaces. Those tests and the full v2 validator/consensus regression suite remain applicable.

## Complete guided v2 — earlier validation baseline

The original full v2 interface collected Level 2 facts with one question per card; the compact layout above supersedes that presentation only. Researcher preparation (`setup.html`) and later benchmark reviews (`review.html`) remain separate. Published tasks remain explicitly unreviewed, as requested; all test approvals/answers are temporary synthetic fixtures, never production labels.

- **32 full guided Chromium checks** cover all 56 scenes/12 frames, pending-setting protection, explicit hierarchy selection, saving/resume, desktop/mobile display, reviewed directional scenarios, import preview, complete export, CLI validation → consensus → Markdown/CSV report, reopening, optional L3 scope and project-subdirectory hosting. Evidence: `validation/full_browser_report.json` and `full-desktop.png` / `full-mobile.png`.
- Research setup has **60 Chromium checks** including point/observation/direction/box edits, audit CSVs, invalidation, draft resume, publication of a temporary reviewed fixture, storage failures/conflicts and unchanged production task-file hash. Additional gate checks distinguish selected/partial/complete glass reviews, uncertainty, evidence requirements and the 70% threshold. Evidence: `validation/setup_browser_report.json`.
- **34 later-review Chromium checks** exercise matcher extraction, baseline isolation, error codes, exports/imports, malformed/contaminated queue rejection, numbered-only markers, dataset build binding, XSS escaping, quota failures and saved/unsaved conflict recovery. Evidence: `validation/review_browser_report.json`.
- **38 full-schema tests** cover required L2 versus optional L3, unapproved scenario gates, explicit ND, strict input validation, target-safe migration and two-rater consensus. **6 Python integration tests** verify the v2 CLI/report path.
- **12 review-core tests** cover exact unordered sets, explicit empty sets, ≥100/≥98% gate denominators, ND, baseline-answer isolation, error quotas, unsafe inputs, task/build identity and extra-field rejection. Together with the 23 advanced, 21 guided and 38 full tests, there are 94 JavaScript checks. All 27 Python validator/consensus/report tests pass.

No software test certifies a scene's physical correctness. No human judgment, benchmark question set, model score or actual inter-rater agreement was generated by these tests.

Re-run with Node and Python/Playwright available:

```bash
node --test tests/core.test.js tests/guided_core.test.js tests/full_core.test.js tests/review_core.test.js tests/compact_core.test.js
python -m unittest discover -s tests -p '*test*.py' -v
python tests/full_browser.py
python tests/setup_browser.py
python tests/review_browser.py
python tests/guided_browser.py --entry guided.html
python tests/browser_integration.py
```

## Earlier basic interface — retained at guided.html

The earlier basic-only page is preserved at `guided.html`; the original detailed interface lives at `advanced.html`. Their files, draft namespaces and scientific validation rules remain intact. The following records describe the earlier basic-interface delivery, not the current homepage.

- **41 Chromium integration checks passed** for the simple flow: no prerequisite import, all 56 scenes and 12 frames, single-point labeling, object-scoped material suggestions, custom text, add/move/skip, partial save, reload, malformed/foreign imports, quota failures, conflicting tabs and mobile layout.
- **21 guided-schema unit tests passed**. Four additional CLI smoke checks exercised valid, wrong-enum, duplicate-key and malformed JSON cases.
- A separate root-page smoke test confirmed that `/` now opens simple annotation, and `advanced.html` still opens the original research tool.
- The original detailed interface's **45 browser checks passed again** after moving its entry page. Dataset identity and all 2,508 asset hashes were rechecked unchanged.
- No browser JavaScript errors, broken HTTP assets or external requests appeared in the completed guided test run.

Reports and screenshots: `validation/guided_browser_report.json`, `validation/guided-desktop.png`, `validation/guided-point-desktop.png`, `validation/guided-mobile.png`. Screenshots show disposable test sessions, not real annotation results.

Re-run the earlier basic browser suite with `python tests/guided_browser.py --entry guided.html` in an environment with Playwright/Chromium, and run `node tests/guided_core.test.js` for the data model. Validate downloaded simple drafts with `python scripts/validate_guided.py /path/to/draft.json`. A valid first-pass draft is not a completed protocol annotation.

## Original detailed interface checks

| Suite | Passed |
|---|---:|
| JavaScript schema, identity, completeness and malformed-input checks | 23 |
| Python consensus, disagreement and scientific-gating tests | 10 |
| Complete export → consensus → Markdown/CSV agreement report tests | 7 |
| Real Chromium desktop/mobile integration checks | 45 |
| Total | **85** |

JavaScript syntax checks and Python compilation also passed. Chromium reported no page exceptions, broken HTTP responses or external requests in the normal-site workflow. A separate intentional failed-image test verifies that geometry cannot be placed on an undecodable frame. Browser tests use disposable profiles and synthetic labels; they do not write real annotation answers into the website.

The browser suite opens all 56 episodes, decodes all 672 frame appearances at their original dimensions, and tests point placement/deletion, direction anchors, boundary boxes, freezing, independent blank answers, conditional substrate fields, explicit uncertainty, completion locks, draft/final export, exact offline validation, resume, malformed/foreign imports, corrupt-storage recovery, two-tab conflicts, quota failure and project-subdirectory hosting. Screenshots are synthetic test sessions, not annotated GT.

## Dataset integrity

- 56 distinct boundary assemblies across 29 buildings: 52 outdoor and 4 semi-outdoor candidates.
- 12 RGB frames per episode: 672 appearances, 656 unique original RGB files.
- All 2,508 inventory asset hashes and 1,812 original-source hashes matched.
- The shared dataset/catalogue build identity was independently recomputed.
- All 2,016 RGB/instance-map/boundary-mask frame references and 566 annotation-aid references resolved.
- 445 proposed surface anchors and 1,112 proposed cross-frame observations are retained as coordinator aids.
- Builder checks reproduced instance encoding, mask pixel counts, side membership and point depth/ID consistency. The standalone checker verifies the bytes and references; it does not rerun raycasting.
- No symlinks or credential-pattern matches were found in the packaging audit. The old annotation site's Git status remained clean.

Build identity: `086c77833a83310fa34a6d286c4c3d9c5f51bf12231d22f0f0143c9aac717bce`.

Evidence: `data/build_validation.json`, `validation/bundle_check.json`, `validation/browser_test_report.json`, and `validation/scientific_review.md`.

The full-workflow release rechecked the same 2,508 asset hashes and 1,812 source hashes with no errors or warnings: `validation/full_bundle_check.json`. The dataset build is unchanged; shared collection tasks are a separate, explicitly unreviewed versioned package.

## What still needs human/research approval

All 56 episodes require coordinator setup approval before final independent rating. The previous 10 visual-review flags remain visible. Under the current four-per-side policy, scene 8 needs one more legitimate exterior target and scene 38 needs two, or a reasoned exclusion if suitable targets cannot be found. Never invent a point to satisfy the count.

Approve the two direction statements and boundary interpretation; confirm the separately referenced full Protocol if supplied later; provide the frozen VHC allowed-pairs table before Family C. Actual independent judgments, agreement values, benchmark questions and model scores have **not** been produced by these synthetic tests.

Reproduce the checks with the commands in `README.md`. To verify an unpacked distribution without access to the workstation's source files:

```bash
python3 scripts/verify_bundle.py
```

On the original workstation, optionally add `--check-sources`. Both commands are read-only unless an explicit `--out` path is supplied.
