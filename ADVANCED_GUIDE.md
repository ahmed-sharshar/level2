# BLOCKMIND Level 2 — historical advanced-interface guide

This document preserves the earlier v1 workflow. The current homepage is the complete guided v2 collector; use [README.md](README.md) and [RESEARCH_SETUP.md](RESEARCH_SETUP.md) for its instructions. References below to the earlier "simple" default are historical, not the current entry page.

A separate static annotation website for all **56 reference / 100-pixel episodes**: 52 outdoor, 4 semi-outdoor, 29 buildings, 12 original RGB frames per episode. The earlier `annotation-site` and existing human annotations are untouched.

## The default page is now simple

Enter your name and start. **No role selection, imported layout, or setup checklist is required.**

1. **Watch:** play the scene and answer a few plain-language questions.
2. **Label points:** one highlighted point at a time; select its object, material and reflectance. The photo moves to that point automatically.
3. **Door/opening:** answer the short questions about the crossed door or opening.
4. **Save:** download your work and continue to another scene. You can save unfinished work at any time.

“Not sure” is a deliberate answer; skipping leaves fields blank. Materials are suggestions, not automatic answers. Drafts save in your browser; download JSON backups regularly.

The earlier detailed interface is preserved at **`advanced.html`**, behind the small Research tools link. Its existing drafts and validation rules are unchanged. You do not need to use it to start basic annotation. The detailed instructions below apply to that research interface, not the simple opening page.

Simple-mode exports clearly identify themselves as **provisional basic annotations**, not completed benchmark ground truth. Directional physics questions, detailed visibility and shared-point certification are not silently filled in or waived. See [GUIDED_MODE.md](GUIDED_MODE.md) for the separation.

## Start

```bash
cd /data/Ahmed/mit/annotation-site-level2
/home/ahmed/miniconda3/envs/scannetpp/bin/python -m http.server 8081 --bind 127.0.0.1
```

Open **http://localhost:8081**. Serve over HTTP/HTTPS rather than double-clicking HTML. No model API, account, subscription, package installation, or external CDN is used by the page.

For a remote workstation, forward the port through SSH rather than exposing private indoor imagery to the internet:

```bash
ssh -L 8081:127.0.0.1:8081 ahmed@YOUR_WORKSTATION
```

GitHub Pages or another static host can serve this folder with relative paths. Check permission to share the underlying Matterport imagery before making it public. Hosting does not create a shared annotation database or authentication.

## Research tools only: the detailed workflow

### 1. Coordinator preparation

1. Start coordinator mode and enter a coordinator ID.
2. Review each episode's 12 frames and existing quality flags. Frame 6→7 is the frozen proposed crossing; camera side and camera viewing direction are different things.
3. Check, move, add, or remove the proposed red surface points until there are **3–5 distinct intended surfaces per side**. A native instance may cover mixed materials: put the point on the exact visible surface, not merely somewhere inside the object box.
4. Check corresponding point locations across frames. Projected positions are aids, not proof of visibility or material identity.
5. Define exactly **two direction prompts**, each relative to a visible feature, with a reference-frame anchor. Use the agreed wording from Norhan. A direction is a stated hypothetical condition, not an estimate of actual sunlight or weather in the capture.
6. Check or hand-draw the designated boundary box in at least two pre-crossing frames. Keep one boundary object identity for the episode.
7. Explicitly mark setup reviewed. If an episode cannot support the required markers/directions/boundary evidence, exclude it with a reason instead of forcing labels.
8. Freeze and export the shared layout. Give the **same unchanged layout file** to both annotators. The layout contains geometry and task definitions, not anyone's material/reachability answers.

The initial mesh proposals are **not an already human-approved layout**. Some episodes need manual repair; all 56 remain available to inspect. Changing any frozen task definition creates a different layout identity, and its annotations cannot be mixed with the previous layout.

### 2. Two independent annotators

1. Use separate annotator IDs and preferably separate browser profiles/computers.
2. Import the same frozen layout and start annotation.
3. Work through scene/boundary facts, marked surfaces, pathways/reachability, and frame visibility. Material and surface facts are entered once per persistent marker, not re-entered in every image.
4. Keep photographed boundary state separate from the hypothetical **open** and **sealed** conditions.
5. Use **Not determinable** when evidence is insufficient. Blank means unanswered; it is not silently interpreted as uncertainty. Explain uncertainty in the episode notes.
6. Mark an episode complete only when its checklist passes. Completed episodes are locked until explicitly reopened.
7. Export a draft regularly. Final export requires all included episodes complete or explicitly excluded with reasons.

One annotator must not inspect or import the other's answers. The page does not adjudicate disagreements. Local separation is a workflow safeguard, not access control against someone inspecting browser storage.

### 3. Validate and compare exports

The scripts under `scripts/` validate build/layout provenance, coordinates, allowed values and completeness, then compare two distinct annotators on the same frozen layout:

```bash
python3 scripts/validate_export.py /path/to/rater_01.json --require-complete
python3 scripts/validate_export.py /path/to/rater_02.json --require-complete
python3 scripts/consensus.py /path/to/rater_01.json /path/to/rater_02.json --out /path/to/consensus.json
python3 scripts/report_agreement.py /path/to/consensus.json --out /path/to/kappa_report.md --csv /path/to/kappa_table.csv
```

Export validation uses the exact same `core.js` as the browser. It requires Node on PATH, `--node /path/to/node`, or the existing Playwright Node runtime in the scannetpp environment. The website itself requires no Node runtime. Output reports refuse to overwrite an existing destination.

The agreement output retains raw annotations, exact agreements, explicit agreed uncertainty, unanswered fields, disagreements, exclusions and per-attribute Cohen's kappa denominators. Disagreements are **not overwritten or majority-voted**. An undefined kappa is reported as undefined, not as perfect agreement.

A consensus annotation file is an input to later reviewed question rules; it is not automatically a finished set of benchmark MCQs. Family C remains blocked until the approved frozen VHC/allowed-pairs file exists.

## What is captured

- Scene validity and outdoor/semi-outdoor enclosure/shelter.
- One boundary object's identity, kind, observed state, glazing/transparency, material/hierarchy, visible reflectance and air-gap evidence.
- Glass/mesh quality: pane present, phantom geometry, separate leaf, and RGB/mask consistency.
- Light, air and rain pathways for each direction under both open/sealed conditions.
- Persistent surface points: exact coordinates, native instance/category hints, human visible object/material, hierarchy match, finish, separate underlying substrate material/hierarchy when known, visible reflectance and shelter.
- Direct-sun/rain reachability per surface, direction and hypothetical boundary condition.
- Per-frame boundary and surface visibility, distinguishing direct view, view through glass, reflection, occlusion, out-of-frame and uncertainty. Boundary identity/box correctness are judged separately.
- Notes, exclusions, task identity, original asset hashes, layout identity and annotation provenance.

See [ANNOTATION_GUIDE.md](ANNOTATION_GUIDE.md) and [PROPOSAL_COVERAGE.md](PROPOSAL_COVERAGE.md).

## Scientific safeguards and missing dependencies

- The supplied workplan refers to Protocol §3/§4/§9, but those complete sections were not in the supplied DOCX. This is an explicit, versioned implementation of the available workplan—not a claim to reproduce an unseen schema verbatim.
- Later approved route settings override the workplan's historical MST description: these sequences use reciprocal native R2R-style navigation, step ≤3 m, boundary match ≤0.75 m, and ≥100 first-hit boundary pixels at 160×128 in at least two pre-crossing frames.
- The existing hierarchy is a **reference**, not proof that Norhan has approved the Level 2 thermal pair table. Its class boundaries and pending/contested source flags are preserved. No thermal/porosity answer is inferred from an RGB image or recorded as a human measurement.
- Geometry suggestions are not rain/sun GT. The proposal's conditional T5b reachability proposer is disabled until its glass-audit gate and proposer protocol are approved.
- Visual reflectance means visible reflective appearance; it is not solar reflectance or glazing transmission.
- Human visibility can later support Level 3, but 12-frame routes do not automatically provide every requested horizon. Actual longer routes or changed frame selections may require additional visibility judgments.
- Additional markers and optional notes help future reuse, but no interface can guarantee that every future research question will require no further annotation.

## Saving and recovery

Answers stay in browser storage, separated by site path, dataset build, layout and annotator. Browser storage can be cleared, fill up or become unavailable; it is not a permanent backup. Export draft JSON regularly and keep an external copy.

Do not edit the same annotator/layout in multiple tabs. Revision conflicts should lock the stale editor while allowing recovery export. Import validation happens before replacing live work; explicit confirmation is required before replacing an existing draft. Nothing is uploaded by this site.

## Files

- `index.html`, `styles.css`, `app.js`, `core.js`: static interface and shared validation logic.
- `dataset.json`: immutable episode/frame/proposal manifest.
- `catalogue.json`: object vocabulary, material reference hierarchy and optional material suggestions.
- `data/`: original RGB assets and clearly separated annotation-only machine aids.
- `scripts/`: data builder, export validation, agreement/consensus helpers.
- `tests/`: synthetic fixtures/tests; never real human ground truth.
- `data/build_validation.json`, `data/asset_inventory.json`, and `validation/`: build, scientific review, and browser-test evidence.

## Tests and verification

The page has no installation dependencies. Development tests use Node plus Python; the browser test also requires Playwright and its Chromium browser. In the existing workstation environment:

```bash
cd /data/Ahmed/mit/annotation-site-level2
/home/ahmed/miniconda3/envs/scannetpp/lib/python3.10/site-packages/playwright/driver/node tests/core.test.js
/home/ahmed/miniconda3/envs/scannetpp/bin/python tests/core_consensus_test.py
/home/ahmed/miniconda3/envs/scannetpp/bin/python tests/core_report_test.py
/home/ahmed/miniconda3/envs/scannetpp/bin/python tests/browser_integration.py
```

All tests use **synthetic answers**, not real human judgments. The browser test starts and stops its own local server, decodes every RGB frame, and exercises point/box editing, uncertainty, completion, exports, reload, conflicting tabs, corrupt storage, quota failure, mobile layout and project-subdirectory hosting. Test screenshots under `validation/` show synthetic test sessions; their displayed answers, directions, and exclusions are not benchmark labels.

The builder's validation covers asset identity, native instance-map decoding, boundary masks and geometric point projections. This verifies the delivery, not the scientific truth of human labels that have not yet been collected. Read `validation/scientific_review.md` for that distinction and the remaining proposal dependencies.

The delivered build passed **85 automated checks**; see [VALIDATION.md](VALIDATION.md). To check a copied/unzipped bundle using only Python's standard library, run `python3 scripts/verify_bundle.py`. Add `--check-sources` only on the original workstation. To create a clean distribution after testing, run `python3 scripts/package_site.py --out /path/outside/site/new-website.zip`; the packager refuses overwrites, excludes caches/private answer files, verifies dataset hashes and checks ZIP CRCs.

Only numbered RGB frames and separately reviewed question text should reach a tested model. Do not send this website's dataset manifest, house IDs, material choices, region metadata, depth, masks, quality reports or human answers as part of the model prompt.
