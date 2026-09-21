#!/usr/bin/env python3
"""Sun/rain collection checks with synthetic answers in disposable browsers.

Researcher approvals and feature-relative directions are intercepted test
fixtures only. No distributed scene, task or human annotation is modified.
"""
import argparse
import copy
import functools
import hashlib
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
        try:
            return super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            # Closing a disposable browser can cancel background mask fetches.
            # HTTP failures while a page is active are recorded separately.
            pass


def resign_tasks(tasks):
    script = "const fs=require('fs'),C=require('./core.js'),F=require('./full-core.js'),t=JSON.parse(fs.readFileSync(0,'utf8'));t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);process.stdout.write(JSON.stringify(t));"
    return json.loads(subprocess.check_output([NODE, '-e', script], input=json.dumps(tasks), text=True, cwd=SITE))


def run(entry='index.html'):
    checks, errors, external, failed = [], [], [], []
    report = SITE / 'validation'
    report.mkdir(exist_ok=True)
    original_hashes = {p: hashlib.sha256((SITE / p).read_bytes()).hexdigest()
                       for p in ('dataset.json', 'catalogue.json', 'collection-tasks.json')}
    fixture = json.loads(subprocess.check_output([NODE, str(SITE / 'tests/make_full_fixtures.cjs')], text=True))
    tasks = copy.deepcopy(fixture['tasks'])
    tasks['layout']['episodes'][0]['directions'] = [
        {'id': 'd1', 'text': 'SYNTHETIC: sun and rain coming in from the open side of the terrace beside the wide window. <img src=x onerror="window.__directionXss=true">', 'reference_frame': 'f01', 'x': .4, 'y': .5},
        {'id': 'd2', 'text': 'SYNTHETIC: sun and rain coming in sideways from the left side of the visible terrace railing.', 'reference_frame': 'f07', 'x': .5, 'y': .3},
    ]
    tasks = resign_tasks(tasks)
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

    def image_ready(page):
        page.wait_for_function('L2Collection.getSnapshot().imageReady && document.querySelector("#sceneImage").naturalWidth>0')

    def start(context, identity='sunrain-browser-test', path=entry):
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith((origin, 'blob:', 'data:')) else None)
        page.on('response', lambda r: failed.append((r.status, r.url)) if r.status >= 400 else None)
        page.on('dialog', lambda d: d.accept('SYNTHETIC TEST ONLY') if d.type == 'prompt' else d.accept())
        page.goto(origin + path)
        page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')
        page.locator('#identityInput').fill(identity)
        page.locator('#startButton').click()
        image_ready(page)
        return page

    def section(page, name):
        page.locator(f'#sections [data-section="{name}"]').click()
        image_ready(page)

    def human_state(page):
        return [{'answers': r['answers'], 'checks': r['checks']} for r in snap(page)['doc']['episodes']]

    def field(page, path):
        return page.locator(f'[data-field="{path}"]')

    def at_path(obj, path):
        for part in path.split('.'):
            obj = obj[part]
        return obj

    def download(page, target):
        with page.expect_download(timeout=60000) as pending:
            page.locator('#downloadButton').click()
        pending.value.save_as(target)
        return json.loads(target.read_text())

    def import_doc(page, doc, target):
        target.write_text(json.dumps(doc))
        page.locator('#importFile').set_input_files(target)
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        image_ready(page)

    def rules_present(page):
        rules = page.locator('#questionPanel .physics-rule').inner_text().lower()
        return ('clear glass' in rules and 'sunlight' in rules and 'rain' in rules
                and 'slats' in rules and 'lattice' in rules and 'not sure' in rules
                and 'sideways' in rules)

    def reference_correct(page, direction):
        arrow = page.locator('#pointOverlay [data-direction-reference]')
        circles = page.locator('#pointOverlay circle').evaluate_all('xs=>xs.map(x=>({x:Number(x.getAttribute("cx")),y:Number(x.getAttribute("cy"))}))')
        endpoints = page.locator('#pointOverlay [data-direction-reference] line').evaluate_all('xs=>xs.map(x=>({x:Number(x.getAttribute("x2")),y:Number(x.getAttribute("y2")),head:x.getAttribute("marker-end")}))')
        return (arrow.count() >= 1 and snap(page)['frame'] == int(direction['reference_frame'][1:]) - 1
                and any(abs(c['x'] - direction['x'] * 1000) < .01 and abs(c['y'] - direction['y'] * 800) < .01 for c in circles)
                and any(abs(p['x'] - direction['x'] * 1000) < .01 and abs(p['y'] - direction['y'] * 800) < .01 and p['head'] for p in endpoints))

    passed = False
    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-sunrain-browser-') as td, sync_playwright() as pw:
            temporary = Path(td)
            browser = pw.chromium.launch()
            unapproved = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
            blocked = start(unapproved, identity='sunrain-unapproved-test')
            section(blocked, 'exposure')
            before = human_state(blocked)
            check('Unreviewed published directions still block sun/rain answers', blocked.locator('#questionPanel select:not([disabled])').count() == 0 and blocked.locator('#questionPanel .blocked-section').is_visible())
            check('Unreviewed direction cannot display a fabricated reference arrow', blocked.locator('#showReference').is_disabled() and blocked.locator('#pointOverlay [data-direction-reference]').count() == 0)
            check('Viewing blocked scenarios does not fill human judgments', human_state(blocked) == before)
            unapproved.close()

            context = browser.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True)
            context.route('**/collection-tasks.json', lambda route: route.fulfill(json=tasks))
            page = start(context)
            check('Only the disposable reviewed fixture unlocks directional annotation', not page.locator('#setupNotice').is_visible())
            section(page, 'surfaces')
            markers = tasks['layout']['episodes'][0]['markers']
            pid = markers[0]['id']
            shelter = field(page, 'answers.surfaces.' + pid + '.shelter')
            shelter.select_option('slats_lattice')
            section(page, 'exposure')
            initial = snap(page)['doc']['episodes'][0]
            check('Each scenario shows all eight researcher points with independent sun and rain columns', page.locator('[data-point-row]').count() == 8 and page.locator('#questionPanel select[data-field]').count() == 16)
            check('Sun/rain judgments start blank even when a point has lattice shelter', all(v == '' for v in page.locator('#questionPanel select[data-field]').evaluate_all('xs=>xs.map(x=>x.value)')))
            options = page.locator('#questionPanel select[data-field]').first.locator('option').evaluate_all('xs=>xs.map(x=>({value:x.value,text:x.textContent.trim()}))')
            labels = {o['value']: o['text'].lower() for o in options}
            check('Direct exposure choices explicitly say Hit directly / Not hit / Not sure', labels.get('yes') == 'hit directly' and labels.get('no') == 'not hit' and labels.get(ND) == 'not sure' and '' in labels)
            check('Sun and rain protocol rules are next to the exposure questions', rules_present(page))
            check('Researcher direction is described using a visible terrace feature', 'open side of the terrace' in page.locator('#questionPanel .scenario').inner_text())
            check('Direction text is escaped rather than interpreted as HTML', '<img src=x' in page.locator('#questionPanel .scenario').inner_text() and page.locator('#questionPanel .scenario img').count() == 0 and not page.evaluate('Boolean(window.__directionXss)'))
            before = human_state(page)
            page.locator('#showReference').click()
            image_ready(page)
            check('Direction 1 arrow callout points to its saved feature in its saved reference frame', reference_correct(page, tasks['layout']['episodes'][0]['directions'][0]))
            check('Reference arrow is explicitly distinguished from a simulated travel vector', 'reference' in (page.locator('#pointImageHint').inner_text() + page.locator('#questionPanel').inner_text()).lower() and any(word in page.locator('#questionPanel').inner_text().lower() for word in ('not a', 'not the', 'not an')))
            check('Reading rules and displaying a reference arrow does not change any human answer', human_state(page) == before)
            page.locator('#nextFrame').click()
            image_ready(page)
            check('Reference arrow is never overlaid on the wrong camera frame', page.locator('#pointOverlay [data-direction-reference]').count() == 0)
            page.locator(f'[data-focus-marker="{pid}"]').click()
            image_ready(page)
            check('Show point returns to the red surface anchor instead of leaving the reference arrow', snap(page)['frame'] == int(markers[0]['anchor_frame'][1:]) - 1 and page.locator('#pointOverlay [data-direction-reference]').count() == 0 and page.locator('#pointOverlay circle').count() > 0)
            check('Switching reference and point views leaves all exposure labels blank', snap(page)['doc']['episodes'][0]['answers']['surfaces'][pid]['reachable'] == initial['answers']['surfaces'][pid]['reachable'])

            expected, represented = {}, set()
            values = ('yes', 'no', ND)
            for scenario_index in range(4):
                view = snap(page)
                panel = view['panel']
                paths = page.locator('#questionPanel select[data-field]').evaluate_all('xs=>xs.map(x=>x.dataset.field)')
                check(f'Scenario {scenario_index + 1} keeps separate sun/rain choices for every point', len(paths) == 16 and all(sum(p.startswith('answers.surfaces.' + m['id'] + '.reachable.') for p in paths) == 2 for m in markers))
                check(f'Scenario {scenario_index + 1} repeats both protocol rules', rules_present(page))
                check(f'Scenario {scenario_index + 1} retains its explicit hypothetical opening state', ('tightly closed' if panel['condition'] == 'sealed' else 'fully open') in page.locator('.scenario-condition').inner_text().lower())
                if scenario_index == 2:
                    before_arrow = human_state(page)
                    page.locator('#showReference').click()
                    image_ready(page)
                    check('Direction 2 switches to its different saved reference photo and feature', reference_correct(page, tasks['layout']['episodes'][0]['directions'][1]))
                    check('Sideways direction wording is visible without overwriting point answers', 'sideways' in page.locator('#questionPanel .scenario').inner_text() and human_state(page) == before_arrow)
                for cell_index, path in enumerate(paths):
                    assert path not in represented, path
                    represented.add(path)
                    chosen = values[(scenario_index * 16 + cell_index) % 3]
                    field(page, path).select_option(chosen)
                    expected[path] = chosen
                # Editing a later cell must not replace any previous point or
                # scenario answer, including the yes/no/ND distinctions.
                current = snap(page)['doc']['episodes'][0]
                check(f'Scenario {scenario_index + 1} edits preserve every earlier independent judgment', all(at_path(current, path) == value for path, value in expected.items()))
                if scenario_index < 3:
                    page.locator('#skipQuestion').click()
                    image_ready(page)
            check('Exactly 64 original sun/rain facts are represented across four compact screens', len(represented) == 64 and len(expected) == 64)
            current = snap(page)['doc']['episodes'][0]
            check('No and Not sure remain separate saved values, not a shared negative class', set(expected.values()) == {'yes', 'no', ND} and all(at_path(current, path) == value for path, value in expected.items()))
            check('Lattice shelter never automatically forces a rain answer or overrides the annotator', current['answers']['surfaces'][pid]['shelter'] == 'slats_lattice' and {current['answers']['surfaces'][pid]['reachable'][d][c]['rain'] for d in ('d1', 'd2') for c in ('open', 'sealed')} == {'yes', 'no', ND})
            check('No additional human answer fields were introduced', current['answers'].keys() == initial['answers'].keys() and current['checks'].keys() == initial['checks'].keys() and all(current['answers']['surfaces'][m['id']].keys() == initial['answers']['surfaces'][m['id']].keys() for m in markers))

            # Show a legitimate feature reference for visual review, rather
            # than the escaping-test string in the other synthetic direction.
            page.locator('#showReference').click()
            image_ready(page)
            check('Desktop sun/rain form has no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            page.screenshot(path=str(report / 'sunrain-desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            check('Mobile sun/rain form has no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            check('Mobile exposure choices, scenario wording and rules remain visible', page.locator('#questionPanel select[data-field]').count() == 16 and rules_present(page) and page.locator('#showReference').is_visible())
            page.screenshot(path=str(report / 'sunrain-mobile.png'), full_page=True)
            doc = download(page, temporary / 'sunrain-export.json')
            check('Export preserves all 64 independent judgments with exact yes/no/ND values', all(at_path(doc['episodes'][0], path) == value for path, value in expected.items()))
            check('Export retains reviewed direction wording, anchors and condition definitions', doc['tasks']['layout']['episodes'][0]['directions'] == tasks['layout']['episodes'][0]['directions'] and doc['tasks']['layout']['conditions'] == tasks['layout']['conditions'])
            subprocess.run([PYTHON, 'scripts/validate_export.py', str(temporary / 'sunrain-export.json')], cwd=SITE, check=True, capture_output=True, text=True)
            check('Offline validator accepts the full sun/rain draft unchanged')
            import_doc(page, doc, temporary / 'sunrain-import.json')
            restored = download(page, temporary / 'sunrain-restored.json')
            check('JSON restore preserves every human answer and review check', [{'answers': r['answers'], 'checks': r['checks']} for r in restored['episodes']] == [{'answers': r['answers'], 'checks': r['checks']} for r in doc['episodes']])
            page.reload()
            page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')
            page.locator('#identityInput').fill('sunrain-browser-test')
            page.locator('#startButton').click()
            image_ready(page)
            reloaded_record = snap(page)['doc']['episodes'][0]
            check('Browser reload preserves all independently collected sun/rain judgments', all(at_path(reloaded_record, path) == value for path, value in expected.items()))

            subcontext = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
            subcontext.route('**/collection-tasks.json', lambda route: route.fulfill(json=tasks))
            subpage = start(subcontext, identity='sunrain-subdirectory-test', path='project/' + entry)
            section(subpage, 'exposure')
            subpage.locator('#showReference').click()
            image_ready(subpage)
            check('Scenario controls and reference arrow work under a GitHub Pages project subdirectory', rules_present(subpage) and reference_correct(subpage, tasks['layout']['episodes'][0]['directions'][0]))
            check('No JavaScript exceptions', not errors)
            check('No external requests', not external)
            check('No failed asset requests', not failed)
            check('All published dataset, catalogue and task bytes remain untouched', original_hashes == {p: hashlib.sha256((SITE / p).read_bytes()).hexdigest() for p in original_hashes})
            browser.close()
            passed = True
    finally:
        server.shutdown()
        server.server_close()
        result = {'passed': passed, 'checks': checks, 'check_count': len(checks), 'entry': entry,
                  'javascript_errors': errors, 'failed_requests': failed, 'external_requests': external,
                  'synthetic_test_answers_only': True,
                  'coverage': 'Four scenarios, 64 independent exposure values; clear-glass/lattice guidance; feature-reference callout, escaping, legacy schema and mobile/subdirectory behavior.'}
        (report / 'sunrain_browser_report.json').write_text(json.dumps(result, indent=2) + '\n')
    return len(checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} sun/rain checks passed.')
