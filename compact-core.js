/* Presentation-only grouping for the complete Level 2 collector.
 * Required fields, research gates, task IDs, exports and consensus stay in
 * full-core.js. No unanswered choice is interpreted as No or Not sure. */
(function (root) {
  'use strict';
  const F = root.L2Full || (typeof require === 'function' ? require('./full-core.js') : null);
  if (!F) throw new Error('Load full-core.js before compact-core.js');
  const filled = value => value !== null && value !== undefined &&
    (typeof value !== 'string' || value.trim() !== '');

  function groupKey(q) {
    if (q.section === 'surfaces') return 'surface:' + q.marker_id;
    if (q.section === 'exposure' || q.section === 'pathways')
      return q.section + ':' + q.direction.id + ':' + q.condition;
    return 'single:' + q.path;
  }

  function panels(doc, index, dataset, catalogue, section) {
    const grouped = new Map();
    const required = F.questions(doc, index, dataset, catalogue);
    for (const q of required) {
      if (section && q.section !== section) continue;
      const id = groupKey(q);
      if (!grouped.has(id)) {
        const kind = q.section === 'surfaces' ? 'surface' :
          ['exposure', 'pathways'].includes(q.section) ? q.section : 'single';
        const title = kind === 'surface' ? 'Describe red point ' + q.marker_id :
          kind === 'exposure' ? 'Sun and rain: ' + q.direction.id.toUpperCase() + ', ' + q.condition :
          kind === 'pathways' ? 'Through the opening: ' + q.direction.id.toUpperCase() + ', ' + q.condition : q.title;
        const panel = {id, section:q.section, kind, title, help:q.help, questions:[], blocked:false, block_reason:''};
        if (kind === 'surface' || kind === 'single') {
          if (q.marker_id !== undefined) panel.marker_id = q.marker_id;
        }
        if (q.frame_id !== undefined) panel.frame_id = q.frame_id;
        for (const key of ['direction', 'condition', 'condition_text'])
          if (q[key] !== undefined) panel[key] = q[key];
        grouped.set(id, panel);
      }
      const panel = grouped.get(id);
      panel.questions.push(q);
      if (q.blocked) {
        panel.blocked = true;
        panel.block_reason = q.block_reason || q.reason || 'Researcher approval is required.';
      }
    }
    return Array.from(grouped.values());
  }

  function panelProgress(panel, record) {
    const missing = panel.questions.filter(q => !filled(F.get(record, q.path)));
    return {
      answered:panel.questions.length - missing.length,
      total:panel.questions.length,
      complete:panel.questions.length > 0 && missing.length === 0 && !panel.blocked,
      missing,
      blocked:!!panel.blocked
    };
  }

  function progress(doc, index, dataset, catalogue) {
    const grouped = panels(doc, index, dataset, catalogue), record = doc.episodes[index];
    const sections = Object.fromEntries(F.SECTIONS.map(section => [section, {answered:0,total:0,fields_answered:0,fields_total:0}]));
    const missing = [];
    let answered = 0, fieldsAnswered = 0, fieldsTotal = 0;
    for (const panel of grouped) {
      const p = panelProgress(panel, record), section = sections[panel.section];
      section.total++;
      section.fields_answered += p.answered;
      section.fields_total += p.total;
      fieldsAnswered += p.answered;
      fieldsTotal += p.total;
      if (p.complete) { answered++; section.answered++; }
      else missing.push(panel);
    }
    return {answered,total:grouped.length,missing,sections,fields_answered:fieldsAnswered,
      fields_total:fieldsTotal,setup_ready:F.episodeReady(doc.tasks,index,dataset,catalogue).ready};
  }

  function canonicalMaterial(material) {
    // A descriptive identifier only. Reference physical-property values are
    // deliberately not copied into human observations.
    return String(material.label || material.name || material.description || material.id).replace(/_/g, ' ');
  }

  function mappedFieldEdit(panel, path, value, catalogue) {
    const question = panel.questions.find(q => q.path === path);
    if (!question) throw new Error('This field is not part of the displayed panel.');
    if (value !== null) {
      if (question.kind === 'choice' || question.kind === 'hierarchy') {
        if (!question.options.some(option => option.value === value)) throw new Error('Choose a listed answer.');
      } else if (typeof value !== 'string') throw new Error('Enter a text answer.');
    }
    const edits = [{path, value}];
    if (question.kind !== 'hierarchy' || value === null || value === '__other__' || value === F.ND) return edits;
    const material = (catalogue.materials || []).find(m => String(m.id) === value);
    if (!material) throw new Error('The selected material reference is unavailable.');
    const materialPath = path.replace(/substrate_hierarchy_id$/, 'substrate_material').replace(/hierarchy_id$/, 'material');
    // Compound editing is only allowed when both fields are visibly presented
    // together. An unrelated field can never be silently changed.
    if (materialPath !== path && panel.questions.some(q => q.path === materialPath))
      edits.push({path:materialPath, value:canonicalMaterial(material)});
    return edits;
  }

  function applyEdits(record, edits) {
    if (!Array.isArray(edits) || new Set(edits.map(e => e.path)).size !== edits.length)
      throw new Error('Expected unique field edits.');
    // Validate every target first; an invalid later target must not leave an
    // earlier update applied. full-core.set rejects unknown and unsafe paths.
    const draft = JSON.parse(JSON.stringify(record));
    for (const edit of edits) F.set(draft, edit.path, edit.value);
    for (const edit of edits) F.set(record, edit.path, edit.value);
    return record;
  }

  const api = {panels,panelProgress,progress,mappedFieldEdit,applyEdits,canonicalMaterial};
  root.L2Compact = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
