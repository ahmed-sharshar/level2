'use strict';
// Disposable synthetic votes. No real labels or research approvals are created.
const assert=require('assert');
const {execFileSync}=require('child_process');
const path=require('path');
const C=require('../core.js'),F=require('../full-core.js');
const fixture=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'full_core.test.js'),'--fixture'],{encoding:'utf8'}));
const {dataset,catalogue,tasks}=fixture;
const clone=C.clone;
const change=(value,fn)=>{const copy=clone(value);fn(copy);return copy;};
const oldScope=value=>change(value,doc=>{delete doc.boundary_questions_version;doc.episodes.forEach(r=>delete r.checks.boundary);});
const legacyDraft=oldScope(fixture.draft),legacyComplete=oldScope(fixture.complete);
const query=(doc,key)=>F.questions(doc,0,dataset,catalogue).find(q=>q.path===key);
const pair=doc=>F.consensus(doc,change(doc,d=>d.annotator='second independent rater'),dataset,catalogue);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}

test('new records have explicit scope and two blank human opening fields',()=>{
  const d=fixture.draft;
  assert.equal(d.boundary_questions_version,F.BOUNDARY_QUESTIONS_VERSION);
  assert.deepStrictEqual(d.episodes[0].checks.boundary,{width_class:null,blockage:null});
  assert.deepStrictEqual(F.validate(d,dataset,catalogue),[]);
});
test('exactly two new required questions and no other field loss',()=>{
  const before=F.questions(legacyDraft,0,dataset,catalogue).map(q=>q.path);
  const after=F.questions(fixture.draft,0,dataset,catalogue).map(q=>q.path);
  assert.deepStrictEqual(after.filter(p=>!before.includes(p)),['checks.boundary.width_class','checks.boundary.blockage']);
  assert(before.every(p=>after.includes(p)));
  assert.equal(F.progress(fixture.draft,0,dataset,catalogue).total,F.progress(legacyDraft,0,dataset,catalogue).total+2);
});
test('simple opening kind choices include broad door and retain detailed legacy labels',()=>{
  assert.deepStrictEqual(query(fixture.draft,'answers.boundary.kind').options.map(o=>o.value),['door','window','open_passage',C.ND]);
  for(const kind of C.FIELDS.kind){
    const d=change(fixture.draft,x=>x.episodes[0].answers.boundary.kind=kind);
    assert.deepStrictEqual(F.validate(d,dataset,catalogue),[]);
    assert(query(d,'answers.boundary.kind').options.some(o=>o.value===kind));
  }
});
test('transparency and observed-state codes stay backward-compatible with requested labels',()=>{
  assert.deepStrictEqual(query(fixture.draft,'answers.boundary.pane_transparency').options,[{value:'clear',label:'Clear glass'},{value:'obscured',label:'Frosted / tinted / patterned'},{value:'opaque',label:"Solid (can't see through)"},{value:C.ND,label:'Not sure'}]);
  const state=query(fixture.draft,'answers.boundary.observed_state').options;
  assert.deepStrictEqual(state.map(o=>o.value),C.FIELDS.observed_state);
  assert(state.some(o=>o.value==='ajar'&&o.label==='Partly'));
  assert(state.some(o=>o.value==='no_closure'));
});
test('opening width and blockage options cover requested choices including uncertainty',()=>{
  const width=query(fixture.draft,'checks.boundary.width_class'),block=query(fixture.draft,'checks.boundary.blockage');
  assert.deepStrictEqual(width.options.map(o=>o.value),F.WIDTH_CLASS);
  assert.deepStrictEqual(block.options.map(o=>o.value),F.BOUNDARY_BLOCKAGE);
  assert.equal(block.options[0].label,'Nothing');
  assert(!query(legacyDraft,'checks.boundary.width_class'));
});
test('legacy unmarked v2 drafts and complete exports remain valid under their old scope',()=>{
  assert.deepStrictEqual(F.validate(legacyDraft,dataset,catalogue),[]);
  assert.deepStrictEqual(F.validate(legacyComplete,dataset,catalogue,true),[]);
  assert(F.needsBoundaryUpgrade(legacyDraft));
  assert(!F.needsBoundaryUpgrade(fixture.draft));
});
test('upgrade preserves all old human facts, notes, task identity, profile and UI without mutating source',()=>{
  const source=change(legacyDraft,d=>{
    const r=d.episodes[0];r.answers.boundary.kind='sliding_door';r.answers.boundary.material='Custom human panel material';
    r.answers.boundary.notes='Keep this boundary note';r.answers.notes='Keep this episode note';
    r.answers.surfaces.I1.material='Human painted wood';r.answers.surfaces.I1.substrate_material='Previously entered hidden substrate';
    d.profile='l2_l3';d.ui={episode:0,section:'boundary',question:4,frame:5};
  });
  const snapshot=clone(source),{doc,report}=F.upgradeBoundary(source,dataset,catalogue);
  assert.deepStrictEqual(source,snapshot);
  assert.deepStrictEqual(doc.episodes[0].answers,source.episodes[0].answers);
  for(const key of ['schema','build_id','task_id','tasks','annotator','profile','created_at','ui'])assert.deepStrictEqual(doc[key],source[key],key);
  assert.equal(report.upgraded,true);assert.equal(report.added_questions,2);
  assert.deepStrictEqual(report.reopened_episodes,[]);
  assert.deepStrictEqual(F.validate(doc,dataset,catalogue),[]);
});
test('completion is reopened only for the newly unanswered opening facts and provenance keeps old timestamps',()=>{
  const source=clone(legacyComplete),{doc,report}=F.upgradeBoundary(source,dataset,catalogue);
  assert.equal(doc.annotation_status,'draft');assert.equal(doc.episodes[0].status,'in_progress');
  assert.equal(doc.episodes[0].completed_at,null);assert.deepStrictEqual(report.reopened_episodes,[source.episodes[0].episode_id]);
  assert.deepStrictEqual(F.progress(doc,0,dataset,catalogue).missing.map(q=>q.path),['checks.boundary.width_class','checks.boundary.blockage']);
  assert(F.validate(doc,dataset,catalogue,true).some(e=>e.includes('checks.boundary.width_class')));
  const log=doc.migration_log.at(-1);
  assert.equal(log.source_sha256,C.sha256(C.stableStringify(source)));
  assert.equal(log.source_annotation_status,'complete');
  assert.equal(log.source_episode_statuses[0].completed_at,source.episodes[0].completed_at);
  assert.equal(log.source_task_id,log.target_task_id);
});
test('explicit exclusions are preserved without demanding opening labels',()=>{
  const old=change(legacyComplete,d=>{d.episodes[0].status='excluded';d.episodes[0].exclusion_reason='Synthetic unusable sequence';});
  const {doc,report}=F.upgradeBoundary(old,dataset,catalogue);
  assert.equal(doc.episodes[0].status,'excluded');assert.equal(doc.episodes[0].exclusion_reason,old.episodes[0].exclusion_reason);
  assert.equal(report.added_questions,0);assert.deepStrictEqual(report.reopened_episodes,[]);
  assert.deepStrictEqual(F.validate(doc,dataset,catalogue,true),[]);
  assert.equal(pair(doc).episodes[0].boundary_annotation_coverage.all_five_questions_collected,false);
});
test('upgrade is idempotent and preserves already entered new answers',()=>{
  const current=change(fixture.draft,d=>{d.episodes[0].checks.boundary.width_class='double_door';d.episodes[0].checks.boundary.blockage='blinds';});
  const {doc,report}=F.upgradeBoundary(current,dataset,catalogue);
  assert.deepStrictEqual(doc,current);assert.equal(report.upgraded,false);
});
test('foreign-rater and malformed upgrades are rejected without mutation',()=>{
  assert.throws(()=>F.upgradeBoundary(legacyDraft,dataset,catalogue,'another rater'),/own annotation/);
  const invalid=change(legacyDraft,d=>d.episodes[0].answers.boundary.pane_transparency='invented');
  assert.throws(()=>F.upgradeBoundary(invalid,dataset,catalogue),/invalid value/);
  assert(!Object.hasOwn(invalid,'boundary_questions_version'));
});
test('scope marker cannot masquerade as an unsupported or missing boundary extension',()=>{
  for(const value of [null,0,2,'1']){
    const d=change(fixture.draft,x=>x.boundary_questions_version=value);
    assert(F.validate(d,dataset,catalogue).some(e=>e.includes('boundary_questions_version')));
  }
  assert(F.validate(change(fixture.draft,d=>delete d.episodes[0].checks.boundary),dataset,catalogue).length);
  assert(F.validate(change(fixture.draft,d=>delete d.boundary_questions_version),dataset,catalogue).length);
});
test('all width and blockage values validate and invalid values are rejected even in drafts',()=>{
  for(const [key,values]of [['width_class',F.WIDTH_CLASS],['blockage',F.BOUNDARY_BLOCKAGE]]){
    for(const value of values)assert.deepStrictEqual(F.validate(change(fixture.draft,d=>d.episodes[0].checks.boundary[key]=value),dataset,catalogue),[]);
    for(const value of ['',false,1,[],{},'invalid'])assert(F.validate(change(fixture.draft,d=>d.episodes[0].checks.boundary[key]=value),dataset,catalogue).length);
  }
});
test('fresh completion requires new fields and explicit uncertainty still needs scene notes',()=>{
  for(const key of ['width_class','blockage'])assert(F.validate(change(fixture.complete,d=>d.episodes[0].checks.boundary[key]=null),dataset,catalogue,true).some(e=>e.includes('checks.boundary.'+key)));
  assert(F.validate(change(fixture.complete,d=>d.episodes[0].answers.notes=''),dataset,catalogue,true).some(e=>e.includes('short explanation')));
});
test('multiple and other blockers require a scene note without adding another question',()=>{
  for(const value of ['multiple','other']){
    const d=change(fixture.complete,x=>{x.episodes[0].checks.boundary.blockage=value;x.episodes[0].answers.notes='';});
    assert(F.validate(d,dataset,catalogue,true).some(e=>e.includes('name the multiple or other opening blockers')));
    d.episodes[0].answers.notes='Synthetic test only: a curtain and a chair block the opening.';
    assert.deepStrictEqual(F.validate(d,dataset,catalogue,true),[]);
  }
});
test('same-boundary task migration preserves new labels and changed boundary resets them',()=>{
  const source=change(fixture.draft,d=>{d.episodes[0].checks.boundary.width_class='double_door';d.episodes[0].checks.boundary.blockage='curtains';});
  const same=F.migrate(source,tasks,dataset,catalogue,source.annotator).doc;
  assert.deepStrictEqual(same.episodes[0].checks.boundary,source.episodes[0].checks.boundary);
  const different=change(tasks,t=>{t.layout.episodes[0].boundary_boxes[0].x0=.02;t.layout.layout_id='';t.task_id=F.taskId(t);});
  assert.deepStrictEqual(F.migrate(source,different,dataset,catalogue,source.annotator).doc.episodes[0].checks.boundary,{width_class:null,blockage:null});
});
test('old task migration creates blank new fields without changing existing material votes',()=>{
  const old=change(legacyComplete,d=>d.episodes[0].answers.boundary.material='Original human material');
  const next=F.migrate(old,tasks,dataset,catalogue,old.annotator).doc;
  assert.equal(next.boundary_questions_version,F.BOUNDARY_QUESTIONS_VERSION);
  assert.deepStrictEqual(next.episodes[0].checks.boundary,{width_class:null,blockage:null});
  assert.equal(next.episodes[0].answers.boundary.material,'Original human material');
});
test('consensus rejects a silently mixed old/new annotation scope',()=>{
  assert.throws(()=>F.consensus(legacyComplete,change(fixture.complete,d=>d.annotator='second independent rater'),dataset,catalogue),/same boundary question version/);
});
test('legacy consensus explicitly reports missing opening scope instead of fabricating votes',()=>{
  const report=pair(legacyComplete),episode=report.episodes[0];
  assert.equal(report.boundary_questions_version,0);
  assert.equal(episode.boundary_annotation_coverage.all_five_questions_collected,false);
  assert(episode.boundary_annotation_coverage.blocked_fields.includes('checks.boundary.width_class'));
  assert(!Object.hasOwn(episode.fields,'checks.boundary.width_class'));
  assert(episode.consistency_warnings.some(w=>w.includes('Legacy annotation scope')));
});
test('new opening votes participate in exact agreement and independent-rater disagreement',()=>{
  const first=change(fixture.complete,d=>{Object.assign(d.episodes[0].answers.boundary,{kind:'door',pane_transparency:'clear',observed_state:'closed'});Object.assign(d.episodes[0].checks.boundary,{width_class:'double_door',blockage:'curtains'});});
  const agreed=pair(first);
  assert.equal(agreed.boundary_questions_version,1);
  assert.equal(agreed.episodes[0].boundary_annotation_coverage.all_five_labels_agreed_known,true);
  assert.equal(agreed.agreement_by_attribute['checks.boundary.width_class'].n_agreed,1);
  const second=change(first,d=>{d.annotator='second independent rater';d.episodes[0].checks.boundary.blockage='none';});
  const conflict=F.consensus(first,second,dataset,catalogue).episodes[0];
  assert.equal(conflict.fields['checks.boundary.blockage'].state,'disagreement');
  assert.equal(conflict.boundary_annotation_coverage.all_five_labels_agreed_known,false);
  assert(conflict.boundary_annotation_coverage.blocked_fields.includes('checks.boundary.blockage'));
});
test('explicit opening uncertainty remains uncertainty, not no blockage or a width estimate',()=>{
  const report=pair(fixture.complete),row=report.episodes[0];
  assert.equal(row.fields['checks.boundary.width_class'].state,'agreed_not_determinable');
  assert.equal(row.fields['checks.boundary.blockage'].eligible_known_gt,false);
  assert.equal(row.boundary_annotation_coverage.all_five_questions_collected,true);
  assert.equal(row.boundary_annotation_coverage.all_five_labels_agreed_known,false);
});
console.log(JSON.stringify({passed}));
