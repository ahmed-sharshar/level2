#!/usr/bin/env python3
"""Complete shared collection inputs without inventing human research approval.

Uses only frozen RGB/masks/geometry. Adds three RGB-inspected physical patches,
keeps all 445 original targets byte-for-value, and defines explicit hypothetical
directions. Native instance/category/region labels are retained even when wrong.
No answer, material, weather, or benchmark ground truth is generated.

Run with --review-dir /tmp/... to create diagnostic contact sheets without
changing collection-tasks.json. Run with --write after reviewing the evidence.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

from build_dataset import Builder

SITE = Path(__file__).resolve().parents[1]
BASE_SHA = '7d89b14102d8a9f148807ad1779303dfacd38cd11cdab7a7c04088198bc1cd26'
BASE_TASK_ID = 'l2tasks-3f3e106fcb6cfc1fb2981a8eadd87938f9e9275d734dc491af4f0c38a162c8c3'
PREPARATION_ID = 'provisional-collection-20260921-v1'
# The largest native mask in Scene 23 includes the view beyond the opening.
# RGB review favors the plainly visible door leaf in f07, not sky in f06.
REFERENCE_FRAME_OVERRIDES = {
    'scene_001_1LXtFkjw3qL_O103': ('f01', 'Front-facing door view instead of an extreme-edge door sliver in f07'),
    'scene_023_SN83YJsR3w2_O1134': ('f07', 'Visible door leaf instead of the apparent sky covered by the f06 native mask'),
}
# Pixel centers refer to unchanged 160x128 RGB24 instance masks, not resized RGB.
# All three source RGB images were inspected. Do not infer material from this list.
ADDITIONS = [
    {'scene': 8, 'id': 'E4', 'frame': 'f10', 'pixel': [93, 111], 'object': 722,
     'description': 'Unobstructed floor patch on the balcony, away from the railing and door.',
     'warning': 'Native floor instance 722 is assigned to indoor region 2 although this visible patch lies on the balcony. Preserve the native assignment; annotators judge the real patch.'},
    {'scene': 38, 'id': 'E3', 'frame': 'f09', 'pixel': [27, 25], 'object': 544,
     'description': 'Exterior-side light-colored facade patch left of the entrance, above the intercom.',
     'warning': 'The real facade patch has native category 0 (void/remove). Keep that raw category; never replace it with the proposed visual object name.'},
    {'scene': 38, 'id': 'E4', 'frame': 'f09', 'pixel': [143, 32], 'object': 597,
     'description': 'Visible upper panel on the exterior-facing side of the boundary door leaf, away from its handle.',
     'warning': 'This target is a patch of the designated boundary door. Scene 38 retains its existing context-sufficiency and registration warnings.'},
]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def mask_ids(site, frame):
    rgb = np.asarray(Image.open(site / frame['instance_map']).convert('RGB'), dtype=np.int32)
    return rgb[:, :, 0] * 65536 + rgb[:, :, 1] * 256 + rgb[:, :, 2] - 1


def native_arrays(site, episode):
    with np.load(site / episode['geometry_assets']['raycast_cache'], allow_pickle=False) as loaded:
        arrays = {key: loaded[key] for key in loaded.files}
    arrays['index'] = {str(name): i for i, name in enumerate(arrays['image_names'])}
    return arrays


def make_addition(site, episode, spec):
    frame = next(f for f in episode['frames'] if f['id'] == spec['frame'])
    assert frame['side'] == 'exterior'
    arrays = native_arrays(site, episode)
    ix = arrays['index'][frame['source_image']]
    px, py = spec['pixel']
    oid = spec['object']
    ids = mask_ids(site, frame)
    assert ids.shape == (128, 160) and int(ids[py, px]) == oid
    assert int(arrays['instance_ids'][ix, py, px]) == oid
    radius = float(distance_transform_edt(np.pad(ids == oid, 1))[1:-1, 1:-1][py, px])
    assert radius >= 5, 'Target must be well inside its actual instance mask.'
    world = Builder.world_point(arrays, ix, px, py)
    lookup = read(site / episode['geometry_assets']['instance_lookup'])['objects'][str(oid)]
    observations, residuals = [], []
    for f in episode['frames']:
        projected = Builder.project(world, arrays, arrays['index'][f['source_image']], oid)
        if projected is not None:
            x, y, residual = projected
            observations.append({'frame_id': f['id'], 'x': x, 'y': y, 'source': 'mesh_projection'})
            residuals.append({'frame_id': f['id'], 'depth_residual_m': residual})
    assert any(o['frame_id'] == frame['id'] for o in observations)
    marker = {'id': spec['id'], 'side': 'exterior', 'anchor_frame': frame['id'],
              'x': (px + .5) / 160, 'y': (py + .5) / 128,
              'object_id': oid, 'mpcat40': int(lookup['mpcat40_id']), 'observations': observations}
    provenance = {**spec, 'episode_id': episode['id'], 'anchor_image': frame['image'],
                  'anchor_image_sha256': sha(site / frame['image']),
                  'instance_mask': frame['instance_map'], 'mask_sha256': sha(site / frame['instance_map']),
                  'native_mpcat40': lookup['mpcat40_id'], 'native_region_id': lookup['region_id'],
                  'mask_interior_distance_px': radius, 'depth_m': float(arrays['depths'][ix, py, px]),
                  'world_point_m': world.tolist(), 'projection_checks': residuals,
                  'rgb_inspection': 'assistant_visual_review_not_human_certification',
                  'human_approved': False, 'material_assigned': False}
    return marker, provenance


def directions(site, episode):
    # Largest actual target-mask sighting gives an inspectable reference, not a
    # bounding-box center that could land on an unrelated/occluding object.
    frame = max(episode['frames'], key=lambda f: (f['boundary_pixels'], -f['index']))
    if episode['id'] in REFERENCE_FRAME_OVERRIDES:
        frame = next(f for f in episode['frames'] if f['id'] == REFERENCE_FRAME_OVERRIDES[episode['id']][0])
    ids = mask_ids(site, frame)
    target = ids == episode['boundary_object_id']
    assert int(target.sum()) == frame['boundary_pixels'] and target.any()
    distance = distance_transform_edt(np.pad(target, 1))[1:-1, 1:-1]
    py, px = np.unravel_index(distance.argmax(), distance.shape)
    common = {'reference_frame': frame['id'], 'x': (int(px) + .5) / 160, 'y': (int(py) + .5) / 128}
    noun = f'the marked boundary opening in image {frame["index"]}'
    result = [
        {'id': 'd1', 'text': f'From directly above the exterior side of {noun}, vertically downward. '
         'Imagine overhead sunlight or vertically falling rain. Keep the real roof, walls and covers in place. '
         'The arrow marks the opening reference, not a ray. This is a hypothetical scenario, not observed weather.', **common},
        {'id': 'd2', 'text': f'From the exterior side horizontally toward {noun} and into the indoor room '
         '(opposite to the walk across the threshold). Imagine sunlight or wind-driven rain arriving sideways '
         'along that exterior-to-interior direction. Keep all other walls and covers in place. '
         'The arrow marks the opening reference, not a ray. This is a hypothetical scenario, not observed weather.', **common},
    ]
    indoor = np.asarray(episode['frames'][5]['camera_to_world'], dtype=float)[:3, 3]
    exterior = np.asarray(episode['frames'][6]['camera_to_world'], dtype=float)[:3, 3]
    vector = indoor - exterior
    vector[2] = 0
    assert np.linalg.norm(vector) > .05, 'Sideways direction requires distinct threshold positions.'
    vector /= np.linalg.norm(vector)
    provenance = {'episode_id': episode['id'], 'status': 'proposed_not_research_approved',
                  'reference_frame': frame['id'], 'reference_image': frame['image'],
                  'reference_image_sha256': sha(site / frame['image']),
                  'reference_pixel_160x128': [int(px), int(py)],
                  'reference_object_id': int(ids[py, px]), 'boundary_pixels': int(target.sum()),
                  'reference_method': (REFERENCE_FRAME_OVERRIDES[episode['id']][1] + '; interior-distance maximum'
                     if episode['id'] in REFERENCE_FRAME_OVERRIDES else 'maximum boundary instance-mask area; interior-distance maximum'),
                  'reference_visual_check': 'assistant_contact_sheet_review_not_human_certification',
                  'd1_world_travel_direction': [0, 0, -1],
                  'd2_world_travel_direction': vector.tolist(),
                  'd2_vector_method': 'horizontal exterior f07 camera to indoor f06 camera',
                  'weather_observed_or_inferred': False,
                  'existing_quality_note': episode.get('quality_note', '')}
    return result, provenance


def overlay(site, frame, points, width=600):
    image = Image.open(site / frame['image']).convert('RGB')
    image.thumbnail((width, round(width * .8)))
    draw = ImageDraw.Draw(image)
    for label, x, y, color in points:
        u, v = x * image.width, y * image.height
        draw.ellipse((u-7, v-7, u+7, v+7), fill=color, outline='white', width=2)
        draw.text((min(u+10, image.width-85), max(0, v-18)), label, fill=color, stroke_width=1, stroke_fill='black')
    return image


def review_sheets(site, destination, dataset, tasks, added):
    destination.mkdir(parents=True, exist_ok=True)
    for audit in added:
        episode = next(e for e in dataset['episodes'] if e['id'] == audit['episode_id'])
        frame = next(f for f in episode['frames'] if f['id'] == audit['frame'])
        ep = next(e for e in tasks['layout']['episodes'] if e['episode_id'] == episode['id'])
        points = [(m['id'], m['x'], m['y'], 'red' if m['id'] == audit['id'] else 'yellow')
                  for m in ep['markers'] if m['anchor_frame'] == frame['id']]
        overlay(site, frame, points, width=1280).save(destination / f'scene_{audit["scene"]:03d}_{audit["id"]}.jpg')
    for start in range(0, len(dataset['episodes']), 8):
        sheet = Image.new('RGB', (1600, 1450), '#161d24')
        draw = ImageDraw.Draw(sheet)
        for slot, (source, ep) in enumerate(zip(dataset['episodes'][start:start+8], tasks['layout']['episodes'][start:start+8])):
            col, row = slot % 2, slot // 2
            x, y = col * 800, row * 362
            direction = ep['directions'][0]
            ref = next(f for f in source['frames'] if f['id'] == direction['reference_frame'])
            exterior = source['frames'][9]
            draw.text((x+8, y+6), f'{start+slot+1:02d} {source["id"]} / reference {ref["id"]} | exterior f10', fill='white')
            sheet.paste(overlay(site, ref, [('REF', direction['x'], direction['y'], 'yellow')], 392), (x+4, y+30))
            sheet.paste(overlay(site, exterior, [], 392), (x+404, y+30))
        sheet.save(destination / f'direction_review_{start+1:02d}_{min(start+8,56):02d}.jpg')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=SITE)
    parser.add_argument('--review-dir', type=Path)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--node', default=shutil.which('node') or '/home/ahmed/miniconda3/envs/scannetpp/lib/python3.10/site-packages/playwright/driver/node')
    args = parser.parse_args()
    site = args.site.resolve()
    path = site / 'collection-tasks.json'
    dataset, tasks = read(site / 'dataset.json'), read(path)
    before = deepcopy(tasks)
    report_path = site / 'data' / 'provisional_collection_preparation.json'
    previous = read(report_path) if report_path.exists() else None
    assert sha(path) == BASE_SHA or (previous and previous['prepared_tasks_sha256'] == sha(path)), 'Refusing to overwrite unrecognized shared task edits.'
    added = []
    for spec in ADDITIONS:
        source, ep = dataset['episodes'][spec['scene']-1], tasks['layout']['episodes'][spec['scene']-1]
        marker, provenance = make_addition(site, source, spec)
        existing = next((m for m in ep['markers'] if m['id'] == marker['id']), None)
        if existing is not None:
            assert existing == marker, 'Do not replace an existing target.'
        else:
            ep['markers'].append(marker)
        added.append(provenance)
    direction_audits = []
    for source, ep in zip(dataset['episodes'], tasks['layout']['episodes']):
        proposed, audit = directions(site, source)
        # The file-SHA guard above permits only the frozen baseline or a previous
        # exact generated result. Any human-edited task is rejected, never reset.
        assert all(not d['text'] for d in ep['directions']) or ep['directions'] == proposed or previous
        ep['directions'] = proposed
        ep['setup_reviewed'] = False
        notes = ('Collection inputs prepared from frozen RGB/masks/geometry. Directions are proposed hypothetical scenarios, '
                 'not observed weather or approved research settings. Human scene/target validation and protocol approval remain pending.')
        if notes not in ep['setup_notes']:
            ep['setup_notes'] += ('\n' if ep['setup_notes'] else '') + notes
        for extra in added:
            if extra['episode_id'] == ep['episode_id'] and extra['warning'] not in ep['setup_notes']:
                ep['setup_notes'] += '\n' + extra['warning']
        direction_audits.append(audit)
        assert all(sum(m['side'] == side for m in ep['markers']) == 4 for side in ['indoor', 'exterior'])
    tasks['settings']['collection_mode'] = 'provisional'
    tasks['settings']['points_per_side'] = 4
    tasks['settings']['hierarchy_reviewed'] = False
    tasks['settings']['protocol_reviewed'] = False
    tasks['coordinator'] = 'BLOCKMIND automated provisional preparation (not human approval)'
    tasks['layout']['coordinator'] = tasks['coordinator']
    # Use the deployed JS identity implementations, including JS number encoding.
    js = "const fs=require('fs'),Core=require('./core.js'),Full=require('./full-core.js');const t=JSON.parse(fs.readFileSync(0,'utf8'));t.layout.layout_id=Core.layoutId(t.layout);t.task_id=Full.taskId(t);process.stdout.write(JSON.stringify(t,null,2)+'\\n');"
    output = subprocess.check_output([args.node, '-e', js], cwd=site, input=json.dumps(tasks).encode())
    tasks = json.loads(output)
    for old_ep, ep in zip(before['layout']['episodes'], tasks['layout']['episodes']):
        for old_marker in old_ep['markers']:
            assert next(m for m in ep['markers'] if m['id'] == old_marker['id']) == old_marker
    report = {'preparation_id': PREPARATION_ID, 'source_tasks_sha256': BASE_SHA,
              'source_task_id': BASE_TASK_ID, 'prepared_tasks_sha256': hashlib.sha256(output).hexdigest(),
              'prepared_task_id': tasks['task_id'], 'dataset_build_id': dataset['build_id'],
              'collection_mode': 'provisional', 'research_approved': False, 'benchmark_ready': False,
              'summary': {'episodes': 56, 'preserved_original_targets': 445, 'added_targets': 3,
                          'total_targets': 448, 'directions': 112, 'points_per_side': 4},
              'frozen_inputs_untouched': ['dataset.json', 'catalogue.json', 'RGB images', 'instance masks', 'geometry'],
              'added_targets': added, 'direction_definitions': direction_audits,
              'method_limitations': ['Image review is assistant evidence, not independent human certification.',
                 'Directions are shared, anchored hypothetical collection scenarios, not approved benchmark protocol.',
                 'Raw native category and region disagreements are retained explicitly.',
                 'Existing scene quality/registration warnings remain in the frozen dataset.',
                 'No materials, exposure answers or benchmark ground truth were assigned.']}
    if args.review_dir:
        review_sheets(site, args.review_dir, dataset, tasks, added)
    if args.write:
        path.write_bytes(output)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'written': args.write, 'task_id': tasks['task_id'], **report['summary'],
                      'review_dir': str(args.review_dir) if args.review_dir else None}, indent=2))


if __name__ == '__main__':
    main()
