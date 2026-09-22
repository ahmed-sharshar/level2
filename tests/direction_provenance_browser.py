#!/usr/bin/env python3
"""Disposable browser checks for direction revisions and measured active time.

All entered labels, IDs, clocks and published revisions below are synthetic.
The real task package and human annotation files are never changed.
"""
import functools
import hashlib
import http.server
import json
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from collection_release_browser import NODE, Quiet, SITE


def fixtures():
    script = """
    const C=require('./core.js'),F=require('./full-core.js'),D=require('./dataset.json'),K=require('./catalogue.json');
    const original=C.clone(require('./collection-tasks.json'));
    const revised=C.clone(original);revised.layout.episodes[0].directions[0].text+=' SYNTHETIC REVISION: test a new direction definition.';
    revised.layout.layout_id=C.layoutId(revised.layout);revised.task_id=F.taskId(revised);
    for(const task of [original,revised])if(F.validateTasks(task,D,K).length)throw Error('Invalid synthetic fixture');
    process.stdout.write(JSON.stringify({original,revised}));
    """
    return json.loads(subprocess.check_output([NODE, '-e', script], cwd=SITE, text=True))


def run():
    checks, errors = [], []
    fixture = fixtures()
    hashes = {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest()
              for name in ('dataset.json', 'catalogue.json', 'collection-tasks.json')}
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'

    def check(name, ok):
        assert ok, name
        checks.append(name)
        print('PASS ' + name, flush=True)

    def snapshot(page):
        return page.evaluate('L2Collection.getSnapshot()')

    def visit(context, clock=True):
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        if clock:
            page.clock.install(time=datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc))
            page.clock.pause_at(datetime(2026, 9, 22, 12, 0, 1, tzinfo=timezone.utc))
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

    def elapsed(page, index=0):
        return snapshot(page)['doc']['episodes'][index]['time_tracking']['active_ms']

    def status(page, path):
        return page.evaluate('(path)=>{const d=L2Collection.getSnapshot().doc;return L2Full.answerStatus(d,0,path).state}', path)

    try:
        with tempfile.TemporaryDirectory(prefix='blockmind-direction-browser-') as temporary, sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(accept_downloads=True)
            published = {'task': fixture['original']}
            context.route('**/collection-tasks.json', lambda route: route.fulfill(json=published['task']))
            page = visit(context)
            start(page, 'SYNTHETIC-DIRECTION-A')
            page.locator('#sections [data-section="exposure"]').click()
            selects = page.locator('select[data-field]')
            sun = selects.nth(0).get_attribute('data-field')
            rain = selects.nth(1).get_attribute('data-field')
            selects.nth(0).select_option('yes')
            selects.nth(1).select_option('no')
            provenance = snapshot(page)['doc']['episodes'][0]['answer_provenance']
            check('Sun and rain each receive an independent saved direction provenance entry', sun in provenance and rain in provenance and status(page, sun) == 'current' and status(page, rain) == 'current')
            page.locator('#sections [data-section="pathways"]').click()
            passage = page.locator('input[data-multiselect-path]').first.get_attribute('data-multiselect-path')
            page.locator('input[data-multiselect-path][value="sunlight"]').check()
            check('Through-opening multiselect gets its own direction provenance', passage in snapshot(page)['doc']['episodes'][0]['answer_provenance'] and status(page, passage) == 'current')
            check('Exact published direction words remain embedded in the versioned export', fixture['original']['layout']['episodes'][0]['directions'][0]['text'] in json.dumps(snapshot(page)['doc']))

            page.clock.run_for(12000)
            page.locator('#sections [data-section="scene"]').click()
            before = elapsed(page)
            check('Focused scene time is counted and persisted', 11900 <= before <= 12100)
            page.locator('#sceneSelect').select_option('1')
            page.clock.run_for(7000)
            page.locator('#sections [data-section="boundary"]').click()
            check('Navigation assigns subsequent time only to the new scene', elapsed(page) == before and 6900 <= elapsed(page, 1) <= 7100)
            page.locator('#sceneSelect').select_option('0')
            page.clock.run_for(90000)
            idle_total = elapsed(page)
            check('Idle time is capped at 60 seconds after the last interaction', 59900 <= idle_total-before <= 60100)
            page.clock.run_for(90000)
            check('An unattended page does not keep accumulating time', elapsed(page) == idle_total)
            page.locator('#sections [data-section="scene"]').click()
            page.clock.run_for(5000)
            page.evaluate('window.dispatchEvent(new Event("blur"))')
            blur_total = elapsed(page)
            page.clock.run_for(30000)
            check('Blur pauses active time until focus returns', elapsed(page) == blur_total)
            page.evaluate('window.dispatchEvent(new Event("focus"))')
            page.clock.run_for(4000)
            page.locator('#sections [data-section="boundary"]').click()
            check('Focus resumes with no hidden or offline time reconstruction', elapsed(page)-blur_total == 4000)
            before_switch = elapsed(page)
            switch(page, 'SYNTHETIC-DIRECTION-B')
            check('Another annotator ID has blank answers and a separate zero timer', elapsed(page) == 0 and snapshot(page)['doc']['episodes'][0]['answers']['surfaces'][sun.split('.')[2]]['reachable']['d1']['open']['sun'] is None)
            page.clock.run_for(11000)
            page.locator('#sections [data-section="scene"]').click()
            check('Second annotator has only their own measured time', 10900 <= elapsed(page) <= 11100)
            switch(page, 'SYNTHETIC-DIRECTION-A')
            check('Returning ID restores its time and original answers without copying the other ID', elapsed(page) == before_switch and status(page, sun) == 'current')

            # Returning after a reload must not count time at the welcome page.
            page.reload()
            page.locator('#welcome').wait_for(state='visible')
            page.clock.run_for(120000)
            start(page, 'SYNTHETIC-DIRECTION-A')
            check('Reload and time away from the signed-in draft add no offline duration', elapsed(page) == before_switch)

            with page.expect_download() as info:
                page.locator('#downloadButton').click()
            export_path = Path(temporary) / 'synthetic-annotator.json'
            info.value.save_as(export_path)
            exported = json.loads(export_path.read_text())
            check('JSON exports per-scene active milliseconds and direction provenance', exported['episodes'][0]['time_tracking']['active_ms'] >= before_switch and sun in exported['episodes'][0]['answer_provenance'] and exported['episodes'][0]['time_tracking']['prior_time_unavailable'] is False)

            # Complete a synthetic scene so the revision test proves a formerly
            # finished scene reopens, rather than only checking an empty draft.
            complete = page.evaluate('''async()=>{
              const d=L2Collection.getSnapshot().doc,D=L2Collection.getDataset(),K=await fetch('catalogue.json').then(r=>r.json());
              for(const q of L2Full.questions(d,0,D,K))if(L2Full.get(d.episodes[0],q.path)===null)L2Full.setAnswer(d,0,q.path,q.kind==='multiselect'?[L2Core.ND]:L2Core.ND);
              d.episodes[0].answers.notes='SYNTHETIC TEST ONLY: uncertainty explicitly recorded.';d.episodes[0].status='complete';d.episodes[0].completed_at=new Date().toISOString();
              if(d.automatic_surface_labels)d.surface_label_audit=L2Redpoints.buildSurfaceLabelAudit(d,D,K);
              const errors=L2Full.validate(d,D,K);if(errors.length)throw Error(errors.slice(0,4).join('; '));return d;
            }''')
            page.locator('#importFile').set_input_files({'name': 'synthetic-completed-scene.json', 'mimeType': 'application/json', 'buffer': json.dumps(complete).encode()})
            page.locator('#migrationDialog').wait_for(state='visible')
            page.locator('#confirmMigration').click()
            page.locator('#migrationDialog').wait_for(state='hidden')
            check('Synthetic source scene is genuinely complete before task revision', snapshot(page)['doc']['episodes'][0]['status'] == 'complete')
            completed_time = elapsed(page)
            page.clock.run_for(10000)
            check('Completed scenes do not accumulate annotation time', elapsed(page) == completed_time)
            old_key = snapshot(page)['storageKey']
            published['task'] = fixture['revised']
            page.evaluate('window.dispatchEvent(new Event("focus"))')
            page.locator('#taskUpdateBanner').wait_for(state='visible')
            check('A task update pauses the live tab without relabeling answers', snapshot(page)['taskUpdate'] == fixture['revised']['task_id'] and snapshot(page)['doc']['task_id'] == fixture['original']['task_id'])
            page.locator('#sections [data-section="exposure"]').click()
            check('Old live task controls are locked until reload and migration', page.locator('select[data-field]:disabled').count() == 16)
            page.locator('#reloadTasks').click()
            page.locator('#welcome').wait_for(state='visible')
            start(page, 'SYNTHETIC-DIRECTION-A')
            page.locator('#migrationDialog').wait_for(state='visible')
            page.locator('#confirmMigration').click()
            page.locator('#migrationDialog').wait_for(state='hidden')
            check('Migration preserves old stored task draft and elapsed time', page.evaluate('key=>!!localStorage.getItem(key)', old_key) and elapsed(page) >= before_switch)
            check('Direction revision reopens a previously complete scene', snapshot(page)['doc']['episodes'][0]['status'] == 'in_progress' and snapshot(page)['doc']['episodes'][0]['completed_at'] is None)
            check('Changed direction marks both channels and the passage answer as needing redoing', all(status(page, path) == 'needs_reanswer' for path in (sun, rain, passage)))
            check('Unchanged direction 2 remains valid and is not needlessly discarded', status(page, sun.replace('.d1.', '.d2.')) == 'current')
            page.locator('#sections [data-section="exposure"]').click()
            check('Stale sun and rain controls appear blank with explicit redo notices', page.locator(f'select[data-field="{sun}"]').input_value() == '' and page.locator(f'select[data-field="{rain}"]').input_value() == '' and page.locator('[data-needs-redo]').count() == 16)
            page.locator(f'select[data-field="{sun}"]').select_option('no')
            check('Reanswer stamps the new version and archives the old response', status(page, sun) == 'current' and len(snapshot(page)['doc']['episodes'][0]['answer_provenance'][sun]['history']) >= 1 and status(page, rain) == 'needs_reanswer')
            page.locator('#sections [data-section="pathways"]').click()
            check('Stale passage selections are not silently carried into a fresh choice', page.locator('input[data-multiselect-path]:checked').count() == 0 and page.locator('[data-needs-redo]').count() == 1)
            page.locator('input[data-multiselect-path][value="rain"]').check()
            check('Fresh passage choice replaces rather than appends to the old choice', snapshot(page)['doc']['episodes'][0]['checks']['opening_passage']['d1']['open'] == ['rain'] and status(page, passage) == 'current')
            page.locator('#sections [data-section="review"]').click()
            check('A scene with answers needing redo cannot be finished', page.locator('#completeScene').is_disabled() and 'need redoing' in page.locator('#questionPanel').inner_text())
            invalid = json.loads(json.dumps(fixture['revised']))
            invalid['layout']['episodes'][0]['directions'][1]['text'] += ' SYNTHETIC invalid unversioned edit.'
            published['task'] = invalid
            page.evaluate('window.dispatchEvent(new Event("focus"))')
            page.locator('#taskUpdateBanner').wait_for(state='visible')
            check('A changed file with an unchanged claimed ID cannot bypass the update guard', snapshot(page)['taskUpdate'] == 'invalid-published-task' and 'could not be verified' in page.locator('#taskUpdateBanner').inner_text())

            # Legacy drafts are backed up byte-for-byte before adding metadata.
            legacy_context = browser.new_context()
            legacy_page = visit(legacy_context)
            seeded = legacy_page.evaluate('''async()=>{
              const D=L2Collection.getDataset(),K=await fetch('catalogue.json').then(r=>r.json()),T=await fetch('collection-tasks.json').then(r=>r.json());
              const d=L2Full.create(D,K,T,'SYNTHETIC-LEGACY');delete d.answer_provenance_version;
              for(const ep of d.episodes){delete ep.answer_provenance;delete ep.direction_versions;delete ep.time_tracking;}
              const m=T.layout.episodes[0].markers[0].id;d.episodes[0].answers.surfaces[m].reachable.d1.open.sun='yes';
              const key='blockmind-l2-full:'+encodeURIComponent(new URL('.',location.href).pathname)+':'+D.build_id+':'+T.task_id+':'+encodeURIComponent(d.annotator);
              const raw=JSON.stringify({schema:'blockmind_l2_full_local_v1',revision:1,owner:'synthetic-legacy',data:d});localStorage.setItem(key,raw);return {key,raw};
            }''')
            start(legacy_page, 'SYNTHETIC-LEGACY')
            check('Legacy upgrade backs up the exact old browser envelope', legacy_page.evaluate('arg=>Object.keys(localStorage).some(key=>key.startsWith(arg.key+":before-direction-provenance-v1:")&&localStorage.getItem(key)===arg.raw)', seeded))
            check('Unknown historical duration is explicitly unavailable, not guessed', snapshot(legacy_page)['doc']['episodes'][0]['time_tracking']['prior_time_unavailable'] is True)
            check('Legacy answers gain honestly inferred rather than fabricated observation timestamps', all(item['origin'] == 'inferred_from_embedded_task' and item['recorded_at'] is None for item in snapshot(legacy_page)['doc']['episodes'][0]['answer_provenance'].values()))

            conflict_context = browser.new_context()
            first = visit(conflict_context)
            start(first, 'SYNTHETIC-CONFLICT')
            first.clock.run_for(10000)
            initial_time = elapsed(first)
            # Playwright's mocked clock is shared by pages in one context.
            # Do not install/reset it again when opening the competing tab.
            second = visit(conflict_context, clock=False)
            start(second, 'SYNTHETIC-CONFLICT')
            first.wait_for_function('L2Collection.getSnapshot().conflict')
            locked_time, latest_time = elapsed(first), elapsed(second)
            first.clock.run_for(30000)
            check('A conflicting tab cannot continue adding elapsed time', elapsed(first) == locked_time)
            second.clock.run_for(5000)
            second.locator('#sections [data-section="scene"]').click()
            check('The latest tab retains one shared timer without double-counting the conflict', elapsed(second) == latest_time+35000 and latest_time >= initial_time)

            # IDs share localStorage in this design. Ensure two full collections
            # fit, rather than testing only tiny single-scene demonstration docs.
            storage_context = browser.new_context()
            storage_page = visit(storage_context, clock=False)
            size_result = storage_page.evaluate('''async()=>{
              const D=L2Collection.getDataset(),K=await fetch('catalogue.json').then(r=>r.json()),T=await fetch('collection-tasks.json').then(r=>r.json());
              const labels=await L2InstanceLabels.collect(T,D,K);
              const sizes=[];
              for(const id of ['SYNTHETIC-FULL-A','SYNTHETIC-FULL-B']){
                const d=L2Full.create(D,K,T,id);
                for(let i=0;i<d.episodes.length;i++){for(const q of L2Full.questions(d,i,D,K))L2Full.setAnswer(d,i,q.path,q.kind==='multiselect'?[L2Core.ND]:L2Core.ND);d.episodes[i].answers.notes='SYNTHETIC TEST ONLY: explicit uncertainty.';}
                d.automatic_surface_labels=labels;d.surface_label_audit=L2Redpoints.buildSurfaceLabelAudit(d,D,K);
                const errors=L2Full.validate(d,D,K);if(errors.length)throw Error(errors.slice(0,4).join('; '));
                const key='blockmind-l2-full:'+encodeURIComponent(new URL('.',location.href).pathname)+':'+D.build_id+':'+T.task_id+':'+id;
                const raw=JSON.stringify({schema:'blockmind_l2_full_local_v1',revision:1,owner:'synthetic-capacity',data:d});localStorage.setItem(key,raw);sizes.push(raw.length);
              }
              return {sizes,count:Object.keys(localStorage).length};
            }''')
            check('Two fully answered 56-scene IDs including automatic label audits fit in actual browser draft storage', size_result['count'] == 2 and all(size > 0 for size in size_result['sizes']))
            print('STORAGE ' + json.dumps(size_result), flush=True)
            start(storage_page, 'SYNTHETIC-FULL-A')
            storage_page.locator('[data-value="yes"]').click()
            switch(storage_page, 'SYNTHETIC-FULL-B')
            storage_page.locator('[data-value="no"]').click()
            switch(storage_page, 'SYNTHETIC-FULL-A')
            check('Both full-size ID drafts survive actual subsequent edits and saves', snapshot(storage_page)['doc']['episodes'][0]['answers']['scene']['crossing_valid'] == 'yes' and storage_page.locator('#storageWarning').is_hidden() and storage_page.evaluate('()=>Object.keys(localStorage).some(key=>key.endsWith(":SYNTHETIC-FULL-B")&&JSON.parse(localStorage.getItem(key)).data.episodes[0].answers.scene.crossing_valid==="no")'))

            quota_context = browser.new_context()
            quota_page = visit(quota_context, clock=False)
            quota_page.evaluate('arg=>{localStorage.setItem(arg.key,arg.raw);let i=0;try{for(;i<100;i++)localStorage.setItem("synthetic-quota-"+i,"x".repeat(100000));}catch(_){return i;}}', seeded)
            quota_page.locator('#identityInput').fill('SYNTHETIC-LEGACY')
            quota_page.locator('#startButton').click()
            quota_page.locator('#messageDialog').wait_for(state='visible')
            check('When storage cannot hold an upgrade backup, the original is preserved and download is requested', 'Download your existing draft first' in quota_page.locator('#messageTitle').inner_text() and quota_page.evaluate('arg=>localStorage.getItem(arg.key)===arg.raw', seeded) and snapshot(quota_page)['doc'] is None)
            check('No browser JavaScript exceptions', not errors)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    check('Real dataset, catalogue and task file unchanged by tests', hashes == {name: hashlib.sha256((SITE / name).read_bytes()).hexdigest() for name in hashes})
    print(json.dumps({'status': 'passed', 'checks': len(checks), 'synthetic_only': True}))


if __name__ == '__main__':
    run()
