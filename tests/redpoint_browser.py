#!/usr/bin/env python3
"""Red-point UI and instance-label regression checks using disposable profiles.

All human answers and researcher point edits below are synthetic browser fixtures.
The distributed collection tasks and annotations are never changed by this test.
"""
import argparse
import copy
import functools
import http.server
import json
import subprocess
import tempfile
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
NODE = '/home/ahmed/miniconda3/envs/scannetpp/lib/python3.10/site-packages/playwright/driver/node'
PYTHON = '/home/ahmed/miniconda3/envs/scannetpp/bin/python'
ND = 'not_determinable'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.startswith('/project/'):
            self.path = self.path[len('/project'):]
        return super().do_GET()


def resign_tasks(tasks):
    script = "const fs=require('fs'),C=require('./core.js'),F=require('./full-core.js'),t=JSON.parse(fs.readFileSync(0,'utf8'));t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);process.stdout.write(JSON.stringify(t));"
    return json.loads(subprocess.check_output([NODE, '-e', script], input=json.dumps(tasks), text=True, cwd=SITE))


def native_label(dataset, catalogue, episode_id, marker):
    episode = next(e for e in dataset['episodes'] if e['id'] == episode_id)
    frame = next(f for f in episode['frames'] if f['id'] == marker['anchor_frame'])
    with Image.open(SITE / frame['instance_map']) as image:
        x = min(image.width - 1, int(marker['x'] * image.width))
        y = min(image.height - 1, int(marker['y'] * image.height))
        r, g, b = image.convert('RGB').getpixel((x, y))
        object_id = r * 65536 + g * 256 + b - 1
        source = next((o for o in frame['objects'] if o['object_id'] == object_id), None)
        category = None if source is None else source['mpcat40']
        name = next((o['name'] for o in catalogue['objects'] if o['id'] == category), None)
        return {'object_id': None if object_id < 0 else object_id, 'mpcat40_id': category,
                'mpcat40_name': name, 'pixel_x': x, 'pixel_y': y,
                'width': image.width, 'height': image.height,
                'source_path': frame['instance_map']}


def run(entry='index.html'):
    checks, errors, external, failed, expected_missing = [], [], [], [], []
    report = SITE / 'validation'
    report.mkdir(exist_ok=True)
    dataset = json.loads((SITE / 'dataset.json').read_text())
    catalogue = json.loads((SITE / 'catalogue.json').read_text())
    source_tasks = json.loads((SITE / 'collection-tasks.json').read_text())
    material_ids = {m['id'] for m in catalogue['materials']}
    total_points = sum(len(e['markers']) for e in source_tasks['layout']['episodes'])
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'

    def check(name, condition=True):
        assert condition, name
        checks.append(name)
        print('PASS ' + name, flush=True)

    def snap(page):
        return page.evaluate('L2Collection.getSnapshot()')

    def ready(page):
        page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')

    def image_ready(page):
        page.wait_for_function('L2Collection.getSnapshot().imageReady && document.querySelector("#sceneImage").naturalWidth>0')

    def start(context, identity='redpoint-browser-test', path=entry, missing_path=None):
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith((origin, 'blob:', 'data:')) else None)
        page.on('response', lambda r: (expected_missing if missing_path and r.status == 404 and r.url.endswith('/' + missing_path) else failed).append((r.status, r.url)) if r.status >= 400 else None)
        page.on('dialog', lambda d: d.accept('SYNTHETIC TEST ONLY') if d.type == 'prompt' else d.accept())
        page.goto(origin + path)
        ready(page)
        page.locator('#identityInput').fill(identity)
        page.locator('#startButton').click()
        image_ready(page)
        page.locator('#sections [data-section="surfaces"]').click()
        image_ready(page)
        return page

    def field(page, path):
        return page.locator(f'[data-field="{path}"]')

    def reveal(locator):
        locator.evaluate('el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}')

    def fill(page, path, value):
        locator = field(page, path)
        reveal(locator)
        locator.fill(value)
        locator.blur()

    def select(page, path, value):
        locator = field(page, path)
        reveal(locator)
        locator.select_option(value)

    def export(page, target):
        with page.expect_download(timeout=60000) as pending:
            page.locator('#downloadButton').click()
        pending.value.save_as(target)
        return json.loads(target.read_text())

    def labels(doc, episode_id, marker_id):
        return next(r for r in doc['automatic_surface_labels'] if r['episode_id'] == episode_id and r['marker_id'] == marker_id)

    def audit(doc, episode_id, marker_id):
        return next(r for r in doc['surface_label_audit'] if r['episode_id'] == episode_id and r['marker_id'] == marker_id)

    def import_doc(page, doc, target):
        target.write_text(json.dumps(doc))
        page.locator('#importFile').set_input_files(target)
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        image_ready(page)

    passed = False
    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-redpoint-browser-') as td, sync_playwright() as pw:
            temporary = Path(td)
            browser = pw.chromium.launch()
            context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
            page = start(context)
            initial = snap(page)
            episode_id = initial['doc']['episodes'][0]['episode_id']
            point = initial['doc']['tasks']['layout']['episodes'][0]['markers'][0]
            pid = point['id']
            base = 'answers.surfaces.' + pid + '.'
            hierarchy_path = base + 'hierarchy_id'
            pair = page.locator(f'[data-material-pair="{hierarchy_path}"]')
            search = page.locator(f'[data-material-search="{hierarchy_path}"]')
            values = lambda: set(pair.locator('option').evaluate_all('xs=>xs.map(x=>x.value)'))
            check('Reference dropdown contains the complete 107-entry hierarchy', len(material_ids) == 107 and material_ids <= values())
            check('Reference material has a visible search field', search.is_visible() and search.get_attribute('type') == 'search')
            check('Initial point has no automatically inferred human object, material or shelter', all(initial['doc']['episodes'][0]['answers']['surfaces'][pid][k] is None for k in ('object_name', 'material', 'hierarchy_id', 'shelter', 'reflectance')))
            for material in catalogue['materials']:
                search.fill(material['id'])
                assert material['id'] in values(), material['id']
            check('Every one of the 107 hierarchy IDs remains searchable without a short-list cutoff')
            material = catalogue['materials'][0]
            search.fill(material['family'].replace('_', ' '))
            check('Hierarchy families are searchable', material['id'] in values())
            descriptor = material['reference']['visual_descriptors'].split('.')[0].strip()
            search.fill(descriptor)
            check('Long visual-descriptor searches find their material entry', len(descriptor) > 50 and material['id'] in values())
            search.fill('SYNTHETIC no hierarchy match 908754')
            check('Other and Not sure are available even with no search matches', {'__other__', ND} <= values() and not material_ids.intersection(values()))
            search.fill('')
            pair.select_option(material['id'])
            search = page.locator(f'[data-material-search="{hierarchy_path}"]')
            pair = page.locator(f'[data-material-pair="{hierarchy_path}"]')
            before_filter = copy.deepcopy(snap(page)['doc']['episodes'][0]['answers']['surfaces'][pid])
            search.fill('SYNTHETIC unmatched query')
            check('Filtering never silently clears the selected reference entry', pair.input_value() == material['id'] and material['id'] in values())
            check('Searching does not mutate saved human answers', snap(page)['doc']['episodes'][0]['answers']['surfaces'][pid] == before_filter)
            search.fill('')
            check('Clearing search restores every hierarchy entry and the chosen value', material_ids <= values() and pair.input_value() == material['id'])
            shelter = field(page, base + 'shelter')
            options = {o['value']: o['text'] for o in shelter.locator('option').evaluate_all('xs=>xs.map(x=>({value:x.value,text:x.textContent.trim()}))')}
            check('Slats or lattice is distinct from solid roof, open sky and legacy partial', {'slats_lattice', 'overhead', 'none', 'partial'} <= options.keys() and 'slats' in options['slats_lattice'].lower() and 'solid' in options['overhead'].lower() and 'sky' in options['none'].lower())
            select(page, base + 'shelter', 'slats_lattice')
            expected = native_label(dataset, catalogue, episode_id, point)
            fill(page, base + 'object_name', expected['mpcat40_name'])
            agreement_doc = export(page, temporary / 'agreement.json')
            check('Export waits for one machine-provenance row per shared point', len(agreement_doc['automatic_surface_labels']) == total_points and len(agreement_doc['surface_label_audit']) == total_points)
            row = labels(agreement_doc, episode_id, pid)
            check('Automatic label matches an independent native RGB-instance pixel decode', all(row[k] == v for k, v in expected.items()) and row['status'] == 'sampled')
            for episode in source_tasks['layout']['episodes']:
                for marker in episode['markers']:
                    native = native_label(dataset, catalogue, episode['episode_id'], marker)
                    saved = labels(agreement_doc, episode['episode_id'], marker['id'])
                    assert all(saved[k] == v for k, v in native.items()), (episode['episode_id'], marker['id'], native, saved)
            check('Every distributed point label matches an independent native instance-mask sample')
            check('Exact human object category agreement is recorded without conflating material category', audit(agreement_doc, episode_id, pid)['comparison']['status'] == 'agree')
            other_object = next(o['name'] for o in catalogue['objects'] if o['id'] > 0 and o['id'] != expected['mpcat40_id'])
            fill(page, base + 'object_name', other_object)
            disagreement_doc = export(page, temporary / 'disagreement.json')
            audit_row = audit(disagreement_doc, episode_id, pid)
            check('Automatic category and disagreeing human object are exported side by side', audit_row['automatic']['mpcat40_id'] == expected['mpcat40_id'] and audit_row['human']['object_name'] == other_object and audit_row['comparison']['status'] == 'disagree')
            check('Human material hierarchy remains a separate unchanged label', audit_row['human']['hierarchy_id'] == material['id'] and bool(audit_row['human']['material']))
            fill(page, base + 'object_name', 'SYNTHETIC custom painted corner')
            custom_doc = export(page, temporary / 'custom.json')
            check('Free-text custom objects are explicitly non-comparable, not false disagreements', audit(custom_doc, episode_id, pid)['comparison']['eligible'] is False and audit(custom_doc, episode_id, pid)['comparison']['status'] == 'not_comparable')
            subprocess.run([PYTHON, 'scripts/validate_export.py', str(temporary / 'custom.json')], cwd=SITE, check=True, capture_output=True, text=True)
            check('Offline validator accepts machine provenance, material choices and lattice shelter')
            point_before = copy.deepcopy(snap(page)['doc']['tasks']['layout'])
            image = page.locator('#sceneImage')
            image.click(position={'x': 30, 'y': 30})
            check('Annotator image clicks cannot move shared researcher points', snap(page)['doc']['tasks']['layout'] == point_before and page.locator('#movePoint,#addPoint,[data-delete-point]').count() == 0)
            check('Existing four-per-side shared layout stays unchanged', all(sum(m['side'] == side for m in point_before['episodes'][0]['markers']) == 4 for side in ('indoor', 'exterior')))
            check('Desktop material form has no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            page.screenshot(path=str(report / 'redpoint-desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            check('Mobile material form has no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            check('Mobile material search remains usable', search.is_visible())
            page.screenshot(path=str(report / 'redpoint-mobile.png'), full_page=True)
            page.reload()
            ready(page)
            page.locator('#identityInput').fill('redpoint-browser-test')
            page.locator('#startButton').click()
            image_ready(page)
            check('Reload preserves human object, material hierarchy and lattice shelter', snap(page)['doc']['episodes'][0]['answers'] == custom_doc['episodes'][0]['answers'])
            resumed_doc = export(page, temporary / 'resumed.json')
            check('Reload/export preserves mask provenance and refreshed comparisons', resumed_doc['automatic_surface_labels'] == custom_doc['automatic_surface_labels'] and resumed_doc['surface_label_audit'] == custom_doc['surface_label_audit'])
            legacy = copy.deepcopy(custom_doc)
            legacy.pop('automatic_surface_labels')
            legacy.pop('surface_label_audit')
            legacy['episodes'][0]['answers']['surfaces'][pid]['shelter'] = 'partial'
            import_doc(page, legacy, temporary / 'legacy.json')
            restored = export(page, temporary / 'restored.json')
            check('Legacy generic partial cover is preserved, never reinterpreted as lattice', restored['episodes'][0]['answers']['surfaces'][pid]['shelter'] == 'partial')
            check('Legacy imports acquire machine provenance without changing human answers', restored['episodes'][0]['answers'] == legacy['episodes'][0]['answers'] and len(restored['automatic_surface_labels']) == total_points)

            # Researcher-edit fixture retains stale proposed object hints, but moves
            # the anchor onto a genuinely different object in its original mask.
            edited_tasks = copy.deepcopy(source_tasks)
            edited_points = edited_tasks['layout']['episodes'][0]['markers']
            moved = edited_points[0]
            frame = next(f for f in dataset['episodes'][0]['frames'] if f['id'] == moved['anchor_frame'])
            target = next(o for o in frame['objects'] if o['mpcat40'] == 1 and o['object_id'] != moved['object_id'])
            with Image.open(SITE / frame['instance_map']) as im:
                image_rgb = im.convert('RGB')
                coordinates = next((x, y) for y in range(im.height) for x in range(im.width) if ((lambda rgb: rgb[0] * 65536 + rgb[1] * 256 + rgb[2] - 1)(image_rgb.getpixel((x, y))) == target['object_id']))
                moved['x'], moved['y'] = (coordinates[0] + .5) / im.width, (coordinates[1] + .5) / im.height
            moved['observations'] = []
            added = edited_points[1]
            added['id'] = 'I99'
            added['object_id'] = None
            added['mpcat40'] = None
            added['observations'] = []
            edited_tasks = resign_tasks(edited_tasks)
            edited_context = browser.new_context(accept_downloads=True)
            edited_context.route('**/collection-tasks.json', lambda route: route.fulfill(json=edited_tasks))
            edited = start(edited_context, identity='redpoint-edited-researcher-fixture')
            edited_doc = export(edited, temporary / 'edited-points.json')
            moved_expected = native_label(dataset, catalogue, episode_id, moved)
            check('Moved researcher point is resampled at its actual anchor, not stale proposal hints', all(labels(edited_doc, episode_id, moved['id'])[k] == v for k, v in moved_expected.items()) and moved_expected['object_id'] != moved['object_id'] and moved_expected['mpcat40_id'] != moved['mpcat40'])
            new_expected = native_label(dataset, catalogue, episode_id, added)
            check('New researcher point receives mask labels even when proposal hints are absent', all(labels(edited_doc, episode_id, added['id'])[k] == v for k, v in new_expected.items()))
            check('Resampling moved and new points never supplies human labels', all(edited_doc['episodes'][0]['answers']['surfaces'][m['id']]['object_name'] is None for m in (moved, added)))
            edited_context.close()

            unavailable_context = browser.new_context(accept_downloads=True)
            missing_path = expected['source_path']
            unavailable_context.route('**/' + missing_path, lambda route: route.fulfill(status=404, body='SYNTHETIC unavailable instance map'))
            unavailable = start(unavailable_context, identity='redpoint-missing-mask', missing_path=missing_path)
            unavailable_doc = export(unavailable, temporary / 'unavailable.json')
            missing_row = labels(unavailable_doc, episode_id, pid)
            check('Unavailable instance map records explicit null machine labels without fabricated fallback', missing_row['status'] == 'unavailable' and all(missing_row[k] is None for k in ('object_id', 'mpcat40_id', 'mpcat40_name', 'pixel_x', 'pixel_y')))
            check('Unavailable mask does not disable human object/material annotation', field(unavailable, base + 'object_name').is_enabled() and unavailable.locator(f'[data-material-pair="{hierarchy_path}"]').is_enabled())
            check('Expected missing-mask case exercised a real HTTP 404', bool(expected_missing))
            unavailable_context.close()
            project_context = browser.new_context(accept_downloads=True)
            project = start(project_context, identity='redpoint-subdirectory', path='project/' + entry)
            project_doc = export(project, temporary / 'subdirectory.json')
            check('Hierarchy search and instance labels work under a GitHub project subdirectory', project.locator(f'[data-material-search="{hierarchy_path}"]').is_visible() and labels(project_doc, episode_id, pid)['object_id'] == expected['object_id'])
            check('No JavaScript exceptions', not errors)
            check('No external requests', not external)
            check('No unexpected failed asset requests', not failed)
            browser.close()
            passed = True
    finally:
        server.shutdown()
        server.server_close()
        (report / 'redpoint_browser_report.json').write_text(json.dumps({
            'passed': passed, 'checks': checks, 'check_count': len(checks),
            'entry': entry, 'javascript_errors': errors,
            'failed_requests': failed, 'external_requests': external,
            'expected_missing_instance_requests': expected_missing,
            'synthetic_test_answers_only': True,
            'coverage': 'Full searchable material hierarchy, separate lattice shelter, actual mask sampling, automatic/human comparison, locked placement, export/resume and safe unavailable masks',
        }, indent=2) + '\n')
    return len(checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} red-point browser checks passed.')
