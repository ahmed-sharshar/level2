# Earlier basic drafts and the complete workflow

`guided.html` preserves the earlier basic collector and `blockmind_l2_guided_v1` exports. It is no longer the homepage. Its browser storage and raw files remain untouched.

The homepage now uses complete compact v2 collection: one form per point and grouped scenarios, with class, shelter, direction, exposure and pathway facts retained. See [README.md](README.md) and [COMPACT_WORKFLOW.md](COMPACT_WORKFLOW.md).

Use your own name on the homepage, then **More → Restore / update my JSON**. Earlier browser drafts are also detected when available. The preview explains what can transfer; nothing is replaced until confirmation. Imports support guided v1, advanced v1 and full v2 from the same dataset build and annotator.

Point IDs alone are insufficient. Material labels transfer only for uniquely matching coordinates, anchor frame, side and compatible native object identity. Changed directions, observations or boxes clear the affected judgments. Missing answers stay missing, and completion must be checked again.

Keep raw exports. Do not rename schemas by hand or import another rater's labels.

```bash
python3 scripts/validate_guided.py /path/to/older-basic-draft.json
python3 scripts/validate_export.py /path/to/new-full-draft.json
```
