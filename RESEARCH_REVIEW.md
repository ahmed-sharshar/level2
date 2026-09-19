# Later manual benchmark review

Open `review.html` when reviewed benchmark questions or actual model outputs exist. It keeps later work separate from scene annotation.

| Queue | Human work | Report |
|---|---|---|
| `matcher` | Record exactly which provided options the model selected, or mark output unparseable | Exact-set/status agreement; gate needs ≥100 usable reviewed outputs and ≥98% accuracy |
| `baseline` | Building scientist answers the same questions using supplied RGB/numbered markers | Unscored human answers; compare with separately frozen GT downstream |
| `error` | Assign the primary cause: prompt, perception, reasoning, physics application, or not determinable | Counts per supplied family/model; target ≥30 determinate codes; uncertainty separate |

Enter your name and load a JSON queue. Click **Save answer** before moving on. Download review JSON and the report. Restore your own review or reopen the queue to resume. Reviewer names are procedural separation, not authentication.

## Queue format

This illustrates the schema, **not actual questions or approved options**. Prepare real queues outside the published site. Family B/C wording still requires the referenced Protocol; do not use these placeholders as benchmark items.

```json
{
  "schema": "blockmind_review_tasks_v1",
  "kind": "matcher",
  "title": "Actual reviewed extraction sample",
  "items": [{
    "id": "YOUR_UNIQUE_ITEM_ID",
    "family": "A",
    "model_id": "ACTUAL_MODEL_ID",
    "pair_id": "LINKED_COUNTERPART_ID",
    "question": "COPY THE ACTUAL REVIEWED QUESTION",
    "options": [{"id": "1", "text": "COPY THE ACTUAL OPTION"}],
    "multi_select": true,
    "frames": [],
    "response": "COPY THE ACTUAL MODEL OUTPUT",
    "machine_extraction": {"status": "answered", "selected_options": ["1"]}
  }]
}
```

An unparseable extraction has status `unparseable` and empty `selected_options`. An explicitly answered empty set is supported for set-selection items. Reviewer uncertainty is separate from a model's actual cannot-determine option: include that option's reviewed ID/text in `options` and select it normally.

For `error`, remove `machine_extraction`; use actual wrong outputs selected downstream. The website cannot prove an output is wrong without benchmark GT.

For `baseline`, remove `model_id`, `response` and `machine_extraction`; provide the exact ordered model-visible RGB frames. Baseline queues reject model-answer/GT fields. A frame reference looks like:

```json
{
  "episode_id": "scene_001_1LXtFkjw3qL_O103",
  "frame_id": "f01",
  "markers": [{"label": "1", "x": 0.42, "y": 0.56}]
}
```

Use dataset episode/frame IDs and numbered model-visible markers. Coordinates are normalized. Only known RGB references are accepted, not arbitrary paths, external images, depth or segmentation overlays. Queue preparation remains researcher work; this tool does not generate items, randomize them, run models or infer GT.

Review exports bind queue contents and dataset build. Machine extractions are hidden during labeling, but technically accessible in the input JSON, so procedural blinding is still necessary. Reports disclose unanswered/uncertain denominators and never claim benchmark readiness. Error targets cover supplied groups only, not absent families/models.

If another tab changes the draft while the current answer is unfinished, editing locks without erasing the form. Download the recovery file: it contains `saved_review` and `unsaved_form` separately. Restore `saved_review` as its own JSON, then re-enter the unfinished answer. A recovery bundle is deliberately not accepted as completed annotation.
