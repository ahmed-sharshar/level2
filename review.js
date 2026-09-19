(function(){
  'use strict';
  const R=window.L2Review,$=id=>document.getElementById(id);
  let dataset,doc,index=0,key='',revision='',locked=false,dirty=false;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=text=>$('notice').textContent=text;
  const download=(name,value)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function save(){
    if(locked)return false;
    doc.updated_at=new Date().toISOString();
    try{const now=localStorage.getItem(key);if(now!==revision){locked=true;status('This draft changed in another tab. Editing is paused. Save this copy, then reload and restore the copy you want.');render();return false;}const serialized=JSON.stringify(doc);localStorage.setItem(key,serialized);revision=serialized;status('Saved in this browser. Download a JSON backup regularly.');}
    catch(e){status('Browser storage is unavailable. Your work remains here; download it before leaving.');return false;}
    return true;
  }
  function render(){
    $('reviewWorkspace').hidden=!doc;if(!doc)return;
    const item=doc.queue.items[index],a=doc.answers[item.id];
    $('queueTitle').textContent=doc.queue.title+' · '+doc.queue.kind;
    $('progress').textContent=`Item ${index+1} of ${doc.queue.items.length} · ${R.report(doc).labeled} labeled`;
    let h=`<p>Family ${escape(item.family)} · ${escape(item.id)}</p><h2>${escape(item.question)}</h2>`;
    for(const f of item.frames){const ep=dataset.episodes.find(e=>e.id===f.episode_id),frame=ep.frames.find(x=>x.id===f.frame_id);h+=`<div class="review-image"><img src="${escape(frame.image)}" alt="Numbered benchmark RGB frame">${(f.markers||[]).map(m=>`<span class="review-dot" style="left:${m.x*100}%;top:${m.y*100}%">${escape(m.label)}</span>`).join('')}</div>`;}
    if(doc.queue.kind!=='baseline')h+=`<h3>Model response</h3><pre>${escape(item.response)}</pre>`;
    h+='<fieldset '+(locked?'disabled':'')+'><legend>Your independent review</legend>';
    if(doc.queue.kind==='error')h+=`<label>Error category <select id="reviewCategory"><option value="">Choose…</option>${R.codes.map(c=>`<option value="${c}" ${a?.category===c?'selected':''}>${c.replaceAll('_',' ')}</option>`).join('')}</select></label><p>Prompt: misunderstood instructions · Perception: misread visible evidence · Reasoning: faulty inference · Physics application: wrong physical rule. Choose one primary cause; use Not determinable if evidence is insufficient.</p>`;
    else {h+=`<label>Answer status <select id="answerStatus"><option value="">Choose…</option>${['answered',...(doc.queue.kind==='matcher'?['unparseable']:[]),'not_determinable'].map(s=>`<option value="${s}" ${a?.status===s?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}</select></label><p>${doc.queue.kind==='matcher'?'Record what the model selected, not what you believe is correct. The automatic extraction is hidden until you download the report.':'Answer independently using the shown item and images. No model answer or ground truth is included.'} ${item.multi_select?'Select the complete set. An explicitly answered empty set is allowed.':'Choose one option.'}</p><div class="review-options">${item.options.map(o=>`<label><input type="${item.multi_select?'checkbox':'radio'}" name="option" value="${escape(o.id)}" ${(a?.selected_options||[]).includes(o.id)?'checked':''}> ${escape(o.id)}: ${escape(o.text)}</label>`).join('')}</div>`;}
    h+=`<label>Notes (required if not determinable)<textarea id="reviewNotes">${escape(a?.notes||'')}</textarea></label><button id="saveAnswer">Save answer</button> <button id="clearAnswer">Clear / leave unanswered</button></fieldset>`;
    $('itemCard').innerHTML=h;dirty=false;
    $('itemCard').oninput=()=>{dirty=true;};$('itemCard').onchange=()=>{dirty=true;};
    $('saveAnswer').onclick=()=>{if(locked)return;const next=structuredClone(doc);next.answers[item.id]=doc.queue.kind==='error'?{category:$('reviewCategory').value,notes:$('reviewNotes').value.trim()}:{status:$('answerStatus').value,selected_options:Array.from(document.querySelectorAll('[name=option]:checked'),e=>e.value),notes:$('reviewNotes').value.trim()};const errors=R.validate(next,dataset);if(errors.length){status(errors.slice(0,4).join('\n'));return;}doc=next;save();render();};
    $('clearAnswer').onclick=()=>{if(locked)return;doc.answers[item.id]=null;save();render();};
    $('previousItem').disabled=index===0;$('nextItem').disabled=index===doc.queue.items.length-1;
  }
  $('queueFile').onchange=async()=>{try{
    const reviewer=$('reviewer').value.trim();if(!reviewer)throw Error('Enter your reviewer name first.');if(!dataset)throw Error('Wait for the scene references to load.');
    const file=$('queueFile').files[0];if(!file)return;const input=JSON.parse(await file.text());let next;
    if(input.schema==='blockmind_review_annotations_v1'){const errors=R.validate(input,dataset);if(errors.length)throw Error(errors.slice(0,6).join('\n'));if(input.reviewer!==reviewer)throw Error('Restore only your own review. Use a blank queue for independent labeling.');next=input;}
    else{const errors=R.validateQueue(input,dataset);if(errors.length)throw Error(errors.slice(0,6).join('\n'));next=R.create(input,reviewer,dataset);}
    const nextKey='blockmind.review.v1:'+location.pathname+':'+next.task_id+':'+reviewer;let saved=null;try{saved=localStorage.getItem(nextKey);}catch(e){}
    if(saved && input.schema==='blockmind_review_tasks_v1'){let old;try{old=JSON.parse(saved);}catch(e){throw Error('Existing local draft is unreadable. Do not overwrite it; recover browser storage before proceeding.');}if(R.validate(old,dataset).length)throw Error('Existing draft failed validation; it has not been overwritten.');next=old;}
    if(doc&&!confirm('Open this review? Download any unfinished work first.'))return;
    if(saved&&input.schema==='blockmind_review_annotations_v1'&&!confirm('Replace this local review draft with your selected file?'))return;
    doc=next;index=0;key=nextKey;revision=saved;locked=false;save();render();
  }catch(e){status(e.message);}finally{$('queueFile').value='';}};
  const mayLeave=()=>!dirty||confirm('This answer has not been saved. Leave it and discard the unsaved changes?');
  $('previousItem').onclick=()=>{if(index>0&&mayLeave()){index--;render();}};$('nextItem').onclick=()=>{if(index<doc.queue.items.length-1&&mayLeave()){index++;render();}};
  $('downloadReview').onclick=()=>{
    if(dirty&&locked){
      const unsaved={item_id:doc.queue.items[index].id,notes:$('reviewNotes')?.value||'',status:$('answerStatus')?.value||null,category:$('reviewCategory')?.value||null,selected_options:Array.from(document.querySelectorAll('[name=option]:checked'),e=>e.value)};
      download('blockmind-unsaved-review-recovery.json',{schema:'blockmind_review_recovery_v1',saved_review:doc,unsaved_form:unsaved});
      status('Recovery downloaded with your saved review and unsaved form. Keep it; restore saved_review as a separate review JSON, then re-enter the unsaved answer.');return;
    }
    if(dirty){status('Save the current answer first, or clear it, before downloading.');return;}
    download('blockmind-'+doc.queue.kind+'-review.json',doc);
  };
  $('downloadReport').onclick=()=>download('blockmind-'+doc.queue.kind+'-report.json',R.report(doc));
  window.addEventListener('storage',e=>{if(key&&e.key===key&&e.newValue!==revision){locked=true;status('Another tab changed this review. Editing paused; download this copy before reloading.');const fieldset=$('itemCard').querySelector('fieldset');if(fieldset)fieldset.disabled=true;}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  fetch('dataset.json').then(r=>{if(!r.ok)throw Error('Dataset unavailable.');return r.json();}).then(d=>{dataset=d;status('Ready. Load a prepared queue to begin.');}).catch(e=>status(e.message));
  window.L2ReviewUI={getSnapshot:()=>({doc:doc?structuredClone(doc):null,index,locked})};
})();
