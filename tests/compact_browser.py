#!/usr/bin/env python3
"""Compact full-coverage collector checks; all answers use disposable profiles."""
import argparse
import copy
import functools
import http.server
import json
import subprocess
import tempfile
import threading
from pathlib import Path

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


def run(entry='index.html'):
    checks, errors, external, failed = [], [], [], []
    report = SITE / 'validation'
    report.mkdir(exist_ok=True)
    fixture = json.loads(subprocess.check_output([NODE, str(SITE / 'tests/make_full_fixtures.cjs')], text=True))

    def check(name, condition=True):
        assert condition, name
        checks.append(name)
        print('PASS ' + name, flush=True)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'

    def watch(page):
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith((origin, 'blob:', 'data:')) else None)
        page.on('response', lambda r: failed.append((r.status, r.url)) if r.status >= 400 else None)
        page._test_dialog_handler = lambda d: d.accept('SYNTHETIC TEST ONLY') if d.type == 'prompt' else d.accept()
        page.on('dialog', page._test_dialog_handler)

    def snap(page):
        return page.evaluate('L2Collection.getSnapshot()')

    def ready(page):
        page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')

    def image_ready(page):
        page.wait_for_function('L2Collection.getSnapshot().imageReady && document.querySelector("#sceneImage").naturalWidth>0')

    def start(context, path=entry, identity='full-browser-test'):
        page = context.new_page()
        watch(page)
        page.goto(origin + path)
        ready(page)
        page.locator('#identityInput').fill(identity)
        page.locator('#startButton').click()
        image_ready(page)
        return page

    def dl(page, selector, target):
        with page.expect_download() as pending:
            page.locator(selector).click()
        pending.value.save_as(target)
        return json.loads(target.read_text())

    def section(page, name):
        page.locator(f'#sections [data-section="{name}"]').click()

    def field(page, path):
        return page.locator(f'[data-field="{path}"]')

    def reveal(locator):
        locator.evaluate('el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}')

    def choose(page, path, value):
        locator = field(page, path)
        reveal(locator)
        locator.select_option(value)

    def fill(page, path, value):
        locator = field(page, path)
        reveal(locator)
        locator.fill(value)
        locator.blur()

    def valid(page, doc, complete=False):
        return page.evaluate('async x=>L2Full.validate(x.doc,await fetch("dataset.json").then(r=>r.json()),await fetch("catalogue.json").then(r=>r.json()),x.complete)', {'doc': doc, 'complete': complete})

    def import_doc(page, doc, temporary, filename='import.json'):
        path = temporary / filename
        path.write_text(json.dumps(doc))
        page.locator('#importFile').set_input_files(path)
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        image_ready(page)

    def answer(page, path):
        value = snap(page)['doc']['episodes'][0]
        for key in path.split('.'):
            value = value[key]
        return value

    def panels(page):
        return page.evaluate('async()=>L2Compact.panels(L2Collection.getSnapshot().doc,0,await fetch("dataset.json").then(r=>r.json()),await fetch("catalogue.json").then(r=>r.json()))')

    passed = False
    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-compact-browser-') as td, sync_playwright() as pw:
            temporary = Path(td)
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
            page = start(ctx)
            check('Name alone opens all 56 scenes without a role or import', page.locator('#sceneSelect option').count() == 56)
            check('All seven collection sections remain available', page.locator('#sections [data-section]').count() == 7)
            check('Default collection scope is Level 2, not mandatory Level 3', snap(page)['doc']['profile'] == 'l2')
            check('Production research settings remain visibly pending', page.locator('#setupNotice').is_visible())
            first = dl(page, '#downloadButton', temporary / 'pending.json')
            check('Compact interface keeps the original full export schema', first['schema'] == 'blockmind_l2_annotations_v2' and valid(page, first) == [])
            check('No human labels are prefilled', first['episodes'][0]['answers']['scene']['crossing_valid'] is None)
            page.locator('[data-value="yes"]').click()
            check('Basic facts remain editable with pending settings', answer(page, 'answers.scene.crossing_valid') == 'yes')
            section(page, 'exposure')
            check('Unapproved directional scenarios cannot be answered', page.locator('#questionPanel select:not([disabled])').count() == 0 and page.locator('#questionPanel [data-value]').count() == 0)
            section(page, 'surfaces')
            image_ready(page)
            point = snap(page)['doc']['tasks']['layout']['episodes'][0]['markers'][0]
            pid = point['id']
            base = 'answers.surfaces.' + pid + '.'
            check('Shared point is highlighted and cannot be moved by a rater', page.locator('#pointOverlay circle').count() > 0 and page.locator('#movePoint').count() == 0)
            check('Red points show one compact form per target', page.locator(f'.surface-form[data-marker-id="{pid}"]').is_visible())
            plan = panels(page)
            check('Eight surfaces are eight point forms, not separate field pages', len([p for p in plan if p['section'] == 'surfaces']) == 8 and '8' in page.locator('#sections [data-section="surfaces"]').inner_text())
            check('Sun and rain have four scenario panels', len([p for p in plan if p['section'] == 'exposure']) == 4)
            check('Opening transfer retains four scenario panels', len([p for p in plan if p['section'] == 'pathways']) == 4)
            check('All 64 surface-direction-condition-channel facts remain represented', sum(len(p['questions']) for p in plan if p['section'] == 'exposure') == 64)
            check('All 16 opening-transfer facts remain represented', sum(len(p['questions']) for p in plan if p['section'] == 'pathways') == 16)
            fill(page, base + 'object_name', 'SYNTHETIC wall')
            pair = page.locator(f'[data-material-pair="{base}hierarchy_id"]')
            check('Material name and category are paired only through explicit selection', pair.is_visible() and answer(page, base + 'material') is None and answer(page, base + 'hierarchy_id') is None)
            options = pair.locator('option').evaluate_all('xs=>xs.map(x=>({value:x.value,label:x.textContent.trim()}))')
            canonical = next(o for o in options if o['value'] and o['value'] not in (ND, '__other__'))
            before_surface = copy.deepcopy(snap(page)['doc']['episodes'][0]['answers']['surfaces'][pid])
            pair.select_option(canonical['value'])
            after_surface = snap(page)['doc']['episodes'][0]['answers']['surfaces'][pid]
            check('One reference choice saves its name and category', after_surface['hierarchy_id'] == canonical['value'] and bool(after_surface['material']))
            check('Reference material selection does not infer physics or other labels', {k: v for k, v in after_surface.items() if k not in ('material', 'hierarchy_id')} == {k: v for k, v in before_surface.items() if k not in ('material', 'hierarchy_id')})
            fill(page, base + 'material', 'SYNTHETIC custom painted plaster')
            page.locator(f'[data-material-pair="{base}hierarchy_id"]').select_option('__other__')
            check('Other category preserves independently entered material text', answer(page, base + 'material') == 'SYNTHETIC custom painted plaster' and answer(page, base + 'hierarchy_id') == '__other__')
            page.locator(f'[data-material-pair="{base}hierarchy_id"]').select_option(ND)
            check('Unknown category does not erase a known free-text material', answer(page, base + 'material') == 'SYNTHETIC custom painted plaster' and answer(page, base + 'hierarchy_id') == ND)
            page.remove_listener('dialog', page._test_dialog_handler)
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.locator(f'[data-material-pair="{base}hierarchy_id"]').select_option(canonical['value'])
            page.on('dialog', page._test_dialog_handler)
            check('Declining a canonical replacement preserves custom material and its category', answer(page, base + 'material') == 'SYNTHETIC custom painted plaster' and answer(page, base + 'hierarchy_id') == ND)
            choose(page, base + 'substrate_known', 'yes')
            check('Known substrate reveals its separate material and reference fields', field(page, base + 'substrate_material').count() == 1 and page.locator(f'[data-material-pair="{base}substrate_hierarchy_id"]').count() == 1)
            fill(page, base + 'substrate_material', 'SYNTHETIC brick backing')
            choose(page, base + 'substrate_known', 'no')
            check('Conditional substrate controls hide without deleting earlier answers', field(page, base + 'substrate_material').count() == 0 and answer(page, base + 'substrate_material') == 'SYNTHETIC brick backing')
            choose(page, base + 'substrate_known', 'yes')
            check('Returning to known substrate recovers its earlier material text', field(page, base + 'substrate_material').input_value() == 'SYNTHETIC brick backing')
            choose(page, base + 'reflectance', 'non_reflective')
            choose(page, base + 'finish', 'painted')
            choose(page, base + 'shelter', 'partial')
            choose(page, f'checks.surfaces.{pid}.obstruction', 'overhead_and_side')
            choose(page, f'checks.surfaces.{pid}.anchor_correct', 'no')
            choose(page, f'checks.surfaces.{pid}.same_surface_across_frames', ND)
            check('Finish, shelter, obstruction and negative or uncertain identity checks remain editable', answer(page, base + 'finish') == 'painted' and answer(page, base + 'shelter') == 'partial' and answer(page, f'checks.surfaces.{pid}.anchor_correct') == 'no' and answer(page, f'checks.surfaces.{pid}.same_surface_across_frames') == ND)
            page.locator(f'[data-confirm-point="{pid}"]').click()
            check('Explicit target confirmation records both identity checks without supplying material GT', answer(page, f'checks.surfaces.{pid}.anchor_correct') == 'yes' and answer(page, f'checks.surfaces.{pid}.same_surface_across_frames') == 'yes' and answer(page, base + 'material') == 'SYNTHETIC custom painted plaster')
            page.screenshot(path=str(report / 'compact-desktop.png'), full_page=True)
            section(page, 'review')
            check('Incomplete scene cannot be marked complete', page.locator('#completeScene').is_disabled())
            doc = dl(page, '#downloadButton', temporary / 'draft.json')
            check('Partial labels export without changing the full validator', valid(page, doc) == [])
            page.reload()
            ready(page)
            page.locator('#identityInput').fill('full-browser-test')
            page.locator('#startButton').click()
            image_ready(page)
            check('Reload preserves material text, detailed fields and explicit uncertainty', snap(page)['doc']['episodes'][0]['answers'] == doc['episodes'][0]['answers'] and snap(page)['doc']['episodes'][0]['checks'] == doc['episodes'][0]['checks'])
            for i in range(56):
                page.locator('#sceneSelect').select_option(index=i)
                image_ready(page)
            check('Every scene remains reachable without finishing prior scenes')
            page.locator('#sceneSelect').select_option(index=0)
            section(page, 'scene')
            for i in range(12):
                page.locator('#frameSlider').fill(str(i))
                page.locator('#frameSlider').dispatch_event('input')
                image_ready(page)
            check('All 12 ordered RGB frames remain viewable')
            page.set_viewport_size({'width': 390, 'height': 844})
            section(page, 'surfaces')
            image_ready(page)
            check('Mobile point form has no horizontal document overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            page.screenshot(path=str(report / 'compact-mobile.png'), full_page=True)

            # Approved research settings exist only in the intercepted response.
            approved = browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
            approved.route('**/collection-tasks.json', lambda route: route.fulfill(json=fixture['tasks']))
            p = start(approved)
            check('Reviewed disposable fixture enables directional scenarios', not p.locator('#setupNotice').is_visible())
            section(p, 'exposure')
            image_ready(p)
            check('Scenario clearly names direction and hypothetical state', 'SYNTHETIC direction' in p.locator('#questionPanel').inner_text() and 'open' in p.locator('#questionPanel').inner_text().lower())
            rows = p.locator('[data-point-row]')
            check('Each scenario displays every point with separate sun and rain choices', rows.count() == 8 and p.locator('select[data-field]').count() == 16)
            check('All exposure cells begin blank, not blocked by default', all(v == '' for v in p.locator('select[data-field]').evaluate_all('xs=>xs.map(x=>x.value)')))
            markers = fixture['tasks']['layout']['episodes'][0]['markers']
            for marker in markers:
                p.locator(f'[data-focus-marker="{marker["id"]}"]').click()
                image_ready(p)
                view = snap(p)
                assert view['focusMarker'] == marker['id'] and view['frame'] == int(marker['anchor_frame'][1:]) - 1
                assert p.locator('#pointOverlay circle').count() > 0
            check('Every exposure row can show its own correct anchor photograph and red point')
            sunpath = base + 'reachable.d1.open.sun'
            choose(p, sunpath, ND)
            check('Answering an exposure cell focuses its corresponding surface', snap(p)['focusMarker'] == pid and snap(p)['frame'] == int(point['anchor_frame'][1:]) - 1)
            check('Explicit uncertainty remains distinct from unanswered rain', answer(p, sunpath) == ND and answer(p, base + 'reachable.d1.open.rain') is None)
            p.locator('#skipQuestion').click()
            check('Skip advances one scenario without labeling unanswered cells', answer(p, base + 'reachable.d1.open.rain') is None)
            represented = set()
            section(p, 'exposure')
            for scenario in range(4):
                represented.update(p.locator('select[data-field]').evaluate_all('xs=>xs.map(x=>x.dataset.field)'))
                if scenario < 3:
                    p.locator('#skipQuestion').click()
            check('All 64 retained exposure cells are reachable through four screens', len(represented) == 64)
            p.screenshot(path=str(report / 'compact-exposure.png'), full_page=True)
            p.set_viewport_size({'width': 390, 'height': 844})
            check('Mobile scenario table has no horizontal document overflow', p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            p.screenshot(path=str(report / 'compact-exposure-mobile.png'), full_page=True)
            p.set_viewport_size({'width': 1440, 'height': 1050})
            section(p, 'pathways')
            represented = set()
            for scenario in range(4):
                represented.update(p.locator('select[data-field]').evaluate_all('xs=>xs.map(x=>x.dataset.field)'))
                if scenario < 3:
                    p.locator('#skipQuestion').click()
            check('All 16 open/sealed light, air and rain pathway judgments remain reachable', len(represented) == 16)

            legacy = copy.deepcopy(fixture['complete'])
            legacy['annotation_status'] = 'draft'
            legacy['episodes'][0]['status'] = 'in_progress'
            legacy['episodes'][0]['completed_at'] = None
            legacy['episodes'][0]['answers']['surfaces'][pid]['material'] = 'SYNTHETIC legacy specified material'
            legacy['episodes'][0]['answers']['surfaces'][pid]['hierarchy_id'] = '__other__'
            second_id = markers[1]['id']
            old_cursor = p.evaluate('async x=>L2Full.questions(x.doc,0,await fetch("dataset.json").then(r=>r.json()),await fetch("catalogue.json").then(r=>r.json())).filter(q=>q.section==="surfaces").findIndex(q=>q.marker_id===x.marker)', {'doc': legacy, 'marker': second_id})
            legacy['ui'].update(section='surfaces', question=old_cursor)
            import_doc(p, legacy, temporary, 'legacy-full.json')
            check('Legacy field-index cursor restores the correct compact point form', p.locator(f'.surface-form[data-marker-id="{second_id}"]').is_visible())
            section(p, 'surfaces')
            check('Existing full-schema custom material survives import into compact forms', answer(p, base + 'material') == 'SYNTHETIC legacy specified material' and field(p, base + 'material').input_value() == 'SYNTHETIC legacy specified material')
            restored = dl(p, '#downloadButton', temporary / 'roundtrip.json')
            check('Compact draft round-trip preserves all legacy answers and checks exactly', restored['episodes'][0]['answers'] == legacy['episodes'][0]['answers'] and restored['episodes'][0]['checks'] == legacy['episodes'][0]['checks'])
            missing_one = copy.deepcopy(legacy)
            missing_one['episodes'][0]['answers']['surfaces'][pid]['reachable']['d2']['sealed']['rain'] = None
            import_doc(p, missing_one, temporary, 'one-missing.json')
            section(p, 'review')
            check('One missing exposure judgment still blocks completion', p.locator('#completeScene').is_disabled() and bool(valid(p, missing_one, True)))
            p.locator(f'[data-missing="{base}reachable.d2.sealed.rain"]').click()
            check('Review missing-answer link opens the correct grouped scenario and target', field(p, base + 'reachable.d2.sealed.rain').count() == 1 and snap(p)['focusMarker'] == pid)
            import_doc(p, fixture['complete'], temporary, 'complete-input.json')
            section(p, 'review')
            check('Existing complete full export retains its completed state', snap(p)['doc']['annotation_status'] == 'complete')
            p.locator('#finalExport').evaluate('el=>el.closest("details").open=true')
            final = dl(p, '#finalExport', temporary / 'rater-a.json')
            check('Final export still requires the full collection validator', valid(p, final, True) == [] and final['annotation_status'] == 'complete')
            check('One completed rater annotation is not claimed as benchmark GT', final['benchmark_ready'] is False)
            check('Level 2 completion does not fabricate Level 3 visibility', any(v is None for v in final['episodes'][0]['answers']['surfaces'][pid]['visibility'].values()))
            check('Completed scene locks editing until explicitly reopened', p.locator('#reopenScene').is_visible())
            subprocess.run([PYTHON, 'scripts/validate_export.py', str(temporary / 'rater-a.json'), '--require-complete'], cwd=SITE, check=True, capture_output=True, text=True)
            (temporary / 'rater-b.json').write_text(json.dumps(fixture['second']))
            subprocess.run([PYTHON, 'scripts/consensus.py', str(temporary / 'rater-a.json'), str(temporary / 'rater-b.json'), '--out', str(temporary / 'consensus.json')], cwd=SITE, check=True, capture_output=True, text=True)
            subprocess.run([PYTHON, 'scripts/report_agreement.py', str(temporary / 'consensus.json'), '--out', str(temporary / 'agreement.md'), '--csv', str(temporary / 'agreement.csv')], cwd=SITE, check=True, capture_output=True, text=True)
            check('Browser export passes unchanged CLI validation, two-rater consensus and agreement reporting')
            p.locator('#reopenScene').click()
            section(p, 'scene')
            check('Reopening unlocks ordinary answers', p.locator('[data-value="yes"]').is_enabled())
            p.locator('#moreButton').click()
            p.locator('#profileSelect').select_option('l2_l3')
            check('Optional Level 3 mode clears completion and adds visibility work', snap(p)['doc']['profile'] == 'l2_l3' and snap(p)['doc']['annotation_status'] == 'draft')

            for label, mutate in [('foreign-build', lambda d: d.update(build_id='SYNTHETIC_FOREIGN_BUILD')), ('other-rater', lambda d: d.update(annotator='another-person'))]:
                bad = copy.deepcopy(doc)
                mutate(bad)
                path = temporary / (label + '.json')
                path.write_text(json.dumps(bad))
                before = snap(page)['doc']
                page.locator('#importFile').set_input_files(path)
                page.locator('#messageDialog').wait_for(state='visible')
                check('Unsafe ' + label + ' import cannot replace current answers', snap(page)['doc'] == before)
                page.locator('#closeMessage').click()

            page.set_viewport_size({'width': 1440, 'height': 1050})
            other = start(ctx)
            section(other, 'scene')
            other.locator('[data-value="no"]').click()
            page.locator('#conflictBanner').wait_for(state='visible')
            check('Concurrent edits lock the stale tab instead of silently overwriting', snap(page)['conflict'])
            stale = dl(page, '#downloadButton', temporary / 'stale-copy.json')
            check('Stale tab can still download its own recoverable answers', stale['episodes'][0]['answers']['scene']['crossing_valid'] == 'yes')
            other.close()
            quota_context = browser.new_context(accept_downloads=True)
            quota_context.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('SYNTHETIC quota test','QuotaExceededError')};")
            quota = start(quota_context, identity='quota-test')
            check('Storage quota failure remains visible without blocking annotation', quota.locator('#storageWarning').is_visible())
            quota.locator('[data-value="yes"]').click()
            saved = dl(quota, '#downloadButton', temporary / 'quota-copy.json')
            check('Storage-failure session can export in-memory labels', saved['episodes'][0]['answers']['scene']['crossing_valid'] == 'yes')
            quota_context.close()
            sub = browser.new_context(accept_downloads=True)
            sp = start(sub, 'project/' + entry)
            check('Compact collector works under a GitHub Pages-style project subdirectory', sp.locator('#sceneImage').is_visible())
            check('No JavaScript exceptions', not errors)
            check('No external requests', not external)
            check('No failed asset requests', not failed)
            browser.close()
            passed = True
    finally:
        server.shutdown()
        server.server_close()
        result = {'passed': passed, 'checks': checks, 'check_count': len(checks), 'entry': entry, 'javascript_errors': errors, 'failed_requests': failed, 'external_requests': external, 'synthetic_test_answers_only': True, 'coverage': 'Compact UI against unchanged full-schema validation and consensus'}
        for filename in ('full_browser_report.json', 'compact_browser_report.json'):
            (report / filename).write_text(json.dumps(result, indent=2) + '\n')
    return len(checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} compact full workflow checks passed.')
