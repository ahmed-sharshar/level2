"""Geometry/provenance checks for the annotation-only object-span supplement."""
import copy
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE/"scripts"))
from build_boundary_measurements import build, canonical, checked_asset, measure_object


def object_record():
    return {"obb_center_m": [10, -3, 1.2], "obb_axis0": [0, 0, 1],
            "obb_axis1": [1, 0, 0], "obb_radii_m": [1.2, .45, .05]}


class ObjectSpanTests(unittest.TestCase):
    def test_uses_full_horizontal_extent_not_height_or_radius(self):
        got = measure_object(object_record())
        self.assertEqual(got["width_m"], .9)
        self.assertEqual(got["height_m"], 2.4)
        self.assertEqual(got["thickness_m"], .1)
        self.assertEqual(got["width_axis_index"], 1)

    def test_rotation_does_not_use_xy_diagonal(self):
        obj = object_record()
        obj["obb_axis1"] = [math.sqrt(.5), math.sqrt(.5), 0]
        self.assertEqual(measure_object(obj)["width_m"], .9)

    def test_vertical_axis_not_always_first(self):
        obj = object_record()
        obj.update(obb_axis0=[0, 1, 0], obb_axis1=[0, 0, 1],
                   obb_radii_m=[3.44808, 1.24999, .289849])
        got = measure_object(obj)
        self.assertEqual(got["width_m"], 6.89616)
        self.assertEqual(got["height_m"], 2.49998)

    def test_reconstructed_axis_can_be_width(self):
        obj = object_record()
        obj["obb_radii_m"] = [1.2, .05, .45]
        got = measure_object(obj)
        self.assertEqual(got["width_m"], .9)
        self.assertEqual(got["width_axis_index"], 2)

    def test_tilted_box_is_unavailable_not_fake_width(self):
        obj = object_record()
        obj["obb_axis0"] = [0, math.sqrt(.5), math.sqrt(.5)]
        got = measure_object(obj)
        self.assertEqual(got["status"], "unavailable_non_upright_obb")
        self.assertIsNone(got["width_m"])

    def test_bad_axes_rejected(self):
        for value in ([0, 0, 0], [3, 0, 0], [0, 0, 1]):
            with self.subTest(value=value):
                obj = object_record()
                obj["obb_axis1"] = value
                with self.assertRaises(ValueError):
                    measure_object(obj)

    def test_invalid_radii_and_coordinates_rejected(self):
        for key, value in (("obb_radii_m", [1, -1, 1]),
                           ("obb_radii_m", [1, 0, 1]),
                           ("obb_radii_m", [1, math.inf, 1]),
                           ("obb_center_m", [0, math.nan, 0]),
                           ("obb_center_m", [True, 0, 0]),
                           ("obb_radii_m", [1, 2])):
            with self.subTest(key=key, value=value):
                obj = object_record()
                obj[key] = value
                with self.assertRaises(ValueError):
                    measure_object(obj)

    def test_span_is_not_aperture_gt_or_a_human_label(self):
        got = measure_object(object_record())
        self.assertIsNone(got["clear_opening_width_m"])
        self.assertIsNone(got["estimated_error_m"])
        self.assertFalse(got["human_verified"])
        self.assertNotIn("width_category", got)
        self.assertIn("not the clear opening width", got["uncertainty_note"])


class SupplementProvenanceTests(unittest.TestCase):
    def test_changed_source_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/"lookup.json").write_text("changed")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                checked_asset(root, "lookup.json", {"sha256": {"lookup.json": "wrong"}})

    def test_unsafe_source_path_rejected(self):
        for path in ("../lookup.json", "/lookup.json", "x\\lookup.json", ""):
            with self.subTest(path=path), self.assertRaises(ValueError):
                checked_asset(SITE, path, {})

    def test_real_frozen_56_have_correct_identity_and_complete_coverage(self):
        original = (SITE/"dataset.json").read_bytes()
        dataset = json.loads(original)
        result = build(SITE)
        self.assertEqual(result["dataset_build_id"], dataset["build_id"])
        self.assertEqual(result["dataset_sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(result["episode_count"], 56)
        self.assertEqual(result["available_count"], 56)
        self.assertEqual(set(result["episodes"]), {ep["id"] for ep in dataset["episodes"]})
        for episode in dataset["episodes"]:
            got = result["episodes"][episode["id"]]
            self.assertEqual(got["boundary_object_id"], episode["boundary_object_id"])
            self.assertEqual(got["scan_id"], episode["scan_id"])
            self.assertIn(got["source"]["mpcat40_name"], {"door", "misc"})
            self.assertIn("door", got["source"]["raw_category"])
            self.assertEqual(got["source"]["visibility_map_resolution_px"], [160, 128])
            self.assertFalse(got["source"]["width_derived_from_pixels"])
            self.assertGreater(got["width_m"], 0)
        self.assertEqual((SITE/"dataset.json").read_bytes(), original)
        terrace = result["episodes"]["scene_015_D7N2EKCX4Sj_O628"]
        self.assertEqual(terrace["source"]["mpcat40_name"], "misc")
        self.assertEqual(terrace["source"]["raw_category"], "tarrace door")

    def test_deterministic_build_and_supplement_content_identity(self):
        result = build(SITE)
        self.assertEqual(result, build(SITE))
        payload = copy.deepcopy(result)
        identity = payload.pop("measurement_id")
        self.assertEqual(identity, hashlib.sha256(canonical(payload)).hexdigest())

    def test_generated_supplement_matches_sources(self):
        self.assertEqual(json.loads((SITE/"boundary-measurements.json").read_text()), build(SITE))


if __name__ == "__main__":
    unittest.main()
