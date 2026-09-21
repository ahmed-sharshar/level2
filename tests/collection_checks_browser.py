#!/usr/bin/env python3
"""Exercise passage consistency sets, indoor visibility, and independent drafts.

All responses and researcher approvals are synthetic, intercepted browser
fixtures. The distributed scene/task package and human exports are untouched.
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
            pass  # Disposable contexts can cancel pending mask requests.


def fixture_tasks():
    script = """
    const C=require('./core.js'),F=require('./full-core.js'),D=require('./dataset.json'),K=require('./catalogue.json');
    const t=F.createTasks(D,K,'SYNTHETIC COLLECTION CHECKS TEST');
    t.settings.hierarchy_reviewed=true;t.settings.hierarchy_reviewer='SYNTHETIC TEST';
    t.settings.protocol_reviewed=true;t.settings.protocol_reviewer='SYNTHETIC TEST';
    t.settings.protocol_notes='SYNTHETIC TEST ONLY; not a research approval.';
    for(const [i,e] of t.layout.episodes.entries()){
      if(i){e.disposition='exclude';e.exclusion_reason='SYNTHETIC TEST ONLY';continue;}
      e.setup_reviewed=true;e.setup_notes='SYNTHETIC TEST ONLY';
      e.directions=[{id:'d1',text:'SYNTHETIC: from the open side of the terrace.',reference_frame:'f01',x:.4,y:.5},
                    {id:'d2',text:'SYNTHETIC: sideways from beside the terrace railing.',reference_frame:'f07',x:.5,y:.3}];
    }
    t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);
    const errors=F.validateTasks(t,D,K,true);if(errors.length)throw Error(JSON.stringify(errors));
    process.stdout.write(JSON.stringify(t));
    """
    return json.loads(subprocess.check_output([NODE, '-e', script], cwd=SITE, text=True))


def run(entry='index.html'):
    checks, errors, external, failed = [], [], [], []
    output = SITE / 'validation'
    output.mkdir(exist_ok=True)
    originals = {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest()
                 for name in ('dataset.json', 'catalogue.json', 'collection-tasks.json')}
    tasks = fixture_tasks()
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

    def start(context, identity='collection-checks-rater-a', path=entry):
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

    def context(browser, mobile=False):
        ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 1050}, accept_downloads=True)
        ctx.route('**/collection-tasks.json', lambda route: route.fulfill(json=tasks))
        return ctx

    def section(page, name):
        page.locator(f'#sections [data-section="{name}"]').click()
        image_ready(page)

    def at_path(value, path):
        for key in path.split('.'):
            value = value[key]
        return value

    def answer(page, path):
        return page.evaluate('path=>L2Full.get(L2Collection.getSnapshot().doc.episodes[0],path)', path)

    def human_state(page):
        return [{'answers': e['answers'], 'checks': e['checks']} for e in snap(page)['doc']['episodes']]

    def box(page, path, value):
        return page.locator(f'input[data-multiselect-path="{path}"][value="{value}"]')

    def questions(page):
        return page.evaluate('async()=>L2Full.questions(L2Collection.getSnapshot().doc,0,L2Collection.getDataset(),await fetch("catalogue.json").then(r=>r.json()))')

    def valid(page, doc, complete=False):
        return page.evaluate('async x=>L2Full.validate(x.doc,L2Collection.getDataset(),await fetch("catalogue.json").then(r=>r.json()),x.complete)', {'doc': doc, 'complete': complete})

    def download(page, target):
        with page.expect_download(timeout=60000) as pending:
            page.locator('#downloadButton').click()
        pending.value.save_as(target)
        return json.loads(target.read_text())

    def restore(page, doc, target):
        target.write_text(json.dumps(doc))
        page.locator('#importFile').set_input_files(target)
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        image_ready(page)

    def to_visibility_point(page, marker_id):
        section(page, 'visibility')
        wanted = 'checks.indoor_visibility.' + marker_id
        for _ in range(30):
            if box(page, wanted, 'f07').count():
                return wanted
            page.locator('#skipQuestion').click()
            image_ready(page)
        raise AssertionError('Indoor visibility question not reachable for ' + marker_id)

    passed = False
    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-collection-browser-') as td, sync_playwright() as pw:
            temporary = Path(td)
            browser = pw.chromium.launch()
            ctx = context(browser)
            page = start(ctx)
            check('Fresh drafts opt in to the versioned collection checks', snap(page)['doc'].get('collection_checks_version') == 1)
            markers = tasks['layout']['episodes'][0]['markers']
            indoor = [m for m in markers if m['side'] == 'indoor']
            expected_passage, expected_visibility = {}, {}
            initial_answers = copy.deepcopy(snap(page)['doc']['episodes'][0]['answers'])
            qlist = questions(page)
            passage_qs = [q for q in qlist if q['section'] == 'pathways']
            visibility_qs = [q for q in qlist if q['path'].startswith('checks.indoor_visibility.')]
            check('Exactly four opening scenarios each use one consistency-only multi-selection', len(passage_qs) == 4 and all(q['kind'] == 'multiselect' and q.get('consistency_only') is True for q in passage_qs))
            check('The old pathway answer fields are not presented as benchmark answers', not any(q['path'].startswith('answers.pathways.') for q in qlist))
            check('Each indoor point gets exactly one visibility set and exterior points get none', {q['path'] for q in visibility_qs} == {'checks.indoor_visibility.' + m['id'] for m in indoor})
            check('Door visibility certification remains separate from indoor surface visibility', any(q['path'].startswith('answers.boundary_visibility.') for q in qlist))

            section(page, 'pathways')
            for index, q in enumerate(passage_qs):
                path = q['path']
                controls = page.locator(f'input[data-multiselect-path="{path}"]')
                values = controls.evaluate_all('xs=>xs.map(x=>x.value)')
                check(f'Scenario {index + 1} offers sunlight, rain, air, visible light, Nothing and Not sure', set(values) == {'sunlight', 'rain', 'air', 'visible_light', 'none', ND} and controls.count() == 6)
                check(f'Scenario {index + 1} starts unanswered, not Nothing', answer(page, path) is None and page.locator(f'input[data-multiselect-path="{path}"]:checked').count() == 0)
                text = page.locator('#questionPanel').inner_text().lower()
                check(f'Scenario {index + 1} clearly labels these selections as consistency checks', 'consistency' in text and ('rule' in text or 'not the' in text))
                box(page, path, 'sunlight').check()
                box(page, path, 'visible_light').check()
                check(f'Scenario {index + 1} permits independent sunlight and visible-light selections', answer(page, path) == ['sunlight', 'visible_light'])
                if index == 0:
                    box(page, path, 'none').check()
                    check('Nothing clears every positive passage selection', answer(page, path) == ['none'] and page.locator(f'input[data-multiselect-path="{path}"]:checked').count() == 1)
                    box(page, path, ND).check()
                    check('Not sure excludes Nothing and every positive selection', answer(page, path) == [ND] and page.locator(f'input[data-multiselect-path="{path}"]:checked').count() == 1)
                    box(page, path, 'rain').check()
                    check('Choosing a positive channel clears the exclusive uncertainty choice', answer(page, path) == ['rain'])
                    box(page, path, 'rain').uncheck()
                    check('Unticking the last passage selection restores unanswered null, never an empty set', answer(page, path) is None and page.locator('#nextQuestion').is_disabled())
                    box(page, path, 'air').check()
                    box(page, path, 'rain').check()
                    expected_passage[path] = ['rain', 'air']
                    check('Selections save in deterministic option order, not click order', answer(page, path) == expected_passage[path])
                else:
                    expected_passage[path] = ['sunlight', 'visible_light']
                check(f'Scenario {index + 1} cannot overwrite another scenario', all(answer(page, p) == v for p, v in expected_passage.items()))
                if index < 3:
                    page.locator('#nextQuestion').click()
                    image_ready(page)
            check('Passage selections are saved under checks and never rewrite raw pathway answers', snap(page)['doc']['episodes'][0]['answers'] == initial_answers)

            for index, marker in enumerate(indoor):
                path = to_visibility_point(page, marker['id'])
                controls = page.locator(f'input[data-multiselect-path="{path}"]')
                check(f'{marker["id"]} visibility offers exactly images 7–12, None and Not sure', set(controls.evaluate_all('xs=>xs.map(x=>x.value)')) == {'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 'none', ND})
                check(f'{marker["id"]} surface is shown at its indoor anchor before selection', snap(page)['frame'] == int(marker['anchor_frame'][1:]) - 1 and answer(page, path) is None)
                if index == 0:
                    before = human_state(page)
                    page.locator('[data-preview-frame="f07"]').click()
                    image_ready(page)
                    check('Image 7 preview switches the photo without assigning visibility', snap(page)['frame'] == 6 and human_state(page) == before)
                    page.locator('#showTarget').click()
                    image_ready(page)
                    check('Show point returns from exterior preview to the original indoor anchor', snap(page)['frame'] == int(marker['anchor_frame'][1:]) - 1 and human_state(page) == before)
                    box(page, path, 'f12').check()
                    box(page, path, 'f07').check()
                    check('Multiple exterior views save as an ordered frame-ID set', answer(page, path) == ['f07', 'f12'])
                    box(page, path, 'none').check()
                    check('Visibility None is explicit and excludes individual images', answer(page, path) == ['none'])
                    box(page, path, ND).check()
                    check('Visibility Not sure is distinct from None', answer(page, path) == [ND])
                    box(page, path, ND).uncheck()
                    check('Clearing visibility returns unanswered null', answer(page, path) is None and page.locator('#nextQuestion').is_disabled())
                    box(page, path, 'f07').check()
                    box(page, path, 'f12').check()
                    expected_visibility[path] = ['f07', 'f12']
                elif index == 1:
                    box(page, path, 'none').check()
                    expected_visibility[path] = ['none']
                elif index == 2:
                    box(page, path, ND).check()
                    expected_visibility[path] = [ND]
                else:
                    box(page, path, 'f09').check()
                    expected_visibility[path] = ['f09']
                check(f'{marker["id"]} edits preserve every other surface answer', all(answer(page, p) == v for p, v in expected_visibility.items()))
            check('Visibility collection does not infer per-frame Level 3 labels', snap(page)['doc']['episodes'][0]['answers'] == initial_answers)
            check('Desktop checkbox layout has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            page.screenshot(path=str(output / 'checks-desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            check('Mobile checkbox layout has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            check('Mobile visibility controls and image preview remain usable', page.locator('input[data-multiselect-path]').count() == 8 and page.locator('[data-preview-frame="f12"]').is_visible())
            page.screenshot(path=str(output / 'checks-mobile.png'), full_page=True)

            doc = download(page, temporary / 'collection-checks.json')
            expected = {**expected_passage, **expected_visibility}
            check('Export preserves all opening and visibility sets exactly', all(at_path(doc['episodes'][0], p) == v for p, v in expected.items()) and valid(page, doc) == [])
            subprocess.run([PYTHON, 'scripts/validate_export.py', str(temporary / 'collection-checks.json')], cwd=SITE, check=True, capture_output=True, text=True)
            check('Offline validation accepts the browser collection export')
            restore(page, doc, temporary / 'restore.json')
            check('JSON restore preserves set-valued checks and all older human answers', all(answer(page, p) == v for p, v in expected.items()) and snap(page)['doc']['episodes'][0]['answers'] == initial_answers)
            page.reload()
            page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')
            page.locator('#identityInput').fill('collection-checks-rater-a')
            page.locator('#startButton').click()
            image_ready(page)
            check('Browser reload preserves independent point/scenario set selections', all(answer(page, p) == v for p, v in expected.items()))

            # A new annotator ID has a different storage namespace; a separate
            # browser profile has no copy even when the typed ID is identical.
            second = start(ctx, identity='collection-checks-rater-b')
            check('Another annotator ID starts with blank checks in the same browser', all(at_path(snap(second)['doc']['episodes'][0], p) is None for p in expected) and snap(second)['storageKey'] != snap(page)['storageKey'])
            separate = context(browser)
            isolated = start(separate, identity='collection-checks-rater-a')
            check('Separate browser profiles do not share drafts even under the same typed ID', all(at_path(snap(isolated)['doc']['episodes'][0], p) is None for p in expected))
            before_foreign = human_state(second)
            foreign_file = temporary / 'foreign-rater.json'
            foreign_file.write_text(json.dumps(doc))
            second.locator('#importFile').set_input_files(foreign_file)
            second.locator('#messageDialog').wait_for(state='visible')
            check('Import refuses another annotator and cannot merge their responses', 'another annotator' in second.locator('#messageTitle').inner_text().lower() and human_state(second) == before_foreign)
            second.locator('#closeMessage').click()
            controls_text = page.locator('button,a,input[type="button"]').all_inner_texts()
            check('Annotator interface has no resolve-disagreement or adjudication control', not any('resolve disagreement' in x.lower() or 'adjudicat' in x.lower() for x in controls_text))
            page.locator('#moreButton').click()
            page.locator('#changeName').click()
            welcome_text = page.locator('#welcome').inner_text().lower()
            check('Welcome explains separate browser profiles rather than claiming password isolation', 'browser profile' in welcome_text and ('not' in welcome_text or 'no password' in welcome_text))
            page.locator('#identityInput').fill('collection-checks-rater-a')
            page.locator('#startButton').click()
            image_ready(page)

            # Historical completed exports retain their raw pathway judgments.
            # New sets are never reverse-engineered from those old responses.
            legacy = copy.deepcopy(doc)
            legacy.pop('collection_checks_version')
            for record in legacy['episodes']:
                record['checks'].pop('opening_passage')
                record['checks'].pop('indoor_visibility')
            legacy.pop('automatic_surface_labels', None)
            legacy.pop('surface_label_audit', None)
            legacy = page.evaluate('''async d=>{
              const data=L2Collection.getDataset(),cat=await fetch("catalogue.json").then(r=>r.json());
              for(const q of L2Full.questions(d,0,data,cat))L2Full.set(d.episodes[0],q.path,L2Core.ND);
              d.episodes[0].answers.notes="SYNTHETIC legacy completion only";
              d.episodes[0].status="complete";d.episodes[0].completed_at=new Date().toISOString();
              d.annotation_status="complete";return d;
            }''', legacy)
            check('Historical completed draft remains valid before additive upgrade', valid(page, legacy, True) == [])
            restore(page, legacy, temporary / 'historical.json')
            upgraded = snap(page)['doc']
            check('Upgrade preserves every historical raw human answer including pathway judgments', all(a['answers'] == b['answers'] for a, b in zip(upgraded['episodes'], legacy['episodes'])))
            check('Upgrade adds blank checks instead of converting historical answers to new GT', upgraded.get('collection_checks_version') == 1 and all(at_path(upgraded['episodes'][0], p) is None for p in expected))
            check('New required checks reopen completed scenes and collection status', upgraded['episodes'][0]['status'] == 'in_progress' and upgraded['episodes'][0]['completed_at'] is None and upgraded['annotation_status'] == 'draft')
            check('Additive upgrade retains source provenance', len(upgraded['migration_log']) > len(legacy['migration_log']) and any('source_sha256' in row for row in upgraded['migration_log']))
            old_storage_key = snap(page)['storageKey']
            old_envelope = json.dumps({'schema': 'blockmind_l2_full_local_v1', 'revision': 7,
                                      'owner': 'SYNTHETIC old browser session', 'data': legacy})
            resumed_context = context(browser)
            resumed_context.add_init_script('localStorage.setItem(' + json.dumps(old_storage_key) + ',' + json.dumps(old_envelope) + ');')
            resumed = start(resumed_context)
            check('Local completed drafts also upgrade without losing historical answers', snap(resumed)['doc'].get('collection_checks_version') == 1 and all(a['answers'] == b['answers'] for a, b in zip(snap(resumed)['doc']['episodes'], legacy['episodes'])))
            backups = resumed.evaluate('Object.keys(localStorage).filter(k=>k.includes(":before-collection-checks-v1:")).map(k=>localStorage.getItem(k))')
            check('Browser upgrade archives the exact previous local-storage envelope', old_envelope in backups)
            resumed_context.close()
            invalid = copy.deepcopy(upgraded)
            invalid['episodes'][0]['checks']['indoor_visibility'][indoor[0]['id']] = ['f06']
            check('Invalid pre-crossing selections are rejected by export validation', bool(valid(page, invalid)))
            invalid['episodes'][0]['checks']['indoor_visibility'][indoor[0]['id']] = []
            check('Empty visibility arrays cannot masquerade as completed answers', bool(valid(page, invalid)))
            agreement = page.evaluate('''async()=>{
              const data=L2Collection.getDataset(),cat=await fetch("catalogue.json").then(r=>r.json()),s=L2Collection.getSnapshot();
              const a=L2Full.create(data,cat,s.doc.tasks,"SYNTHETIC CONSENSUS A");
              for(const q of L2Full.questions(a,0,data,cat))L2Full.set(a.episodes[0],q.path,q.kind==="multiselect"?[L2Core.ND]:L2Core.ND);
              a.episodes[0].answers.notes="SYNTHETIC consensus fixture, not real votes";
              a.episodes[0].status="complete";a.episodes[0].completed_at=new Date().toISOString();a.annotation_status="complete";
              const marker=a.tasks.layout.episodes[0].markers.find(m=>m.side==="indoor").id;
              a.episodes[0].checks.indoor_visibility[marker]=["f07"];
              a.episodes[0].checks.opening_passage.d1.open=["sunlight","visible_light"];
              const b=L2Core.clone(a);b.annotator="SYNTHETIC CONSENSUS B";
              b.episodes[0].checks.indoor_visibility[marker]=["f08"];
              const c=L2Full.consensus(a,b,data,cat).episodes[0];
              return {visibility:c.fields["checks.indoor_visibility."+marker],passage:c.fields["checks.opening_passage.d1.open"]};
            }''')
            check('Disputed indoor visibility is dropped, not resolved or assigned either rater answer', agreement['visibility']['state'] == 'disagreement' and agreement['visibility']['value'] is None and agreement['visibility']['eligible_known_gt'] is False and agreement['visibility']['drop_known_gt'] is True)
            check('Even agreed opening checkbox votes are consistency evidence, never known GT', agreement['passage']['state'] == 'agreed' and agreement['passage']['consistency_only'] is True and agreement['passage']['eligible_known_gt'] is False and agreement['passage']['drop_known_gt'] is True)

            subcontext = context(browser, mobile=True)
            subpage = start(subcontext, identity='collection-subdirectory', path='project/' + entry)
            section(subpage, 'pathways')
            subpath = passage_qs[0]['path']
            box(subpage, subpath, 'air').check()
            check('Passage checks save under a GitHub Pages project subdirectory', answer(subpage, subpath) == ['air'])
            to_visibility_point(subpage, indoor[0]['id'])
            subpage.locator('[data-preview-frame="f12"]').click()
            image_ready(subpage)
            check('Indoor visibility previews load correctly under the project subdirectory', snap(subpage)['frame'] == 11 and bool(subpage.locator('#sceneImage').get_attribute('src')))
            check('No JavaScript exceptions', not errors)
            check('No external requests', not external)
            check('No failed asset requests', not failed)
            check('Dataset, catalogue and task bytes remain unchanged', originals == {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest() for name in originals})
            browser.close()
            passed = True
    finally:
        server.shutdown()
        server.server_close()
        (output / 'collection_checks_browser_report.json').write_text(json.dumps({
            'passed': passed, 'checks': checks, 'check_count': len(checks), 'entry': entry,
            'javascript_errors': errors, 'failed_requests': failed, 'external_requests': external,
            'synthetic_test_answers_only': True,
            'coverage': 'Four consistency-only passage sets; per-indoor-point exterior visibility sets; exclusive uncertainty; export, legacy upgrade, draft separation, mobile and subdirectory behavior.',
        }, indent=2) + '\n')
    return len(checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} collection checks passed')
