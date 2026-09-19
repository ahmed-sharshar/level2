/* Guided annotation is a saveable first pass, not a certified benchmark export.
 * The existing advanced schema and validators remain unchanged. */
(function (root) {
  'use strict';
  const Core = root.L2Core || (typeof require === 'function' ? require('./core.js') : null);
  if (!Core) throw new Error('Load core.js before guided-core.js.');
  const SCHEMA = 'blockmind_l2_guided_v1';
  const EXPORT_NOTES = 'Provisional basic human annotations. Layout proposals are unreviewed; directions, geometry certification and remaining research labels must be reviewed separately. This file is not a frozen two-rater annotation export and is not ready for consensus, MCQ ground truth or physical simulation.';
  const BASIC_FIELDS = Object.freeze({
    scene: ['crossing_valid', 'boundary_class', 'shelter'],
    boundary: ['kind', 'pane_transparency', 'observed_state', 'material'],
    point: ['object_name', 'material', 'reflectance']
  });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const filled = value => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
  function create(dataset, catalogue, annotator) {
    const now = new Date().toISOString(), layout = Core.makeLayout(dataset, '');
    return {
      schema: SCHEMA, build_id: dataset.build_id, annotator: annotator || '',
      created_at: now, updated_at: now, benchmark_ready: false, export_notes: EXPORT_NOTES,
      layout, episodes: layout.episodes.map(Core.createEpisode),
      ui: {episode: 0, step: 0, marker: 0},
      review: Object.fromEntries(layout.episodes.map(ep => [ep.episode_id, {
        scene_done: false, points_done: false, boundary_done: false, skipped: false, reason: ''
      }]))
    };
  }
  function keys(value, required, optional, path, errors) {
    if (!object(value)) { errors.push(path + ': expected object'); return false; }
    for (const key of required) if (!own(value, key)) errors.push(path + '.' + key + ': missing');
    for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) errors.push(path + '.' + key + ': unexpected field');
    return true;
  }
  // Iterative inspection also rejects cycles, excessive nesting and non-JSON input
  // before delegating to the recursive advanced validators.
  function inspect(value, errors) {
    const seen = new Set(), stack = [{value, path: 'guided', depth: 0}];
    let visited = 0;
    while (stack.length) {
      const item = stack.pop(), current = item.value;
      if (++visited > 500000) { errors.push('guided: document is too large'); return; }
      if (item.depth > 50) { errors.push(item.path + ': excessive nesting'); return; }
      if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
      if (typeof current === 'number') { if (!Number.isFinite(current)) errors.push(item.path + ': nonfinite number'); continue; }
      if (typeof current !== 'object') { errors.push(item.path + ': expected JSON value'); continue; }
      if (seen.has(current)) { errors.push(item.path + ': repeated or circular object'); return; }
      seen.add(current);
      const proto = Object.getPrototypeOf(current);
      if (!Array.isArray(current) && proto !== Object.prototype && proto !== null) {
        errors.push(item.path + ': expected plain JSON object'); return;
      }
      for (const key of Object.keys(current)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) errors.push(item.path + ': forbidden key ' + key);
        else stack.push({value: current[key], path: item.path + '.' + key, depth: item.depth + 1});
      }
    }
  }
  function validateUnsafe(doc, dataset, catalogue) {
    const errors = [];
    inspect(doc, errors);
    if (errors.length) return errors;
    if (!keys(doc, ['schema', 'build_id', 'annotator', 'created_at', 'updated_at', 'benchmark_ready', 'export_notes', 'layout', 'episodes', 'ui', 'review'], [], 'guided', errors)) return errors;
    if (doc.schema !== SCHEMA) errors.push('guided.schema: unsupported schema');
    if (!object(dataset) || !Array.isArray(dataset.episodes) || !object(catalogue)) return errors.concat('guided: dataset/catalogue unavailable');
    if (doc.build_id !== dataset.build_id || catalogue.build_id !== dataset.build_id) errors.push('guided.build_id: different dataset/catalogue build');
    if (typeof doc.annotator !== 'string' || !doc.annotator.trim() || doc.annotator.length > 200) errors.push('guided.annotator: use a nonempty name of at most 200 characters');
    if (!timestamp(doc.created_at) || !timestamp(doc.updated_at)) errors.push('guided: invalid ISO timestamps');
    if (doc.benchmark_ready !== false) errors.push('guided.benchmark_ready: guided work is provisional, not benchmark-ready');
    if (doc.export_notes !== EXPORT_NOTES) errors.push('guided.export_notes: provisional export notice is missing or changed');
    errors.push(...Core.validateLayoutDraft(doc.layout, dataset));
    if (!object(doc.layout) || !Array.isArray(doc.layout.episodes)) return errors;
    if (doc.layout.layout_id !== '') errors.push('guided.layout.layout_id: guided layouts must remain unfrozen');
    if (doc.layout.coordinator !== '') errors.push('guided.layout.coordinator: guided mode does not certify a coordinator review');
    doc.layout.episodes.forEach((ep, index) => {
      if (!object(ep)) return;
      if (!dataset.episodes[index] || ep.episode_id !== dataset.episodes[index].id) errors.push('guided.layout.episodes: dataset order must be preserved');
      if (ep.setup_reviewed !== false) errors.push('guided.layout.' + ep.episode_id + ': geometry has not been certified in guided mode');
      if (ep.disposition !== 'include' || ep.exclusion_reason !== '') errors.push('guided.layout.' + ep.episode_id + ': record skips in review, not as certified exclusions');
    });
    if (!Array.isArray(doc.episodes)) errors.push('guided.episodes: expected array');
    else {
      if (doc.episodes.length !== doc.layout.episodes.length) errors.push('guided.episodes: need one record for every episode');
      doc.episodes.forEach((record, index) => {
        const layoutEpisode = doc.layout.episodes[index];
        if (!object(record) || !object(layoutEpisode)) { errors.push('guided.episodes[' + index + ']: malformed record'); return; }
        errors.push(...Core.validateDraftEpisode(record, layoutEpisode, catalogue));
        if (!['not_started', 'in_progress'].includes(record.status)) errors.push('guided.episodes[' + index + '].status: use draft status only');
        if (record.completed_at !== null) errors.push('guided.episodes[' + index + '].completed_at: guided work is not a complete research annotation');
        if (record.exclusion_reason !== '') errors.push('guided.episodes[' + index + '].exclusion_reason: record skips in review');
      });
    }
    const ids = doc.layout.episodes.filter(object).map(ep => ep.episode_id);
    if (keys(doc.review, ids, [], 'guided.review', errors)) {
      doc.layout.episodes.forEach(ep => {
        if (!object(ep)) return;
        const p = 'guided.review.' + ep.episode_id, item = doc.review[ep.episode_id];
        if (!keys(item, ['scene_done', 'points_done', 'boundary_done', 'skipped', 'reason'], ['points'], p, errors)) return;
        ['scene_done', 'points_done', 'boundary_done', 'skipped'].forEach(key => {
          if (typeof item[key] !== 'boolean') errors.push(p + '.' + key + ': expected boolean');
        });
        if (typeof item.reason !== 'string') errors.push(p + '.reason: expected text');
        if (own(item, 'points')) {
          if (!object(item.points)) errors.push(p + '.points: expected object');
          else {
            const markerIDs = new Set((Array.isArray(ep.markers) ? ep.markers : []).filter(object).map(m => m.id));
            Object.entries(item.points).forEach(([id, value]) => {
              if (!markerIDs.has(id)) errors.push(p + '.points.' + id + ': unknown point');
              if (!['answered', 'skip'].includes(value)) errors.push(p + '.points.' + id + ': invalid review flag');
            });
          }
        }
      });
    }
    if (keys(doc.ui, ['episode', 'step', 'marker'], ['frame'], 'guided.ui', errors)) {
      if (!Number.isInteger(doc.ui.episode) || doc.ui.episode < 0 || doc.ui.episode >= dataset.episodes.length) errors.push('guided.ui.episode: invalid index');
      if (!Number.isInteger(doc.ui.step) || doc.ui.step < 0 || doc.ui.step > 3) errors.push('guided.ui.step: expected 0 to 3');
      const selected = doc.layout.episodes[doc.ui.episode];
      const maxMarker = Math.max(0, selected && Array.isArray(selected.markers) ? selected.markers.length - 1 : 0);
      if (!Number.isInteger(doc.ui.marker) || doc.ui.marker < 0 || doc.ui.marker > maxMarker) errors.push('guided.ui.marker: invalid index');
      if (own(doc.ui, 'frame') && (!Number.isInteger(doc.ui.frame) || doc.ui.frame < 0 || doc.ui.frame > 11)) errors.push('guided.ui.frame: expected 0 to 11');
    }
    return errors;
  }
  function validate(doc, dataset, catalogue) {
    try { return validateUnsafe(doc, dataset, catalogue); }
    catch (error) { return ['Malformed guided document: ' + error.message]; }
  }
  function tally(value, fields) {
    return {answered: fields.filter(key => value && filled(value[key])).length, total: fields.length};
  }
  function status(doc, episodeIndex) {
    const record = doc && Array.isArray(doc.episodes) ? doc.episodes[episodeIndex] : null;
    const ep = doc && doc.layout && Array.isArray(doc.layout.episodes) ? doc.layout.episodes[episodeIndex] : null;
    const answers = record && record.answers || {}, reviewed = doc && doc.review && ep && doc.review[ep.episode_id] || {};
    const scene = tally(answers.scene, BASIC_FIELDS.scene), boundary = tally(answers.boundary, BASIC_FIELDS.boundary);
    const items = ep && Array.isArray(ep.markers) ? ep.markers.map(m => ({id: m.id, ...tally(answers.surfaces && answers.surfaces[m.id], BASIC_FIELDS.point)})) : [];
    const points = {answered: items.reduce((n, item) => n + item.answered, 0), total: items.length * BASIC_FIELDS.point.length, items};
    return {
      answered: scene.answered + boundary.answered + points.answered,
      total: scene.total + boundary.total + points.total, scene, boundary, points,
      reviewed: {scene: reviewed.scene_done === true, points: reviewed.points_done === true, boundary: reviewed.boundary_done === true},
      skipped: reviewed.skipped === true
    };
  }
  function reportPending(doc) {
    const episodes = doc && doc.layout && Array.isArray(doc.layout.episodes) ? doc.layout.episodes : [];
    const records = new Map((doc && Array.isArray(doc.episodes) ? doc.episodes : []).filter(object).map(ep => [ep.episode_id, ep]));
    const rows = episodes.filter(object).map(ep => ({ep, a: records.get(ep.episode_id)?.answers || {}}));
    const anyEmpty = value => !object(value) || Object.entries(value).some(([key, v]) => key !== 'notes' && (object(v) ? anyEmpty(v) : !filled(v)));
    const task = (id, title, predicate, detail) => {
      const episode_ids = rows.filter(predicate).map(({ep}) => ep.episode_id);
      return {id, title, episode_ids, count: episode_ids.length, detail};
    };
    return [
      task('geometry', 'Review shared surface points and the boundary location', () => true,
        'Suggested points and boundary boxes are not certified by this first pass. A shared reviewed layout is needed before independent agreement scoring.'),
      task('directions', 'Define and approve the two direction prompts', ({ep}) => !Array.isArray(ep.directions) || ep.directions.length !== 2 || ep.directions.some(d => !filled(d.text) || d.x === null || d.y === null),
        'Do not invent a sun or rain direction from the images. Use the agreed feature-relative protocol.'),
      task('hierarchy', 'Map materials to the approved reference hierarchy', ({ep, a}) => !filled(a.boundary?.hierarchy_id) || (ep.markers || []).some(m => !filled(a.surfaces?.[m.id]?.hierarchy_id)),
        'Human material names are preserved. They are not automatically accepted as thermal ground truth.'),
      task('visibility', 'Review boundary and surface visibility across frames', ({ep, a}) => anyEmpty(a.boundary_visibility) || (ep.markers || []).some(m => anyEmpty(a.surfaces?.[m.id]?.visibility)),
        'Computer projections alone cannot certify glass, reflections or occlusion.'),
      task('reachability', 'Label directional sunlight, rain and passage conditions', ({ep, a}) => anyEmpty(a.pathways) || (ep.markers || []).some(m => anyEmpty(a.surfaces?.[m.id]?.reachable)),
        'These labels depend on approved direction prompts and open/sealed assumptions. They stay unanswered when not collected.'),
      task('remaining_labels', 'Complete any other research fields required by the chosen questions', ({a}) => anyEmpty(a),
        'Basic-step review means the first pass was visited, not that all workplan fields have been answered.'),
      task('independent_review', 'Collect independent labels under a shared reviewed layout', () => true,
        'This provisional file cannot be used for two-rater consensus or benchmark scoring directly.'),
      task('thermal_reference', 'Approve the thermal mapping and allowed comparison pairs', () => true,
        'A frozen approved reference is still required before thermal MCQ ground truth can be generated.')
    ].filter(item => item.count > 0);
  }
  const api = {SCHEMA, EXPORT_NOTES, BASIC_FIELDS, create, validate, status, reportPending};
  root.L2Guided = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
