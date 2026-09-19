/* Static, private-by-default annotation UI. The authoritative schema is core.js. */
(() => {
  'use strict';
  const Core = window.L2Core;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now = () => new Date().toISOString();
  const human = value => value === Core.ND ? 'Not determinable' : value === '__other__' ? 'Other / not in catalogue' : String(value ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const pad = n => String(n).padStart(2, '0');
  const tabId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  const state = {dataset:null,catalogue:null,role:'annotator',identity:'',layout:null,doc:null,episode:0,frame:0,tab:'scene',marker:null,placement:null,pending:null,key:null,revision:0,conflict:false,dirty:false,playing:null,mapCanvas:null,mapFrame:null,boxStart:null,search:'',filter:'all',storageOK:true,frameReady:false,frameToken:0};
  const SCENE = [['crossing_valid','One valid indoor–exterior crossing','yes_no'],['boundary_class','Exterior context','boundary_class'],['exterior_enclosure','Exterior enclosure','exterior_enclosure'],['shelter','Exterior shelter','shelter'],['canonical_context_clear','Is the before/after context clear?','yes_no']];
  const BOUNDARY = [['object_identity_correct','Correct shared boundary object?','yes_no'],['kind','Boundary kind','kind'],['pane_transparency','Pane transparency','pane_transparency'],['glazing','Glass / glazing','glazing'],['observed_state','Observed closure state','observed_state'],['reflectance','Visible reflectance','reflectance'],['air_gap','Visible air gap?','yes_no'],['pane_in_mesh','Pane represented in the mesh?','yes_no'],['phantom_geometry','Phantom / erroneous geometry?','yes_no'],['isolated_leaf','Door leaf isolated as an instance?','yes_no'],['mask_matches_rgb','Does the mask match the RGB boundary?','yes_no']];
  const SURFACE = [['reflectance','Visible reflectance','reflectance'],['finish','Visible finish / treatment','finish'],['substrate_known','Underlying substrate known?','yes_no'],['shelter','Surface shelter','shelter']];
  function episode() { return state.dataset.episodes[state.episode]; }
  function layoutEpisode() { return state.layout.episodes.find(e => e.episode_id === episode().id); }
  function record() { return state.doc?.episodes.find(e => e.episode_id === episode().id); }
  function frame() { return episode().frames[state.frame]; }
  function markers() { return layoutEpisode()?.markers || []; }
  function selectedMarker() { return markers().find(m => m.id === state.marker) || markers()[0] || null; }
  function locked() { return state.conflict || (state.role === 'annotator' && ['complete','excluded'].includes(record()?.status)); }
  function editable() { return !locked() && !(state.role === 'coordinator' && layoutEpisode()?.disposition === 'exclude'); }
  function getPath(obj,path) { return path.split('.').reduce((v,k) => v?.[k],obj); }
  function setPath(obj,path,value) { const keys=path.split('.'); const last=keys.pop(); keys.reduce((v,k)=>v[k],obj)[last]=value; }
  function toast(text) { $('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),3500); }
  function message(title,text) { $('messageTitle').textContent=title;$('messageBody').textContent=text;$('messageDialog').showModal(); }
  function issues(title,errors) { message(title,errors.slice(0,50).map((e,i)=>`${i+1}. ${e}`).join('\n')+(errors.length>50?`\n\n… and ${errors.length-50} more.`:'')); }
  function scopeKey(role,identity,layoutId) { return `blockmind-l2:${encodeURIComponent(new URL('.',location.href).pathname)}:${state.dataset.build_id}:${role}:${layoutId || 'coordinator-draft'}:${encodeURIComponent(identity)}`; }
  function lastLayoutKey() { return `blockmind-l2:shared-layout:${encodeURIComponent(new URL('.',location.href).pathname)}:${state.dataset.build_id}`; }
  function readStored(key) {
    let raw;try {raw=localStorage.getItem(key);}catch {return {unavailable:true};}
    if(raw===null)return null;
    try {const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')return {corrupt:true,raw};return parsed;}
    catch {return {corrupt:true,raw};}
  }
  function preserveCorrupt(key,stored){
    if(confirm('This browser draft is unreadable. It will NOT be overwritten. Download its exact raw content in a recovery JSON wrapper now?'))download({schema:'blockmind_l2_raw_storage_recovery_v1',storage_key:key,recovered_at:now(),raw:stored.raw},fileName('raw_storage_recovery'));
    message('Saved draft protected','The existing browser entry was not changed. Keep the recovery file for inspection. Use a different ID / browser profile for new work, or restore a validated backup after recovering the damaged entry.');
  }
  function payload() { return state.role === 'coordinator' ? state.layout : state.doc; }
  function lockConflict() { state.conflict=true;state.placement=null;stopPlay();$('conflictBanner').classList.remove('hidden');$('saveStatus').textContent='Conflict · this tab is locked';renderPanel(); }
  function save() {
    if(!state.key||state.conflict)return false;
    try {
      const previous=readStored(state.key);
      if(previous?.unavailable)throw new Error('Storage unavailable');
      if(previous?.corrupt){lockConflict();$('saveStatus').textContent='Unreadable saved draft · protected';return false;}
      if(previous && previous.revision!==state.revision && previous.owner!==tabId) { lockConflict();return false; }
      if(state.doc)state.doc.updated_at=now();
      const envelope={schema:'blockmind_l2_local_v1',revision:state.revision+1,owner:tabId,updated_at:now(),data:payload()};
      localStorage.setItem(state.key,JSON.stringify(envelope));
      state.revision=envelope.revision;state.dirty=false;state.storageOK=true;
      $('storageWarning').classList.add('hidden');$('saveStatus').textContent=`Saved ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
      return true;
    } catch {state.storageOK=false;state.dirty=true;$('storageWarning').classList.remove('hidden');$('saveStatus').textContent='Not saved · export a backup';return false;}
  }
  function changed(isLayout=false,reviewChanged=true) {
    if(state.conflict)return;
    state.dirty=true;
    if(isLayout){state.layout.layout_id='';if(reviewChanged)layoutEpisode().setup_reviewed=false;}
    else if(record()&&record().status!=='excluded'){record().status='in_progress';record().completed_at=null;state.doc.annotation_status='draft';}
    save();renderNavigation();renderEpisodeHeader();
  }
  function clearSession() {stopPlay();state.layout=null;state.doc=null;state.key=null;state.conflict=false;state.placement=null;state.pending=null;state.revision=0;$('workspace').classList.add('hidden');$('welcome').classList.remove('hidden');$('conflictBanner').classList.add('hidden');$('pendingImportLabel').textContent='No layout selected.';}
  function resetPosition(){state.episode=0;state.frame=0;state.marker=null;state.tab=state.role==='coordinator'?'points':'scene';state.placement=null;}
  function acceptWorkspace(layout,doc=null,replace=false){
    const nextKey=scopeKey(state.role,state.identity,state.role==='coordinator'?'':layout.layout_id);
    const stored=readStored(nextKey);
    if(stored?.corrupt){preserveCorrupt(nextKey,stored);return false;}
    if(stored?.unavailable){$('storageWarning').classList.remove('hidden');state.storageOK=false;}
    let chosen=doc||(state.role==='coordinator'?layout:Core.createExport(state.dataset,layout,state.identity));
    if(stored&&!stored.unavailable&&!replace){
      const errors=state.role==='coordinator'?Core.validateLayoutDraft(stored.data,state.dataset):Core.validateExport(stored.data,state.dataset,state.catalogue,false);
      if(errors.length){message('Saved draft needs recovery','The browser draft did not pass validation. It was not overwritten. Export or inspect the saved JSON before continuing.\n'+errors.slice(0,8).join('\n'));return false;}
      chosen=stored.data;
    }
    if(stored&&!stored.unavailable&&replace&&!confirm('Replace the currently saved work in this exact workspace? Export a backup first if needed.'))return false;
    state.key=nextKey;state.revision=stored?.revision||0;state.conflict=false;
    if(state.role==='coordinator'){state.layout=Core.clone(chosen);state.doc=null;}
    else {state.doc=Core.clone(chosen);state.layout=state.doc.layout;}
    resetPosition();$('welcome').classList.add('hidden');$('workspace').classList.remove('hidden');$('conflictBanner').classList.add('hidden');
    $('roleBadge').textContent=state.role==='coordinator'?'Layout coordinator':'Independent annotator';$('identityLabel').textContent=state.identity;
    $('finalExport').textContent=state.role==='coordinator'?'Freeze & export layout':'Export final JSON';
    $('draftExport').textContent=state.role==='coordinator'?'Export layout draft':'Export draft JSON';
    save();render();return true;
  }
  function start(event){
    event.preventDefault();$('setupError').textContent='';
    const identity=$('identityInput').value.trim();if(!identity){$('setupError').textContent='Please enter your coordinator or annotator ID.';return;}
    state.identity=identity;state.role=$('roleSelect').value;
    if(state.role==='coordinator'){
      if(state.pending?.schema==='blockmind_l2_annotations_v1'){$('setupError').textContent='Coordinators import layouts, not a rater’s private answers.';return;}
      const layout=state.pending?Core.clone(state.pending):Core.makeLayout(state.dataset,identity);
      layout.coordinator=identity;
      acceptWorkspace(layout,null,Boolean(state.pending));
    }else{
      const pending=state.pending;
      let layout=pending?.schema==='blockmind_l2_annotations_v1'?pending.layout:pending;
      if(!layout){const cached=readStored(lastLayoutKey());if(cached?.schema==='blockmind_l2_layout_v1')layout=cached;}
      if(!layout){$('setupError').textContent='Import the frozen shared layout first. The coordinator must review it before annotation starts.';return;}
      const errors=Core.validateLayout(layout,state.dataset);
      if(!layout.layout_id||layout.layout_id!==Core.layoutId(layout))errors.push('A valid frozen layout ID is required.');
      if(errors.length){$('setupError').textContent='This layout is not frozen and complete. Ask the coordinator to finish and export it.';issues('Shared layout is not ready',errors);return;}
      if(pending?.schema==='blockmind_l2_annotations_v1'&&pending.annotator!==identity){$('setupError').textContent='The draft belongs to a different annotator. Use your own ID and independent answers.';return;}
      acceptWorkspace(layout,pending?.schema==='blockmind_l2_annotations_v1'?pending:null,pending?.schema==='blockmind_l2_annotations_v1');
    }
  }
  function roleHelp(){state.role=$('roleSelect').value;$('roleHelp').textContent=state.role==='coordinator'?'Start with unreviewed mesh proposals, or import an existing shared layout. Check every point, direction anchor, and boundary box before freezing.':'Import the frozen layout provided by your coordinator. Do not import another rater’s answers.';$('welcomeImport').textContent=state.role==='coordinator'?'Import a layout / coordinator draft':'Import layout or my saved draft';}
  async function importFile(file){
    if(!file)return;
    try{
      if(file.size>40*1024*1024)throw new Error('This JSON is too large for an annotation export (limit 40 MB).');
      const candidate=JSON.parse(await file.text());
      const role=state.key?state.role:$('roleSelect').value;
      let errors=[];
      if(candidate.schema==='blockmind_l2_layout_v1'){
        errors=role==='coordinator'?Core.validateLayoutDraft(candidate,state.dataset):Core.validateLayout(candidate,state.dataset);
        if(role==='annotator'&&(!candidate.layout_id||candidate.layout_id!==Core.layoutId(candidate)))errors.push('Annotators must import the exact frozen layout with a valid content hash.');
      }else if(candidate.schema==='blockmind_l2_annotations_v1'){
        if(role!=='annotator')throw new Error('A coordinator may import geometry layouts, not private human answers.');
        errors=Core.validateExport(candidate,state.dataset,state.catalogue,false);
        const identity=state.key?state.identity:$('identityInput').value.trim();
        if(!identity)throw new Error('Enter your annotator ID before importing an answer file.');
        if(candidate.annotator!==identity)throw new Error('This file belongs to another annotator. Independent raters must not load one another’s answers.');
      }else throw new Error('Unsupported file. Import a Level 2 shared layout or your own Level 2 annotation export.');
      if(errors.length){issues('Import rejected — nothing changed',errors);return;}
      if(state.key){
        if(state.conflict){message('Resolve the tab conflict first','Export this tab’s recovery copy, then load the latest saved draft before importing.');return;}
        if(!confirm('Open this imported file? Your existing workspace remains saved in this browser. Any replacement of the same workspace will ask again.'))return;
        const layout=candidate.schema==='blockmind_l2_annotations_v1'?candidate.layout:candidate;
        if(acceptWorkspace(Core.clone(layout),candidate.schema==='blockmind_l2_annotations_v1'?candidate:null,true))toast('Import validated and loaded.');
      }else{
        state.pending=Core.clone(candidate);$('pendingImportLabel').textContent=`Ready: ${file.name}${candidate.layout_id?' · '+candidate.layout_id.slice(0,14)+'…':' · draft, not frozen'}`;toast('File validated. Open your workspace to continue.');
      }
      if(candidate.schema==='blockmind_l2_layout_v1'&&candidate.layout_id){try{localStorage.setItem(lastLayoutKey(),JSON.stringify(candidate));}catch{}}
    }catch(error){message('Import rejected — nothing changed',error.message||String(error));}
  }
  function download(doc,name){const blob=new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function fileName(kind){return `blockmind_l2_${kind}_${state.identity.replace(/[^a-z0-9_-]/gi,'_')}_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;}
  function exportDraft(recovery=false){
    const data=Core.clone(payload());if(!data)return;
    if(!recovery){const errors=state.role==='coordinator'?Core.validateLayoutDraft(data,state.dataset):Core.validateExport(data,state.dataset,state.catalogue,false);if(errors.length){issues('Draft is malformed — use recovery export to preserve it',errors);return;}}
    download(data,fileName(recovery?'recovery':state.role==='coordinator'?'layout_draft':'draft'));toast(recovery?'Recovery copy downloaded.':'Draft backup downloaded.');
  }
  function exportFinal(){
    if(state.conflict){message('This tab is locked','Resolve the saved-draft conflict before final export.');return;}
    if(state.role==='coordinator'){
      const candidate=Core.clone(state.layout);candidate.layout_id='';const errors=Core.validateLayout(candidate,state.dataset);
      if(errors.length){issues('Finish the shared layout before freezing',errors);return;}
      if(!confirm('Freeze this reviewed geometry layout for BOTH independent raters? They must use this exact version. Later edits create a different layout ID and cannot be merged with this one.'))return;
      candidate.layout_id=Core.layoutId(candidate);state.layout=candidate;save();
      try{localStorage.setItem(lastLayoutKey(),JSON.stringify(candidate));}catch{}
      download(candidate,fileName('layout_frozen'));toast('Frozen layout exported. Share the same file with both raters.');renderPanel();
    }else{
      const candidate=Core.clone(state.doc);candidate.annotation_status='complete';candidate.updated_at=now();
      const errors=Core.validateExport(candidate,state.dataset,state.catalogue,true);if(errors.length){issues('Final export is not ready',errors);return;}
      state.doc=candidate;state.layout=candidate.layout;save();download(candidate,fileName('complete'));toast('Complete validated annotation export downloaded.');
    }
  }
  function statusFor(index){const id=state.dataset.episodes[index].id;const layout=state.layout.episodes.find(e=>e.episode_id===id);if(state.role==='coordinator')return layout.disposition==='exclude'?'excluded':layout.setup_reviewed?'complete':'in_progress';return state.doc.episodes.find(e=>e.episode_id===id)?.status||'not_started';}
  function isFlagged(ep){return /review|warn|weak|question|flag/i.test(String(ep.visual_verdict||''));}
  function renderNavigation(){
    const episodes=state.dataset.episodes;const done=episodes.filter((_,i)=>['complete','excluded'].includes(statusFor(i))).length;
    $('totalEpisodes').textContent=episodes.length;$('overallProgress').textContent=`${done} / ${episodes.length} ${state.role==='coordinator'?'reviewed or excluded':'complete or excluded'}`;$('progressBar').style.width=`${100*done/episodes.length}%`;
    $('episodeList').innerHTML=episodes.map((ep,i)=>{
      const status=statusFor(i);const haystack=`${ep.id} ${ep.scan_id} ${i+1}`.toLowerCase();
      const matchSearch=!state.search||haystack.includes(state.search.toLowerCase());
      const matchFilter=state.filter==='all'||state.filter==='incomplete'&&!['complete','excluded'].includes(status)||state.filter==='complete'&&status==='complete'||state.filter==='excluded'&&status==='excluded'||state.filter==='flagged'&&isFlagged(ep)||state.filter===ep.boundary_class;
      if(!matchSearch||!matchFilter)return '';
      return `<button type="button" data-episode="${i}" class="${i===state.episode?'selected':''}" aria-current="${i===state.episode?'true':'false'}"><span class="episode-number">${pad(i+1)}</span><span class="episode-list-text">${esc(ep.scan_id)}<small>${esc(human(ep.boundary_class))}${isFlagged(ep)?' · review flag':''}</small></span><span class="status-dot ${esc(status)}" title="${esc(human(status))}"></span></button>`;
    }).join('')||'<p class="empty-state">No matching episodes.</p>';
  }
  function renderEpisodeHeader(){
    const ep=episode();const status=statusFor(state.episode);$('episodeKicker').textContent=`Episode ${pad(state.episode+1)} of ${state.dataset.episodes.length}`;$('episodeTitle').textContent=`Indoor–exterior transition`;
    $('episodeSubtitle').textContent=`House ${ep.scan_id} · boundary instance ${ep.boundary_object_id} · ${state.role==='coordinator'?'shared geometry only':'independent human judgments'}`;
    $('episodeStatus').textContent=state.role==='coordinator'&&status==='complete'?'Setup reviewed':human(status);$('episodeStatus').className='badge '+(status==='complete'?'success':status==='excluded'?'danger':'');
    $('prevEpisode').disabled=state.episode===0;$('nextEpisode').disabled=state.episode===state.dataset.episodes.length-1;
    $('episodeSourceWarning').classList.toggle('hidden',!isFlagged(ep));$('episodeSourceWarning').textContent=isFlagged(ep)?`Source visual screening requests review. ${ep.quality_note||'Check the boundary and exterior context carefully; exclude with a reason if unsuitable.'}`:'';
  }
  function render(){renderNavigation();renderEpisodeHeader();renderFrame();renderTabs();renderPanel();}
  function changeEpisode(index){if(index<0||index>=state.dataset.episodes.length)return;stopPlay();state.episode=index;state.frame=0;state.marker=null;state.placement=null;state.boxStart=null;render();}
  function nextIncomplete(){const n=state.dataset.episodes.length;for(let step=1;step<=n;step++){const index=(state.episode+step)%n;if(!['complete','excluded'].includes(statusFor(index))){changeEpisode(index);return;}}toast('Every episode is complete / reviewed or explicitly excluded.');}
  function changeFrame(index){if(index<0||index>=episode().frames.length)return;state.frame=index;state.boxStart=null;renderFrame();if(['visibility','points','directions','boxes','surfaces'].includes(state.tab))renderPanel();if($('previewDialog').open)renderPreview();}
  function renderFrame(){
    const f=frame();const token=++state.frameToken;state.frameReady=false;
    $('frameTitle').textContent=`Frame ${pad(f.index)}`;$('frameSide').textContent=f.side==='indoor'?'Before crossing':'After crossing';
    const image=$('sceneImage');const expectedURL=new URL(f.image,location.href).href;
    $('imageLoading').classList.remove('hidden');$('imageLoading').textContent='Loading frame…';image.alt=`Original photograph, frame ${f.index} of 12`;
    const ready=()=>{
      if(token!==state.frameToken||image.currentSrc!==expectedURL||!image.complete)return;
      if(image.naturalWidth!==f.width||image.naturalHeight!==f.height){$('imageLoading').textContent='Image dimensions do not match the manifest. Point placement is disabled until the data bundle is repaired.';state.frameReady=false;return;}
      state.frameReady=true;$('imageLoading').classList.add('hidden');
    };
    image.onload=ready;image.onerror=()=>{if(token!==state.frameToken)return;state.frameReady=false;$('imageLoading').textContent='Image failed to load. Check that this site was copied with its assets.';};
    image.src=f.image;if(image.complete&&image.naturalWidth)ready();
    $('geometryOverlay').setAttribute('viewBox',`0 0 ${f.width} ${f.height}`);$('maskImage').src=f.boundary_mask||'';
    $('maskImage').classList.toggle('hidden',!$('showMask').checked||!f.boundary_mask);
    $('filmstrip').innerHTML=episode().frames.map((item,i)=>`<button type="button" data-frame="${i}" class="${i===state.frame?'selected':''}" aria-label="Frame ${item.index}, ${item.side==='indoor'?'before':'after'} crossing" aria-current="${i===state.frame?'true':'false'}"><img src="${esc(item.image)}" alt="" loading="lazy"><span>${pad(item.index)}</span></button>`).join('');
    $('prevFrame').disabled=state.frame===0;$('nextFrame').disabled=state.frame===11;
    renderGeometry();renderHints();loadInstanceMap();
  }
  function positionInFrame(m,fid){if(m.anchor_frame===fid)return {x:m.x,y:m.y,source:'anchor'};return m.observations.find(o=>o.frame_id===fid)||null;}
  function markerSVG(clean=false){
    const f=frame();const scale=f.width/1000;
    return markers().map((m,index)=>{const pos=positionInFrame(m,f.id);if(!pos)return '';const selected=!clean&&selectedMarker()?.id===m.id;const label=clean?index+1:m.id;return `<g data-marker-id="${esc(m.id)}"><circle class="marker-dot ${selected?'marker-selected':''}" cx="${pos.x*f.width}" cy="${pos.y*f.height}" r="${15*scale}" style="stroke-width:${3*scale}px"/><text class="marker-label ${selected?'selected':''}" x="${pos.x*f.width}" y="${pos.y*f.height}" style="font-size:${(String(label).length>1?13:16)*scale}px">${esc(label)}</text>${clean?'':`<circle class="marker-hit" data-marker="${esc(m.id)}" cx="${pos.x*f.width}" cy="${pos.y*f.height}" r="${23*scale}"/>`}</g>`;}).join('');
  }
  function renderGeometry(){
    const f=frame();let svg=$('showMarkers').checked?markerSVG():'';
    if($('showBoxes').checked){svg+=layoutEpisode().boundary_boxes.filter(b=>b.frame_id===f.id).map(b=>`<rect class="boundary-box" x="${b.x0*f.width}" y="${b.y0*f.height}" width="${(b.x1-b.x0)*f.width}" height="${(b.y1-b.y0)*f.height}"/>`).join('');}
    if(state.tab==='directions'||state.role==='annotator'&&['pathways','surfaces'].includes(state.tab)){for(const d of layoutEpisode().directions){if(d.reference_frame===f.id&&d.x!==null&&d.y!==null)svg+=`<circle class="direction-dot" cx="${d.x*f.width}" cy="${d.y*f.height}" r="17"/><text class="marker-label" x="${d.x*f.width}" y="${d.y*f.height}" style="font-size:13px">${esc(d.id.toUpperCase())}</text>`;}}
    if(state.boxStart)svg+=`<circle class="direction-dot" cx="${state.boxStart.x*f.width}" cy="${state.boxStart.y*f.height}" r="8"/>`;
    $('geometryOverlay').innerHTML=svg;$('imageStage').classList.toggle('placing',Boolean(state.placement));
    let text='';if(state.placement?.kind==='add')text='Click the visible surface to add a shared point. Choose distinct surfaces, not repeated copies of the same point.';
    if(state.placement?.kind==='move')text=`Click the same physical surface to ${positionInFrame(selectedMarker(),f.id)?'move':'add'} ${state.marker} in this frame. Other frame positions remain unchanged.`;
    if(state.placement?.kind==='direction')text=`Click a visible reference for ${state.placement.id.toUpperCase()}. The text must still define the direction unambiguously.`;
    if(state.placement?.kind==='box')text=state.boxStart?'Click the opposite corner of the same boundary object.':'Click one corner of the boundary object, then its opposite corner. This replaces the box in this frame.';
    $('placementHint').textContent=text;$('placementHint').classList.toggle('hidden',!text);
  }
  function renderHints(){const f=frame();$('machineHints').classList.toggle('hidden',!$('showHints').checked);if(!$('showHints').checked)return;$('machineHints').innerHTML=`<strong>Machine proposals — not ground truth</strong><br>Boundary instance ${esc(episode().boundary_object_id)}: ${esc(f.boundary_pixels)} pixels at 160 × 128. Geometry hint: ${esc(f.geometry_visibility_hint)}.<br>Native region ${esc(f.region_id)}, capture ${esc(f.capture_id)}.<br>Visible category suggestions: ${esc([...new Set((f.objects||[]).map(o=>o.name))].join(', ')||'None available')}.`;}
  async function loadInstanceMap(){const fid=episode().id+':'+frame().id;state.mapCanvas=null;state.mapFrame=fid;const path=frame().instance_map;if(!path)return;try{const image=new Image();image.src=path;await image.decode();if(state.mapFrame!==fid)return;const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0);state.mapCanvas=canvas;}catch{/* Native identity remains unknown; never invent it. */}}
  function lookupPoint(x,y){if(!state.mapCanvas)return {object_id:null,mpcat40:null};try{const c=state.mapCanvas;const p=c.getContext('2d').getImageData(Math.min(c.width-1,Math.floor(x*c.width)),Math.min(c.height-1,Math.floor(y*c.height)),1,1).data;const id=(p[0]*65536+p[1]*256+p[2])-1;const obj=(frame().objects||[]).find(o=>Number(o.object_id)===id);return obj?{object_id:id,mpcat40:obj.mpcat40}:{object_id:null,mpcat40:null};}catch{return {object_id:null,mpcat40:null};}}
  function stageClick(event){
    const hit=event.target.closest?.('[data-marker]');
    if(hit&&!state.placement){state.marker=hit.dataset.marker;if(state.role==='annotator')state.tab='surfaces';renderTabs();renderPanel();renderGeometry();return;}
    if(state.role!=='coordinator'||!editable()||!state.placement)return;
    if(!state.frameReady){toast('Wait until this exact frame is loaded and its dimensions are verified before placing geometry.');return;}
    const rect=$('sceneImage').getBoundingClientRect();if(!rect.width||!rect.height)return;
    const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;if(x<0||x>1||y<0||y>1)return;
    const le=layoutEpisode(),f=frame();
    if(state.placement.kind==='add'){
      const side=f.side;const same=markers().filter(m=>m.side===side);if(same.length>=5){toast('This side already has five shared points. Remove one before adding another.');state.placement=null;renderGeometry();return;}
      const prefix=side==='indoor'?'I':'E';let n=1;while(markers().some(m=>m.id===prefix+n))n++;const id=prefix+n;
      const identity=lookupPoint(x,y);le.markers.push({id,side,anchor_frame:f.id,x,y,...identity,observations:[]});state.marker=id;
    }else if(state.placement.kind==='move'){
      const m=selectedMarker();if(!m)return;
      if(m.anchor_frame===f.id){m.x=x;m.y=y;Object.assign(m,lookupPoint(x,y));const obs=m.observations.find(o=>o.frame_id===f.id);if(obs){obs.x=x;obs.y=y;obs.source='human_adjusted';}}
      else{const old=m.observations.find(o=>o.frame_id===f.id);if(old)Object.assign(old,{x,y,source:'human_adjusted'});else m.observations.push({frame_id:f.id,x,y,source:'human'});}
    }else if(state.placement.kind==='direction'){Object.assign(le.directions.find(d=>d.id===state.placement.id),{reference_frame:f.id,x,y});}
    else if(state.placement.kind==='box'){
      if(!state.boxStart){state.boxStart={x,y};renderGeometry();return;}
      const b={frame_id:f.id,x0:Math.min(x,state.boxStart.x),y0:Math.min(y,state.boxStart.y),x1:Math.max(x,state.boxStart.x),y1:Math.max(y,state.boxStart.y)};
      if(b.x1-b.x0<.003||b.y1-b.y0<.003){toast('That box is too small. Click two different corners.');state.boxStart=null;renderGeometry();return;}
      le.boundary_boxes=le.boundary_boxes.filter(box=>box.frame_id!==f.id);le.boundary_boxes.push(b);state.boxStart=null;
    }
    state.placement=null;changed(true);renderPanel();renderGeometry();
  }
  function stopPlay(){if(state.playing)clearInterval(state.playing);state.playing=null;$('playButton').textContent='▶ Play';$('playButton').setAttribute('aria-label','Play sequence');}
  function play(){if(state.playing){stopPlay();return;}state.placement=null;$('playButton').textContent='Ⅱ Pause';$('playButton').setAttribute('aria-label','Pause sequence');state.playing=setInterval(()=>{if(state.frame===11){stopPlay();return;}changeFrame(state.frame+1);},Number($('playSpeed').value));renderGeometry();}
  function renderPreview(){const f=frame();$('previewFrameLabel').textContent=`Frame ${pad(f.index)}`;$('previewImage').src=f.image;$('previewImage').alt=`RGB frame ${f.index} with numbered points`;$('previewOverlay').setAttribute('viewBox',`0 0 ${f.width} ${f.height}`);$('previewOverlay').innerHTML=markerSVG(true);$('previewPrev').disabled=state.frame===0;$('previewNext').disabled=state.frame===11;}
  const coordinatorTabs=[['points','Surfaces'],['directions','Directions'],['boxes','Boundary'],['review','Review']];
  const annotatorTabs=[['scene','Scene'],['boundary','Boundary'],['surfaces','Surfaces'],['pathways','Pathways'],['visibility','Visibility'],['review','Review']];
  function renderTabs(){const tabs=state.role==='coordinator'?coordinatorTabs:annotatorTabs;if(!tabs.some(t=>t[0]===state.tab))state.tab=tabs[0][0];$('taskTabs').innerHTML=tabs.map(([id,label])=>`<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="panelContent" aria-selected="${state.tab===id}" tabindex="${state.tab===id?0:-1}">${label}</button>`).join('');$('panelContent').setAttribute('aria-labelledby','tab-'+state.tab);}
  function optionHTML(options,value){return '<option value="">Choose…</option>'+options.map(item=>{const v=typeof item==='object'?item.value:item;const label=typeof item==='object'?item.label:human(item);return `<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(label)}</option>`;}).join('');}
  function selectField(path,label,type='yes_no',hint=''){const value=getPath(record().answers,path);const options=Core.FIELDS[type]||Core.FIELDS.yes_no;return `<label class="field"><span>${esc(label)}</span><select data-answer="${esc(path)}" aria-label="${esc(label)}" ${locked()?'disabled':''}>${optionHTML(options,value)}</select>${hint?`<small>${esc(hint)}</small>`:''}</label>`;}
  function freeField(path,label,suggestions=[]){const value=getPath(record().answers,path);const nd=value===Core.ND;const listId='list-'+path.replace(/[^a-z0-9]/gi,'-');return `<label class="field"><span>${esc(label)}</span><div class="free-input-row"><input data-answer="${esc(path)}" value="${esc(nd?'':value)}" placeholder="${nd?'Not determinable':'Choose a suggestion or type your own'}" ${nd||locked()?'disabled':''} ${suggestions.length?`list="${listId}"`:''} maxlength="250"><button type="button" data-nd="${esc(path)}" aria-pressed="${nd}" class="${nd?'active':''}" ${locked()?'disabled':''}>${nd?'Use text instead':'Not determinable'}</button></div>${suggestions.length?`<datalist id="${listId}">${suggestions.map(s=>`<option value="${esc(s)}"></option>`).join('')}</datalist>`:''}<small>Suggestions are optional; your own wording is accepted.</small></label>`;}
  function hierarchyField(path,label='Material hierarchy match'){const value=getPath(record().answers,path);const options=state.catalogue.materials.map(m=>({value:String(m.id),label:`${m.label} · ${m.family||m.id}`})).concat([{value:'__other__',label:'Other / not in catalogue'},{value:Core.ND,label:'Not determinable'}]);const match=state.catalogue.materials.find(m=>String(m.id)===String(value));return `<label class="field"><span>${esc(label)}</span><select data-answer="${esc(path)}" aria-label="${esc(label)}" ${locked()?'disabled':''}>${optionHTML(options,value)}</select><small>Choose independently. A suggestion or mesh category never establishes the material.</small></label>${match?`<details class="details"><summary>Catalogue reference (not new ground truth)</summary><div class="property-reference">${esc(JSON.stringify(match.reference||{},null,2))}</div><p>Reference physics is not a human measurement. Family C remains disabled until a reviewed allowed-pairs table is supplied.</p></details>`:''}`;}
  function notesField(path,label='Notes'){return `<label class="field"><span>${esc(label)}</span><textarea data-answer="${esc(path)}" ${locked()?'disabled':''} placeholder="Explain ambiguity, occlusion, evidence, or exceptions.">${esc(getPath(record().answers,path)||'')}</textarea></label>`;}
  function materialSuggestions(marker){const key=String(marker?.mpcat40??'');const scoped=state.catalogue.suggestions_by_mpcat40?.[key];return (scoped?.length?scoped:state.catalogue.all_material_suggestions||[]).map(s=>typeof s==='string'?s:s.label||s.name).filter(Boolean);}
  function directionsSummary(){return layoutEpisode().directions.map(d=>`<div class="direction-summary"><strong>${d.id.toUpperCase()}</strong> ${esc(d.text)} <button type="button" data-jump-frame="${esc(d.reference_frame)}" class="quiet small-button">Reference ${esc(d.reference_frame.slice(1))} ↗</button></div>`).join('');}
  function conditionHelp(){const c=state.layout.conditions||Core.CONDITIONS;return `<details class="details"><summary>Shared open / sealed assumptions</summary><p><strong>Fully open:</strong> ${esc(c.open)}</p><p><strong>Sealed as built:</strong> ${esc(c.sealed)}</p><p>${esc(c.no_closure_policy)}</p></details>`;}
  function matrix(path,channels){return `<div class="table-wrap"><table class="answer-table"><thead><tr><th>Channel</th><th>Fully open</th><th>Sealed as built</th></tr></thead><tbody>${channels.map(([key,label])=>`<tr><td>${esc(label)}</td>${['open','sealed'].map(s=>`<td><select data-answer="${esc(path+'.'+s+'.'+key)}" aria-label="${esc(path+' '+s+' '+label)}" ${locked()?'disabled':''}>${optionHTML(Core.FIELDS.yes_no,getPath(record().answers,path+'.'+s+'.'+key))}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function renderPanel(){
    if(!state.layout)return;
    const le=layoutEpisode();let html='';
    if(state.role==='coordinator')html=renderCoordinator();
    else if(record().status==='excluded')html=`<div class="excluded-overlay"><h3>Episode excluded</h3><p>${esc(record().exclusion_reason)}</p>${le.disposition==='exclude'?'<p>The shared layout excludes this episode. Only a coordinator can change that layout.</p>':`<button data-action="reopen" ${state.conflict?'disabled':''}>Reopen this episode</button>`}</div>`;
    else{
      if(record().status==='complete')html+='<div class="locked-note">This episode is complete and locked. To change a judgment, use <strong>Reopen episode</strong> in Review.</div>';
      if(state.tab==='scene')html+=renderScene();
      if(state.tab==='boundary')html+=renderBoundary();
      if(state.tab==='surfaces')html+=renderSurfaces();
      if(state.tab==='pathways')html+=renderPathways();
      if(state.tab==='visibility')html+=renderVisibility();
      if(state.tab==='review')html+=renderReview();
    }
    $('panelContent').innerHTML=html;
    if(state.conflict)$('panelContent').querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
  }
  function renderCoordinator(){
    const le=layoutEpisode();const disabled=!editable()?'disabled':'';
    if(le.disposition==='exclude')return `<div class="excluded-overlay"><h3>Excluded from the shared layout</h3><p>${esc(le.exclusion_reason)}</p><button data-action="include" ${state.conflict?'disabled':''}>Include and review this episode</button></div>`;
    if(state.tab==='points'){
      const m=selectedMarker();if(m)state.marker=m.id;
      return `<h2>Shared surface points</h2><p class="panel-intro">Choose 3–5 distinct surfaces on each side. A point follows the <strong>same physical patch</strong> across views, not every pixel belonging to the same object.</p><div class="helper warning">Mesh points and cross-frame projections are proposals. Check RGB carefully; delete any projection that lands on another surface, reflection, or occluder.</div><div class="placement-toolbar"><button data-action="add-point" class="primary" ${disabled}>＋ Add point in this frame</button><button data-action="cancel-placement" ${disabled}>Cancel placement</button></div>${['indoor','exterior'].map(side=>{const items=markers().filter(m=>m.side===side);return `<div class="point-side-heading"><h3>${side==='indoor'?'Indoor surfaces':'Exterior surfaces'}</h3><span>${items.length} / 3–5 required</span></div><div class="pill-list">${items.map(item=>`<button data-select-marker="${esc(item.id)}" class="${m?.id===item.id?'active':''}"><span class="point-index ${m?.id===item.id?'selected':''}">${esc(item.id)}</span>${esc(item.id)}</button>`).join('')||'<span class="small muted">No shared points yet.</span>'}</div>`;}).join('')}${m?`<div class="point-card selected"><div class="section-head"><h3>Point ${esc(m.id)}</h3><button data-jump-frame="${esc(m.anchor_frame)}" class="quiet small-button">Anchor ${esc(m.anchor_frame.slice(1))} ↗</button></div><p class="coordinate-display">Anchor: x ${m.x.toFixed(4)}, y ${m.y.toFixed(4)} · original pixel ${Math.round(m.x*(episode().frames.find(f=>f.id===m.anchor_frame).width-1))}, ${Math.round(m.y*(episode().frames.find(f=>f.id===m.anchor_frame).height-1))}<br>Native instance ${m.object_id??'unknown'} · category ${m.mpcat40??'unknown'} (metadata, not human labels)</p><div class="button-row"><button data-action="move-point" class="secondary" ${disabled}>${positionInFrame(m,frame().id)?'Move point':'Add same point'} in frame ${pad(frame().index)}</button><button data-action="remove-observation" ${disabled||m.anchor_frame===frame().id||!positionInFrame(m,frame().id)?'disabled':''}>Remove this frame’s point</button><button data-action="delete-point" class="danger" ${disabled}>Delete ${esc(m.id)}</button></div><details class="details"><summary>Cross-frame positions (${m.observations.length} proposals / observations)</summary><p>Only mark the same visible physical patch. Removing a position does not assert that the surface is absent; raters separately certify visibility.</p>${m.observations.map(o=>`<div class="box-row"><span>${esc(o.frame_id)} · ${esc(human(o.source))}</span><div><button data-jump-frame="${esc(o.frame_id)}">View</button><button data-delete-observation="${esc(o.frame_id)}" ${disabled}>Remove</button></div></div>`).join('')||'<p>No extra observations.</p>'}</details></div>`:''}<p class="protocol-note">The frozen layout carries geometry only. Material, reflectance, physics pathways, and uncertainty are independently answered by each rater.</p>`;
    }
    if(state.tab==='directions')return `<h2>Two shared source directions</h2><p class="panel-intro">Define two distinct, repeatable directions for incoming sunlight and weather. Use a visible reference point and clear wording so both raters assess the same scenario.</p><div class="helper warning">The proposal’s final direction definitions were not supplied. A coordinator must state them explicitly; these are not automatically inferred from the route or compass heading.</div>${le.directions.map(d=>`<div class="direction-card"><h3>${d.id.toUpperCase()}</h3><label class="field"><span>Direction statement</span><textarea data-direction-text="${esc(d.id)}" placeholder="Describe the incoming source direction relative to a visible fixed landmark, including elevation if relevant." ${disabled}>${esc(d.text)}</textarea></label><p class="coordinate-display">${d.x===null?'No visible reference anchored yet.':`Reference ${esc(d.reference_frame)} · x ${d.x.toFixed(4)}, y ${d.y.toFixed(4)}`}</p><div class="button-row"><button data-place-direction="${esc(d.id)}" class="secondary" ${disabled}>Set reference in frame ${pad(frame().index)}</button>${d.x!==null?`<button data-jump-frame="${esc(d.reference_frame)}">View anchor</button>`:''}</div></div>`).join('')}<p class="protocol-note">Direction anchors identify references, not an automatically measured ray. Both directions are used in fully-open and sealed-as-built counterfactual states.</p>`;
    if(state.tab==='boxes')return `<h2>One boundary, every view</h2><p class="panel-intro">Confirm that instance <strong>${esc(episode().boundary_object_id)}</strong> is the physical boundary crossed. Draw tight boxes around that same object in at least two pre-crossing frames.</p><div class="helper">Use the machine-mask toggle to inspect identity. A mask can include a frame, surrounding structure, or phantom geometry; it is not a human certificate.</div><div class="placement-toolbar"><button data-action="draw-box" class="primary" ${disabled}>Draw / replace box in frame ${pad(frame().index)}</button><button data-action="cancel-placement" ${disabled}>Cancel</button></div>${le.boundary_boxes.map(b=>`<div class="box-row"><span><strong>${esc(b.frame_id)}</strong> · ${episode().frames.find(f=>f.id===b.frame_id).side==='indoor'?'pre-crossing':'post-crossing'}</span><div><button data-jump-frame="${esc(b.frame_id)}">View</button><button data-delete-box="${esc(b.frame_id)}" ${disabled}>Remove</button></div></div>`).join('')||'<p class="empty-state">No boundary boxes yet.</p>'}<hr class="section-divider"><p class="small muted">Boxes can be added in all 12 frames when useful. Missing boxes should be judged “Not determinable” in the rater’s box-correctness field, not automatically “No”.</p>`;
    const errors=layoutEpisodeErrors();return `<h2>Review & freeze preparation</h2><p class="panel-intro">This step approves shared geometry only. It does not pre-fill any rater’s human answers.</p><div class="checklist-stats"><div><strong>${markers().filter(m=>m.side==='indoor').length} + ${markers().filter(m=>m.side==='exterior').length}</strong><span>Indoor + exterior points</span></div><div><strong>${le.boundary_boxes.filter(b=>episode().frames.find(f=>f.id===b.frame_id)?.side==='indoor').length}</strong><span>Pre-crossing boundary boxes</span></div></div><label class="field"><span>Coordinator setup notes</span><textarea data-layout-notes ${disabled} placeholder="Describe geometric ambiguity, manual corrections, direction rationale, or special cases.">${esc(le.setup_notes)}</textarea></label><label class="checkbox-row reviewed-check"><input type="checkbox" id="setupReviewed" ${le.setup_reviewed?'checked':''} ${disabled}><span>I reviewed <strong>all surface points and cross-frame positions</strong>, both direction statements and anchors, and the same boundary object’s boxes against the RGB frames.</span></label>${errors.length?`<p class="small muted">Remaining setup checks:</p><ul class="issue-list">${errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:'<div class="locked-note">This episode’s shared layout passes all setup checks.</div>'}<p class="protocol-note">Use “Freeze & export layout” only after all included episodes pass. Both raters must receive the same frozen file. Changing a point or direction creates a new layout version.</p>${auditDetails()}<div class="danger-zone"><h3>Unsuitable episode?</h3><p class="small muted">Keep it in the collection with an explicit exclusion reason.</p><button data-action="exclude" class="danger" ${disabled}>Exclude episode from shared layout</button></div>`;
  }
  function layoutEpisodeErrors(){const copy=Core.clone(state.layout);copy.layout_id='';const index=copy.episodes.findIndex(e=>e.episode_id===episode().id);return Core.validateLayout(copy,state.dataset).filter(e=>e.startsWith(`layout.episodes[${index}]`)).map(e=>e.replace(`layout.episodes[${index}].`,''));}
  function auditDetails(){return `<details class="details"><summary>Source evidence & protocol limits</summary><p>Reference routes: reciprocal native R2R navigation, step ≤ 3 m, boundary matching ≤ 0.75 m, visibility ≥ 100 pixels in at least two pre-crossing 160 × 128 renders. Screened candidates are not automatically human-certified.</p>${Object.entries(episode().audit_links||{}).map(([key,url])=>typeof url==='string'?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(human(key))} ↗</a>`:'').join('')}<p>Depth and instance maps are annotation-only. These 12 frames do not claim to provide every Level 3 horizon. No physical simulation or numerical temperature ground truth is supplied.</p></details>`;}
  function renderScene(){return `<h2>Scene & transition</h2><p class="panel-intro">Watch all 12 frames before deciding. Judge the actual camera-side transition, not whether every visible pixel is indoors or outdoors.</p><div class="field-grid">${SCENE.map(([key,label,type])=>selectField('scene.'+key,label,type)).join('')}</div><div class="helper">A garage, glazed lobby, enclosed porch, or sunroom may be <strong>semi-outdoor</strong>. A corridor or roof alone does not prove open-air exposure. If unclear, use Not determinable and explain in Review.</div><p class="required-hint">Blank = unanswered. Not determinable = a deliberate uncertainty judgment.</p>${auditDetails()}`;}
  function renderBoundary(){return `<h2>The crossed boundary</h2><p class="panel-intro">Judge the single shared boundary object. Do not label a nearby window or a different door. Open and sealed hypothetical conditions are handled separately in Pathways.</p><div class="field-grid">${BOUNDARY.slice(0,6).map(([key,label,type])=>selectField('boundary.'+key,label,type)).join('')}</div>${freeField('boundary.material','Boundary material',materialSuggestions(null))}${hierarchyField('boundary.hierarchy_id')}<hr class="section-divider"><h3>Geometry & evidence checks</h3><p class="small muted">Use masks and source evidence only as aids. If the RGB cannot resolve a mesh-specific question, say Not determinable.</p><div class="field-grid">${BOUNDARY.slice(6).map(([key,label,type])=>selectField('boundary.'+key,label,type)).join('')}</div>${notesField('boundary.notes','Boundary evidence notes')}`;}
  function renderSurfaces(){
    const m=selectedMarker();if(!m)return '<p>No surfaces in this shared layout.</p>';state.marker=m.id;const path='surfaces.'+m.id;const objects=[...new Set((episode().frames.find(f=>f.id===m.anchor_frame)?.objects||[]).map(o=>o.name))];
    return `<h2>Marked surfaces</h2><p class="panel-intro">Each point is one physical surface shared across views. Identify its visible material and treatment, not only the broad object category.</p><div class="pill-list">${markers().map((item,index)=>`<button data-select-marker="${esc(item.id)}" class="${item.id===m.id?'active':''}" aria-label="Surface ${esc(item.id)}"><span class="point-index ${item.id===m.id?'selected':''}">${esc(item.id)}</span>${esc(item.id)}</button>`).join('')}</div><div class="section-head"><h3>Surface ${esc(m.id)}</h3><button data-jump-frame="${esc(m.anchor_frame)}" class="quiet small-button">Go to anchor ${esc(m.anchor_frame.slice(1))} ↗</button></div>${freeField(path+'.object_name','Object / surface name',objects)}${freeField(path+'.material','Visible surface material',materialSuggestions(m))}${hierarchyField(path+'.hierarchy_id')}<div class="field-grid">${SURFACE.map(([key,label,type])=>selectField(path+'.'+key,label,type)).join('')}</div>${record().answers.surfaces[m.id].substrate_known==='yes'?`<div class="helper">A surface coating is not the bulk substrate. Name the underlying material only when you can support it; do not copy a visible finish automatically.</div>${freeField(path+'.substrate_material','Underlying / bulk substrate material',materialSuggestions(m))}${hierarchyField(path+'.substrate_hierarchy_id','Underlying substrate hierarchy match')}`:''}<hr class="section-divider"><h3>Can exposure reach this exact surface?</h3><p class="small muted">Assume the named source is present. Follow the stated direction through the boundary; do not infer actual weather or temperature from the photograph.</p>${conditionHelp()}${layoutEpisode().directions.map(d=>`<div class="direction-summary"><strong>${d.id.toUpperCase()}</strong> ${esc(d.text)} <button type="button" data-jump-frame="${esc(d.reference_frame)}" class="quiet small-button">Reference ↗</button></div>${matrix(path+'.reachable.'+d.id,[['sun','Direct sunlight'],['rain','Rain']])}`).join('')}<hr class="section-divider"><h3>Surface visibility, frame by frame</h3><p class="small muted">Direct and through-glass sightings count as different evidence. A reflection is not a direct sighting; an absent projected point does not establish absence.</p>${visibilityBatch(path+'.visibility')}${surfaceVisibility(m)}${notesField(path+'.notes','Surface notes')}`;
  }
  function renderPathways(){return `<h2>Boundary transfer pathways</h2><p class="panel-intro">For each stated direction, can this channel cross the boundary? These are qualitative judgments, not measured flux, temperature, or airflow.</p><div class="helper"><strong>Fully open:</strong> existing closure fully open; other permanent obstructions stay.<br><strong>Sealed as built:</strong> existing closure shut, intact, and tightly sealed, without changing its material or glazing. Do not invent a new panel for an open passage.<br>Clear glass can transmit direct sun. Intact sealed glass blocks rain. Diffuse light is not the same as direct sun.</div>${conditionHelp()}${layoutEpisode().directions.map(d=>`<div class="direction-summary"><strong>${d.id.toUpperCase()}</strong> ${esc(d.text)} <button type="button" data-jump-frame="${esc(d.reference_frame)}" class="quiet small-button">Reference ↗</button></div>${matrix('pathways.'+d.id,[['direct_sun','Direct sunlight'],['diffuse_light','Diffuse light'],['air','Air'],['rain','Rain']])}`).join('')}<p class="protocol-note">Do not change observed door state to match the hypothetical case. If ray direction, occlusion, or material evidence is insufficient, choose Not determinable.</p>`;}
  function visibilityBatch(path){return `<div class="batch-tools"><select id="batchVisibility" aria-label="Visibility label for blank rows">${optionHTML(Core.FIELDS.visibility,null)}</select><button data-batch-visibility="${esc(path)}" ${locked()?'disabled':''}>Apply to blank rows…</button></div>`;}
  function surfaceVisibility(m){return `<div class="table-wrap"><table class="answer-table visibility-table"><thead><tr><th>Frame</th><th>Visible as</th><th>Point position</th></tr></thead><tbody>${episode().frames.map((f,i)=>`<tr class="${i===state.frame?'current':''}"><td class="frame-cell"><button data-jump-frame="${esc(f.id)}">${pad(f.index)} ↗</button></td><td><select data-answer="surfaces.${esc(m.id)}.visibility.${esc(f.id)}" aria-label="${esc(m.id)} visibility frame ${f.index}" ${locked()?'disabled':''}>${optionHTML(Core.FIELDS.visibility,record().answers.surfaces[m.id].visibility[f.id])}</select></td><td class="small muted">${positionInFrame(m,f.id)?'Available':'No position'}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderVisibility(){return `<h2>Boundary visibility certificate</h2><p class="panel-intro">Check all 12 frames against the <strong>same boundary object</strong>. A large machine mask does not prove the pane or door leaf is visible.</p><div class="helper">“Object match” asks whether the proposed instance/mask identifies that boundary in this frame. “Box correct” asks whether the shared box is correct. If no box exists or it cannot be judged, choose Not determinable and explain.</div>${visibilityBatch('boundary_visibility')}<div class="table-wrap"><table class="answer-table visibility-table"><thead><tr><th>Frame</th><th>Visible as</th><th>Object match</th><th>Box correct</th></tr></thead><tbody>${episode().frames.map((f,i)=>{const item=record().answers.boundary_visibility[f.id];return `<tr class="${i===state.frame?'current':''}"><td class="frame-cell"><button data-jump-frame="${esc(f.id)}">${pad(f.index)} ↗</button></td>${[['visibility',Core.FIELDS.visibility],['object_match',Core.FIELDS.yes_no],['box_correct',Core.FIELDS.yes_no]].map(([key,opts])=>`<td><select data-answer="boundary_visibility.${esc(f.id)}.${key}" aria-label="Boundary ${human(key)} frame ${f.index}" ${locked()?'disabled':''}>${optionHTML(opts,item[key])}</select></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>${notesField('boundary_visibility.'+frame().id+'.notes',`Boundary visibility notes — frame ${pad(frame().index)}`)}<p class="small muted">Surface-specific visibility is entered in the Surfaces tab. Reflective appearances must be distinguished from through-glass and direct sightings.</p>`;}
  function countAnswers(value){let total=0,answered=0,nd=0;function walk(v,key,parent){if(key==='notes')return;if(['substrate_material','substrate_hierarchy_id'].includes(key)&&parent?.substrate_known!=='yes')return;if(v&&typeof v==='object'){Object.entries(v).forEach(([k,x])=>walk(x,k,v));return;}total++;if(v!==null&&v!==''){answered++;if(v===Core.ND)nd++;}}walk(value,'',null);return {total,answered,nd};}
  function renderReview(){const stats=countAnswers(record().answers);const errors=Core.validateEpisode(record(),layoutEpisode(),state.catalogue);return `<h2>Review & complete</h2><p class="panel-intro">A complete record contains all human judgments, including explicit uncertainty. Completion locks it until you deliberately reopen it.</p><div class="checklist-stats"><div><strong>${stats.answered} / ${stats.total}</strong><span>Required answers filled</span></div><div><strong>${stats.nd}</strong><span>Not-determinable judgments</span></div></div>${notesField('notes','Episode notes & uncertainty rationale (required if any answer is Not determinable)')}<p class="small muted">State why evidence is insufficient, which surfaces / frames are affected, and any interpretation of the two directions. Do not turn uncertainty into a negative answer.</p>${errors.length?`<ul class="issue-list">${errors.slice(0,14).map(e=>`<li>${esc(e.replace('episode.'+episode().id+'.answers.',''))}</li>`).join('')}${errors.length>14?`<li>… ${errors.length-14} additional missing / invalid answers.</li>`:''}</ul>`:'<div class="locked-note">All required judgments are present. This is completeness, not proof of physical correctness.</div>'}<div class="form-actions">${record().status==='complete'?'<button data-action="reopen" class="secondary">Reopen episode</button>':`<button data-action="complete" class="primary" ${locked()?'disabled':''}>Complete & lock episode</button><button data-action="fill-nd" ${locked()?'disabled':''}>Mark remaining Not determinable…</button>`}</div><p class="protocol-note">Final export requires every included episode complete or explicitly excluded. Family C remains disabled until the reviewed VHC allowed-pairs table is frozen; human material names do not automatically establish all physical properties.</p><div class="danger-zone"><h3>Episode cannot be used?</h3><button data-action="exclude" class="danger" ${locked()?'disabled':''}>Exclude with a reason</button></div>`;}
  function updateAnswer(path,value){if(state.role!=='annotator'||locked())return;setPath(record().answers,path,value);changed(false);}
  function place(kind,id=null){if(!editable()||state.role!=='coordinator')return;stopPlay();state.placement={kind,id};state.boxStart=null;renderGeometry();$('imageStage').focus();}
  function action(name){
    if(name==='reopen'){if(state.conflict)return;if(layoutEpisode().disposition==='exclude'){toast('This episode is excluded by the shared layout.');return;}if(!confirm('Reopen this record for editing? It will no longer count as complete.'))return;record().status='in_progress';record().completed_at=null;record().exclusion_reason='';state.doc.annotation_status='draft';save();render();return;}
    if(state.conflict)return;
    if(name==='include'&&state.role==='coordinator'){layoutEpisode().disposition='include';layoutEpisode().exclusion_reason='';changed(true);render();return;}
    if(locked())return;
    if(name==='add-point'){place('add');return;}
    if(name==='move-point'){place('move');return;}
    if(name==='draw-box'){place('box');return;}
    if(name==='cancel-placement'){state.placement=null;state.boxStart=null;renderGeometry();return;}
    if(name==='remove-observation'){const m=selectedMarker();if(m&&m.anchor_frame!==frame().id){m.observations=m.observations.filter(o=>o.frame_id!==frame().id);changed(true);renderPanel();renderGeometry();}return;}
    if(name==='delete-point'){const m=selectedMarker();if(m&&confirm(`Delete ${m.id} and all its cross-frame positions from the shared layout?`)){layoutEpisode().markers=markers().filter(item=>item.id!==m.id);state.marker=null;changed(true);renderPanel();renderGeometry();}return;}
    if(name==='exclude'){const reason=prompt('Why is this episode unsuitable? A nonempty reason is required.');if(!reason?.trim())return;if(state.role==='coordinator'){layoutEpisode().disposition='exclude';layoutEpisode().exclusion_reason=reason.trim();changed(true);}else{record().status='excluded';record().exclusion_reason=reason.trim();record().completed_at=null;state.doc.annotation_status='draft';save();}render();return;}
    if(name==='complete'){const candidate=Core.clone(record());candidate.status='complete';candidate.completed_at=now();const errors=Core.validateEpisode(candidate,layoutEpisode(),state.catalogue);if(errors.length){issues('This episode is not complete',errors);return;}Object.assign(record(),candidate);save();render();toast('Episode complete and locked.');return;}
    if(name==='fill-nd'){
      const count=countAnswers(record().answers);if(count.total===count.answered){toast('No unanswered fields remain.');return;}
      const reason=prompt(`This will mark ${count.total-count.answered} unanswered fields in this episode as Not determinable. Use it only after reviewing the evidence. Explain why these remaining judgments cannot be made:`);
      if(!reason?.trim())return;if(!confirm('Apply Not determinable to all remaining blank human judgments in THIS episode? Existing answers stay unchanged.'))return;
      const fill=value=>Object.keys(value).forEach(key=>{if(key==='notes'||['substrate_material','substrate_hierarchy_id'].includes(key)&&value.substrate_known!=='yes')return;if(value[key]===null)value[key]=Core.ND;else if(value[key]&&typeof value[key]==='object')fill(value[key]);});fill(record().answers);record().answers.notes+=(record().answers.notes?'\n':'')+'Remaining judgments not determinable: '+reason.trim();changed(false);renderPanel();toast('Remaining blanks marked with your uncertainty rationale.');
    }
  }
  function bind(){
    $('setupForm').addEventListener('submit',start);$('roleSelect').addEventListener('change',roleHelp);
    ['welcomeImport','importButton'].forEach(id=>$(id).addEventListener('click',()=>{$('importFile').value='';$('importFile').click();}));
    $('importFile').addEventListener('change',e=>importFile(e.target.files[0]));
    $('draftExport').addEventListener('click',()=>exportDraft());$('recoveryExport').addEventListener('click',()=>exportDraft(true));$('finalExport').addEventListener('click',exportFinal);
    $('changeSession').addEventListener('click',()=>{if(confirm('Leave this workspace? Saved drafts remain in this browser; export a backup if needed.'))clearSession();});
    $('reloadLatest').addEventListener('click',()=>{if(!confirm('Discard this tab’s in-memory version and load the latest saved version? Export a recovery copy first.'))return;const stored=readStored(state.key);if(!stored){message('No saved draft','The saved draft is missing. Export this tab’s recovery copy.');return;}const errors=state.role==='coordinator'?Core.validateLayoutDraft(stored.data,state.dataset):Core.validateExport(stored.data,state.dataset,state.catalogue,false);if(errors.length){issues('Saved draft rejected',errors);return;}state.revision=stored.revision;state.conflict=false;if(state.role==='coordinator')state.layout=stored.data;else{state.doc=stored.data;state.layout=state.doc.layout;}$('conflictBanner').classList.add('hidden');$('saveStatus').textContent='Loaded latest saved draft';render();});
    $('searchEpisodes').addEventListener('input',e=>{state.search=e.target.value;renderNavigation();});$('episodeFilter').addEventListener('change',e=>{state.filter=e.target.value;renderNavigation();});
    $('episodeList').addEventListener('click',e=>{const b=e.target.closest('[data-episode]');if(b)changeEpisode(Number(b.dataset.episode));});
    $('prevEpisode').addEventListener('click',()=>changeEpisode(state.episode-1));$('nextEpisode').addEventListener('click',()=>changeEpisode(state.episode+1));$('nextIncomplete').addEventListener('click',nextIncomplete);
    $('prevFrame').addEventListener('click',()=>changeFrame(state.frame-1));$('nextFrame').addEventListener('click',()=>changeFrame(state.frame+1));$('playButton').addEventListener('click',play);$('playSpeed').addEventListener('change',()=>{if(state.playing){stopPlay();play();}});
    $('filmstrip').addEventListener('click',e=>{const b=e.target.closest('[data-frame]');if(b){stopPlay();changeFrame(Number(b.dataset.frame));}});
    $('imageStage').addEventListener('click',stageClick);
    ['showMarkers','showBoxes'].forEach(id=>$(id).addEventListener('change',renderGeometry));
    ['showMask','showHints'].forEach(id=>$(id).addEventListener('change',e=>{if(state.doc&&!state.conflict){state.doc.hint_usage=state.doc.hint_usage||[];state.doc.hint_usage.push({at:now(),episode_id:episode().id,frame_id:frame().id,hint:id,enabled:e.target.checked});save();}if(id==='showMask')$('maskImage').classList.toggle('hidden',!e.target.checked||!frame().boundary_mask);else renderHints();}));
    $('taskTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;state.placement=null;state.boxStart=null;renderTabs();renderPanel();renderGeometry();}});
    $('taskTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const tabs=state.role==='coordinator'?coordinatorTabs:annotatorTabs;let index=tabs.findIndex(t=>t[0]===state.tab);index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;state.tab=tabs[index][0];state.placement=null;state.boxStart=null;renderTabs();renderPanel();renderGeometry();$('tab-'+state.tab).focus();});
    $('panelContent').addEventListener('input',e=>{const el=e.target;if(el.dataset.answer&&el.tagName!=='SELECT'){updateAnswer(el.dataset.answer,el.dataset.answer==='notes'||el.dataset.answer.endsWith('.notes')?el.value:el.value.trim()?el.value:null);}else if(el.dataset.directionText&&state.role==='coordinator'&&editable()){layoutEpisode().directions.find(d=>d.id===el.dataset.directionText).text=el.value;changed(true);}else if(el.hasAttribute('data-layout-notes')&&state.role==='coordinator'&&editable()){layoutEpisode().setup_notes=el.value;changed(true,false);}});
    $('panelContent').addEventListener('change',e=>{
      const el=e.target;
      if(el.dataset.answer&&el.tagName==='SELECT'){updateAnswer(el.dataset.answer,el.value||null);if(el.dataset.answer.endsWith('.hierarchy_id')||el.dataset.answer.endsWith('.substrate_hierarchy_id')||el.dataset.answer.endsWith('.substrate_known'))renderPanel();}
      if(el.id==='setupReviewed'&&state.role==='coordinator'&&editable()){layoutEpisode().setup_reviewed=el.checked;changed(true,false);renderPanel();}
    });
    $('panelContent').addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.action){action(b.dataset.action);return;}
      if(b.dataset.tab){state.tab=b.dataset.tab;renderTabs();renderPanel();return;}
      if(b.dataset.selectMarker){state.marker=b.dataset.selectMarker;renderPanel();renderGeometry();return;}
      if(b.dataset.jumpFrame){stopPlay();const i=episode().frames.findIndex(f=>f.id===b.dataset.jumpFrame);changeFrame(i);return;}
      if(b.dataset.placeDirection){place('direction',b.dataset.placeDirection);return;}
      if(b.dataset.nd&&!locked()){const path=b.dataset.nd;updateAnswer(path,getPath(record().answers,path)===Core.ND?null:Core.ND);renderPanel();return;}
      if(b.dataset.deleteObservation&&state.role==='coordinator'&&editable()){const m=selectedMarker();m.observations=m.observations.filter(o=>o.frame_id!==b.dataset.deleteObservation);changed(true);renderPanel();renderGeometry();return;}
      if(b.dataset.deleteBox&&state.role==='coordinator'&&editable()){layoutEpisode().boundary_boxes=layoutEpisode().boundary_boxes.filter(box=>box.frame_id!==b.dataset.deleteBox);changed(true);renderPanel();renderGeometry();return;}
      if(b.dataset.batchVisibility&&!locked()){
        const value=$('batchVisibility').value;if(!value){toast('Choose an explicit visibility judgment first.');return;}
        if(!confirm(`Apply “${human(value)}” only to blank visibility rows for ${b.dataset.batchVisibility==='boundary_visibility'?'this boundary':'this one surface'}? It does not fill object-match or box-correctness judgments.`))return;
        const target=getPath(record().answers,b.dataset.batchVisibility);for(const key of Object.keys(target)){if(b.dataset.batchVisibility==='boundary_visibility'){if(target[key].visibility===null)target[key].visibility=value;}else if(target[key]===null)target[key]=value;}
        changed(false);renderPanel();
      }
    });
    $('cleanPreview').addEventListener('click',()=>{stopPlay();renderPreview();$('previewDialog').showModal();});$('closePreview').addEventListener('click',()=>$('previewDialog').close());$('previewPrev').addEventListener('click',()=>changeFrame(state.frame-1));$('previewNext').addEventListener('click',()=>changeFrame(state.frame+1));$('closeMessage').addEventListener('click',()=>$('messageDialog').close());
    document.addEventListener('keydown',e=>{if(!state.layout||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||$('messageDialog').open)return;if(e.key==='ArrowRight'){e.preventDefault();changeFrame(Math.min(11,state.frame+1));}if(e.key==='ArrowLeft'){e.preventDefault();changeFrame(Math.max(0,state.frame-1));}if(e.key==='Escape'){state.placement=null;state.boxStart=null;renderGeometry();}if(e.key===' '&&!$('previewDialog').open&&e.target===document.body){e.preventDefault();play();}});
    window.addEventListener('storage',event=>{if(event.key===state.key){if(!event.newValue){lockConflict();return;}try{const next=JSON.parse(event.newValue);if(next.revision!==state.revision&&next.owner!==tabId)lockConflict();}catch{lockConflict();}}});
    window.addEventListener('beforeunload',e=>{if(state.dirty||state.conflict){e.preventDefault();e.returnValue='';}});
  }
  async function init(){
    try{
      if(!Core)throw new Error('core.js is missing. Keep all site files together.');
      const responses=await Promise.all([fetch('dataset.json',{cache:'no-cache'}),fetch('catalogue.json',{cache:'no-cache'})]);
      if(responses.some(r=>!r.ok))throw new Error('Dataset or catalogue could not load. Serve this folder over HTTP and check that the data bundle is present.');
      [state.dataset,state.catalogue]=await Promise.all(responses.map(r=>r.json()));
      if(state.dataset.schema!=='blockmind_l2_dataset_v1'||state.catalogue.schema!=='blockmind_l2_catalogue_v1')throw new Error('Unexpected dataset / catalogue schema.');
      if(state.catalogue.build_id!==state.dataset.build_id)throw new Error('Dataset and catalogue builds differ.');
      $('buildBadge').textContent=`${state.dataset.episodes.length} episodes · 12 RGB frames each`;
      const houses=new Set(state.dataset.episodes.map(ep=>ep.scan_id)).size;
      $('datasetStats').innerHTML=`<div><strong>${state.dataset.episodes.length}</strong><span>screened episodes</span></div><div><strong>${houses}</strong><span>different houses</span></div><div><strong>12</strong><span>fixed frames / episode</span></div>`;
      bind();roleHelp();$('loading').classList.add('hidden');$('welcome').classList.remove('hidden');
      window.L2App=Object.freeze({getSnapshot:()=>Core.clone({role:state.role,identity:state.identity,episode:state.episode,frame:state.frame,frameReady:state.frameReady,tab:state.tab,layout:state.layout,doc:state.doc,storageKey:state.key,revision:state.revision,conflict:state.conflict,pending:state.pending}),getDataset:()=>Core.clone(state.dataset),getCatalogue:()=>Core.clone(state.catalogue),version:'1.0'});
    }catch(error){$('loading').classList.add('hidden');$('fatal').classList.remove('hidden');$('fatal').textContent=(error.message||String(error))+' If opened as a file, start a local HTTP server and open its localhost URL.';}
  }
  init();
})();
