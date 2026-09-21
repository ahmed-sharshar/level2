'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');
const F = require('../full-core.js');
const K = require('../compact-core.js');
const clone = C.clone;

// Eight synthetic targets match the common production scene without changing
// any production research settings, target geometry or human annotation.
const dataset = {build_id:'compact-unit-test',episodes:[{id:'unit-scene',frames:C.FRAMES.map((id,i)=>({
  id,side:i<6?'indoor':'exterior',boundary_pixels:150,boundary_bbox:[.1,.1,.6,.7],objects:[{object_id:1,mpcat40:3}]
})),proposed_markers:['indoor','exterior'].flatMap(side=>[1,2,3,4].map(n=>({
  id:(side==='indoor'?'I':'E')+n,side,anchor_frame:side==='indoor'?'f01':'f07',x:n/6,y:.3,object_id:1,mpcat40:3,observations:[]
})))}]};
const catalogue = {build_id:dataset.build_id,materials:[
  {id:'wood',label:'Wood panel',family:'wood',reference:{vhc_class:'medium'}},
  {id:'glass',label:'Clear glass',family:'glass',reference:{vhc_class:'high'}}
]};
function approved() {
  const t=F.createTasks(dataset,catalogue,'Synthetic research coordinator');
  Object.assign(t.settings,{hierarchy_reviewed:true,hierarchy_reviewer:'Test',protocol_reviewed:true,protocol_reviewer:'Test'});
  t.layout.episodes[0].setup_reviewed=true;
  t.layout.episodes[0].directions=[
    {id:'d1',text:'From the visible tree toward the marked door',reference_frame:'f07',x:.2,y:.5},
    {id:'d2',text:'From the visible side wall toward the marked door',reference_frame:'f07',x:.8,y:.5}
  ];
  t.layout.layout_id=C.layoutId(t.layout); t.task_id=F.taskId(t);return t;
}
const tasks=approved(),doc=F.create(dataset,catalogue,tasks,'Synthetic rater');
let passed=0;
function test(name,fn) { fn(); passed++; console.log('PASS '+name); }
function paths(panels) { return panels.flatMap(p=>p.questions.map(q=>q.path)); }
function assertCoverage(d,ds=dataset,cat=catalogue) {
  const expected=F.questions(d,0,ds,cat).map(q=>q.path),actual=paths(K.panels(d,0,ds,cat));
  assert.deepStrictEqual(actual.slice().sort(),expected.slice().sort());
  assert.strictEqual(new Set(actual).size,actual.length);
}

test('every required field appears exactly once',()=>assertCoverage(doc));
test('eight red point forms and four sun/rain scenarios keep every cell',()=>{
  const surfaces=K.panels(doc,0,dataset,catalogue,'surfaces'),exposure=K.panels(doc,0,dataset,catalogue,'exposure');
  assert.strictEqual(surfaces.length,8);assert.strictEqual(exposure.length,4);
  assert(surfaces.every(p=>p.questions.length===10));
  assert(exposure.every(p=>p.questions.length===16));
  assert.deepStrictEqual(exposure.map(p=>[p.direction.id,p.condition]),[['d1','open'],['d1','sealed'],['d2','open'],['d2','sealed']]);
  for(const panel of exposure)for(const marker of tasks.layout.episodes[0].markers)
    assert.deepStrictEqual(panel.questions.filter(q=>q.marker_id===marker.id).map(q=>q.path.split('.').at(-1)),['sun','rain']);
});
test('pathway groups retain four scenario checks with all channels and exclusive non-answers',()=>{
  const panels=K.panels(doc,0,dataset,catalogue,'pathways');assert.strictEqual(panels.length,4);
  for(const p of panels){assert.strictEqual(p.questions.length,1);assert.strictEqual(p.questions[0].kind,'multiselect');assert.deepStrictEqual(p.questions[0].options.map(o=>o.value),['sunlight','rain','air','visible_light','none',C.ND]);}
});
test('section order preserved with one five-field boundary overview',()=>{
  const panels=K.panels(doc,0,dataset,catalogue);
  assert.deepStrictEqual([...new Set(panels.map(p=>p.section))],F.SECTIONS);
  assert(panels.filter(p=>['scene','visibility'].includes(p.section)).every(p=>p.questions.length===1));
  const boundary=panels.filter(p=>p.kind==='boundary');assert.strictEqual(boundary.length,1);
  assert.deepStrictEqual(boundary[0].questions.map(q=>q.path).sort(),[
    'answers.boundary.kind','answers.boundary.pane_transparency','answers.boundary.observed_state',
    'checks.boundary.width_class','checks.boundary.blockage'].sort());
  assert(panels.filter(p=>p.section==='boundary'&&p.kind!=='boundary').every(p=>p.kind==='single'&&p.questions.length===1));
});
test('grouping and progress do not mutate annotations/tasks/reference data',()=>{
  const before=JSON.stringify({doc,dataset,catalogue});K.panels(doc,0,dataset,catalogue);K.progress(doc,0,dataset,catalogue);
  assert.strictEqual(JSON.stringify({doc,dataset,catalogue}),before);
});
test('question metadata remains identical to full core',()=>{
  const expected=new Map(F.questions(doc,0,dataset,catalogue).map(q=>[q.path,q]));
  for(const panel of K.panels(doc,0,dataset,catalogue))for(const question of panel.questions)assert.deepStrictEqual(question,expected.get(question.path));
});
test('unchecked sun/rain fields remain missing, not No',()=>{
  const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'exposure')[0],r=d.episodes[0];
  assert.strictEqual(K.panelProgress(p,r).answered,0);
  F.set(r,p.questions[0].path,'yes');const partial=K.panelProgress(p,r);
  assert.strictEqual(partial.answered,1);assert.strictEqual(partial.missing.length,15);assert(!partial.complete);
  assert.strictEqual(F.get(r,p.questions[1].path),null);
});
test('explicit ND counts as answered while unchanged validator still requires explanation',()=>{
  const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'surfaces')[0],r=d.episodes[0];
  for(const q of p.questions)F.set(r,q.path,C.ND);
  assert(K.panelProgress(p,r).complete);
  assert(F.validateEpisode(d,0,dataset,catalogue,true).some(e=>e.includes('short explanation')));
});
test('dynamic substrate questions remain on same form and affect completeness',()=>{
  const d=clone(doc),r=d.episodes[0];let p=K.panels(d,0,dataset,catalogue,'surfaces')[0];
  for(const q of p.questions)F.set(r,q.path,C.ND);
  F.set(r,'answers.surfaces.I1.substrate_known','yes');p=K.panels(d,0,dataset,catalogue,'surfaces')[0];
  assert.strictEqual(p.questions.length,12);assert(!K.panelProgress(p,r).complete);assertCoverage(d);
  F.set(r,'answers.surfaces.I1.substrate_known','no');assert.strictEqual(K.panels(d,0,dataset,catalogue,'surfaces')[0].questions.length,10);
});
test('pending research directions remain blocked even with historical answers',()=>{
  const t=F.createTasks(dataset,catalogue),d=F.create(dataset,catalogue,t,'Synthetic rater');
  const p=K.panels(d,0,dataset,catalogue,'exposure')[0];for(const q of p.questions)F.set(d.episodes[0],q.path,'no');
  assert(p.blocked&&p.block_reason);assert(!K.panelProgress(p,d.episodes[0]).complete);
});
test('group progress exposes honest panel and raw field denominators',()=>{
  const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'exposure')[0];for(const q of p.questions)F.set(d.episodes[0],q.path,'no');
  const progress=K.progress(d,0,dataset,catalogue);
  assert.deepStrictEqual(progress.sections.exposure,{answered:1,total:4,fields_answered:16,fields_total:64});
  assert.strictEqual(progress.fields_total,F.progress(d,0,dataset,catalogue).total);
});
test('explicit catalogue selection supplies material label and ID only',()=>{
  const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'surfaces')[0],r=d.episodes[0];
  const edits=K.mappedFieldEdit(p,'answers.surfaces.I1.hierarchy_id','wood',catalogue);
  assert.deepStrictEqual(edits,[{path:'answers.surfaces.I1.hierarchy_id',value:'wood'},{path:'answers.surfaces.I1.material',value:'Wood panel'}]);
  assert.strictEqual(r.answers.surfaces.I1.material,null);K.applyEdits(r,edits);
  assert.strictEqual(r.answers.surfaces.I1.material,'Wood panel');assert.strictEqual(r.answers.surfaces.I1.hierarchy_id,'wood');
  assert.strictEqual(r.answers.surfaces.I1.reflectance,null);assert.strictEqual(r.answers.surfaces.I1.finish,null);assert.strictEqual(r.answers.surfaces.I1.reachable.d1.open.sun,null);
});
test('typed material does not infer a hierarchy, physics or other fields',()=>{
  const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'surfaces')[0],r=d.episodes[0];
  K.applyEdits(r,K.mappedFieldEdit(p,'answers.surfaces.I1.material','wood',catalogue));
  assert.strictEqual(r.answers.surfaces.I1.hierarchy_id,null);assert.strictEqual(r.answers.surfaces.I1.substrate_known,null);
});
test('Other and Not sure hierarchy choices preserve prior descriptive text',()=>{
  for(const value of ['__other__',C.ND,null]){
    const d=clone(doc),p=K.panels(d,0,dataset,catalogue,'surfaces')[0],r=d.episodes[0];r.answers.surfaces.I1.material='Handwritten composite description';
    K.applyEdits(r,K.mappedFieldEdit(p,'answers.surfaces.I1.hierarchy_id',value,catalogue));
    assert.strictEqual(r.answers.surfaces.I1.material,'Handwritten composite description');
  }
});
test('conditional substrate mapping touches substrate only',()=>{
  const d=clone(doc),r=d.episodes[0];r.answers.surfaces.I1.substrate_known='yes';r.answers.surfaces.I1.material='paint';
  const p=K.panels(d,0,dataset,catalogue,'surfaces')[0];K.applyEdits(r,K.mappedFieldEdit(p,'answers.surfaces.I1.substrate_hierarchy_id','wood',catalogue));
  assert.strictEqual(r.answers.surfaces.I1.substrate_material,'Wood panel');assert.strictEqual(r.answers.surfaces.I1.material,'paint');
  assert.strictEqual(r.answers.surfaces.I1.hierarchy_id,null);
});
test('helper rejects foreign fields, unknown reference and invalid categorical values',()=>{
  const p=K.panels(doc,0,dataset,catalogue,'surfaces')[0];
  assert.throws(()=>K.mappedFieldEdit(p,'answers.surfaces.E1.material','Wood',catalogue));
  assert.throws(()=>K.mappedFieldEdit(p,'answers.surfaces.I1.hierarchy_id','fake',catalogue));
  assert.throws(()=>K.mappedFieldEdit(p,'answers.surfaces.I1.reflectance','very shiny',catalogue));
});
test('multiselect field editing canonicalizes the explicit set without inferring other answers',()=>{
  const d=clone(doc),r=d.episodes[0],p=K.panels(d,0,dataset,catalogue,'pathways')[0],path=p.questions[0].path;
  const source=['visible_light','sunlight','air'],before=clone(r);
  const edits=K.mappedFieldEdit(p,path,source,catalogue);
  assert.deepStrictEqual(edits,[{path,value:['sunlight','air','visible_light']}]);
  assert.deepStrictEqual(source,['visible_light','sunlight','air']);assert.deepStrictEqual(r,before);
  K.applyEdits(r,edits);assert.deepStrictEqual(F.get(r,path),['sunlight','air','visible_light']);
  assert.deepStrictEqual(r.answers,before.answers);assert.deepStrictEqual(r.checks.indoor_visibility,before.checks.indoor_visibility);
});
test('multiselect rejects malformed or contradictory sets and preserves null versus explicit non-answers',()=>{
  const p=K.panels(doc,0,dataset,catalogue,'pathways')[0],path=p.questions[0].path;
  for(const value of [[],{},'air',['air','air'],['invented'],['none','air'],[C.ND,'sunlight'],['none',C.ND]])assert.throws(()=>K.mappedFieldEdit(p,path,value,catalogue));
  for(const value of [null,['none'],[C.ND]])assert.deepStrictEqual(K.mappedFieldEdit(p,path,value,catalogue),[{path,value}]);
});
test('compound application is atomic for invalid or unsafe paths',()=>{
  const r=clone(doc.episodes[0]),before=JSON.stringify(r);
  for(const path of ['answers.missing','answers.__proto__.polluted']){
    assert.throws(()=>K.applyEdits(r,[{path:'answers.surfaces.I1.material',value:'Wood'},{path,value:'yes'}]));
    assert.strictEqual(JSON.stringify(r),before);
  }
});
test('optional Level 3 visibility remains covered, never silently removed',()=>{
  const d=clone(doc);d.profile='l2_l3';assertCoverage(d);
  assert.strictEqual(K.panels(d,0,dataset,catalogue,'visibility').length,12*3+8*12+4);
});
test('completed current-scope v2 exports need no presentation migration',()=>{
  const d=clone(doc);for(const q of F.questions(d,0,dataset,catalogue))F.set(d.episodes[0],q.path,q.kind==='multiselect'?[C.ND]:C.ND);
  d.episodes[0].answers.notes='Synthetic test uncertainty only.';d.episodes[0].status='complete';d.episodes[0].completed_at=new Date().toISOString();d.annotation_status='complete';
  assert.deepStrictEqual(F.validate(d,dataset,catalogue,true),[]);const before=JSON.stringify(d);
  assert.strictEqual(K.progress(d,0,dataset,catalogue).answered,K.progress(d,0,dataset,catalogue).total);
  assert.strictEqual(JSON.stringify(d),before);assert.deepStrictEqual(F.validate(d,dataset,catalogue,true),[]);
});
test('grouped presentation leaves consensus and agreement reports exactly unchanged',()=>{
  const first=clone(doc);for(const q of F.questions(first,0,dataset,catalogue))F.set(first.episodes[0],q.path,q.kind==='multiselect'?[C.ND]:C.ND);
  first.episodes[0].answers.notes='Synthetic test uncertainty only.';first.episodes[0].status='complete';first.episodes[0].completed_at=new Date().toISOString();first.annotation_status='complete';
  const second=clone(first);second.annotator='Synthetic second rater';second.episodes[0].answers.scene.crossing_valid='yes';
  const before=F.consensus(first,second,dataset,catalogue);delete before.created_at;
  for(const d of [first,second]){K.panels(d,0,dataset,catalogue);K.progress(d,0,dataset,catalogue);}
  const after=F.consensus(first,second,dataset,catalogue);delete after.created_at;
  assert.deepStrictEqual(after,before);
});
test('production scenes preserve every required field and immutable build/task identity',()=>{
  const ds=JSON.parse(fs.readFileSync(path.join(__dirname,'../dataset.json'),'utf8'));
  const cat=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalogue.json'),'utf8'));
  const t=JSON.parse(fs.readFileSync(path.join(__dirname,'../collection-tasks.json'),'utf8'));
  const d=F.create(ds,cat,t,'Synthetic coverage test'),before=C.stableStringify({ds,cat,t,d});
  for(let i=0;i<ds.episodes.length;i++) {
    const ps=K.panels(d,i,ds,cat),expected=F.questions(d,i,ds,cat).map(q=>q.path),actual=paths(ps);
    assert.deepStrictEqual(actual.slice().sort(),expected.slice().sort());assert.strictEqual(new Set(actual).size,actual.length);
    assert.strictEqual(ps.filter(p=>p.section==='surfaces').length,t.layout.episodes[i].markers.length);
    assert.strictEqual(ps.filter(p=>p.section==='exposure').length,4);
  }
  assert.strictEqual(C.stableStringify({ds,cat,t,d}),before);assert.strictEqual(F.taskId(t),t.task_id);
});
test('full reference search returns every entry with no query and does not mutate source',()=>{
  const cat=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalogue.json'),'utf8'));
  const before=JSON.stringify(cat);assert.strictEqual(cat.materials.length,107);
  assert.deepStrictEqual(K.searchMaterials(cat.materials,''),cat.materials);
  assert.deepStrictEqual(K.searchMaterials(cat.materials,'   '),cat.materials);
  assert.strictEqual(JSON.stringify(cat),before);
});
test('reference search covers IDs, families, appearance and multiple case-insensitive terms',()=>{
  const entries=[{id:'sample_17',label:'Painted panel',family:'timber_wood',reference:{visual_descriptors:['grain','smooth surface']}},{id:'other',label:'Metal',family:'steel'}];
  for(const query of ['SAMPLE 17','Timber Wood','smooth grain','panel grain'])assert.deepStrictEqual(K.searchMaterials(entries,query),[entries[0]]);
  assert.deepStrictEqual(K.searchMaterials(entries,'no-such-material'),[]);
});
console.log(JSON.stringify({passed}));
