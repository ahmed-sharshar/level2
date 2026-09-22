'use strict';

// Read production inputs, but keep every approval and answer in disposable memory.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const C = require('../core.js');
const F = require('../full-core.js');
const K = require('../compact-core.js');
const root = path.resolve(__dirname, '..');
const inputNames = ['dataset.json', 'catalogue.json', 'collection-tasks.json'];
const originalInputs = Object.fromEntries(inputNames.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const dataset = JSON.parse(originalInputs['dataset.json']);
const catalogue = JSON.parse(originalInputs['catalogue.json']);
const tasks = JSON.parse(originalInputs['collection-tasks.json']);
const draft = F.create(dataset, catalogue, tasks, 'SYNTHETIC SUN-RAIN TEST ONLY');
const exposures = doc => doc.episodes.map((_, index) => F.questions(doc, index, dataset, catalogue).filter(q => q.section === 'exposure'));
const questions = exposures(draft);
const options = [
  {value:'yes', label:'Hit directly'},
  {value:'no', label:'Not hit'},
  {value:C.ND, label:'Not sure'}
];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

test('current 56 scenes contain 448 targets and all 3584 independent exposure cells', () => {
  assert.strictEqual(dataset.episodes.length, 56);
  assert.strictEqual(tasks.layout.episodes.reduce((n, ep) => n + ep.markers.length, 0), 448);
  assert.strictEqual(questions.reduce((n, qs) => n + qs.length, 0), 3584);
  for (const [index, ep] of tasks.layout.episodes.entries()) {
    const expected = ep.markers.flatMap(m => C.DIRECTIONS.flatMap(direction => C.STATES.flatMap(condition =>
      ['sun', 'rain'].map(channel => 'answers.surfaces.' + m.id + '.reachable.' + direction + '.' + condition + '.' + channel))));
    assert.deepStrictEqual(questions[index].map(q => q.path).sort(), expected.sort());
    assert.strictEqual(new Set(questions[index].map(q => q.path)).size, expected.length);
  }
});

test('each scene has four scenarios with a separate sun and rain choice for every actual point', () => {
  for (const [index, ep] of tasks.layout.episodes.entries()) {
    const panels = K.panels(draft, index, dataset, catalogue, 'exposure');
    assert.deepStrictEqual(panels.map(p => [p.direction.id, p.condition]),
      [['d1','open'], ['d1','sealed'], ['d2','open'], ['d2','sealed']]);
    for (const panel of panels) {
      assert.strictEqual(panel.questions.length, ep.markers.length * 2);
      for (const marker of ep.markers) {
        assert.deepStrictEqual(panel.questions.filter(q => q.marker_id === marker.id).map(q => q.path.split('.').at(-1)), ['sun','rain']);
        assert(panel.questions.filter(q => q.marker_id === marker.id).every(q => q.frame_id === marker.anchor_frame));
      }
    }
  }
});

test('all exposure choices have the requested labels and unchanged yes/no/ND stored codes', () => {
  for (const qs of questions) for (const q of qs) assert.deepStrictEqual(q.options, options);
});

test('sun and rain question titles explicitly ask about direct hits', () => {
  for (const qs of questions) for (const q of qs) {
    assert.match(q.title, /hit this red point directly/i);
    assert.match(q.title, q.path.endsWith('.sun') ? /sunlight/i : /rain/i);
  }
});

test('every exposure question carries clear-glass and slats/lattice sideways-rain guidance', () => {
  for (const qs of questions) for (const q of qs) {
    assert.match(q.help, /sunlight can pass through clear glass/i);
    assert.match(q.help, /rain cannot pass through intact glass/i);
    assert.match(q.help, /slats or lattice/i);
    assert.match(q.help, /Not sure for rain unless/i);
    assert.match(q.help, /sideways/i);
    assert.match(q.help, /not automatically Hit directly/i);
  }
});

test('unrelated yes/no judgments retain labels while opening checks use separate multiselect options', () => {
  const qs = F.questions(draft, 0, dataset, catalogue);
  const oldOptions = [{value:'yes',label:'Yes'}, {value:'no',label:'No'}, {value:C.ND,label:'Not sure'}];
  assert.deepStrictEqual(qs.find(q => q.path === 'answers.scene.crossing_valid').options, oldOptions);
  for (const q of qs.filter(q => q.section === 'pathways')) {
    assert.strictEqual(q.kind, 'multiselect');
    assert.deepStrictEqual(q.options.map(o => o.value), ['sunlight','rain','air','visible_light','none',C.ND]);
  }
});

test('all 3584 newly created exposure answers remain genuinely unanswered', () => {
  for (const [index, qs] of questions.entries()) for (const q of qs) assert.strictEqual(F.get(draft.episodes[index], q.path), null);
});

test('answering one sun cell leaves rain, every other point and all other scenarios unchanged', () => {
  const doc = C.clone(draft), record = doc.episodes[0], chosen = questions[0][0];
  F.setAnswer(doc, 0, chosen.path, 'yes');
  for (const [index, qs] of questions.entries()) for (const q of qs)
    assert.strictEqual(F.get(doc.episodes[index], q.path), index === 0 && q.path === chosen.path ? 'yes' : null);
});

test('Not sure is explicit and does not turn unanswered adjacent rain into No or uncertainty', () => {
  const doc = C.clone(draft), record = doc.episodes[0], chosen = questions[0][0];
  F.setAnswer(doc, 0, chosen.path, C.ND);
  assert.strictEqual(F.get(record, chosen.path), C.ND);
  assert.strictEqual(F.get(record, chosen.path.replace(/\.sun$/, '.rain')), null);
  const panel = K.panels(doc, 0, dataset, catalogue, 'exposure')[0];
  assert.strictEqual(K.panelProgress(panel, record).answered, 1);
  assert.strictEqual(K.panelProgress(panel, record).complete, false);
});

test('selecting slats/lattice never fills blank rain or coerces any existing rain answer', () => {
  for (const value of [null, 'yes', 'no', C.ND]) {
    const doc = C.clone(draft), record = doc.episodes[0], marker = doc.tasks.layout.episodes[0].markers[0];
    const surface = record.answers.surfaces[marker.id];
    for (const direction of C.DIRECTIONS) for (const condition of C.STATES) surface.reachable[direction][condition].rain = value;
    const before = C.clone(surface.reachable);
    F.set(record, 'answers.surfaces.' + marker.id + '.shelter', 'slats_lattice');
    F.questions(doc, 0, dataset, catalogue);
    K.panels(doc, 0, dataset, catalogue, 'exposure');
    assert.deepStrictEqual(surface.reachable, before);
    assert.deepStrictEqual(F.validate(doc, dataset, catalogue), []);
  }
});

test('old mixed yes/no/ND/blank judgments survive JSON restore and question rendering unchanged', () => {
  const doc = C.clone(draft), values = ['yes', 'no', C.ND, null];
  for (const [index, qs] of questions.entries()) for (const [j, q] of qs.entries()) F.setAnswer(doc,index, q.path, values[(index + j) % values.length]);
  const encoded = JSON.stringify(doc), restored = JSON.parse(encoded);
  for (const index of restored.episodes.keys()) K.panels(restored, index, dataset, catalogue, 'exposure');
  assert.strictEqual(JSON.stringify(restored), encoded);
  assert.deepStrictEqual(F.validate(restored, dataset, catalogue), []);
});

test('shared provisional directions unlock collection but never invent research approval', () => {
  assert.strictEqual(tasks.settings.collection_mode, 'provisional');
  assert.strictEqual(tasks.settings.protocol_reviewed, false);
  for (const [index, ep] of tasks.layout.episodes.entries()) {
    assert.strictEqual(ep.setup_reviewed, false);
    assert(ep.directions.every(d => d.text.trim() && Number.isFinite(d.x) && Number.isFinite(d.y)));
    assert.strictEqual(F.episodeCollectionReady(tasks, index, dataset, catalogue).ready, true);
    assert.strictEqual(F.episodeReady(tasks, index, dataset, catalogue).ready, false);
    assert(questions[index].every(q => !q.blocked));
    assert(K.panels(draft, index, dataset, catalogue, 'exposure').every(p => !p.blocked));
  }
});

test('legacy blank directions remain blocked unless explicitly prepared for collection', () => {
  const legacyTasks = F.createTasks(dataset, catalogue, 'SYNTHETIC LEGACY TEST');
  const legacy = F.create(dataset, catalogue, legacyTasks, 'SYNTHETIC LEGACY TEST');
  assert(F.questions(legacy, 0, dataset, catalogue).filter(q => q.section === 'exposure').every(q => q.blocked));
  assert.strictEqual(F.episodeCollectionReady(legacyTasks, 0, dataset, catalogue).ready, false);
});

let fixture;
test('current synthetic complete fixture validates with the same exposure answer scope', () => {
  fixture = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'make_full_fixtures.cjs')],
    {cwd:root, encoding:'utf8', maxBuffer:64 * 1024 * 1024}));
  assert.deepStrictEqual(F.validate(fixture.complete, dataset, catalogue, true), []);
  assert.deepStrictEqual(F.validate(fixture.second, dataset, catalogue, true), []);
  assert.strictEqual(F.questions(fixture.complete, 0, dataset, catalogue).filter(q => q.section === 'exposure').length, 64);
});

test('reviewed synthetic directions retain their exact visible-feature wording and anchor per scenario', () => {
  for (const q of F.questions(fixture.blank, 0, dataset, catalogue).filter(q => q.section === 'exposure')) {
    assert.strictEqual(q.blocked, false);
    assert.deepStrictEqual(q.direction, fixture.tasks.layout.episodes[0].directions.find(d => d.id === q.direction.id));
    assert.strictEqual(q.condition_text, fixture.tasks.layout.conditions[q.condition]);
    assert(Number.isFinite(q.direction.x) && Number.isFinite(q.direction.y));
  }
});

test('production assets and shared task identity remain byte-for-byte untouched', () => {
  for (const name of inputNames) assert.strictEqual(fs.readFileSync(path.join(root, name), 'utf8'), originalInputs[name]);
  assert.strictEqual(F.taskId(tasks), tasks.task_id);
  assert.deepStrictEqual(draft.tasks, tasks);
});

console.log(JSON.stringify({passed, scenes:dataset.episodes.length, exposure_cells:questions.reduce((n, qs) => n + qs.length, 0)}));
