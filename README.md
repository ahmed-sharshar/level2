# level2

BLOCKMIND — compact, complete scene annotation.

All 56 candidate scenes, with the same 12 RGB frames per scene. The homepage groups related answers into one form per point and four sun/rain scenarios, saving progress locally. It retains the full Level 2 facts without making every stored field a separate question screen.

## Run

```bash
cd /data/Ahmed/mit/annotation-site-level2
python3 -m http.server 8081 --bind 127.0.0.1
```

Open **http://localhost:8081**. If the project is on a remote workstation, first forward the port from your computer:

```bash
ssh -L 8081:127.0.0.1:8081 ahmed@YOUR_WORKSTATION
```

Serve the whole folder. Project-subdirectory hosting is supported. Check permission to distribute Matterport imagery before public hosting; this static site has no authentication.

## For annotators

1. Enter your name and click **Start annotating**. Work independently.
2. Play the scene and check the scene/opening questions.
3. Complete one compact form per red point. Choosing an installed-material entry can provide its name and class together. Keep visible finish separate from any known underlying material.
4. In each of four sun/rain scenarios, show each point as needed and record sunlight/rain side by side. Boundary pathways are also grouped by scenario. Choose **Not sure** when evidence is insufficient; unselected cells stay unanswered.
5. Use **Review** to see what remains. **Save draft** works anytime; **Finish this scene** checks completeness. Download backups regularly.

**Skip** leaves a question unanswered. Shared points cannot be moved by raters; flag an incorrect target instead. Level 2 requires two pre-crossing boundary sightings. Optional Level 2 + Level 3 adds the full frame-by-frame visibility audit.

**Opening** now groups five quick checks: type, width category, transparency,
blockers, and observed open/closed state. A mesh-derived object span is shown
as an approximate aid, not a certified clear-opening width; the annotator chooses
the category. Only width category and blockage are new answers. Earlier answers
are preserved when upgrading; see [BOUNDARY_QUESTIONS.md](BOUNDARY_QUESTIONS.md).

**Red points:** reference-material pickers now search all **107** hierarchy entries
by name, family, ID or appearance. Exports pair the actual anchor-mask mpcat40
label with your separate object/material choices; machine labels never fill your
answers. Shelter distinguishes solid roof, slats/lattice, open sky and other partial
cover. Points stay locked for annotators. New researcher preparation requires four
per side; scenes 8 and 38 still need legitimate exterior targets reviewed, without
altering existing points or answers. See [RED_POINTS.md](RED_POINTS.md).

**Sun & rain:** each point has separate **Hit directly / Not hit / Not sure**
choices for sunlight and rain in every scenario. Glass and slats/lattice rules
sit above the table. Reviewed feature-relative direction words and an image
reference arrow help locate the incoming side; the arrow is not a simulated
travel vector. Existing answers are preserved. Real directions still need
researcher preparation; see [SUN_RAIN.md](SUN_RAIN.md).

**Through the opening** now uses four multi-select checklists, saved only as
consistency checks—not GT. **Visibility** keeps the door checks and adds one
images 7–12 checklist per indoor point. Old answers remain preserved. See
[COLLECTION_CHECKS.md](COLLECTION_CHECKS.md) for fields, upgrades and rule status.

Annotate independently in **separate browser profiles or devices**. Drafts are
local, but IDs are not passwords: a shared browser profile is not secure account
isolation. There is no adjudication feature; disagreements exclude dependent
items. The full opening-rule table still needs review before generating GT.

For an eight-point scene, the old 80 red-point question screens are now eight point forms; the 64 sun/rain question screens are four scenario panels. The underlying facts and all existing targets remain—not automatically filled or dropped. See [COMPACT_WORKFLOW.md](COMPACT_WORKFLOW.md).

Research settings ship explicitly pending. Basic facts can be collected now; directional questions and final completion unlock after the researcher publishes reviewed shared tasks. Missing approval is never treated as ground truth.

## Prepare once, separately

**Researcher setup** (`setup.html`) prepares shared points, directions and boxes for both raters and records glass/trajectory audits. See [RESEARCH_SETUP.md](RESEARCH_SETUP.md).

**Later benchmark review** (`review.html`) covers the 100-output extraction audit, building-scientist baseline and error coding once actual items/model outputs exist. It does not invent questions or call models. See [RESEARCH_REVIEW.md](RESEARCH_REVIEW.md).

## Earlier annotations are preserved

Use **More → Restore / update my JSON** with your own earlier simple/advanced export. You see a migration preview first. Only matching physical targets retain their labels; changed targets/directions require new answers. Keep original exports. Earlier interfaces remain at `guided.html` and `advanced.html`, with their storage untouched.

## Validate and compare independent exports

```bash
python3 scripts/validate_export.py /path/to/rater-a.json --require-complete
python3 scripts/consensus.py /path/to/rater-a.json /path/to/rater-b.json --out /path/to/consensus.json
python3 scripts/report_agreement.py /path/to/consensus.json --out /path/to/agreement.md --csv /path/to/agreement.csv
python3 scripts/verify_bundle.py
```

Validation/consensus require Node on PATH, `--node /path/to/node`, or the installed Playwright Node runtime. Both raters must use identical shared tasks and scope. Disagreements are retained and dropped from known GT, never automatically adjudicated. Completing annotation does **not** produce benchmark MCQ ground truth.

Coverage: [PROPOSAL_COVERAGE.md](PROPOSAL_COVERAGE.md). Tests: [VALIDATION.md](VALIDATION.md). Data contract: [FULL_WORKFLOW.md](FULL_WORKFLOW.md). No answers are uploaded; no model API is called.
