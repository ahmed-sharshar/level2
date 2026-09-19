#!/usr/bin/env python3
"""Build the static Level 2 annotation bundle from frozen reference/100px episodes.

No model calls, label inference, re-routing, or image modifications. Geometry is a
coordinator aid, never human visibility/material/physics ground truth. Re-running
is deterministic and refuses to replace a differing generated asset unless
--replace-generated is explicit. It never writes to the source export.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


SITE = Path(__file__).resolve().parents[1]
SOURCE = Path('/data/Ahmed/frr_trial/scenes_reference_100px_20260919')
HIERARCHY = Path('/data/Ahmed/mit/new/data/material_hierarchy_v2_7.json')
SUGGESTIONS = Path('/data/Ahmed/mit/annotation-site/material_recommendations.json')
WIDTH, HEIGHT = 160, 128
STRUCTURAL = {1, 2, 4, 9, 16, 17, 24, 26, 27, 29, 30, 32, 35}
PREFERRED = {2: 10, 1: 9, 17: 8, 9: 7, 4: 6, 24: 5, 30: 5, 16: 4}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Builder:
    def __init__(self, source, site, replace=False):
        self.source, self.site, self.replace = source.resolve(), site.resolve(), replace
        self.assets, self.source_files, self.caches = {}, {}, {}
        self.category_names = {}
        self.stats = Counter()
        self.proposal_warnings = []

    def read(self, path):
        path = Path(path)
        self.source_files[str(path)] = sha(path)
        return json.loads(path.read_text(encoding='utf-8'))

    def destination(self, relative):
        p = self.site / relative
        if not p.resolve().is_relative_to(self.site):
            raise ValueError(f'Unsafe asset path: {relative}')
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def write_bytes(self, relative, data):
        p = self.destination(relative)
        digest = hashlib.sha256(data).hexdigest()
        if p.exists() and sha(p) != digest and not self.replace:
            raise FileExistsError(f'Differing generated file exists: {p}; use --replace-generated')
        if not p.exists() or sha(p) != digest:
            p.write_bytes(data)
        self.assets[relative] = digest
        return relative

    def write_json(self, relative, value):
        return self.write_bytes(relative, json.dumps(value, ensure_ascii=False,
                                indent=2, allow_nan=False).encode('utf-8') + b'\n')

    def copy(self, source, relative):
        source = Path(source)
        digest = sha(source)
        self.source_files[str(source)] = digest
        p = self.destination(relative)
        if p.exists() and sha(p) != digest and not self.replace:
            raise FileExistsError(f'Differing generated file exists: {p}')
        if not p.exists() or sha(p) != digest:
            shutil.copyfile(source, p)
        assert sha(p) == digest, (source, p)
        self.assets[relative] = digest
        return relative

    def png(self, relative, array):
        from io import BytesIO
        buffer = BytesIO()
        Image.fromarray(array).save(buffer, format='PNG', optimize=True)
        self.write_bytes(relative, buffer.getvalue())
        return relative

    def scan(self, scan_id):
        if scan_id in self.caches:
            return self.caches[scan_id]
        root = self.source / 'verification' / 'fresh_render'
        npz, lookup = root / f'{scan_id}.npz', root / f'{scan_id}.json'
        self.source_files[str(npz)] = sha(npz)
        with np.load(npz, allow_pickle=False) as loaded:
            arrays = {k: loaded[k] for k in loaded.files}
        arrays['index'] = {str(n): i for i, n in enumerate(arrays['image_names'])}
        objects = self.read(lookup)['objects']
        for obj in objects.values():
            cid, name = int(obj['mpcat40_id']), obj['mpcat40_name']
            if cid in self.category_names:
                assert self.category_names[cid] == name
            self.category_names[cid] = name
        assert arrays['instance_ids'].shape[1:] == (HEIGHT, WIDTH)
        assert arrays['depths'].shape == arrays['instance_ids'].shape
        assert int(arrays['instance_ids'].min()) >= -1
        assert int(arrays['instance_ids'].max()) < 2**24-1
        self.copy(npz, f'data/geometry/{scan_id}.npz')
        self.copy(lookup, f'data/geometry/{scan_id}.json')
        result = arrays, objects
        self.caches[scan_id] = result
        return result

    @staticmethod
    def world_point(arrays, array_index, px, py):
        fx, fy, cx, cy, nw, nh = arrays['intrinsics'][array_index].astype(float)
        z = float(arrays['depths'][array_index, py, px])
        assert np.isfinite(z) and z > 0
        # Native undistorted convention: x right, y bottom-origin, forward -z.
        u, v = (px + .5) * nw / WIDTH, nh - (py + .5) * nh / HEIGHT
        local = np.array([(u-cx)*z/fx, (v-cy)*z/fy, -z])
        pose = arrays['camera_to_world'][array_index].astype(float)
        return local @ pose[:3, :3].T + pose[:3, 3]

    @staticmethod
    def project(world, arrays, array_index, oid):
        pose = arrays['camera_to_world'][array_index].astype(float)
        # Inverse rather than transpose handles the rounded native matrix exactly.
        local = np.linalg.solve(pose[:3, :3], world-pose[:3, 3])
        z = -float(local[2])
        if z <= 0:
            return None
        fx, fy, cx, cy, nw, nh = arrays['intrinsics'][array_index].astype(float)
        x, y = (local[0]/z*fx+cx)/nw, (nh-(local[1]/z*fy+cy))/nh
        if not (0 <= x < 1 and 0 <= y < 1):
            return None
        px, py = int(x*WIDTH), int(y*HEIGHT)
        observed = float(arrays['depths'][array_index, py, px])
        if not np.isfinite(observed) or abs(observed-z) > max(.06, .015*z):
            return None
        if int(arrays['instance_ids'][array_index, py, px]) != int(oid):
            return None
        return float(x), float(y), abs(observed-z)

    def propose(self, episode, arrays, objects):
        proposals = []
        for side_no, (side, prefix) in enumerate([('indoor', 'I'), ('exterior', 'E')]):
            side_frames = episode['frames'][side_no*6:(side_no+1)*6]
            allowed_regions = set(episode['native_regions_per_side'][side_no])
            candidates = []
            for frame_no, f in enumerate(side_frames, start=side_no*6):
                ix = arrays['index'][f['source_image']]
                idmap, depth = arrays['instance_ids'][ix], arrays['depths'][ix]
                for oid in np.unique(idmap):
                    oid = int(oid)
                    if oid < 0 or oid == episode['boundary_object_id']:
                        continue
                    obj = objects[str(oid)]
                    cat = int(obj['mpcat40_id'])
                    if obj['region_id'] not in allowed_regions or cat <= 0:
                        continue
                    mask = (idmap == oid) & np.isfinite(depth) & (depth > 0) & (depth < 35)
                    if int(mask.sum()) < 60:
                        continue
                    # Padding makes image edges invalid proposal boundaries too.
                    distance = distance_transform_edt(np.pad(mask, 1))[1:-1, 1:-1]
                    flat_order = np.argsort(distance.ravel(), kind='stable')[::-1]
                    picked = []
                    for flat in flat_order:
                        py, px = divmod(int(flat), WIDTH)
                        radius = float(distance[py, px])
                        if radius < 2:
                            break
                        if any((px-x)**2 + (py-y)**2 < 25**2 for x, y in picked):
                            continue
                        world = self.world_point(arrays, ix, px, py)
                        assert self.project(world, arrays, ix, oid) is not None
                        candidates.append({'oid': oid, 'cat': cat, 'frame_no': frame_no,
                                           'array_index': ix, 'px': px, 'py': py,
                                           'radius': radius, 'area': int(mask.sum()),
                                           'world': world})
                        picked.append((px, py))
                        if len(picked) == 4:
                            break
            chosen, used_objects, used_categories = [], set(), set()
            for _ in range(4):
                usable = []
                for c in candidates:
                    if c['oid'] in used_objects:
                        continue
                    # Keep repeated surfaces well apart in world space as well as 2D.
                    if any(c['oid'] == old['oid'] and
                           np.linalg.norm(c['world']-old['world']) < .5 for old in chosen):
                        continue
                    usable.append(c)
                if not usable:
                    break
                def rank(c):
                    return (c['oid'] not in used_objects,
                            c['cat'] in STRUCTURAL,
                            c['cat'] not in used_categories,
                            PREFERRED.get(c['cat'], 0),
                            min(c['radius'], 18), c['area'], -c['frame_no'], -c['oid'])
                chosen.append(max(usable, key=rank))
                used_objects.add(chosen[-1]['oid'])
                used_categories.add(chosen[-1]['cat'])
            if len(chosen) < 4 or len(used_objects) < 4:
                self.proposal_warnings.append({
                    'episode_id': episode['id'], 'side': side,
                    'proposed_markers': len(chosen), 'distinct_native_objects': len(used_objects),
                    'message': 'Limited distinct labeled first-hit instances on this side. '
                               'Coordinator must inspect, move/add/remove surface points; '
                               'no extra distinct surfaces have been invented.',
                    'setup_blocked_until_manual_review': len(chosen) < 3})
            for number, c in enumerate(chosen, start=1):
                observations = []
                for frame_no, f in enumerate(episode['frames']):
                    ix = arrays['index'][f['source_image']]
                    projected = self.project(c['world'], arrays, ix, c['oid'])
                    if projected is not None:
                        x, y, residual = projected
                        observations.append({'frame_id': f'f{frame_no+1:02d}', 'x': x, 'y': y,
                                             'source': 'mesh_projection',
                                             'depth_residual_m': residual})
                anchor_frame = f'f{c["frame_no"]+1:02d}'
                assert any(o['frame_id'] == anchor_frame for o in observations)
                proposals.append({
                    'id': f'{prefix}{number}', 'side': side, 'anchor_frame': anchor_frame,
                    'x': (c['px']+.5)/WIDTH, 'y': (c['py']+.5)/HEIGHT,
                    'object_id': c['oid'], 'mpcat40': c['cat'],
                    'observations': observations, 'source': 'mesh_proposal',
                    'world_point': c['world'].tolist(),
                    'proposal_diagnostics': {
                        'mask_interior_distance_px_160x128': c['radius'],
                        'anchor_object_area_px_160x128': c['area'],
                        'native_object_region_id': objects[str(c['oid'])]['region_id'],
                        'human_approved': False,
                        'visibility_is_human_gt': False,
                        'geometry_warning': 'Transparent panes, reflected content, mixed native '
                                            'instances and registration error require human review.'}})
        return proposals

    def episode(self, source_episode):
        ep = self.read(self.source / source_episode['folder'] / 'manifest.json')
        assert ep['frames'] == source_episode['frames']
        assert len(ep['frames']) == 12
        assert [f['zone'] for f in ep['frames'][:6]] == ['indoor']*6
        assert all(f['zone'] != 'indoor' for f in ep['frames'][6:])
        scan_id, oid = ep['scan_id'], ep['boundary_object_id']
        arrays, objects = self.scan(scan_id)
        frames = []
        for frame_no, f in enumerate(ep['frames'], start=1):
            name, ix = f['source_image'], arrays['index'][f['source_image']]
            image_src = self.source / ep['folder'] / f['filename']
            image_path = f'data/images/{scan_id}/{name}'
            image_sha = sha(image_src)
            assert image_sha == f['sha256'], (ep['id'], frame_no, 'RGB sha mismatch')
            self.copy(image_src, image_path)
            with Image.open(image_src) as rgb:
                assert list(rgb.size) == f['dimensions']
                rgb.verify()
            idmap = arrays['instance_ids'][ix]
            encoded = (idmap.astype(np.int64)+1).astype(np.uint32)
            rgbids = np.stack([(encoded >> 16)&255, (encoded >> 8)&255,
                               encoded&255], axis=-1).astype(np.uint8)
            map_path = f'data/instances/{scan_id}/{Path(name).stem}.png'
            self.png(map_path, rgbids)
            decoded = np.asarray(Image.open(self.site/map_path)).astype(np.int64)
            decoded = (decoded[..., 0] << 16)+(decoded[..., 1] << 8)+decoded[..., 2]-1
            assert np.array_equal(decoded, idmap)
            mask = idmap == oid
            pixels = int(mask.sum())
            assert pixels == f['boundary_visible_pixels'], (ep['id'], frame_no, 'visibility mismatch')
            mask_path = f'data/boundaries/{ep["id"]}/f{frame_no:02d}.png'
            self.png(mask_path, np.where(mask, 255, 0).astype(np.uint8))
            original_mask = self.source / ep['folder'] / f['boundary_mask']['path']
            assert np.array_equal(np.asarray(Image.open(original_mask)) > 0, mask)
            self.source_files[str(original_mask)] = sha(original_mask)
            ys, xs = np.where(mask)
            bbox = ([float(xs.min()/WIDTH), float(ys.min()/HEIGHT),
                     float((xs.max()+1)/WIDTH), float((ys.max()+1)/HEIGHT)] if pixels else None)
            frame_objects = []
            for object_id, count in zip(*np.unique(idmap, return_counts=True)):
                object_id = int(object_id)
                if object_id < 0:
                    continue
                obj = objects[str(object_id)]
                frame_objects.append({'object_id': object_id, 'mpcat40': int(obj['mpcat40_id']),
                                      'name': obj['mpcat40_name'], 'pixels': int(count),
                                      'region_id': obj['region_id'],
                                      'raw_category': obj['raw_category']})
            assert np.allclose(arrays['camera_to_world'][ix], f['camera_to_world'], atol=1e-5)
            frames.append({
                'id': f'f{frame_no:02d}', 'index': frame_no,
                'side': 'indoor' if frame_no <= 6 else 'exterior',
                'image': image_path, 'width': f['dimensions'][0], 'height': f['dimensions'][1],
                'source_image': name, 'sha256': image_sha, 'capture_id': f['capture_id'],
                'region_id': f['region_id'], 'camera_to_world': f['camera_to_world'],
                'heading_deg': f['heading_deg'], 'pitch_deg': f['pitch_deg'],
                'intrinsics': arrays['intrinsics'][ix].astype(float).tolist(),
                'instance_map': map_path, 'boundary_mask': mask_path,
                'boundary_pixels': pixels, 'boundary_bbox': bbox,
                'objects': sorted(frame_objects, key=lambda o: (-o['pixels'], o['object_id'])),
                'geometry_visibility_hint': 'visible' if pixels else 'absent',
                'geometry_visibility_threshold_pass': pixels >= 100,
                'annotation_aids_model_visible': False,
                'from_previous': f.get('from_previous'),
                'registration_warning': frame_no in ep.get('registration_diagnostic', {}).get('warning_frames', [])})
            self.stats['rgb_appearances'] += 1
            self.stats['instance_maps_validated'] += 1
            self.stats['boundary_masks_validated'] += 1
        assert sum(f['boundary_pixels'] >= 100 for f in frames[:6]) >= 2
        assert all(len({f['capture_id'] for f in frames[start:start+6]}) >= 3 for start in [0, 6])
        for f in frames[1:]:
            if f['from_previous'] is not None:
                assert f['from_previous']['overlap'] >= .15
        audit_links = {}
        for key, leaf in [('source_manifest', 'manifest.json'), ('certificate', 'source_certificate.json'),
                          ('navigation', 'source_navigation.json'), ('contact_sheet', 'contact_sheet.jpg'),
                          ('route_map', 'route_map.svg'), ('walkthrough', 'walkthrough.webm'),
                          ('boundary_audit', 'annotation_aids/instance_mask_audit.jpg')]:
            p = self.source / ep['folder'] / leaf
            if p.exists():
                audit_links[key] = self.copy(p, f'data/audits/{ep["id"]}/{leaf}')
        supplementary = []
        for relative in ep.get('visual_evidence_files', []):
            p = self.source / relative
            if p.exists():
                dest = self.copy(p, f'data/audits/supplementary/{relative}')
                supplementary.append(dest)
        proposals = self.propose(ep, arrays, objects)
        self.stats['proposed_markers'] += len(proposals)
        self.stats['projected_observations'] += sum(len(m['observations']) for m in proposals)
        return {
            'id': ep['id'], 'scan_id': scan_id, 'assembly_id': ep['assembly_id'],
            'boundary_object_id': oid, 'boundary_class': ep['boundary_class'],
            'quality_note': ep['quality_note'], 'visual_verdict': ep['visual_audit']['verdict'],
            'visual_audit': ep['visual_audit'],
            'registration_diagnostic': ep.get('registration_diagnostic', {}),
            'frames': frames, 'proposed_markers': proposals,
            'audit_links': audit_links, 'supplementary_annotation_only': supplementary,
            'geometry_assets': {'instance_lookup': f'data/geometry/{scan_id}.json',
                                'raycast_cache': f'data/geometry/{scan_id}.npz',
                                'model_visible': False},
            'native_regions_per_side': ep['native_regions_per_side'],
            'crossing_frame': 7, 'sequence_sha256': ep['sequence_sha256'],
            'human_certified': False,
            'directions_status': 'Coordinator must define and freeze two directions; not supplied by geometry.',
            'proposal_warnings': [w for w in self.proposal_warnings if w['episode_id'] == ep['id']]}

    def build(self):
        collection = self.read(self.source/'collection.json')
        assert len(collection['scenes']) == 56
        protocol = self.read(self.source/'protocol.json')
        assert protocol['effective_settings']['step'] == 3
        assert protocol['effective_settings']['distance'] == .75
        assert protocol['effective_settings']['pixels'] == 100
        episodes = []
        for ep in collection['scenes']:
            episodes.append(self.episode(ep))
            print(f'{len(episodes):02d}/56 {ep["id"]}', flush=True)
        hierarchy, suggestions = self.read(HIERARCHY), self.read(SUGGESTIONS)
        assert len(hierarchy['materials']) == 107
        hierarchy_asset = self.copy(HIERARCHY, 'data/references/material_hierarchy_v2_7.json')
        suggestions_asset = self.copy(SUGGESTIONS, 'data/references/material_recommendations.json')
        global_audits = {}
        for filename in ['verification_report.json', 'verification_summary.md', 'protocol.json',
                         'excluded_reference_episodes.json', 'verification/numerical_audit.json',
                         'verification/depth_registration_warnings.json',
                         'verification/visual_adjudication.json', 'verification/independent_export_audit.json']:
            p = self.source/filename
            if p.exists():
                global_audits[filename] = self.copy(p, f'data/audits/source/{filename}')
        materials = [{'id': key, 'label': key.replace('_', ' '),
                      'family': value.get('parent', 'unspecified'), 'reference': value}
                     for key, value in sorted(hierarchy['materials'].items())]
        catalogue = {
            'schema': 'blockmind_l2_catalogue_v1',
            'objects': [{'id': key, 'name': value} for key, value in sorted(self.category_names.items())],
            'materials': materials,
            'suggestions_by_mpcat40': suggestions['material_options_by_class'],
            'all_material_suggestions': suggestions['all_materials'],
            'vhc_allowed_pairs_status': 'not_supplied',
            'provenance': {
                'hierarchy': {'path': hierarchy_asset, 'sha256': sha(HIERARCHY),
                              'schema_version': hierarchy['header']['schema_version'],
                              'status': 'Reference only, not independently verified or approved Family C GT',
                              'header': hierarchy['header']},
                'material_suggestions': {'path': suggestions_asset, 'sha256': sha(SUGGESTIONS),
                                         'source_provenance_unverified': suggestions['provenance'],
                                         'status': 'Existing unreviewed text suggestions; no new model call',
                                         'generated_at': suggestions.get('generated_at')},
                'objects': 'Native Matterport house C mapping preserved; includes void and unknown codes.'}}
        dataset = {
            'schema': 'blockmind_l2_dataset_v1',
            'source': {'folder': str(self.source), 'collection_sha256': sha(self.source/'collection.json'),
                       'boundary_count': 56, 'building_count': len({e['scan_id'] for e in episodes}),
                       'ground_truth_status': 'Assistant-screened candidates awaiting independent human labels'},
            'protocol': {**protocol, 'fixed_frames_per_episode': 12, 'crossing_frames_1based': [6, 7],
                         'instance_map_encoding': 'RGB uint8 big-endian 24-bit native object ID + 1; 0 unknown',
                         'instance_map_size': [WIDTH, HEIGHT],
                         'coordinate_convention': 'x,y normalized [0,1], origin top-left; RGB pixel round(x*(width-1)), round(y*(height-1))',
                         'world_frame': 'Native Matterport undistorted camera / house mesh frame, metres',
                         'projection_convention': 'Native y bottom-origin, forward camera -z; source first-hit depth',
                         'observations_are_proposals_not_visibility_gt': True,
                         'projection_depth_tolerance_m': 'max(0.06, 0.015 * axial_depth)',
                         'depth_model_visible': False,
                         'directions_predefined': False,
                         'vhc_allowed_pairs_status': 'not_supplied'},
            'audit_links': global_audits,
            'episodes': episodes}
        self.source_files[str(Path(__file__).resolve())] = sha(Path(__file__).resolve())
        contract = self.site/'CONTRACT.md'
        if contract.exists():
            self.source_files[str(contract)] = sha(contract)
        # Content identity covers every asset hash, schemas, source bytes and proposal coordinates.
        build_id = hashlib.sha256(canonical({'dataset': dataset, 'catalogue': catalogue,
                    'assets': self.assets, 'source_files': self.source_files})).hexdigest()
        dataset['build_id'] = catalogue['build_id'] = build_id
        self.write_json('dataset.json', dataset)
        self.write_json('catalogue.json', catalogue)
        self.stats['episodes'] = len(episodes)
        self.stats['buildings'] = len({e['scan_id'] for e in episodes})
        self.stats['unique_rgb_files'] = len({f['image'] for e in episodes for f in e['frames']})
        self.stats['materials_in_hierarchy'] = len(materials)
        self.stats['native_mpcat40_codes'] = len(catalogue['objects'])
        summary = {
            'status': 'passed', 'build_id': build_id, 'counts': dict(self.stats),
            'boundary_classes': dict(Counter(e['boundary_class'] for e in episodes)),
            'assistant_visual_verdicts': dict(Counter(e['visual_verdict'] for e in episodes)),
            'proposal_warnings': self.proposal_warnings,
            'checks': {
                'all_RGB_bytes_match_frozen_source': True,
                'all_RGB_dimensions_and_decoding_valid': True,
                'all_instance_PNGs_roundtrip_exactly': True,
                'all_boundary_masks_match_fresh_first_hit_instances': True,
                'all_source_boundary_pixel_counts_reproduced': True,
                'all_proposed_anchor_points_have_positive_depth_and_correct_first_hit_ID': True,
                'all_projected_observations_ID_and_depth_consistent': True,
                'all_proposals_are_restricted_to_native_side_regions': True,
                'all_episodes_fixed_12_with_6_per_side_and_3_positions_each_side': True,
                'all_episodes_have_two_pre_sightings_at_least_100px': True,
                'all_saved_adjacent_overlaps_at_least_15_percent': True,
                'source_candidates_and_old_annotation_site_unchanged': True,
                'human_annotations_seeded': False,
                'new_model_API_calls': False,
                'physical_simulation_performed': False},
            'limitations': [
                'Source numerical certificates were copied; this builder did not rerun original mesh raycasting or re-search routes.',
                'Mesh-derived points, labels, masks and visibility are fallible coordinator aids; glass, reflection and registration need human decisions.',
                'Existing 10 visual-review flags and all depth-registration warnings are retained, not silently excluded.',
                'No directions or approved VHC contrast table were supplied; coordinator/researcher decisions remain required.',
                'Existing material suggestion provider/model metadata is preserved as unverified provenance, not independently authenticated.']}
        self.write_json('data/build_validation.json', summary)
        inventory = {'schema': 'blockmind_l2_asset_inventory_v1', 'build_id': build_id,
                     'sha256': dict(sorted(self.assets.items())),
                     'source_files_sha256': dict(sorted(self.source_files.items())),
                     'note': 'Inventory excludes its own hash. Build identity includes content assets, dataset/catalogue before build_id, schemas and source files; app UI code is separate.'}
        self.write_json('data/asset_inventory.json', inventory)
        print(json.dumps(summary, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--site', type=Path, default=SITE)
    parser.add_argument('--replace-generated', action='store_true')
    args = parser.parse_args()
    Builder(args.source, args.site, args.replace_generated).build()


if __name__ == '__main__':
    main()
