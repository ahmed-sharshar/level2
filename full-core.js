/* Complete guided collection. Shared browser/CLI implementation, no model calls.
 * Machine geometry is a target proposal, never a default human answer. */
(function(root){
  'use strict';
  const Core=root.L2Core||(typeof require==='function'?require('./core.js'):null);
  const Guided=root.L2Guided||(typeof require==='function'?require('./guided-core.js'):null);
  if(!Core)throw new Error('Load core.js before full-core.js');
  const SCHEMA='blockmind_l2_annotations_v2', TASK_SCHEMA='blockmind_l2_tasks_v1', ND=Core.ND;
  const BOUNDARY_QUESTIONS_VERSION=1;
  const COLLECTION_CHECKS_VERSION=1;
  const PASSAGE_OPTIONS=['sunlight','rain','air','visible_light','none',ND];
  const WIDTH_CLASS=['single_door','double_door','wide_glass_wall',ND];
  const BOUNDARY_BLOCKAGE=['none','curtains','blinds','screen','furniture','multiple','other',ND];
  const SECTIONS=['scene','boundary','surfaces','exposure','pathways','visibility'];
  const YES=['yes','no',ND], OBSTRUCTION=['none','overhead','side','overhead_and_side','other',ND];
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const filled=v=>v!==null&&v!==undefined&&(typeof v!=='string'||v.trim()!=='');
  const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
  const usableDirection=d=>filled(d?.text)&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&!/(?:UNAPPROVED DRAFT|\[name the visible)/i.test(d.text);
  const clone=Core.clone, stable=Core.stableStringify;
  function get(value,path){return path.split('.').reduce((v,k)=>v==null?undefined:v[k],value);}
  function set(value,path,answer){const parts=path.split('.');if(parts.some(k=>['__proto__','constructor','prototype'].includes(k)))throw new Error('Unsafe field path');let v=value;for(const k of parts.slice(0,-1)){if(!obj(v[k]))throw new Error('Unknown field path: '+path);v=v[k];}if(!own(v,parts.at(-1)))throw new Error('Unknown field path: '+path);v[parts.at(-1)]=answer;}
  function inspect(value,errors){
    const seen=new Set(), stack=[[value,'document',0]];let n=0;
    while(stack.length){const [v,p,d]=stack.pop();if(++n>1000000||d>50){errors.push(p+': excessive size or nesting');return;}
      if(v===null||['string','boolean'].includes(typeof v))continue;
      if(typeof v==='number'){if(!Number.isFinite(v))errors.push(p+': non-finite number');continue;}
      if(typeof v!=='object'){errors.push(p+': expected JSON value');continue;}
      if(seen.has(v)){errors.push(p+': circular or shared object');return;}seen.add(v);
      if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))){errors.push(p+': expected plain object');return;}
      for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))errors.push(p+': forbidden key '+k);else stack.push([v[k],p+'.'+k,d+1]);}
    }
  }
  function keys(v,required,optional,p,errors){if(!obj(v)){errors.push(p+': expected object');return false;}required.forEach(k=>{if(!own(v,k))errors.push(p+'.'+k+': missing');});Object.keys(v).forEach(k=>{if(!required.includes(k)&&!optional.includes(k))errors.push(p+'.'+k+': unexpected field');});return true;}
  function enumCheck(v,options,p,errors,nullable=true){if(v===null&&nullable)return;if(!options.includes(v))errors.push(p+': invalid value');}
  function canonicalSelections(values,allowed){const order=allowed.map(v=>typeof v==='object'?v.value:v);return Array.isArray(values)?order.filter(v=>values.includes(v)):values;}
  function selectionCheck(value,allowed,path,errors){
    if(value===null)return;
    if(!Array.isArray(value)||!value.length||value.some(v=>!allowed.includes(v))||new Set(value).size!==value.length){errors.push(path+': choose a nonempty set of valid options, or leave unanswered');return;}
    if(value.length>1&&value.some(v=>v==='none'||v===ND))errors.push(path+': Nothing/None and Not sure must be exclusive');
    if(stable(value)!==stable(canonicalSelections(value,allowed)))errors.push(path+': selections must use canonical option order');
  }
  const exteriorFrameIds=source=>source.frames.filter(f=>f.side==='exterior').map(f=>f.id);
  function collectionChecks(ep){return {opening_passage:Object.fromEntries(Core.DIRECTIONS.map(d=>[d,Object.fromEntries(Core.STATES.map(s=>[s,null]))])),indoor_visibility:Object.fromEntries(ep.markers.filter(m=>m.side==='indoor').map(m=>[m.id,null]))};}
  const safe=fn=>(...args)=>{try{return fn(...args);}catch(e){return ['Malformed document: '+e.message];}};
  const hierarchyCache=new WeakMap();
  function hierarchyHash(catalogue){const content=stable(catalogue.materials||[]),cached=hierarchyCache.get(catalogue);if(cached?.content===content)return cached.hash;const hash=Core.sha256(content);hierarchyCache.set(catalogue,{content,hash});return hash;}
  function taskContent(tasks){
    const content=clone(tasks);delete content.task_id;delete content.created_at;delete content.coordinator;
    if(content.layout){delete content.layout.created_at;delete content.layout.coordinator;delete content.layout.layout_id;}
    return content;
  }
  function taskId(tasks){return 'l2tasks-'+Core.sha256(stable(taskContent(tasks)));}
  function createTasks(dataset,catalogue,coordinator=''){
    const tasks={schema:TASK_SCHEMA,build_id:dataset.build_id,task_id:'',created_at:new Date().toISOString(),coordinator,
      layout:Core.makeLayout(dataset,coordinator),settings:{version:'blockmind_l2_collection_v1',hierarchy_sha256:hierarchyHash(catalogue),hierarchy_reviewed:false,hierarchy_reviewer:'',protocol_reviewed:false,protocol_reviewer:'',protocol_notes:'',vhc_allowed_pairs_status:'not_supplied'},
      audits:Object.fromEntries(dataset.episodes.map(ep=>[ep.id,{trajectory:{selected:false,valid:null,notes:''},glass:{selected:false,pane_present:null,phantom_geometry:null,separate_leaf:null,evidence_frames:[],notes:''}}]))};
    tasks.task_id=taskId(tasks);return tasks;
  }
  function settingsErrors(tasks,catalogue,ready){
    const errors=[],s=tasks.settings;
    if(!keys(s,['version','hierarchy_sha256','hierarchy_reviewed','hierarchy_reviewer','protocol_reviewed','protocol_reviewer','protocol_notes','vhc_allowed_pairs_status'],['points_per_side'],'tasks.settings',errors))return errors;
    if(own(s,'points_per_side')&&s.points_per_side!==4)errors.push('tasks.settings.points_per_side: expected exactly 4');
    if(s.version!=='blockmind_l2_collection_v1')errors.push('tasks.settings.version: unsupported');
    if(s.hierarchy_sha256!==hierarchyHash(catalogue))errors.push('tasks.settings.hierarchy_sha256: reference catalogue hash mismatch');
    for(const key of ['hierarchy','protocol']){
      if(typeof s[key+'_reviewed']!=='boolean')errors.push('tasks.settings.'+key+'_reviewed: expected boolean');
      if(typeof s[key+'_reviewer']!=='string')errors.push('tasks.settings.'+key+'_reviewer: expected text');
      if(s[key+'_reviewed']===true&&!filled(s[key+'_reviewer']))errors.push('Researcher pending: name the reviewer who approved the '+key+' settings.');
      if(ready&&s[key+'_reviewed']!==true)errors.push('Researcher pending: '+key+' settings have not been approved.');
    }
    if(typeof s.protocol_notes!=='string')errors.push('tasks.settings.protocol_notes: expected text');
    if(!['not_supplied','pending_review','approved_external'].includes(s.vhc_allowed_pairs_status))errors.push('tasks.settings.vhc_allowed_pairs_status: unsupported status');
    return errors;
  }
  function validateTasksUnsafe(tasks,dataset,catalogue,requireReady=false){
    const errors=[];inspect(tasks,errors);if(errors.length)return errors;
    if(!keys(tasks,['schema','build_id','task_id','created_at','coordinator','layout','settings','audits'],[],'tasks',errors))return errors;
    if(tasks.schema!==TASK_SCHEMA)errors.push('tasks.schema: unsupported');
    if(tasks.build_id!==dataset.build_id||catalogue.build_id!==dataset.build_id)errors.push('tasks.build_id: dataset/catalogue mismatch');
    if(!stamp(tasks.created_at)||typeof tasks.coordinator!=='string')errors.push('tasks: invalid timestamp or coordinator');
    if(requireReady&&!filled(tasks.coordinator))errors.push('Researcher pending: enter the setup coordinator name.');
    if(tasks.task_id!==taskId(tasks))errors.push('tasks.task_id: content identity mismatch');
    errors.push(...Core.validateLayout(tasks.layout,dataset,!requireReady));
    if(requireReady&&Array.isArray(tasks.layout?.episodes))for(const ep of tasks.layout.episodes)if(ep.disposition==='include'&&ep.directions.some(d=>!usableDirection(d)))errors.push('Researcher pending: '+ep.episode_id+' has a blank or unapproved placeholder direction.');
    if(obj(tasks.layout)&&Array.isArray(tasks.layout.episodes))tasks.layout.episodes.forEach((ep,i)=>{if(ep.episode_id!==dataset.episodes[i]?.id)errors.push('tasks.layout.episodes: dataset order must be preserved');});
    errors.push(...settingsErrors(tasks,catalogue,requireReady));
    if(requireReady&&tasks.settings?.points_per_side===4&&Array.isArray(tasks.layout?.episodes))for(const ep of tasks.layout.episodes)if(ep.disposition==='include')for(const side of ['indoor','exterior'])if(ep.markers.filter(m=>m.side===side).length!==4)errors.push('Researcher pending: '+ep.episode_id+' needs exactly 4 red points on the '+side+' side.');
    const ids=dataset.episodes.map(e=>e.id);
    if(keys(tasks.audits,ids,[],'tasks.audits',errors))for(const ep of dataset.episodes){
      const a=tasks.audits[ep.id],p='tasks.audits.'+ep.id;
      if(!keys(a,['trajectory','glass'],[],p,errors))continue;
      if(keys(a.trajectory,['selected','valid','notes'],[],p+'.trajectory',errors)){
        if(typeof a.trajectory.selected!=='boolean'||typeof a.trajectory.notes!=='string')errors.push(p+'.trajectory: malformed flag or notes');
        enumCheck(a.trajectory.valid,YES,p+'.trajectory.valid',errors);
      }
      if(keys(a.glass,['selected','pane_present','phantom_geometry','separate_leaf','evidence_frames','notes'],[],p+'.glass',errors)){
        const g=a.glass;if(typeof g.selected!=='boolean'||typeof g.notes!=='string')errors.push(p+'.glass: malformed flag or notes');
        ['pane_present','phantom_geometry','separate_leaf'].forEach(k=>enumCheck(g[k],YES,p+'.glass.'+k,errors));
        if(!Array.isArray(g.evidence_frames)||new Set(g.evidence_frames).size!==g.evidence_frames.length||g.evidence_frames.some(f=>!ep.frames.some(x=>x.id===f)))errors.push(p+'.glass.evidence_frames: invalid frames');
      }
    }
    return errors;
  }
  const validateTasks=safe(validateTasksUnsafe);
  function episodeReady(tasks,index,dataset,catalogue){
    try{
      const errors=settingsErrors(tasks,catalogue,true),ep=tasks.layout.episodes[index],source=dataset.episodes[index];
      if(!ep||!source||ep.episode_id!==source.id)return {ready:false,errors:['Researcher pending: episode setup is unavailable.']};
      if(!filled(tasks.coordinator)||!filled(tasks.layout.coordinator))errors.push('Researcher pending: setup coordinator name is missing.');
      const layout=clone(tasks.layout);layout.episodes=[clone(ep)];layout.layout_id='';
      errors.push(...Core.validateLayout(layout,{...dataset,episodes:[source]},false));
      if(tasks.settings.points_per_side===4&&ep.disposition==='include')for(const side of ['indoor','exterior'])if(ep.markers.filter(m=>m.side===side).length!==4)errors.push('Researcher pending: exactly 4 red points are required on the '+side+' side.');
      if(ep.disposition==='include'&&ep.directions.some(d=>!usableDirection(d)))errors.push('Researcher pending: replace unapproved draft direction placeholders with reviewed feature-relative wording.');
      return {ready:errors.length===0,errors};
    }catch(e){return {ready:false,errors:['Researcher pending: malformed task setup.']};}
  }
  function createRecord(ep){
    return {...Core.createEpisode(ep),checks:{indoor_region_correct:null,exterior_region_correct:null,boundary:{width_class:null,blockage:null},surfaces:Object.fromEntries(ep.markers.map(m=>[m.id,{anchor_correct:null,same_surface_across_frames:null,obstruction:null}])),...collectionChecks(ep)}};
  }
  function create(dataset,catalogue,tasks,annotator,profile='l2'){
    const errors=validateTasks(tasks,dataset,catalogue);if(errors.length)throw new Error(errors.slice(0,5).join('; '));
    const now=new Date().toISOString();return {schema:SCHEMA,boundary_questions_version:BOUNDARY_QUESTIONS_VERSION,collection_checks_version:COLLECTION_CHECKS_VERSION,build_id:dataset.build_id,task_id:tasks.task_id,tasks:clone(tasks),annotator:annotator||'',profile,created_at:now,updated_at:now,annotation_status:'draft',benchmark_ready:false,episodes:tasks.layout.episodes.map(createRecord),ui:{episode:0,section:'scene',question:0,frame:0},migration_log:[]};
  }
  const LABELS={yes:'Yes',no:'No',[ND]:'Not sure',outdoor:'Outdoor / open-air',semi_outdoor:'Semi-outdoor / partly enclosed',open_air:'Open air',roofed_open_sides:'Roof with open sides',enclosed_porch:'Enclosed porch',sunroom:'Sunroom',garage:'Garage',glazed_lobby:'Glazed lobby',other:'Other',overhead:'Overhead cover',partial:'Partial cover',none:'No cover',hinged_door:'Hinged door',sliding_door:'Sliding door',folding_door:'Folding door',garage_door:'Garage door',gate:'Gate',open_passage:'Open passage (no door)',window:'Window',clear:'Clear / see-through',obscured:'Frosted, translucent or obscured',opaque:'Opaque / cannot see through',present:'Glass is present',absent:'No glass',open:'Open',closed:'Closed',ajar:'Partly open',no_closure:'No door / closure exists',reflective:'Reflective',non_reflective:'Non-reflective',untreated:'Bare / untreated',painted:'Painted',coated_sealed:'Coated or sealed',glazed:'Glazed',polished:'Polished',fabric:'Fabric covering',composite:'Composite finish',direct:'Directly visible',through_glass:'Visible through glass',reflection:'Only seen in a reflection',occluded:'Hidden behind something',out_of_frame:'Outside this frame',side:'Side obstruction',overhead_and_side:'Overhead and side obstruction',__other__:'Other / no matching reference'};
  const options=values=>values.map(value=>({value,label:LABELS[value]||String(value).replaceAll('_',' ')}));
  const PHYSICS_HELP='Use the stated hypothetical direction, not the weather visible in the photograph. Direct sunlight can pass through clear glass; rain cannot pass through intact glass. Keep other walls, roofs and permanent obstacles unchanged. If the image does not establish the answer, choose Not sure.';
  const EXPOSURE_HELP=PHYSICS_HELP+' For a point under slats or lattice, choose Not sure for rain unless the stated scenario brings rain in sideways. For sideways rain, judge the visible path; it is not automatically Hit directly.';
  function questions(doc,index,dataset,catalogue){
    const ep=doc.tasks.layout.episodes[index],r=doc.episodes[index],out=[];if(!ep||!r)return out;
    const add=(path,section,title,help='',meta={})=>{
      const field=path.split('.').at(-1),spec=field==='obstruction'?OBSTRUCTION:Core.FIELDS[field]||YES;
      const kind=meta.kind||(spec==='text'?'text':spec==='hierarchy'||field==='hierarchy_id'||field==='substrate_hierarchy_id'?'hierarchy':'choice');
      const opts=kind==='choice'?options(Array.isArray(spec)?spec:YES):kind==='hierarchy'?[...(catalogue.materials||[]).map(m=>({value:String(m.id),label:m.description||m.label||m.name||String(m.id)})),...options(['__other__',ND])]:[];
      if(field==='shelter')for(const option of opts)option.label=({overhead:'Solid roof / overhang',slats_lattice:'Slats or lattice (partial)',none:'Open sky',partial:'Other partial cover',[ND]:'Not sure'})[option.value]||option.label;
      out.push({id:path,path,section,title,help,kind,options:opts,...meta});
    };
    add('answers.scene.crossing_valid','scene','Does this sequence cross one indoor–outdoor boundary?','Play all 12 images. There should be one transition, not a second return crossing.');
    add('checks.indoor_region_correct','scene','Are the first six images on the indoor side?','Judge from the RGB images, not a scene name.',{frame_id:'f01'});
    add('checks.exterior_region_correct','scene','Are the last six images on the exterior or semi-outdoor side?','A covered or partly enclosed space can be semi-outdoor.',{frame_id:'f07'});
    add('answers.scene.boundary_class','scene','What kind of space is outside this boundary?','Separate open-air outdoors from enclosed or semi-outdoor spaces.',{frame_id:'f07'});
    add('answers.scene.exterior_enclosure','scene','How is the exterior space enclosed?', '',{frame_id:'f07'});
    add('answers.scene.shelter','scene','How much overhead shelter does that exterior space have?','This is the area as a whole; individual red points may differ.',{frame_id:'f07'});
    add('answers.scene.canonical_context_clear','scene','Is the indoor-to-exterior transition clear from these images?','Choose No if the intended transition cannot be understood from this 12-frame view.');
    const boundaryFrame=ep.boundary_boxes[0]?.frame_id||'f06';
    const boundaryQuestions=[
      ['object_identity_correct','Does the outline identify the boundary we cross?','The same physical door or opening must be used in all boundary questions.'],
      ['kind','What is it?','Identify the opening itself. Any previously saved detailed door type is preserved.'],
      ['pane_transparency','Can you see through it?','Judge the pane or panel, not whether an open door leaves a clear gap. Judge curtains and other blockers separately. For a gap with no pane or panel, use Not sure and explain in the scene notes.'],
      ['glazing','Does the boundary contain glass?','Do not assume invisible glass is absent.'],
      ['observed_state','Is it open or closed in the images?','Report the observed state here. Use No door / closure exists for an open gap; later questions separately ask about hypothetical open and sealed conditions.'],
      ['material','What is the main boundary-panel material?','Name the door/pane panel material, not merely its frame.'],
      ['hierarchy_id','Which reference material best describes that panel?','Choose the installed material entry; do not turn the reference physics values into image observations.'],
      ['reflectance','Does that panel look reflective?','Judge visible appearance here, not an assumed property of its name.'],
      ['air_gap','Is there an unsealed gap around or through the boundary?','For the observed state only. Do not assume a closed door is airtight.']];
    for(const [key,title,help]of boundaryQuestions){
      const meta={frame_id:boundaryFrame};
      if(key==='kind'){
        const values=['door','window','open_passage',ND],saved=r.answers.boundary.kind;
        if(filled(saved)&&!values.includes(saved)&&Core.FIELDS.kind.includes(saved))values.splice(values.length-1,0,saved);
        meta.options=options(values).map(o=>({...o,label:o.value==='door'?'Door':o.value==='open_passage'?'Open gap with no door':o.label}));
      }
      if(key==='pane_transparency')meta.options=[{value:'clear',label:'Clear glass'},{value:'obscured',label:'Frosted / tinted / patterned'},{value:'opaque',label:"Solid (can't see through)"},{value:ND,label:'Not sure'}];
      if(key==='observed_state')meta.options=options(Core.FIELDS.observed_state).map(o=>({...o,label:o.value==='ajar'?'Partly':o.label}));
      add('answers.boundary.'+key,'boundary',title,help,meta);
      if(key==='kind'&&doc.boundary_questions_version===BOUNDARY_QUESTIONS_VERSION){
        add('checks.boundary.width_class','boundary','How wide is it?','Use the mesh measurement as a guide and confirm the visible opening category. This is a human classification, not an automatically assigned width.',{frame_id:boundaryFrame,options:[{value:'single_door',label:'Single door'},{value:'double_door',label:'Double door'},{value:'wide_glass_wall',label:'Wide glass wall'},{value:ND,label:'Not sure'}]});
      }
      if(key==='pane_transparency'&&doc.boundary_questions_version===BOUNDARY_QUESTIONS_VERSION){
        add('checks.boundary.blockage','boundary','Is anything blocking it?','Choose the visible blocker, Multiple blockers if more than one applies, or Other and name it in the scene notes. Judge blockers separately from the pane material.',{frame_id:boundaryFrame,options:[{value:'none',label:'Nothing'},{value:'curtains',label:'Curtains'},{value:'blinds',label:'Blinds'},{value:'screen',label:'Screen'},{value:'furniture',label:'Furniture'},{value:'multiple',label:'Multiple blockers'},{value:'other',label:'Other'},{value:ND,label:'Not sure'}]});
      }
    }
    const surfaceQuestions=[
      ['object_name','What object or surface is the red point on?','Use a short name such as wall, floor or door.'],
      ['material','What material is visible at the red point?','Describe the exposed layer. We ask separately about the material underneath.'],
      ['hierarchy_id','Which reference entry matches this installed surface?','Choose a descriptive entry, Other if none matches, or Not sure.'],
      ['reflectance','Does this surface look reflective?','Use the image appearance, not the reference material table.'],
      ['finish','What finish or coating is visible here?','A finish such as paint is not automatically the bulk substrate.'],
      ['substrate_known','Can you identify the material underneath the finish?','Do not infer a wall substrate just from the color of paint.'],
      ['substrate_material','What is the material underneath?','Answer only when the underlying material can be established.'],
      ['substrate_hierarchy_id','Which reference entry matches the underlying material?','This remains separate from the visible finish.'],
      ['shelter','How much overhead shelter covers this red point?','Judge the specific marked surface, not the scene as a whole.']];
    for(const m of ep.markers){
      const meta={marker_id:m.id,frame_id:m.anchor_frame};
      add('checks.surfaces.'+m.id+'.anchor_correct','surfaces','Is this red point on a real, identifiable surface?','Choose No if it lands on an incorrect edge, sky, void or another unusable target.',meta);
      for(const [key,title,help]of surfaceQuestions){if(key.startsWith('substrate_')&&key!=='substrate_known'&&r.answers.surfaces[m.id]?.substrate_known!=='yes')continue;add('answers.surfaces.'+m.id+'.'+key,'surfaces',title,help,meta);}
      add('checks.surfaces.'+m.id+'.same_surface_across_frames','surfaces','Do the marked views refer to the same physical surface?','Compare the frames with this point. Choose Not sure if correspondence cannot be verified; an absent projection does not mean the surface is invisible.',meta);
      add('checks.surfaces.'+m.id+'.obstruction','surfaces','What fixed obstructions protect or block this point?','Include roofs/overhangs and side walls. Direction-specific rain and sunlight come next.',meta);
    }
    const directionalReady=doc.tasks.settings.protocol_reviewed===true&&filled(doc.tasks.settings.protocol_reviewer)&&ep.setup_reviewed===true&&ep.directions.length===2&&ep.directions.every(usableDirection);
    const directionMeta=(d,condition)=>({direction:clone(d),condition,condition_text:doc.tasks.layout.conditions[condition],blocked:!directionalReady,block_reason:directionalReady?'':'The researcher must approve these two directions and their reference points before you can answer this scenario.'});
    for(const m of ep.markers)for(const d of ep.directions)for(const condition of Core.STATES)for(const channel of ['sun','rain']){
      add('answers.surfaces.'+m.id+'.reachable.'+d.id+'.'+condition+'.'+channel,'exposure',channel==='sun'?'Does sunlight hit this red point directly?':'Does rain hit this red point directly?',EXPOSURE_HELP,{marker_id:m.id,frame_id:m.anchor_frame,options:[{value:'yes',label:'Hit directly'},{value:'no',label:'Not hit'},{value:ND,label:'Not sure'}],...directionMeta(d,condition)});
    }
    const channelTitles={direct_sun:'Can direct sunlight pass from the exterior into the interior?',diffuse_light:'Can diffuse daylight pass from the exterior into the interior?',air:'Can air pass through this boundary?',rain:'Can rain pass through this boundary into the interior?'};
    if(doc.collection_checks_version===COLLECTION_CHECKS_VERSION){
      for(const d of ep.directions)for(const condition of Core.STATES)add('checks.opening_passage.'+d.id+'.'+condition,'pathways','What can pass through this opening?','Select all that apply in this scenario. Nothing and Not sure are exclusive. This is a consistency check, not the benchmark answer: passage answers must be derived separately from agreed boundary facts using an approved rule.',{kind:'multiselect',consistency_only:true,frame_id:boundaryFrame,options:PASSAGE_OPTIONS.map(value=>({value,label:({sunlight:'Sunlight',rain:'Rain',air:'Air',visible_light:'Visible light',none:'Nothing',[ND]:'Not sure'})[value]})),...directionMeta(d,condition)});
    }else for(const d of ep.directions)for(const condition of Core.STATES)for(const channel of ['direct_sun','diffuse_light','air','rain'])add('answers.pathways.'+d.id+'.'+condition+'.'+channel,'pathways',channelTitles[channel],PHYSICS_HELP,{frame_id:boundaryFrame,consistency_only:true,...directionMeta(d,condition)});
    const frameIDs=doc.profile==='l2_l3'?dataset.episodes[index].frames.map(f=>f.id):ep.boundary_boxes.filter(b=>dataset.episodes[index].frames.some(f=>f.id===b.frame_id&&f.side==='indoor')).slice(0,2).map(b=>b.frame_id);
    for(const f of frameIDs){
      add('answers.boundary_visibility.'+f+'.visibility','visibility','How is the boundary visible in this frame?','Reflection-only is different from directly seeing the door.',{frame_id:f});
      add('answers.boundary_visibility.'+f+'.object_match','visibility','Is this the same boundary that the sequence crosses?','Use the shown outline and compare the sequence.',{frame_id:f});
      add('answers.boundary_visibility.'+f+'.box_correct','visibility','Does the outline correctly cover the boundary in this frame?','If the box is wrong, choose No; the researcher can revise it without changing your vote.',{frame_id:f});
    }
    if(doc.collection_checks_version===COLLECTION_CHECKS_VERSION)for(const m of ep.markers.filter(m=>m.side==='indoor'))add('checks.indoor_visibility.'+m.id,'visibility','In which images after the crossing can you still see this surface?','Select every exterior image where you can still see the same physical indoor surface, directly or through glass. A reflection alone does not count as a direct sighting. A missing red-point projection does not prove invisibility. Choose Not sure if you cannot decide. None and Not sure are exclusive.',{kind:'multiselect',marker_id:m.id,frame_id:m.anchor_frame,frame_ids:exteriorFrameIds(dataset.episodes[index]),options:[...exteriorFrameIds(dataset.episodes[index]).map(value=>({value,label:'Image '+Number(value.slice(1))})),{value:'none',label:'None'},{value:ND,label:'Not sure'}]});
    if(doc.profile==='l2_l3')for(const m of ep.markers)for(const f of dataset.episodes[index].frames)add('answers.surfaces.'+m.id+'.visibility.'+f.id,'visibility','How is this marked surface visible in this frame?','The red point may not have a projection in every frame. Missing projections do not prove invisibility.',{marker_id:m.id,frame_id:f.id,kind:'choice',options:options(Core.FIELDS.visibility)});
    return out;
  }
  function progress(doc,index,dataset,catalogue){
    const qs=questions(doc,index,dataset,catalogue),r=doc.episodes[index],missing=qs.filter(q=>!filled(get(r,q.path))),sections={};
    for(const section of SECTIONS){const selected=qs.filter(q=>q.section===section);sections[section]={answered:selected.filter(q=>filled(get(r,q.path))).length,total:selected.length};}
    return {answered:qs.length-missing.length,total:qs.length,missing,sections,setup_ready:episodeReady(doc.tasks,index,dataset,catalogue).ready};
  }
  function validateEpisodeUnsafe(doc,index,dataset,catalogue,requireComplete=true){
    const r=doc.episodes[index],ep=doc.tasks.layout.episodes[index],errors=[];
    inspect(r,errors);if(errors.length)return errors;
    if(!obj(r)||!ep)return ['Episode record or shared target is missing.'];
    const legacy=clone(r);delete legacy.checks;errors.push(...Core.validateDraftEpisode(legacy,ep,catalogue));
    const boundaryScope=doc.boundary_questions_version===BOUNDARY_QUESTIONS_VERSION,collectionScope=doc.collection_checks_version===COLLECTION_CHECKS_VERSION;
    if(keys(r.checks,['indoor_region_correct','exterior_region_correct','surfaces',...(boundaryScope?['boundary']:[]),...(collectionScope?['opening_passage','indoor_visibility']:[])],[],'checks',errors)){
      for(const k of ['indoor_region_correct','exterior_region_correct'])enumCheck(r.checks[k],YES,'checks.'+k,errors);
      if(boundaryScope&&keys(r.checks.boundary,['width_class','blockage'],[],'checks.boundary',errors)){
        enumCheck(r.checks.boundary.width_class,WIDTH_CLASS,'checks.boundary.width_class',errors);
        enumCheck(r.checks.boundary.blockage,BOUNDARY_BLOCKAGE,'checks.boundary.blockage',errors);
      }
      if(keys(r.checks.surfaces,ep.markers.map(m=>m.id),[],'checks.surfaces',errors))for(const m of ep.markers){const c=r.checks.surfaces[m.id];if(keys(c,['anchor_correct','same_surface_across_frames','obstruction'],[],'checks.surfaces.'+m.id,errors)){enumCheck(c.anchor_correct,YES,'anchor_correct',errors);enumCheck(c.same_surface_across_frames,YES,'same_surface_across_frames',errors);enumCheck(c.obstruction,OBSTRUCTION,'obstruction',errors);}}
      if(collectionScope){
        if(keys(r.checks.opening_passage,Core.DIRECTIONS,[],'checks.opening_passage',errors))for(const direction of Core.DIRECTIONS)if(keys(r.checks.opening_passage[direction],Core.STATES,[],'checks.opening_passage.'+direction,errors))for(const condition of Core.STATES)selectionCheck(r.checks.opening_passage[direction][condition],PASSAGE_OPTIONS,'checks.opening_passage.'+direction+'.'+condition,errors);
        if(keys(r.checks.indoor_visibility,ep.markers.filter(m=>m.side==='indoor').map(m=>m.id),[],'checks.indoor_visibility',errors))for(const [id,value]of Object.entries(r.checks.indoor_visibility))selectionCheck(value,[...exteriorFrameIds(dataset.episodes[index]),'none',ND],'checks.indoor_visibility.'+id,errors);
      }
    }
    if(requireComplete&&r.status!=='excluded'){
      const ready=episodeReady(doc.tasks,index,dataset,catalogue);if(!ready.ready)errors.push('Researcher pending: shared targets, directions and research settings must be reviewed before completing this scene.');
      const qs=questions(doc,index,dataset,catalogue);for(const q of qs)if(!filled(get(r,q.path)))errors.push(q.path+': '+q.title);
      if(qs.some(q=>{const v=get(r,q.path);return v===ND||(Array.isArray(v)&&v.includes(ND));})&&!filled(r.answers.notes))errors.push('answers.notes: add one short explanation for the Not sure answers in this scene.');
      if(boundaryScope&&['multiple','other'].includes(r.checks.boundary?.blockage)&&!filled(r.answers.notes))errors.push('answers.notes: name the multiple or other opening blockers in the scene note.');
    }
    return errors;
  }
  const validateEpisode=safe(validateEpisodeUnsafe);
  function validateUnsafe(doc,dataset,catalogue,requireComplete=false){
    const errors=[];inspect(doc,errors);if(errors.length)return errors;
    if(!keys(doc,['schema','build_id','task_id','tasks','annotator','profile','created_at','updated_at','annotation_status','benchmark_ready','episodes','ui','migration_log'],['boundary_questions_version','collection_checks_version','automatic_surface_labels','surface_label_audit'],'export',errors))return errors;
    if(doc.schema!==SCHEMA)errors.push('export.schema: unsupported');
    if(own(doc,'boundary_questions_version')&&doc.boundary_questions_version!==BOUNDARY_QUESTIONS_VERSION)errors.push('export.boundary_questions_version: unsupported');
    if(own(doc,'collection_checks_version')&&doc.collection_checks_version!==COLLECTION_CHECKS_VERSION)errors.push('export.collection_checks_version: unsupported');
    if(doc.build_id!==dataset.build_id||catalogue.build_id!==dataset.build_id)errors.push('export.build_id: different dataset/catalogue');
    if(typeof doc.annotator!=='string'||!doc.annotator.trim()||doc.annotator.length>200)errors.push('export.annotator: enter your own name (up to 200 characters)');
    if(!stamp(doc.created_at)||!stamp(doc.updated_at))errors.push('export: invalid timestamps');
    enumCheck(doc.profile,['l2','l2_l3'],'export.profile',errors,false);enumCheck(doc.annotation_status,['draft','complete'],'export.annotation_status',errors,false);
    if(doc.benchmark_ready!==false)errors.push('export.benchmark_ready: individual annotation is not benchmark ground truth');
    errors.push(...validateTasks(doc.tasks,dataset,catalogue,requireComplete||doc.annotation_status==='complete'));
    if(!obj(doc.tasks)||!obj(doc.tasks.layout)||!Array.isArray(doc.tasks.layout.episodes))return errors;
    if(doc.task_id!==doc.tasks.task_id||doc.task_id!==taskId(doc.tasks))errors.push('export.task_id: task identity mismatch');
    if(!Array.isArray(doc.episodes)||doc.episodes.length!==doc.tasks.layout.episodes.length)errors.push('export.episodes: one record per task is required');
    else doc.episodes.forEach((r,i)=>{const full=requireComplete||doc.annotation_status==='complete'||r?.status==='complete';errors.push(...validateEpisode(doc,i,dataset,catalogue,full));if((requireComplete||doc.annotation_status==='complete')&&!['complete','excluded'].includes(r?.status))errors.push('episode '+(i+1)+': complete or exclude this scene first.');});
    if(requireComplete&&doc.annotation_status!=='complete')errors.push('export.annotation_status: finish all scenes before final export');
    if(keys(doc.ui,['episode','section','question','frame'],[],'export.ui',errors)){
      if(!Number.isInteger(doc.ui.episode)||doc.ui.episode<0||doc.ui.episode>=dataset.episodes.length)errors.push('export.ui.episode: invalid');
      if(![...SECTIONS,'review'].includes(doc.ui.section)||!Number.isInteger(doc.ui.question)||doc.ui.question<0||!Number.isInteger(doc.ui.frame)||doc.ui.frame<0||doc.ui.frame>11)errors.push('export.ui: invalid navigation');
    }
    if(!Array.isArray(doc.migration_log))errors.push('export.migration_log: expected list');
    else for(const item of doc.migration_log){if(!obj(item)||typeof item.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.source_sha256)||!stamp(item.at)||typeof item.source_schema!=='string')errors.push('export.migration_log: malformed provenance');}
    if(own(doc,'automatic_surface_labels')||own(doc,'surface_label_audit')){
      const Redpoints=root.L2Redpoints||(typeof require==='function'?require('./redpoint-core.js'):null);
      if(!Redpoints)errors.push('Red-point provenance validation module is missing.');
      else errors.push(...Redpoints.validateDocumentMetadata(doc,dataset,catalogue));
    }
    return errors;
  }
  const validate=safe(validateUnsafe);
  function needsBoundaryUpgrade(doc){return doc?.schema===SCHEMA&&!own(doc,'boundary_questions_version');}
  function upgradeBoundary(source,dataset,catalogue,annotator=source?.annotator){
    const errors=validate(source,dataset,catalogue);if(errors.length)throw new Error(errors.slice(0,8).join('; '));
    if(typeof annotator!=='string'||source.annotator.trim()!==annotator.trim())throw new Error('Only your own annotation file can be imported. Use the same annotator name.');
    const doc=clone(source),report={upgraded:false,source_version:source.boundary_questions_version||0,target_version:BOUNDARY_QUESTIONS_VERSION,added_questions:0,reopened_episodes:[],warnings:[]};
    if(!needsBoundaryUpgrade(source))return {doc,report};
    doc.boundary_questions_version=BOUNDARY_QUESTIONS_VERSION;
    for(const r of doc.episodes){
      r.checks.boundary={width_class:null,blockage:null};
      if(r.status!=='excluded'){
        report.added_questions+=2;
        if(r.status==='complete'){report.reopened_episodes.push(r.episode_id);r.status='in_progress';r.completed_at=null;}
      }
    }
    if(doc.episodes.some(r=>r.status!=='excluded'))doc.annotation_status='draft';
    doc.updated_at=new Date().toISOString();
    report.upgraded=true;
    report.warnings.push('Opening width category and blockers are new, unanswered human questions. Existing answers are unchanged; previously completed included scenes need these two answers before completion.');
    doc.migration_log.push({at:doc.updated_at,source_schema:source.schema,source_sha256:Core.sha256(stable(source)),source_task_id:source.task_id,target_task_id:source.task_id,kind:'boundary_questions_upgrade',source_boundary_questions_version:0,target_boundary_questions_version:BOUNDARY_QUESTIONS_VERSION,source_annotation_status:source.annotation_status,source_episode_statuses:source.episodes.map(r=>({episode_id:r.episode_id,status:r.status,completed_at:r.completed_at})),reopened_episodes:clone(report.reopened_episodes),added_questions:report.added_questions,warnings:clone(report.warnings)});
    const finalErrors=validate(doc,dataset,catalogue);if(finalErrors.length)throw new Error('Boundary upgrade produced invalid output: '+finalErrors.slice(0,5).join('; '));
    return {doc,report};
  }
  function needsCollectionUpgrade(doc){return doc?.schema===SCHEMA&&!own(doc,'collection_checks_version');}
  function upgradeCollection(source,dataset,catalogue,annotator=source?.annotator){
    const errors=validate(source,dataset,catalogue);if(errors.length)throw new Error(errors.slice(0,8).join('; '));
    if(typeof annotator!=='string'||source.annotator.trim()!==annotator.trim())throw new Error('Only your own annotation file can be imported. Use the same annotator name.');
    const doc=clone(source),report={upgraded:false,source_version:source.collection_checks_version||0,target_version:COLLECTION_CHECKS_VERSION,added_questions:0,replaced_questions:0,reopened_episodes:[],warnings:[]};
    if(!needsCollectionUpgrade(source))return {doc,report};
    doc.collection_checks_version=COLLECTION_CHECKS_VERSION;
    for(let i=0;i<doc.episodes.length;i++){
      const r=doc.episodes[i],ep=doc.tasks.layout.episodes[i];Object.assign(r.checks,collectionChecks(ep));
      if(r.status!=='excluded'){
        report.added_questions+=4+ep.markers.filter(m=>m.side==='indoor').length;report.replaced_questions+=16;
        if(r.status==='complete'){report.reopened_episodes.push(r.episode_id);r.status='in_progress';r.completed_at=null;}
      }
    }
    if(doc.episodes.some(r=>r.status!=='excluded'))doc.annotation_status='draft';
    doc.updated_at=new Date().toISOString();report.upgraded=true;
    report.warnings.push('Four new opening-passage consistency checklists replace the sixteen old passage questions. Each indoor point also needs its after-crossing visibility checklist. Existing raw answers remain unchanged; no old passage votes or mask projections were converted into these answers.');
    doc.migration_log.push({at:doc.updated_at,source_schema:source.schema,source_sha256:Core.sha256(stable(source)),source_task_id:source.task_id,target_task_id:source.task_id,kind:'collection_checks_upgrade',source_collection_checks_version:0,target_collection_checks_version:COLLECTION_CHECKS_VERSION,source_annotation_status:source.annotation_status,source_episode_statuses:source.episodes.map(r=>({episode_id:r.episode_id,status:r.status,completed_at:r.completed_at})),reopened_episodes:clone(report.reopened_episodes),added_questions:report.added_questions,replaced_questions:report.replaced_questions,warnings:clone(report.warnings)});
    const finalErrors=validate(doc,dataset,catalogue);if(finalErrors.length)throw new Error('Collection checks upgrade produced invalid output: '+finalErrors.slice(0,5).join('; '));
    return {doc,report};
  }
  function sameMarker(a,b){return a.anchor_frame===b.anchor_frame&&a.x===b.x&&a.y===b.y&&a.side===b.side&&(a.object_id==null||b.object_id==null||a.object_id===b.object_id);}
  const signature=v=>stable(v);
  function migrate(source,tasks,dataset,catalogue,annotator,profile='l2'){
    let errors=[];
    if(source?.schema===SCHEMA)errors=validate(source,dataset,catalogue);
    else if(source?.schema==='blockmind_l2_annotations_v1')errors=Core.validateExport(source,dataset,catalogue);
    else if(source?.schema==='blockmind_l2_guided_v1'&&Guided)errors=Guided.validate(source,dataset,catalogue);
    else errors=['Unsupported import format.'];
    errors.push(...validateTasks(tasks,dataset,catalogue));
    if(errors.length)throw new Error(errors.slice(0,8).join('; '));
    if(source.annotator.trim()!==annotator.trim())throw new Error('Only your own annotation file can be imported. Use the same annotator name.');
    const doc=create(dataset,catalogue,tasks,annotator,profile),oldLayout=source.tasks?.layout||source.layout;
    const report={source_schema:source.schema,copied_fields:0,cleared_fields:0,matched_markers:0,unmatched_markers:0,warnings:[],episodes:[]};
    const copy=(src,dst,path)=>{const value=get(src,path);if(value!==undefined&&value!==null){set(dst,path,clone(value));if(typeof value!=='object')report.copied_fields++;}};
    for(let i=0;i<doc.episodes.length;i++){
      const r=doc.episodes[i],ep=tasks.layout.episodes[i],old=source.episodes.find(x=>x.episode_id===r.episode_id),oldEp=oldLayout.episodes.find(x=>x.episode_id===r.episode_id);
      if(!old||!oldEp)continue;
      const row={episode_id:r.episode_id,copied_markers:[],new_or_changed_markers:[],direction_answers_preserved:false};
      r.answers.scene=clone(old.answers.scene);r.answers.notes=old.answers.notes;
      const boundaryBoxesSame=signature(oldEp.boundary_boxes)===signature(ep.boundary_boxes);
      if(boundaryBoxesSame)r.answers.boundary=clone(old.answers.boundary);
      else report.warnings.push(r.episode_id+': boundary outline changed; boundary identity/material/state facts require new confirmation.');
      report.copied_fields+=Object.values(old.answers.scene).filter(filled).length+Object.entries(old.answers.boundary).filter(([k,v])=>k!=='notes'&&filled(v)).length;
      if(old.checks){r.checks.indoor_region_correct=old.checks.indoor_region_correct;r.checks.exterior_region_correct=old.checks.exterior_region_correct;}
      if(boundaryBoxesSame&&old.checks?.boundary)r.checks.boundary=clone(old.checks.boundary);
      const directionSame=ep.setup_reviewed===true&&tasks.settings.protocol_reviewed===true&&ep.directions.length===2&&ep.directions.every(usableDirection)&&signature(oldEp.directions)===signature(ep.directions)&&signature(oldLayout.conditions)===signature(tasks.layout.conditions)&&(!source.tasks||source.tasks.settings.protocol_notes===tasks.settings.protocol_notes);
      if(directionSame&&boundaryBoxesSame){r.answers.pathways=clone(old.answers.pathways);if(old.checks?.opening_passage)r.checks.opening_passage=clone(old.checks.opening_passage);row.direction_answers_preserved=true;}
      else report.warnings.push(r.episode_id+': directional answers need review because direction/condition definitions changed.');
      for(const b of ep.boundary_boxes){const oldBox=oldEp.boundary_boxes.find(x=>x.frame_id===b.frame_id);if(oldBox&&signature(oldBox)===signature(b))r.answers.boundary_visibility[b.frame_id]=clone(old.answers.boundary_visibility[b.frame_id]);}
      if(boundaryBoxesSame)r.answers.boundary_visibility=clone(old.answers.boundary_visibility);
      for(const m of ep.markers){
        const candidates=oldEp.markers.filter(n=>sameMarker(n,m)),reverse=ep.markers.filter(n=>sameMarker(n,m));
        if(candidates.length!==1||reverse.length!==1){report.unmatched_markers++;row.new_or_changed_markers.push(m.id);continue;}
        const previous=candidates[0],a=old.answers.surfaces[previous.id],next=r.answers.surfaces[m.id];if(!a)continue;
        report.matched_markers++;row.copied_markers.push({from:previous.id,to:m.id});
        for(const key of Object.keys(next))if(!['reachable','visibility'].includes(key)){next[key]=clone(a[key]);if(key!=='notes'&&filled(a[key]))report.copied_fields++;}
        if(directionSame&&boundaryBoxesSame)next.reachable=clone(a.reachable);
        const observationsSame=signature(previous.observations)===signature(m.observations);
        if(observationsSame)next.visibility=clone(a.visibility);
        if(observationsSame&&m.side==='indoor'&&old.checks?.indoor_visibility&&own(old.checks.indoor_visibility,previous.id))r.checks.indoor_visibility[m.id]=clone(old.checks.indoor_visibility[previous.id]);
        if(old.checks?.surfaces[previous.id]){r.checks.surfaces[m.id]=clone(old.checks.surfaces[previous.id]);if(!observationsSame)r.checks.surfaces[m.id].same_surface_across_frames=null;}
      }
      if(r.status!=='excluded'){r.status='in_progress';r.completed_at=null;r.exclusion_reason='';}
      if(old.status==='excluded'&&ep.disposition!=='exclude'){r.status='excluded';r.exclusion_reason=old.exclusion_reason;r.completed_at=null;}
      if(source.review?.[ep.episode_id]?.skipped)report.warnings.push(ep.episode_id+': previous skip retained only as provenance; it is not an exclusion.');
      report.episodes.push(row);
    }
    // Count copied/cleared scalar human cells precisely; notes and metadata are not votes.
    const flatten=v=>{let out=[];for(const [k,x]of Object.entries(v||{})){if(k==='notes')continue;if(obj(x))out=out.concat(flatten(x));else if(filled(x))out.push(x);}return out;};
    const oldN=source.episodes.reduce((n,r)=>n+flatten(r.answers).length+flatten(r.checks).length,0),newN=doc.episodes.reduce((n,r)=>n+flatten(r.answers).length+flatten(r.checks).length,0);
    report.copied_fields=newN;report.cleared_fields=Math.max(0,oldN-newN);
    report.warnings.push('Previous completion marks were cleared. Review new targets and unanswered questions before completing again.');
    doc.migration_log=[...(source.migration_log||[]),{at:new Date().toISOString(),source_schema:source.schema,source_sha256:Core.sha256(stable(source)),source_task_id:source.task_id||source.layout_id||'',target_task_id:tasks.task_id,copied_fields:report.copied_fields,cleared_fields:report.cleared_fields,warnings:clone(report.warnings)}];
    const finalErrors=validate(doc,dataset,catalogue);if(finalErrors.length)throw new Error('Migration produced invalid output: '+finalErrors.slice(0,5).join('; '));
    return {doc,report};
  }
  function flatten(value,prefix=''){
    const result={};if(obj(value)){for(const [k,v]of Object.entries(value)){if(k==='notes')continue;Object.assign(result,flatten(v,prefix?prefix+'.'+k:k));}}else result[prefix]=value;return result;
  }
  function category(path){const p=path.split('.');if(p[0]==='surfaces'){p[1]='*';if(p[2]==='visibility')p[3]='*';}if(p[0]==='boundary_visibility')p[1]='*';if(p[0]==='checks'&&['surfaces','indoor_visibility'].includes(p[1]))p[2]='*';return p.join('.');}
  function counts(values){const result=Object.create(null);values.forEach(v=>{result[v]=(result[v]||0)+1;});return result;}
  function kappa(pairs){if(!pairs.length)return null;const a=counts(pairs.map(p=>p[0])),b=counts(pairs.map(p=>p[1])),n=pairs.length,observed=pairs.filter(p=>p[0]===p[1]).length/n,expected=Object.keys({...a,...b}).reduce((v,k)=>v+(a[k]||0)*(b[k]||0),0)/(n*n);return expected===1?null:(observed-expected)/(1-expected);}
  // Deliberately not a benchmark answer generator. No approved/pinned physics
  // truth table has been supplied. Candidate transmission assumes the stated
  // ray reaches the opening; it does not infer directional point exposure.
  function passageRuleCandidates(fields,scope,sceneValid,witnesses){
    const agreed=path=>fields[path]?.state==='agreed'&&fields[path]?.value!==ND;
    const fact=path=>agreed(path)?fields[path].value:null;
    const sourcePaths=['boundary.kind','boundary.observed_state','boundary.material','boundary.pane_transparency','boundary.glazing','boundary.air_gap','checks.boundary.blockage'];
    const result={version:'unapproved_opening_transmission_candidate_v1',rule_status:'pending_review',eligible_known_gt:false,semantics:'Material/opening transmission only, conditional on a directed path reaching the opening; not point exposure and not actual weather.',required_next_step:'Approve and version the complete rule table, including obscured panes, blockers, partial opening, and direction/path semantics, before generating benchmark answers.',source_facts:Object.fromEntries(sourcePaths.map(path=>[path,{state:fields[path]?.state||'not_collected',value:fields[path]?.value??null}])),scenarios:{}};
    for(const direction of Core.DIRECTIONS)for(const condition of Core.STATES){
      const key=direction+'.'+condition,checkPath='checks.opening_passage.'+key,check=fields[checkPath],channels={};
      for(const channel of ['sunlight','rain','air','visible_light']){
        const required=['boundary.kind','boundary.observed_state'];
        if(condition==='open'||['sunlight','visible_light'].includes(channel))required.push('checks.boundary.blockage');
        let value=ND,reason='Source facts do not establish a reviewed passage answer.';
        const kind=fact('boundary.kind'),observed=fact('boundary.observed_state'),blockage=fact('checks.boundary.blockage');
        const exists=kind&&!['open_passage','other'].includes(kind)&&observed&&observed!=='no_closure';
        if(condition==='sealed')required.push('boundary.material');
        if(condition==='sealed'&&['sunlight','visible_light'].includes(channel))required.push('boundary.pane_transparency','boundary.glazing');
        const missing=required.filter(path=>!agreed(path));
        if(!missing.length){
          if(condition==='open'&&(exists||(kind==='open_passage'&&observed==='no_closure'))&&blockage==='none'){value='yes';reason='Candidate transmission through an unobstructed fully open opening, conditional on the directed path reaching it.';}
          else if(condition==='sealed'&&exists&&['rain','air'].includes(channel)){value='no';reason='The canonical counterfactual tightly seals the existing closure; observed air gaps do not remain in this counterfactual.';}
          else if(condition==='sealed'&&exists&&blockage==='none'){
            const pane=fact('boundary.pane_transparency'),glazing=fact('boundary.glazing');
            if(pane==='opaque'){value='no';reason='Candidate: an opaque sealed panel blocks light transmission through the panel.';}
            else if(pane==='clear'&&glazing==='present'){value='yes';reason='Candidate: clear glazing transmits light while the sealed closure blocks rain and air.';}
            else reason='Mixed obscured-pane types, absent/conflicting glazing or uncertain optical facts require an approved rule; no value is inferred.';
          }else reason='No usable existing closure, an unknown state/material, or remaining blockers prevent this candidate inference.';
        }
        channels[channel]={candidate_value:value,source_paths:required,blocked_fields:missing,reason,eligible_known_gt:false};
      }
      const complete=Object.values(channels).every(c=>c.candidate_value!==ND),predicted=complete?Object.keys(channels).filter(k=>channels[k].candidate_value==='yes'):null;
      const candidateSet=predicted?(predicted.length?canonicalSelections(predicted,PASSAGE_OPTIONS):['none']):null;
      const checkKnown=scope&&check?.state==='agreed'&&Array.isArray(check.value)&&!check.value.includes(ND);
      const channelConflicts=checkKnown?Object.keys(channels).filter(channel=>channels[channel].candidate_value!==ND&&check.value.includes(channel)!==(channels[channel].candidate_value==='yes')):[];
      const conflict=channelConflicts.length>0;
      const checkStatus=!scope?'not_collected':check?.state==='disagreement'?'rater_disagreement':check?.state==='agreed_not_determinable'?'not_sure':!checkKnown?'missing_or_excluded':conflict?'conflict_with_rule_candidate':candidateSet?'matches_rule_candidate':'rule_candidate_incomplete';
      result.scenarios[key]={consistency_check_path:checkPath,consistency_status:checkStatus,consistency_check_agreed:checkKnown,conflicting_channels:channelConflicts,drop_due_to_consistency_check:!checkKnown||conflict,candidate_channels:channels,candidate_selection:candidateSet,facts_available:sceneValid&&witnesses>=2&&complete,eligible_known_gt:false,drop_item:true,blocked_fields:[...new Set(Object.values(channels).flatMap(c=>c.blocked_fields))],rule_status:'pending_review'};
    }
    return result;
  }
  function consensus(first,second,dataset,catalogue){
    for(const [name,doc]of [['First',first],['Second',second]]){const errors=validate(doc,dataset,catalogue,true);if(errors.length)throw new Error(name+' annotator failed validation: '+errors.slice(0,10).join('; '));}
    if(first.annotator.trim().toLowerCase()===second.annotator.trim().toLowerCase())throw new Error('Two distinct independent annotators are required.');
    if((first.boundary_questions_version||0)!==(second.boundary_questions_version||0))throw new Error('Both annotators must use the same boundary question version. Upgrade and finish the added opening questions before combining old and new annotations.');
    if((first.collection_checks_version||0)!==(second.collection_checks_version||0))throw new Error('Both annotators must use the same collection checks version. Upgrade and finish the opening and indoor-visibility checklists before combining old and new annotations.');
    if(first.task_id!==second.task_id||first.profile!==second.profile||signature(taskContent(first.tasks))!==signature(taskContent(second.tasks)))throw new Error('Both annotators must use the exact same shared task definitions and profile.');
    const statistics={},episodes=[];
    for(let i=0;i<first.episodes.length;i++){
      const a=first.episodes[i],b=second.episodes[i],layout=first.tasks.layout.episodes[i],excluded=a.status==='excluded'||b.status==='excluded';
      const left={...flatten(a.answers),...flatten(a.checks,'checks')},right={...flatten(b.answers),...flatten(b.checks,'checks')};
      const requiredA=new Set(questions(first,i,dataset,catalogue).map(q=>q.path.replace(/^answers\./,''))),requiredB=new Set(questions(second,i,dataset,catalogue).map(q=>q.path.replace(/^answers\./,'')));
      const fields={},disagreements=[];
      for(const path of Object.keys(left).sort()){
        const x=left[path],y=right[path],cat=category(path),stat=statistics[cat]||(statistics[cat]={pairs:[],n_excluded:0,n_unanswered:0,n_not_applicable:0});let state,value=null;
        const token=v=>Array.isArray(v)?(v.length===1&&v[0]===ND?ND:stable(v)):v,xt=token(x),yt=token(y);
        const consistencyOnly=path.startsWith('pathways.')||path.startsWith('checks.opening_passage.');
        if(excluded){state='excluded';stat.n_excluded++;}
        else if(!requiredA.has(path)&&!requiredB.has(path)){state='not_applicable';stat.n_not_applicable++;}
        else if(x===null||y===null){state='unanswered';stat.n_unanswered++;}
        else if(xt===yt){state=xt===ND?'agreed_not_determinable':'agreed';value=clone(x);stat.pairs.push([xt,yt]);}
        else{state='disagreement';stat.pairs.push([xt,yt]);disagreements.push({path,rater_a:clone(x),rater_b:clone(y)});}
        fields[path]={state,value,rater_a:clone(x),rater_b:clone(y),consistency_only:consistencyOnly,eligible_consistency_check:consistencyOnly&&state==='agreed',eligible_known_gt:!consistencyOnly&&state==='agreed',eligible_nd_gt:!consistencyOnly&&state==='agreed_not_determinable',drop_known_gt:consistencyOnly||state!=='agreed'};
      }
      const matches=(p,v)=>fields[p]?.state==='agreed'&&fields[p].value===v;
      const known=paths=>paths.length>0&&paths.every(p=>fields[p]?.eligible_known_gt);
      const sceneValid=!excluded&&matches('scene.crossing_valid','yes')&&matches('scene.canonical_context_clear','yes')&&matches('boundary.object_identity_correct','yes')&&matches('checks.indoor_region_correct','yes')&&matches('checks.exterior_region_correct','yes')&&known(['scene.boundary_class']);
      const witnesses=layout.boundary_boxes.filter(box=>dataset.episodes[i].frames.some(f=>f.id===box.frame_id&&f.side==='indoor')).map(box=>box.frame_id).filter(f=>['direct','through_glass'].some(v=>matches('boundary_visibility.'+f+'.visibility',v))&&matches('boundary_visibility.'+f+'.object_match','yes')&&matches('boundary_visibility.'+f+'.box_correct','yes'));
      const closure=known(['boundary.kind','boundary.observed_state','boundary.material'])&&!matches('boundary.kind','open_passage')&&!matches('boundary.observed_state','no_closure');
      const markers=layout.markers.map(m=>m.id),markerReadiness={};
      for(const id of markers){const identity=matches('checks.surfaces.'+id+'.anchor_correct','yes')&&matches('checks.surfaces.'+id+'.same_surface_across_frames','yes');markerReadiness[id]={identity_certified:identity,identity_material_fields_agreed_known:identity&&known(['object_name','material','hierarchy_id','reflectance','finish','substrate_known','shelter'].map(k=>'surfaces.'+id+'.'+k)),substrate_known_agreed:matches('surfaces.'+id+'.substrate_known','yes'),substrate_fields_agreed_known:known(['substrate_material','substrate_hierarchy_id'].map(k=>'surfaces.'+id+'.'+k))};}
      const aCoverage={};for(const d of Core.DIRECTIONS)for(const condition of Core.STATES)for(const channel of ['sun','rain']){const paths=markers.map(m=>'surfaces.'+m+'.reachable.'+d+'.'+condition+'.'+channel),ready=sceneValid&&known(paths)&&markers.every(m=>markerReadiness[m].identity_certified)&&(condition==='open'||closure);aCoverage[d+'.'+condition+'.'+channel]={exact_set_labels_available:ready,reachable_marker_ids:ready?markers.filter((m,j)=>matches(paths[j],'yes')):null,blocked_fields:paths.filter(p=>!fields[p].eligible_known_gt)};}
      const bFields=['boundary.pane_transparency','boundary.glazing','boundary.material','boundary.kind','boundary.observed_state','boundary.air_gap','checks.boundary.blockage'];
      const drop=Object.keys(fields).filter(p=>fields[p].state!=='not_applicable'&&(fields[p].consistency_only?fields[p].state!=='agreed':fields[p].drop_known_gt));
      const warnings=[];if(!closure)warnings.push('No agreed existing closure/material: sealed-condition known GT is not certified.');
      const paneConflict=matches('boundary.glazing','absent')&&['clear','obscured'].some(v=>matches('boundary.pane_transparency',v));
      if(paneConflict)warnings.push('Pane transparency and absent glazing conflict. Review, never auto-correct.');
      const sealedConflict=Core.DIRECTIONS.some(d=>['air','rain'].some(c=>matches('pathways.'+d+'.sealed.'+c,'yes')));
      if(sealedConflict)warnings.push('Air/rain passage through the tightly sealed closure conflicts with the stated counterfactual. Review, never auto-correct.');
      const collectionScope=first.collection_checks_version===COLLECTION_CHECKS_VERSION;
      const passageRules=passageRuleCandidates(fields,collectionScope,sceneValid,witnesses.length);
      const ruleCheckConflict=Object.values(passageRules.scenarios).some(s=>['rater_disagreement','conflict_with_rule_candidate'].includes(s.consistency_status));
      if(ruleCheckConflict)warnings.push('Opening-passage checks disagree between raters or with an unapproved rule candidate. Drop the affected scenario; never resolve or replace independent votes.');
      if(!collectionScope)warnings.push('Legacy annotation scope: per-scenario passage checklists and after-crossing indoor-point visibility were not collected. Old passage votes are retained only as consistency data, never benchmark answers.');
      const indoorVisibility=Object.fromEntries(layout.markers.filter(m=>m.side==='indoor').map(m=>{
        const path='checks.indoor_visibility.'+m.id,field=fields[path],ready=sceneValid&&markerReadiness[m.id].identity_certified&&field?.eligible_known_gt===true;
        return [m.id,{path,eligible_known_gt:ready,drop_item:!ready,visible_after_crossing_frames:ready?(field.value.includes('none')?[]:clone(field.value)):null,reason:!collectionScope?'not_collected':!sceneValid?'scene_not_certified':!markerReadiness[m.id].identity_certified?'surface_identity_not_certified':field?.state||'not_collected'}];
      }));
      const openingPaths=['boundary.kind','checks.boundary.width_class','boundary.pane_transparency','checks.boundary.blockage','boundary.observed_state'];
      const openingScope=first.boundary_questions_version===BOUNDARY_QUESTIONS_VERSION;
      const boundaryCoverage={question_version:first.boundary_questions_version||0,all_five_questions_collected:!excluded&&openingScope,all_five_labels_agreed_known:!excluded&&openingScope&&known(openingPaths),blocked_fields:openingPaths.filter(p=>!fields[p]?.eligible_known_gt)};
      if(!openingScope)warnings.push('Legacy annotation scope: opening width category and blockage were not collected. Upgrade both annotators before using these attributes as ground truth.');
      episodes.push({episode_id:a.episode_id,rater_status:[a.status,b.status],excluded,exclusion_reasons:[a.exclusion_reason,b.exclusion_reason],all_fields_agreed_known:!excluded&&!drop.length,drop_episode_known_gt:!sceneValid,consistency_warnings:warnings,boundary_annotation_coverage:boundaryCoverage,boundary_certification:{certified:witnesses.length>=2,agreed_pre_crossing_witness_frames:witnesses,minimum_witnesses:2,rule:'Two-rater direct/through-glass visibility, object match and box correctness; mesh pixels are not human GT.'},drop_fields:drop,fields,disagreements,marker_readiness:markerReadiness,indoor_visibility_coverage:indoorVisibility,family_annotation_coverage:{A:{exposure_sets:aCoverage,porous_not_exposed_items_require_reviewed_class_mapping:true},B:{pathway_labels_available:false,answer_source:'Approved rule applied to independently agreed boundary facts, never passage-check votes',human_passage_votes_are_gt:false,boundary_visibility_certified:witnesses.length>=2,sealed_counterfactual_defined:closure,consistency_review_required:paneConflict||sealedConflict||ruleCheckConflict,blocked_fields:bFields.filter(p=>!fields[p]?.eligible_known_gt),rule_derivation:passageRules},C:{enabled:false,reason:'A status checkbox is not a versioned, SHA-pinned VHC allowed-pairs table. No table or generator is implemented here.'},D:{material_inputs_available:sceneValid&&markers.every(m=>markerReadiness[m].identity_material_fields_agreed_known),class_comparison_gt_ready:false,reason:'Requires approved intrinsic class mapping and reviewed question templates.'},benchmark_items_generated:false},rater_notes:[{annotator:first.annotator,answers:a.answers,checks:a.checks},{annotator:second.annotator,answers:b.answers,checks:b.checks}]});
    }
    const agreement={};for(const [key,stat]of Object.entries(statistics)){const p=stat.pairs,known=p.filter(([a,b])=>a!==ND&&b!==ND),agreed=p.filter(([a,b])=>a===b).length;agreement[key]={cohen_kappa:kappa(p),cohen_kappa_excluding_nd:kappa(known),n_compared:p.length,n_agreed:agreed,n_disagreement:p.length-agreed,n_unanswered:stat.n_unanswered,n_excluded:stat.n_excluded,n_not_applicable:stat.n_not_applicable,n_known_compared:known.length,n_with_nd:p.length-known.length,n_agreed_nd:p.filter(([a,b])=>a===ND&&b===ND).length,observed_agreement:p.length?agreed/p.length:null,rater_a_counts:counts(p.map(x=>x[0])),rater_b_counts:counts(p.map(x=>x[1]))};}
    return {schema:'blockmind_l2_consensus_v1',source_schema:SCHEMA,boundary_questions_version:first.boundary_questions_version||0,collection_checks_version:first.collection_checks_version||0,build_id:first.build_id,layout_id:Core.layoutId(first.tasks.layout),task_id:first.task_id,profile:first.profile,created_at:new Date().toISOString(),annotators:[first.annotator,second.annotator],policy:'Exact independent agreement only; no adjudication. Disagreements drop affected items, not unrelated agreed items. Passage votes are consistency checks, never benchmark answers. ND is uncertainty, not no. Optional L3/audit fields are not required L2 votes.',benchmark_ready:false,completeness:{episodes_total:episodes.length,episodes_excluded:episodes.filter(e=>e.excluded).length,episodes_all_fields_agreed_known:episodes.filter(e=>e.all_fields_agreed_known).length,episodes_with_disagreements:episodes.filter(e=>e.disagreements.length).length},agreement_by_attribute:agreement,episodes};
  }
  const api={SCHEMA,TASK_SCHEMA,BOUNDARY_QUESTIONS_VERSION,COLLECTION_CHECKS_VERSION,WIDTH_CLASS,BOUNDARY_BLOCKAGE,PASSAGE_OPTIONS,ND,SECTIONS,OBSTRUCTION,createTasks,taskId,validateTasks,episodeReady,create,validate,validateEpisode,questions,progress,needsBoundaryUpgrade,upgradeBoundary,needsCollectionUpgrade,upgradeCollection,canonicalSelections,migrate,consensus,get,set,hierarchyHash};
  root.L2Full=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
