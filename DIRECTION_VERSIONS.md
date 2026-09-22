# Direction versions and annotation time

## The published direction pair

All 56 scenes currently use the same two hypothetical incoming directions:

- **Direction 1:** from directly above the exterior side of the opening,
  vertically downward.
- **Direction 2:** sideways from the exterior side toward the opening and into
  the indoor room, opposite to the walk across the threshold.

Each definition names its scene's reference image. Roofs, walls, covers and
other obstacles stay in place. The arrow identifies the opening reference; it
is not a simulated light/rain ray. These are scenario conditions, not inferred
weather. A researcher can change a direction for an individual scene in setup.
This software update does not change the existing published direction wording.

## Every directional answer keeps its source

Every individual Sun & rain response and Through-the-opening selection records
the exact direction definition, its original task identity and a content hash
of the relevant scenario context. This includes the direction's reference,
the open/sealed condition, relevant target/boundary geometry and protocol text.
Through-the-opening remains a consistency check, never an answer key.

The JSON uses `answer_provenance_version: 1`. Each scene's
`answer_provenance["answers.surfaces.I1.reachable.d1.open.sun"]` (or
`answer_provenance["checks.opening_passage.d1.open"]`) points to a saved revision,
such as `r1`. Resolve it through that scene's `direction_versions.r1`: this
contains the original `task_id`, snapshot SHA-256 and exact direction text and
reference. Shared definitions are stored once, rather than repeating them for
every point. Each answer still has its own source revision, value and timestamp.

When a task is revised, the collector compares the saved context with the new
one. Affected answers are marked **Needs redoing** and cannot count toward
completion or benchmark use. The previous value and its source are retained
for audit. The annotator answers again under the new direction; the site never
guesses a replacement. A Direction 1 edit does not invalidate an unchanged
Direction 2 or unaffected scenes. Unrelated package metadata edits do not force
the whole collection to be repeated.

Task migration retains the existing conservative completion policy: included
scene completion marks reopen for review. Unchanged answers stay filled and
current, so they do not need to be entered again; only marked answers need a
new judgment before the scene can be finished again.

Older exports embed the complete original task package. Their metadata upgrade
is explicitly identified as recovered from that embedded package, not an
invented per-answer timestamp. Original browser drafts are backed up before
upgrading; task migration still has a preview and confirmation. An open tab
checks for published task changes, saves its old-version draft, and pauses
editing until the new package is loaded and migrated.

Researchers can audit a downloaded export without editing it:

```bash
python scripts/audit_direction_versions.py /path/to/annotator-export.json
```

Use `--tasks /path/to/revised-collection-tasks.json` to compare against another
valid task revision. JSON is written to standard output. Exit status is 0 when
no existing answers need redoing, 1 when some do, and 2 for invalid inputs. A
clear version audit does not mean all questions are answered or that research
settings/physics ground truth are approved.

## Time spent per scene

Each annotator's export records per-scene active time in milliseconds. The
counter runs while the editable scene is visible, focused and being used; it
pauses when the tab is hidden/unfocused, the scene is finished/excluded, the
draft is locked, or after 60 seconds without activity. Time is
saved regularly and on scene/ID changes and export. It accumulates across
sessions instead of including overnight/offline gaps. This is an estimate of
active annotation time, not an exact measurement of attention or wall time.

Time before this tracking feature was installed cannot be reconstructed and is
marked unavailable for older drafts. Document creation and scene completion
timestamps are not substituted for measured active time.

These fields are saved under `episodes[i].time_tracking`: `active_ms`,
`first_started_at`, `last_active_at`, `tracking_started_at`, and
`prior_time_unavailable`. The containing export identifies the annotator.

## Independence

Different unique annotator IDs have separate local drafts. There is no shared
answer view, no import of another annotator's responses, and no disagreement-
resolution button. Downstream consensus drops disagreed items rather than
asking annotators to reconcile them.

IDs are labels, not passwords. On the same browser, someone deliberately
entering another person's ID can load that local draft. The static website does
not provide authenticated access control; use only your own ID and return
exports privately. Separate browser profiles are not required.
