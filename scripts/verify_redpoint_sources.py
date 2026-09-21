#!/usr/bin/env python3
"""Audit reference coverage and frozen red-point labels without changing inputs.

Pillow is required to decode the shipped instance maps. No model inference,
human-label assignment, target creation, or research approval is performed.
An optional --out report is the only write; existing reports are not overwritten
unless --replace-report is given. Point-count shortages are reported separately
from source-integrity failures: correct source data is not collection readiness.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import math
from pathlib import Path

from PIL import Image

from verify_bundle import asset_path, read_json, sha256_file


SITE = Path(__file__).resolve().parents[1]


def verify(site=SITE, source_hierarchy=None):
    site = Path(site).resolve()
    dataset = read_json(site / "dataset.json")
    catalogue = read_json(site / "catalogue.json")
    tasks = read_json(site / "collection-tasks.json")
    inventory = read_json(site / "data/asset_inventory.json")
    reference_path = asset_path(site, catalogue["provenance"]["hierarchy"]["path"])
    reference = read_json(reference_path)
    reference_materials = reference["materials"]
    materials = catalogue["materials"]
    material_ids = [m["id"] for m in materials]
    checks = []

    def check(name, passed, **detail):
        checks.append({"name": name, "passed": bool(passed), **detail})

    check("catalogue_contains_all_107_reference_materials",
          len(material_ids) == len(set(material_ids)) == len(reference_materials) == 107
          and set(material_ids) == set(reference_materials),
          catalogue_count=len(material_ids), reference_count=len(reference_materials))
    check("each_catalogue_reference_matches_full_reference_entry",
          all(m.get("reference") == reference_materials.get(m["id"]) for m in materials))
    check("reference_sha256_matches_catalogue_provenance",
          sha256_file(reference_path) == catalogue["provenance"]["hierarchy"]["sha256"])
    if source_hierarchy is not None:
        source_hierarchy = Path(source_hierarchy).resolve()
        check("bundled_reference_identical_to_original_source",
              sha256_file(source_hierarchy) == sha256_file(reference_path),
              original_source=str(source_hierarchy), sha256=sha256_file(source_hierarchy))

    episodes = {ep["id"]: ep for ep in dataset["episodes"]}
    task_ids = [ep["episode_id"] for ep in tasks["layout"]["episodes"]]
    check("task_and_dataset_episode_identities_match",
          len(task_ids) == len(set(task_ids)) == len(episodes)
          and set(task_ids) == set(episodes))
    check("task_catalogue_and_dataset_builds_match",
          tasks["build_id"] == catalogue["build_id"] == dataset["build_id"])
    category_names = {str(obj["id"]): obj["name"] for obj in catalogue["objects"]}
    lookups, maps, checked_assets, samples, shortages = {}, {}, {}, [], []
    side_counts = Counter()
    failures = []

    def checked_path(relative):
        path = asset_path(site, relative)
        if relative not in checked_assets:
            actual = sha256_file(path)
            checked_assets[relative] = actual
            expected = inventory["sha256"].get(relative)
            if expected != actual:
                failures.append({"asset": relative, "error": "Frozen asset hash mismatch"})
        return path

    for task in tasks["layout"]["episodes"]:
        eid = task["episode_id"]
        if eid not in episodes:
            failures.append({"episode_id": eid, "error": "Unknown episode"})
            continue
        ep = episodes[eid]
        frames = {f["id"]: f for f in ep["frames"]}
        lookup_name = ep["geometry_assets"]["instance_lookup"]
        if lookup_name not in lookups:
            lookups[lookup_name] = read_json(checked_path(lookup_name))["objects"]
        lookup = lookups[lookup_name]
        counts = Counter(m["side"] for m in task["markers"])
        side_counts.update(counts)
        if any(counts[side] != 4 for side in ("indoor", "exterior")):
            shortages.append({"episode_id": eid, "counts": dict(counts),
                              "missing": {side: max(0, 4-counts[side]) for side in ("indoor", "exterior")},
                              "researcher_review_required": True})
        for marker in task["markers"]:
            sample = {"episode_id": eid, "marker_id": marker["id"],
                      "anchor_frame": marker["anchor_frame"],
                      "expected_object_id": marker["object_id"],
                      "expected_mpcat40": marker["mpcat40"]}
            try:
                frame = frames[marker["anchor_frame"]]
                x, y = marker["x"], marker["y"]
                if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in (x, y)):
                    raise ValueError("Invalid normalized anchor coordinates")
                name = frame["instance_map"]
                if name not in maps:
                    with Image.open(checked_path(name)) as image:
                        maps[name] = image.convert("RGB")
                image = maps[name]
                if image.size != (160, 128):
                    raise ValueError("Expected frozen 160x128 instance map")
                px, py = min(math.floor(x*image.width), image.width-1), min(math.floor(y*image.height), image.height-1)
                red, green, blue = image.getpixel((px, py))
                object_id = (red << 16 | green << 8 | blue)-1
                native = lookup.get(str(object_id))
                if native is None:
                    raise ValueError("No native object lookup for sampled pixel")
                category_id, category_name = int(native["mpcat40_id"]), native["mpcat40_name"]
                matches = (object_id == marker["object_id"] and category_id == marker["mpcat40"]
                           and category_names.get(str(category_id)) == category_name)
                sample.update(instance_map=name, pixel_xy=[px, py], object_id=object_id,
                              mpcat40_id=category_id, mpcat40_name=category_name,
                              matches_frozen_marker_metadata=matches)
                if not matches:
                    failures.append({**sample, "error": "Sampled native label differs from frozen metadata"})
            except (KeyError, TypeError, ValueError, OSError) as exc:
                sample["matches_frozen_marker_metadata"] = False
                sample["error"] = str(exc)
                failures.append(sample.copy())
            samples.append(sample)

    check("all_anchor_pixels_match_native_object_and_mpcat40_metadata",
          bool(samples) and all(s["matches_frozen_marker_metadata"] for s in samples),
          checked_anchors=len(samples))
    check("all_sampled_frozen_assets_match_inventory", not any("asset" in f for f in failures),
          checked_assets=len(checked_assets))
    report = {
        "schema": "blockmind_l2_redpoint_source_audit_v1",
        "passed": all(c["passed"] for c in checks) and not failures,
        "build_id": dataset["build_id"], "task_id": tasks["task_id"],
        "input_sha256": {name: sha256_file(site/name) for name in
                         ("dataset.json", "catalogue.json", "collection-tasks.json")},
        "scope": "Frozen source integrity only; not human labels, target approval, or scientific scene certification",
        "sample_rule": "RGB big-endian native object ID + 1; floor(x*160), floor(y*128), clamped at final pixel",
        "human_annotation": False, "model_visible": False,
        "checks": checks, "failures": failures,
        "summary": {"episodes": len(task_ids), "reference_materials": len(materials),
                    "sampled_anchors": len(samples), "points_per_side_totals": dict(side_counts),
                    "scenes_with_exactly_four_per_side": len(task_ids)-len(shortages)},
        "four_per_side_readiness": {"passed": not shortages, "required_per_side": 4,
                                    "shortages": shortages,
                                    "action": "Researcher reviews/adds real targets before approving a new shared task; do not fabricate points or alter existing targets automatically"},
        "samples": samples,
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=SITE)
    parser.add_argument("--source-hierarchy", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--replace-report", action="store_true")
    args = parser.parse_args()
    report = verify(args.site, args.source_hierarchy)
    encoded = json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False)+"\n"
    if args.out:
        if args.out.exists() and not args.replace_report:
            parser.error("Report already exists; choose another output or --replace-report")
        with args.out.open("w" if args.replace_report else "x", encoding="utf-8") as stream:
            stream.write(encoded)
        print(json.dumps({"report": str(args.out), "passed": report["passed"],
                          **report["summary"], "four_per_side_ready": report["four_per_side_readiness"]["passed"]}, indent=2))
    else:
        print(encoded, end="")
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
