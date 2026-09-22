#!/usr/bin/env python3
"""Read-only check of an annotator export against the currently published tasks.

Reports exactly which Sun & rain / Through-the-opening answers need redoing.
Never modifies the export, task package, or human answers. This is provenance
validation, not physics validation or research approval.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from validate_export import SITE, node_binary, read_json


def audit(document, tasks, dataset, catalogue, node=None):
    code = r"""
const fs=require('fs'),F=require(process.argv[1]),C=require(process.argv[2]);
const {document:doc,tasks,dataset:D,catalogue:K}=JSON.parse(fs.readFileSync(0,'utf8'));
const errors=[...F.validate(doc,D,K),...F.validateTasks(tasks,D,K)];
if(errors.length){process.stdout.write(JSON.stringify({valid:false,errors}));process.exit(0);}
const episodes=[],totals={current:0,needs_reanswer:0,unanswered:0};
for(const [i,r] of doc.episodes.entries()){
 const paths=F.directionalPaths(doc,i);
 const counts={current:0,needs_reanswer:0,unanswered:0},needs_redoing=[];
 for(const path of paths){
   const result=F.answerStatus(doc,i,path,tasks);
   if(!Object.hasOwn(counts,result.state))continue;
   counts[result.state]++;totals[result.state]++;
   if(result.state==='needs_reanswer')needs_redoing.push({path,reason:result.reason||'Direction or scenario version changed',saved_answer:F.get(r,path),provenance:result.provenance||null,saved_context:result.saved_context||F.directionContext(doc,i,path),source_task_id:result.task_id||doc.task_id,current_context:result.current_context||null});
 }
 episodes.push({episode_id:r.episode_id,counts,needs_redo:needs_redoing.length>0,needs_redo_items:needs_redoing});
}
process.stdout.write(JSON.stringify({schema:'blockmind_l2_direction_audit_v1',valid:true,annotator:doc.annotator,source_task_id:doc.task_id,published_task_id:tasks.task_id,per_answer_provenance_recorded:doc.answer_provenance_version===1,counts:totals,episodes_needing_redo:episodes.filter(e=>e.needs_redo).length,episodes,benchmark_ready:false}));
"""
    result = subprocess.run(
        [node_binary(node), '-e', code, str(SITE / 'full-core.js'), str(SITE / 'core.js')],
        input=json.dumps({'document': document, 'tasks': tasks, 'dataset': dataset,
                          'catalogue': catalogue}, allow_nan=False),
        text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    parser.add_argument('--tasks', type=Path, default=SITE / 'collection-tasks.json')
    parser.add_argument('--dataset', type=Path, default=SITE / 'dataset.json')
    parser.add_argument('--catalogue', type=Path, default=SITE / 'catalogue.json')
    parser.add_argument('--node')
    args = parser.parse_args()
    try:
        result = audit(*(read_json(p) for p in (args.export, args.tasks, args.dataset, args.catalogue)), node=args.node)
        print(json.dumps(result, indent=2))
        return 2 if not result['valid'] else 1 if result['episodes_needing_redo'] else 0
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({'valid': False, 'errors': [str(exc)]}, indent=2))
        return 2


if __name__ == '__main__':
    sys.exit(main())
