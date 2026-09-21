# Opening checks, indoor visibility and independent annotation

## Through the opening: a check, never an answer key

Each of the four direction × open/sealed scenarios has one checklist:
**Sunlight / Rain / Air / Visible light / Nothing / Not sure**. Multiple channels
may be selected. Nothing and Not sure are exclusive; clearing every checkbox
leaves the question unanswered. Sunlight denotes direct sunlight; visible light
includes diffuse daylight. The channels are not mutually exclusive.

New exports have `collection_checks_version: 1`. Values live in
`episodes[i].checks.opening_passage.d1.open` (and the other three scenarios).
The canonical channel order is `sunlight`, `rain`, `air`, `visible_light`.
Nothing is `["none"]`, uncertainty is `["not_determinable"]`, and unanswered
is `null`. Checked subsets are complete human selections, not machine predictions.

Both new checklists and older `answers.pathways` votes are **consistency-only**
in consensus, even when both people agree. Old raw votes remain in the export;
they are not silently converted into new checklists or benchmark answers.

Benchmark passage answers must come from independently agreed opening facts
and a separately reviewed, versioned rule. The consensus output now separates
those facts and unapproved candidate inferences under
`family_annotation_coverage.B.rule_derivation`. In particular:

- Candidate transmission is conditional on a directed path reaching the opening,
  not a claim about today's weather or which surface gets hit.
- Clear, opaque and fully open/sealed candidates state their source dependencies.
  The sealed condition is the explicit tightly sealed counterfactual, not a claim
  that every photographed closed door is airtight.
- Mixed obscured-pane types, unknown glazing or blockers are not forced into a
  made-up light-transmission answer. Disputed source facts remain unavailable.
- All rule candidates have `rule_status: "pending_review"`,
  `eligible_known_gt: false`, and `drop_item: true`. **The full rule table has not
  been supplied/approved; this update does not produce a final answer key.**
- A disputed checklist or a contradiction with a determinate rule candidate
  flags that scenario; it never replaces either person's independent response.

The same consistency-only exclusion is applied to the legacy-v1 Python consensus
branch. Upgrade older exports to the current collector before completing these
new checks; neither agreeing legacy votes nor an old readiness flag supplies GT.

## Visibility of each indoor point

The existing six door checks remain. Each indoor point now also has **one**
question: "In which images after the crossing can you still see this surface?"
Choose any of images **7–12**, or exclusive **None / Not sure**. Image-preview
buttons do not select answers; Show point returns to the original marked patch.

Count the same physical surface seen directly or through glass. A reflection-only
view is not a direct sighting. No projected dot or mask is used to decide visibility,
and missing projections do not mean that a surface is invisible. If you cannot
decide the set, choose Not sure. Full 12-frame visibility classification remains
available in optional Level 2 + Level 3 scope.

Values are saved at `checks.indoor_visibility.I1` (one entry per indoor marker),
using canonical frame IDs such as `["f07","f09"]`, `["none"]`, or
`["not_determinable"]`. There are no exterior-marker questions in this group.
Across the frozen 56-scene bundle there are **224 opening checklists and 224
indoor visibility questions**. The current grouped UI covers all 9,802 required
Level 2 paths (16,822 for Level 2 + Level 3), with no missing/duplicate paths.

## No adjudication; drop disagreements

Consensus retains both raw responses for provenance, but a disputed field has
`value: null` and `eligible_known_gt: false`. Set equality is exact after canonical
ordering; no majority vote, reconciliation or "resolve disagreement" operation
exists. A disputed visibility set drops that point's visibility item. A disputed
opening fact/check blocks the scenarios/items depending on it, not unrelated
agreed material labels. Agreed None means an empty visible set; uncertainty is
never treated as None. Item generators must use the eligible consensus records,
not the individual raw responses under `rater_notes`.

There is still no MCQ generator: reported dropped-field counts are not a measured
count of discarded benchmark questions. Consistency-only fields are counted
separately in the agreement report so their intentional exclusion is explicit.

## Draft isolation: what the static site does and does not guarantee

Drafts stay in browser local storage. They are namespaced by site, dataset, task
and annotator ID. No answer is uploaded, shared between devices, or shown in a
collaborative answer panel. Imports reject a different annotator ID. The later
`review.html` tool audits model outputs; it does not adjudicate human disagreements.

**Use a different unique annotator ID for each person.** Separate browser profiles
are not required by this workflow: switching IDs saves and resumes separate local
drafts. IDs are self-entered labels, not authenticated accounts. Someone entering
another person's ID in the same browser can access that local draft, so annotators
must use only their own ID. Return exports privately to the researcher; do not
exchange them between annotators or commit them to the repository. Enforced
multi-user access control is not implemented or implied here.

## Existing annotations and upgrades

Older exports still validate under their recorded scope. The homepage safely
upgrades them with blank new checklists, preserving every previous answer and raw
pathway vote. Previous completion is reopened to collect the new facts. Browser
upgrades archive the original envelope before replacement; imports show a preview.
Source hashes/statuses are retained in `migration_log`. No mask, earlier pathway
vote or optional Level 3 visibility field is silently converted into a new answer.

Both annotators must finish the same scope and shared task version. Mixed-scope
consensus is rejected. The collection-readiness revision preserves dataset assets
and existing point coordinates, adds three new exterior targets, and versions
the shared provisional directions. See `COLLECTION_RELEASE.md`. A completed
provisional annotation is valid collection data, not approved benchmark GT.
