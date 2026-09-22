'use strict';
// Read-only deployment contract checks. No annotation files or approvals changed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');
const F = require('../full-core.js');
const site = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(site, name), 'utf8'));
const tasks = read('collection-tasks.json');
const dataset = read('dataset.json');
const catalogue = read('catalogue.json');
const preparation = read('data/provisional_collection_preparation.json');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

test('published task file has 56 matching scenes and its content identity is valid', () => {
  assert.strictEqual(tasks.layout.episodes.length, 56);
  assert.strictEqual(tasks.task_id, F.taskId(tasks));
  assert.deepStrictEqual(tasks.layout.episodes.map(e => e.episode_id), dataset.episodes.map(e => e.id));
  assert.deepStrictEqual(F.validateTasks(tasks, dataset, catalogue), []);
});

test('all 56 Direction 1 definitions are overhead and vertically downward', () => {
  for (const ep of tasks.layout.episodes) {
    assert.deepStrictEqual(ep.directions.map(d => d.id), ['d1', 'd2'], ep.episode_id);
    const d = ep.directions[0];
    assert.match(d.text, /from directly above/i, ep.episode_id);
    assert.match(d.text, /vertically downward/i, ep.episode_id);
    assert.match(d.text, /hypothetical scenario, not observed weather/i, ep.episode_id);
  }
});

test('all 56 Direction 2 definitions travel sideways from outside through the opening into the room', () => {
  for (const ep of tasks.layout.episodes) {
    const d = ep.directions[1];
    assert.match(d.text, /from the exterior side horizontally toward/i, ep.episode_id);
    assert.match(d.text, /marked boundary opening/i, ep.episode_id);
    assert.match(d.text, /into the indoor room/i, ep.episode_id);
    assert.match(d.text, /arriving sideways/i, ep.episode_id);
    assert.match(d.text, /opposite to the walk across the threshold/i, ep.episode_id);
    assert.match(d.text, /hypothetical scenario, not observed weather/i, ep.episode_id);
  }
});

test('the published pair is one common semantic default with only image references varying', () => {
  for (const id of ['d1', 'd2']) {
    const variants = new Set(tasks.layout.episodes.map(ep =>
      ep.directions.find(d => d.id === id).text.replace(/image \d+/g, 'image FRAME')));
    assert.strictEqual(variants.size, 1, id + ' has an unexpected scene-specific wording override');
  }
});

test('all direction references identify actual scene frames and in-range image anchors', () => {
  for (const [i, ep] of tasks.layout.episodes.entries()) {
    for (const d of ep.directions) {
      const frame = dataset.episodes[i].frames.find(f => f.id === d.reference_frame);
      assert(frame, ep.episode_id + ': unknown reference frame');
      assert(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1, ep.episode_id);
      assert(d.text.includes('image ' + frame.index), ep.episode_id + ': text/reference disagree');
      assert(d.text.includes('arrow marks the opening reference, not a ray'), ep.episode_id);
    }
  }
});

test('stored preparation vectors agree with overhead and outside-to-inside camera geometry', () => {
  assert.strictEqual(preparation.direction_definitions.length, 56);
  for (const row of preparation.direction_definitions) {
    const ep = dataset.episodes.find(e => e.id === row.episode_id);
    assert(ep);
    assert.deepStrictEqual(row.d1_world_travel_direction, [0, 0, -1]);
    const indoor = ep.frames[5].camera_to_world;
    const exterior = ep.frames[6].camera_to_world;
    const dx = indoor[0][3] - exterior[0][3];
    const dy = indoor[1][3] - exterior[1][3];
    const length = Math.hypot(dx, dy);
    const [x, y, z] = row.d2_world_travel_direction;
    assert(length > 0.05, row.episode_id);
    assert(Math.abs(x - dx / length) < 1e-10 && Math.abs(y - dy / length) < 1e-10, row.episode_id);
    assert.strictEqual(z, 0);
    assert.strictEqual(row.weather_observed_or_inferred, false);
  }
});

test('a researcher direction override affects only that scene and changes the task identity', () => {
  const edited = C.clone(tasks);
  edited.layout.episodes[0].directions[1].text += ' Researcher-specific visible reference clarification.';
  assert.notStrictEqual(F.taskId(edited), tasks.task_id);
  assert.deepStrictEqual(edited.layout.episodes.slice(1), tasks.layout.episodes.slice(1));
  edited.layout.layout_id = C.layoutId(edited.layout);
  edited.task_id = F.taskId(edited);
  assert.deepStrictEqual(F.validateTasks(edited, dataset, catalogue), []);
});

test('defaults remain honestly provisional rather than invented research approval', () => {
  assert.strictEqual(tasks.settings.collection_mode, 'provisional');
  assert.strictEqual(tasks.settings.protocol_reviewed, false);
  assert.strictEqual(tasks.settings.hierarchy_reviewed, false);
  assert(tasks.layout.episodes.every(ep => !ep.setup_reviewed));
  assert.strictEqual(preparation.research_approved, false);
  assert.strictEqual(preparation.benchmark_ready, false);
});

test('the collector discloses ID-only isolation without claiming authentication or offering adjudication', () => {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  assert.match(html, /IDs are labels, not passwords/);
  assert.match(html, /separate saved draft/);
  assert.match(html, /no disagreement-resolution step/);
  assert(!/<button[^>]*>[^<]*(?:resolve disagreement|adjudicate)/i.test(html));
  assert(!Object.hasOwn(F, 'resolveDisagreement'));
});

console.log(JSON.stringify({passed}));
