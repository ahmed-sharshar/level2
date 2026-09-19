#!/usr/bin/env python3
"""Exercise authoritative JS validation plus Python exact-consensus semantics."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / "scripts"))
from validate_export import node_binary, validate_document
from consensus import calculate, kappa


class CoreConsensusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        output = subprocess.check_output([node_binary(), str(SITE / "tests/core.test.js"), "--fixture"], text=True)
        cls.fixture = json.loads(output.splitlines()[-1])

    def inputs(self):
        first = copy.deepcopy(self.fixture["complete"])
        second = copy.deepcopy(first)
        second["annotator"] = "rater-b"
        return first, second

    def run_consensus(self, first, second):
        return calculate(first, second, self.fixture["dataset"], self.fixture["catalogue"])

    def test_python_cli_uses_same_draft_rules(self):
        f = self.fixture
        self.assertEqual(validate_document(f["draft"], f["dataset"], f["catalogue"]), [])
        self.assertTrue(validate_document(f["draft"], f["dataset"], f["catalogue"], True))

    def test_nd_consensus_is_explicit_not_known_physics(self):
        result = self.run_consensus(*self.inputs())
        episode = result["episodes"][0]
        self.assertFalse(episode["all_fields_agreed_known"])
        self.assertTrue(episode["drop_episode_known_gt"])
        self.assertFalse(episode["family_annotation_coverage"]["C"]["enabled"])
        field = episode["fields"]["boundary.material"]
        self.assertEqual(field["value"], "not_determinable")
        self.assertTrue(field["eligible_nd_gt"])
        self.assertFalse(field["eligible_known_gt"])
        stat = result["agreement_by_attribute"]["boundary.material"]
        self.assertEqual(stat["n_agreed_nd"], 1)
        self.assertEqual(stat["n_known_compared"], 0)

    def test_disagreement_is_not_adjudicated(self):
        first, second = self.inputs()
        first["episodes"][0]["answers"]["boundary"]["material"] = "wood"
        second["episodes"][0]["answers"]["boundary"]["material"] = "glass"
        result = self.run_consensus(first, second)
        field = result["episodes"][0]["fields"]["boundary.material"]
        self.assertEqual(field["state"], "disagreement")
        self.assertIsNone(field["value"])
        self.assertTrue(field["drop_known_gt"])
        self.assertEqual(result["agreement_by_attribute"]["boundary.material"]["n_disagreement"], 1)

    def test_agreed_invalid_crossing_not_usable(self):
        first, second = self.inputs()
        for document in (first, second):
            document["episodes"][0]["answers"]["scene"]["crossing_valid"] = "no"
        episode = self.run_consensus(first, second)["episodes"][0]
        self.assertTrue(episode["drop_episode_known_gt"])
        self.assertFalse(episode["family_annotation_coverage"]["B"]["pathway_labels_available"])

    def test_excluded_rater_drops_episode_not_silent_agreement(self):
        first, second = self.inputs()
        second["episodes"][0]["status"] = "excluded"
        second["episodes"][0]["exclusion_reason"] = "Not an actual crossing"
        result = self.run_consensus(first, second)
        self.assertTrue(result["episodes"][0]["excluded"])
        self.assertEqual(result["agreement_by_attribute"]["boundary.material"]["n_excluded"], 1)
        self.assertEqual(result["agreement_by_attribute"]["boundary.material"]["n_compared"], 0)

    def test_same_rater_is_rejected(self):
        first, second = self.inputs()
        second["annotator"] = " RATER-A "
        with self.assertRaises(ValueError):
            self.run_consensus(first, second)

    def test_modified_layout_is_rejected(self):
        first, second = self.inputs()
        second["layout"]["episodes"][0]["markers"][0]["x"] = .8
        with self.assertRaises(ValueError):
            self.run_consensus(first, second)

    def test_kappa_known_examples(self):
        self.assertEqual(kappa([("yes", "yes"), ("no", "no")]), 1)
        self.assertEqual(kappa([("yes", "no"), ("no", "yes")]), -1)
        self.assertIsNone(kappa([("yes", "yes")]))
        self.assertIsNone(kappa([]))

    def test_family_b_requires_human_boundary_witnesses(self):
        first, second = self.inputs()
        for document in (first, second):
            a = document["episodes"][0]["answers"]
            a["scene"].update(crossing_valid="yes", canonical_context_clear="yes", boundary_class="outdoor")
            a["boundary"].update(object_identity_correct="yes", pane_transparency="clear", glazing="present", observed_state="open", kind="hinged_door", material="glass")
            for direction in a["pathways"].values():
                for state in direction.values():
                    for channel in state:
                        state[channel] = "yes"
            for frame in ("f01", "f02"):
                a["boundary_visibility"][frame].update(visibility="reflection", object_match="yes", box_correct="yes")
        ep = self.run_consensus(first, second)["episodes"][0]
        self.assertFalse(ep["family_annotation_coverage"]["B"]["pathway_labels_available"])
        self.assertEqual(ep["boundary_certification"]["agreed_seen_in_rgb_frames_including_reflection"], ["f01", "f02"])
        for document in (first, second):
            for frame in ("f01", "f02"):
                document["episodes"][0]["answers"]["boundary_visibility"][frame]["visibility"] = "direct"
        ep = self.run_consensus(first, second)["episodes"][0]
        self.assertTrue(ep["family_annotation_coverage"]["B"]["pathway_labels_available"])
        self.assertEqual(ep["boundary_certification"]["agreed_pre_crossing_witness_frames"], ["f01", "f02"])

    def test_open_passage_does_not_invent_sealed_closure(self):
        first, second = self.inputs()
        for document in (first, second):
            document["episodes"][0]["answers"]["boundary"].update(kind="open_passage", observed_state="no_closure", material="air")
        ep = self.run_consensus(first, second)["episodes"][0]
        self.assertFalse(ep["family_annotation_coverage"]["B"]["sealed_counterfactual_defined"])
        self.assertTrue(any("Sealed counterfactual" in warning for warning in ep["consistency_warnings"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
