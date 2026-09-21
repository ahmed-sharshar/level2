#!/usr/bin/env python3
"""Isolated real-browser tests for researcher setup. Never publishes live tasks.

Run with the project's scannetpp Python (Playwright and Chromium installed).
Synthetic approvals live only in a temporary browser profile and downloads.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def node_path() -> str:
    node = shutil.which("node")
    if node:
        return node
    import playwright
    candidate = Path(playwright.__file__).parent / "driver" / "node"
    if candidate.is_file():
        return str(candidate)
    raise RuntimeError("Node was not found; install it or use the scannetpp environment.")


def approved_fixture(site: Path) -> dict:
    script = r"""
const fs=require('fs'),p=process.argv[1],C=require(p+'/core.js'),F=require(p+'/full-core.js');
const d=JSON.parse(fs.readFileSync(p+'/dataset.json')),c=JSON.parse(fs.readFileSync(p+'/catalogue.json'));
const t=F.createTasks(d,c,'setup-browser-test');
t.settings.points_per_side=4;
t.settings.protocol_reviewed=true;t.settings.protocol_reviewer='synthetic-test-only';
t.settings.hierarchy_reviewed=true;t.settings.hierarchy_reviewer='synthetic-test-only';
t.settings.protocol_notes='AUTOMATED TEST FIXTURE. These are not real researcher approvals.';
t.layout.episodes.forEach((e,i)=>{
 if(i){e.disposition='exclude';e.exclusion_reason='Synthetic automated test exclusion, not a real data judgment.';return;}
 e.markers=['indoor','exterior'].flatMap(side=>e.markers.filter(m=>m.side===side).slice(0,4));
 e.directions=[{id:'d1',text:'Synthetic test direction toward the visible opening.',reference_frame:'f01',x:.4,y:.5},{id:'d2',text:'Synthetic test direction downward from the upper reference feature.',reference_frame:'f02',x:.6,y:.3}];
 e.setup_reviewed=true;e.setup_notes='SYNTHETIC TEST ONLY';
});
t.layout.layout_id=C.layoutId(t.layout);t.task_id=F.taskId(t);
const errors=F.validateTasks(t,d,c,true);if(errors.length)throw Error(errors.join('\n'));
process.stdout.write(JSON.stringify(t));
"""
    return json.loads(subprocess.check_output([node_path(), "-e", script, str(site)], text=True))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    site = args.site.resolve()
    report_path = args.report or site / "validation" / "setup_browser_report.json"
    source_task_bytes = (site / "collection-tasks.json").read_bytes()
    source_sha = hashlib.sha256(source_task_bytes).hexdigest()
    dataset = json.loads((site / "dataset.json").read_text())
    fixture = approved_fixture(site)
    checks: list[dict] = []
    errors: list[str] = []
    http_failures: list[str] = []
    external: list[str] = []

    def check(name, condition, detail=None):
        result = {"name": name, "passed": bool(condition)}
        if detail is not None:
            result["detail"] = detail
        checks.append(result)
        if not condition:
            raise AssertionError(name + (": " + str(detail) if detail is not None else ""))

    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(site)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        with tempfile.TemporaryDirectory(prefix="blockmind-setup-test-") as tmp, sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda response: http_failures.append(f"{response.status} {response.url}") if response.status >= 400 else None)
            page.on("request", lambda request: external.append(request.url) if not request.url.startswith(origin) and not request.url.startswith(("blob:", "data:")) else None)
            page.on("dialog", lambda dialog: dialog.accept())

            def snapshot():
                return page.evaluate("L2Setup.getSnapshot()")

            def ready():
                page.wait_for_function("L2Setup.getSnapshot().imageReady")

            def point(x, y):
                ready()
                rect = page.locator("#sceneImage").bounding_box()
                page.mouse.click(rect["x"] + rect["width"] * x, rect["y"] + rect["height"] * y)

            def import_tasks(value):
                page.set_input_files("#importFile", {"name": "synthetic-tasks.json", "mimeType": "application/json", "buffer": json.dumps(value).encode()})
                page.wait_for_function("document.getElementById('importFile').value === ''")

            def download(selector, filename):
                with page.expect_download() as event:
                    page.click(selector)
                value = event.value
                destination = Path(tmp) / filename
                value.save_as(destination)
                return value.suggested_filename, destination

            page.goto(origin + "/setup.html")
            page.locator("#welcome").wait_for(state="visible")
            page.fill("#coordinatorInput", "setup-browser-test")
            page.click("#startButton")
            ready()
            initial = snapshot()
            check("all_56_scenes_available", page.locator("#sceneSelect option").count() == 56)
            check("source_setup_unreviewed", all(not e["setup_reviewed"] for e in initial["tasks"]["layout"]["episodes"]))
            check("local_draft_requires_exactly_four_per_side", initial["tasks"]["settings"].get("points_per_side") == 4)
            check("opening_setup_preserves_every_published_point", [e["markers"] for e in initial["tasks"]["layout"]["episodes"]] == [e["markers"] for e in json.loads(source_task_bytes)["layout"]["episodes"]])
            check("four_point_side_cannot_add_fifth", page.locator("#addPoint").is_disabled())
            check("no_automatic_protocol_approval", not initial["tasks"]["settings"]["protocol_reviewed"] and not initial["tasks"]["settings"]["hierarchy_reviewed"])
            check("no_invented_directions", all(not d["text"] for e in initial["tasks"]["layout"]["episodes"] for d in e["directions"]))
            check("fixed_boundary_identity_visible", str(dataset["episodes"][0]["boundary_object_id"]) in page.locator("#datasetIdentity").inner_text())
            _, blank_path = download("#draftExport", "initial.json")
            check("blank_draft_can_export", json.loads(blank_path.read_text())["schema"] == "blockmind_l2_tasks_v1")
            page.click("#publishButton")
            check("unreviewed_publish_blocked", page.locator("#messageDialog").is_visible() and "not ready" in page.locator("#messageTitle").inner_text())
            page.click("#closeMessage")

            # Shortages remain visible: no synthetic point fills either scene.
            page.select_option("#sceneSelect", "7")
            page.click('[data-tab="review"]')
            page.click("#setupReviewed")
            check("scene8_three_exterior_points_cannot_be_approved", not snapshot()["tasks"]["layout"]["episodes"][7]["setup_reviewed"] and "Exactly four" in page.locator("#messageTitle").inner_text())
            page.click("#closeMessage")
            page.click('[data-tab="points"]')
            # One source episode intentionally has only two exterior suggestions.
            page.select_option("#sceneSelect", "37")
            ready()
            before = snapshot()
            exterior_count = sum(m["side"] == "exterior" for m in before["tasks"]["layout"]["episodes"][37]["markers"])
            check("scene38_has_two_exterior_proposals", exterior_count == 2)
            page.click('[data-frame="6"]')
            ready()
            page.click("#addPoint")
            point(.42, .58)
            added_state = snapshot()
            added = added_state["tasks"]["layout"]["episodes"][37]["markers"][added_state["marker"]]
            check("manual_add_exterior_point", added["side"] == "exterior" and added["anchor_frame"] == "f07")
            check("new_point_normalized_coordinates", abs(added["x"] - .42) < .003 and abs(added["y"] - .58) < .003)
            check("manual_point_has_no_invented_native_instance", added["object_id"] is None and added["mpcat40"] is None and added["observations"] == [])
            page.click('[data-tab="review"]')
            page.click("#setupReviewed")
            check("scene38_three_exterior_points_still_cannot_be_approved", not snapshot()["tasks"]["layout"]["episodes"][37]["setup_reviewed"] and "Exactly four" in page.locator("#messageTitle").inner_text())
            page.click("#closeMessage")
            page.click('[data-tab="points"]')
            page.click("#deletePoint")
            check("delete_point_restores_count", sum(m["side"] == "exterior" for m in snapshot()["tasks"]["layout"]["episodes"][37]["markers"]) == 2)
            for x in (.42, .62):
                page.click("#addPoint")
                point(x, .58)
            check("researcher_can_fill_missing_points_but_not_add_a_fifth", sum(m["side"] == "exterior" for m in snapshot()["tasks"]["layout"]["episodes"][37]["markers"]) == 4 and page.locator("#addPoint").is_disabled())
            check("placing_four_points_does_not_auto_approve", not snapshot()["tasks"]["layout"]["episodes"][37]["setup_reviewed"])

            page.select_option("#sceneSelect", "0")
            page.click('[data-select-marker="0"]')
            ready()
            page.click("#movePoint")
            point(.31, .61)
            moved = snapshot()["tasks"]["layout"]["episodes"][0]["markers"][0]
            check("move_clears_old_instance_and_observations", moved["object_id"] is None and moved["mpcat40"] is None and moved["observations"] == [])
            check("move_preserves_normalized_anchor", abs(moved["x"] - .31) < .003 and abs(moved["y"] - .61) < .003)
            other_frame = 1 if moved["anchor_frame"] != "f02" else 2
            page.click(f'[data-frame="{other_frame}"]')
            page.click("#addObservation")
            point(.38, .52)
            observation = snapshot()["tasks"]["layout"]["episodes"][0]["markers"][0]["observations"][0]
            check("same_patch_cross_frame_observation", observation["frame_id"] == f"f{other_frame+1:02d}" and observation["source"] == "human")
            check("observation_coordinates_normalized", abs(observation["x"]-.38) < .003 and abs(observation["y"]-.52) < .003)
            page.click(f'[data-delete-observation="{observation["frame_id"]}"]')
            check("observation_remove", snapshot()["tasks"]["layout"]["episodes"][0]["markers"][0]["observations"] == [])

            page.click('[data-tab="directions"]')
            text = "Synthetic test: from the exterior toward the visible boundary opening."
            page.fill("#directionText_d1", text)
            page.click("#placeDirection_d1")
            point(.51, .47)
            direction = snapshot()["tasks"]["layout"]["episodes"][0]["directions"][0]
            check("feature_relative_direction_text_preserved", direction["text"] == text)
            check("direction_visible_reference_anchor", direction["reference_frame"] == f"f{other_frame+1:02d}" and abs(direction["x"]-.51) < .003)
            page.click('[data-tab="boundary"]')
            page.click('[data-frame="2"]')
            page.click("#drawBox")
            point(.2, .25)
            point(.7, .8)
            box = next(b for b in snapshot()["tasks"]["layout"]["episodes"][0]["boundary_boxes"] if b["frame_id"] == "f03")
            check("two_click_boundary_box", abs(box["x0"]-.2) < .003 and abs(box["y0"]-.25) < .003 and abs(box["x1"]-.7) < .003 and abs(box["y1"]-.8) < .003)
            page.click('[data-frame="6"]')
            page.click("#drawBox")
            check("postcrossing_box_drawing_rejected", "pre-crossing" in page.locator("#messageTitle").inner_text())
            page.click("#closeMessage")

            page.click('[data-tab="review"]')
            page.check("#glassSelected")
            page.click('[data-audit="glass.pane_present"][data-value="not_determinable"]')
            page.click('[data-audit="glass.separate_leaf"][data-value="no"]')
            page.check('[data-evidence="f01"]')
            page.check('[data-evidence="f03"]')
            page.fill("#glassNotes", "=SYNTHETIC evidence only")
            page.check("#trajectorySelected")
            page.click('[data-audit="trajectory.valid"][data-value="yes"]')
            page.fill("#trajectoryNotes", "Synthetic test only, not a real validity judgment.")
            task_audit = snapshot()["tasks"]["audits"][dataset["episodes"][0]["id"]]
            check("glass_nd_is_explicit_not_negative", task_audit["glass"]["pane_present"] == "not_determinable")
            check("audit_evidence_frame_list", task_audit["glass"]["evidence_frames"] == ["f01", "f03"])
            check("trajectory_audit_separate_from_human_answers", task_audit["trajectory"]["valid"] == "yes" and "answers" not in snapshot()["tasks"])
            check("uncertain_does_not_pass_glass_gate", "Gate not met" in page.locator(".audit-summary").inner_text())
            _, glass_csv = download("#exportGlassCSV", "glass.csv")
            glass_rows = list(csv.DictReader(io.StringIO(glass_csv.read_text())))
            check("glass_csv_has_all_56_rows", len(glass_rows) == 56)
            check("csv_formula_injection_escaped", glass_rows[0]["notes"].startswith("'=SYNTHETIC"))
            _, review_csv = download("#exportReviewCSV", "review.csv")
            review_rows = list(csv.DictReader(io.StringIO(review_csv.read_text())))
            check("review_csv_retains_validity", len(review_rows) == 56 and review_rows[0]["trajectory_valid"] == "yes")
            check("later_review_link_present", page.locator('a[href="review.html"]').count() == 1)

            page.locator(".global-settings summary").first.click()
            page.check("#protocolReviewed")
            page.check("#hierarchyReviewed")
            settings = snapshot()["tasks"]["settings"]
            check("explicit_global_review_named", settings["protocol_reviewed"] and settings["hierarchy_reviewed"] and settings["protocol_reviewer"] == "setup-browser-test" and settings["hierarchy_reviewer"] == "setup-browser-test")
            page.fill("#protocolReviewer", "")
            check("clearing_reviewer_clears_approval", not snapshot()["tasks"]["settings"]["protocol_reviewed"])
            _, draft = download("#draftExport", "edited-draft.json")
            edited = json.loads(draft.read_text())
            check("edited_geometry_and_audits_export", edited["audits"][dataset["episodes"][0]["id"]]["glass"]["notes"] == "=SYNTHETIC evidence only")

            page.reload()
            page.fill("#coordinatorInput", "setup-browser-test")
            page.click("#startButton")
            ready()
            check("reload_resumes_geometry_and_audits", snapshot()["tasks"]["layout"]["episodes"][0]["directions"][0]["text"] == text and snapshot()["tasks"]["audits"][dataset["episodes"][0]["id"]]["glass"]["pane_present"] == "not_determinable")

            # Selection is not a completed audit, even when a single positive
            # checkbox was filled. All mutations below are synthetic browser
            # imports; the published collection-tasks.json remains untouched.
            partial_audit = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).forEach((a,i)=>{
                a.glass={selected:i<20,pane_present:i<20?'yes':null,
                  phantom_geometry:null,separate_leaf:null,evidence_frames:[],notes:''};
                a.trajectory={selected:i<4,valid:i===0?'yes':i===1?'no':i===2?'not_determinable':null,notes:''};
              });
              t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(partial_audit)
            page.click('[data-tab="review"]')
            summary = page.locator(".audit-summary").inner_text()
            check("twenty_partial_positive_selections_do_not_pass_audit_gate", "20 boundaries selected · 0 completed · 20 still pending" in summary and "Gate not met" in summary)
            check("trajectory_summary_distinguishes_reviewed_and_pending", "4 selected · 3 reviewed (1 yes, 1 no, 1 not determinable) · 1 pending" in summary)

            without_evidence = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).filter(a=>a.glass.selected).forEach(a=>{
                a.glass.phantom_geometry='no';a.glass.separate_leaf='no';
              });t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(without_evidence)
            summary = page.locator(".audit-summary").inner_text()
            check("all_answers_without_evidence_still_pending", "0 completed · 20 still pending" in summary and "Gate not met" in summary)

            uncertain_audit = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).filter(a=>a.glass.selected).forEach(a=>{
                a.glass.evidence_frames=['f01'];a.glass.phantom_geometry='not_determinable';
              });t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(uncertain_audit)
            summary = page.locator(".audit-summary").inner_text()
            check("completed_uncertain_records_not_gate_positives", "20 completed · 0 still pending" in summary and "20 completed records contain uncertainty" in summary and "0 fully determined positives / 20 completed (0.0%)" in summary and "Gate not met" in summary)
            check("descriptive_positive_count_not_confused_with_gate", "20 selected records say pane or separate leaf is present (descriptive only)" in summary)

            completed_audit = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).filter(a=>a.glass.selected).forEach((a,i)=>{
                a.glass.phantom_geometry='no';
                if(i%2){a.glass.evidence_frames=[];a.glass.notes='Synthetic written evidence, not a real audit.';}
              });t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(completed_audit)
            summary = page.locator(".audit-summary").inner_text()
            check("twenty_complete_determinate_positive_audits_meet_numeric_gate", "20 fully determined positives / 20 completed (100.0%)" in summary and "Numeric gate met" in summary)
            check("written_notes_can_supply_audit_evidence", "20 completed · 0 still pending" in summary)

            threshold_audit = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).filter(a=>a.glass.selected).forEach((a,i)=>{if(i<6)a.glass.pane_present='no';});
              t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(threshold_audit)
            summary = page.locator(".audit-summary").inner_text()
            check("glass_gate_uses_completed_denominator_at_70_percent", "14 fully determined positives / 20 completed (70.0%)" in summary and "Numeric gate met" in summary)
            below_threshold = page.evaluate("""() => {
              const t=L2Setup.getSnapshot().tasks;
              Object.values(t.audits).filter(a=>a.glass.selected)[6].glass.pane_present='no';
              t.task_id=L2Full.taskId(t);return t;
            }""")
            import_tasks(below_threshold)
            summary = page.locator(".audit-summary").inner_text()
            check("glass_gate_rejects_65_percent", "13 fully determined positives / 20 completed (65.0%)" in summary and "Gate not met" in summary)

            import_tasks(fixture)
            ready()
            imported = snapshot()["tasks"]
            check("approved_test_fixture_import_and_exclusions", imported["layout"]["episodes"][0]["disposition"] == "include" and sum(e["disposition"] == "exclude" for e in imported["layout"]["episodes"]) == 55)
            filename, published = download("#publishButton", "published-synthetic.json")
            check("publish_uses_exact_shared_filename", filename == "collection-tasks.json")
            check("separate_glass_audit_gate_does_not_block_annotation_publication", not any(a["glass"]["selected"] for a in imported["audits"].values()))
            published_doc = json.loads(published.read_text())
            check("published_layout_has_content_identity", bool(published_doc["layout"]["layout_id"]) and published_doc["task_id"] == fixture["task_id"])
            check("publish_explains_manual_server_copy", "cannot update the server file" in page.locator("#messageText").inner_text())
            page.click("#closeMessage")
            check("local_setup_not_silently_frozen", snapshot()["tasks"]["layout"]["layout_id"] == "")

            # A legacy approved package is preserved as geometry, but its local
            # draft must satisfy the newly explicit four-per-side requirement.
            shortage = json.loads(json.dumps(fixture))
            shortage["layout"]["episodes"][0]["markers"].pop()
            shortage["settings"].pop("points_per_side")
            shortage = page.evaluate("t=>{t.layout.layout_id='';t.task_id=L2Full.taskId(t);return t;}", shortage)
            import_tasks(shortage)
            check("imported_legacy_shortage_loses_only_local_approval", not snapshot()["tasks"]["layout"]["episodes"][0]["setup_reviewed"] and len(snapshot()["tasks"]["layout"]["episodes"][0]["markers"]) == 7)
            page.click("#publishButton")
            check("otherwise_approved_shortage_cannot_publish", "not ready" in page.locator("#messageTitle").inner_text() and "exactly 4" in page.locator("#messageText").inner_text())
            page.click("#closeMessage")
            import_tasks(fixture)

            before_bad = snapshot()["tasks"]
            foreign = json.loads(json.dumps(fixture))
            foreign["build_id"] = "different-build"
            import_tasks(foreign)
            check("foreign_build_import_transactional", snapshot()["tasks"] == before_bad and page.locator("#messageDialog").is_visible())
            page.click("#closeMessage")
            page.set_input_files("#importFile", {"name": "null.json", "mimeType": "application/json", "buffer": b"null"})
            page.wait_for_function("document.getElementById('importFile').value === ''")
            check("null_import_safe", page.locator("#messageDialog").is_visible() and snapshot()["tasks"] == before_bad)
            page.click("#closeMessage")

            page.click('[data-tab="directions"]')
            page.fill("#directionText_d1", "Changed synthetic direction; requires renewed local review.")
            check("direction_edit_invalidates_scene_review", not snapshot()["tasks"]["layout"]["episodes"][0]["setup_reviewed"])
            page.click("#publishButton")
            check("changed_geometry_cannot_republish_without_review", "not ready" in page.locator("#messageTitle").inner_text())
            page.click("#closeMessage")

            second = context.new_page()
            second.goto(origin + "/setup.html")
            second.fill("#coordinatorInput", "setup-browser-test")
            second.click("#startButton")
            page.wait_for_function("L2Setup.getSnapshot().conflict")
            check("stale_tab_locks", page.locator("#conflictBanner").is_visible())
            _, recovery = download("#recoveryExport", "recovery.json")
            check("stale_tab_recovery_download", json.loads(recovery.read_text())["schema"] == "blockmind_l2_tasks_v1")
            second.close()

            mobile = browser.new_context(viewport={"width": 390, "height": 844})
            m = mobile.new_page()
            m.goto(origin + "/setup.html")
            m.fill("#coordinatorInput", "mobile-synthetic-test")
            m.click("#startButton")
            m.wait_for_function("L2Setup.getSnapshot().imageReady")
            check("mobile_no_horizontal_overflow", m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            mobile.close()

            quota = browser.new_context()
            quota.add_init_script("Storage.prototype.setItem = function(){throw new DOMException('quota','QuotaExceededError')};")
            q = quota.new_page()
            q.goto(origin + "/setup.html")
            q.fill("#coordinatorInput", "quota-synthetic-test")
            q.click("#startButton")
            q.wait_for_function("L2Setup.getSnapshot().imageReady")
            check("quota_failure_keeps_export_and_warning", q.locator("#storageWarning").is_visible() and q.locator("#draftExport").is_enabled() and not q.evaluate("L2Setup.getSnapshot().conflict"))
            quota.close()
            browser.close()

        check("production_task_file_unchanged", hashlib.sha256((site / "collection-tasks.json").read_bytes()).hexdigest() == source_sha)
        check("no_browser_javascript_errors", not errors, errors)
        check("no_failed_http_requests", not http_failures, http_failures)
        check("no_external_requests", not external, external)
    finally:
        server.shutdown()
        report = {"test": "researcher_setup_browser", "created_at": datetime.now(timezone.utc).isoformat(), "dataset_build_id": dataset["build_id"], "production_tasks_sha256": source_sha, "synthetic_data_only": True, "checks": checks, "passed": sum(c["passed"] for c in checks), "total": len(checks), "javascript_errors": errors, "http_failures": http_failures, "external_requests": external}
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"passed": report["passed"], "total": report["total"], "report": str(report_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
