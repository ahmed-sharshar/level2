"""Synthetic end-to-end full collector CLI checks; no research GT is generated."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'scripts'))
from validate_export import node_binary, validate_document
from consensus import calculate


class FullBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run([node_binary(), str(SITE / 'tests/full_core.test.js'), '--fixture'],
                                capture_output=True, text=True, check=True)
        cls.fixture = json.loads(result.stdout)

    def test_complete_and_draft_validation(self):
        f = self.fixture
        self.assertEqual(validate_document(f['complete'], f['dataset'], f['catalogue'], True), [])
        self.assertEqual(validate_document(f['draft'], f['dataset'], f['catalogue']), [])
        self.assertTrue(validate_document(f['draft'], f['dataset'], f['catalogue'], True))

    def test_tasks_dispatch(self):
        f = self.fixture
        self.assertEqual(validate_document(f['tasks'], f['dataset'], f['catalogue'], True), [])

    def test_consensus_exact_js_dispatch(self):
        f = self.fixture
        result = calculate(f['complete'], f['second'], f['dataset'], f['catalogue'])
        self.assertEqual(result['source_schema'], 'blockmind_l2_annotations_v2')
        self.assertEqual(result['episodes'][0]['fields']['scene.crossing_valid']['state'], 'agreed_not_determinable')
        self.assertFalse(result['episodes'][0]['family_annotation_coverage']['C']['enabled'])
        self.assertEqual(result['agreement_by_attribute']['surfaces.*.visibility.*']['n_not_applicable'], 72)

    def test_consensus_same_rater_blocked(self):
        f = self.fixture
        with self.assertRaisesRegex(ValueError, 'distinct independent'):
            calculate(f['complete'], f['complete'], f['dataset'], f['catalogue'])

    def test_report_cli_consumes_full_consensus(self):
        f = self.fixture
        result = calculate(f['complete'], f['second'], f['dataset'], f['catalogue'])
        with tempfile.TemporaryDirectory(prefix='blockmind-full-test-') as folder:
            tmp = Path(folder)
            source = tmp / 'synthetic-consensus.json'
            source.write_text(json.dumps(result), encoding='utf-8')
            cmd = [sys.executable, str(SITE / 'scripts/report_agreement.py'), str(source),
                   '--out', str(tmp / 'report.md'), '--csv', str(tmp / 'report.csv')]
            process = subprocess.run(cmd, capture_output=True, text=True, check=True)
            payload = json.loads(process.stdout)
            self.assertGreater(payload['attributes'], 0)
            self.assertTrue((tmp / 'report.md').is_file())
            self.assertIn('no adjudication', (tmp / 'report.md').read_text().lower())

    def test_cli_validates_complete_file_and_writes_consensus(self):
        f = self.fixture
        with tempfile.TemporaryDirectory(prefix='blockmind-full-test-') as folder:
            tmp = Path(folder)
            for key in ('dataset', 'catalogue', 'complete', 'second'):
                (tmp / (key + '.json')).write_text(json.dumps(f[key]), encoding='utf-8')
            shared = ['--dataset', str(tmp / 'dataset.json'), '--catalogue', str(tmp / 'catalogue.json')]
            validation = subprocess.run([sys.executable, str(SITE / 'scripts/validate_export.py'),
                                         str(tmp / 'complete.json'), '--require-complete', *shared],
                                        capture_output=True, text=True, check=True)
            self.assertTrue(json.loads(validation.stdout)['valid'])
            output = tmp / 'consensus.json'
            subprocess.run([sys.executable, str(SITE / 'scripts/consensus.py'), str(tmp / 'complete.json'),
                            str(tmp / 'second.json'), '--out', str(output), *shared],
                           capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(output.read_text())['task_id'], f['tasks']['task_id'])


if __name__ == '__main__':
    unittest.main()
