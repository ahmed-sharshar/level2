/* Complete, independent annotation through a shared, immutable task package. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = window.L2Core, F = window.L2Full, G = window.L2Compact, R=window.L2Redpoints;
  const ND = C.ND;
  const names = {scene:'Scene',boundary:'Opening',surfaces:'Red points',exposure:'Sun & rain',pathways:'Through the opening',visibility:'Visibility',review:'Review & finish'};
  const order = Object.keys(names);
  const sectionHelp = {
    scene:'Watch the walk using Play, then describe the two spaces.',
    boundary:'Judge the single outlined door or opening used by this walk.',
    surfaces:'One short form per point. Select a reference material once to fill its name and category together; check the surface, finish and shelter here.',
    exposure:'Four scenarios, not a separate page for every answer. In each scenario, check sunlight and rain for the marked surfaces. Show each point before judging it.',
    pathways:'For each scenario, tick everything you think can pass. This is a consistency check, not the benchmark answer.',
    visibility:'Check the door sightings, then select the after-crossing images where each indoor surface is still visible. A reflection is different from a direct view.'
  };
  const state = {dataset:null,catalogue:null,tasks:null,measurements:null,doc:null,identity:'',episode:0,section:'scene',question:0,frame:0,
    key:'',revision:0,conflict:false,imageReady:false,loadingToken:0,player:null,pending:null,migration:null,reference:false,focusMarker:null,materialSearches:{},taskUpdate:null,taskCheckBusy:false};
  const timing={doc:null,index:0,lastTick:0,lastInteraction:0,running:false},IDLE_MS=60000;
  const automaticJobs=new WeakMap();
  const owner = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now())+Math.random();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const ep = () => state.dataset.episodes[state.episode];
  const layout = () => state.doc.tasks.layout.episodes[state.episode];
  const record = () => state.doc.episodes[state.episode];
  const frame = () => ep().frames[state.frame];
  const get = (object,path) => path.split('.').reduce((v,k)=>v==null?null:v[k],object);
  const answered = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value)||value.length>0);
  const uncertain = value => value===ND || Array.isArray(value)&&value.includes(ND);
  const basePath = encodeURIComponent(new URL('.',location.href).pathname);
  const scopeKey = (identity,taskId=state.tasks.task_id) => 'blockmind-l2-full:'+basePath+':'+state.dataset.build_id+':'+taskId+':'+encodeURIComponent(identity);
  const allQuestions = () => F.questions(state.doc,state.episode,state.dataset,state.catalogue);
  const collectionReady = () => F.episodeCollectionReady(state.doc.tasks,state.episode,state.dataset,state.catalogue);
  const sectionQuestions = () => allQuestions().filter(q=>q.section===state.section);
  const allPanels = () => G.panels(state.doc,state.episode,state.dataset,state.catalogue);
  const sectionPanels = () => allPanels().filter(p=>p.section===state.section);
  const panel = () => sectionPanels()[state.question] || null;
  const question = () => {const p=panel();return p&&(p.questions.find(q=>q.marker_id===state.focusMarker)||p.questions[0])||null;};
  const readOnly = () => state.conflict || !!state.taskUpdate || ['complete','excluded'].includes(record().status);
  const materialLabel = m => G.canonicalMaterial(m);
  const safeIdentity = value => typeof value==='string' && value.trim() && value.trim().length<=80;
  const needsRedo = path => F.answerStatus(state.doc,state.episode,path).state==='needs_reanswer';
  const answerValue = path => needsRedo(path)?null:get(record(),path);
  const panelComplete = p => !p.blocked&&p.questions.every(q=>!q.blocked&&answered(answerValue(q.path)));
  const unitName = section => section==='surfaces'?'points':(['exposure','pathways'].includes(section)?'scenarios':'checks');
  function sectionProgress(section) {const list=allPanels().filter(p=>p.section===section);return {answered:list.filter(panelComplete).length,total:list.length};}
  function savedCursor() {const q=question(),i=q?sectionQuestions().findIndex(v=>v.path===q.path):0;return {episode:state.episode,section:state.section,question:Math.max(0,i),frame:state.frame};}

  // Active annotation time only: focused, visible, editable scenes, with a
  // 60-second inactivity cap. No offline/reload duration is ever reconstructed.
  // The normal draft revision check runs before a tick is persisted, so a
  // conflicting tab cannot append time to another tab's newer draft.
  function timingEligible() {
    return !!state.doc&&!state.conflict&&!state.taskUpdate&&!document.hidden&&document.hasFocus()&&
      !['complete','excluded'].includes(record().status)&&!$('workspace').classList.contains('hidden');
  }
  function timingRecord() {
    const entry=timing.doc?.episodes[timing.index];if(!entry)return null;
    if(!entry.time_tracking)entry.time_tracking={version:1,active_ms:0,first_started_at:null,last_active_at:null,tracking_started_at:null,prior_time_unavailable:true};
    return entry.time_tracking;
  }
  function timingTick() {
    const now=performance.now();
    if(timing.doc===state.doc&&timing.index===state.episode&&timing.running){
      const end=Math.min(now,timing.lastInteraction+IDLE_MS),elapsed=Math.max(0,Math.floor(end-timing.lastTick));
      if(elapsed){const t=timingRecord(),endedAt=new Date(Date.now()-(now-end)).toISOString();
        if(!t.tracking_started_at)t.tracking_started_at=new Date(Date.now()-(now-timing.lastTick)).toISOString();
        if(!t.first_started_at)t.first_started_at=t.tracking_started_at;
        t.active_ms+=elapsed;t.last_active_at=endedAt;
      }
    }
    timing.lastTick=now;timing.running=timingEligible()&&now-timing.lastInteraction<IDLE_MS;
    renderTiming();
  }
  function resetTiming(active=false) {
    timing.doc=state.doc;timing.index=state.episode;timing.lastTick=performance.now();
    timing.lastInteraction=active?timing.lastTick:-Infinity;timing.running=active&&timingEligible();
    renderTiming();
  }
  function noteInteraction() {
    if(!state.doc||state.conflict||state.taskUpdate)return;
    timingTick();timing.lastInteraction=performance.now();timing.running=timingEligible();
  }
  function renderTiming() {
    const target=$('sceneTiming');if(!target||!state.doc)return;
    const t=record().time_tracking,seconds=Math.floor((t?.active_ms||0)/1000);
    target.textContent='Active time: '+Math.floor(seconds/60)+'m '+String(seconds%60).padStart(2,'0')+'s'+(t?.prior_time_unavailable?' · earlier time unavailable':'');
    target.title='Focused, visible annotation time. Pauses when you leave this tab, finish a scene, or are inactive for 60 seconds. Historical time is never guessed.';
  }

  function storageRead(key) {
    let raw;try {raw=localStorage.getItem(key);} catch (_) {return {unavailable:true};}
    if(raw===null)return {empty:true};
    try {const env=JSON.parse(raw);if(!env||env.schema!=='blockmind_l2_full_local_v1'||!Number.isInteger(env.revision)||env.revision<1||typeof env.owner!=='string'||!env.data)return {invalid:true,raw};return {env,raw};}
    catch (_) {return {invalid:true,raw};}
  }
  function showMessage(title,text) {$('messageTitle').textContent=title;$('messageText').textContent=text;$('messageDialog').showModal();}
  function toast(text) {$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}
  function lock(malformed=false) {
    timing.running=false;
    state.conflict=true;stopPlay();$('conflictTitle').textContent=malformed?'The saved draft could not be read safely.':'This draft changed in another tab.';
    $('rawRecovery').classList.toggle('hidden',!malformed);$('conflictBanner').classList.remove('hidden');$('workspace').classList.add('locked');$('saveStatus').textContent='Paused — please recover your draft';renderPanel();
  }
  function save() {
    if(!state.doc||state.conflict)return false;
    if(state.doc.automatic_surface_labels)state.doc.surface_label_audit=R.buildSurfaceLabelAudit(state.doc,state.dataset,state.catalogue);
    state.doc.ui=savedCursor();
    state.doc.updated_at=new Date().toISOString();
    const current=storageRead(state.key);
    if(current.invalid){lock(true);return false;}
    if(current.env&&current.env.revision!==state.revision){lock();return false;}
    timingTick();
    const revision=state.revision+1;
    try {localStorage.setItem(state.key,JSON.stringify({schema:'blockmind_l2_full_local_v1',revision,owner,data:state.doc}));state.revision=revision;$('storageWarning').classList.add('hidden');$('saveStatus').textContent='Saved in this browser';return true;}
    catch (_) {$('storageWarning').classList.remove('hidden');$('saveStatus').textContent='Download to save your draft';return false;}
  }
  function changed() {
    record().status='in_progress';record().completed_at=null;state.doc.annotation_status='draft';state.doc.benchmark_ready=false;save();renderNavigation();updateProgress();
  }
  function primeAutomaticLabels(doc) {
    if(!automaticJobs.has(doc))automaticJobs.set(doc,window.L2InstanceLabels.collect(doc.tasks,state.dataset,state.catalogue).then(labels=>{
      doc.automatic_surface_labels=labels;doc.surface_label_audit=R.buildSurfaceLabelAudit(doc,state.dataset,state.catalogue);
      if(state.doc===doc){save();refreshAutomaticLabel();}
      return labels;
    }));
    return automaticJobs.get(doc);
  }
  function automaticLabelHTML(markerId) {
    const row=state.doc.automatic_surface_labels?.find(row=>row.episode_id===ep().id&&row.marker_id===markerId);
    return row?.status==='sampled'?esc(row.mpcat40_name||'Unknown category')+' (mpcat40 '+esc(row.mpcat40_id)+', instance '+esc(row.object_id)+')':row?'Unavailable: '+esc(row.status.replace(/_/g,' ')):'Reading the anchor instance mask…';
  }
  function refreshAutomaticLabel() {
    const target=$('automaticPointLabel');if(target)target.innerHTML=automaticLabelHTML(target.dataset.markerId);
  }
  function acceptDoc(doc,stored) {
    let upgraded=false,collectionUpgraded=false,provenanceUpgraded=false;
    if(F.needsBoundaryUpgrade(doc)) {
      const oldQuestion=F.questions(doc,doc.ui.episode,state.dataset,state.catalogue).filter(q=>q.section===doc.ui.section)[doc.ui.question];
      // Preserve the exact old browser document before an additive upgrade.
      // If storage is full/unavailable, stop instead of overwriting its only copy.
      if(stored&&stored.env) {
        try {
          const raw=stored.raw||JSON.stringify(stored.env),archiveKey=scopeKey(doc.annotator,doc.task_id)+':before-boundary-v1:'+C.sha256(raw);
          if(localStorage.getItem(archiveKey)===null)localStorage.setItem(archiveKey,raw);
        } catch(_) {showMessage('Download your existing draft first','There is not enough browser storage to preserve the original before adding the new opening questions. Export or back up the existing draft before continuing. No saved answers were changed.');return;}
      }
      doc=F.upgradeBoundary(doc,state.dataset,state.catalogue).doc;upgraded=true;
      if(oldQuestion){const at=F.questions(doc,doc.ui.episode,state.dataset,state.catalogue).filter(q=>q.section===doc.ui.section).findIndex(q=>q.path===oldQuestion.path);if(at>=0)doc.ui.question=at;}
    }
    if(F.needsCollectionUpgrade(doc)){
      const oldQuestion=F.questions(doc,doc.ui.episode,state.dataset,state.catalogue).filter(q=>q.section===doc.ui.section)[doc.ui.question];
      if(stored&&stored.env){try{
        const raw=stored.raw||JSON.stringify(stored.env),archiveKey=scopeKey(doc.annotator,doc.task_id)+':before-collection-checks-v1:'+C.sha256(raw);
        if(localStorage.getItem(archiveKey)===null)localStorage.setItem(archiveKey,raw);
      }catch(_){showMessage('Download your existing draft first','The original could not be backed up in browser storage. Download it before upgrading the opening checks and indoor-point visibility questions. No saved answers were overwritten.');return;}}
      doc=F.upgradeCollection(doc,state.dataset,state.catalogue).doc;collectionUpgraded=true;
      if(oldQuestion){const at=F.questions(doc,doc.ui.episode,state.dataset,state.catalogue).filter(q=>q.section===doc.ui.section).findIndex(q=>q.path===oldQuestion.path);doc.ui.question=Math.max(0,at);}
    }
    if(F.needsProvenanceUpgrade(doc)){
      if(stored&&stored.env){try{
        const raw=stored.raw||JSON.stringify(stored.env),archiveKey=scopeKey(doc.annotator,doc.task_id)+':before-direction-provenance-v1:'+C.sha256(raw);
        if(localStorage.getItem(archiveKey)===null)localStorage.setItem(archiveKey,raw);
      }catch(_){showMessage('Download your existing draft first','The original draft could not be backed up before adding direction versions and timing. Download it before continuing. No saved answers were overwritten.');return;}}
      doc=F.upgradeProvenance(doc,state.dataset,state.catalogue,doc.annotator).doc;provenanceUpgraded=true;
    }
    F.reconcileProvenance(doc);
    state.doc=doc;state.identity=doc.annotator;state.key=scopeKey(doc.annotator,doc.task_id);state.revision=stored&&stored.env?stored.env.revision:0;
    state.conflict=false;state.episode=Math.min(Math.max(0,doc.ui.episode||0),doc.episodes.length-1);state.section=order.includes(doc.ui.section)?doc.ui.section:'scene';state.question=Math.max(0,doc.ui.question||0);state.frame=Math.min(11,Math.max(0,doc.ui.frame||0));
    const legacyQuestion=sectionQuestions()[state.question];state.question=Math.max(0,sectionPanels().findIndex(p=>p.questions.some(q=>q.path===legacyQuestion?.path)));
    state.reference=false;state.focusMarker=legacyQuestion?.marker_id||null;$('conflictBanner').classList.add('hidden');$('workspace').classList.remove('locked');$('welcome').classList.add('hidden');$('workspace').classList.remove('hidden');$('identityLabel').textContent=doc.annotator;$('profileSelect').value=doc.profile;
    resetTiming(true);renderScenes();renderAll();save();primeAutomaticLabels(doc);
    if(provenanceUpgraded)toast('Original draft backed up. Direction versions are now tracked; earlier untracked time remains unavailable.');
    else if(collectionUpgraded)toast('Previous answers preserved. New opening consistency checks and indoor visibility questions need your own selections.');
    else if(upgraded)toast('Previous answers preserved. Width and blockage are new blank questions; completed scenes need these two checks.');
  }
  function start(event) {
    event.preventDefault();$('welcomeError').textContent='';const identity=$('identityInput').value.trim();
    if(state.taskUpdate){$('welcomeError').textContent='The published task package changed. Reload this page before starting or resuming.';return;}
    if(!safeIdentity(identity)){$('welcomeError').textContent='Please enter a name or short annotator ID.';return;}
    if(state.pending&&state.pending.annotator!==identity){$('welcomeError').textContent='Use the annotator name from your backup: '+state.pending.annotator;return;}
    const existing=storageRead(scopeKey(identity));
    if(existing.invalid){$('welcomeError').textContent='A saved draft exists but cannot be read. It has not been overwritten. Restore a downloaded backup under a new recovery name, or ask the researcher to recover browser storage.';return;}
    if(existing.env){const errors=F.validate(existing.env.data,state.dataset,state.catalogue);if(errors.length||existing.env.data.annotator!==identity||existing.env.data.task_id!==state.tasks.task_id){$('welcomeError').textContent='The saved draft needs recovery and has not been overwritten. Please download/recover it before continuing.';return;}}
    if(state.pending&&existing.env&&!confirm('Replace the browser draft for this name with the imported answers? Download your existing draft first if you want to keep both.'))return;
    const checkOlder=!state.pending&&!existing.env;
    const doc=state.pending||(existing.env&&existing.env.data)||F.create(state.dataset,state.catalogue,state.tasks,identity,'l2');state.pending=null;acceptDoc(doc,existing);
    if(checkOlder){const older=findOlderDrafts(identity);if(older.length)prepareImport(older[0]);}
  }
  function renderScenes() {
    $('sceneSelect').innerHTML=state.dataset.episodes.map((_,i)=>'<option value="'+i+'">Scene '+(i+1)+' of '+state.dataset.episodes.length+'</option>').join('');$('sceneSelect').value=String(state.episode);
  }
  function renderNavigation() {
    if(!state.doc)return;
    $('sections').innerHTML=order.map(s=>{const part=sectionProgress(s);return '<button data-section="'+s+'"'+(s===state.section?' aria-current="step"':'')+'>'+names[s]+(s!=='review'?'<span class="step-count">'+part.answered+' / '+part.total+' '+unitName(s)+'</span>':'<span class="step-count">Save or finish</span>')+'</button>';}).join('');
    const ready=collectionReady(),provisional=ready.ready&&state.doc.tasks.settings.collection_mode==='provisional'&&!F.episodeReady(state.doc.tasks,state.episode,state.dataset,state.catalogue).ready;
    $('setupNotice').classList.toggle('hidden',record().status==='excluded'||ready.ready&&!provisional);
    $('setupNotice').textContent=provisional?'Shared provisional directions · You can answer, save and finish. Research approval is still pending; completed labels are not benchmark ground truth.':'Shared scene preparation is incomplete. You can save basic facts now; the researcher must supply usable shared points and directions before these scenarios can be completed.';
    $('sceneSelect').value=String(state.episode);
  }
  function updateProgress() {
    if(!state.doc)return;const complete=state.doc.episodes.filter(e=>e.status==='complete').length,excluded=state.doc.episodes.filter(e=>e.status==='excluded').length;
    $('collectionProgress').textContent=complete+' / '+state.doc.episodes.length+' scenes complete'+(excluded?' · '+excluded+' excluded':'');
  }
  function renderAll() {renderNavigation();renderFilmstrip();renderFrame();renderPanel();updateProgress();renderTiming();}
  function renderFilmstrip() {
    $('filmstrip').innerHTML=ep().frames.map((f,i)=>'<button data-frame="'+i+'" aria-label="Show image '+(i+1)+'"'+(i===state.frame?' class="active"':'')+'><img src="'+esc(f.image)+'" alt="" loading="lazy"><span>'+(i+1)+'</span></button>').join('');
  }
  function renderFrame() {
    const f=frame(),token=++state.loadingToken;state.imageReady=false;$('pointOverlay').innerHTML='';$('imageLoading').textContent='Loading image…';$('imageLoading').classList.remove('hidden');$('frameLabel').textContent='Image '+(state.frame+1)+' of '+ep().frames.length;$('frameSlider').value=state.frame;$('imageStage').style.aspectRatio=f.width+' / '+f.height;
    $('sceneImage').onload=()=>{if(token!==state.loadingToken||!$('sceneImage').complete||$('sceneImage').currentSrc!==new URL(f.image,location.href).href)return;if($('sceneImage').naturalWidth!==f.width||$('sceneImage').naturalHeight!==f.height){$('imageLoading').textContent='Image size mismatch. Please report this frame before judging its point.';return;}state.imageReady=true;$('imageLoading').classList.add('hidden');renderOverlay();};
    $('sceneImage').onerror=()=>{if(token===state.loadingToken)$('imageLoading').textContent='This image could not load. Try another view or refresh.';};$('sceneImage').src=f.image;
    $('prevFrame').disabled=state.frame===0;$('nextFrame').disabled=state.frame===ep().frames.length-1;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',+b.dataset.frame===state.frame));
  }
  function markerName(m) {const same=layout().markers.filter(v=>v.side===m.side);return (m.side==='indoor'?'Inside':'Outside')+' point '+(same.findIndex(v=>v.id===m.id)+1);}
  function renderOverlay() {
    $('pointOverlay').innerHTML='';$('pointImageHint').textContent='';if(!state.imageReady)return;const q=question();if(!q)return;
    const m=layout().markers.find(v=>v.id===q.marker_id);
    if(state.reference&&q.direction){const d=q.direction;if(d.reference_frame===frame().id&&Number.isFinite(d.x)&&Number.isFinite(d.y)){
      // One stored feature anchor is not a physical travel vector. The arrow is
      // only a callout to that anchor; the reviewed words define incoming direction.
      const x=d.x*1000,y=d.y*800,tx=x+(x>500?-190:190),ty=y+(y>400?-100:100);
      $('pointOverlay').innerHTML='<defs><marker id="directionReferenceArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffdb56"/></marker></defs><g data-direction-reference="'+esc(d.id)+'"><line x1="'+tx+'" y1="'+ty+'" x2="'+x+'" y2="'+y+'" stroke="#ffdb56" stroke-width="5" marker-end="url(#directionReferenceArrow)"/><circle cx="'+x+'" cy="'+y+'" r="18" fill="none" stroke="#ffdb56" stroke-width="5"/><text x="'+tx+'" y="'+(ty+(y>400?-16:32))+'" text-anchor="'+(x>500?'end':'start')+'" fill="#ffdb56" stroke="#26343a" paint-order="stroke" stroke-width="3" font-size="24">Reference feature</text></g>';
      $('pointImageHint').textContent='Direction reference feature — not a travel vector';
    }return;}
    if(m){const p=m.anchor_frame===frame().id?m:(m.observations||[]).find(v=>v.frame_id===frame().id);if(p){$('pointOverlay').innerHTML='<circle cx="'+p.x*1000+'" cy="'+p.y*800+'" r="15" fill="none" stroke="white" stroke-width="3"/><circle cx="'+p.x*1000+'" cy="'+p.y*800+'" r="9" fill="#f02f35" stroke="white" stroke-width="2"/>';$('pointImageHint').textContent=markerName(m)+(m.anchor_frame===frame().id?'':' · check correspondence');}else $('pointImageHint').textContent='No point location supplied in this view';}
    else if(['boundary','pathways','visibility'].includes(q.section)){const b=layout().boundary_boxes.find(v=>v.frame_id===frame().id);if(b){$('pointOverlay').innerHTML='<rect x="'+b.x0*1000+'" y="'+b.y0*800+'" width="'+(b.x1-b.x0)*1000+'" height="'+(b.y1-b.y0)*800+'" fill="none" stroke="#ffdd63" stroke-width="4"/>';$('pointImageHint').textContent='Shared door / opening';}else $('pointImageHint').textContent='Opening has no shared outline in this view';}
  }
  function changeFrame(index) {state.frame=Math.max(0,Math.min(ep().frames.length-1,index));renderFrame();save();}
  function stopPlay() {clearInterval(state.player);state.player=null;$('playButton').textContent='▶ Play';}
  function togglePlay() {if(state.player){stopPlay();return;}state.reference=false;if(state.frame===11)changeFrame(0);$('playButton').textContent='Ⅱ Pause';state.player=setInterval(()=>{if(state.frame>=ep().frames.length-1){stopPlay();return;}changeFrame(state.frame+1);},1100);}
  function alignQuestion() {
    const q=question();if(!q)return;let id=q.frame_id;const m=layout().markers.find(v=>v.id===q.marker_id);if(!id&&m)id=m.anchor_frame;
    if(!id&&['boundary','pathways'].includes(q.section)&&layout().boundary_boxes.length)id=layout().boundary_boxes[0].frame_id;
    const index=ep().frames.findIndex(f=>f.id===id);if(index>=0)state.frame=index;
  }
  function goSection(section,path) {
    stopPlay();state.section=section;state.reference=false;state.focusMarker=null;const list=sectionPanels();const index=path?list.findIndex(p=>p.questions.some(q=>q.path===path)):-1;state.question=index>=0?index:0;if(path){const q=allQuestions().find(q=>q.path===path);state.focusMarker=q?.marker_id||null;}alignQuestion();renderAll();save();
  }
  function goScene(index) {stopPlay();if(!save()){$('sceneSelect').value=String(state.episode);return;}state.episode=Math.max(0,Math.min(state.doc.episodes.length-1,index));state.section='scene';state.question=0;state.frame=0;state.reference=false;state.focusMarker=null;resetTiming(true);renderAll();save();}
  function goQuestion(delta) {
    stopPlay();state.reference=false;state.focusMarker=null;const list=sectionPanels(),index=state.question+delta;
    if(index<0){const prev=order[Math.max(0,order.indexOf(state.section)-1)];goSection(prev);return;}
    if(index>=list.length){goSection(order[Math.min(order.length-1,order.indexOf(state.section)+1)]);return;}
    state.question=index;alignQuestion();renderAll();save();
  }
  function notesHTML() {return '<details class="optional"><summary>Add a note / explain uncertainty</summary><label class="field" for="sceneNotes">A short note for this scene<textarea id="sceneNotes" data-notes maxlength="8000"'+(readOnly()?' disabled':'')+' placeholder="For example: the point is hidden by glare; the panel material is unclear.">'+esc(record().answers.notes)+'</textarea></label><p class="quiet-note">One scene-level explanation is enough for “Not sure” answers. Flag an incorrect target here; shared points are corrected by the researcher, not moved independently.</p></details>';}
  function scenarioHTML(q) {
    if(!q.direction)return '';const d=q.direction,number=d.id==='d2'?2:1;
    return '<div class="scenario"><span class="scenario-condition">'+(q.condition==='sealed'?'Imagine: tightly closed / sealed':'Imagine: fully open')+'</span><p><strong>'+(q.section==='exposure'?'Incoming sun / rain — direction ':'Direction ')+number+':</strong> '+esc(d.text||'Awaiting researcher definition')+'</p><p>'+esc(q.condition_text||'')+'</p><button id="showReference" class="text-button"'+(q.blocked?' disabled':'')+'>Show the direction reference</button><p class="direction-reference-help">The arrow identifies the visible reference feature, not a simulated travel vector. Use the written direction above.'+(q.section==='exposure'?' Show point returns to the surface.':'')+'</p></div>';
  }
  function redoHTML(path) {
    return needsRedo(path)?'<small class="needs-redo" data-needs-redo="'+esc(path)+'">Needs redoing · direction or task version changed</small>':'';
  }
  function physicsRulesHTML(includeSlats=true) {
    return '<aside class="physics-rule" aria-label="Sun and rain rules"><p><strong>Clear glass:</strong> direct sunlight can pass through clear glass; rain cannot pass through intact closed glass.</p>'+(includeSlats?'<p><strong>Slats or lattice:</strong> for a point under this cover, choose <strong>Not sure for rain</strong> unless the stated scenario brings rain in <strong>sideways</strong>. For sideways rain, judge whether the path reaches the point—do not automatically choose Hit directly.</p>':'')+'<p>Use the stated scenario, not today’s weather. For an absent or unknown closure, choose Not sure in the sealed scenario.</p></aside>';
  }
  function suggestionList(q) {
    if(q.path.endsWith('.object_name'))return [...new Set(ep().frames.flatMap(f=>(f.objects||[]).map(o=>o.name)))].filter(v=>v&&!['unknown','void','misc'].includes(v)).sort();
    const m=q.marker_id&&record().answers.surfaces[q.marker_id],name=m?m.object_name:'door';const object=(state.catalogue.objects||[]).find(o=>o.name.toLowerCase()===String(name||'').toLowerCase());
    return object?(state.catalogue.suggestions_by_mpcat40[String(object.id)]||state.catalogue.all_material_suggestions):state.catalogue.all_material_suggestions;
  }
  function choicesHTML(q,value) {return '<div class="choices" role="group" aria-label="'+esc(q.title)+'">'+(q.options||[]).map(o=>'<button class="choice'+(o.value===value?' selected':'')+(o.value===ND?' uncertain':'')+'" data-value="'+esc(o.value)+'" aria-pressed="'+(o.value===value)+'"'+(readOnly()?' disabled':'')+'>'+esc(o.label)+'</button>').join('')+'</div>';}
  function multiSelectHTML(q){
    const value=answerValue(q.path),chosen=Array.isArray(value)?value:[],disabled=readOnly()||q.blocked?' disabled':'',visibility=q.path.startsWith('checks.indoor_visibility.');
    return redoHTML(q.path)+'<fieldset class="multi-select"'+disabled+'><legend>'+esc(visibility?'Select every image where you can still see this surface':'Select everything that can pass')+'</legend>'+q.options.map(o=>{
      const preview=visibility&&ep().frames.some(f=>f.id===o.value)?'<button type="button" class="text-button" data-preview-frame="'+esc(o.value)+'">View image '+(ep().frames.findIndex(f=>f.id===o.value)+1)+'</button>':'';
      return '<div class="multi-select-option"><label><input type="checkbox" data-multiselect-path="'+esc(q.path)+'" value="'+esc(o.value)+'"'+(chosen.includes(o.value)?' checked':'')+disabled+'><span>'+esc(o.label)+'</span></label>'+preview+'</div>';
    }).join('')+'</fieldset><p class="compact-help">You can select several '+(visibility?'images':'channels')+'. '+(visibility?'None':'Nothing')+' and Not sure are exclusive. Clearing every selection leaves this unanswered.</p>';
  }
  function textHTML(q,value) {
    const suggestions=suggestionList(q)||[];
    return '<label class="field" for="answerText">Your answer<input id="answerText" data-input list="answerSuggestions" maxlength="250" value="'+esc(value===ND?'':value)+'" placeholder="Choose a suggestion or type another answer"'+(readOnly()?' disabled':'')+'></label><datalist id="answerSuggestions">'+suggestions.map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist><p class="suggestion-note">Suggestions are choices, not labels. You can type any other material or object.</p><button class="choice uncertain'+(value===ND?' selected':'')+'" data-value="'+ND+'" aria-pressed="'+(value===ND)+'"'+(readOnly()?' disabled':'')+'>Not sure</button>';
  }
  function hierarchyHTML(q,value) {
    const found=state.catalogue.materials.find(m=>m.id===value),selected=found?materialLabel(found):value==='__other__'?'Other / no matching category':value===ND?'Not sure':'Nothing chosen yet';
    return '<label class="field" for="hierarchySearch">Find the matching material category<input id="hierarchySearch" type="search" placeholder="Search, e.g. wood, paint, glass"'+(readOnly()?' disabled':'')+'></label><p class="suggestion-note">Choose the category yourself. A material name does not automatically assign its physics class.</p><div id="hierarchyResults" class="hierarchy-results"></div><div class="hierarchy-special"><button data-hierarchy="__other__"'+(readOnly()?' disabled':'')+'>Other / no matching category</button><button data-hierarchy="'+ND+'"'+(readOnly()?' disabled':'')+'>Not sure</button></div><p class="selected-material">Chosen: <strong id="selectedHierarchy">'+esc(selected)+'</strong></p>';
  }
  function renderHierarchy(search='') {
    const root=$('hierarchyResults'),q=question();if(!root||!q)return;const value=get(record(),q.path),needle=search.trim().toLowerCase();
    const matches=G.searchMaterials(state.catalogue.materials,needle);
    root.innerHTML=matches.length?matches.map(m=>'<button data-hierarchy="'+esc(m.id)+'"'+(m.id===value?' class="selected"':'')+(readOnly()?' disabled':'')+'><span>'+esc(materialLabel(m))+'</span><small>'+esc(String(m.family||'').replace(/_/g,' '))+'</small></button>').join(''):'<p class="quiet-note">No matching category. Try a broader name, or choose Other.</p>';
  }
  function pointNavigation(q) {
    if(!q.marker_id)return '';const available=new Set(sectionPanels().map(p=>p.marker_id).filter(Boolean));return '<div class="point-picker" aria-label="Choose surface">'+layout().markers.filter(m=>available.has(m.id)).map(m=>'<button data-marker="'+esc(m.id)+'"'+(q.marker_id===m.id?' class="active"':'')+'>'+esc(markerName(m))+'</button>').join('')+'</div>';
  }
  function compactControl(q,label,extra='') {
    if(!q)return '';const value=answerValue(q.path),disabled=readOnly()||q.blocked?' disabled':'',id='field-'+q.path.replace(/[^a-zA-Z0-9_-]/g,'-');
    if(q.kind==='choice')return '<label class="compact-field" for="'+id+'"><span>'+esc(label||q.title)+'</span><select id="'+id+'" data-field="'+esc(q.path)+'"'+disabled+'><option value=""'+(!answered(value)?' selected':'')+'>Choose…</option>'+q.options.map(o=>'<option value="'+esc(o.value)+'"'+(o.value===value?' selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>'+redoHTML(q.path)+extra+'</label>';
    const suggestions=suggestionList(q)||[],listId=id+'-suggestions';
    return '<label class="compact-field" for="'+id+'"><span>'+esc(label||q.title)+'</span><input id="'+id+'" data-field="'+esc(q.path)+'" list="'+listId+'" maxlength="250" value="'+esc(value===ND?'':value)+'" placeholder="'+(value===ND?'Marked Not sure':'Choose or type')+'"'+disabled+'><datalist id="'+listId+'">'+suggestions.map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist><button type="button" class="field-uncertain text-button'+(value===ND?' active':'')+'" data-unknown-field="'+esc(q.path)+'"'+disabled+'>'+(value===ND?'✓ Not sure':'Not sure')+'</button>'+extra+'</label>';
  }
  function materialPairHTML(p,hierarchy,title) {
    if(!hierarchy)return '';const textPath=hierarchy.path.replace(/hierarchy_id$/,'material'),textQ=p.questions.find(q=>q.path===textPath),value=get(record(),hierarchy.path),disabled=readOnly()?' disabled':'',id='material-'+hierarchy.path.replace(/[^a-zA-Z0-9_-]/g,'-');
    const reference=state.catalogue.materials.find(m=>String(m.id)===value);
    const query=state.materialSearches[ep().id+'|'+hierarchy.path]||'',choices=materialOptions(hierarchy.path,query);
    return '<div class="material-group"><label class="compact-field" for="'+id+'-search"><span>Search the full reference hierarchy</span><input id="'+id+'-search" type="search" data-material-search="'+esc(hierarchy.path)+'" value="'+esc(query)+'" placeholder="Search name, family, ID or appearance"'+disabled+'></label><p class="compact-help" data-material-count="'+esc(hierarchy.path)+'" aria-live="polite">'+choices.count+'</p><label class="compact-field" for="'+id+'"><span>'+esc(title)+'</span><select id="'+id+'" data-material-pair="'+esc(hierarchy.path)+'"'+disabled+'>'+choices.html+'</select></label><p class="compact-help">An explicit reference choice fills its name and category together. Other/custom names remain editable; no physics is guessed from an image.</p>'+compactControl(textQ,'Material name')+'<div class="material-footnote"><span>Category: '+esc(reference?materialLabel(reference):value==='__other__'?'Other / no matching category':value===ND?'Not sure':'Not chosen')+'</span><button class="text-button" data-material-unknown="'+esc(hierarchy.path)+'"'+disabled+'>Material and category both unknown</button></div></div>';
  }
  function materialOptions(path,query) {
    const value=get(record(),path),matches=G.searchMaterials(state.catalogue.materials,query),selected=state.catalogue.materials.find(m=>String(m.id)===value),kept=selected&&!matches.includes(selected);
    const shown=kept?[selected,...matches]:matches;
    return {count:matches.length+' of '+state.catalogue.materials.length+' reference materials'+(kept?' · current choice also kept':''),
      html:'<option value=""'+(!answered(value)?' selected':'')+'>Choose a reference material…</option>'+shown.map(m=>'<option value="'+esc(m.id)+'"'+(String(m.id)===value?' selected':'')+'>'+esc(materialLabel(m))+' · '+esc(String(m.family||'').replace(/_/g,' '))+' ['+esc(m.id)+']</option>').join('')+'<option value="__other__"'+(value==='__other__'?' selected':'')+'>Other / no matching category</option><option value="'+ND+'"'+(value===ND?' selected':'')+'>Category not sure</option>'};
  }
  function filterMaterialChoices(path,query) {
    state.materialSearches[ep().id+'|'+path]=query;const choices=materialOptions(path,query);
    for(const select of document.querySelectorAll('[data-material-pair]'))if(select.dataset.materialPair===path)select.innerHTML=choices.html;
    for(const count of document.querySelectorAll('[data-material-count]'))if(count.dataset.materialCount===path)count.textContent=choices.count;
  }
  function boundaryMeasurementHTML() {
    const data=state.measurements,measurement=data&&data.episodes&&data.episodes[ep().id];
    const valid=data&&data.schema==='blockmind_boundary_measurements_v1'&&data.dataset_build_id===state.dataset.build_id&&
      measurement&&measurement.boundary_object_id===ep().boundary_object_id&&measurement.scan_id===ep().scan_id&&
      measurement.status==='available'&&measurement.method==='native_instance_obb_horizontal_major_extent'&&
      Number.isFinite(measurement.width_m)&&measurement.width_m>0&&
      measurement.measurement_scope==='native_boundary_object_obb_not_clear_opening';
    if(!valid)return '<div class="boundary-measurement unavailable"><strong>Mesh width estimate unavailable</strong><p>No verified measurement is available for this exact boundary. Do not guess a number; confirm the category from the images or choose Not sure.</p></div>';
    return '<div class="boundary-measurement"><strong>Mesh object span: approximately '+esc(measurement.width_m.toFixed(2))+' m</strong><p>Automatic estimate for outlined object '+esc(ep().boundary_object_id)+'. This is its horizontal mesh-bounding-box span, <strong>not a verified clear opening width</strong>. It may cover one door leaf or several joined panels. Confirm the category from the images; nothing is selected automatically.</p></div>';
  }
  function boundaryHTML(p) {
    const find=suffix=>p.questions.find(q=>q.path.endsWith('.'+suffix));
    return '<div class="boundary-form"><h2>Describe the opening</h2><p class="question-help">Five quick checks about the same outlined boundary. Look across the images as needed.</p>'+boundaryMeasurementHTML()+
      '<div class="compact-grid">'+compactControl(find('kind'),'1. What is it?')+
      compactControl(find('width_class'),'2. How wide is it?','<small>Confirm the opening category yourself. Choose Not sure if these categories do not fit.</small>')+
      compactControl(find('pane_transparency'),'3. Can you see through it?','<small>Judge the pane or panel, not just an open space beside it. Use Not sure if there is no pane to judge.</small>')+
      compactControl(find('blockage'),'4. Is anything blocking it?','<small>Include curtains, blinds, a screen or furniture. For multiple blockers or Other, describe them in the scene note.</small>')+
      compactControl(find('observed_state'),'5. Is it open or closed in the images?','<small>Report what the images show, not the later hypothetical conditions. Choose No door / closure exists for an open gap.</small>')+
      '</div><p class="compact-help">Existing material, reflectance and other boundary checks remain on the following cards. These five answers do not fill any physical-property labels automatically.</p></div>';
  }
  function surfaceHTML(p) {
    const m=layout().markers.find(v=>v.id===p.marker_id),find=suffix=>p.questions.find(q=>q.path.endsWith('.'+suffix)),a=find('anchor_correct'),same=find('same_surface_across_frames'),valid=get(record(),a.path)==='yes'&&get(record(),same.path)==='yes',different=[get(record(),a.path),get(record(),same.path)].some(v=>answered(v)&&v!=='yes'),disabled=readOnly()?' disabled':'';
    const views=[...new Set([m.anchor_frame,...(m.observations||[]).map(o=>o.frame_id)])];
    let html='<div class="surface-form" data-marker-id="'+esc(m.id)+'">'+pointNavigation(p.questions[0])+'<div class="target-heading"><span class="red-dot"></span>'+esc(markerName(m))+'<button id="showTarget" class="text-button">Show point</button></div><div class="point-views"><span>Compare marked views:</span>'+views.map(id=>'<button data-point-view="'+esc(id)+'">Image '+(ep().frames.findIndex(f=>f.id===id)+1)+'</button>').join('')+'</div>';
    html+='<div class="point-quality"><p>Check both: the red point is on a usable surface, and its marked views show the same physical surface.</p><button data-confirm-point="'+esc(m.id)+'" class="'+(valid?'confirmed':'')+'"'+disabled+'>'+(valid?'✓ Both checks confirmed':'I confirm both checks')+'</button><details id="pointQualityDetails"'+(different?' open':'')+'><summary>Problem, uncertainty, or answer checks separately</summary><div class="compact-grid">'+compactControl(a,'Point on a real surface?')+compactControl(same,'Same surface across marked views?')+'</div></details></div>';
    html+=compactControl(find('object_name'),'Object / surface name')+'<details class="optional"><summary>Automatic mask label (not your answer)</summary><p id="automaticPointLabel" data-marker-id="'+esc(m.id)+'">'+automaticLabelHTML(m.id)+'</p><p class="quiet-note">Saved separately beside your choices for later comparison. It never fills or overrides your answer.</p></details>'+materialPairHTML(p,find('hierarchy_id'),'Visible material / installed surface');
    html+='<div class="compact-grid">'+compactControl(find('reflectance'),'Visible reflectance')+compactControl(find('finish'),'Finish / coating')+'</div>';
    html+='<div class="substrate-group">'+compactControl(find('substrate_known'),'Can you identify the material underneath?','<small>Do not infer a hidden wall material from paint colour.</small>')+(find('substrate_material')?materialPairHTML(p,find('substrate_hierarchy_id'),'Underlying material'):'')+'</div>';
    html+='<fieldset class="compact-fieldset"><legend>Shelter at this point</legend><div class="compact-grid">'+compactControl(find('shelter'),'Overhead shelter')+compactControl(find('obstruction'),'Fixed obstructions')+'</div><p class="compact-help">These are separate facts: shelter describes cover; obstructions also include side walls.</p></fieldset></div>';return html;
  }
  function scenarioPanelHTML(p) {
    const q=p.questions[0];let html=scenarioHTML(q);
    if(p.questions.some(q=>needsRedo(q.path)))html+='<div class="redo-notice" role="status"><strong>Some answers need redoing.</strong> Their saved direction or task version no longer matches. Old answers remain archived in your JSON; choose fresh answers below.</div>';
    if(p.blocked||q.blocked)return html+'<div class="blocked-section"><strong>This scenario needs shared research settings first.</strong><p>You do not need to define directions yourself. The researcher will publish reviewed directions for everyone.</p><button id="continueBasics">Continue with basic facts →</button></div>';
    if(p.kind==='exposure') {
      html+='<h2>Which points do sun and rain hit directly?</h2><p class="question-help">Use Show point to inspect each surface. Answer sun and rain separately: Hit directly, Not hit, or Not sure. Blank means not yet answered. No answers are copied between points or scenarios.</p>'+physicsRulesHTML()+'<table class="scenario-table"><thead><tr><th scope="col">Surface</th><th scope="col">Direct sun</th><th scope="col">Direct rain</th></tr></thead><tbody>';
      for(const m of layout().markers){const qs=p.questions.filter(v=>v.marker_id===m.id);if(!qs.length)continue;html+='<tr data-point-row="'+esc(m.id)+'"'+((state.focusMarker||p.questions[0].marker_id)===m.id?' class="focused"':'')+'><th scope="row"><span>'+esc(markerName(m))+'</span><button data-focus-marker="'+esc(m.id)+'" class="text-button">Show point</button></th>'+['sun','rain'].map(channel=>'<td>'+compactControl(qs.find(v=>v.path.endsWith('.'+channel)),markerName(m)+' — '+(channel==='sun'?'direct sun':'rain'))+'</td>').join('')+'</tr>';}
      html+='</tbody></table><p class="compact-help">All marked points are retained. A row is a separate surface; the viewer shows only the focused point.</p>';
    } else if(q.kind==='multiselect')html+='<h2>What can pass through this opening?</h2><p class="question-help">Tick any of sunlight, rain, air and visible light, or choose Nothing / Not sure.</p><p class="consistency-note"><strong>Consistency check only.</strong> These selections are not benchmark answers. Benchmark answers must come from agreed opening facts and a reviewed rule; your check never overrides those facts.</p>'+physicsRulesHTML(false)+multiSelectHTML(q);
    else html+='<h2>What can pass through this opening?</h2>'+physicsRulesHTML(false)+'<div class="pathway-form">'+p.questions.map(q=>compactControl(q,q.path.endsWith('.direct_sun')?'Direct sunlight':q.path.endsWith('.diffuse_light')?'Diffuse daylight':q.path.endsWith('.air')?'Air':'Rain')).join('')+'</div>';
    return html;
  }
  function groupedActions(p) {return '<div class="actions"><button id="previousQuestion">← Back</button><button id="skipQuestion" class="text-button">Save & skip for now</button><button id="nextQuestion" class="primary"'+(!panelComplete(p)?' disabled':'')+'>Next '+(p.kind==='surface'?'point':['single','boundary'].includes(p.kind)?'check':'scenario')+' →</button></div>'+notesHTML();}
  function renderReview() {
    const p=F.progress(state.doc,state.episode,state.dataset,state.catalogue),ready=collectionReady(),missing=allQuestions().filter(q=>!answered(answerValue(q.path))),hasND=allQuestions().some(q=>uncertain(answerValue(q.path))),describeBlockers=['multiple','other'].includes(record().checks.boundary?.blockage),needNote=(hasND||describeBlockers)&&!record().answers.notes.trim();
    const missingPanels=allPanels().filter(p=>p.questions.some(q=>!answered(answerValue(q.path)))),redoCount=allQuestions().filter(q=>needsRedo(q.path)).length;
    const status=record().status,locked=['complete','excluded'].includes(status),canComplete=!missing.length&&!needNote&&ready.ready&&!state.conflict&&!state.taskUpdate&&!locked;
    let html='<p class="eyebrow">Review this scene</p><h2>'+(status==='complete'?'Scene complete':status==='excluded'?'Scene excluded':'Save now, finish when ready')+'</h2><p class="question-help">Drafts can be saved at any time. A point or scenario is finished when all its required fields are answered or explicitly marked Not sure.</p>';
    if(locked)html+='<div class="locked-notice">'+(status==='excluded'?'Reason: '+esc(record().exclusion_reason):'These answers are locked to protect your completed work.')+' <button id="reopenScene" class="text-button">Reopen to edit</button></div>';
    if(redoCount)html+='<div class="redo-notice" role="status"><strong>'+redoCount+' answers need redoing.</strong> Sun &amp; rain or Through-the-opening answers were recorded against an older direction/task version. Reanswer the marked fields before finishing; the originals stay in your export.</div>';
    if(!ready.ready&&status!=='excluded')html+='<div class="blocked-section"><strong>Waiting for shared scene preparation</strong><p>Your basic answers are safe. This task needs usable shared targets and both directions, plus any approvals required by its collection mode, before it can be finished.</p></div>';
    html+='<ul class="summary-list">'+order.filter(s=>s!=='review'&&p.sections[s]).map(s=>{const part=sectionProgress(s);return '<li><button data-section="'+s+'">'+names[s]+'</button><small>'+part.answered+' / '+part.total+' '+unitName(s)+'</small></li>';}).join('')+'</ul><p class="compact-help">Counts above are compact forms, not individual fields. Every original benchmark fact, point, direction and boundary condition is still saved and checked.</p>';
    if(missingPanels.length&&!locked)html+='<p class="small"><strong>'+missingPanels.length+' forms still need attention</strong></p><div class="missing-links">'+missingPanels.slice(0,5).map(p=>{const q=p.questions.find(q=>!answered(answerValue(q.path)));return '<button data-missing="'+esc(q.path)+'" data-missing-section="'+q.section+'">'+esc(p.kind==='surface'?markerName(layout().markers.find(m=>m.id===p.marker_id)):p.title||q.title)+'</button>';}).join('')+(missingPanels.length>5?'<span class="quiet-note">Use the sections above for the remaining forms.</span>':'')+'</div>';
    if((hasND||describeBlockers)&&!locked)html+='<p id="requiredNoteWarning" class="error'+(needNote?'':' hidden')+'">Please add one short note'+(hasND?' explaining your Not sure answers':'')+(hasND&&describeBlockers?' and':'')+(describeBlockers?' naming the multiple or other blockers':'')+'.</p>';
    html+='<label class="field" for="reviewNotes">Scene note'+(hasND||describeBlockers?' — needed for uncertainty or blocker details':' — optional')+'<textarea id="reviewNotes" data-notes maxlength="8000"'+(locked||state.conflict||state.taskUpdate?' disabled':'')+' placeholder="Explain uncertain answers, name multiple/other blockers, or flag a target problem.">'+esc(record().answers.notes)+'</textarea></label>';
    html+='<div class="save-card-buttons"><button id="completeScene" class="primary"'+(!canComplete?' disabled':'')+'>Finish this scene</button><button id="downloadHere">Save all progress (JSON)</button><button id="nextScene">'+(state.episode===state.doc.episodes.length-1?'Back to first scene':'Next scene')+' →</button></div>';
    if(!locked)html+='<details class="optional"><summary>This scene cannot be annotated</summary><p class="quiet-note">Exclude only with a clear reason. This is not the same as skipping difficult questions.</p><button id="excludeScene"'+(state.conflict?' disabled':'')+'>Exclude with a reason</button></details>';
    const allDone=state.doc.episodes.every(e=>['complete','excluded'].includes(e.status));
    html+='<details class="optional"><summary>Submit the whole collection</summary><p class="quiet-note">Requires every scene complete or explicitly excluded. Completion by one annotator is not yet benchmark ground truth.</p><button id="finalExport"'+(!allDone||state.conflict||state.taskUpdate?' disabled':'')+'>Download completed collection</button></details>';
    $('questionPanel').innerHTML=html;
  }
  function renderPanel() {
    if(!state.doc)return;if(state.section==='review'){renderReview();renderOverlay();return;}
    const list=sectionPanels();state.question=Math.min(state.question,Math.max(0,list.length-1));const current=list[state.question],q=current?.questions[0];
    if(!q){$('questionPanel').innerHTML='<h2>'+names[state.section]+'</h2><p>No questions in this section for the selected collection scope.</p><button id="continueSection" class="primary">Continue →</button>';renderOverlay();return;}
    const value=answerValue(q.path),m=layout().markers.find(v=>v.id===q.marker_id);
    let html='<div data-panel-kind="'+esc(current.kind)+'" data-panel-id="'+esc(current.id)+'"><div class="question-counter"><strong>'+names[state.section]+'</strong><span>'+(current.kind==='surface'?'Point':['single','boundary'].includes(current.kind)?'Check':'Scenario')+' '+(state.question+1)+' of '+list.length+'</span></div><div class="progress-line"><span style="width:'+Math.round(list.filter(panelComplete).length/list.length*100)+'%"></span></div>';
    if(readOnly())html+='<div class="locked-notice">'+(state.conflict?'Edits paused because another copy changed.':state.taskUpdate?'Edits paused because a new task version is available. Reload and review your migrated answers.':'This scene is '+record().status+'. Reopen it in Review to change answers.')+'</div>';
    if(state.question===0)html+='<p class="question-help">'+sectionHelp[state.section]+'</p>';
    if(current.kind!=='single'){
      html+=current.kind==='boundary'?boundaryHTML(current):current.kind==='surface'?surfaceHTML(current):scenarioPanelHTML(current);
      html+=groupedActions(current)+'</div>';$('questionPanel').innerHTML=html;renderOverlay();return;
    }
    html+=pointNavigation(q)+(m?'<div class="target-heading"><span class="red-dot"></span>'+esc(markerName(m))+'<button id="showTarget" class="text-button">Show point</button></div>':'')+scenarioHTML(q);
    html+='<h2>'+esc(q.title)+'</h2>'+(q.help?'<p class="question-help">'+esc(q.help)+'</p>':'');
    if(q.blocked){html+='<div class="blocked-section"><strong>This question needs shared research settings first.</strong><p>You do not need to define directions yourself. Continue with the scene, opening and point labels; the researcher will publish reviewed directions for everyone.</p><button id="continueBasics">Continue with basic facts →</button></div>';}
    else if(q.kind==='choice')html+=choicesHTML(q,value);
    else if(q.kind==='multiselect')html+=multiSelectHTML(q);
    else if(q.kind==='hierarchy')html+=hierarchyHTML(q,value);
    else html+=textHTML(q,value);
    if(q.direction&&!q.blocked)html+=physicsRulesHTML(q.section==='exposure');
    html+='<div class="actions"><button id="previousQuestion">← Back</button><button id="skipQuestion" class="text-button">Skip for now</button><button id="nextQuestion" class="primary"'+(!answered(value)||q.blocked?' disabled':'')+'>Next →</button></div>'+notesHTML()+'</div>';
    $('questionPanel').innerHTML=html;if(q.kind==='hierarchy'&&!q.blocked)renderHierarchy();renderOverlay();
  }
  function updateAnswer(value,rerender=true) {
    const q=question();if(!q||q.blocked||readOnly())return;F.setAnswer(state.doc,state.episode,q.path,value);changed();if(rerender)renderPanel();else {const next=$('nextQuestion');if(next)next.disabled=!answered(value);$('questionPanel').querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',button.dataset.value===value);button.setAttribute('aria-pressed',String(button.dataset.value===value));});}
  }
  function focusPoint(id,refreshPanel=false) {
    const m=layout().markers.find(m=>m.id===id);if(!m)return;stopPlay();state.focusMarker=id;state.reference=false;const index=ep().frames.findIndex(f=>f.id===m.anchor_frame);if(index>=0)state.frame=index;renderFrame();if(refreshPanel)renderPanel();else document.querySelectorAll('[data-point-row]').forEach(row=>row.classList.toggle('focused',row.dataset.pointRow===id));save();
  }
  function revealViewer() {if(window.matchMedia('(max-width: 780px)').matches)document.querySelector('.viewer').scrollIntoView({behavior:'auto',block:'start'});}
  function updateField(path,value,rerender=false) {
    const p=panel(),q=p?.questions.find(q=>q.path===path);if(!q||q.blocked||readOnly())return;
    const wasStale=needsRedo(path);F.setAnswer(state.doc,state.episode,path,value);if(q.marker_id&&state.section==='exposure'&&state.focusMarker!==q.marker_id)focusPoint(q.marker_id);
    if(wasStale)rerender=true;
    changed();if(rerender){renderPanel();return;}const next=$('nextQuestion');if(next)next.disabled=!panelComplete(panel());
    if(path.endsWith('.object_name'))for(const input of $('questionPanel').querySelectorAll('input[data-field]')){const materialQuestion=panel().questions.find(q=>q.path===input.dataset.field&&q.path.endsWith('.material'));const listId=input.getAttribute('list');if(materialQuestion&&listId&&$(listId))$(listId).innerHTML=(suggestionList(materialQuestion)||[]).map(value=>'<option value="'+esc(value)+'">').join('');}
    $('questionPanel').querySelectorAll('[data-unknown-field]').forEach(b=>{const uncertain=get(record(),b.dataset.unknownField)===ND;b.classList.toggle('active',uncertain);b.textContent=uncertain?'✓ Not sure':'Not sure';});
  }
  function updateSelections(input){
    const path=input.dataset.multiselectPath,q=panel()?.questions.find(q=>q.path===path);
    if(!q||q.kind!=='multiselect'||q.blocked||readOnly())return;
    const old=answerValue(path),selected=new Set(Array.isArray(old)?old:[]),value=input.value;
    if(!q.options.some(option=>option.value===value))return;
    if(input.checked){if(value==='none'||value===ND)selected.clear();else{selected.delete('none');selected.delete(ND);}selected.add(value);}else selected.delete(value);
    const next=selected.size?F.canonicalSelections([...selected],q.options):null;
    updateField(path,next,false);
    for(const checkbox of document.querySelectorAll('[data-multiselect-path]'))if(checkbox.dataset.multiselectPath===path)checkbox.checked=Array.isArray(next)&&next.includes(checkbox.value);
  }
  function selectMaterial(path,value) {
    const p=panel(),q=p?.questions.find(q=>q.path===path);if(!q||q.blocked||readOnly())return;
    const edits=G.mappedFieldEdit(p,path,value||null,state.catalogue),textEdit=edits.find(e=>e.path!==path),old=textEdit&&get(record(),textEdit.path);
    if(textEdit&&answered(old)&&old!==textEdit.value&&!confirm('Use this reference material and replace the current material name “'+old+'” with “'+textEdit.value+'”? Cancel keeps both existing answers.')){renderPanel();return;}
    G.applyEdits(record(),edits);changed();renderPanel();
  }
  function completeScene() {
    if(readOnly())return;const errors=F.validateEpisode(state.doc,state.episode,state.dataset,state.catalogue,true);
    if(errors.length){showMessage('This scene is not complete yet','Please answer the remaining questions and add an uncertainty note if needed. The shared task must also be ready for collection.\n\n'+errors.slice(0,3).join('\n'));goSection('review');return;}
    if(!save())return;record().status='complete';record().completed_at=new Date().toISOString();save();renderAll();toast('Scene complete. You can reopen it if a correction is needed.');
  }
  function reopenScene() {
    if(state.conflict||state.taskUpdate)return;if(layout().disposition==='exclude'){showMessage('Excluded in the shared task package','Only the researcher can change a scene excluded for both annotators.');return;}
    if(!confirm('Reopen this scene for editing? Its completed status will be cleared; existing answers are retained.'))return;record().exclusion_reason='';changed();renderAll();
  }
  function excludeScene() {if(readOnly())return;const reason=prompt('Why can this scene not be annotated? Your reason will be saved for research review.');if(!reason||!reason.trim())return;record().status='excluded';record().exclusion_reason=reason.trim().slice(0,8000);record().completed_at=null;state.doc.annotation_status='draft';save();renderAll();}
  function downloadRaw(value,name) {const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  async function download(final=false) {
    if(final&&state.taskUpdate){showMessage('Update the task package first','The published task changed. Download a draft backup, reload, then redo any answers whose directions changed before submitting the completed collection.');return;}
    if(!state.doc)return;const current=state.doc;await primeAutomaticLabels(current);if(state.doc!==current)return;
    if(final&&state.taskUpdate){showMessage('Update the task package first','The published task changed while the export was being prepared. Your answers are saved under the old version. Download a draft backup, then reload and review the changed questions.');return;}
    if(!state.conflict)save();
    current.surface_label_audit=R.buildSurfaceLabelAudit(current,state.dataset,state.catalogue);
    const copy=clone(current);copy.ui=savedCursor();if(final)copy.annotation_status='complete';
    const errors=F.validate(copy,state.dataset,state.catalogue,final);
    if(errors.length){showMessage(final?'Collection is not complete yet':'Could not export safely',final?'Finish or exclude each scene, then check the shared research preparation. Your draft is still available.\n\n'+errors.slice(0,3).join('\n'):errors.slice(0,4).join('\n'));return;}
    if(final){state.doc.annotation_status='complete';save();}
    downloadRaw(copy,'blockmind_l2_'+copy.annotator.replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+new Date().toISOString().slice(0,10)+(final?'_complete':'_draft')+'.json');toast(final?'Downloaded the completed collection.':'Downloaded your answers for all scenes.');
  }
  async function prepareImport(source) {
    if(!source||typeof source!=='object'||!safeIdentity(source.annotator)){showMessage('This is not an annotation backup','Choose your own simple, detailed, or full annotation JSON—not a task or layout file.');return;}
    const identity=state.doc?state.identity:$('identityInput').value.trim()||source.annotator;
    if(source.annotator!==identity){showMessage('This belongs to another annotator','Use the backup saved under your own annotator ID. No answers have been changed. Do not import or combine another person’s labels with yours.');return;}
    if(state.conflict){showMessage('This tab is paused','Download this copy or recover the latest draft before importing.');return;}
    let migrated;
    try {
      if(source.schema==='blockmind_l2_annotations_v2'&&source.task_id===state.tasks.task_id){const errors=F.validate(source,state.dataset,state.catalogue);if(errors.length)throw new Error(errors.slice(0,4).join('\n'));migrated=F.needsBoundaryUpgrade(source)?F.upgradeBoundary(source,state.dataset,state.catalogue):{doc:clone(source),report:{restored:'Exact same shared task package. All answers are preserved.',warning:'This replaces the active browser draft only after you confirm.'}};}
      else migrated=F.migrate(source,state.tasks,state.dataset,state.catalogue,identity,state.doc?state.doc.profile:'l2');
      if(F.needsCollectionUpgrade(migrated.doc)){const previousReport=migrated.report,next=F.upgradeCollection(migrated.doc,state.dataset,state.catalogue);migrated={doc:next.doc,report:{previous:previousReport,collection_checks:next.report}};}
      if(F.needsProvenanceUpgrade(migrated.doc)){const previousReport=migrated.report,next=F.upgradeProvenance(migrated.doc,state.dataset,state.catalogue,identity);migrated={doc:next.doc,report:{previous:previousReport,direction_provenance:next.report}};}
      F.reconcileProvenance(migrated.doc);
      const errors=F.validate(migrated.doc,state.dataset,state.catalogue);if(errors.length)throw new Error(errors.slice(0,4).join('\n'));
    } catch(error){showMessage('This backup cannot be restored safely',String(error.message||error));return;}
    state.migration=migrated;$('migrationReport').textContent=typeof migrated.report==='string'?migrated.report:JSON.stringify(migrated.report,null,2);$('migrationDialog').showModal();
  }
  function confirmMigration() {
    if(!state.migration)return;const doc=state.migration.doc,current=storageRead(scopeKey(doc.annotator,doc.task_id));
    if(current.invalid){$('migrationDialog').close();showMessage('Existing browser draft needs recovery','It has not been overwritten. Recover or back up the unreadable saved copy before importing.');return;}
    if(state.doc&&(current.env&&current.env.revision!==state.revision)){state.migration=null;$('migrationDialog').close();lock();return;}
    if(current.env&&!confirm('Use this imported version instead of the browser draft for this name? Keep your downloaded original as a backup.'))return;
    state.migration=null;$('migrationDialog').close();if(state.doc){acceptDoc(doc,current);toast('Restored compatible answers. Review any cleared questions.');}else{state.pending=doc;$('identityInput').value=doc.annotator;$('welcomeError').textContent='Backup reviewed. Press Start annotating to restore it.';}
  }
  async function importFile(file) {
    if(!file)return;if(file.size>40*1024*1024){showMessage('File is too large','Choose an annotation JSON smaller than 40 MB.');return;}
    let source;try{source=JSON.parse(await file.text());}catch(_){showMessage('Could not read this file','Choose an unmodified JSON downloaded from the annotation site.');return;}await prepareImport(source);
  }
  function findOlderDrafts(identity) {
    const candidates=[];
    try {
      const keys=Object.keys(localStorage).filter(k=>k.includes(basePath)&&k.includes(state.dataset.build_id)&&k!==state.key&&!k.includes(':before-'));
      for(const key of keys){try{const parsed=JSON.parse(localStorage.getItem(key));const doc=parsed&&parsed.data;if(doc&&doc.annotator===identity&&['blockmind_l2_guided_v1','blockmind_l2_annotations_v1','blockmind_l2_annotations_v2'].includes(doc.schema))candidates.push(doc);}catch(_){/* Preserve corrupt entries untouched. */}}
    }catch(_){return [];}
    candidates.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));return candidates;
  }
  function legacyDraft() {
    if(!state.doc)return;const candidates=findOlderDrafts(state.identity);
    if(!candidates.length){showMessage('No older draft found for this name','Try Restore / update my JSON to import a downloaded backup. Existing browser data has not been changed.');return;}
    prepareImport(candidates[0]);
  }
  function changeProfile(value) {
    if(state.conflict||state.taskUpdate){$('profileSelect').value=state.doc.profile;return;}if(value===state.doc.profile)return;
    if(!confirm('Change collection scope? Existing answers stay. Completed scenes will reopen because the required question set changes.')){$('profileSelect').value=state.doc.profile;return;}
    state.doc.profile=value;state.doc.annotation_status='draft';state.doc.episodes.forEach(e=>{if(e.status==='complete'){e.status='in_progress';e.completed_at=null;}});save();renderAll();
  }
  async function checkPublishedTasks() {
    if(!state.dataset||!state.tasks||state.taskCheckBusy||state.taskUpdate||document.hidden)return;
    state.taskCheckBusy=true;
    try{
      const response=await fetch('collection-tasks.json',{cache:'no-store'});if(!response.ok)return;
      const published=await response.json();
      const errors=F.validateTasks(published,state.dataset,state.catalogue,false);
      if(!errors.length&&published.task_id===state.tasks.task_id)return;
      // Keep answering context immutable. Never relabel these values as answers
      // to newly published directions. Reload offers the existing migration UI.
      if(state.doc)save();timing.running=false;stopPlay();state.taskUpdate=errors.length?'invalid-published-task':published.task_id;
      $('taskUpdateBanner').classList.remove('hidden');
      if(errors.length)$('taskUpdateBanner').querySelector('p').textContent='The published task package could not be verified. Your original version and answers are preserved. Editing is paused; download a backup and ask the researcher to check the published file before reloading.';
      if(state.doc){renderPanel();renderNavigation();}
    }catch(_){/* Offline work retains its embedded, versioned task package. */}
    finally{state.taskCheckBusy=false;}
  }
  function pauseTiming() {
    if(state.doc&&!state.conflict)save();
    timing.running=false;
  }
  function resumeTiming() {
    if(state.doc){timing.lastTick=performance.now();timing.lastInteraction=timing.lastTick;timing.running=timingEligible();}
    checkPublishedTasks();
  }
  for(const type of ['pointerdown','keydown','input','change','wheel'])document.addEventListener(type,noteInteraction,{capture:true,passive:true});
  window.addEventListener('blur',pauseTiming);
  window.addEventListener('focus',resumeTiming);
  document.addEventListener('visibilitychange',()=>document.hidden?pauseTiming():resumeTiming());
  window.addEventListener('pagehide',pauseTiming);
  setInterval(()=>{if(state.doc&&!state.conflict&&!state.taskUpdate&&timing.running)save();},10000);
  setInterval(checkPublishedTasks,60000);
  $('reloadTasks').addEventListener('click',()=>{if(state.doc&&!save()){showMessage('Save a backup before reloading','Your draft could not be saved safely. Download this copy first, then reload the website.');return;}location.reload();});
  $('startForm').addEventListener('submit',start);
  $('closeMessage').addEventListener('click',()=>$('messageDialog').close());
  $('cancelMigration').addEventListener('click',()=>{state.migration=null;$('migrationDialog').close();});$('confirmMigration').addEventListener('click',confirmMigration);
  $('sceneSelect').addEventListener('change',event=>goScene(+event.target.value));
  $('sections').addEventListener('click',event=>{const b=event.target.closest('[data-section]');if(b)goSection(b.dataset.section);});
  $('prevFrame').addEventListener('click',()=>{stopPlay();state.reference=false;changeFrame(state.frame-1);});$('nextFrame').addEventListener('click',()=>{stopPlay();state.reference=false;changeFrame(state.frame+1);});$('playButton').addEventListener('click',togglePlay);
  $('frameSlider').addEventListener('input',event=>{stopPlay();state.reference=false;changeFrame(+event.target.value);});$('filmstrip').addEventListener('click',event=>{const b=event.target.closest('[data-frame]');if(b){stopPlay();state.reference=false;changeFrame(+b.dataset.frame);}});
  $('questionPanel').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.previewFrame){const index=ep().frames.findIndex(f=>f.id===b.dataset.previewFrame);if(index>=0){stopPlay();state.reference=false;changeFrame(index);revealViewer();}return;}
    if(b.dataset.focusMarker){focusPoint(b.dataset.focusMarker);revealViewer();return;}
    if(b.dataset.pointView){const index=ep().frames.findIndex(f=>f.id===b.dataset.pointView);if(index>=0){stopPlay();state.reference=false;changeFrame(index);revealViewer();}return;}
    if(b.dataset.unknownField){updateField(b.dataset.unknownField,ND,true);return;}
    if(b.dataset.materialUnknown){if(readOnly())return;const p=panel(),path=b.dataset.materialUnknown,textPath=path.replace(/hierarchy_id$/,'material');if(!p.questions.some(q=>q.path===path)||!p.questions.some(q=>q.path===textPath))return;G.applyEdits(record(),[{path,value:ND},{path:textPath,value:ND}]);changed();renderPanel();return;}
    if(b.dataset.confirmPoint){if(readOnly())return;const id=b.dataset.confirmPoint,p=panel();if(p.kind!=='surface'||p.marker_id!==id)return;G.applyEdits(record(),[{path:'checks.surfaces.'+id+'.anchor_correct',value:'yes'},{path:'checks.surfaces.'+id+'.same_surface_across_frames',value:'yes'}]);changed();renderPanel();return;}
    if(b.dataset.value!==undefined){updateAnswer(b.dataset.value);return;}
    if(b.dataset.hierarchy!==undefined){updateAnswer(b.dataset.hierarchy);return;}
    if(b.dataset.section){goSection(b.dataset.section);return;}
    if(b.dataset.missing){goSection(b.dataset.missingSection,b.dataset.missing);return;}
    if(b.dataset.marker){const list=sectionPanels(),index=list.findIndex(p=>p.marker_id===b.dataset.marker);if(index>=0){state.question=index;state.focusMarker=b.dataset.marker;state.reference=false;alignQuestion();renderAll();save();}return;}
    if(b.id==='nextQuestion'||b.id==='skipQuestion')goQuestion(1);
    else if(b.id==='previousQuestion')goQuestion(-1);
    else if(b.id==='continueSection')goSection(order[Math.min(order.length-1,order.indexOf(state.section)+1)]);
    else if(b.id==='continueBasics'){const q=allQuestions().find(q=>!q.blocked&&!answered(get(record(),q.path)));if(q)goSection(q.section,q.path);else goSection('review');}
    else if(b.id==='showTarget'){state.reference=false;alignQuestion();renderFrame();save();revealViewer();}
    else if(b.id==='showReference'){const q=question();if(q&&q.direction&&!q.blocked){state.reference=true;const index=ep().frames.findIndex(f=>f.id===q.direction.reference_frame);if(index>=0)changeFrame(index);revealViewer();}}
    else if(b.id==='completeScene')completeScene();else if(b.id==='reopenScene')reopenScene();else if(b.id==='excludeScene')excludeScene();
    else if(b.id==='downloadHere')download();else if(b.id==='nextScene')goScene((state.episode+1)%state.doc.episodes.length);else if(b.id==='finalExport')download(true);
  });
  $('questionPanel').addEventListener('input',event=>{
    const target=event.target;if(target.id==='hierarchySearch'){renderHierarchy(target.value);return;}
    if(target.matches('input[data-material-search]')){filterMaterialChoices(target.dataset.materialSearch,target.value);return;}
    if(target.matches('input[data-field]')){updateField(target.dataset.field,target.value.trim()||null,false);return;}
    if(target.hasAttribute('data-input')){updateAnswer(target.value.trim()||null,false);return;}
    if(target.hasAttribute('data-notes')&&!readOnly()){record().answers.notes=target.value;changed();if(state.section==='review'){const p=F.progress(state.doc,state.episode,state.dataset,state.catalogue),hasND=allQuestions().some(q=>uncertain(answerValue(q.path))),describeBlockers=['multiple','other'].includes(record().checks.boundary?.blockage),needsNote=(hasND||describeBlockers)&&!target.value.trim(),ready=collectionReady();$('completeScene').disabled=p.answered!==p.total||!ready.ready||needsNote||state.conflict||!!state.taskUpdate;if($('requiredNoteWarning'))$('requiredNoteWarning').classList.toggle('hidden',!needsNote);}}
  });
  $('questionPanel').addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('input[data-multiselect-path]')){updateSelections(target);return;}
    if(target.matches('select[data-material-pair]')){selectMaterial(target.dataset.materialPair,target.value);return;}
    if(target.matches('select[data-field]'))updateField(target.dataset.field,target.value||null,target.dataset.field.endsWith('.substrate_known'));
  });
  $('questionPanel').addEventListener('focusin',event=>{
    if(state.section!=='exposure'||!event.target.matches('select[data-field]'))return;
    const q=panel()?.questions.find(q=>q.path===event.target.dataset.field),m=q&&layout().markers.find(m=>m.id===q.marker_id);
    if(m&&(state.focusMarker!==m.id||state.reference||frame().id!==m.anchor_frame))focusPoint(m.id);
  });
  ['restoreWelcome','restoreButton'].forEach(id=>$(id).addEventListener('click',()=>$('importFile').click()));$('importFile').addEventListener('change',event=>{importFile(event.target.files[0]);event.target.value='';});
  $('downloadButton').addEventListener('click',()=>download());$('recoveryDownload').addEventListener('click',()=>download());
  $('rawRecovery').addEventListener('click',()=>{const current=storageRead(state.key);if(current.raw)downloadRaw(current.raw,'blockmind_unreadable_browser_draft.json');});
  $('reloadLatest').addEventListener('click',()=>{const current=storageRead(state.key);if(!current.env){showMessage('Latest draft cannot be loaded','Download this tab’s copy first. The saved draft is missing or unreadable and has not been overwritten.');return;}const errors=F.validate(current.env.data,state.dataset,state.catalogue);if(errors.length){showMessage('Saved draft needs recovery',errors.slice(0,3).join('\n'));return;}if(!confirm('Load the latest saved draft? Download this tab’s copy first if you need it.'))return;acceptDoc(current.env.data,current);});
  $('moreButton').addEventListener('click',()=>{const hidden=$('moreMenu').classList.toggle('hidden');$('moreButton').setAttribute('aria-expanded',String(!hidden));});$('legacyButton').addEventListener('click',legacyDraft);$('profileSelect').addEventListener('change',event=>changeProfile(event.target.value));
  $('changeName').addEventListener('click',()=>{stopPlay();if(!save()){showMessage('Save your current draft before switching','Your current answers are still open. Download a backup, or resolve the saved-draft warning, before changing annotator ID.');return;}state.doc=null;resetTiming();state.pending=null;state.identity='';state.materialSearches={};$('moreMenu').classList.add('hidden');$('moreButton').setAttribute('aria-expanded','false');$('workspace').classList.add('hidden');$('welcome').classList.remove('hidden');$('identityInput').value='';$('welcomeError').textContent='Enter your own ID to start or resume its separate draft.';$('identityInput').focus();});
  window.addEventListener('storage',event=>{if(state.doc&&event.key===state.key){const current=storageRead(state.key);if(current.invalid)lock(true);else if(!current.env||current.env.owner!==owner&&current.env.revision!==state.revision)lock();}});
  window.addEventListener('beforeunload',event=>{pauseTiming();if(state.doc&&(!$('storageWarning').classList.contains('hidden')||state.conflict)){event.preventDefault();event.returnValue='Download your draft before leaving.';}});
  window.L2Collection=Object.freeze({getSnapshot:()=>clone({identity:state.identity,episode:state.episode,section:state.section,question:state.question,frame:state.frame,doc:state.doc,tasks:state.tasks,storageKey:state.key,revision:state.revision,conflict:state.conflict,taskUpdate:state.taskUpdate,imageReady:state.imageReady,focusMarker:state.focusMarker,panel:state.doc&&state.section!=='review'?panel():null}),getDataset:()=>clone(state.dataset)});
  async function init() {
    try {
      if(!F||!G||!R||!window.L2InstanceLabels)throw new Error('The annotation logic could not load. Refresh the site and check the complete JavaScript bundle is present.');
      const loaded=await Promise.all(['dataset.json','catalogue.json','collection-tasks.json'].map(async file=>{const response=await fetch(file,{cache:'no-store'});if(!response.ok)throw new Error('Could not load '+file+'. Serve the complete site folder over HTTP.');return response.json();}));
      [state.dataset,state.catalogue,state.tasks]=loaded;const errors=F.validateTasks(state.tasks,state.dataset,state.catalogue,false);if(errors.length)throw new Error('Shared annotation setup is invalid: '+errors.slice(0,3).join('; '));
      // A missing/stale machine estimate must never block saving human answers
      // or fall back to a different boundary's width.
      try {const response=await fetch('boundary-measurements.json',{cache:'no-store'});if(response.ok)state.measurements=await response.json();} catch(_) {state.measurements=null;}
      $('loading').classList.add('hidden');$('welcome').classList.remove('hidden');
    }catch(error){$('loading').classList.add('hidden');$('fatal').textContent=String(error.message||error);$('fatal').classList.remove('hidden');}
  }
  init();
})();
