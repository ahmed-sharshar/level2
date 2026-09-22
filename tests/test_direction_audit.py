"""Read-only audit CLI regression tests using synthetic answers only."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'scripts'))
from audit_direction_versions import audit
from validate_export import node_binary


class DirectionAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = r"""
const C=require('./core.js'),F=require('./full-core.js');
const dataset=C.clone(require('./dataset.json')),catalogue=require('./catalogue.json'),tasks=C.clone(require('./collection-tasks.json'));
dataset.episodes=dataset.episodes.slice(0,1);tasks.layout.episodes=tasks.layout.episodes.slice(0,1);
tasks.audits=Object.fromEntries(Object.entries(tasks.audits).filter(([id])=>id===dataset.episodes[0].id));
const rehash=t=>{t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);return t;};rehash(tasks);
const doc=F.create(dataset,catalogue,tasks,'SYNTHETIC-DIRECTION-AUDIT');
for(const d of C.DIRECTIONS){
 F.setAnswer(doc,0,'answers.surfaces.I1.reachable.'+d+'.open.sun','yes');
 F.setAnswer(doc,0,'answers.surfaces.I1.reachable.'+d+'.open.rain','no');
 F.setAnswer(doc,0,'checks.opening_passage.'+d+'.open',['sunlight']);
}
const revised=C.clone(tasks);revised.layout.episodes[0].directions[0].text+=' SYNTHETIC direction revision.';rehash(revised);
const unrelated=C.clone(tasks);unrelated.audits[dataset.episodes[0].id].trajectory.notes='SYNTHETIC audit note';rehash(unrelated);
process.stdout.write(JSON.stringify({dataset,catalogue,tasks,doc,revised,unrelated}));
"""
        cls.fixture = json.loads(subprocess.check_output([node_binary(), '-e', script], cwd=SITE, text=True))

    def run_audit(self, key='tasks', document=None):
        f = self.fixture
        return audit(document or f['doc'], f[key], f['dataset'], f['catalogue'])

    def test_current_answers_have_no_redo(self):
        result = self.run_audit()
        self.assertTrue(result['valid'])
        self.assertTrue(result['per_answer_provenance_recorded'])
        self.assertEqual(result['counts']['current'], 6)
        self.assertEqual(result['episodes_needing_redo'], 0)
        self.assertFalse(result['benchmark_ready'])

    def test_only_changed_direction_answers_need_redo(self):
        result = self.run_audit('revised')
        self.assertEqual(result['counts']['needs_reanswer'], 3)
        self.assertEqual(result['counts']['current'], 3)
        items = result['episodes'][0]['needs_redo_items']
        self.assertTrue(all('.d1.' in row['path'] for row in items))
        self.assertEqual({row['path'].split('.')[0] for row in items}, {'answers', 'checks'})
        self.assertTrue(all(row['saved_answer'] is not None for row in items))

    def test_unrelated_task_change_does_not_drop_direction_answers(self):
        result = self.run_audit('unrelated')
        self.assertNotEqual(result['source_task_id'], result['published_task_id'])
        self.assertEqual(result['episodes_needing_redo'], 0)

    def test_audit_does_not_mutate_original_inputs(self):
        before = copy.deepcopy(self.fixture)
        self.run_audit('revised')
        self.assertEqual(self.fixture, before)

    def test_legacy_snapshot_is_not_misrepresented_as_recorded_metadata(self):
        doc = copy.deepcopy(self.fixture['doc'])
        del doc['answer_provenance_version']
        for record in doc['episodes']:
            record.pop('answer_provenance', None)
            record.pop('direction_versions', None)
            record.pop('time_tracking', None)
        result = self.run_audit(document=doc)
        self.assertTrue(result['valid'])
        self.assertFalse(result['per_answer_provenance_recorded'])
        self.assertEqual(result['counts']['current'], 6)
        self.assertEqual(self.run_audit('revised', doc)['counts']['needs_reanswer'], 3)

    def test_cli_returns_redo_exit_code_and_never_changes_export(self):
        with tempfile.TemporaryDirectory(prefix='blockmind-direction-audit-') as folder:
            tmp = Path(folder)
            for key in ('doc', 'revised', 'dataset', 'catalogue'):
                (tmp / (key + '.json')).write_text(json.dumps(self.fixture[key]), encoding='utf-8')
            source = tmp / 'doc.json'
            before = source.read_bytes()
            result = subprocess.run([sys.executable, str(SITE / 'scripts/audit_direction_versions.py'),
                                     str(source), '--tasks', str(tmp / 'revised.json'),
                                     '--dataset', str(tmp / 'dataset.json'),
                                     '--catalogue', str(tmp / 'catalogue.json')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
            self.assertEqual(json.loads(result.stdout)['counts']['needs_reanswer'], 3)
            self.assertEqual(source.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
