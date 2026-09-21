# Prepare the shared tasks once

Annotators use the homepage. This page is only for the researcher preparing consistent targets and questions for both independent raters.

1. Open `setup.html`, enter your name and choose a scene.
2. **Surface points:** review exactly **four real surfaces per side**. Existing mask-derived proposals are candidates, not approved labels. Move/delete/replace them as needed; adding a fifth is blocked. Add cross-frame observations only for the same physical patch. Missing projections do not establish invisibility. Annotators cannot move these shared points.
3. **Two directions:** enter reviewed feature-relative wording and click a corresponding visible reference point for each direction. These are hypothetical incident directions, not compass headings inferred from a photo. The workplan assigns their definition to Norhan; do not approve them before review.
4. **Opening boxes:** inspect or redraw boxes around the same designated boundary in at least two pre-crossing frames. Mesh masks/native IDs remain proposals.
5. **Review & audits:** approve that scene's geometry or explicitly exclude it with a reason. Review the installed-surface hierarchy and open/sealed protocol interpretation, retaining reviewer names/notes.
6. **Publish reviewed tasks**, back up the previous shared file, then copy the downloaded `collection-tasks.json` into this website folder. Static browser code cannot write to the server. Local setup edits/draft downloads never silently become published tasks.
7. Give both raters the same updated website. Use different annotator IDs; separate browser profiles are optional. Pilot a few scenes before full collection.

All included scenes must pass research setup checks before publication as reviewed
benchmark tasks. Reasoned exclusions allow a pilot subset, but do not exclude
difficult scenes to inflate agreement. The current provisional collection revision
adds one exterior target in Scene 8 and two in Scene 38, preserving the earlier
points. All 56 scenes now have four per side, but these are physical-patch
proposals, not human-certified targets. Ten earlier visual-review flags remain.
Opening setup stamps `settings.points_per_side: 4` on the local draft and versions
its task identity; it does not overwrite published tasks or old annotations.

`settings.collection_mode: "provisional"` permits annotation against complete
shared proposals while research approval remains pending. The annotator can
finish answering without certifying the protocol, hierarchy, or directions.
The strict research publication checks and benchmark eligibility are unchanged.

## Researcher audits

For sun/rain directions, use wording such as "Coming in sideways from the open
side of the terrace beside the railing" only if appropriate to that scene. The
annotator arrow identifies the saved visible reference feature, not a simulated
travel vector. Words and anchors must still be reviewed. See `SUN_RAIN.md`.

The review tab records the 20-candidate glazed-boundary audit: pane present, phantom geometry, separate leaf, evidence frames and notes. It also records the ten-walkthrough visual audit. Counts/CSV exports summarize recorded judgments only; uncertainty is not a pass.

The glass gate needs at least 20 completed records (all three answers plus evidence frames or notes). Its ≥70% numerator counts determinate pane/leaf confirmations; uncertain records remain in the completed denominator but do not pass. Selected, pending and reviewed cases are reported separately. Trajectory results likewise separate yes/no/uncertain/pending. These researcher audit gates do not prevent publishing otherwise reviewed annotation tasks.

Inspect the linked mesh/annotation aids for mesh judgments. RGB alone cannot establish pane triangulation. Replacement boxes do not certify the separate external-box coverage/licensing gate. Research audits are not votes shared between raters.

## Updating a published task set

Back up old tasks and raw annotations. Geometry, directions, settings and audits contribute to task identity. Changes must not silently inherit completed answers. The homepage offers an explicit rebase preview: unchanged material labels may transfer, while affected target, correspondence, boundary or directional judgments are cleared. Completion resets. Compare raters only on identical task versions.

VHC/allowed-pair approval remains a later research dependency, not a checkbox that supplies missing values. The original `CONTRACT.md` describes advanced v1; `FULL_WORKFLOW.md` describes guided v2. Original dataset assets and human files are unchanged.
