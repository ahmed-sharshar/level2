/* Later-stage human review queues. No model calls, invented items, or GT. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.L2Core;
  const kinds = ['matcher', 'baseline', 'error'];
  const codes = ['prompt', 'perception', 'reasoning', 'physics_application', 'not_determinable'];
  const isText = x => typeof x === 'string' && x.trim().length > 0;
  const hash = x => C.sha256(C.stableStringify(x));
  function validateQueue(q, dataset) {
    const errors = [];
    if (!q || q.schema !== 'blockmind_review_tasks_v1' || !kinds.includes(q.kind)) return ['Unsupported review queue.'];
    if (!isText(q.title) || !Array.isArray(q.items) || !q.items.length) return ['A title and nonempty items list are required.'];
    const allowed = new Set(['id','family','model_id','question','options','multi_select','frames','pair_id']);
    if (q.kind !== 'baseline') allowed.add('response');
    else allowed.delete('model_id');
    if (q.kind === 'matcher') allowed.add('machine_extraction');
    const ids = new Set();
    for (const item of q.items) {
      if (!item || typeof item !== 'object') { errors.push('Invalid queue item.'); continue; }
      const prefix = String(item.id || '?') + ': ';
      for (const key of Object.keys(item)) if (!allowed.has(key)) errors.push(prefix + 'unexpected field ' + key + ' (no hidden GT or model responses in baseline queues).');
      if (!isText(item.id) || ids.has(item.id)) errors.push(prefix + 'unique text ID required.');
      ids.add(item.id);
      if (item.pair_id !== undefined && !isText(item.pair_id)) errors.push(prefix + 'pair_id must be text.');
      if (!['A','B','C','D'].includes(item.family) || !isText(item.question)) errors.push(prefix + 'family A–D and question required.');
      if (q.kind !== 'baseline' && (!isText(item.model_id) || !isText(item.response))) errors.push(prefix + 'model ID and response required.');
      if (typeof item.multi_select !== 'boolean' || !Array.isArray(item.options) || !item.options.length) { errors.push(prefix + 'explicit options and multi_select required.'); continue; }
      const optionIds = item.options.map(o => o && o.id);
      if (new Set(optionIds).size !== optionIds.length || item.options.some(o => !o || !isText(o.id) || !isText(o.text) || Object.keys(o).some(k => !['id','text'].includes(k)))) errors.push(prefix + 'invalid answer options.');
      if (q.kind === 'matcher' && answerErrors(item.machine_extraction, item, false).length) errors.push(prefix + 'invalid machine extraction.');
      if (!Array.isArray(item.frames)) errors.push(prefix + 'frames must be a list (can be empty for extraction/error review).');
      else {
        if (q.kind === 'baseline' && !item.frames.length) errors.push(prefix + 'human visual baseline needs its model-visible frames.');
        for (const frame of item.frames) {
          const episode = dataset.episodes.find(e => e.id === frame.episode_id);
          if (!episode || !episode.frames.some(f => f.id === frame.frame_id)) errors.push(prefix + 'unknown RGB frame reference.');
          if (Object.keys(frame).some(k => !['episode_id','frame_id','markers'].includes(k))) errors.push(prefix + 'only dataset RGB references and numbered markers are allowed.');
          if (frame.markers !== undefined && (!Array.isArray(frame.markers) || frame.markers.some(m => !m || typeof m.label !== 'string' || !/^[1-9][0-9]*$/.test(m.label) || ![m.x,m.y].every(v => typeof v === 'number' && v >= 0 && v <= 1) || Object.keys(m).some(k => !['label','x','y'].includes(k))))) errors.push(prefix + 'invalid numbered marker or coordinates.');
        }
      }
    }
    for (const key of Object.keys(q)) if (!['schema','kind','title','items'].includes(key)) errors.push('Unexpected queue metadata: ' + key);
    return errors;
  }
  function answerErrors(a, item, human = true) {
    if (!a || !['answered','unparseable', ...(human ? ['not_determinable'] : [])].includes(a.status) || !Array.isArray(a.selected_options)) return ['Invalid answer status.'];
    if (Object.keys(a).some(k=>!(human?['status','selected_options','notes']:['status','selected_options']).includes(k))) return ['Unexpected answer field.'];
    const ids = item.options.map(o => o.id);
    if (a.selected_options.some(id => !ids.includes(id)) || new Set(a.selected_options).size !== a.selected_options.length) return ['Invalid selected options.'];
    if (a.status !== 'answered' && a.selected_options.length) return ['Non-answers cannot include options.'];
    if (a.status === 'answered' && ((!item.multi_select && a.selected_options.length !== 1))) return ['Choose exactly one option.'];
    return [];
  }
  function create(queue, reviewer, dataset) {
    if (!isText(reviewer)) throw Error('Reviewer name required.');
    if (!dataset || !isText(dataset.build_id)) throw Error('Dataset build identity required.');
    return {schema:'blockmind_review_annotations_v1',build_id:dataset.build_id,task_id:hash({build_id:dataset.build_id,queue}),queue:C.clone(queue),reviewer:reviewer.trim(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),answers:Object.fromEntries(queue.items.map(i => [i.id,null]))};
  }
  function validate(doc, dataset) {
    if (!doc || doc.schema !== 'blockmind_review_annotations_v1' || !isText(doc.reviewer)) return ['Unsupported review annotation.'];
    const errors = validateQueue(doc.queue, dataset);
    if (errors.length) return errors;
    if (doc.build_id !== dataset.build_id) errors.push('Dataset build identity mismatch.');
    if (doc.task_id !== hash({build_id:doc.build_id,queue:doc.queue})) errors.push('Task identity mismatch.');
    if (!doc.answers || typeof doc.answers !== 'object' || Array.isArray(doc.answers)) return [...errors,'Missing answers.'];
    const ids = doc.queue.items.map(i => i.id);
    if (Object.keys(doc.answers).length !== ids.length || Object.keys(doc.answers).some(id => !ids.includes(id))) errors.push('Answer inventory differs from queue.');
    for (const item of doc.queue.items) {
      const a = doc.answers[item.id];
      if (a === null) continue;
      if (!a || !isText(a.notes || '') && a.notes !== '') { errors.push(item.id + ': notes must be text.'); continue; }
      if (doc.queue.kind === 'error') { if (!codes.includes(a.category) || Object.keys(a).some(k=>!['category','notes'].includes(k))) errors.push(item.id + ': invalid error code or fields.'); }
      else errors.push(...answerErrors(a,item).map(e => item.id + ': ' + e));
      if ((a.category === 'not_determinable' || a.status === 'not_determinable') && !isText(a.notes)) errors.push(item.id + ': explain uncertainty briefly.');
    }
    return errors;
  }
  function report(doc) {
    let labeled = 0, usable = 0, correct = 0, uncertain = 0;
    const groups = {};
    for (const item of doc.queue.items) {
      const a = doc.answers[item.id];
      if (!a) continue;
      labeled++;
      if (a.category === 'not_determinable' || a.status === 'not_determinable') {
        uncertain++;
        if(doc.queue.kind==='error'){
          const key=item.family+' / '+item.model_id;
          if(!groups[key])groups[key]={labeled:0,uncertain:0,codes:Object.fromEntries(codes.map(c=>[c,0]))};
          groups[key].uncertain++;groups[key].codes.not_determinable++;
        }
        continue;
      }
      usable++;
      if (doc.queue.kind === 'matcher') {
        const m = item.machine_extraction;
        if (a.status === m.status && JSON.stringify([...a.selected_options].sort()) === JSON.stringify([...m.selected_options].sort())) correct++;
      }
      if (doc.queue.kind === 'error') {
        const key = item.family + ' / ' + item.model_id;
        if (!groups[key]) groups[key] = {labeled:0,uncertain:0,codes:Object.fromEntries(codes.map(c => [c,0]))};
        groups[key].labeled++; groups[key].codes[a.category]++;
      }
    }
    const output = {kind:doc.queue.kind,build_id:doc.build_id,task_id:doc.task_id,reviewer:doc.reviewer,total:doc.queue.items.length,labeled,unanswered:doc.queue.items.length-labeled,uncertain,usable,benchmark_ready:false};
    if (doc.queue.kind === 'matcher') Object.assign(output,{exact_matches:correct,accuracy:usable ? correct/usable : null,gate_passed:usable>=100 && correct/usable>=.98,minimum_reviewed_outputs:100,threshold:.98});
    if (doc.queue.kind === 'error') {
      for (const item of doc.queue.items) {
        const key = item.family + ' / ' + item.model_id;
        if (!groups[key]) groups[key] = {labeled:0,uncertain:0,codes:Object.fromEntries(codes.map(c => [c,0]))};
      }
      Object.values(groups).forEach(g => g.target_met=g.labeled>=30);
      output.groups=groups;output.minimum_per_family_model=30;
    }
    if (doc.queue.kind === 'baseline') output.note='Unscored human answers only; compare against separately frozen GT downstream.';
    return output;
  }
  const safe=fn=>(...args)=>{try{return fn(...args);}catch(e){return ['Malformed document: '+e.message];}};
  const api = {validateQueue:safe(validateQueue),create,validate:safe(validate),report,hash,codes};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.L2Review=api;
})(typeof window !== 'undefined' ? window : globalThis);
