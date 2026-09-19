# Annotator guide

This detailed reference accompanies the preserved `advanced.html` interface. For the current one-question-at-a-time homepage, start with [README.md](README.md). Ordinary v2 Level 2 collection does not require the full Level 3 visibility matrix.

## The central distinction

Record **what the marked surface is** separately from **what can reach it under a stated condition**. Moving outdoors does not change the same material's intrinsic class. Porosity is not a substitute for exposure or an air path through an assembly.

## A surface marker

The point denotes the visible surface directly underneath it. It does not denote every material belonging to a segmented object. A glazed door can contain glass, timber, metal handles, coatings and seals. A painted wall does not establish what substrate is behind the paint. Record the visible finish/material separately from the underlying substrate. If the substrate is genuinely known, enter its material and hierarchy entry in the dedicated fields; otherwise leave it unknown instead of using the paint label as bulk thermal material.

Match the same intended surface in different frames. If the point projection is on the wrong object, behind an occluder, or in a reflection, correct the shared layout before both raters begin or report the issue. Never silently change another marker into the intended one halfway through annotation.

Use the object menu/material suggestions to save typing, not as evidence. If none is right, enter the actual material or choose Not determinable. The hierarchy entry should match the installed visible surface as specifically as the evidence supports; do not select a narrow construction specification merely because it is offered.

## Boundary and glass

Use the episode's single designated boundary identity. Leaf, frame and pane may need to be distinguished in notes/point placement. Check the two pre-crossing sightings yourself; a cyan mesh mask is not a human segmentation.

Transparency:

- **Clear**: a clear view/transmitted direct light is plausible through the relevant pane.
- **Obscured**: translucent/frosted/obscured glazing, where transmission is not the same as clear direct passage. Record uncertainty when tint, reflection or resolution prevents distinction.
- **Opaque**: the relevant closure blocks visible light through its solid part.
- **Not determinable**: insufficient evidence. Do not assume every door is glass.

Photographed state is separate from the question's hypothetical state. The shared layout freezes these definitions: **open** means fully open the designated existing closure while keeping other permanent obstructions unchanged; **sealed** means close and tightly seal that same closure while preserving its material/glazing and other geometry. An open photographed door does not itself establish the unknown material of an imagined closure. For open passages without a closure, the sealed counterfactual is Not determinable or excluded; do not invent a new panel.

The workplan's qualitative convention is that **direct sun can pass clear glass, but rain does not pass intact sealed glass**. This is a stated-condition judgment, not a temperature prediction. Keep diffuse light, direct sun, rain and air as separate channels. If a relevant obstruction, glass property, sealing assumption or direction is unclear, record Not determinable rather than inventing a path.

## Direction and shelter

Read the frozen direction prompt and reference point. Directions are relative to visible geometry, not north/south, actual weather or inferred solar time. Judge each direction independently: an overhead roof and a lateral wall block different paths.

For each marked surface and open/sealed condition, ask:

1. Could direct sunlight from this stated direction reach this exact surface?
2. Could rain arriving from this stated direction reach this exact surface?

Do not infer the answer from material absorbency, darkness, shininess or whether the surface is labelled indoor/outdoor. An outdoor surface can be sheltered and an indoor surface can receive direct sun through clear glass.

## Per-frame visibility

- **Direct**: the intended surface/boundary is directly visible in RGB.
- **Through glass**: visible along a transmitted view through glazing.
- **Reflection**: appears only/primarily in a reflection; do not treat it as truly out of view.
- **Occluded**: in the relevant view direction but hidden behind geometry.
- **Out of frame**: outside the current image's field of view.
- **Not determinable**: cannot confidently identify visibility/identity.

These are independent human labels. A projected point or nonzero mesh pixel count is only a hint. Check for look-back views through doors/windows, mirrors, panorama edges and mixed native instances. Camera position on the outdoor side does not mean the camera faces outdoors.

## Completion and independence

Review all required fields and all 12 visibility columns. Bulk uncertainty/visibility actions are conveniences for your own explicit judgment, not automatic answers. Explain why facts cannot be determined. Do not manufacture an answer to make a progress bar reach 100%.

Two raters work independently on the same shared layout. Never copy the other's answers. Non-consensus facts are withheld from downstream GT. A material suggestion, geometry hint or reference-table class is not a third human vote.
