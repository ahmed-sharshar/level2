/* Sample the actual shared anchor pixel, never infer a label from human answers. */
(function(root){
  'use strict';
  const cache=new Map();
  function pixels(path){
    const url=new URL(path,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith(new URL('.',location.href).pathname))return Promise.reject(new Error('Mask outside this site.'));
    if(!cache.has(url.href)){
      const promise=new Promise((resolve,reject)=>{
        const image=new Image(),timer=setTimeout(()=>reject(new Error('Mask load timed out.')),15000);
        image.onload=()=>{clearTimeout(timer);try{
          const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
          resolve({width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data});
        }catch(error){reject(error);}};
        image.onerror=()=>{clearTimeout(timer);reject(new Error('Mask unavailable.'));};image.src=url.href;
      });
      cache.set(url.href,promise);promise.catch(()=>cache.delete(url.href));
    }
    return cache.get(url.href);
  }
  async function sample(marker,frame){
    if(!frame.instance_map)throw new Error('No instance mask.');
    if(!Number.isFinite(marker.x)||!Number.isFinite(marker.y)||marker.x<0||marker.x>1||marker.y<0||marker.y>1)throw new Error('Invalid marker coordinates.');
    const map=await pixels(frame.instance_map),x=Math.min(map.width-1,Math.floor(marker.x*map.width)),y=Math.min(map.height-1,Math.floor(marker.y*map.height)),at=(y*map.width+x)*4;
    return {width:map.width,height:map.height,object_id:map.data[at]*65536+map.data[at+1]*256+map.data[at+2]-1};
  }
  async function collect(tasks,dataset,catalogue){
    const sources=new Map(dataset.episodes.map(ep=>[ep.id,ep]));
    const jobs=tasks.layout.episodes.flatMap(ep=>ep.markers.map(marker=>({episode_id:ep.episode_id,marker,frame:sources.get(ep.episode_id).frames.find(frame=>frame.id===marker.anchor_frame),catalogue})));
    const results=new Array(jobs.length);let cursor=0;
    await Promise.all(Array.from({length:Math.min(8,jobs.length)},async()=>{
      while(cursor<jobs.length){const i=cursor++,job=jobs[i];let found=null;
        try{found=await sample(job.marker,job.frame);}catch(_){/* Explicit unavailable, never substitute proposal metadata. */}
        results[i]=root.L2Redpoints.createAutomaticLabel({...job,sample:found});
      }
    }));
    return results;
  }
  root.L2InstanceLabels=Object.freeze({sample,collect});
})(window);
