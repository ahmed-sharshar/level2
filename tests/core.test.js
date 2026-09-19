/* Run with Node: node tests/core.test.js. No external dependencies. */
'use strict';
const assert=require('assert'),crypto=require('crypto'),C=require('../core.js');
const date='2026-09-19T10:00:00.000Z';
const dataset={schema:'blockmind_l2_dataset_v1',build_id:'unit-test-build',episodes:[{id:'episode1',frames:C.FRAMES.map((id,i)=>({id,side:i<6?'indoor':'exterior',boundary_pixels:200,boundary_bbox:[.1,.1,.3,.4],objects:[{object_id:1,mpcat40:3}]})),proposed_markers:[]} ]};
dataset.episodes[0].proposed_markers=['indoor','exterior'].flatMap(side=>[1,2,3].map(n=>({id:(side==='indoor'?'I':'E')+n,side,anchor_frame:side==='indoor'?'f01':'f07',x:n/4,y:.4,object_id:1,mpcat40:3,observations:[]})));
const catalogue={build_id:dataset.build_id,materials:[{id:'wood',label:'Wood'}]};
const layout=C.makeLayout(dataset,'coordinator');
assert.deepStrictEqual(C.validateLayoutDraft(layout,dataset),[]);
assert(C.validateLayout(layout,dataset).length>0,'unreviewed layout must not freeze');
layout.episodes[0].directions=[{id:'d1',text:'Sun from left side of visible tree',reference_frame:'f07',x:.3,y:.2},{id:'d2',text:'Sun from right side of visible tree',reference_frame:'f07',x:.7,y:.2}];
layout.episodes[0].setup_reviewed=true;
layout.layout_id=C.layoutId(layout);
assert.deepStrictEqual(C.validateLayout(layout,dataset),[]);
let checked=0;
function test(name,fn){fn();checked++;console.log('PASS '+name);}
function change(doc,fn){const copy=C.clone(doc);fn(copy);return copy;}
const doc=C.createExport(dataset,layout,'rater-a');
test('blank draft valid, not final',()=>{assert.deepStrictEqual(C.validateExport(doc,dataset,catalogue),[]);assert(C.validateExport(doc,dataset,catalogue,true).length>0);});
test('SHA-256 standard and Unicode match Node crypto',()=>{for(const s of ['', 'abc', 'coordinator أحمد', '😀'.repeat(100), 'a'.repeat(300)])assert.strictEqual(C.sha256(s),crypto.createHash('sha256').update(s).digest('hex'));});
test('layout identity ignores coordinator/time but detects coordinate edits',()=>{assert.strictEqual(C.layoutId(change(layout,x=>{x.created_at=date;x.coordinator='else';})),layout.layout_id);assert.notStrictEqual(C.layoutId(change(layout,x=>x.episodes[0].markers[0].x=.8)),layout.layout_id);});
test('mismatching frozen hash rejected in draft export',()=>assert(C.validateExport(change(doc,x=>x.layout.episodes[0].markers[0].x=.8),dataset,catalogue).length));
test('wrong dataset build rejected',()=>assert(C.validateExport(change(doc,x=>x.build_id='other'),dataset,catalogue).length));
test('invalid enum rejected even in draft',()=>assert(C.validateExport(change(doc,x=>x.episodes[0].answers.scene.shelter='blue'),dataset,catalogue).length));
test('missing answer key is malformed, not unanswered',()=>assert(C.validateExport(change(doc,x=>delete x.episodes[0].answers.scene.crossing_valid),dataset,catalogue).length));
test('unknown frame and surface IDs rejected',()=>{for(const fn of [x=>x.episodes[0].answers.boundary_visibility.f13={},x=>x.episodes[0].answers.surfaces.Z1={}])assert(C.validateExport(change(doc,fn),dataset,catalogue).length);});
test('prototype pollution keys rejected recursively',()=>{const bad=C.clone(doc);bad.episodes[0].answers.scene=JSON.parse('{"__proto__":{"polluted":true}}');assert(C.validateExport(bad,dataset,catalogue).some(e=>e.includes('forbidden')));assert.strictEqual({}.polluted,undefined);});
test('coordinates, native instance/category, duplicate points rejected',()=>{for(const fn of [x=>x.episodes[0].markers[0].x=1.1,x=>x.episodes[0].markers[0].object_id=44,x=>x.episodes[0].markers[0].mpcat40=8,x=>{x.episodes[0].markers[1].x=x.episodes[0].markers[0].x;}]){const l=change(layout,fn);l.layout_id='';assert(C.validateLayout(l,dataset).length);}});
test('unanswered defaults do not copy geometry labels',()=>{const a=doc.episodes[0].answers;assert.strictEqual(a.scene.boundary_class,null);assert.strictEqual(a.surfaces.I1.object_name,null);assert.strictEqual(a.boundary.material,null);});
function fillND(value){for(const k of Object.keys(value)){if(value[k]===null)value[k]=C.ND;else if(typeof value[k]==='object')fillND(value[k]);}}
const completed=C.clone(doc);fillND(completed.episodes[0].answers);completed.episodes[0].answers.notes='Cannot determine from these images.';completed.episodes[0].status='complete';completed.episodes[0].completed_at=date;completed.annotation_status='complete';
test('explicit all-ND with reason valid complete annotation',()=>assert.deepStrictEqual(C.validateExport(completed,dataset,catalogue,true),[]));
test('ND requires reason on completion',()=>assert(C.validateExport(change(completed,x=>x.episodes[0].answers.notes=''),dataset,catalogue,true).some(e=>e.includes('explain'))));
test('complete record cannot hide unanswered cell inside draft export',()=>assert(C.validateExport(change(completed,x=>{x.annotation_status='draft';x.episodes[0].answers.boundary.material=null;}),dataset,catalogue).length));
test('unknown hierarchy IDs rejected',()=>assert(C.validateExport(change(doc,x=>x.episodes[0].answers.boundary.hierarchy_id='fake'),dataset,catalogue).length));
test('duplicate episode fails',()=>assert(C.validateExport(change(doc,x=>x.episodes.push(C.clone(x.episodes[0]))),dataset,catalogue).length));
test('coordinator exclusion needs reason and reviewer cannot reverse it',()=>{const l=C.clone(layout);l.layout_id='';l.episodes[0].disposition='exclude';assert(C.validateLayout(l,dataset).length);l.episodes[0].exclusion_reason='Bad presentation';l.layout_id=C.layoutId(l);const d=C.createExport(dataset,l,'rater-a');assert.deepStrictEqual(C.validateExport(d,dataset,catalogue),[]);d.episodes[0].status='in_progress';assert(C.validateExport(d,dataset,catalogue).length);});
test('two unique directions and two pre-crossing boxes required',()=>{for(const fn of [x=>x.episodes[0].directions[1].text=x.episodes[0].directions[0].text,x=>x.episodes[0].boundary_boxes.splice(1),x=>x.episodes[0].boundary_boxes[1].frame_id='f07']){const l=change(layout,fn);l.layout_id='';assert(C.validateLayout(l,dataset).length);}});
test('optional hints cannot contain forbidden keys',()=>{const bad=C.clone(doc);bad.hint_usage=JSON.parse('[{"constructor":"bad"}]');assert(C.validateExport(bad,dataset,catalogue).some(e=>e.includes('forbidden')));});
test('draft null layout ID accepted only for coordinator draft',()=>{const l=C.clone(layout);l.layout_id=null;assert.deepStrictEqual(C.validateLayoutDraft(l,dataset),[]);assert(C.validateLayout(l,dataset).length);});
test('conditional substrate detail required only for known substrate',()=>{const no=C.clone(completed);no.episodes[0].answers.surfaces.I1.substrate_known='no';no.episodes[0].answers.surfaces.I1.substrate_material=null;no.episodes[0].answers.surfaces.I1.substrate_hierarchy_id=null;assert.deepStrictEqual(C.validateExport(no,dataset,catalogue,true),[]);no.episodes[0].answers.surfaces.I1.substrate_known='yes';assert(C.validateExport(no,dataset,catalogue,true).length);});
test('canonical hypothetical conditions cannot be edited',()=>{const bad=C.clone(layout);bad.conditions.sealed='Replace the door with transparent glass';bad.layout_id=C.layoutId(bad);assert(C.validateLayout(bad,dataset).some(e=>e.includes('conditions')));});
test('severely malformed JSON containers return errors rather than throw',()=>{for(const bad of [null,[],{},change(doc,x=>x.layout.episodes=[null]),change(doc,x=>x.layout.episodes[0].markers=[null])])assert(C.validateExport(bad,dataset,catalogue).length);});
console.log(JSON.stringify({passed:checked}));
if(process.argv.includes('--fixture'))console.log(JSON.stringify({dataset,catalogue,layout,draft:doc,complete:completed}));
