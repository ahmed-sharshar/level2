"""Synthetic exports only; nothing is written into actual annotation data."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / "scripts"))
from validate_export import node_binary


class GuidedValidatorCLITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code = """
const fs=require('fs'),g=require(process.argv[1]+'/guided-core.js');
const d=JSON.parse(fs.readFileSync(process.argv[1]+'/dataset.json'));
const c=JSON.parse(fs.readFileSync(process.argv[1]+'/catalogue.json'));
process.stdout.write(JSON.stringify(g.create(d,c,'synthetic-validator-test')));
"""
        cls.blank = json.loads(subprocess.check_output([node_binary(), "-e", code, str(SITE)], text=True))

    def run_document(self, document=None, raw=None):
        with tempfile.TemporaryDirectory(prefix="blockmind-guided-test-") as temporary:
            path = Path(temporary) / "synthetic.json"
            path.write_text(raw if raw is not None else json.dumps(document), encoding="utf-8")
            before = path.read_bytes()
            process = subprocess.run([sys.executable, str(SITE / "scripts/validate_guided.py"), str(path)],
                                     text=True, capture_output=True, check=False)
            self.assertEqual(path.read_bytes(), before)
            return process.returncode, json.loads(process.stdout)

    def test_real_dataset_blank_draft_valid_but_not_benchmark_ready(self):
        code, result = self.run_document(self.blank)
        self.assertEqual(code, 0)
        self.assertTrue(result["valid"])
        self.assertFalse(result["benchmark_ready"])
        self.assertEqual(result["episodes"], len(self.blank["episodes"]))
        self.assertEqual(result["answered_basic_fields"], 0)
        self.assertGreater(result["total_basic_fields"], 0)

    def test_answer_and_not_sure_count_without_implying_complete(self):
        document = json.loads(json.dumps(self.blank))
        document["episodes"][0]["answers"]["scene"]["crossing_valid"] = "yes"
        document["episodes"][0]["answers"]["scene"]["shelter"] = "not_determinable"
        code, result = self.run_document(document)
        self.assertEqual(code, 0)
        self.assertEqual(result["answered_basic_fields"], 2)
        self.assertFalse(result["benchmark_ready"])

    def test_bad_enum_and_false_certification_fail(self):
        for invalid in ("enum", "readiness"):
            document = json.loads(json.dumps(self.blank))
            if invalid == "enum":
                document["episodes"][0]["answers"]["scene"]["shelter"] = "nonsense"
            else:
                document["benchmark_ready"] = True
            code, result = self.run_document(document)
            self.assertEqual(code, 1)
            self.assertFalse(result["valid"])
            self.assertTrue(result["errors"])

    def test_invalid_json_duplicate_keys_and_malformed_root_fail(self):
        for raw in ("{", '{"schema":1,"schema":2}', "null", "[]"):
            code, result = self.run_document(raw=raw)
            self.assertNotEqual(code, 0)
            self.assertFalse(result["valid"])
            self.assertTrue(result["errors"])


if __name__ == "__main__":
    unittest.main()
