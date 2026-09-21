#!/usr/bin/env python3
"""Disposable browser checks for ID-scoped drafts and provisional collection.

Uses intercepted synthetic task packages. No real tasks, human responses or
previous validation reports are changed; downloads use a temporary directory.
"""
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


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        try:
            return super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            pass


def fixtures():
    script = """
    const C=require('./core.js'),F=require('./full-core.js'),D=require('./dataset.json'),K=require('./catalogue.json');
    const t=F.createTasks(D,K,'SYNTHETIC RELEASE TEST ONLY');
    t.settings.collection_mode='provisional';t.settings.points_per_side=4;
    for(const [i,e] of t.layout.episodes.entries()){
      if(i){e.disposition='exclude';e.exclusion_reason='SYNTHETIC TEST ONLY';continue;}
      e.setup_reviewed=false;
      e.directions=[{id:'d1',text:'SYNTHETIC: sun and rain entering from the visible opening.',reference_frame:'f01',x:.4,y:.5},
                    {id:'d2',text:'SYNTHETIC: sun and rain coming sideways from beside the railing.',reference_frame:'f07',x:.5,y:.3}];
    }
    t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);
    const strict=C.clone(t);delete strict.settings.collection_mode;strict.task_id=F.taskId(strict);
    for(const task of [t,strict]){const errors=F.validateTasks(task,D,K);if(errors.length)throw Error(errors.join('; '));}
    process.stdout.write(JSON.stringify({provisional:t,strict}));
    """
    return json.loads(subprocess.check_output([NODE, '-e', script], cwd=SITE, text=True))


def run():
    checks, errors, failed = [], [], []
    fixture = fixtures()
    original_hashes = {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest()
                       for name in ('dataset.json', 'catalogue.json', 'collection-tasks.json')}
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print('PASS ' + name, flush=True)

    def snapshot(page):
        return page.evaluate('L2Collection.getSnapshot()')

    def prepare(context):
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append((response.status, response.url)) if response.status >= 400 else None)
        page.on('dialog', lambda dialog: dialog.accept())
        page.goto(origin)
        page.wait_for_function('window.L2Collection && !document.querySelector("#welcome").classList.contains("hidden")')
        return page

    def start(page, identity):
        page.locator('#identityInput').fill(identity)
        page.locator('#startButton').click()
        page.wait_for_function('L2Collection.getSnapshot().doc && L2Collection.getSnapshot().imageReady')

    def switch(page, identity):
        page.locator('#moreButton').click()
        page.locator('#changeName').click()
        page.locator('#welcome').wait_for(state='visible')
        start(page, identity)

    def restore(page, doc):
        page.locator('#importFile').set_input_files({'name': 'synthetic-release.json', 'mimeType': 'application/json', 'buffer': json.dumps(doc).encode()})
        page.wait_for_function('document.querySelector("#migrationDialog").open || document.querySelector("#messageDialog").open')
        assert not page.locator('#messageDialog').is_visible(), page.locator('#messageText').inner_text()
        page.locator('#migrationDialog').wait_for(state='visible')
        page.locator('#confirmMigration').click()
        page.locator('#migrationDialog').wait_for(state='hidden')

    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-collection-release-') as temporary, sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(accept_downloads=True)
            context.route('**/collection-tasks.json', lambda route: route.fulfill(json=fixture['provisional']))
            page = prepare(context)
            welcome = page.locator('#welcome').inner_text().lower()
            check('Welcome uses unique IDs without requiring separate profiles', 'unique annotator id' in welcome and 'separate browser profile' not in welcome and 'not passwords' in welcome)
            start(page, 'SYNTHETIC-ID-A')
            check('Provisional collection is explicit and not described as GT', 'provisional directions' in page.locator('#setupNotice').inner_text().lower() and 'not benchmark ground truth' in page.locator('#setupNotice').inner_text().lower())
            page.locator('[data-value="yes"]').click()
            source = snapshot(page)['doc']
            key_a = snapshot(page)['storageKey']
            switch(page, 'SYNTHETIC-ID-B')
            check('Changing ID starts a separate blank draft', snapshot(page)['doc']['episodes'][0]['answers']['scene']['crossing_valid'] is None and snapshot(page)['storageKey'] != key_a)
            page.locator('[data-value="no"]').click()
            page.locator('#importFile').set_input_files({'name': 'foreign-test.json', 'mimeType': 'application/json', 'buffer': json.dumps(source).encode()})
            page.locator('#messageDialog').wait_for(state='visible')
            check('Other IDs cannot import or merge another annotator responses', 'another annotator' in page.locator('#messageTitle').inner_text().lower() and snapshot(page)['doc']['episodes'][0]['answers']['scene']['crossing_valid'] == 'no')
            page.locator('#closeMessage').click()
            switch(page, 'SYNTHETIC-ID-A')
            check('Returning to the previous ID restores its answers', snapshot(page)['storageKey'] == key_a and snapshot(page)['doc']['episodes'][0]['answers']['scene']['crossing_valid'] == 'yes')
            page.locator('#sections [data-section="exposure"]').click()
            check('All eight points have separate enabled sun and rain answers', page.locator('select[data-field]').count() == 16 and page.locator('select[data-field]:disabled').count() == 0)
            page.locator('#sections [data-section="pathways"]').click()
            check('Provisional through-opening consistency checklist is enabled', page.locator('input[data-multiselect-path]').count() == 6 and page.locator('input[data-multiselect-path]:disabled').count() == 0 and 'consistency check only' in page.locator('#questionPanel').inner_text().lower())

            # Synthetic completion checks the real form and save/export path,
            # including the formerly incorrect dataset argument on note edits.
            complete = page.evaluate('''async()=>{
              const d=L2Collection.getSnapshot().doc,D=L2Collection.getDataset(),K=await fetch('catalogue.json').then(r=>r.json());
              for(const q of L2Full.questions(d,0,D,K))L2Full.set(d.episodes[0],q.path,q.kind==='multiselect'?[L2Core.ND]:L2Core.ND);
              d.episodes[0].answers.notes='';d.episodes[0].status='in_progress';
              delete d.automatic_surface_labels;delete d.surface_label_audit;
              return d;
            }''')
            restore(page, complete)
            page.locator('#sections [data-section="review"]').click()
            check('Uncertainty still needs a note before completion', page.locator('#completeScene').is_disabled())
            page.locator('#reviewNotes').fill('SYNTHETIC TEST ONLY: explicit uncertainty for browser validation.')
            check('Adding the note correctly enables provisional completion', page.locator('#completeScene').is_enabled())
            page.locator('#completeScene').click()
            check('Finished provisional scene remains non-GT with all approvals false', snapshot(page)['doc']['episodes'][0]['status'] == 'complete' and snapshot(page)['doc']['benchmark_ready'] is False and snapshot(page)['doc']['tasks']['settings']['protocol_reviewed'] is False and snapshot(page)['doc']['tasks']['layout']['episodes'][0]['setup_reviewed'] is False)
            page.locator('summary').filter(has_text='Submit the whole collection').click()
            with page.expect_download() as info:
                page.locator('#finalExport').click()
            target = Path(temporary) / 'synthetic-complete.json'
            info.value.save_as(target)
            exported = json.loads(target.read_text())
            check('Completed export retains provisional task definitions and never claims benchmark readiness', exported['annotation_status'] == 'complete' and exported['benchmark_ready'] is False and exported['tasks']['settings']['collection_mode'] == 'provisional')

            strict = browser.new_context()
            strict.route('**/collection-tasks.json', lambda route: route.fulfill(json=fixture['strict']))
            strict_page = prepare(strict)
            start(strict_page, 'SYNTHETIC-STRICT')
            strict_page.locator('#sections [data-section="exposure"]').click()
            check('Historical strict tasks remain gated without approval', strict_page.locator('select[data-field]').count() == 0 and strict_page.locator('.blocked-section').count() == 1)

            migration_page = prepare(context)
            old = migration_page.evaluate('''async tasks=>{
              const D=L2Collection.getDataset(),K=await fetch('catalogue.json').then(r=>r.json());
              const doc=L2Full.create(D,K,tasks,'SYNTHETIC-MIGRATION');doc.episodes[0].answers.scene.crossing_valid='yes';
              doc.episodes[0].answers.surfaces[tasks.layout.episodes[0].markers[0].id].material='SYNTHETIC original human material';
              const key='blockmind-l2-full:'+encodeURIComponent(new URL('.',location.href).pathname)+':'+D.build_id+':'+tasks.task_id+':'+encodeURIComponent(doc.annotator);
              const raw=JSON.stringify({schema:'blockmind_l2_full_local_v1',revision:1,owner:'synthetic-old-task',data:doc});
              localStorage.setItem(key,raw);return {key,raw};
            }''', fixture['strict'])
            start(migration_page, 'SYNTHETIC-MIGRATION')
            migration_page.locator('#migrationDialog').wait_for(state='visible')
            check('Changed task package requires review before old answers are imported', snapshot(migration_page)['doc']['episodes'][0]['answers']['scene']['crossing_valid'] is None)
            migration_page.locator('#cancelMigration').click()
            check('Cancelling migration leaves the original draft untouched', migration_page.evaluate('key=>localStorage.getItem(key)', old['key']) == old['raw'])
            migration_page.locator('#moreButton').click()
            migration_page.locator('#legacyButton').click()
            migration_page.locator('#migrationDialog').wait_for(state='visible')
            migration_page.locator('#confirmMigration').click()
            marker = fixture['provisional']['layout']['episodes'][0]['markers'][0]['id']
            migrated = snapshot(migration_page)['doc']
            check('Confirmed migration preserves unchanged scene facts and point materials', migrated['episodes'][0]['answers']['scene']['crossing_valid'] == 'yes' and migrated['episodes'][0]['answers']['surfaces'][marker]['material'] == 'SYNTHETIC original human material')
            check('Original prior-task browser draft is retained after migration', migration_page.evaluate('key=>localStorage.getItem(key)', old['key']) == old['raw'])
            check('No browser JavaScript errors', not errors)
            check('No failed asset requests', not failed)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    check('Production dataset, catalogue and task JSON are unchanged by tests', original_hashes == {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest() for name in original_hashes})
    print(json.dumps({'status': 'passed', 'checks': len(checks), 'synthetic_only': True}))


if __name__ == '__main__':
    run()
