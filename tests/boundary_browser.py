#!/usr/bin/env python3
"""Exercise compact opening facts using disposable, explicitly synthetic answers."""
import argparse
import copy
import functools
import http.server
import json
import re
import subprocess
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
PYTHON = '/home/ahmed/miniconda3/envs/scannetpp/bin/python'
ND = 'not_determinable'
PATHS = {
    'answers.boundary.kind': 'door',
    'checks.boundary.width_class': 'double_door',
    'answers.boundary.pane_transparency': 'obscured',
    'checks.boundary.blockage': 'curtains',
    'answers.boundary.observed_state': 'ajar',
}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.startswith('/project/'):
            self.path = self.path[len('/project'):]
        return super().do_GET()


def run(entry='index.html'):
    checks, errors, external, failed, expected_missing = [], [], [], [], []
    report = SITE / 'validation'
    report.mkdir(exist_ok=True)
    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'

    def check(name, condition=True):
        assert condition, name
        checks.append(name)
        print('PASS ' + name, flush=True)

    def snap(page):
        return page.evaluate('L2Collection.getSnapshot()')

    def field(page, path):
        return page.locator(f'.boundary-form [data-field="{path}"]')

    def ready(page):
        page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')

    def image_ready(page):
        page.wait_for_function('L2Collection.getSnapshot().imageReady && document.querySelector("#sceneImage").naturalWidth>0')

    def start(context, identity='boundary-browser-test', path=entry, missing_measurement=False):
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith((origin, 'blob:', 'data:')) else None)
        page.on('response', lambda r: (expected_missing if missing_measurement and r.status == 404 and r.url.endswith('/boundary-measurements.json') else failed).append((r.status, r.url)) if r.status >= 400 else None)
        page.on('dialog', lambda d: d.accept('SYNTHETIC TEST ONLY') if d.type == 'prompt' else d.accept())
        page.goto(origin + path)
        ready(page)
        page.locator('#identityInput').fill(identity)
        page.locator('#startButton').click()
        image_ready(page)
        return page

    def opening(page, answer_identity=True):
        page.locator('#sections [data-section="boundary"]').click()
        if answer_identity:
            page.locator('[data-value="yes"]').click()
            page.locator('#nextQuestion').click()
        else:
            page.locator('#skipQuestion').click()
        page.locator('.boundary-form').wait_for(state='visible')
        image_ready(page)

    def get_answer(page, path):
        value = snap(page)['doc']['episodes'][0]
        for key in path.split('.'):
            value = value[key]
        return value

    def export(page, path):
        with page.expect_download() as pending:
            page.locator('#downloadButton').click()
        pending.value.save_as(path)
        return json.loads(path.read_text())

    def valid(page, doc):
        return page.evaluate('async doc=>L2Full.validate(doc,await fetch("dataset.json").then(r=>r.json()),await fetch("catalogue.json").then(r=>r.json()))', doc)

    def import_doc(page, doc, path):
        path.write_text(json.dumps(doc))
        page.locator('#importFile').set_input_files(path)
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        image_ready(page)

    passed = False
    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-boundary-browser-') as td, sync_playwright() as pw:
            temporary = Path(td)
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
            page = start(ctx)
            opening(page)
            check('Five opening facts appear together on one form', page.locator('.boundary-form select[data-field]').count() == 5)
            check('Fresh forms have no inferred human labels', all(field(page, p).input_value() == '' and get_answer(page, p) is None for p in PATHS))
            expected = {
                'answers.boundary.kind': {'door', 'window', 'open_passage', ND},
                'checks.boundary.width_class': {'single_door', 'double_door', 'wide_glass_wall', ND},
                'answers.boundary.pane_transparency': {'clear', 'obscured', 'opaque', ND},
                'checks.boundary.blockage': {'none', 'curtains', 'blinds', 'screen', 'furniture', 'multiple', 'other', ND},
                'answers.boundary.observed_state': {'open', 'closed', 'ajar', ND},
            }
            for path, values in expected.items():
                actual = set(field(page, path).locator('option').evaluate_all('xs=>xs.map(x=>x.value)'))
                check('Requested options exist for ' + path, values <= actual)
            measurement = page.locator('.boundary-measurement')
            text = measurement.inner_text()
            check('Mesh estimate is visible with honest object-span wording', 'Mesh object span' in text and re.search(r'\d+(?:\.\d+)?\s*m\b', text) is not None)
            check('Machine width is not an editable human answer', measurement.locator('input,select,textarea,[contenteditable="true"]').count() == 0)
            check('Desktop form has no horizontal document overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            check('Incomplete opening form cannot advance as completed', page.locator('#nextQuestion').is_disabled())
            for path, value in PATHS.items():
                field(page, path).select_option(value)
                check('Selection is recorded at ' + path, get_answer(page, path) == value)
            check('All five explicit answers enable Next', page.locator('#nextQuestion').is_enabled())
            page.locator('#sceneNotes').evaluate('el=>el.closest("details").open=true')
            page.locator('#sceneNotes').fill('SYNTHETIC: curtains partly obscure this opening; confirm using other views.')
            page.locator('#sceneNotes').blur()
            check('Optional explanation persists without another required question', 'SYNTHETIC:' in get_answer(page, 'answers.notes'))
            page.screenshot(path=str(report / 'boundary-desktop.png'), full_page=True)
            draft = export(page, temporary / 'draft.json')
            check('New opening fields export with explicit question version', draft.get('boundary_questions_version') == 1 and valid(page, draft) == [])
            check('Machine geometry is not exported as a human width answer', set(draft['episodes'][0]['checks']['boundary']) == {'width_class', 'blockage'} and 'width_m' not in draft['episodes'][0]['answers']['boundary'])
            subprocess.run([PYTHON, 'scripts/validate_export.py', str(temporary / 'draft.json')], cwd=SITE, check=True, capture_output=True, text=True)
            check('Browser draft is accepted by the offline validator')
            page.reload()
            ready(page)
            page.locator('#identityInput').fill('boundary-browser-test')
            page.locator('#startButton').click()
            image_ready(page)
            check('Reload preserves every answer and the current grouped form', page.locator('.boundary-form').is_visible() and snap(page)['doc']['episodes'][0]['answers'] == draft['episodes'][0]['answers'] and snap(page)['doc']['episodes'][0]['checks'] == draft['episodes'][0]['checks'])
            field(page, 'answers.boundary.kind').select_option('open_passage')
            field(page, 'answers.boundary.observed_state').select_option('no_closure')
            check('Open gaps support no door or closure without a fictitious closed door', get_answer(page, 'answers.boundary.kind') == 'open_passage' and get_answer(page, 'answers.boundary.observed_state') == 'no_closure')
            field(page, 'checks.boundary.width_class').select_option(ND)
            field(page, 'checks.boundary.blockage').select_option(ND)
            check('Not sure is saved explicitly rather than as an unanswered field', get_answer(page, 'checks.boundary.width_class') == ND and get_answer(page, 'checks.boundary.blockage') == ND)
            page.set_viewport_size({'width': 390, 'height': 844})
            check('Mobile opening form has no horizontal document overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            page.screenshot(path=str(report / 'boundary-mobile.png'), full_page=True)
            for blocker in ('multiple', 'other'):
                field(page, 'checks.boundary.blockage').select_option(blocker)
                page.locator('#sceneNotes').evaluate('el=>el.closest("details").open=true')
                page.locator('#sceneNotes').fill('')
                page.locator('#sceneNotes').blur()
                page.locator('#sections [data-section="review"]').click()
                check(blocker + ' blockers require a brief explanation at scene review', 'naming the multiple or other blockers' in page.locator('#questionPanel').inner_text())
                page.locator('#reviewNotes').fill('SYNTHETIC blocker details: curtains and furniture; width unknown.')
                page.locator('#reviewNotes').blur()
                check(blocker + ' explanation clears its review warning', 'naming the multiple or other blockers' not in page.locator('#questionPanel').inner_text())
                opening(page)
                check(blocker + ' blocker details are retained with the five-field form', get_answer(page, 'checks.boundary.blockage') == blocker and 'curtains and furniture' in get_answer(page, 'answers.notes'))

            # Simulate an actual pre-extension export: old fields unchanged,
            # extension version/width/blockage absent, and existing door subtype.
            legacy = copy.deepcopy(draft)
            legacy.pop('boundary_questions_version')
            for record in legacy['episodes']:
                del record['checks']['boundary']
            legacy['episodes'][0]['answers']['boundary']['kind'] = 'sliding_door'
            check('Pre-extension export remains readable by the validator', valid(page, legacy) == [])
            import_doc(page, legacy, temporary / 'legacy.json')
            upgraded = snap(page)['doc']
            check('Import upgrades old drafts to current opening questions', upgraded.get('boundary_questions_version') == 1 and upgraded['episodes'][0]['checks']['boundary'] == {'width_class': None, 'blockage': None})
            check('Upgrade preserves all pre-existing human answer values', all(a['answers'] == b['answers'] for a, b in zip(upgraded['episodes'], legacy['episodes'])))
            check('Upgrade records source provenance instead of silently changing the schema', len(upgraded['migration_log']) > len(legacy['migration_log']) and bool(re.fullmatch('[a-f0-9]{64}', upgraded['migration_log'][-1]['source_sha256'])))
            opening(page)
            check('Legacy specific door type remains available and selected', field(page, 'answers.boundary.kind').input_value() == 'sliding_door')
            check('Legacy answers do not prefill newly required width and blockage', field(page, 'checks.boundary.width_class').input_value() == '' and field(page, 'checks.boundary.blockage').input_value() == '')
            exported_upgrade = export(page, temporary / 'upgraded.json')
            check('Upgraded draft remains valid and retains provenance on export', valid(page, exported_upgrade) == [] and exported_upgrade['migration_log'] == upgraded['migration_log'])

            old_storage_key = snap(page)['storageKey']
            old_envelope = json.dumps({'schema': 'blockmind_l2_full_local_v1', 'revision': 7, 'owner': 'SYNTHETIC prior browser session', 'data': legacy})
            resume_ctx = browser.new_context(accept_downloads=True)
            resume_ctx.add_init_script('localStorage.setItem(' + json.dumps(old_storage_key) + ',' + json.dumps(old_envelope) + ');')
            resumed = start(resume_ctx)
            resumed_doc = snap(resumed)['doc']
            check('Old local browser drafts upgrade automatically without losing answers', resumed_doc.get('boundary_questions_version') == 1 and all(a['answers'] == b['answers'] for a, b in zip(resumed_doc['episodes'], legacy['episodes'])))
            backups = resumed.evaluate('Object.keys(localStorage).filter(k=>k.includes(":before-boundary-v1:")).map(k=>localStorage.getItem(k))')
            check('Local draft upgrade archives the exact previous storage envelope', old_envelope in backups)
            resume_ctx.close()

            # Invalid/missing machine metadata must not prevent human collection.
            measurement_doc = json.loads((SITE / 'boundary-measurements.json').read_text())
            bad_metadata = copy.deepcopy(measurement_doc)
            bad_metadata['dataset_build_id'] = 'SYNTHETIC_FOREIGN_BUILD'
            wrong_object = copy.deepcopy(measurement_doc)
            first_episode = draft['episodes'][0]['episode_id']
            wrong_object['episodes'][first_episode]['boundary_object_id'] = -999
            for label, replacement in [('wrong-build', bad_metadata), ('wrong-object', wrong_object), ('unavailable', {}), ('missing-file', None)]:
                fallback_ctx = browser.new_context(accept_downloads=True)
                fallback_ctx.route('**/boundary-measurements.json', lambda route: route.fulfill(json=replacement) if replacement is not None else route.fulfill(status=404, body='SYNTHETIC absent optional measurement'))
                fallback = start(fallback_ctx, identity='boundary-' + label, missing_measurement=replacement is None)
                opening(fallback)
                fallback_text = fallback.locator('.boundary-measurement').inner_text()
                check(label + ' estimate is visibly unavailable, never a fabricated number', re.search(r'\d+(?:\.\d+)?\s*m\b', fallback_text) is None and bool(re.search('unavailable|not available|not measured', fallback_text, re.I)))
                check(label + ' metadata does not disable manual opening choices', field(fallback, 'checks.boundary.width_class').is_enabled())
                fallback_ctx.close()
            check('Missing-file test actually exercised an HTTP 404', len(expected_missing) == 1)

            subctx = browser.new_context(accept_downloads=True)
            sub = start(subctx, identity='boundary-subdirectory', path='project/' + entry)
            opening(sub)
            check('Opening measurement also loads under a GitHub project subdirectory', 'Mesh object span' in sub.locator('.boundary-measurement').inner_text())
            check('No JavaScript exceptions', not errors)
            check('No external requests', not external)
            check('No failed asset requests', not failed)
            browser.close()
            passed = True
    finally:
        server.shutdown()
        server.server_close()
        (report / 'boundary_browser_report.json').write_text(json.dumps({
            'passed': passed, 'checks': checks, 'check_count': len(checks),
            'entry': entry, 'javascript_errors': errors,
            'failed_requests': failed, 'external_requests': external,
            'expected_missing_measurement_requests': expected_missing,
            'synthetic_test_answers_only': True,
            'coverage': 'Five-field opening form, measurement provenance, draft compatibility and safe missing-data behavior',
        }, indent=2) + '\n')
    return len(checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} opening browser checks passed.')
