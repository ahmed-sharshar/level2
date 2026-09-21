// Disposable synthetic test data only. Never publish these as research tasks.
const C=require('../core.js'),F=require('../full-core.js'),D=require('../dataset.json'),K=require('../catalogue.json');
const tasks=F.createTasks(D,K,'SYNTHETIC TEST');
tasks.settings.hierarchy_reviewed=true;tasks.settings.hierarchy_reviewer='SYNTHETIC TEST';
tasks.settings.protocol_reviewed=true;tasks.settings.protocol_reviewer='SYNTHETIC TEST';tasks.settings.protocol_notes='TEST ONLY; no real approval.';
for(const [i,ep]of tasks.layout.episodes.entries()){
  if(i){ep.disposition='exclude';ep.exclusion_reason='SYNTHETIC TEST ONLY';continue;}
  ep.setup_reviewed=true;ep.setup_notes='SYNTHETIC TEST ONLY';
  ep.directions=[{id:'d1',text:'SYNTHETIC direction from opening',reference_frame:'f01',x:.4,y:.5},{id:'d2',text:'SYNTHETIC direction from roof',reference_frame:'f07',x:.5,y:.3}];
}
tasks.layout.layout_id=C.layoutId(tasks.layout);tasks.task_id=F.taskId(tasks);
let errors=F.validateTasks(tasks,D,K,true);if(errors.length)throw Error(JSON.stringify(errors));
const blank=F.create(D,K,tasks,'full-browser-test');const complete=C.clone(blank);
const set=(o,p,v)=>{const a=p.split('.');for(const k of a.slice(0,-1))o=o[k];o[a.at(-1)]=v;};
for(const q of F.questions(complete,0,D,K))set(complete.episodes[0],q.path,q.kind==='multiselect'?[C.ND]:C.ND);
complete.episodes[0].answers.notes='SYNTHETIC AUTOMATED TEST ONLY: explicit uncertainty, not real human annotation.';
complete.episodes[0].status='complete';complete.episodes[0].completed_at=new Date().toISOString();complete.annotation_status='complete';
errors=F.validate(complete,D,K,true);if(errors.length)throw Error(JSON.stringify(errors));
const second=C.clone(complete);second.annotator='full-second-test';second.episodes[0].answers.scene.crossing_valid='yes';
process.stdout.write(JSON.stringify({tasks,blank,complete,second}));
