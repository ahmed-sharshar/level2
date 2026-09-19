#!/usr/bin/env python3
"""Read-only integrity check for a packaged BLOCKMIND Level 2 dataset.

Python standard library only. Checks shipped asset hashes, the dataset/catalogue
build-identity formula, references and frame counts. --check-sources additionally
checks original absolute workstation paths and is not needed after distribution.
No file is written unless --out is explicitly supplied; an existing report is
never overwritten. Hashes establish internal consistency, not authentication,
human annotation quality, or scientific correctness of the source scenes.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys


SITE = Path(__file__).resolve().parents[1]
BUILD_EXCLUDED_ASSETS = {'dataset.json', 'catalogue.json', 'data/build_validation.json'}


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        if key in {'__proto__', 'constructor', 'prototype'}:
            raise ValueError(f'Unsafe JSON key: {key}')
        result[key] = value
    return result


def read_json(path):
    with path.open(encoding='utf-8') as stream:
        return json.load(stream, object_pairs_hook=unique_pairs,
                         parse_constant=lambda value: (_ for _ in ()).throw(
                             ValueError(f'Non-finite JSON value: {value}')))


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def asset_path(site, relative):
    if not isinstance(relative, str) or not relative:
        raise ValueError('Asset path must be a nonempty string')
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or '\\' in relative:
        raise ValueError(f'Unsafe relative asset path: {relative}')
    destination = site / path
    if not destination.resolve().is_relative_to(site):
        raise ValueError(f'Asset resolves outside bundle: {relative}')
    cursor = destination
    while cursor != site:
        if cursor.is_symlink():
            raise ValueError(f'Symlink not allowed for verified asset: {relative}')
        cursor = cursor.parent
    return destination


def verify(site, check_sources=False):
    site = site.resolve()
    errors, warnings = [], []
    counts = Counter()
    dataset = read_json(site / 'dataset.json')
    catalogue = read_json(site / 'catalogue.json')
    inventory = read_json(site / 'data' / 'asset_inventory.json')
    build_id = dataset.get('build_id')
    if not isinstance(build_id, str) or len(build_id) != 64:
        errors.append('dataset.build_id is not a SHA-256 string')
    if catalogue.get('build_id') != build_id or inventory.get('build_id') != build_id:
        errors.append('Dataset, catalogue and inventory build identities differ')
    if dataset.get('schema') != 'blockmind_l2_dataset_v1':
        errors.append('Unsupported dataset schema')
    if catalogue.get('schema') != 'blockmind_l2_catalogue_v1':
        errors.append('Unsupported catalogue schema')
    if inventory.get('schema') != 'blockmind_l2_asset_inventory_v1':
        errors.append('Unsupported asset inventory schema')
    hashes = inventory.get('sha256')
    source_hashes = inventory.get('source_files_sha256')
    if not isinstance(hashes, dict) or not isinstance(source_hashes, dict):
        raise ValueError('Inventory must contain asset and source hash dictionaries')
    for relative, expected in hashes.items():
        try:
            path = asset_path(site, relative)
            if not path.is_file():
                errors.append(f'Missing asset: {relative}')
                continue
            actual = sha256_file(path)
            counts['asset_files_checked'] += 1
            counts['asset_bytes_checked'] += path.stat().st_size
            if actual != expected:
                errors.append(f'Asset hash mismatch: {relative}')
            else:
                counts['asset_hashes_verified'] += 1
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
    for relative in BUILD_EXCLUDED_ASSETS:
        if relative not in hashes:
            errors.append(f'Missing required top-level generated hash: {relative}')

    # The builder hashes source/content assets before writing these three derived
    # files; their bytes are separately covered by the asset inventory above.
    d, c = dict(dataset), dict(catalogue)
    d.pop('build_id', None)
    c.pop('build_id', None)
    identity = hashlib.sha256(canonical({
        'dataset': d, 'catalogue': c,
        'assets': {k: v for k, v in hashes.items() if k not in BUILD_EXCLUDED_ASSETS},
        'source_files': source_hashes})).hexdigest()
    identity_matches = identity == build_id
    if not identity_matches:
        errors.append('Content-derived build identity does not match dataset.build_id')

    if check_sources:
        for original, expected in source_hashes.items():
            try:
                path = Path(original)
                if not path.is_absolute() or not path.is_file():
                    errors.append(f'Original source unavailable: {original}')
                    continue
                counts['source_files_checked'] += 1
                if sha256_file(path) != expected:
                    errors.append(f'Original source changed: {original}')
                else:
                    counts['source_hashes_verified'] += 1
            except OSError as exc:
                errors.append(str(exc))

    unique_images, episode_ids, scan_ids, assemblies = set(), set(), set(), set()
    expected_frames = dataset.get('protocol', {}).get('fixed_frames_per_episode', 12)
    for episode in dataset.get('episodes', []):
        eid = episode.get('id')
        if eid in episode_ids:
            errors.append(f'Duplicate episode ID: {eid}')
        episode_ids.add(eid)
        scan_ids.add(episode.get('scan_id'))
        assembly = episode.get('assembly_id')
        if assembly in assemblies:
            errors.append(f'Duplicate boundary assembly: {assembly}')
        assemblies.add(assembly)
        frames = episode.get('frames', [])
        if len(frames) != expected_frames:
            errors.append(f'{eid}: expected {expected_frames} frames, got {len(frames)}')
        frame_ids = set()
        for number, frame in enumerate(frames, start=1):
            counts['frame_appearances'] += 1
            if frame.get('id') != f'f{number:02d}' or frame.get('index') != number:
                errors.append(f'{eid}: frame order/identity mismatch at {number}')
            frame_ids.add(frame.get('id'))
            expected_side = 'indoor' if number <= 6 else 'exterior'
            if frame.get('side') != expected_side:
                errors.append(f'{eid}: unexpected side for frame {number}')
            if not all(isinstance(frame.get(key), int) and frame[key] > 0 for key in ('width', 'height')):
                errors.append(f'{eid}: invalid dimensions at frame {number}')
            for key in ('image', 'instance_map', 'boundary_mask'):
                relative = frame.get(key)
                try:
                    if not asset_path(site, relative).is_file() or relative not in hashes:
                        errors.append(f'{eid}: missing/uninventoried {key} at frame {number}')
                    counts['frame_asset_references_checked'] += 1
                except (OSError, ValueError) as exc:
                    errors.append(f'{eid}: {exc}')
            unique_images.add(frame.get('image'))
            if hashes.get(frame.get('image')) != frame.get('sha256'):
                errors.append(f'{eid}: RGB hash disagrees with frame metadata at {number}')
        if sum(f.get('boundary_pixels', 0) >= 100 for f in frames[:6]) < 2:
            errors.append(f'{eid}: saved source-screening sightings do not meet reference/100px')
        for start in (0, 6):
            if len({f.get('capture_id') for f in frames[start:start+6]}) < 3:
                errors.append(f'{eid}: fewer than three capture positions on side {start // 6}')
        for marker in episode.get('proposed_markers', []):
            counts['proposed_markers'] += 1
            if marker.get('anchor_frame') not in frame_ids:
                errors.append(f'{eid}: unknown marker anchor frame')
            for observation in marker.get('observations', []):
                counts['projected_observations'] += 1
                if observation.get('frame_id') not in frame_ids:
                    errors.append(f'{eid}: unknown observation frame')
        # All aid links are annotation-only; ensure portability as relative assets.
        aid_paths = list(episode.get('audit_links', {}).values())
        aid_paths += episode.get('supplementary_annotation_only', [])
        aid_paths += [value for key, value in episode.get('geometry_assets', {}).items()
                      if key != 'model_visible']
        for relative in aid_paths:
            try:
                if not asset_path(site, relative).is_file() or relative not in hashes:
                    errors.append(f'{eid}: missing/uninventoried annotation aid {relative}')
                counts['annotation_aid_references_checked'] += 1
            except (OSError, ValueError) as exc:
                errors.append(str(exc))

    counts['episodes'] = len(episode_ids)
    counts['buildings'] = len(scan_ids)
    counts['distinct_boundary_assemblies'] = len(assemblies)
    counts['unique_rgb_files'] = len(unique_images)
    counts['materials'] = len(catalogue.get('materials', []))
    if counts['episodes'] != dataset.get('source', {}).get('boundary_count'):
        errors.append('Episode count disagrees with source boundary count')
    if counts['buildings'] != dataset.get('source', {}).get('building_count'):
        errors.append('Building count disagrees with source count')
    if counts['frame_appearances'] != counts['episodes'] * expected_frames:
        errors.append('Total frame appearances disagree with fixed-frame protocol')

    symlinks = []
    for directory, directories, files in os.walk(site, followlinks=False):
        for leaf in directories + files:
            path = Path(directory) / leaf
            if path.is_symlink():
                symlinks.append(str(path.relative_to(site)))
    if symlinks:
        warnings.append('Bundle contains symlinks outside the verified asset list; review portability/security')
    return {
        'schema': 'blockmind_l2_bundle_verification_v1',
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'status': 'passed' if not errors else 'failed', 'build_id': build_id,
        'build_identity_recomputed': identity_matches,
        'source_hash_check_requested': check_sources,
        'counts': dict(counts), 'errors': errors, 'warnings': warnings,
        'symlinks': symlinks,
        'scope': 'Read-only integrity and reference validation; no human quality certification or fresh raycast',
        'limits': [
            'The inventory itself is not externally authenticated; hashes detect accidental changes, not a forged bundle.',
            'App code and documentation added after the data build are outside the data asset inventory.',
            'Without --check-sources, original absolute workstation paths are provenance only; distributed bundles need not contain them.',
            'Pixel-level instance/depth consistency was checked by the data builder; this stdlib checker verifies their shipped bytes.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=SITE)
    parser.add_argument('--check-sources', action='store_true')
    parser.add_argument('--out', type=Path, help='Explicit optional JSON report path; must not already exist')
    args = parser.parse_args()
    try:
        if args.out and args.out.exists():
            raise ValueError(f'Refusing to overwrite existing report: {args.out}')
        report = verify(args.site, args.check_sources)
        output = json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + '\n'
        if args.out:
            if not args.out.parent.is_dir():
                raise ValueError(f'Report parent directory does not exist: {args.out.parent}')
            with args.out.open('x', encoding='utf-8') as stream:
                stream.write(output)
        sys.stdout.write(output)
        return 0 if report['status'] == 'passed' else 1
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({'status': 'failed', 'errors': [str(exc)]}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
