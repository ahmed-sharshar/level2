#!/usr/bin/env python3
"""Build annotation-only boundary spans from the shipped native-instance OBBs.

The .house O record provides an oriented bounding box for a segmented mesh
instance. Its longest horizontal side is an OBJECT span, not a measurement of
the clear doorway opening. Native instances may contain one open leaf, several
panels, surrounding frame/wall geometry, or incomplete transparent surfaces.
Nothing here assigns a human width category or infers an aperture measurement.

This deterministic supplement does not change dataset/catalogue/task identities
or the original asset inventory. Source lookups are checked against that frozen
inventory before use. Only Python's standard library is needed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path


SITE = Path(__file__).resolve().parents[1]
METHOD = "native_instance_obb_horizontal_major_extent"
SCOPE = "native_boundary_object_obb_not_clear_opening"
CAUTION = (
    "Approximate native mesh-object span, not the clear opening width. The "
    "instance may include one open leaf, multiple panels, frame/wall geometry, "
    "or incomplete glass. Confirm the size/type from the images; no category "
    "is inferred from this number. Measurement error has not been calibrated."
)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def vector(value, name):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError(f"{name} must contain three finite numbers")
    if any(isinstance(x, bool) or not isinstance(x, (int, float))
           or not math.isfinite(x) for x in value):
        raise ValueError(f"{name} must contain three finite numbers")
    return [float(x) for x in value]


def unit(value):
    norm = math.sqrt(sum(x*x for x in value))
    if abs(norm - 1) > 1e-4:
        raise ValueError("Native OBB axes must be unit vectors")
    return [x/norm for x in value]


def measure_object(obj):
    """Return an explicitly scoped horizontal OBJECT span, never aperture GT."""
    center = vector(obj.get("obb_center_m"), "obb_center_m")
    radii = vector(obj.get("obb_radii_m"), "obb_radii_m")
    if any(r <= 0 for r in radii):
        raise ValueError("OBB radii must be positive half-extents")
    a = unit(vector(obj.get("obb_axis0"), "obb_axis0"))
    b = unit(vector(obj.get("obb_axis1"), "obb_axis1"))
    if abs(sum(x*y for x, y in zip(a, b))) > 1e-4:
        raise ValueError("Native OBB axes must be orthogonal")
    c = unit([a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2],
              a[0]*b[1] - a[1]*b[0]])
    axes = [a, b, c]
    horizontal = [i for i, axis in enumerate(axes) if abs(axis[2]) <= 1e-5]
    vertical = [i for i, axis in enumerate(axes) if abs(abs(axis[2])-1) <= 1e-5]
    result = {
        "method": METHOD,
        "measurement_scope": SCOPE,
        "units": "metres",
        "width_m": None,
        "thickness_m": None,
        "height_m": None,
        "human_verified": False,
        "clear_opening_width_m": None,
        "estimated_error_m": None,
        "uncertainty_note": CAUTION,
        "native_obb": {"center_m": center, "axes_world": axes,
                       "radii_m": radii},
    }
    # A tilted OBB requires a different method. Do not turn an arbitrary axis
    # or a diagonal into a width while retaining this method's name.
    if len(horizontal) != 2 or len(vertical) != 1:
        return dict(result, status="unavailable_non_upright_obb")
    width_axis = max(horizontal, key=lambda i: radii[i])
    thickness_axis = next(i for i in horizontal if i != width_axis)
    result.update({
        "status": "available",
        "width_m": round(2*radii[width_axis], 7),
        "thickness_m": round(2*radii[thickness_axis], 7),
        "height_m": round(2*radii[vertical[0]], 7),
        "width_axis_index": width_axis,
        "width_axis_world": axes[width_axis],
    })
    return result


def checked_asset(site, relative, inventory):
    if not isinstance(relative, str) or not relative:
        raise ValueError("Source lookup must have a relative asset path")
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or "\\" in relative:
        raise ValueError(f"Unsafe source path: {relative}")
    resolved = (site/path).resolve()
    if not resolved.is_relative_to(site.resolve()):
        raise ValueError(f"Source path escapes the site: {relative}")
    digest = sha256_file(resolved)
    if inventory.get("sha256", {}).get(relative) != digest:
        raise ValueError(f"Frozen inventory hash mismatch: {relative}")
    return resolved, digest


def build(site=SITE):
    site = Path(site).resolve()
    inventory = json.loads((site/"data/asset_inventory.json").read_text())
    dataset_path, dataset_hash = checked_asset(site, "dataset.json", inventory)
    dataset = json.loads(dataset_path.read_text())
    if dataset.get("build_id") != inventory.get("build_id"):
        raise ValueError("Dataset and frozen inventory build identities differ")
    episodes, lookups = {}, {}
    for episode in dataset["episodes"]:
        episode_id = episode["id"]
        if episode_id in episodes:
            raise ValueError(f"Duplicate episode ID: {episode_id}")
        relative = episode["geometry_assets"]["instance_lookup"]
        if relative not in lookups:
            path, digest = checked_asset(site, relative, inventory)
            lookups[relative] = json.loads(path.read_text()), digest
        lookup, source_hash = lookups[relative]
        if lookup.get("scan_id") != episode["scan_id"]:
            raise ValueError(f"Lookup scan mismatch for {episode_id}")
        oid = episode["boundary_object_id"]
        obj = lookup["objects"][str(oid)]
        if obj.get("object_id") != oid:
            raise ValueError(f"Lookup object ID mismatch for {episode_id}")
        # All current designated boundaries have native door-like labels. Refuse
        # an accidentally resolved wall/floor rather than displaying its span.
        # Window sources are allowed for future boundary sets, without assigning
        # the human's door/window/open-gap answer.
        category = (obj.get("mpcat40_id"), obj.get("mpcat40_name"))
        # The source labels "tarrace door" as mpcat40 misc. Preserve that
        # source taxonomy; do not silently relabel it to the door category.
        native_misc_door = (category == (40, "misc") and
                            obj.get("raw_category", "").lower().endswith(" door"))
        if category not in {(4, "door"), (9, "window")} and not native_misc_door:
            raise ValueError(f"Unexpected native boundary category for {episode_id}")
        record = measure_object(obj)
        record.update({
            "episode_id": episode_id,
            "scan_id": episode["scan_id"],
            "boundary_object_id": oid,
            "source": {
                "asset": relative,
                "sha256": source_hash,
                "record": f"objects.{oid}",
                "native_record_type": "Matterport3D .house O oriented bounding box",
                "raw_category": obj.get("raw_category"),
                "mpcat40_id": obj["mpcat40_id"],
                "mpcat40_name": obj["mpcat40_name"],
                "region_id": obj.get("region_id"),
                "visibility_map_resolution_px": lookup.get("resolution"),
                "width_derived_from_pixels": False,
            },
        })
        episodes[episode_id] = record
    result = {
        "schema": "blockmind_boundary_measurements_v1",
        "dataset_build_id": dataset["build_id"],
        "dataset_sha256": dataset_hash,
        "method": METHOD,
        "method_definition": (
            "For the same native boundary object as the visibility mask, read "
            "the mesh-instance OBB from the .house O record in the frozen "
            "instance lookup. Reconstruct axis2 = axis0 cross axis1; require "
            "one vertical and two horizontal axes in native Z-up coordinates. "
            "Object span = twice the larger horizontal OBB radius. These are "
            "full extents, not radii or an XY axis-aligned diagonal."
        ),
        "model_visible": False,
        "human_annotation": False,
        "uncertainty_note": CAUTION,
        "episode_count": len(episodes),
        "available_count": sum(v["status"] == "available" for v in episodes.values()),
        "episodes": episodes,
    }
    result["measurement_id"] = hashlib.sha256(canonical(result)).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=SITE)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--replace", action="store_true",
                        help="Replace an existing, differing generated supplement")
    args = parser.parse_args()
    result = build(args.site)
    destination = args.out or args.site/"boundary-measurements.json"
    data = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if destination.exists() and destination.read_text() != data and not args.replace:
        parser.error("Output differs; use --replace to regenerate the supplement")
    if not destination.exists() or destination.read_text() != data:
        destination.write_text(data, encoding="utf-8")
    print(json.dumps({"output": str(destination), "episodes": result["episode_count"],
                      "available": result["available_count"],
                      "measurement_id": result["measurement_id"]}))


if __name__ == "__main__":
    main()
