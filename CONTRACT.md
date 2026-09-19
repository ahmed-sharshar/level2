# Level 2 annotation implementation contract

Separate new static site; do not modify annotation-site, original scenes, or human exports.
Source: /data/Ahmed/frr_trial/scenes_reference_100px_20260919.
Workplan: BLOCKMIND_Level2_Workplan_Sharshar.docx; later user decisions supersede its MST instruction: native reciprocal R2R graph, fixed existing 12 frames, step3m/match0.75m/visibility100px160x128.

## Runtime assets (data agent owns builder and JSON)

`dataset.json`: {schema:'blockmind_l2_dataset_v1',build_id,source,protocol,episodes:[...]}.
Episode: {id,scan_id,assembly_id,boundary_object_id,boundary_class,quality_note,visual_verdict,frames:[...],proposed_markers:[...],audit_links:{...}}.
Frame: {id:'f01',index:1,side:'indoor'|'exterior',image,width,height,source_image,sha256,capture_id,region_id,camera_to_world,heading_deg,pitch_deg,instance_map,boundary_mask,boundary_pixels,boundary_bbox,objects:[{object_id,mpcat40,name,pixels}],geometry_visibility_hint:'visible'|'absent'}.
Paths relative to site root. RGB unmodified. `instance_map`: RGB PNG160x128 encodes native instance ID+1 in big-endian 24bit, zero=unknown. boundary_bbox normalized [x0,y0,x1,y1] or null; suggested only.
Proposed marker: {id:'I1'..'I4'/'E1'..'E4',side,anchor_frame:'f01',x,y,object_id,mpcat40,observations:[{frame_id,x,y,source:'mesh_projection'}],source:'mesh_proposal',world_point?:[x,y,z]}; x/y normalized [0,1] top-left, integerimage pixels round(x*(width-1)). Human coordinator must accept/edit; predictions not labels.
`catalogue.json`: {schema:'blockmind_l2_catalogue_v1',build_id,objects:[{id,name}],materials:[{id,label,family,reference:{...}}],suggestions_by_mpcat40:{id:[strings]},all_material_suggestions:[strings],vhc_allowed_pairs_status:'not_supplied',provenance:{...}}. Preserve hierarchy values as references, not frozen familyC GT.

## Shared layout (coordinator only, no human answers)

`blockmind_l2_layout_v1`: {schema,build_id,layout_id,created_at,coordinator,conditions:{version,open,sealed,no_closure_policy},episodes:[{episode_id,disposition:'include'|'exclude',exclusion_reason,markers:[{id,side,anchor_frame,x,y,object_id,mpcat40,observations:[{frame_id,x,y,source}]}],directions:[{id:'d1'|'d2',text,reference_frame,x,y}],boundary_boxes:[{frame_id,x0,y0,x1,y1}],setup_notes,setup_reviewed:boolean}]}.
Conditions are immutable canonical shared definitions, included in layout identity: open means fully open the designated existing closure, all other permanent obstructions unchanged; sealed means close and tightly seal that same closure without changing its material/glazing or other geometry. No existing closure/unknown counterfactual material means sealed judgments ND, not inventing a panel. Exposed as L2Core.CONDITIONS. Explicit setup_reviewed:true required before an included episode can freeze. makeLayout strips diagnostic-only projection properties from observations; dataset retains provenance.
Include requires3–5 markers each side, distinct IDs, valid coordinates/reference frames, exactly2 nonempty distinct direction texts+visible-referencepoint, and ≥2 pre-crossing boundary boxes (coordinate/identity proposals must be explicitly approved by coordinator). Layout editing is allowed before freeze; frozen export must pass validation. Both independent raters import the SAME layout; hash/version mismatch blocks consensus. No auto material/transparency/reachability truth from meshes.

## Human answers (schema agent owns core.js + validators/consensus)

Schema `blockmind_l2_annotations_v1`: {schema,build_id,layout_id,annotator,created_at,updated_at,annotation_status:'draft'|'complete',layout,episodes:[{episode_id,status:'not_started'|'in_progress'|'complete'|'excluded',exclusion_reason,answers:{scene:{...},boundary:{...},pathways:{d1:{open:{...},sealed:{...}},d2:{...}},surfaces:{I1:{...}},boundary_visibility:{f01:{visibility,object_match,box_correct,notes},...},notes},completed_at}]}.
Every human categorical attribute starts null and accepts 'not_determinable'. A blank is unanswered, not uncertainty. No labels copied between raters. Core default functions create ALL keys.
Scene required fields: crossing_valid yes/no/ND; boundary_class outdoor/semi_outdoor/ND; exterior_enclosure open_air/roofed_open_sides/enclosed_porch/sunroom/garage/glazed_lobby/other/ND; shelter overhead/partial/none/ND; canonical_context_clear yes/no/ND.
Boundary required fields: object_identity_correct yes/no/ND; kind hinged_door/sliding_door/folding_door/garage_door/gate/open_passage/window/other/ND; pane_transparency clear/obscured/opaque/ND; glazing present/absent/ND; observed_state open/closed/ajar/no_closure/ND; material free text or ND; hierarchy_id catalogue ID or '__other__' or ND; reflectance reflective/non_reflective/ND; air_gap yes/no/ND; pane_in_mesh yes/no/ND; phantom_geometry yes/no/ND; isolated_leaf yes/no/ND; mask_matches_rgb yes/no/ND. Optional notes.
Pathways: for each d1,d2 and open,sealed, required direct_sun,diffuse_light,air,rain each yes/no/ND. Stated hypothetical conditions are distinct from observed boundary state. Rule displayed: direct sun can pass clear glass; rain cannot pass intact sealed glass; distinguish diffuse light and direct sun.
Surface required fields: object_name free text or ND; material free text or ND; hierarchy_id catalogue ID/'__other__'/ND; reflectance reflective/non_reflective/ND; finish untreated/painted/coated_sealed/glazed/polished/fabric/composite/other/ND; substrate_known yes/no/ND; substrate_material text/ND and substrate_hierarchy_id catalogue/'__other__'/ND (nullable unless substrate_known=yes, then required); shelter overhead/partial/none/ND; reachable:{d1:{open:{sun,rain},sealed:{sun,rain}},d2:{...}} each yes/no/ND; visibility:{f01..f12:direct/through_glass/reflection/occluded/out_of_frame/not_determinable}; optional notes. Visible finish and underlying substrate are different facts. Native object/category IDs are layout metadata, not automatic human answers.
Boundary visibility all12 frames: visibility as above; object_match yes/no/ND; box_correct yes/no/ND. These retain futureL3 certification including reflection and glass; no claim12frames support every horizon.
Completion requires all required cells incl visibility answered,3–5markers/side, nonemptyNDreason in episode notes if any ND, valid layout; exclude requires reason. Final export only all layout episodes complete/excluded. Completed records locked until explicit reopen. Surface counts/layout immutable to reviewers. Unknown/proposer values never auto GT.

## JS shared API (core.js, window.L2Core)

`makeLayout(dataset,coordinator)` creates draft fromproposals with emptydirections, suggestedboundaryboxes; UI requires explicitfreezeconfirmation.
`validateLayout(layout,dataset)` returns string[] errors (does NOT require layout_id for draft).
`layoutId(layout)` deterministic canonical content hash excluding created_at/coordinator/layout_id; includes datasetbuild and all episode content. Pure sync; identity checksum not authentication.
`createEpisode(layoutEpisode)` returns episode answer record above.
`validateEpisode(record,layoutEpisode,catalogue)` returns string[]; require full answers oncompleteintent.
`validateExport(doc,dataset,catalogue,requireComplete=false)` returns string[]. Validate provenance/identity even drafts, all enums/types/coordinates/object/frame IDs; drafts may be incomplete but not malformed. Reject __proto__/constructor/prototype keys recursively.
`createExport(dataset,layout,annotator)` returns draft complete skeleton.
`FIELDS` exposes option arrays keyed by field name (see above), `ND='not_determinable'`, `stableStringify`, `clone`.
`validateDraftEpisode(record,layoutEpisode,catalogue)` may be helper for structural/enum checking.
UI and core agents coordinate any API clarifications directly. UI stores backups localStorage namespaced path/build/layout/annotator with revision-conflict locking and export recovery. JSONimport transactional: validate completely before overwrite; confirmation before replacing existing local work.

## UI scope

Coordinator mode: all56episodes, 12framefilmstrip/playback, clickable normalized point placement/movement, sharedmarker3–5/side, directiontext+anchorclick, boundaryboxdraw/edit2pre, discardbad episode withreason, explicit reviewedconfirmation; freeze/export sharedlayout. Importexistinglayout editable newversion.
Annotator mode: importfrozenlayout thenID; scene+boundary+surface+reachability+visibility tabs; no defaults; draftautosave/export/import, checklist/complete/reopen, progress, nextincomplete/filter/search. "Mark remaining not determinable" needsconfirmation+reason, never implicitdefault. Batchvisibility marking explicit and local tooneannotator. Mask/hinttoggles labeled machineproposals, never model-visible; log hintusage separately optional.
Neutral numbered markers and clean RGB prompt preview (nohouse/materiallabels). No privateanswers uploaded and noAPIcalls. Keyboard navigable/mobile. Separate coordinator reference metadata vs independent answers. Ratercannotseeanother's answers via UI (not authentication; distinctbrowserprofiles recommended).

## Offline analysis tools

Validate exports, merge exactly two distinct independent raters samebuild+samefrozenlayout, Cohen kappa per comparable attribute + n_agreed/n_compared/n_disagreement/unanswered/excluded and completeness. Do not adjudicate disagreements. Consensus only exact matching human fields; retain disagreements separately, unknownnotnegative. Drop flags per field/marker/episode and per-family eligibility, not pretendall itemgeneratorimplemented. NDconsensus retained as explicit NDeligible. FamilyC disabled until reviewed frozenVHC allowed-pairs table supplied, validatedversionandsha. No physicalsimulations/noautomaticmaterialphysicsGT.
Documentation maps workplanT5/T5b/T6/T14 to allfields, reports missingProtocol§3/§9 andNorhandirections/VHCpairtable, no claim these absent specifications implemented exactly. Preserve machineprovenance separately; no annotations seededfromold unrelatedLevel1points.
