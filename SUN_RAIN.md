# Sun and rain: separate judgments with visible direction references

Each of the four scenarios retains separate **sun** and **rain** answers for
every shared point: two researcher-defined directions, each with fully open and
tightly closed/sealed opening conditions. For an eight-point scene, this is 64
stored judgments grouped into four tables, not 64 separate screens.

Each column offers **Hit directly / Not hit / Not sure**. The stored values remain
`yes`, `no`, and `not_determinable`; a blank remains `null` (unanswered). For
example, `answers.surfaces.I1.reachable.d1.open.sun` and the corresponding `.rain`
are independent. No answer is copied to another point, channel or scenario.

## The two adjacent rules

Every sun/rain scenario places these instructions above its table:

1. Direct sunlight can pass through clear glass; rain cannot pass through intact
   closed glass. Clear glass does not automatically establish that a particular
   point is reached: use the stated direction and visible obstructions.
2. For a point under **slats or lattice**, choose **Not sure for rain** unless the
   stated scenario brings rain in **sideways**. For sideways rain, judge the path
   to the point; do not automatically choose Hit directly.

These are annotation instructions, not a new inference engine. Selecting slatted
shelter does not fill or overwrite exposure labels. Existing uncertainty-note and
completion checks remain. Use the hypothetical scenario, not the photographed
weather; an absent or unknown closure remains Not sure for the sealed scenario.

## Direction words and the image arrow

The scenario displays the researcher's exact saved wording. Setup asks for an
incoming direction tied to a visible feature, for example: "Coming in sideways
from the open side of the terrace beside the railing." This is a template, never
an automatically assigned description of a scene.

**Show the direction reference** opens the saved reference frame and points a
yellow arrow to the researcher's saved feature anchor. The arrow is explicitly a
**reference callout, not a physical travel vector**: only one anchor is stored,
so its drawn tail does not encode a sun angle or rainfall trajectory. It appears
only on that reference image. **Show point** returns to the selected surface.
Drawing a physically meaningful incident-ray arrow would require additional
researcher-authored geometry and a new shared task version.

The current collection revision supplies 112 **provisional hypothetical direction
definitions** across 56 scenes, each tied to a saved visible reference anchor.
These are shared scenario inputs, not observed weather, human annotations, or
Norhan's research approval. The explicit provisional collection mode unlocks
answering after structural checks; the scene and research approval fields stay
false. Researchers must review the definitions before freezing benchmark GT.
Earlier task packages without provisional mode retain their approval gate.

## Compatibility

The earlier UI-only clarification did not change task identities. The later
collection-readiness revision deliberately versions the shared directions and
adds three exterior targets while preserving all existing point coordinates,
human labels and frozen dataset assets. Migration retains compatible labels
only with explicit user confirmation; changed directions require new judgments.
The direct-hit option wording is scoped to point exposure. The later opening
update replaces passage questions with multi-select consistency-only checks;
see `COLLECTION_CHECKS.md`. Other Yes/No questions retain their choices. Tests
use disposable synthetic directions and answers, never production approvals or
actual human annotation.
