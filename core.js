/* BLOCKMIND Level 2: authoritative, dependency-free data model and validators.
 * Human labels never inherit machine predictions. Coordinates are normalized.
 * Shared by the static browser app and the offline Node/Python validation tools. */
(function (root) {
  'use strict';
  const ND = 'not_determinable';
  const CONDITIONS = Object.freeze({
    version:'blockmind_l2_counterfactual_conditions_v1',
    open:'Fully open the designated existing closure; other permanent obstructions remain unchanged.',
    sealed:'Close and tightly seal the designated existing closure, preserving its material/glazing and all other geometry; no air or rain through the sealed closure itself.',
    no_closure_policy:'If no existing closure or its counterfactual material is unknown, sealed-condition judgments are not determinable; do not invent a closure.'
  });
  const yes = ['yes', 'no', ND];
  const FIELDS = {
    yes_no: yes,
    boundary_class: ['outdoor', 'semi_outdoor', ND],
    exterior_enclosure: ['open_air', 'roofed_open_sides', 'enclosed_porch', 'sunroom', 'garage', 'glazed_lobby', 'other', ND],
    shelter: ['overhead', 'partial', 'none', ND],
    kind: ['hinged_door', 'sliding_door', 'folding_door', 'garage_door', 'gate', 'open_passage', 'window', 'other', ND],
    pane_transparency: ['clear', 'obscured', 'opaque', ND],
    glazing: ['present', 'absent', ND],
    observed_state: ['open', 'closed', 'ajar', 'no_closure', ND],
    reflectance: ['reflective', 'non_reflective', ND],
    finish: ['untreated', 'painted', 'coated_sealed', 'glazed', 'polished', 'fabric', 'composite', 'other', ND],
    visibility: ['direct', 'through_glass', 'reflection', 'occluded', 'out_of_frame', ND],
    hierarchy_id: ['__other__', ND]
  };
  const sceneSpec = {crossing_valid: yes, boundary_class: FIELDS.boundary_class,
    exterior_enclosure: FIELDS.exterior_enclosure, shelter: FIELDS.shelter, canonical_context_clear: yes};
  const boundarySpec = {object_identity_correct: yes, kind: FIELDS.kind,
    pane_transparency: FIELDS.pane_transparency, glazing: FIELDS.glazing,
    observed_state: FIELDS.observed_state, material: 'text', hierarchy_id: 'hierarchy',
    reflectance: FIELDS.reflectance, air_gap: yes, pane_in_mesh: yes,
    phantom_geometry: yes, isolated_leaf: yes, mask_matches_rgb: yes};
  const surfaceSpec = {object_name: 'text', material: 'text', hierarchy_id: 'hierarchy',
    reflectance: FIELDS.reflectance, finish: FIELDS.finish, substrate_known: yes,
    substrate_material: 'text', substrate_hierarchy_id: 'hierarchy', shelter: FIELDS.shelter};
  const FRAMES = Array.from({length: 12}, (_, i) => 'f' + String(i + 1).padStart(2, '0'));
  const DIRECTIONS = ['d1', 'd2'], STATES = ['open', 'sealed'];
  const SCENE_KEYS = Object.keys(sceneSpec), BOUNDARY_KEYS = Object.keys(boundarySpec), SURFACE_KEYS = Object.keys(surfaceSpec);
  [...SCENE_KEYS, ...BOUNDARY_KEYS, ...SURFACE_KEYS, 'object_match', 'box_correct',
    'direct_sun', 'diffuse_light', 'air', 'rain', 'sun'].forEach(k => {
      if (!FIELDS[k]) FIELDS[k] = sceneSpec[k] || boundarySpec[k] || surfaceSpec[k] || yes;
    });
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && !Number.isNaN(Date.parse(value));
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  // SHA-256 of UTF-8. Synchronous and portable; layout identity is not authentication.
  function sha256(value) {
    const bytes = new TextEncoder().encode(value), words = [], bits = bytes.length * 8;
    for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes[i] << (24 - (i % 4) * 8);
    words[bits >> 5] = (words[bits >> 5] || 0) | 0x80 << (24 - bits % 32);
    words[((bits + 64 >> 9) << 4) + 15] = bits;
    const k = [], h = []; let candidate = 2;
    while (k.length < 64) {
      let prime = true;
      for (let f = 2; f * f <= candidate; f++) if (candidate % f === 0) { prime = false; break; }
      if (prime) { if (h.length < 8) h.push((Math.sqrt(candidate) % 1 * 4294967296) | 0); k.push((Math.cbrt(candidate) % 1 * 4294967296) | 0); }
      candidate++;
    }
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < words.length; offset += 16) {
      const w = Array.from({length: 64}, (_, i) => words[offset + i] | 0); let [a,b,c,d,e,f,g,z] = h;
      for (let i = 0; i < 64; i++) {
        if (i >= 16) { const s0 = r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3), s1 = r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1)|0; }
        const t1 = (z+(r(e,6)^r(e,11)^r(e,25))+((e&f)^((~e)&g))+k[i]+w[i])|0;
        const t2 = ((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;
        z=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
      }
      [a,b,c,d,e,f,g,z].forEach((v,i) => h[i]=(h[i]+v)|0);
    }
    return h.map(v => (v>>>0).toString(16).padStart(8,'0')).join('');
  }
  function layoutId(layout) {
    const canonical = {};
    Object.keys(layout || {}).filter(k => !['created_at', 'coordinator', 'layout_id'].includes(k)).forEach(k => canonical[k] = layout[k]);
    return 'l2-' + sha256(stableStringify(canonical));
  }
  function forbidden(value, path, errors) {
    if (value === null || typeof value !== 'object') return;
    Object.keys(value).forEach(k => {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) errors.push(path + ': forbidden key ' + k);
      else forbidden(value[k], path + '.' + k, errors);
    });
  }
  function keys(value, required, optional, path, errors) {
    if (!object(value)) { errors.push(path + ': expected object'); return false; }
    required.forEach(k => { if (!Object.prototype.hasOwnProperty.call(value, k)) errors.push(path + '.' + k + ': missing'); });
    Object.keys(value).forEach(k => { if (!required.includes(k) && !optional.includes(k)) errors.push(path + '.' + k + ': unexpected field'); });
    return true;
  }
  function list(value, path, errors) { if (!Array.isArray(value)) { errors.push(path + ': expected array'); return []; } return value; }
  function enumValue(value, options, path, errors, incomplete) {
    if (value === null && incomplete) return;
    if (!options.includes(value)) errors.push(path + ': ' + (value === null ? 'unanswered' : 'invalid value ' + JSON.stringify(value)));
  }
  function makeLayout(dataset, coordinator) {
    return {schema: 'blockmind_l2_layout_v1', build_id: dataset.build_id, layout_id: '',
      created_at: new Date().toISOString(), coordinator: coordinator || '',conditions:clone(CONDITIONS),
      episodes: dataset.episodes.map(ep => ({episode_id: ep.id, disposition: 'include', exclusion_reason: '',
        markers: (ep.proposed_markers || []).map(m => ({id:m.id,side:m.side,anchor_frame:m.anchor_frame,x:m.x,y:m.y,
          object_id:m.object_id == null ? null : m.object_id,mpcat40:m.mpcat40 == null ? null : m.mpcat40,
          observations:(m.observations || []).map(o=>({frame_id:o.frame_id,x:o.x,y:o.y,source:o.source}))})),
        directions: DIRECTIONS.map(id => ({id,text:'',reference_frame:'f01',x:null,y:null})),
        boundary_boxes: ep.frames.filter(f => f.side === 'indoor' && f.boundary_pixels >= 100 && Array.isArray(f.boundary_bbox))
          .slice(0,2).map(f => ({frame_id:f.id,x0:f.boundary_bbox[0],y0:f.boundary_bbox[1],x1:f.boundary_bbox[2],y1:f.boundary_bbox[3]})),
        setup_notes:'',setup_reviewed:false}))};
  }
  function validateLayout(layout, dataset, draft = false) {
    const errors = []; forbidden(layout, 'layout', errors);
    if (!keys(layout,['schema','build_id','layout_id','created_at','coordinator','conditions','episodes'],[], 'layout', errors)) return errors;
    if (layout.schema !== 'blockmind_l2_layout_v1') errors.push('layout.schema: unsupported schema');
    if (layout.build_id !== dataset.build_id) errors.push('layout.build_id: different dataset build');
    if(stableStringify(layout.conditions)!==stableStringify(CONDITIONS))errors.push('layout.conditions: canonical counterfactual assumptions missing or modified');
    if (!timestamp(layout.created_at)) errors.push('layout.created_at: invalid ISO timestamp');
    if (typeof layout.coordinator !== 'string' || (!draft && !text(layout.coordinator))) errors.push('layout.coordinator: required');
    if (typeof layout.layout_id !== 'string' && !(draft && layout.layout_id === null)) errors.push('layout.layout_id: expected string');
    else if (layout.layout_id && layout.layout_id !== layoutId(layout)) errors.push('layout.layout_id: content hash mismatch');
    const episodes = list(layout.episodes,'layout.episodes',errors), source = new Map(dataset.episodes.map(ep => [ep.id, ep])), seen = new Set();
    episodes.forEach((ep,index) => {
      const p = 'layout.episodes['+index+']';
      if (!keys(ep,['episode_id','disposition','exclusion_reason','markers','directions','boundary_boxes','setup_notes','setup_reviewed'],[],p,errors)) return;
      if (!source.has(ep.episode_id)) { errors.push(p+'.episode_id: unknown episode'); return; }
      if (seen.has(ep.episode_id)) errors.push(p+'.episode_id: duplicate'); seen.add(ep.episode_id);
      enumValue(ep.disposition,['include','exclude'],p+'.disposition',errors,false);
      if (typeof ep.exclusion_reason !== 'string' || typeof ep.setup_notes !== 'string') errors.push(p+': reasons and notes must be strings');
      if (typeof ep.setup_reviewed !== 'boolean') errors.push(p+'.setup_reviewed: expected boolean');
      const included = ep.disposition === 'include', strictIncluded = included && !draft;
      if (strictIncluded && ep.setup_reviewed !== true) errors.push(p+'.setup_reviewed: explicit coordinator review required');
      if (!included && !draft && !text(ep.exclusion_reason)) errors.push(p+'.exclusion_reason: required for exclusion');
      const frames = new Map(source.get(ep.episode_id).frames.map(f => [f.id,f]));
      const knownObjects = new Set(source.get(ep.episode_id).frames.flatMap(f => (f.objects || []).map(o => String(o.object_id))));
      const objectCategories = new Map(source.get(ep.episode_id).frames.flatMap(f => (f.objects || []).map(o => [String(o.object_id),o.mpcat40])));
      const markers = list(ep.markers,p+'.markers',errors), markerIDs = new Set();
      const markerPoints = new Set();
      markers.forEach((m,j) => {
        const q=p+'.markers['+j+']';
        if (!keys(m,['id','side','anchor_frame','x','y','object_id','mpcat40','observations'],[],q,errors)) return;
        if (!text(m.id) || !/^[IE][1-9][0-9]*$/.test(m.id) || markerIDs.has(m.id)) errors.push(q+'.id: invalid or duplicate marker ID'); markerIDs.add(m.id);
        enumValue(m.side,['indoor','exterior'],q+'.side',errors,false);
        if (m.id && m.id[0] !== (m.side === 'indoor' ? 'I' : 'E')) errors.push(q+'.id: prefix disagrees with side');
        if (!frames.has(m.anchor_frame)) errors.push(q+'.anchor_frame: unknown frame');
        else if (frames.get(m.anchor_frame).side !== m.side) errors.push(q+'.anchor_frame: must be on marker side');
        if (!coordinate(m.x)||!coordinate(m.y)) errors.push(q+': invalid normalized coordinates');
        const pointKey=m.anchor_frame+':'+m.x+':'+m.y;
        if(strictIncluded&&markerPoints.has(pointKey))errors.push(q+': duplicate marker location');markerPoints.add(pointKey);
        if (m.object_id !== null && (!Number.isInteger(m.object_id)||m.object_id<0||!knownObjects.has(String(m.object_id)))) errors.push(q+'.object_id: unknown native instance');
        if(m.object_id!==null&&m.mpcat40!==null&&objectCategories.has(String(m.object_id))&&objectCategories.get(String(m.object_id))!=null&&String(m.mpcat40)!==String(objectCategories.get(String(m.object_id))))errors.push(q+'.mpcat40: native object category mismatch');
        if (m.mpcat40 !== null && !(Number.isInteger(m.mpcat40) && m.mpcat40>=-1 && m.mpcat40<=40) && !(typeof m.mpcat40==='string' && /^(?:-1|\d+)$/.test(m.mpcat40) && Number(m.mpcat40)<=40)) errors.push(q+'.mpcat40: invalid category');
        const observationFrames=new Set();
        list(m.observations,q+'.observations',errors).forEach((obs,k) => {
          const v=q+'.observations['+k+']';
          if (!keys(obs,['frame_id','x','y','source'],[],v,errors)) return;
          if (!frames.has(obs.frame_id)||observationFrames.has(obs.frame_id)) errors.push(v+'.frame_id: unknown or duplicate frame'); observationFrames.add(obs.frame_id);
          if (!coordinate(obs.x)||!coordinate(obs.y)) errors.push(v+': invalid normalized coordinates');
          enumValue(obs.source,['mesh_projection','human','human_adjusted','manual','human_annotation'],v+'.source',errors,false);
        });
      });
      if (strictIncluded) ['indoor','exterior'].forEach(side => { const n=markers.filter(m=>m.side===side).length; if(n<3||n>5)errors.push(p+'.markers: need 3–5 markers on '+side); });
      const directions=list(ep.directions,p+'.directions',errors), directionIDs=new Set(), directionTexts=new Set();
      if (strictIncluded && directions.length!==2) errors.push(p+'.directions: exactly two directions required');
      directions.forEach((d,j) => {
        const q=p+'.directions['+j+']';
        if (!keys(d,['id','text','reference_frame','x','y'],[],q,errors)) return;
        if (!DIRECTIONS.includes(d.id)||directionIDs.has(d.id))errors.push(q+'.id: invalid or duplicate');directionIDs.add(d.id);
        if (typeof d.text!=='string'||(strictIncluded&&!text(d.text))) errors.push(q+'.text: direction statement required');
        if(text(d.text)){const t=d.text.trim().toLowerCase();if(directionTexts.has(t))errors.push(q+'.text: directions must differ');directionTexts.add(t);}
        if (!frames.has(d.reference_frame))errors.push(q+'.reference_frame: unknown frame');
        if ((strictIncluded||d.x!==null||d.y!==null)&&(!coordinate(d.x)||!coordinate(d.y))) errors.push(q+': visible reference point required');
      });
      const boxes=list(ep.boundary_boxes,p+'.boundary_boxes',errors), boxFrames=new Set();let pre=0;
      boxes.forEach((b,j)=>{
        const q=p+'.boundary_boxes['+j+']';if(!keys(b,['frame_id','x0','y0','x1','y1'],[],q,errors))return;
        if(!frames.has(b.frame_id)||boxFrames.has(b.frame_id))errors.push(q+'.frame_id: unknown or duplicate');boxFrames.add(b.frame_id);
        if(![b.x0,b.y0,b.x1,b.y1].every(coordinate)||b.x0>=b.x1||b.y0>=b.y1)errors.push(q+': invalid normalized box');
        if(frames.has(b.frame_id)&&frames.get(b.frame_id).side==='indoor')pre++;
      });
      if(strictIncluded&&pre<2)errors.push(p+'.boundary_boxes: need boxes in at least two pre-crossing frames');
    });
    source.forEach((_,id)=>{if(!seen.has(id))errors.push('layout.episodes: missing '+id+' (include or explicitly exclude every episode)');});
    return errors;
  }
  function blank(spec) { return Object.fromEntries(Object.keys(spec).map(k=>[k,null])); }
  function stateCells(channels) { return Object.fromEntries(DIRECTIONS.map(d=>[d,Object.fromEntries(STATES.map(s=>[s,Object.fromEntries(channels.map(c=>[c,null]))]))])); }
  function createEpisode(ep) {
    return {episode_id:ep.episode_id,status:ep.disposition==='exclude'?'excluded':'not_started',
      exclusion_reason:ep.disposition==='exclude'?ep.exclusion_reason:'',
      answers:{scene:blank(sceneSpec),boundary:{...blank(boundarySpec),notes:''},pathways:stateCells(['direct_sun','diffuse_light','air','rain']),
        surfaces:Object.fromEntries(ep.markers.map(m=>[m.id,{...blank(surfaceSpec),reachable:stateCells(['sun','rain']),visibility:Object.fromEntries(FRAMES.map(f=>[f,null])),notes:''}])),
        boundary_visibility:Object.fromEntries(FRAMES.map(f=>[f,{visibility:null,object_match:null,box_correct:null,notes:''}])),notes:''},completed_at:null};
  }
  function createExport(dataset,layout,annotator) {
    const now=new Date().toISOString();
    return {schema:'blockmind_l2_annotations_v1',build_id:dataset.build_id,layout_id:layout.layout_id,annotator:annotator||'',
      created_at:now,updated_at:now,annotation_status:'draft',layout:clone(layout),episodes:layout.episodes.map(createEpisode)};
  }
  function validateRecord(record,layoutEpisode,catalogue,full) {
    const errors=[],p='episode.'+(record&&record.episode_id||'?'); forbidden(record,p,errors);
    if(!keys(record,['episode_id','status','exclusion_reason','answers','completed_at'],[],p,errors))return errors;
    if(record.episode_id!==layoutEpisode.episode_id)errors.push(p+'.episode_id: layout mismatch');
    enumValue(record.status,['not_started','in_progress','complete','excluded'],p+'.status',errors,false);
    if(typeof record.exclusion_reason!=='string')errors.push(p+'.exclusion_reason: expected string');
    if(record.status==='excluded'&&!text(record.exclusion_reason))errors.push(p+'.exclusion_reason: required');
    if(layoutEpisode.disposition==='exclude'&&record.status!=='excluded')errors.push(p+'.status: coordinator excluded episode');
    if(record.completed_at!==null&&!timestamp(record.completed_at))errors.push(p+'.completed_at: invalid ISO timestamp');
    if(record.status==='complete'&&!timestamp(record.completed_at))errors.push(p+'.completed_at: required for complete record');
    const required=full&&record.status!=='excluded';
    const ids=new Set((catalogue.materials||[]).map(m=>String(m.id)));
    const field=(value,spec,path)=>{
      if(value===null&&!required)return;
      if(Array.isArray(spec))enumValue(value,spec,path,errors,!required);
      else if(spec==='text'){if(!text(value))errors.push(path+': '+(value===null?'unanswered':'nonempty text required'));}
      else if(spec==='hierarchy'&&!ids.has(String(value))&&!['__other__',ND].includes(value))errors.push(path+': '+(value===null?'unanswered':'unknown catalogue ID'));
    };
    const fields=(value,spec,path,optional=[],allowNull=[])=>{
      if(!keys(value,Object.keys(spec),optional,path,errors))return;
      Object.entries(spec).forEach(([k,s])=>{if(value[k]===null&&allowNull.includes(k))return;field(value[k],s,path+'.'+k);});
      if('notes'in value&&typeof value.notes!=='string')errors.push(path+'.notes: expected string');
    };
    const states=(value,channels,path)=>{
      if(!keys(value,DIRECTIONS,[],path,errors))return;
      DIRECTIONS.forEach(d=>{if(!keys(value[d],STATES,[],path+'.'+d,errors))return;STATES.forEach(s=>fields(value[d][s],Object.fromEntries(channels.map(c=>[c,yes])),path+'.'+d+'.'+s));});
    };
    const a=record.answers;
    if(!keys(a,['scene','boundary','pathways','surfaces','boundary_visibility','notes'],[],p+'.answers',errors))return errors;
    fields(a.scene,sceneSpec,p+'.answers.scene');fields(a.boundary,boundarySpec,p+'.answers.boundary',['notes']);
    states(a.pathways,['direct_sun','diffuse_light','air','rain'],p+'.answers.pathways');
    if(keys(a.surfaces,layoutEpisode.markers.map(m=>m.id),[],p+'.answers.surfaces',errors))layoutEpisode.markers.forEach(m=>{
      const s=a.surfaces[m.id],q=p+'.answers.surfaces.'+m.id;
      fields(s,surfaceSpec,q,['reachable','visibility','notes'],object(s)&&s.substrate_known!=='yes'?['substrate_material','substrate_hierarchy_id']:[]);if(!object(s))return;
      states(s.reachable,['sun','rain'],q+'.reachable');
      fields(s.visibility,Object.fromEntries(FRAMES.map(f=>[f,FIELDS.visibility])),q+'.visibility');
    });
    if(keys(a.boundary_visibility,FRAMES,[],p+'.answers.boundary_visibility',errors))FRAMES.forEach(f=>fields(a.boundary_visibility[f],{visibility:FIELDS.visibility,object_match:yes,box_correct:yes},p+'.answers.boundary_visibility.'+f,['notes']));
    if(typeof a.notes!=='string')errors.push(p+'.answers.notes: expected string');
    if(required&&stableStringify(a).includes('"'+ND+'"')&&!text(a.notes))errors.push(p+'.answers.notes: explain not-determinable judgments');
    return errors;
  }
  const validateEpisode=(record,layoutEpisode,catalogue)=>validateRecord(record,layoutEpisode,catalogue,true);
  const validateDraftEpisode=(record,layoutEpisode,catalogue)=>validateRecord(record,layoutEpisode,catalogue,false);
  function validateExport(doc,dataset,catalogue,requireComplete=false) {
    const errors=[];forbidden(doc,'export',errors);
    if(!keys(doc,['schema','build_id','layout_id','annotator','created_at','updated_at','annotation_status','layout','episodes'],['hint_usage'],'export',errors))return errors;
    if(doc.schema!=='blockmind_l2_annotations_v1')errors.push('export.schema: unsupported schema');
    if(doc.build_id!==dataset.build_id||catalogue.build_id!==dataset.build_id)errors.push('export.build_id: dataset/catalogue mismatch');
    if(!text(doc.annotator))errors.push('export.annotator: required independent rater ID');
    if(!timestamp(doc.created_at)||!timestamp(doc.updated_at))errors.push('export: invalid timestamps');
    enumValue(doc.annotation_status,['draft','complete'],'export.annotation_status',errors,false);
    if('hint_usage'in doc&&!Array.isArray(doc.hint_usage))errors.push('export.hint_usage: expected array');
    errors.push(...validateLayout(doc.layout,dataset));
    if(!object(doc.layout)||!Array.isArray(doc.layout.episodes))return errors;
    if(!text(doc.layout_id)||doc.layout_id!==doc.layout.layout_id||doc.layout_id!==layoutId(doc.layout))errors.push('export.layout_id: frozen layout hash mismatch');
    const layouts=new Map(doc.layout.episodes.map(e=>[e.episode_id,e])),seen=new Set();
    list(doc.episodes,'export.episodes',errors).forEach(record=>{
      if(!object(record)||!layouts.has(record.episode_id)){errors.push('export.episodes: unknown/malformed episode');return;}
      if(seen.has(record.episode_id))errors.push('export.episodes: duplicate '+record.episode_id);seen.add(record.episode_id);
      const full=requireComplete||doc.annotation_status==='complete'||record.status==='complete';
      errors.push(...validateRecord(record,layouts.get(record.episode_id),catalogue,full));
      if((requireComplete||doc.annotation_status==='complete')&&!['complete','excluded'].includes(record.status))errors.push('episode.'+record.episode_id+'.status: incomplete');
    });
    layouts.forEach((_,id)=>{if(!seen.has(id))errors.push('export.episodes: missing '+id);});
    if(requireComplete&&doc.annotation_status!=='complete')errors.push('export.annotation_status: complete export required');
    return errors;
  }
  const validateLayoutDraft=(layout,dataset)=>validateLayout(layout,dataset,true);
  const safeValidator=fn=>(...args)=>{try{return fn(...args);}catch(error){return ['Malformed document: '+error.message];}};
  const api={ND,CONDITIONS,FIELDS,FRAMES,DIRECTIONS,STATES,makeLayout,validateLayout:safeValidator(validateLayout),validateLayoutDraft:safeValidator(validateLayoutDraft),layoutId,createEpisode,validateEpisode:safeValidator(validateEpisode),validateDraftEpisode:safeValidator(validateDraftEpisode),createExport,validateExport:safeValidator(validateExport),stableStringify,clone,sha256};
  root.L2Core=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
