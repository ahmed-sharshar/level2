/* Machine label provenance is not a human answer or a material prediction. */
(function(root){
  'use strict';
  const Core=root.L2Core||(typeof require==='function'?require('./core.js'):null);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=Core.clone, stable=Core.stableStringify;
  const STATUSES=['sampled','background','unmapped_instance','unavailable'];
  const KEYS=['episode_id','marker_id','source','status','source_path','anchor_frame','x','y','pixel_x','pixel_y','width','height','object_id','mpcat40_id','mpcat40_name'];
  const normalized=value=>typeof value==='string'?value.trim().toLocaleLowerCase('en-US'):'';
  function createAutomaticLabel({episode_id,marker,frame,catalogue,sample=null}){
    if(!marker||!frame||frame.id!==marker.anchor_frame)throw new Error('Automatic label requires the marker anchor frame.');
    const row={episode_id,marker_id:marker.id,source:'instance_mask',status:'unavailable',source_path:frame.instance_map||null,
      anchor_frame:marker.anchor_frame,x:marker.x,y:marker.y,pixel_x:null,pixel_y:null,width:null,height:null,
      object_id:null,mpcat40_id:null,mpcat40_name:null};
    if(sample===null)return row;
    if(!Number.isInteger(sample.width)||sample.width<=0||!Number.isInteger(sample.height)||sample.height<=0||!Number.isInteger(sample.object_id)||sample.object_id< -1)throw new Error('Invalid instance mask sample.');
    row.width=sample.width;row.height=sample.height;
    row.pixel_x=Math.min(sample.width-1,Math.floor(marker.x*sample.width));
    row.pixel_y=Math.min(sample.height-1,Math.floor(marker.y*sample.height));
    if(sample.object_id===-1){row.status='background';return row;}
    row.object_id=sample.object_id;
    const source=(frame.objects||[]).find(item=>Number(item.object_id)===sample.object_id);
    if(!source||source.mpcat40===null||source.mpcat40===undefined||!Number.isInteger(Number(source.mpcat40))){row.status='unmapped_instance';return row;}
    row.status='sampled';row.mpcat40_id=Number(source.mpcat40);
    row.mpcat40_name=(catalogue.objects||[]).find(item=>Number(item.id)===row.mpcat40_id)?.name||null;
    return row;
  }
  function validateAutomaticLabels(labels,tasks,dataset,catalogue){
    const errors=[];
    if(!Array.isArray(labels))return ['automatic_surface_labels: expected array'];
    const taskEpisodes=new Map(tasks.layout.episodes.map(ep=>[ep.episode_id,ep]));
    const sourceEpisodes=new Map(dataset.episodes.map(ep=>[ep.id,ep]));
    const seen=new Set();
    labels.forEach((row,index)=>{
      const path='automatic_surface_labels['+index+']';
      if(!object(row)){errors.push(path+': expected object');return;}
      if(KEYS.some(key=>!own(row,key))||Object.keys(row).some(key=>!KEYS.includes(key))){errors.push(path+': missing or unexpected metadata field');return;}
      const key=row.episode_id+':'+row.marker_id;
      if(seen.has(key))errors.push(path+': duplicate marker provenance');seen.add(key);
      const target=taskEpisodes.get(row.episode_id),marker=target?.markers.find(item=>item.id===row.marker_id);
      const frame=sourceEpisodes.get(row.episode_id)?.frames.find(item=>item.id===marker?.anchor_frame);
      if(!marker||!frame){errors.push(path+': unknown episode, marker or anchor');return;}
      if(!STATUSES.includes(row.status)){errors.push(path+'.status: invalid');return;}
      if(row.source!=='instance_mask'||row.source_path!==(frame.instance_map||null)||row.anchor_frame!==marker.anchor_frame||row.x!==marker.x||row.y!==marker.y){errors.push(path+': provenance differs from the shared anchor');return;}
      let sample=null;
      if(row.status!=='unavailable'){
        if(!frame.instance_map){errors.push(path+': sampled label has no instance map source');return;}
        if(!Number.isInteger(row.width)||row.width<=0||!Number.isInteger(row.height)||row.height<=0){errors.push(path+': invalid mask dimensions');return;}
        const size=dataset.protocol?.instance_map_size;
        if(Array.isArray(size)&&(row.width!==size[0]||row.height!==size[1])){errors.push(path+': mask dimensions disagree with the dataset protocol');return;}
        if(row.status!=='background'&&(!Number.isInteger(row.object_id)||row.object_id<0)){errors.push(path+': invalid native object ID');return;}
        sample={width:row.width,height:row.height,object_id:row.status==='background'?-1:row.object_id};
      }
      const expected=createAutomaticLabel({episode_id:row.episode_id,marker,frame,catalogue,sample});
      if(stable(row)!==stable(expected))errors.push(path+': category, label, sampling coordinates or status do not match anchor provenance');
    });
    // When supplied, machine provenance has an explicit row even for failed loads.
    for(const ep of tasks.layout.episodes)for(const marker of ep.markers)if(!seen.has(ep.episode_id+':'+marker.id))errors.push('automatic_surface_labels: missing '+ep.episode_id+'/'+marker.id);
    return errors;
  }
  function compareObjectLabel(automatic,human,catalogue,excluded=false){
    const base={eligible:false,status:'not_comparable',human_mpcat40_id:null,reason:null};
    if(excluded)return {...base,reason:'episode_excluded'};
    if(automatic.status!=='sampled'||automatic.mpcat40_id<=0)return {...base,reason:'automatic_object_label_unavailable'};
    const name=normalized(human.object_name);
    if(!name)return {...base,reason:'human_object_unanswered'};
    const matches=(catalogue.objects||[]).filter(item=>Number(item.id)>0&&normalized(item.name)===name);
    if(matches.length!==1)return {...base,reason:'human_object_not_an_exact_catalogue_label'};
    const id=Number(matches[0].id);
    return {eligible:true,status:id===automatic.mpcat40_id?'agree':'disagree',human_mpcat40_id:id,reason:'exact_object_category_comparison'};
  }
  function buildSurfaceLabelAudit(doc,dataset,catalogue){
    const rows=new Map((doc.automatic_surface_labels||[]).map(row=>[row.episode_id+':'+row.marker_id,row]));
    return doc.tasks.layout.episodes.flatMap(ep=>ep.markers.map(marker=>{
      const record=doc.episodes.find(item=>item.episode_id===ep.episode_id);
      const frame=dataset.episodes.find(item=>item.id===ep.episode_id)?.frames.find(item=>item.id===marker.anchor_frame);
      const automatic=clone(rows.get(ep.episode_id+':'+marker.id)||createAutomaticLabel({episode_id:ep.episode_id,marker,frame,catalogue}));
      const answer=record?.answers.surfaces[marker.id]||{};
      const human={object_name:answer.object_name??null,material:answer.material??null,hierarchy_id:answer.hierarchy_id??null};
      return {episode_id:ep.episode_id,marker_id:marker.id,automatic,human,
        comparison:compareObjectLabel(automatic,human,catalogue,record?.status==='excluded'||ep.disposition==='exclude')};
    }));
  }
  function validateDocumentMetadata(doc,dataset,catalogue){
    try{
      const hasLabels=own(doc,'automatic_surface_labels'),hasAudit=own(doc,'surface_label_audit');
      if(!hasLabels&&!hasAudit)return [];
      if(!hasLabels||!hasAudit)return ['automatic_surface_labels and surface_label_audit must be supplied together'];
      const errors=validateAutomaticLabels(doc.automatic_surface_labels,doc.tasks,dataset,catalogue);
      if(!errors.length&&stable(doc.surface_label_audit)!==stable(buildSurfaceLabelAudit(doc,dataset,catalogue)))errors.push('surface_label_audit: stale or inconsistent automatic/human comparison snapshot');
      return errors;
    }catch(error){return ['Malformed red-point metadata: '+error.message];}
  }
  const api={STATUSES,createAutomaticLabel,validateAutomaticLabels,compareObjectLabel,buildSurfaceLabelAudit,validateDocumentMetadata};
  root.L2Redpoints=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
