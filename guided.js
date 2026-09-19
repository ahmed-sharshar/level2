/* A deliberately small, permissive annotation workflow.
 * Basic labels are saved as provisional human observations, never certified GT. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.L2Core, G = window.L2Guided;
  const ND = C.ND;
  const state = {dataset:null,catalogue:null,doc:null,identity:'',episode:0,step:0,marker:0,frame:0,
    key:'',revision:0,conflict:false,imageReady:false,placement:null,loadingToken:0,player:null,pending:null};
  const owner = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + Math.random();
  const labels = {yes:'Yes',no:'No',not_determinable:'Not sure',outdoor:'Open-air outdoors',semi_outdoor:'Partly enclosed / semi-outdoor',
    overhead:'Covered by a roof',partial:'Partly covered',none:'No roof',hinged_door:'Hinged door',sliding_door:'Sliding door',
    folding_door:'Folding door',garage_door:'Garage door',gate:'Gate',open_passage:'Open passage',window:'Window',other:'Other',
    open:'Open',closed:'Closed',ajar:'Partly open',no_closure:'No door / closure',clear:'Clear / see-through',obscured:'Frosted / obscured',opaque:'Opaque / cannot see through',
    reflective:'Reflective',non_reflective:'Non-reflective',untreated:'Unfinished',painted:'Painted',coated_sealed:'Coated / sealed',glazed:'Glazed',polished:'Polished',fabric:'Fabric',composite:'Composite'};
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ep = () => state.dataset.episodes[state.episode];
  const layout = () => state.doc.layout.episodes[state.episode];
  const record = () => state.doc.episodes[state.episode];
  const review = () => state.doc.review[ep().id];
  const marker = () => layout().markers[state.marker];
  const frame = () => ep().frames[state.frame];
  const get = (object,path) => path.split('.').reduce((v,k) => v == null ? null : v[k],object);
  const set = (object,path,value) => {const p=path.split('.');const last=p.pop();let o=object;p.forEach(k=>{o=o[k];});o[last]=value;};
  const basePath = encodeURIComponent(new URL('.',location.href).pathname);
  const scopeKey = identity => 'blockmind-l2-guided:' + basePath + ':' + state.dataset.build_id + ':' + encodeURIComponent(identity);
  const validIdentity = value => typeof value === 'string' && value.trim() && value.length <= 80;
  const storageRead = key => {
    let raw;
    try {raw=localStorage.getItem(key);} catch (_) {return {unavailable:true};}
    if (raw === null) return {empty:true};
    try {
      const env=JSON.parse(raw);
      if (!env || env.schema!=='blockmind_l2_guided_local_v1' || !Number.isInteger(env.revision) || env.revision<1 || typeof env.owner!=='string' || !env.data)
        return {invalid:true,raw};
      return {env,raw};
    } catch (_) {return {invalid:true,raw};}
  };
  function showMessage(title,text) {$('messageTitle').textContent=title;$('messageText').textContent=text;$('messageDialog').showModal();}
  function toast(message) {$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}
  function lock() {state.conflict=true;stopPlay();$('conflictBanner').classList.remove('hidden');$('workspace').classList.add('locked');$('saveStatus').textContent='Paused — another tab has changes';}
  function save() {
    if (!state.doc || state.conflict) return false;
    state.doc.ui={episode:state.episode,step:state.step,marker:state.marker,frame:state.frame};
    state.doc.updated_at=new Date().toISOString();
    const current=storageRead(state.key);
    if(current.invalid) {lock();$('conflictBanner').querySelector('strong').textContent='The saved draft could not be read safely.';return false;}
    if(current.env && current.env.revision!==state.revision) {lock();return false;}
    const revision=state.revision+1;
    try {
      localStorage.setItem(state.key,JSON.stringify({schema:'blockmind_l2_guided_local_v1',revision,owner,data:state.doc}));
      state.revision=revision;$('storageWarning').classList.add('hidden');$('saveStatus').textContent='Saved in this browser';return true;
    } catch (_) {$('storageWarning').classList.remove('hidden');$('saveStatus').textContent='Download to save your draft';return false;}
  }
  function changed() {
    if (state.conflict) return;
    record().status='in_progress';record().completed_at=null;
    save();updateProgress();
  }
  function acceptDoc(doc,identity,stored) {
    state.doc=doc;state.identity=identity;state.key=scopeKey(identity);state.revision=stored && stored.env ? stored.env.revision : 0;
    state.conflict=false;state.episode=doc.ui.episode;state.step=doc.ui.step;state.marker=doc.ui.marker;state.frame=doc.ui.frame || 0;
    state.placement=null;$('conflictBanner').classList.add('hidden');$('workspace').classList.remove('locked');
    $('welcome').classList.add('hidden');$('workspace').classList.remove('hidden');$('identityLabel').textContent=identity;
    renderScenes();renderAll();save();
  }
  function start(event) {
    event.preventDefault();$('welcomeError').textContent='';
    const identity=$('identityInput').value.trim();
    if(!validIdentity(identity)) {$('welcomeError').textContent='Please enter a name or short annotator ID.';return;}
    const existing=storageRead(scopeKey(identity));
    if(existing.invalid) {$('welcomeError').textContent='A saved draft exists but cannot be read. It has not been overwritten. Use a different name, or restore a downloaded backup.';return;}
    if(existing.env) {
      const errors=G.validate(existing.env.data,state.dataset,state.catalogue);
      if(errors.length || existing.env.data.annotator!==identity) {$('welcomeError').textContent='The saved draft needs recovery and has not been overwritten. Use a different name or restore your JSON.';return;}
      if(state.pending && !confirm('Replace the answers saved for this name with your imported backup? Download the existing draft first if needed.')) return;
    }
    if(state.pending && state.pending.annotator!==identity) {$('welcomeError').textContent='Use the annotator name from your backup: '+state.pending.annotator;return;}
    const doc=state.pending || (existing.env && existing.env.data) || G.create(state.dataset,state.catalogue,identity);
    state.pending=null;acceptDoc(doc,identity,existing);
  }
  function renderScenes() {
    $('sceneSelect').innerHTML=state.dataset.episodes.map((_,i)=>'<option value="'+i+'">Scene '+(i+1)+' of '+state.dataset.episodes.length+'</option>').join('');
    $('sceneSelect').value=String(state.episode);
  }
  function updateProgress() {
    if(!state.doc) return;
    let touched=0;
    state.doc.episodes.forEach((e,i)=>{if(G.status(state.doc,i).answered>0)touched++;});
    $('collectionProgress').textContent=touched+' of '+state.dataset.episodes.length+' scenes have answers';
  }
  function renderAll() {
    state.marker=Math.min(state.marker,Math.max(0,layout().markers.length-1));
    $('sceneSelect').value=String(state.episode);
    document.querySelectorAll('[data-step]').forEach(b=>{if(+b.dataset.step===state.step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    renderFilmstrip();renderFrame();renderPanel();updateProgress();
  }
  function renderFilmstrip() {
    $('filmstrip').innerHTML=ep().frames.map((f,i)=>'<button data-frame="'+i+'" aria-label="Show image '+(i+1)+'"'+(i===state.frame?' class="active"':'')+'><img src="'+escape(f.image)+'" alt="" loading="lazy"><span>'+(i+1)+'</span></button>').join('');
  }
  function renderFrame() {
    const f=frame(),token=++state.loadingToken;
    state.imageReady=false;$('pointOverlay').innerHTML='';$('imageLoading').textContent='Loading image…';$('imageLoading').classList.remove('hidden');
    $('frameLabel').textContent='Image '+(state.frame+1)+' of '+ep().frames.length;$('frameSlider').value=state.frame;
    $('imageStage').style.aspectRatio=f.width+' / '+f.height;
    $('pointImageHint').textContent=state.placement ? 'Click the surface to place a point' : '';
    $('sceneImage').onload=()=>{
      if(token!==state.loadingToken || !$('sceneImage').complete || $('sceneImage').currentSrc!==new URL(f.image,location.href).href)return;
      if($('sceneImage').naturalWidth!==f.width || $('sceneImage').naturalHeight!==f.height){$('imageLoading').textContent='Image size mismatch — point placement is disabled.';return;}
      state.imageReady=true;$('imageLoading').classList.add('hidden');renderPoint();
    };
    $('sceneImage').onerror=()=>{if(token===state.loadingToken){$('imageLoading').textContent='This image could not load. Try another image or refresh.';}};
    $('sceneImage').src=f.image;
    $('prevFrame').disabled=state.frame===0;$('nextFrame').disabled=state.frame===ep().frames.length-1;
    document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',+b.dataset.frame===state.frame));
  }
  function pointPosition(m) {
    if(!m)return null;if(m.anchor_frame===frame().id)return {x:m.x,y:m.y};
    return (m.observations||[]).find(o=>o.frame_id===frame().id)||null;
  }
  function renderPoint() {
    $('pointOverlay').innerHTML='';
    if(!state.imageReady)return;
    if(state.step===2) {
      const box=frame().boundary_bbox;
      if(Array.isArray(box) && box.length===4) {
        $('pointOverlay').innerHTML='<rect x="'+(box[0]*1000)+'" y="'+(box[1]*800)+'" width="'+((box[2]-box[0])*1000)+'" height="'+((box[3]-box[1])*800)+'" fill="none" stroke="#ffdd63" stroke-width="4"/>';
        $('pointImageHint').textContent='Outlined door / opening';
      } else $('pointImageHint').textContent='Try another image to see the opening';
      return;
    }
    if(state.step!==1)return;
    const m=marker(),p=pointPosition(m);
    if(!p){$('pointImageHint').textContent=state.placement?'Click to place a point':'Point is in another image';return;}
    $('pointImageHint').textContent=state.placement?'Click to place a point':'Point '+(state.marker+1);
    const x=p.x*1000,y=p.y*800;
    $('pointOverlay').innerHTML='<circle cx="'+x+'" cy="'+y+'" r="15" fill="none" stroke="white" stroke-width="3"/><circle cx="'+x+'" cy="'+y+'" r="9" fill="#f02f35" stroke="white" stroke-width="2"/>';
  }
  function changeFrame(index) {state.frame=Math.max(0,Math.min(ep().frames.length-1,index));renderFrame();save();}
  function stopPlay() {clearInterval(state.player);state.player=null;$('playButton').textContent='▶ Play';}
  function togglePlay() {
    if(state.player){stopPlay();return;}
    state.placement=null;if(state.frame===ep().frames.length-1)changeFrame(0);
    $('playButton').textContent='Ⅱ Pause';state.player=setInterval(()=>{if(state.frame>=ep().frames.length-1){stopPlay();return;}changeFrame(state.frame+1);},1100);
  }
  function goStep(step) {
    stopPlay();state.placement=null;state.step=step;
    if(step===1 && marker())state.frame=ep().frames.findIndex(f=>f.id===marker().anchor_frame);
    if(step===2) {
      const candidates=ep().frames.map((f,i)=>({f,i})).filter(v=>v.f.side==='indoor');
      candidates.sort((a,b)=>b.f.boundary_pixels-a.f.boundary_pixels);state.frame=candidates.length?candidates[0].i:5;
    }
    renderAll();save();
  }
  function goScene(index) {
    stopPlay();state.episode=Math.max(0,Math.min(state.dataset.episodes.length-1,index));state.step=0;state.marker=0;state.frame=0;state.placement=null;renderAll();save();
  }
  function choices(title,path,options,hint) {
    const value=get(record().answers,path);
    return '<fieldset class="question"><legend>'+escape(title)+'</legend><div class="choices">'+options.map(v=>'<button type="button" class="choice'+(value===v?' selected':'')+(v===ND?' uncertain':'')+'" data-answer="'+escape(path)+'" data-value="'+escape(v)+'" aria-pressed="'+(value===v)+'">'+escape(labels[v]||v)+'</button>').join('')+'</div>'+(hint?'<p class="question-hint">'+escape(hint)+'</p>':'')+'</fieldset>';
  }
  function option(value,text,selected) {return '<option value="'+escape(value)+'"'+(selected?' selected':'')+'>'+escape(text)+'</option>';}
  function objectNames() {return [...new Set(ep().frames.flatMap(f=>f.objects.map(o=>o.name)).filter(Boolean))].sort();}
  function suggestions(objectName) {
    const object=state.catalogue.objects.find(o=>o.name.toLowerCase()===String(objectName||'').toLowerCase());
    return object ? (state.catalogue.suggestions_by_mpcat40[String(object.id)]||state.catalogue.all_material_suggestions) : state.catalogue.all_material_suggestions;
  }
  function textSelect(title,id,path,options,otherId) {
    const value=get(record().answers,path),manual=value!==null && value!==ND && !options.includes(value);
    let html='<label class="field" for="'+id+'">'+escape(title)+'<select id="'+id+'" data-text-path="'+escape(path)+'">'+option('','Choose…',value===null)+options.map(o=>option(o,o,o===value)).join('')+option('__other__','Other — type it myself',manual)+option(ND,'Not sure',value===ND)+'</select></label>';
    html+='<input id="'+otherId+'" class="inline-manual'+(manual?'':' hidden')+'" data-manual-path="'+escape(path)+'" value="'+escape(manual?value:'')+'" maxlength="250" placeholder="Type your answer" aria-label="'+escape(title)+' — other">';
    return html;
  }
  function actions(backLabel,nextLabel) {return '<div class="actions">'+(state.step>0?'<button id="backButton">'+escape(backLabel||'← Back')+'</button>':'')+'<button id="continueButton" class="primary">'+escape(nextLabel||'Continue →')+'</button></div>';}
  function optionalNotes() {return '<details class="optional"><summary>Add a note (optional)</summary><label class="field" for="sceneNotes">Anything we should know?<textarea id="sceneNotes" data-note-path="notes" maxlength="8000">'+escape(record().answers.notes)+'</textarea></label></details>';}
  function renderPanel() {
    const a=record().answers,r=review();let html='';
    if(state.step===0) {
      html='<p class="eyebrow">Step 1 of 4</p><h2>Watch the scene</h2><p class="step-description">Press Play. Then answer these three questions about the move from inside to outside.</p>'+
        choices('Does this show a clear move from inside to outside?','scene.crossing_valid',['yes','no',ND])+
        choices('What kind of outside space is it?','scene.boundary_class',['outdoor','semi_outdoor',ND],'A balcony in open air is outdoors. An enclosed porch or sunroom is semi-outdoor.')+
        choices('Is the outside area covered from above?','scene.shelter',['overhead','partial','none',ND])+optionalNotes()+actions(null,'Next: label points →');
    } else if(state.step===1) {
      const m=marker(),count=layout().markers.length;
      html='<div class="point-topline"><span class="point-count">'+(count?'Point '+(state.marker+1)+' of '+count:'No points yet')+'</span><div class="point-navigation"><button id="prevPoint" aria-label="Previous point"'+(state.marker===0?' disabled':'')+'>←</button><button id="pointForward" aria-label="Next point"'+(state.marker>=count-1?' disabled':'')+'>→</button></div></div><h2><span class="red-dot"></span>What is at the red point?</h2><p class="step-description">Name the object and its material. These suggested points haven’t been reviewed; skip or move a point if it is unclear.</p>';
      if(m) {
        const path='surfaces.'+m.id,s=a.surfaces[m.id];
        html+=textSelect('Object name','objectSelect',path+'.object_name',objectNames(),'objectOther')+
          textSelect('Material','materialSelect',path+'.material',suggestions(s.object_name),'materialOther')+
          '<p class="suggestion-note">Suggestions are just choices, not answers. Choose what you actually see.</p>'+
          choices('Does this surface look reflective?',path+'.reflectance',['reflective','non_reflective',ND],'Reflective means a visible shiny or mirror-like appearance.')+
          '<details class="optional"><summary>More about this surface (optional)</summary>'+choices('Surface finish',path+'.finish',C.FIELDS.finish)+
          choices('Do you know the material underneath its finish?',path+'.substrate_known',['yes','no',ND]);
        if(s.substrate_known==='yes')html+=textSelect('Underlying material','substrateSelect',path+'.substrate_material',state.catalogue.all_material_suggestions,'substrateOther');
        html+=choices('Is this surface sheltered from above?',path+'.shelter',C.FIELDS.shelter)+'<label class="field">Note<textarea data-note-path="'+path+'.notes" maxlength="8000">'+escape(s.notes)+'</textarea></label></details>'+
          '<div class="point-actions"><button id="skipPoint">Skip this point</button><button id="nextPoint" class="primary">'+(state.marker===count-1?'Next: door / opening →':'Next point →')+'</button></div>'+
          '<div class="point-actions"><button id="showPoint" class="text-button">Show this point</button><button id="movePoint" class="text-button">Move point</button><button id="addPoint" class="text-button">Add a point</button></div>'+
          (state.placement?'<p class="quiet-note">Click the desired surface in the image. <button id="cancelPlacement" class="text-button">Cancel</button></p>':'')+
          '<div class="actions"><button id="backButton">← Watch scene</button></div>';
      } else html+='<button id="addPoint" class="primary">Add a point</button>'+actions('← Watch scene','Next: door / opening →');
    } else if(state.step===2) {
      html='<p class="eyebrow">Step 3 of 4</p><h2>The door or opening</h2><p class="step-description">Answer about the outlined door or opening. If it is wrong or unclear, choose Not sure. Use the image controls for another view.</p>'+
        choices('What type of opening is it?','boundary.kind',['hinged_door','sliding_door','folding_door','garage_door','gate','open_passage','window','other',ND])+
        choices('How is it shown in the photographs?','boundary.observed_state',['open','closed','ajar','no_closure',ND])+
        choices('Can you see through the door or panel itself?','boundary.pane_transparency',['clear','obscured','opaque',ND],'Judge the panel, not the empty opening. If there is no panel, choose Not sure.')+
        textSelect('Main door / panel material','boundaryMaterialSelect','boundary.material',suggestions('door'),'boundaryMaterialOther')+optionalNotes()+actions('← Points','Next: save →');
    } else {
      const status=G.status(state.doc,state.episode);
      html='<p class="eyebrow">Step 4 of 4</p><h2>Your answers are saved</h2><p class="step-description">That’s all for the basic labels. You can come back and change any answer.</p><div class="save-hero"><strong>Scene '+(state.episode+1)+'</strong>'+status.answered+' basic answers provided. Unanswered questions stay blank.</div><ul class="summary-list"><li><span>Scene questions</span><span>'+status.scene.answered+' / '+status.scene.total+'</span></li><li><span>Point labels</span><span>'+status.points.answered+' / '+status.points.total+'</span></li><li><span>Door / opening</span><span>'+status.boundary.answered+' / '+status.boundary.total+'</span></li></ul><div class="save-card-buttons"><button id="nextScene" class="primary">'+(state.episode===state.dataset.episodes.length-1?'Back to first scene →':'Next scene →')+'</button><button id="downloadHere">Download all my answers (JSON)</button></div><p class="quiet-note">These are saved annotations, not certified benchmark answers. Detailed physics checks can be completed later.</p>'+optionalNotes()+'<div class="actions"><button id="backButton">← Back to opening</button></div>';
      if(!$('storageWarning').classList.contains('hidden'))html=html.replace('Your answers are saved','Download to save your answers');
    }
    $('questionPanel').innerHTML=html;renderPoint();
  }
  function updateAnswer(path,value,rerender=true) {
    if(state.conflict)return;
    const focused=document.activeElement,focusId=focused.id,focusPath=focused.dataset && focused.dataset.answer,focusValue=focused.dataset && focused.dataset.value;
    set(record().answers,path,value);changed();
    if(rerender) {
      renderPanel();
      const restored=focusId?$(focusId):focusPath?[...$('questionPanel').querySelectorAll('[data-answer]')].find(b=>b.dataset.answer===focusPath&&b.dataset.value===focusValue):null;
      if(restored)restored.focus({preventScroll:true});
    }
  }
  function movePoint(index) {
    stopPlay();state.placement=null;state.marker=Math.max(0,Math.min(layout().markers.length-1,index));
    const m=marker();if(m)state.frame=ep().frames.findIndex(f=>f.id===m.anchor_frame);
    renderFrame();renderPanel();save();
  }
  function advancePoint(skipped) {
    if(state.conflict)return;const m=marker();
    if(m) {
      review().points=review().points||{};
      if(skipped)review().points[m.id]='skip';
      else {const s=record().answers.surfaces[m.id];if([s.object_name,s.material,s.reflectance].every(v=>v!==null))review().points[m.id]='answered';}
    }
    changed();
    if(state.marker<layout().markers.length-1)movePoint(state.marker+1);
    else {review().points_done=true;changed();goStep(2);}
  }
  function beginPlacement(kind) {
    if(state.conflict)return;stopPlay();
    if(kind==='move' && marker()) {
      const s=record().answers.surfaces[marker().id];
      const blank=C.createEpisode({...layout(),markers:[marker()]}).answers.surfaces[marker().id];
      if(C.stableStringify(s)!==C.stableStringify(blank)) {
        if(!confirm('Moving this point clears its old answers, so labels are not attached to the wrong surface. Continue?'))return;
      }
      state.frame=ep().frames.findIndex(f=>f.id===marker().anchor_frame);
    }
    state.placement=kind;renderFrame();renderPanel();
    $('imageStage').style.cursor='crosshair';
  }
  function placePoint(event) {
    if(!state.placement || state.conflict || !state.imageReady || state.step!==1)return;
    const img=$('sceneImage'),rect=img.getBoundingClientRect();
    if(!img.complete || img.currentSrc!==new URL(frame().image,location.href).href || img.naturalWidth!==frame().width || img.naturalHeight!==frame().height)return;
    const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return;
    const side=frame().side==='indoor'?'indoor':'exterior';let m;
    if(state.placement==='move') {
      m=marker();if(side!==m.side){toast('Move this point in a photograph from the same side, or add a new point.');return;}
      Object.assign(m,{anchor_frame:frame().id,x,y,object_id:null,mpcat40:null,observations:[]});
    } else {
      const prefix=side==='indoor'?'I':'E';let n=1;
      while(layout().markers.some(v=>v.id===prefix+n))n++;
      m={id:prefix+n,side,anchor_frame:frame().id,x,y,object_id:null,mpcat40:null,observations:[]};
      layout().markers.push(m);state.marker=layout().markers.length-1;
    }
    const blank=C.createEpisode({...layout(),markers:[m]}).answers.surfaces[m.id];
    record().answers.surfaces[m.id]=blank;
    if(review().points)delete review().points[m.id];
    review().points_done=false;state.placement=null;$('imageStage').style.cursor='';changed();renderPanel();renderPoint();toast('Point placed. Now add its labels.');
  }
  function download(doc=state.doc) {
    if(!doc)return;
    const errors=G.validate(doc,state.dataset,state.catalogue);
    if(errors.length){showMessage('Could not export safely',errors.slice(0,4).join('\n'));return;}
    const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='blockmind_l2_'+doc.annotator.replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+new Date().toISOString().slice(0,10)+'_draft.json';
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloaded your answers for all scenes.');
  }
  async function importFile(file) {
    if(!file)return;
    if(file.size>40*1024*1024){showMessage('File is too large','Choose a JSON draft smaller than 40 MB.');return;}
    let doc;
    try {doc=JSON.parse(await file.text());} catch (_) {showMessage('Could not read this file','Please select a JSON backup downloaded from this simple annotation page.');return;}
    if(!doc || typeof doc!=='object' || doc.schema!=='blockmind_l2_guided_v1'){showMessage('This is a different kind of file','This page restores its own simple annotation JSON. Older detailed layouts and annotations still open in Research tools.');return;}
    const errors=G.validate(doc,state.dataset,state.catalogue);
    if(errors.length){showMessage('This backup cannot be opened',errors.slice(0,4).join('\n'));return;}
    if(state.doc && doc.annotator!==state.identity){showMessage('This belongs to another annotator','Change annotator first. Your current answers have not been changed.');return;}
    if(state.doc) {
      if(state.conflict){showMessage('This tab is paused','Download this copy or load the latest saved version before restoring another backup.');return;}
      if(!confirm('Replace this browser draft with your downloaded backup? Download your current answers first if you want to keep both versions.'))return;
      const existing=storageRead(state.key);
      if(existing.invalid || (existing.env && existing.env.revision!==state.revision)){lock();return;}
      acceptDoc(doc,doc.annotator,existing);toast('Your backup has been restored.');
    } else {state.pending=doc;$('identityInput').value=doc.annotator;$('welcomeError').textContent='Backup ready. Press Start annotating to restore it.';}
  }
  $('startForm').addEventListener('submit',start);
  $('closeMessage').addEventListener('click',()=>$('messageDialog').close());
  $('sceneSelect').addEventListener('change',e=>goScene(+e.target.value));
  $('steps').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b)goStep(+b.dataset.step);});
  $('prevFrame').addEventListener('click',()=>{stopPlay();changeFrame(state.frame-1);});
  $('nextFrame').addEventListener('click',()=>{stopPlay();changeFrame(state.frame+1);});
  $('playButton').addEventListener('click',togglePlay);
  $('frameSlider').addEventListener('input',e=>{stopPlay();changeFrame(+e.target.value);});
  $('filmstrip').addEventListener('click',e=>{const b=e.target.closest('[data-frame]');if(b){stopPlay();changeFrame(+b.dataset.frame);}});
  $('imageStage').addEventListener('click',placePoint);
  $('downloadButton').addEventListener('click',()=>download());
  $('recoveryDownload').addEventListener('click',()=>download());
  $('moreButton').addEventListener('click',()=>{$('moreMenu').classList.toggle('hidden');$('moreButton').setAttribute('aria-expanded',String(!$('moreMenu').classList.contains('hidden')));});
  [$('restoreButton'),$('restoreWelcome')].forEach(b=>b.addEventListener('click',()=>$('importFile').click()));
  $('importFile').addEventListener('change',async e=>{await importFile(e.target.files[0]);e.target.value='';});
  $('changeName').addEventListener('click',()=>{stopPlay();const saved=save();if(!saved && !confirm('This tab has answers that are not saved in the browser. Download a backup before switching names. Switch anyway?'))return;state.doc=null;state.pending=null;$('workspace').classList.add('hidden');$('welcome').classList.remove('hidden');$('moreMenu').classList.add('hidden');$('identityInput').focus();});
  $('reloadLatest').addEventListener('click',()=>{
    const stored=storageRead(state.key);
    if(!stored.env || G.validate(stored.env.data,state.dataset,state.catalogue).length){showMessage('Could not load the saved draft','Download this tab’s copy now. The browser draft has not been overwritten.');return;}
    if(confirm('Load the saved version? Unsaved edits in this tab will be replaced. Download this copy first if you need it.'))acceptDoc(stored.env.data,state.identity,stored);
  });
  $('questionPanel').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b || state.conflict)return;
    if(b.dataset.answer){const details=b.closest('details'),open=!!details;updateAnswer(b.dataset.answer,get(record().answers,b.dataset.answer)===b.dataset.value?null:b.dataset.value);if(open){const d=$('questionPanel').querySelector('details');if(d)d.open=true;}return;}
    switch(b.id) {
      case 'continueButton':if(state.step===0)review().scene_done=true;else if(state.step===1)review().points_done=true;else if(state.step===2)review().boundary_done=true;changed();goStep(Math.min(3,state.step+1));break;
      case 'backButton':goStep(Math.max(0,state.step-1));break;
      case 'prevPoint':movePoint(state.marker-1);break;
      case 'pointForward':movePoint(state.marker+1);break;
      case 'nextPoint':advancePoint(false);break;
      case 'skipPoint':advancePoint(true);break;
      case 'showPoint':movePoint(state.marker);break;
      case 'addPoint':beginPlacement('add');break;
      case 'movePoint':beginPlacement('move');break;
      case 'cancelPlacement':state.placement=null;$('imageStage').style.cursor='';renderPanel();renderPoint();break;
      case 'nextScene':goScene(state.episode===state.dataset.episodes.length-1?0:state.episode+1);break;
      case 'downloadHere':download();break;
    }
  });
  $('questionPanel').addEventListener('change',e=>{
    const target=e.target;if(state.conflict || !target.dataset.textPath)return;
    const path=target.dataset.textPath,value=target.value;
    if(value==='__other__') {
      updateAnswer(path,null,false);
      const manual=target.closest('label').nextElementSibling;manual.classList.remove('hidden');manual.value='';manual.focus();
      if(target.id==='objectSelect') {const s=record().answers.surfaces[marker().id];const current=s.material;const material=$('materialSelect');material.innerHTML=option('','Choose…',current===null)+state.catalogue.all_material_suggestions.map(v=>option(v,v,v===current)).join('')+option('__other__','Other — type it myself',current!==null&&current!==ND&&!state.catalogue.all_material_suggestions.includes(current))+option(ND,'Not sure',current===ND);}
    } else {
      const details=target.closest('details');updateAnswer(path,value===''?null:value);
      if(details){const d=$('questionPanel').querySelector('details');if(d)d.open=true;}
    }
  });
  $('questionPanel').addEventListener('input',e=>{
    const target=e.target;if(state.conflict)return;
    if(target.dataset.manualPath)updateAnswer(target.dataset.manualPath,target.value.trim()||null,false);
    else if(target.dataset.notePath)updateAnswer(target.dataset.notePath,target.value,false);
  });
  window.addEventListener('storage',e=>{if(state.doc && e.key===state.key){const stored=storageRead(state.key);if(!stored.env || stored.env.revision!==state.revision)lock();}});
  window.addEventListener('beforeunload',e=>{if(state.doc && (!save() || state.conflict)){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if(!state.doc || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) || $('messageDialog').open)return;if(e.key==='ArrowLeft'){stopPlay();changeFrame(state.frame-1);}if(e.key==='ArrowRight'){stopPlay();changeFrame(state.frame+1);}});
  window.L2Simple=Object.freeze({getSnapshot:()=>C.clone({doc:state.doc,identity:state.identity,episode:state.episode,step:state.step,marker:state.marker,frame:state.frame,key:state.key,revision:state.revision,conflict:state.conflict,imageReady:state.imageReady,placement:state.placement}),getDataset:()=>C.clone(state.dataset)});
  Promise.all(['dataset.json','catalogue.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw new Error('Could not load '+url);return r.json();})))
    .then(([dataset,catalogue])=>{if(!C || !G)throw new Error('The annotation scripts did not load.');state.dataset=dataset;state.catalogue=catalogue;$('loading').classList.add('hidden');$('welcome').classList.remove('hidden');})
    .catch(error=>{$('loading').classList.add('hidden');$('fatal').textContent='The workspace could not open. Serve this folder with python3 -m http.server 8081, then open http://localhost:8081. '+error.message;$('fatal').classList.remove('hidden');});
})();
