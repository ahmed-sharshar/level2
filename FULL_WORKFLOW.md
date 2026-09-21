# Full guided collection implementation contract

The new default is a complete guided Level 2 collector, not another basic-only page. Existing core.js, guided-core.js, guided.html and advanced.html remain valid legacy interfaces. Do not edit CONTRACT.md or immutable dataset/catalogue/assets; their build identity must remain stable. The user explicitly elected to build now and review the missing research settings later. Never invent approval, human labels, Protocol B/C options or VHC allowed pairs.

## Ownership

- Schema/backend: full-core.js, collection-tasks.json, scripts/create_collection_tasks.cjs, scripts/validate_export.py, scripts/consensus.py, any new full backend helpers and unit tests.
- Annotator UI: full.html, full.js, full.css. Root promotes full.html to index.html after tests.
- Research preparation: setup.html, setup.js, setup.css. Uses shared full-core.js. Edit points/directions/boxes/settings and record glass/trajectory audits; no human material answers in shared tasks.
- Root: documentation, integration tests, packaging, later-output review tools if needed.

## Shared task package

Schema blockmind_l2_tasks_v1. Use {schema,build_id,task_id,created_at,coordinator,layout,settings,audits}.
layout uses the existing Core.makeLayout / layout_v1 fields, including setup_reviewed, 3–5 markers per side, two feature-relative directions with visible anchors, and two pre-crossing boundary boxes. Its layout_id may remain empty in a draft. task_id is a deterministic content identity, excluding volatile created_at/coordinator display names; include all label-bearing geometry, directions, canonical open/sealed conditions and settings. Confirm source frames and boundary object identity via immutable dataset, never new mesh-derived GT.
settings: {version:'blockmind_l2_collection_v1',hierarchy_sha256:string,hierarchy_reviewed:false,hierarchy_reviewer:'',protocol_reviewed:false,protocol_reviewer:'',protocol_notes:'',vhc_allowed_pairs_status:'not_supplied'}.
audits keyed episode ID: {trajectory:{selected:false,valid:null,notes:''},glass:{selected:false,pane_present:null,phantom_geometry:null,separate_leaf:null,evidence_frames:[],notes:''}}. The yes/no values accept not_determinable. Research audits are not rater votes or model-visible data.
collection-tasks.json ships as explicitly unreviewed draft with blank directions and no human audit answers. A researcher publishes a reviewed version by saving the exported file as collection-tasks.json. The annotator page loads it automatically: no role or import prerequisite to start. Local researcher drafts may be resumed/exported but must not silently become the shared published task file.

## Full annotation export

Current documents also carry `collection_checks_version: 1`. This extends
`checks` with `opening_passage:{d1:{open:null,sealed:null},d2:{open:null,sealed:null}}`
and `indoor_visibility:{indoorMarkerId:null}`. Both use canonical nonempty arrays
or null; exclusive Nothing/None and ND are singleton arrays. Questions declare
`kind:'multiselect'`. `needsCollectionUpgrade`/`upgradeCollection` preserve old
answers and reopen completion for new blank checks; mixed collection scopes
cannot be combined. See `COLLECTION_CHECKS.md` for exact values and storage.

Schema blockmind_l2_annotations_v2: {schema,boundary_questions_version:1,build_id,task_id,tasks,annotator,profile:'l2'|'l2_l3',created_at,updated_at,annotation_status:'draft'|'complete',benchmark_ready:false,episodes,ui,migration_log}.
episodes retains Core.createEpisode records plus checks:{indoor_region_correct:null,exterior_region_correct:null,boundary:{width_class:null,blockage:null},surfaces:{markerId:{anchor_correct:null,same_surface_across_frames:null,obstruction:null}}}.
The 2026-09-21 additive boundary scope requires human width category and blockage. Old exports without the version marker retain their original validation scope and are safely upgraded before editing on the current homepage. Mixed-scope consensus is rejected. See BOUNDARY_QUESTIONS.md for enums, machine-span provenance and preservation behavior.
Obstruction: none/overhead/side/overhead_and_side/other/not_determinable. Other check fields yes/no/not_determinable. All human judgments start null.
ui:{episode:0,section:'scene',question:0,frame:0}. migration_log is a list of explicit non-answer provenance records from supported imports. Always expose benchmark_ready:false: completing one rater's annotation does not establish benchmark GT.

## Required collection

Level 2: all five legacy scene fields; two region correctness checks; all legacy boundary facts except pane_in_mesh,phantom_geometry,isolated_leaf,mask_matches_rgb (those are researcher audit tasks); all marked-surface object/material/hierarchy/reflectance/finish/substrate-known/shelter facts; substrate material/hierarchy only if known=yes; each surface's three checks; each surface×two directions×open/sealed×sun/rain; four opening-passage consistency checklists. Require visibility/object_match/box_correct for the two designated pre-crossing boundary-box frames and one after-crossing visibility frame-set per indoor point. Do not force full 12-frame Level 3 visibility to complete Level 2.
Level 2+3 adds all 12 boundary visibility/correctness cells and all 12 visibility cells per surface. Distinguish direct/through_glass/reflection/occluded/out_of_frame/not_determinable. No missing observations imply invisibility.
Not sure is explicit ND; Skip leaves unanswered. A short episode-level uncertainty note is required when completing a record with ND, not one note for each field. Explicit exclusion with a reason is allowed. Save partial work any time; completed records lock until reopened; final export requires each episode complete or excluded and reviewed task setup. Show readable next-missing links, not raw validator walls.
Task setup and protocol/hierarchy approval can remain pending while basic facts are saved. Direction-dependent questions must not be presented as answerable without approved nonempty directions and reference anchors. Completion fails with a concise researcher-pending explanation, never auto-labels missing settings.

## Shared JS API: window.L2Full and CommonJS

Current red-point exports also contain paired `automatic_surface_labels` and
`surface_label_audit` arrays. Actual instance-mask pixels at shared anchors supply
the machine object class; human object/material/hierarchy answers remain separate.
The latter array is refreshed on save and export. Exact object-category agreement
is not material agreement, and uncomparable/free-text responses are explicitly
excluded from that comparison. Legacy exports without these arrays still validate.
See `RED_POINTS.md` for fields and provenance limits. New researcher preparation
uses the optional versioned `settings.points_per_side: 4` policy; old published
tasks remain unchanged until a researcher explicitly replaces them.

createTasks(dataset,catalogue,coordinator='') -> task package with valid content ID.
taskId(tasks) -> content ID; validateTasks(tasks,dataset,catalogue,requireReady=false)-> string[];
episodeReady(tasks,episodeIndex,dataset,catalogue)-> {ready,errors}.
create(dataset,catalogue,tasks,annotator,profile='l2')-> full draft.
validate(doc,dataset,catalogue,requireComplete=false)-> string[].
validateEpisode(doc,episodeIndex,dataset,catalogue,requireComplete=true)-> string[].
questions(doc,episodeIndex,dataset,catalogue)-> list {id,path,section,title,help,kind:'choice'|'text'|'hierarchy',options:[{value,label}],marker_id?,frame_id?,direction?,condition?}. Paths are record-relative (answers.scene...,checks...). Sections: scene,boundary,surfaces,exposure,pathways,visibility. Dependencies/conditional substrate fields reflected dynamically. Surface questions and exposure show exact target anchor; each scenario shows direction text/reference and open/sealed description. Questions remain machine definitions, not model answer options.
progress(doc,episodeIndex,dataset,catalogue)-> {answered,total,missing,sections,setup_ready}.
migrate(source,tasks,dataset,catalogue,annotator,profile='l2')-> {doc,report}. Accept guided_v1, annotations_v1, or annotations_v2 belonging to the SAME annotator/build. Copy surface labels only on uniquely identical anchor frame/coordinates/side, and compatible native instance when known. Never match solely by point ID. Copy direction-dependent answers only when source/target direction+condition definitions match. Changed targets require new answers; invalidate completion. Return precise copied/cleared warnings and require UI confirmation. Preserve source file externally; record source content hash in migration_log. Old source is never modified.
consensus(first,second,dataset,catalogue) -> exact two-rater report compatible with existing agreement report fields. Validate complete full exports, distinct annotators, matching task identities/profile. No adjudication, uncertainty distinct from no, disagreements retained/drop flags. No MCQs or C/D physics GT invented. Existing validate_export.py and consensus.py dispatch full v2 exports through these exact JS rules while retaining v1 behavior.

## Interface principles

The later compact presentation supersedes the one-question-per-screen instruction below for surfaces, exposure, pathways and the five-question opening overview: see `COMPACT_WORKFLOW.md`. Required facts are retained; the versioned boundary extension adds width category and blockage without rewriting prior answers or research settings.

Name then Start; no researcher-role dropdown on ordinary entry. Section buttons and one short question card, Back/Next/Skip, image always visible, autojump to target anchor. Searchable descriptive hierarchy picker, not raw IDs or a huge initial form. Contextual direction/reference and open/sealed status always visible while answering physics questions. Show direct-sun-passes-clear-glass/rain-does-not rule in exposure/pathways. Shared target geometry cannot be edited by independent raters; allow target issue flags/notes. Researcher setup supplies add/move/delete/cross-frame locations and boxes once for both raters. Keep machine masks/hints in researcher view, not the ordinary prompt.

Storage namespaces per role/basepath/build/task/annotator; recover safely from malformed storage/quota failures; stale tabs lock with recovery download. Transactional own-file imports, explicit migration/rebase previews, no importing another rater's labels, no fake defaults. Exports preserve task definitions and original field schema. No external network/API/model calls.
