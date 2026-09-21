#!/usr/bin/env python3
"""End-to-end synthetic fixture -> complete validation -> consensus -> report.

Artifacts remain in a named /tmp directory for inspection. They are synthetic,
not human annotations or benchmark ground truth.
"""
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'scripts'))
from validate_export import node_binary
from report_agreement import CSV_COLUMNS, drop_summary, report_rows, target_result


class CompletePipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = Path(tempfile.mkdtemp(prefix='blockmind_l2_SYNTHETIC_pipeline_'))
        fixture = json.loads(subprocess.check_output([node_binary(), str(SITE / 'tests/make_browser_fixtures.cjs')], text=True))
        for filename, document in [('SYNTHETIC_rater_a.json', fixture['complete']), ('SYNTHETIC_rater_b.json', fixture['second'])]:
            with (cls.work / filename).open('x', encoding='utf-8') as handle:
                json.dump(document, handle)
        cls.validations = []
        for name in ('SYNTHETIC_rater_a.json', 'SYNTHETIC_rater_b.json'):
            output = subprocess.check_output([sys.executable, str(SITE / 'scripts/validate_export.py'), str(cls.work / name), '--require-complete'], text=True)
            cls.validations.append(json.loads(output))
        cls.consensus_path = cls.work / 'SYNTHETIC_consensus.json'
        output = subprocess.check_output([sys.executable, str(SITE / 'scripts/consensus.py'), str(cls.work / 'SYNTHETIC_rater_a.json'), str(cls.work / 'SYNTHETIC_rater_b.json'), '--out', str(cls.consensus_path)], text=True)
        cls.consensus_summary = json.loads(output)
        cls.consensus = json.loads(cls.consensus_path.read_text())
        cls.md = cls.work / 'SYNTHETIC_kappa_report.md'
        cls.csv_path = cls.work / 'SYNTHETIC_kappa_table.csv'
        output = subprocess.check_output([sys.executable, str(SITE / 'scripts/report_agreement.py'), str(cls.consensus_path), '--out', str(cls.md), '--csv', str(cls.csv_path)], text=True)
        cls.report_summary = json.loads(output)

    @classmethod
    def tearDownClass(cls):
        print(json.dumps({'synthetic_artifacts': str(cls.work), 'validation_passed': all(v['valid'] for v in cls.validations),
                          'consensus': cls.consensus_summary, 'report': cls.report_summary}, indent=2))

    def test_complete_validator_and_consensus_real56_fixture(self):
        self.assertTrue(all(result['valid'] for result in self.validations))
        self.assertEqual(self.consensus_summary['episodes_total'], 56)
        self.assertEqual(self.consensus_summary['either_rater_excluded'], 55)
        self.assertEqual(self.consensus_summary['episodes_with_disagreements'], 1)
        self.assertEqual(self.consensus_summary['episodes_all_fields_agreed_known'], 0)

    def test_report_matches_actual_consensus_counts(self):
        with self.csv_path.open(newline='', encoding='utf-8') as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), len(self.consensus['agreement_by_attribute']))
        self.assertEqual(set(rows[0]), set(CSV_COLUMNS))
        for row in rows:
            source = self.consensus['agreement_by_attribute'][row['attribute']]
            for report_key, source_key in [('compared', 'n_compared'), ('agreed', 'n_agreed'), ('disagreed', 'n_disagreement'), ('not_applicable', 'n_not_applicable')]:
                self.assertEqual(int(row[report_key]), source[source_key])
        self.assertGreater(self.report_summary['targets_undefined'], 0)
        self.assertEqual(self.report_summary['targets_met'], 0)
        self.assertIn('not dropped benchmark MCQs', self.md.read_text())

    def test_drop_counts_not_misreported_as_benchmark_items(self):
        summary = drop_summary(self.consensus)
        self.assertEqual(summary['field_cells_with_disagreement'], 1)
        self.assertEqual(summary['episodes_blocked_from_known_gt'], 56)
        self.assertIsNone(summary['benchmark_mcq_items_dropped'])
        self.assertFalse(summary['benchmark_mcq_items_generated'])

    def test_legacy_passage_consistency_cells_are_counted_without_becoming_gt(self):
        summary = drop_summary(self.consensus)
        pathways = [field for ep in self.consensus['episodes'] for path, field in ep['fields'].items() if path.startswith('pathways.')]
        self.assertEqual(len(pathways), 56 * 2 * 2 * 4)
        self.assertEqual(summary['consistency_only_field_cells'], len(pathways))
        self.assertTrue(all(field['consistency_only'] and not field['eligible_known_gt'] and not field['eligible_nd_gt'] for field in pathways))
        self.assertEqual(summary['consistency_check_disagreements'], sum(field['state'] == 'disagreement' for field in pathways))

    def test_conditional_not_applicable_count_preserved(self):
        data = json.loads(json.dumps(self.consensus))
        attribute = 'surfaces.*.substrate_material'
        data['agreement_by_attribute'][attribute]['n_not_applicable'] = 3
        row = next(r for r in report_rows(data) if r['attribute'] == attribute)
        self.assertEqual(row['not_applicable'], 3)
        self.assertEqual(row['unanswered'], 0)

    def test_empty_comparison_report_has_csv_header(self):
        data = json.loads(json.dumps(self.consensus))
        data['agreement_by_attribute'] = {}
        data['episodes'] = []
        source = self.work / 'SYNTHETIC_empty_consensus.json'
        with source.open('x', encoding='utf-8') as handle:
            json.dump(data, handle)
        csv_path = self.work / 'SYNTHETIC_empty.csv'
        subprocess.check_output([sys.executable, str(SITE / 'scripts/report_agreement.py'), str(source), '--out', str(self.work / 'SYNTHETIC_empty.md'), '--csv', str(csv_path)], text=True)
        with csv_path.open(newline='', encoding='utf-8') as handle:
            rows = list(csv.reader(handle))
        self.assertEqual(rows, [CSV_COLUMNS])

    def test_existing_outputs_not_overwritten(self):
        before = self.md.read_bytes()
        result = subprocess.run([sys.executable, str(SITE / 'scripts/report_agreement.py'), str(self.consensus_path), '--out', str(self.md)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.md.read_bytes(), before)

    def test_undefined_kappa_is_not_passed_target(self):
        self.assertEqual(target_result(.8, None), 'undefined')
        self.assertEqual(target_result(.8, .8), 'met')
        self.assertEqual(target_result(.8, .79), 'not met')


if __name__ == '__main__':
    unittest.main(verbosity=2)
