#!/usr/bin/env python3
"""Exercise the simple annotator workflow in Chromium using disposable answers.

Nothing from this test is written to the annotation data. Browser profiles and
downloaded JSON are temporary; only checks and screenshots are retained.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run(report_dir: Path, entry: str):
    report_dir.mkdir(parents=True, exist_ok=True)
    checks, errors, failed_responses, external = [], [], [], []
    completed = False

    def check(name, condition=True):
        assert condition, name
        checks.append(name)
        print(f"PASS {name}", flush=True)

    def snapshot(page):
        return page.evaluate("L2Simple.getSnapshot()")

    def loaded(page):
        page.wait_for_function("window.L2Simple && !document.getElementById('startButton').disabled")

    def image_ready(page):
        page.wait_for_function("L2Simple.getSnapshot().imageReady && document.getElementById('sceneImage').complete && document.getElementById('sceneImage').naturalWidth > 0")

    def point_record(state, index=None):
        index = state["marker"] if index is None else index
        marker = state["doc"]["layout"]["episodes"][state["episode"]]["markers"][index]
        answers = state["doc"]["episodes"][state["episode"]]["answers"]["surfaces"][marker["id"]]
        return marker, answers

    def validate(page, document):
        return page.evaluate("""async doc => {
          const [dataset,catalogue]=await Promise.all(['dataset.json','catalogue.json'].map(x=>fetch(x).then(r=>r.json())));
          return L2Guided.validate(doc,dataset,catalogue);
        }""", document)

    def monitor(page):
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("response", lambda response: failed_responses.append([response.status, response.url]) if response.status >= 400 else None)
        page.on("request", lambda request: external.append(request.url) if not request.url.startswith((origin, "blob:", "data:")) else None)
        page.on("dialog", lambda dialog: dialog.accept("SYNTHETIC TEST ONLY") if dialog.type == "prompt" else dialog.accept())

    def start(context, identity="guided-browser-test"):
        page = context.new_page()
        monitor(page)
        page.goto(origin + entry)
        loaded(page)
        page.locator("#identityInput").fill(identity)
        page.locator("#startButton").click()
        page.locator("#sceneImage").wait_for(state="visible")
        image_ready(page)
        return page

    def download(page, target):
        with page.expect_download() as pending:
            page.locator("#downloadButton").click()
        pending.value.save_as(target)
        return json.loads(target.read_text())

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(SITE)))
    server.daemon_threads = True
    origin = f"http://127.0.0.1:{server.server_port}/"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="blockmind-guided-test-") as tmp, sync_playwright() as playwright:
            temporary = Path(tmp)
            browser = playwright.chromium.launch()
            context = browser.new_context(viewport={"width": 1440, "height": 1050}, accept_downloads=True)
            context.add_init_script("localStorage.setItem('blockmind_l2_legacy_sentinel','SYNTHETIC preserve old advanced annotations');")
            page = start(context)
            check("A name starts annotation without role, layout, or import", page.locator("#sceneImage").is_visible())
            check("All 56 episodes are available", page.locator("#sceneSelect option").count() == 56)
            check("Exactly four guided steps are offered", page.locator("[data-step]").count() == 4)
            check("Legacy annotation storage is untouched", page.evaluate("localStorage.getItem('blockmind_l2_legacy_sentinel')") == "SYNTHETIC preserve old advanced annotations")
            page.screenshot(path=str(report_dir / "guided-desktop.png"), full_page=True)

            initial = download(page, temporary / "guided-partial.json")
            check("Incomplete work can always be downloaded", isinstance(initial, dict) and initial.get("benchmark_ready") is False)
            check("Guided export does not impersonate full protocol annotations", initial.get("schema") != "blockmind_l2_annotations_v1")
            check("Partial download validates against the guided schema", validate(page, initial) == [])
            check("Neither scene labels nor point materials are prefilled from mesh predictions", initial["episodes"][0]["answers"]["scene"]["boundary_class"] is None and all(x["material"] is None for x in initial["episodes"][0]["answers"]["surfaces"].values()))

            page.locator('[data-answer="scene.crossing_valid"][data-value="yes"]').click()
            check("Simple scene answer is saved explicitly", snapshot(page)["doc"]["episodes"][0]["answers"]["scene"]["crossing_valid"] == "yes")
            page.locator('[data-answer="scene.boundary_class"][data-value="not_determinable"]').click()
            check("Not sure is explicit uncertainty rather than an unanswered field", snapshot(page)["doc"]["episodes"][0]["answers"]["scene"]["boundary_class"] == "not_determinable")

            # The rest of the end-to-end checks are deliberately kept here, not
            # in a generated fixture that could be mistaken for human answers.
            page.locator('[data-step="1"]').click()
            image_ready(page)
            check("Point step opens directly without mandatory setup", page.locator("#objectSelect").is_visible() and page.locator("#materialSelect").is_visible())
            marker, surface = point_record(snapshot(page))
            check("Point selection automatically opens its anchor photograph", snapshot(page)["frame"] == int(marker["anchor_frame"][1:]) - 1)
            check("Only one highlighted point is presented at a time", page.locator("#pointOverlay circle").count() in (1, 2))

            catalogue = page.evaluate("fetch('catalogue.json').then(r=>r.json())")
            object_options = page.locator("#objectSelect option").evaluate_all("options=>options.map(o=>({value:o.value,text:o.textContent.trim()}))")
            suggested_object = next((o for o in object_options if any(c["name"].casefold() == o["text"].casefold() and catalogue["suggestions_by_mpcat40"].get(str(c["id"])) for c in catalogue["objects"])), None)
            check("Object dropdown contains material-catalogue categories", suggested_object is not None)
            category = next(c for c in catalogue["objects"] if c["name"].casefold() == suggested_object["text"].casefold())
            page.locator("#objectSelect").select_option(suggested_object["value"])
            suggested_materials = catalogue["suggestions_by_mpcat40"][str(category["id"])]
            material_options = page.locator("#materialSelect option").evaluate_all("options=>options.map(o=>({value:o.value,text:o.textContent.trim()}))")
            check("Material suggestions follow the selected object", all(any(o["text"] == material for o in material_options) for material in suggested_materials))
            choice = next(o for o in material_options if o["text"] == suggested_materials[0])
            page.locator("#materialSelect").select_option(choice["value"])
            page.locator(f'[data-answer="surfaces.{marker["id"]}.reflectance"][data-value="reflective"]').click()
            check("The three basic point labels are saved", point_record(snapshot(page))[1]["object_name"] == category["name"] and point_record(snapshot(page))[1]["material"] == suggested_materials[0] and point_record(snapshot(page))[1]["reflectance"] == "reflective")
            material_other = next(o for o in material_options if o["text"].lower().startswith("other"))
            page.locator("#materialSelect").select_option(material_other["value"])
            page.locator("#materialOther").fill("SYNTHETIC custom woven panel")
            page.locator("#materialOther").blur()
            check("Other material preserves the annotator's own text", point_record(snapshot(page))[1]["material"] == "SYNTHETIC custom woven panel")
            object_other = next(o for o in object_options if o["text"].lower().startswith("other"))
            page.locator("#objectSelect").select_option(object_other["value"])
            page.locator("#objectOther").fill("SYNTHETIC custom partition")
            page.locator("#objectOther").blur()
            check("Other object preserves a custom object name", point_record(snapshot(page))[1]["object_name"] == "SYNTHETIC custom partition")
            all_options = page.locator("#materialSelect option").all_text_contents()
            check("Other object exposes all material suggestions", all(material in all_options for material in catalogue["all_material_suggestions"]))

            other_points_before = {key: value for key, value in snapshot(page)["doc"]["episodes"][0]["answers"]["surfaces"].items() if key != marker["id"]}
            page.locator("#movePoint").click()
            image_ready(page)
            rectangle = page.locator("#sceneImage").bounding_box()
            page.mouse.click(rectangle["x"] + .531 * rectangle["width"], rectangle["y"] + .475 * rectangle["height"])
            moved, moved_answers = point_record(snapshot(page))
            check("Moving a labeled point clears its old labels and native hints", moved["id"] == marker["id"] and moved["object_id"] is None and moved["mpcat40"] is None and moved["observations"] == [] and all(moved_answers[key] is None for key in ["object_name", "material", "reflectance"]))
            other_points_after = {key: value for key, value in snapshot(page)["doc"]["episodes"][0]["answers"]["surfaces"].items() if key != marker["id"]}
            check("Moving one point does not alter any other surface labels", other_points_before == other_points_after)

            page.locator("#nextPoint").click()
            image_ready(page)
            skipped_index = snapshot(page)["marker"]
            skipped_before = point_record(snapshot(page))[1]
            page.locator("#skipPoint").click()
            image_ready(page)
            skipped_after = point_record(snapshot(page), skipped_index)[1]
            check("Skipping a point preserves unanswered fields instead of inventing uncertainty", skipped_before == skipped_after and skipped_after["material"] is None and skipped_after["reflectance"] is None)

            # Optional free placement is the same familiar interaction as the
            # earlier point website, without a separate layout coordinator.
            add_point = page.locator("#addPoint")
            add_point.evaluate("button=>{const section=button.closest('details');if(section)section.open=true;}")
            point_count = len(snapshot(page)["doc"]["layout"]["episodes"][0]["markers"])
            add_point.click()
            rectangle = page.locator("#sceneImage").bounding_box()
            page.mouse.click(rectangle["x"] + .513 * rectangle["width"], rectangle["y"] + .487 * rectangle["height"])
            added, added_answers = point_record(snapshot(page))
            check("A free click adds a normalized red point without a separate setup", len(snapshot(page)["doc"]["layout"]["episodes"][0]["markers"]) == point_count + 1 and abs(added["x"] - .513) < .003 and abs(added["y"] - .487) < .003)
            check("Newly added point has blank human labels", all(added_answers[key] is None for key in ["object_name", "material", "reflectance"]))
            page.screenshot(path=str(report_dir / "guided-point-desktop.png"), full_page=True)

            # All scenes must remain reachable even if the current one is blank.
            for index in range(56):
                page.locator("#sceneSelect").select_option(index=index)
                image_ready(page)
                assert snapshot(page)["episode"] == index
            check("All 56 scenes open without completing the previous scene")
            page.locator("#sceneSelect").select_option(index=0)
            page.locator('[data-step="0"]').click()
            for index in range(12):
                page.locator("#frameSlider").fill(str(index))
                page.locator("#frameSlider").dispatch_event("input")
                image_ready(page)
                assert snapshot(page)["frame"] == index
            check("All 12 ordered frames are available")

            page.locator('[data-step="2"]').click()
            page.locator('[data-answer="boundary.observed_state"][data-value="not_determinable"]').click()
            check("Door questions accept Not sure", snapshot(page)["doc"]["episodes"][0]["answers"]["boundary"]["observed_state"] == "not_determinable")
            saved = download(page, temporary / "guided-answers.json")
            check("Partially answered export validates and is marked provisional", not saved["benchmark_ready"] and validate(page, saved) == [])
            before_reload = snapshot(page)["doc"]["episodes"][0]["answers"]
            page.reload()
            loaded(page)
            page.locator("#identityInput").fill("guided-browser-test")
            page.locator("#startButton").click()
            image_ready(page)
            check("Reload and same name restore all saved answers", snapshot(page)["doc"]["episodes"][0]["answers"] == before_reload)

            for label, mutate in [
                ("foreign build", lambda document: document.update(build_id="SYNTHETIC_FOREIGN_BUILD")),
                ("another annotator", lambda document: document.update(annotator="SYNTHETIC-other-person")),
            ]:
                malicious = json.loads(json.dumps(saved))
                mutate(malicious)
                import_path = temporary / (label.replace(" ", "-") + ".json")
                import_path.write_text(json.dumps(malicious))
                before = snapshot(page)["doc"]
                page.locator("#importFile").set_input_files(import_path)
                page.locator("#messageDialog").wait_for(state="visible")
                check(f"Import from {label} is rejected without replacing work", snapshot(page)["doc"] == before)
                page.locator("#closeMessage").click()

            for label, contents in [("JSON null", "null"), ("malformed JSON", "{broken SYNTHETIC JSON")]:
                import_path = temporary / (label.replace(" ", "-") + ".json")
                import_path.write_text(contents)
                before = snapshot(page)["doc"]
                page.locator("#importFile").set_input_files(import_path)
                page.locator("#messageDialog").wait_for(state="visible")
                check(f"Import of {label} leaves the current draft intact", snapshot(page)["doc"] == before)
                page.locator("#closeMessage").click()

            page.locator('[data-step="1"]').click()
            image_ready(page)
            page.screenshot(path=str(report_dir / "guided-point-desktop.png"), full_page=True)

            page.set_viewport_size({"width": 390, "height": 844})
            page.screenshot(path=str(report_dir / "guided-mobile.png"), full_page=True)
            check("Mobile layout has no horizontal overflow", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))

            # Same origin, same identity in another tab must not silently win.
            page.set_viewport_size({"width": 1440, "height": 1050})
            other_tab = start(context)
            other_tab.locator('[data-step="0"]').click()
            other_tab.locator('[data-answer="scene.crossing_valid"][data-value="no"]').click()
            page.locator("#conflictBanner").wait_for(state="visible")
            check("Concurrent edits lock the stale tab instead of overwriting", snapshot(page)["conflict"])
            stale_copy = download(page, temporary / "stale-recovery.json")
            check("Even a conflicted tab can download its own work", stale_copy["episodes"][0]["answers"]["scene"]["crossing_valid"] == "yes")
            other_tab.close()

            quota_context = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
            quota_context.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('SYNTHETIC quota test','QuotaExceededError')};")
            quota = start(quota_context, "guided-quota-test")
            check("Storage failure is shown without blocking annotation", quota.locator("#storageWarning").is_visible())
            quota.locator('[data-answer="scene.crossing_valid"][data-value="yes"]').click()
            backup = download(quota, temporary / "quota-backup.json")
            check("Storage-failure session still exports the in-memory answers", backup["episodes"][0]["answers"]["scene"]["crossing_valid"] == "yes")
            quota_context.close()
            check("No browser JavaScript exceptions", not errors)
            check("No broken HTTP asset responses", not failed_responses)
            check("No external requests or annotation uploads", not external)
            browser.close()
            completed = True
    finally:
        server.shutdown()
        server.server_close()
        (report_dir / "guided_browser_report.json").write_text(json.dumps({
            "status": "passed" if completed else "failed", "passed": len(checks),
            "checks": checks, "javascript_errors": errors,
            "failed_http_responses": failed_responses, "external_requests": external,
            "entry": entry, "synthetic_only": True,
        }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, default=SITE / "validation")
    parser.add_argument("--entry", default="guided.html")
    args = parser.parse_args()
    run(args.report_dir.resolve(), args.entry)
