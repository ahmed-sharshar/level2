#!/usr/bin/env python3
"""Exact two-rater consensus; never adjudicate disagreement or invent physics GT.

Inputs must be complete, from distinct raters, with the identical frozen layout.
Kappa includes explicit ND as a category; a second kappa excludes ND.
Family readiness is annotation coverage only, NOT generated benchmark item GT.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from validate_export import SITE, node_binary, read_json, validate_document

ND = "not_determinable"


def flatten(value, prefix=""):
    result = {}
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "notes":
                continue
            result.update(flatten(child, f"{prefix}.{key}" if prefix else key))
    else:
        result[prefix] = value
    return result


def category(path):
    parts = path.split(".")
    if parts[0] == "surfaces":
        parts[1] = "*"
        if len(parts) > 3 and parts[2] == "visibility":
            parts[3] = "*"
    if parts[0] == "boundary_visibility":
        parts[1] = "*"
    return ".".join(parts)


def kappa(pairs):
    if not pairs:
        return None
    n = len(pairs)
    a, b = Counter(x for x, _ in pairs), Counter(y for _, y in pairs)
    observed = sum(x == y for x, y in pairs) / n
    expected = sum(a[key] * b[key] for key in a.keys() | b.keys()) / n ** 2
    return None if expected == 1 else (observed - expected) / (1 - expected)


def calculate(first, second, dataset, catalogue, node=None):
    if first.get("schema") == "blockmind_l2_annotations_v2" or second.get("schema") == "blockmind_l2_annotations_v2":
        return calculate_full(first, second, dataset, catalogue, node)
    for label, document in (("rater_a", first), ("rater_b", second)):
        errors = validate_document(document, dataset, catalogue, require_complete=True, node=node)
        if errors:
            raise ValueError(label + " failed validation: " + "; ".join(errors[:20]))
    if first["annotator"].strip().casefold() == second["annotator"].strip().casefold():
        raise ValueError("Two distinct independent annotator IDs are required")
    if first["build_id"] != second["build_id"] or first["layout_id"] != second["layout_id"]:
        raise ValueError("Dataset build and frozen layout identity must match exactly")
    # Created-at and coordinator names are not label-bearing layout identity.
    content = lambda layout: {k: v for k, v in layout.items() if k not in ("created_at", "coordinator", "layout_id")}
    if content(first["layout"]) != content(second["layout"]):
        raise ValueError("Frozen layout contents do not match")
    raters = [first["annotator"], second["annotator"]]
    second_eps = {record["episode_id"]: record for record in second["episodes"]}
    layout_eps = {record["episode_id"]: record for record in first["layout"]["episodes"]}
    dataset_eps = {record["id"]: record for record in dataset["episodes"]}
    statistics = defaultdict(lambda: {"pairs": [], "n_unanswered": 0, "n_excluded": 0, "n_not_applicable": 0})
    episodes = []
    for left in first["episodes"]:
        right = second_eps[left["episode_id"]]
        excluded = left["status"] == "excluded" or right["status"] == "excluded"
        left_flat, right_flat = flatten(left["answers"]), flatten(right["answers"])
        fields, disagreements = {}, []
        for path in sorted(left_flat):
            a, b = left_flat[path], right_flat[path]
            stat = statistics[category(path)]
            pieces = path.split(".")
            optional_substrate = (pieces[0] == "surfaces" and pieces[-1] in ("substrate_material", "substrate_hierarchy_id")
                                  and left_flat.get(f"surfaces.{pieces[1]}.substrate_known") != "yes"
                                  and right_flat.get(f"surfaces.{pieces[1]}.substrate_known") != "yes")
            if excluded:
                state, value = "excluded", None
                stat["n_excluded"] += 1
            elif optional_substrate and (a is None or b is None):
                state, value = "not_applicable", None
                stat["n_not_applicable"] += 1
            elif a is None or b is None:
                state, value = "unanswered", None
                stat["n_unanswered"] += 1
            elif a == b:
                state, value = ("agreed_not_determinable" if a == ND else "agreed"), a
                stat["pairs"].append((a, b))
            else:
                state, value = "disagreement", None
                stat["pairs"].append((a, b))
                disagreements.append({"path": path, "rater_a": a, "rater_b": b})
            fields[path] = {"state": state, "value": value, "eligible_known_gt": state == "agreed",
                            "eligible_nd_gt": state == "agreed_not_determinable",
                            "drop_known_gt": state != "agreed"}

        def known(paths):
            return bool(paths) and all(fields[p]["eligible_known_gt"] for p in paths)

        def matches(path, value):
            return path in fields and fields[path]["state"] == "agreed" and fields[path]["value"] == value

        scene_valid = (not excluded and matches("scene.crossing_valid", "yes")
                       and matches("scene.canonical_context_clear", "yes")
                       and matches("boundary.object_identity_correct", "yes")
                       and fields["scene.boundary_class"]["eligible_known_gt"])
        consistency_warnings = []
        if matches("boundary.glazing", "absent") and any(matches("boundary.pane_transparency", value) for value in ("clear", "obscured")):
            consistency_warnings.append("Glazing absent conflicts with a clear/obscured pane; review, do not auto-correct")
        if matches("boundary.observed_state", "no_closure") and not matches("boundary.kind", "open_passage"):
            consistency_warnings.append("No-closure boundary is not labeled open passage; review boundary semantics")
        layout_ep = layout_eps[left["episode_id"]]
        source_ep = dataset_eps[left["episode_id"]]
        boxes = {box["frame_id"] for box in layout_ep["boundary_boxes"]}
        witnesses = [frame["id"] for frame in source_ep["frames"] if frame["side"] == "indoor" and frame["id"] in boxes
                     and any(matches(f"boundary_visibility.{frame['id']}.visibility", visibility) for visibility in ("direct", "through_glass"))
                     and matches(f"boundary_visibility.{frame['id']}.object_match", "yes")
                     and matches(f"boundary_visibility.{frame['id']}.box_correct", "yes")]
        boundary_certified = len(witnesses) >= 2
        seen_in_rgb = [frame["id"] for frame in source_ep["frames"]
                       if any(matches(f"boundary_visibility.{frame['id']}.visibility", visibility) for visibility in ("direct", "through_glass", "reflection"))]
        surface_ids = sorted(left["answers"]["surfaces"])
        closure_defined = (fields["boundary.kind"]["eligible_known_gt"] and fields["boundary.observed_state"]["eligible_known_gt"]
                           and fields["boundary.material"]["eligible_known_gt"] and not matches("boundary.kind", "open_passage")
                           and not matches("boundary.observed_state", "no_closure"))
        if not closure_defined:
            consistency_warnings.append("Sealed counterfactual lacks an agreed existing closure/material; no sealed-condition known GT is certified")
        per_marker = {}
        for marker in surface_ids:
            paths = [p for p in fields if p.startswith(f"surfaces.{marker}.")]
            relevant = [f"surfaces.{marker}.{key}" for key in ("object_name", "material", "hierarchy_id", "reflectance", "finish", "substrate_known", "shelter")]
            per_marker[marker] = {"all_fields_agreed_known": known(paths), "identity_material_fields_agreed_known": known(relevant),
                                  "substrate_known_agreed": matches(f"surfaces.{marker}.substrate_known", "yes"),
                                  "substrate_fields_agreed_known": known([f"surfaces.{marker}.substrate_material", f"surfaces.{marker}.substrate_hierarchy_id"]),
                                  "drop_fields": [p for p in paths if fields[p]["drop_known_gt"]],
                                  "nd_fields": [p for p in paths if fields[p]["eligible_nd_gt"]]}
        family_a = {}
        for direction in ("d1", "d2"):
            for state in ("open", "sealed"):
                for channel in ("sun", "rain"):
                    paths = [f"surfaces.{m}.reachable.{direction}.{state}.{channel}" for m in surface_ids]
                    ready = scene_valid and known(paths) and (state == "open" or closure_defined)
                    family_a[f"{direction}.{state}.{channel}"] = {
                        "exact_set_labels_available": ready,
                        "reachable_marker_ids": [m for m, p in zip(surface_ids, paths) if matches(p, "yes")] if ready else None,
                        "blocked_fields": [p for p in paths if fields[p]["drop_known_gt"]]}
        b_fields = [p for p in fields if p.startswith("pathways.")] + ["boundary.pane_transparency", "boundary.glazing", "boundary.object_identity_correct", "boundary.observed_state", "boundary.kind", "boundary.material"]
        d_fields = [f"surfaces.{m}.{key}" for m in surface_ids for key in ("material", "hierarchy_id", "finish", "substrate_known")]
        substrate_fields = [f"surfaces.{m}.{key}" for m in surface_ids for key in ("substrate_material", "substrate_hierarchy_id")]
        blocked = [p for p in fields if fields[p]["drop_known_gt"]]
        episodes.append({"episode_id": left["episode_id"], "rater_status": [left["status"], right["status"]],
                         "excluded": excluded, "exclusion_reasons": [left["exclusion_reason"], right["exclusion_reason"]],
                         "all_fields_agreed_known": not blocked and not excluded,
                         "drop_episode_known_gt": excluded or not scene_valid,
                         "consistency_warnings": consistency_warnings,
                         "boundary_certification": {"certified": boundary_certified, "agreed_pre_crossing_witness_frames": witnesses,
                                                    "agreed_seen_in_rgb_frames_including_reflection": seen_in_rgb,
                                                    "machine_boundary_pixels_audit_only": {frame["id"]: frame.get("boundary_pixels") for frame in source_ep["frames"] if frame["id"] in witnesses},
                                                    "minimum_witnesses": 2, "rule": "Coordinator box + two-rater direct/through-glass visibility + object match + correct box; machine pixel counts are source-screening audit only"},
                         "drop_fields": blocked, "fields": fields, "disagreements": disagreements,
                         "marker_readiness": per_marker,
                         "family_annotation_coverage": {
                             "A": {"exposure_sets": family_a, "porous_not_exposed_items_require_reviewed_class_mapping": True},
                             "B": {"pathway_labels_available": scene_valid and boundary_certified and closure_defined and known(b_fields), "boundary_visibility_certified": boundary_certified,
                                   "sealed_counterfactual_defined": closure_defined,
                                   "blocked_fields": [p for p in b_fields if fields[p]["drop_known_gt"]],
                                   "blocking_notes": [] if boundary_certified else ["Need two agreed visible pre-crossing boundary witnesses with certified boxes"]},
                             "C": {"enabled": False, "reason": "No reviewed, versioned and SHA-pinned VHC allowed-pairs table supplied"},
                             "D": {"material_inputs_available": scene_valid and known(d_fields), "class_comparison_gt_ready": False,
                                   "substrate_inputs_available": scene_valid and known(substrate_fields) and all(matches(f"surfaces.{m}.substrate_known", "yes") for m in surface_ids),
                                   "reason": "Requires reviewed intrinsic class mapping and item templates; no image-derived thermal/porosity GT"},
                             "benchmark_items_generated": False},
                         "rater_notes": [{"annotator": raters[0], "answers": left["answers"]}, {"annotator": raters[1], "answers": right["answers"]}]})
    summaries = {}
    for key, stat in sorted(statistics.items()):
        pairs = stat["pairs"]
        known_pairs = [(a, b) for a, b in pairs if a != ND and b != ND]
        agreed = sum(a == b for a, b in pairs)
        summaries[key] = {"cohen_kappa": kappa(pairs), "cohen_kappa_excluding_nd": kappa(known_pairs),
                          "n_compared": len(pairs), "n_agreed": agreed, "n_disagreement": len(pairs) - agreed,
                          "n_unanswered": stat["n_unanswered"], "n_excluded": stat["n_excluded"],
                          "n_not_applicable": stat["n_not_applicable"],
                          "n_known_compared": len(known_pairs), "n_with_nd": len(pairs) - len(known_pairs),
                          "n_agreed_nd": sum(a == b == ND for a, b in pairs),
                          "observed_agreement": agreed / len(pairs) if pairs else None,
                          "rater_a_counts": dict(Counter(a for a, _ in pairs)),
                          "rater_b_counts": dict(Counter(b for _, b in pairs))}
    return {"schema": "blockmind_l2_consensus_v1", "build_id": first["build_id"], "layout_id": first["layout_id"],
            "created_at": datetime.now(timezone.utc).isoformat(), "annotators": raters,
            "layout": first["layout"], "independence_note": "Distinct IDs do not prove blinding; collection procedure must ensure independence.",
            "policy": {"adjudication": False, "exact_match_only": True, "unknown_is_negative": False,
                       "nd_consensus_retained": True, "kappa_nd_policy": "ND is a category; second kappa excludes either-rater ND",
                       "kappa_null_meaning": "No comparisons or expected agreement equals one; not evidence of disagreement",
                       "material_text_normalization": "None; exact strings only", "family_c_enabled": False,
                       "benchmark_items_generated": False},
            "completeness": {"episodes_total": len(episodes), "either_rater_excluded": sum(e["excluded"] for e in episodes),
                             "episodes_all_fields_agreed_known": sum(e["all_fields_agreed_known"] for e in episodes),
                             "episodes_with_disagreements": sum(bool(e["disagreements"]) for e in episodes)},
            "agreement_by_attribute": summaries, "episodes": episodes}


def calculate_full(first, second, dataset, catalogue, node=None):
    """Full guided exports use exactly the same implementation as the browser."""
    code = """
const fs=require('fs'),full=require(process.argv[1]);
const x=JSON.parse(fs.readFileSync(0,'utf8'));
try { process.stdout.write(JSON.stringify({result:full.consensus(x.first,x.second,x.dataset,x.catalogue)})); }
catch(error) { process.stdout.write(JSON.stringify({error:error.message})); }
"""
    payload = dict(first=first, second=second, dataset=dataset, catalogue=catalogue)
    completed = subprocess.run([node_binary(node), "-e", code, str(SITE / "full-core.js")],
                               input=json.dumps(payload, allow_nan=False), text=True,
                               capture_output=True, check=True)
    response = json.loads(completed.stdout)
    if "error" in response:
        raise ValueError(response["error"])
    return response["result"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rater_a", type=Path)
    parser.add_argument("rater_b", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--dataset", type=Path, default=SITE / "dataset.json")
    parser.add_argument("--catalogue", type=Path, default=SITE / "catalogue.json")
    parser.add_argument("--node")
    args = parser.parse_args()
    try:
        if args.out.exists():
            raise ValueError("Refusing to overwrite existing output; choose a new --out path")
        first, second, dataset, catalogue = [read_json(p) for p in (args.rater_a, args.rater_b, args.dataset, args.catalogue)]
        result = calculate(first, second, dataset, catalogue, args.node)
        result["input_sha256"] = {"rater_a": hashlib.sha256(args.rater_a.read_bytes()).hexdigest(),
                                  "rater_b": hashlib.sha256(args.rater_b.read_bytes()).hexdigest()}
        with args.out.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
        print(json.dumps({"saved": str(args.out), **result["completeness"]}, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
