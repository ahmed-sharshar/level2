/* Synthetic fixtures only: these are not human annotations or research GT. */
const fs = require('fs'), path = require('path');
const site = path.resolve(__dirname, '..'), C = require(path.join(site, 'core.js'));
const dataset = JSON.parse(fs.readFileSync(path.join(site, 'dataset.json')));
const catalogue = JSON.parse(fs.readFileSync(path.join(site, 'catalogue.json')));
const layout = C.makeLayout(dataset, 'synthetic-coordinator');
for (const [i, episode] of layout.episodes.entries()) {
  if (i) {
    episode.disposition = 'exclude';
    episode.exclusion_reason = 'Synthetic automated test fixture excludes this episode; not a research judgment.';
  } else {
    episode.setup_reviewed = true;
    episode.setup_notes = 'SYNTHETIC TEST ONLY: no human scene approval.';
    episode.directions = [
      {id:'d1',text:'Synthetic lateral test direction from the visible opening.',reference_frame:'f01',x:0.4,y:0.5},
      {id:'d2',text:'Synthetic downward test direction from the visible roof edge.',reference_frame:'f07',x:0.5,y:0.3}
    ];
  }
}
layout.layout_id = C.layoutId(layout);
const layoutErrors = C.validateLayout(layout, dataset);
if (layoutErrors.length) throw Error(JSON.stringify({count:layoutErrors.length,first:layoutErrors.slice(0,10)}));
const blank = C.createExport(dataset, layout, 'test-rater-01');
function unknown(value) {
  if (value === null) return C.ND;
  if (Array.isArray(value)) return value.map(unknown);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unknown(v)]));
  return value;
}
const complete = C.clone(blank);
const episode = complete.episodes[0];
episode.answers = unknown(episode.answers);
episode.answers.notes = 'SYNTHETIC TEST ONLY: explicit uncertainty for automated form/validator checks, not human GT.';
episode.status = 'complete'; episode.completed_at = new Date().toISOString();
complete.annotation_status = 'complete';
for (const doc of [blank, complete]) {
  const errors=C.validateExport(doc,dataset,catalogue,doc.annotation_status==='complete');
  if(errors.length)throw Error(JSON.stringify({count:errors.length,first:errors.slice(0,10)}));
}
const second = C.clone(complete);second.annotator='test-rater-02';
second.episodes[0].answers.scene.canonical_context_clear='yes';
process.stdout.write(JSON.stringify({layout,blank,complete,second}));
