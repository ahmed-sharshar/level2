#!/usr/bin/env python3
"""Real Chromium integration tests; synthetic answers never enter research data."""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
NODE = shutil.which("node") or "/home/ahmed/miniconda3/envs/scannetpp/lib/python3.10/site-packages/playwright/driver/node"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run(report_dir: Path):
    report_dir.mkdir(parents=True, exist_ok=True)
    results = []
    errors = []
    failed_responses = []
    external = []
    completed = False

    def check(name, condition=True):
        assert condition, name
        results.append(name)
        print(f"PASS {name}", flush=True)

    def snapshot(page):
        return page.evaluate("L2App.getSnapshot()")

    def loaded(page):
        page.wait_for_function("window.L2App && !document.getElementById('welcome').classList.contains('hidden')")

    def image_ready(page):
        page.wait_for_function("document.getElementById('sceneImage').complete && document.getElementById('sceneImage').naturalWidth > 0 && document.getElementById('imageLoading').classList.contains('hidden')")

    def monitor(page):
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("response", lambda response: failed_responses.append([response.status, response.url]) if response.status >= 400 else None)
        page.on("request", lambda request: external.append(request.url) if not request.url.startswith((origin, "blob:", "data:")) else None)
        page.on("dialog", lambda dialog: dialog.accept("SYNTHETIC TEST ONLY: remaining fields cannot be judged by this automated form test.") if dialog.type == "prompt" else dialog.accept())

    def open_rater(context, layout_path, identity="test-rater-01"):
        page = context.new_page()
        monitor(page)
        page.goto(origin + "advanced.html")
        loaded(page)
        page.locator("#identityInput").fill(identity)
        page.locator("#importFile").set_input_files(layout_path)
        page.wait_for_function("L2App.getSnapshot().pending !== null")
        page.locator("#startButton").click()
        page.locator("#workspace").wait_for(state="visible")
        image_ready(page)
        return page

    def download_json(page, selector, target):
        with page.expect_download() as pending:
            page.locator(selector).click()
        pending.value.save_as(target)
        return json.loads(Path(target).read_text())

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(SITE)))
    server.daemon_threads = True
    origin = f"http://127.0.0.1:{server.server_port}/"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="blockmind-l2-test-") as temporary, sync_playwright() as playwright:
            temporary = Path(temporary)
            fixture = json.loads(subprocess.check_output([NODE, str(SITE / "tests/make_browser_fixtures.cjs")], text=True))
            layout_path = temporary / "synthetic-layout.json"
            layout_path.write_text(json.dumps(fixture["layout"]))
            browser = playwright.chromium.launch()
            context = browser.new_context(viewport={"width": 1600, "height": 1100}, accept_downloads=True)
            coordinator = context.new_page()
            monitor(coordinator)
            coordinator.goto(origin + "advanced.html")
            loaded(coordinator)
            coordinator.screenshot(path=str(report_dir / "welcome-desktop.png"), full_page=True)
            check("All 56 episodes are advertised", "56" in coordinator.locator("#datasetStats").inner_text())
            coordinator.locator("#roleSelect").select_option("coordinator")
            coordinator.locator("#identityInput").fill("browser-test-coordinator")
            coordinator.locator("#startButton").click()
            coordinator.locator("#workspace").wait_for(state="visible")
            image_ready(coordinator)
            check("Coordinator loads all 56 episodes", coordinator.locator("[data-episode]").count() == 56)
            check("Shared layout begins unapproved", not any(ep["setup_reviewed"] for ep in snapshot(coordinator)["layout"]["episodes"]))
            coordinator.locator("#finalExport").click()
            coordinator.locator("#messageDialog").wait_for(state="visible")
            check("Unreviewed geometry cannot be frozen", "Finish" in coordinator.locator("#messageTitle").inner_text())
            coordinator.locator("#closeMessage").click()

            # Load every bundled RGB appearance in the browser, not just HTTP HEAD checks.
            decoded = coordinator.evaluate("""async () => {
              const frames=L2App.getDataset().episodes.flatMap(e=>e.frames);let cursor=0;const failures=[];
              async function worker(){while(cursor<frames.length){const f=frames[cursor++];await new Promise(resolve=>{const im=new Image();im.onload=()=>{if(im.naturalWidth!==f.width||im.naturalHeight!==f.height)failures.push(f.image+': dimensions');resolve();};im.onerror=()=>{failures.push(f.image+': failed');resolve();};im.src=f.image;});}}
              await Promise.all(Array.from({length:8},worker));return {count:frames.length,failures};
            }""")
            check("All 672 RGB appearances decode at original dimensions", decoded == {"count": 672, "failures": []})
            for index in range(56):
                coordinator.locator(f'[data-episode="{index}"]').click()
                image_ready(coordinator)
            check("All 56 episodes open in the coordinator interface")
            coordinator.locator('[data-episode="0"]').click()
            for index in range(12):
                coordinator.locator(f'[data-frame="{index}"]').click()
                image_ready(coordinator)
                assert snapshot(coordinator)["frame"] == index
            check("All 12 frame controls preserve ordered playback")
            coordinator.locator('[data-frame="0"]').click()
            image_ready(coordinator)
            initial = len(snapshot(coordinator)["layout"]["episodes"][0]["markers"])
            coordinator.locator('[data-action="add-point"]').click()
            rect = coordinator.locator("#sceneImage").bounding_box()
            coordinator.mouse.click(rect["x"] + rect["width"] * .513, rect["y"] + rect["height"] * .487)
            after = snapshot(coordinator)["layout"]["episodes"][0]["markers"]
            check("Click creates a normalized red point", len(after) == initial + 1 and abs(after[-1]["x"] - .513) < .002 and abs(after[-1]["y"] - .487) < .002)
            coordinator.locator('[data-action="delete-point"]').click()
            check("Point deletion is explicit and scoped", len(snapshot(coordinator)["layout"]["episodes"][0]["markers"]) == initial)
            coordinator.locator('[data-tab="directions"]').click()
            coordinator.locator('[data-direction-text="d1"]').fill("Synthetic source at visible roof edge; test only.")
            coordinator.locator('[data-place-direction="d1"]').click()
            rect = coordinator.locator("#sceneImage").bounding_box()
            coordinator.mouse.click(rect["x"] + rect["width"] * .4, rect["y"] + rect["height"] * .35)
            direction = snapshot(coordinator)["layout"]["episodes"][0]["directions"][0]
            check("Coordinator saves direction text and visible reference", direction["text"].startswith("Synthetic") and abs(direction["x"] - .4) < .002)
            coordinator.locator('[data-tab="boxes"]').click()
            coordinator.locator('[data-action="draw-box"]').click()
            rect = coordinator.locator("#sceneImage").bounding_box()
            for x, y in [(.1, .2), (.6, .75)]:
                coordinator.mouse.click(rect["x"] + rect["width"] * x, rect["y"] + rect["height"] * y)
            boxes = snapshot(coordinator)["layout"]["episodes"][0]["boundary_boxes"]
            check("Boundary rectangle stores normalized corners", any(b["frame_id"] == "f01" and abs(b["x0"] - .1) < .002 and abs(b["y1"] - .75) < .002 for b in boxes))
            coordinator.locator('[data-tab="points"]').click()
            coordinator.screenshot(path=str(report_dir / "coordinator-desktop.png"), full_page=True)
            coordinator_draft = download_json(coordinator, "#draftExport", temporary / "coordinator-draft.json")
            check("Coordinator draft exports without fabricated judgments", coordinator_draft["schema"] == "blockmind_l2_layout_v1" and not coordinator_draft["layout_id"])
            coordinator.locator("#importFile").set_input_files(layout_path)
            coordinator.wait_for_function("L2App.getSnapshot().layout.episodes[0].setup_reviewed === true")
            frozen = download_json(coordinator, "#finalExport", temporary / "synthetic-frozen.json")
            check("Reviewed synthetic layout freezes with the expected content identity", frozen["layout_id"] == fixture["layout"]["layout_id"])

            corrupt_context = browser.new_context(accept_downloads=True)
            corrupt = corrupt_context.new_page()
            monitor(corrupt)
            corrupt.goto(origin + "advanced.html")
            loaded(corrupt)
            corrupt.locator("#roleSelect").select_option("coordinator")
            corrupt.locator("#identityInput").fill("corrupt-test")
            corrupt.locator("#startButton").click()
            corrupt.locator("#workspace").wait_for(state="visible")
            corrupt_key = snapshot(corrupt)["storageKey"]
            corrupt.evaluate("key=>localStorage.setItem(key,'{broken SYNTHETIC draft')", corrupt_key)
            corrupt.reload()
            loaded(corrupt)
            corrupt.locator("#roleSelect").select_option("coordinator")
            corrupt.locator("#identityInput").fill("corrupt-test")
            recovered_raw = download_json(corrupt, "#startButton", temporary / "raw-recovery.json")
            corrupt.locator("#messageDialog").wait_for(state="visible")
            check("Malformed stored draft is preserved and downloadable", recovered_raw["raw"] == "{broken SYNTHETIC draft" and corrupt.evaluate("key=>localStorage.getItem(key)", corrupt_key) == recovered_raw["raw"] and snapshot(corrupt)["layout"] is None)
            corrupt_context.close()

            # Deliberately supply undecodable image bytes. The UI must not place
            # geometry until the exact current frame is loaded and verified.
            slow_context = browser.new_context(viewport={"width": 1600, "height": 1100})
            slow_context.route("**/*.jpg", lambda route: route.fulfill(status=200, content_type="image/jpeg", body=b""))
            slow = slow_context.new_page()
            monitor(slow)
            slow.goto(origin + "advanced.html", wait_until="domcontentloaded")
            loaded(slow)
            slow.locator("#roleSelect").select_option("coordinator")
            slow.locator("#identityInput").fill("loading-test")
            slow.locator("#startButton").click()
            slow.locator("#workspace").wait_for(state="visible")
            count_before = len(snapshot(slow)["layout"]["episodes"][0]["markers"])
            slow.locator('[data-action="add-point"]').click()
            slow.locator("#imageStage").dispatch_event("click", {"clientX": 500, "clientY": 400})
            check("Undecodable frame cannot receive a surface point", not snapshot(slow)["frameReady"] and len(snapshot(slow)["layout"]["episodes"][0]["markers"]) == count_before)
            slow_context.unroute("**/*.jpg")
            slow.reload()
            loaded(slow)
            slow.locator("#roleSelect").select_option("coordinator")
            slow.locator("#identityInput").fill("loading-test")
            slow.locator("#startButton").click()
            slow.locator("#workspace").wait_for(state="visible")
            image_ready(slow)
            check("Point placement unlocks after the exact image loads", snapshot(slow)["frameReady"])
            slow_context.close()

            rater_context = browser.new_context(viewport={"width": 1600, "height": 1100}, accept_downloads=True)
            rater = open_rater(rater_context, layout_path)
            doc = snapshot(rater)["doc"]
            check("Imported geometry never seeds human answers", doc["episodes"][0]["answers"]["scene"]["boundary_class"] is None and doc["episodes"][0]["answers"]["boundary"]["material"] is None)
            check("Shared exclusions remain explicit", sum(ep["status"] == "excluded" for ep in doc["episodes"]) == 55)
            rater.locator("#finalExport").click()
            rater.locator("#messageDialog").wait_for(state="visible")
            check("Incomplete final annotation export is blocked", "not ready" in rater.locator("#messageTitle").inner_text())
            rater.locator("#closeMessage").click()
            rater.locator('[data-answer="scene.crossing_valid"]').select_option("yes")
            rater.locator('[data-answer="scene.boundary_class"]').select_option("outdoor")
            rater.locator('[data-tab="boundary"]').click()
            probe = '<img src=x onerror="window.badInjection=1"> synthetic boundary'
            rater.locator('[data-answer="boundary.material"]').fill(probe)
            rater.locator('[data-tab="scene"]').click()
            rater.locator('[data-tab="boundary"]').click()
            check("Free-text material is rendered safely", rater.locator('[data-answer="boundary.material"]').input_value() == probe and rater.evaluate("window.badInjection === undefined"))
            rater.locator('[data-answer="boundary.material"]').fill("synthetic wood")
            rater.locator('[data-tab="surfaces"]').click()
            surface_id = fixture["layout"]["episodes"][0]["markers"][0]["id"]
            substrate = f"surfaces.{surface_id}.substrate_known"
            rater.locator(f'[data-answer="{substrate}"]').select_option("yes")
            check("Substrate identification fields appear only when claimed known", rater.locator(f'[data-answer="surfaces.{surface_id}.substrate_material"]').is_visible())
            rater.locator(f'[data-answer="surfaces.{surface_id}.substrate_material"]').fill("synthetic concrete")
            rater.locator(f'[data-answer="{substrate}"]').select_option("no")
            check("Unclaimed substrate fields are not mandatory", rater.locator(f'[data-answer="surfaces.{surface_id}.substrate_material"]').count() == 0)
            rater.screenshot(path=str(report_dir / "annotator-surfaces-desktop.png"), full_page=True)
            rater.locator('[data-tab="pathways"]').click()
            check("Both shared directions are displayed", "Synthetic lateral" in rater.locator("#panelContent").inner_text() and "Synthetic downward" in rater.locator("#panelContent").inner_text())
            check("Canonical counterfactual definitions are present", "Shared open / sealed assumptions" in rater.locator("#panelContent").inner_text())
            rater.locator('[data-tab="visibility"]').click()
            check("Visibility includes reflection and glass distinctions", rater.locator('option[value="reflection"]').count() >= 12 and rater.locator('option[value="through_glass"]').count() >= 12)
            rater.locator("#cleanPreview").click()
            rater.locator("#previewDialog").wait_for(state="visible")
            labels = rater.locator("#previewOverlay text").all_text_contents()
            check("Clean RGB preview contains only neutral numeric markers", all(s.isdigit() for s in labels) and "House" not in rater.locator("#previewDialog").inner_text() and rater.locator("#previewOverlay rect").count() == 0)
            rater.locator("#closePreview").click()

            before = snapshot(rater)["doc"]
            invalid = json.loads(json.dumps(fixture["blank"]))
            invalid["build_id"] = "wrong-build"
            invalid_path = temporary / "invalid-build.json"
            invalid_path.write_text(json.dumps(invalid))
            rater.locator("#importFile").set_input_files(invalid_path)
            rater.locator("#messageDialog").wait_for(state="visible")
            check("Foreign-build import is transactional and rejected", snapshot(rater)["doc"] == before)
            rater.locator("#closeMessage").click()
            malformed_path = temporary / "malformed.json"
            malformed_path.write_text('{"schema":')
            rater.locator("#importFile").set_input_files(malformed_path)
            rater.locator("#messageDialog").wait_for(state="visible")
            check("Malformed JSON import does not mutate work", snapshot(rater)["doc"] == before)
            rater.locator("#closeMessage").click()
            foreign_path = temporary / "other-rater.json"
            foreign_path.write_text(json.dumps(fixture["second"]))
            rater.locator("#importFile").set_input_files(foreign_path)
            rater.locator("#messageDialog").wait_for(state="visible")
            check("One rater cannot import another rater's answers", snapshot(rater)["doc"] == before and "another annotator" in rater.locator("#messageBody").inner_text())
            rater.locator("#closeMessage").click()

            draft = download_json(rater, "#draftExport", temporary / "rater-draft.json")
            check("Draft preserves explicit known answers and remaining nulls", draft["episodes"][0]["answers"]["scene"]["crossing_valid"] == "yes" and draft["episodes"][0]["answers"]["scene"]["shelter"] is None)
            rater.reload()
            loaded(rater)
            rater.locator("#identityInput").fill("test-rater-01")
            rater.locator("#startButton").click()
            rater.locator("#workspace").wait_for(state="visible")
            check("Reload resumes the saved draft without relabeling", snapshot(rater)["doc"]["episodes"][0]["answers"] == draft["episodes"][0]["answers"])
            rater.locator('[data-tab="review"]').click()
            rater.locator('[data-action="fill-nd"]').click()
            after = snapshot(rater)["doc"]["episodes"][0]["answers"]
            check("Explicit uncertainty batch preserves existing judgments", after["scene"]["crossing_valid"] == "yes" and after["scene"]["shelter"] == "not_determinable" and "SYNTHETIC TEST ONLY" in after["notes"])
            rater.locator('[data-action="complete"]').click()
            check("Completed episode is locked", snapshot(rater)["doc"]["episodes"][0]["status"] == "complete")
            final = download_json(rater, "#finalExport", temporary / "rater-complete.json")
            validated = subprocess.run([sys.executable, str(SITE / "scripts/validate_export.py"), str(temporary / "rater-complete.json"), "--require-complete"], capture_output=True, text=True)
            check("Real browser final export passes the offline authoritative validator", validated.returncode == 0 and final["annotation_status"] == "complete")
            rater.locator('[data-action="reopen"]').click()
            check("Editing a completed record requires explicit reopening", snapshot(rater)["doc"]["episodes"][0]["status"] == "in_progress")
            second_tab = open_rater(rater_context, layout_path)
            rater.locator("#conflictBanner").wait_for(state="visible")
            check("Concurrent tabs lock the stale writer", snapshot(rater)["conflict"] is True)
            recovery = download_json(rater, "#recoveryExport", temporary / "recovery.json")
            check("Conflicted tab can export its recoverable in-memory version", recovery["annotator"] == "test-rater-01")
            rater.locator("#reloadLatest").click()
            check("Explicit reload resolves a tab conflict", not snapshot(rater)["conflict"])
            second_tab.close()

            mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, device_scale_factor=1)
            mobile = open_rater(mobile_context, layout_path, "mobile-test")
            mobile.screenshot(path=str(report_dir / "annotator-mobile.png"), full_page=True)
            check("Mobile layout has no horizontal document overflow", mobile.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))

            # A GitHub-Pages-style project subdirectory must work unchanged.
            subserver = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(SITE.parent)))
            subserver.daemon_threads = True
            threading.Thread(target=subserver.serve_forever, daemon=True).start()
            try:
                subpage = context.new_page()
                subpage.on("pageerror", lambda err: errors.append(str(err)))
                subpage.goto(f"http://127.0.0.1:{subserver.server_port}/{SITE.name}/advanced.html")
                loaded(subpage)
                subpage.locator("#roleSelect").select_option("coordinator")
                subpage.locator("#identityInput").fill("subpath-test")
                subpage.locator("#startButton").click()
                subpage.locator("#workspace").wait_for(state="visible")
                image_ready(subpage)
                check("Static hosting in a project subdirectory works", subpage.locator('[data-episode]').count() == 56 and "%2Fannotation-site-level2%2F" in snapshot(subpage)["storageKey"])
                subpage.close()
            finally:
                subserver.shutdown()
                subserver.server_close()

            unavailable = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
            unavailable.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('synthetic quota test','QuotaExceededError')};")
            unsaved = open_rater(unavailable, layout_path, "quota-test")
            check("Storage failure is visible and never claimed saved", unsaved.locator("#storageWarning").is_visible() and "Not saved" in unsaved.locator("#saveStatus").inner_text())
            unsaved.locator('[data-answer="scene.crossing_valid"]').select_option("yes")
            backup = download_json(unsaved, "#draftExport", temporary / "quota-backup.json")
            check("Storage-failure session can still export all in-memory edits", backup["episodes"][0]["answers"]["scene"]["crossing_valid"] == "yes")

            check("No browser JavaScript exceptions", not errors)
            check("No broken HTTP asset responses", not failed_responses)
            check("No external network calls or annotation uploads", not external)
            browser.close()
            completed = True
    finally:
        server.shutdown()
        server.server_close()
        (report_dir / "browser_test_report.json").write_text(json.dumps({"status": "passed" if completed else "failed", "passed": len(results), "checks": results, "javascript_errors": errors, "failed_http_responses": failed_responses, "external_requests": external, "synthetic_only": True}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, default=SITE / "validation")
    arguments = parser.parse_args()
    run(arguments.report_dir.resolve())
