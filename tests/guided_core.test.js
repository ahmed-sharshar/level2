'use strict';
const assert = require('node:assert/strict');
const Core = require('../core.js'), Guided = require('../guided-core.js');
const dataset = {build_id: 'guided-unit-build', episodes: [{id: 'episode-one',
  frames: Core.FRAMES.map((id, i) => ({id, side: i < 6 ? 'indoor' : 'exterior', boundary_pixels: 150, boundary_bbox: [.1, .2, .5, .8], objects: [{object_id: 3, mpcat40: 1}]})),
  proposed_markers: [{id: 'I1', side: 'indoor', anchor_frame: 'f01', x: .3, y: .4, object_id: 3, mpcat40: 1, observations: []},
    {id: 'E1', side: 'exterior', anchor_frame: 'f07', x: .6, y: .5, object_id: 3, mpcat40: 1, observations: []}]}]};
const catalogue = {build_id: dataset.build_id, materials: [{id: 'wood'}]};
const doc = Guided.create(dataset, catalogue, 'rater-one');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function change(fn) { const result = Core.clone(doc); fn(result); return result; }
function invalid(fn, pattern) { const errors = Guided.validate(change(fn), dataset, catalogue); assert(errors.length); if (pattern) assert(errors.some(e => e.includes(pattern)), errors.join('\n')); }

test('blank basics save immediately without setup or answers', () => assert.deepEqual(Guided.validate(doc, dataset, catalogue), []));
test('all human answers start null and no geometry is certified', () => {
  assert.equal(doc.episodes[0].answers.scene.crossing_valid, null);
  assert.equal(doc.episodes[0].answers.scene.boundary_class, null);
  assert.equal(doc.episodes[0].answers.surfaces.I1.object_name, null);
  assert.equal(doc.layout.episodes[0].directions[0].text, '');
  assert.equal(doc.layout.episodes[0].setup_reviewed, false);
  assert.equal(doc.layout.layout_id, '');
  assert.equal(doc.benchmark_ready, false);
});
test('document explicitly declares research limitations', () => {
  assert(doc.export_notes.includes('Provisional'));
  assert(doc.export_notes.includes('not ready for consensus'));
  invalid(d => d.benchmark_ready = true, 'provisional');
  invalid(d => d.export_notes = '', 'notice');
});
test('draft preserves unanswered versus not determinable', () => {
  const d = change(d => { d.episodes[0].answers.scene.crossing_valid = Core.ND; d.episodes[0].status = 'in_progress'; });
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  assert.equal(Guided.status(d, 0).answered, 1);
  assert.equal(d.episodes[0].answers.scene.shelter, null);
});
test('basic status counts scene boundary and point fields only', () => {
  const s = Guided.status(doc, 0);
  assert.equal(s.total, 13); assert.equal(s.answered, 0);
  assert.deepEqual(s.points.items, [{id: 'I1', answered: 0, total: 3}, {id: 'E1', answered: 0, total: 3}]);
  const d = change(d => { d.episodes[0].answers.surfaces.I1.material = 'Wood'; d.episodes[0].answers.surfaces.I1.finish = 'painted'; });
  assert.equal(Guided.status(d, 0).answered, 1);
});
test('step completion never certifies unanswered work', () => {
  const d = change(d => { d.review['episode-one'].scene_done = true; d.review['episode-one'].points_done = true; d.review['episode-one'].boundary_done = true; });
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  assert.equal(Guided.status(d, 0).answered, 0);
  assert.equal(d.episodes[0].status, 'not_started');
  assert.equal(d.benchmark_ready, false);
});
test('skip is progress metadata not a certified source exclusion', () => {
  const d = change(d => { d.review['episode-one'].skipped = true; d.review['episode-one'].reason = 'Need help'; d.review['episode-one'].points = {I1: 'skip', E1: 'answered'}; });
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  assert.equal(Guided.status(d, 0).skipped, true);
  invalid(d => d.layout.episodes[0].disposition = 'exclude', 'certified exclusions');
});
test('frozen layout coordinator and reviewed geometry rejected', () => {
  invalid(d => d.layout.layout_id = Core.layoutId(d.layout), 'unfrozen');
  invalid(d => d.layout.coordinator = 'coordinator', 'certify');
  invalid(d => d.layout.episodes[0].setup_reviewed = true, 'certified');
});
test('complete or excluded research record status rejected', () => {
  invalid(d => d.episodes[0].status = 'complete', 'draft status');
  invalid(d => d.episodes[0].status = 'excluded', 'draft status');
  invalid(d => d.episodes[0].completed_at = new Date().toISOString(), 'not a complete');
});
test('dataset build catalogue identity and rater identity checked', () => {
  invalid(d => d.build_id = 'other-build', 'build');
  invalid(d => d.annotator = '', 'nonempty');
  invalid(d => d.annotator = ' '.repeat(20), 'nonempty');
  assert(Guided.validate(doc, dataset, {...catalogue, build_id: 'different'}).length);
});
test('core draft enum coordinate native object validations reused', () => {
  invalid(d => d.episodes[0].answers.scene.shelter = 'blue', 'invalid value');
  invalid(d => d.layout.episodes[0].markers[0].x = 2, 'coordinates');
  invalid(d => d.layout.episodes[0].markers[0].object_id = 999, 'unknown native');
  invalid(d => delete d.episodes[0].answers.surfaces.I1.reflectance, 'missing');
});
test('valid optional research labels are preserved without requiring them', () => {
  const d = change(d => { d.episodes[0].answers.surfaces.I1.finish = 'painted'; d.episodes[0].answers.surfaces.I1.substrate_known = 'yes'; d.episodes[0].answers.surfaces.I1.substrate_material = 'Wood'; });
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  assert.equal(d.episodes[0].answers.surfaces.I1.substrate_hierarchy_id, null);
});
test('new manual points and moved points do not need coordinator approval', () => {
  const d = change(d => {
    const ep = d.layout.episodes[0];
    ep.markers.push({id: 'I2', side: 'indoor', anchor_frame: 'f02', x: .55, y: .65, object_id: null, mpcat40: null, observations: []});
    d.episodes[0].answers.surfaces.I2 = Core.createEpisode(ep).answers.surfaces.I2;
    d.ui.marker = 2;
    ep.markers[0].x = .85;
  });
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  assert.equal(Guided.status(d, 0).points.total, 9);
});
test('unknown fields episodes review flags and missing records rejected', () => {
  invalid(d => d.extra = true, 'unexpected');
  invalid(d => d.review['episode-one'].points = {Q1: 'skip'}, 'unknown point');
  invalid(d => d.review['episode-one'].points = {I1: 'approved'}, 'invalid review');
  invalid(d => d.review['episode-one'].scene_done = 'yes', 'boolean');
  invalid(d => d.episodes = [], 'every episode');
  invalid(d => d.episodes[0].episode_id = 'unknown', 'mismatch');
});
test('safe UI indices and optional frame persist', () => {
  const d = change(d => d.ui = {episode: 0, step: 3, marker: 1, frame: 11});
  assert.deepEqual(Guided.validate(d, dataset, catalogue), []);
  invalid(d => d.ui.frame = 12, '0 to 11');
  invalid(d => d.ui.step = 4, '0 to 3');
  invalid(d => d.ui.marker = 2, 'invalid index');
  invalid(d => d.ui.episode = 1, 'invalid index');
});
test('recursive prototype keys rejected without mutation', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const d = Core.clone(doc); d.review['episode-one'].points = JSON.parse('{"' + key + '":"skip"}');
    assert(Guided.validate(d, dataset, catalogue).some(e => e.includes('forbidden')));
  }
  assert.equal({}.polluted, undefined);
});
test('malformed cycles or extreme nesting never throw', () => {
  const cyclic = Core.clone(doc); cyclic.loop = cyclic;
  let nested = {}; for (let i = 0; i < 60; i++) nested = {child: nested};
  for (const bad of [null, [], {}, cyclic, nested, change(d => d.layout.episodes = [null]), change(d => d.layout.episodes[0].markers = [null])]) assert(Guided.validate(bad, dataset, catalogue).length);
});
test('timestamps nonfinite values and non-JSON values rejected', () => {
  invalid(d => d.created_at = 'yesterday', 'timestamp');
  invalid(d => d.ui.step = NaN, 'nonfinite');
  invalid(d => d.ui.frame = undefined, 'JSON value');
});
test('research pending report never claims model GT or certified geometry', () => {
  const pending = Guided.reportPending(doc), ids = pending.map(x => x.id);
  for (const id of ['geometry', 'directions', 'hierarchy', 'visibility', 'reachability', 'independent_review', 'thermal_reference']) assert(ids.includes(id));
  assert(pending.every(item => item.count === 1 && item.episode_ids[0] === 'episode-one'));
});
test('guided document deliberately rejected by advanced export validator', () => assert(Core.validateExport(doc, dataset, catalogue).length));
test('JSON roundtrip preserves content and validates', () => assert.deepEqual(Guided.validate(JSON.parse(JSON.stringify(doc)), dataset, catalogue), []));
console.log(JSON.stringify({passed}));
