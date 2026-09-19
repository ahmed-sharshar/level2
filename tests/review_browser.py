#!/usr/bin/env python3
"""Local-only browser integration for later review tools; all labels are synthetic.

Run with the scannetpp Python environment (Playwright + Chromium installed).
No prepared task files or human labels are changed. Runtime queue fixtures live in
a TemporaryDirectory and are removed automatically.
"""
from __future__ import annotations

import argparse
import copy
import functools
import http.server
import json
from pathlib import Path
import tempfile
import threading
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=ROOT / "validation/review_browser_report.json")
    args = parser.parse_args()
    data = json.loads((ROOT / "dataset.json").read_text())
    episode = data["episodes"][0]
    marker_frame = {"episode_id": episode["id"], "frame_id": "f01", "markers": [{"label": "1", "x": .42, "y": .55}]}
    injection = '<img src="x" onerror="window.reviewInjection=1">'
    base_item = {
        "id": "synthetic-browser-001", "family": "A", "question": "Synthetic browser test only: choose A. " + injection,
        "options": [{"id": "A", "text": "Choice A " + injection}, {"id": "B", "text": "Choice B"}],
        "multi_select": False, "frames": [marker_frame],
    }
    matcher_item = {**copy.deepcopy(base_item), "model_id": "synthetic-not-a-real-model", "response": "I select A. " + injection,
                    "machine_extraction": {"status": "answered", "selected_options": ["A"]}}
    multi_item = {**copy.deepcopy(matcher_item), "id": "synthetic-browser-002", "multi_select": True,
                  "response": "Synthetic output: no options apply.", "machine_extraction": {"status": "answered", "selected_options": []}}
    matcher = {"schema": "blockmind_review_tasks_v1", "kind": "matcher", "title": "Synthetic browser fixture — not research data", "items": [matcher_item, multi_item]}
    baseline = {"schema": "blockmind_review_tasks_v1", "kind": "baseline", "title": "Synthetic visual baseline fixture", "items": [copy.deepcopy(base_item)]}
    error_item = {**copy.deepcopy(base_item), "model_id": "synthetic-not-a-real-model", "response": "Synthetic incorrect answer, for interface testing only."}
    error_queue = {"schema": "blockmind_review_tasks_v1", "kind": "error", "title": "Synthetic error-review fixture", "items": [error_item]}

    checks = []
    page_errors = []
    external_requests = []
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"

    def check(name, condition, detail=None):
        checks.append({"name": name, "passed": bool(condition), **({"detail": detail} if detail is not None else {})})
        print(("PASS " if condition else "FAIL ") + name, flush=True)
        if not condition:
            raise AssertionError(name + (": " + str(detail) if detail is not None else ""))

    try:
        with tempfile.TemporaryDirectory(prefix="blockmind-review-browser-") as temp, sync_playwright() as playwright:
            temp = Path(temp)
            fixtures = {}
            for name, fixture in [("matcher", matcher), ("baseline", baseline), ("error", error_queue)]:
                fixtures[name] = temp / (name + ".json")
                fixtures[name].write_text(json.dumps(fixture))
            unsafe = copy.deepcopy(baseline)
            unsafe["items"][0]["ground_truth"] = "A"
            unsafe_path = temp / "unsafe-baseline.json"
            unsafe_path.write_text(json.dumps(unsafe))
            contaminated = copy.deepcopy(baseline)
            contaminated["items"][0]["response"] = "HIDDEN_MODEL_ANSWER"
            contaminated_path = temp / "contaminated-baseline.json"
            contaminated_path.write_text(json.dumps(contaminated))
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)

            def open_page(ctx, reviewer):
                page = ctx.new_page()
                page.set_default_timeout(12000)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on("request", lambda request: external_requests.append(request.url) if not request.url.startswith(origin + "/") else None)
                page.on("dialog", lambda dialog: dialog.accept())
                page.goto(origin + "/review.html")
                page.wait_for_function("document.getElementById('notice').textContent.startsWith('Ready.')")
                page.fill("#reviewer", reviewer)
                return page

            def load(page, path):
                page.set_input_files("#queueFile", str(path))
                page.wait_for_function("window.L2ReviewUI.getSnapshot().doc !== null")

            def snapshot(page):
                return page.evaluate("L2ReviewUI.getSnapshot()")

            def export(page, button, name):
                with page.expect_download() as pending:
                    page.click(button)
                target = temp / name
                pending.value.save_as(target)
                return target, json.loads(target.read_text())

            page = open_page(context, "browser-reviewer-01")
            load(page, fixtures["matcher"])
            check("matcher queue loads without invented answers", snapshot(page)["doc"]["answers"][base_item["id"]] is None)
            check("question and response markup rendered as text", page.locator("#itemCard h2").inner_text().endswith(injection) and page.locator("#itemCard pre").inner_text().endswith(injection))
            check("no injected element or script execution", page.locator("#itemCard h2 img").count() == 0 and page.evaluate("window.reviewInjection === undefined"))
            check("machine extraction hidden from reviewer", "machine_extraction" not in page.locator("#itemCard").inner_text())
            page.select_option("#answerStatus", "answered")
            page.check('[name="option"][value="A"]')
            page.click("#saveAnswer")
            check("matcher selected answer saved", snapshot(page)["doc"]["answers"][base_item["id"]]["selected_options"] == ["A"])
            page.click("#nextItem")
            page.select_option("#answerStatus", "answered")
            page.click("#saveAnswer")
            check("explicit multi-select empty set retained", snapshot(page)["doc"]["answers"][multi_item["id"]] == {"status": "answered", "selected_options": [], "notes": ""})
            backup_path, backup = export(page, "#downloadReview", "matcher-backup.json")
            check("download has complete review schema and dataset identity", backup["schema"] == "blockmind_review_annotations_v1" and backup["queue"] == matcher and backup["build_id"] == data["build_id"])
            _, report = export(page, "#downloadReport", "matcher-report.json")
            check("matcher report exact-set accuracy and gate threshold", report["usable"] == 2 and report["accuracy"] == 1 and report["gate_passed"] is False and report["minimum_reviewed_outputs"] == 100)
            page.click("#clearAnswer")
            page.set_input_files("#queueFile", str(backup_path))
            page.wait_for_function("L2ReviewUI.getSnapshot().doc.answers['synthetic-browser-002'] !== null")
            check("own saved-review import restores answers", snapshot(page)["doc"]["answers"][multi_item["id"]]["selected_options"] == [])
            page.reload()
            page.wait_for_function("document.getElementById('notice').textContent.startsWith('Ready.')")
            page.fill("#reviewer", "browser-reviewer-01")
            load(page, fixtures["matcher"])
            check("same queue and reviewer resume browser draft", snapshot(page)["doc"]["answers"] == backup["answers"])
            page.select_option("#answerStatus", "answered")
            page.check('[name="option"][value="B"]')
            page.evaluate("window.originalReviewConfirm=window.confirm; window.reviewConfirmCount=0; window.confirm=() => { window.reviewConfirmCount++; return false; };")
            page.click("#nextItem")
            navigation_state = {"index": snapshot(page)["index"], "confirmations": page.evaluate("window.reviewConfirmCount"), "choice_retained": page.is_checked('[name="option"][value="B"]')}
            check("unsaved navigation prompts and respects cancellation", navigation_state["index"] == 0 and navigation_state["confirmations"] >= 1 and navigation_state["choice_retained"], navigation_state)
            page.evaluate("window.confirm=window.originalReviewConfirm;")
            page.check('[name="option"][value="A"]')
            page.click("#saveAnswer")

            before = snapshot(page)["doc"]
            foreign = copy.deepcopy(backup)
            foreign["reviewer"] = "somebody-else"
            foreign_path = temp / "foreign.json"
            foreign_path.write_text(json.dumps(foreign))
            page.set_input_files("#queueFile", str(foreign_path))
            page.wait_for_function("document.getElementById('notice').textContent.includes('Restore only your own review')")
            check("foreign-reviewer restore rejected transactionally", snapshot(page)["doc"] == before)
            page.set_input_files("#queueFile", str(unsafe_path))
            page.wait_for_function("document.getElementById('notice').textContent.includes('unexpected field ground_truth')")
            check("unknown GT-bearing queue field rejected", snapshot(page)["doc"] == before)
            page.set_input_files("#queueFile", str(contaminated_path))
            page.wait_for_function("document.getElementById('notice').textContent.includes('unexpected field response')")
            check("model response rejected from baseline queue", snapshot(page)["doc"] == before)
            tampered = copy.deepcopy(backup)
            tampered["build_id"] = "not-the-current-dataset"
            tampered_path = temp / "tampered-build.json"
            tampered_path.write_text(json.dumps(tampered))
            page.set_input_files("#queueFile", str(tampered_path))
            page.wait_for_function("document.getElementById('notice').textContent.includes('Dataset build identity mismatch')")
            check("foreign dataset identity rejected transactionally", snapshot(page)["doc"] == before)
            named_marker = copy.deepcopy(baseline)
            named_marker["items"][0]["frames"][0]["markers"][0]["label"] = "wood"
            named_marker_path = temp / "named-marker.json"
            named_marker_path.write_text(json.dumps(named_marker))
            page.set_input_files("#queueFile", str(named_marker_path))
            page.wait_for_function("document.getElementById('notice').textContent.includes('invalid numbered marker')")
            check("baseline marker labels cannot leak material names", snapshot(page)["doc"] == before)

            page.set_input_files("#queueFile", str(fixtures["baseline"]))
            page.wait_for_function("L2ReviewUI.getSnapshot().doc.queue.kind === 'baseline'")
            page.wait_for_function("document.querySelector('.review-image img').complete && document.querySelector('.review-image img').naturalWidth > 0")
            check("human baseline uses original RGB image", page.locator(".review-image img").get_attribute("src") == episode["frames"][0]["image"])
            check("baseline shows numbered marker", page.locator(".review-dot").inner_text() == "1")
            check("baseline contains no model answer or hidden GT", page.locator("#itemCard pre").count() == 0 and "Model response" not in page.locator("#itemCard").inner_text() and set(snapshot(page)["doc"]["queue"]["items"][0]) == set(base_item))
            page.select_option("#answerStatus", "not_determinable")
            page.click("#saveAnswer")
            check("uncertainty requires reason without assigning answer", snapshot(page)["doc"]["answers"][base_item["id"]] is None and "explain uncertainty" in page.locator("#notice").inner_text())
            page.fill("#reviewNotes", "Synthetic uncertainty explanation.")
            page.click("#saveAnswer")
            check("baseline uncertainty preserved distinctly", snapshot(page)["doc"]["answers"][base_item["id"]]["status"] == "not_determinable")
            _, baseline_report = export(page, "#downloadReport", "baseline-report.json")
            check("baseline remains unscored without frozen GT", "accuracy" not in baseline_report and baseline_report["benchmark_ready"] is False)

            page.set_input_files("#queueFile", str(fixtures["error"]))
            page.wait_for_function("L2ReviewUI.getSnapshot().doc.queue.kind === 'error'")
            categories = page.locator("#reviewCategory option").evaluate_all("els => els.map(e => e.value).filter(Boolean)")
            check("all requested primary error categories present", categories == ["prompt", "perception", "reasoning", "physics_application", "not_determinable"])
            page.select_option("#reviewCategory", "physics_application")
            page.fill("#reviewNotes", "Synthetic wrong-physical-rule example.")
            page.click("#saveAnswer")
            check("error coding answer saved", snapshot(page)["doc"]["answers"][base_item["id"]]["category"] == "physics_application")
            _, error_report = export(page, "#downloadReport", "error-report.json")
            group = error_report["groups"]["A / synthetic-not-a-real-model"]
            check("error report preserves per-family/model denominator", group["labeled"] == 1 and group["codes"]["physics_application"] == 1 and group["target_met"] is False)

            stale_a = open_page(context, "browser-stale-reviewer")
            load(stale_a, fixtures["matcher"])
            stale_a.select_option("#answerStatus", "answered")
            stale_a.check('[name="option"][value="A"]')
            stale_a.click("#saveAnswer")
            stale_b = open_page(context, "browser-stale-reviewer")
            load(stale_b, fixtures["matcher"])
            stale_a.wait_for_function("L2ReviewUI.getSnapshot().locked")
            check("stale-tab editing locked", stale_a.locator("#saveAnswer").is_disabled())
            _, stale_copy = export(stale_a, "#downloadReview", "stale-copy.json")
            check("stale tab can recover saved in-memory copy", stale_copy["answers"][base_item["id"]]["selected_options"] == ["A"])

            dirty_a = open_page(context, "browser-dirty-reviewer")
            load(dirty_a, fixtures["matcher"])
            dirty_a.select_option("#answerStatus", "answered")
            dirty_a.check('[name="option"][value="A"]')
            dirty_a.click("#saveAnswer")
            dirty_a.check('[name="option"][value="B"]')
            dirty_a.fill("#reviewNotes", "Unsaved synthetic correction; keep this text.")
            dirty_b = open_page(context, "browser-dirty-reviewer")
            load(dirty_b, fixtures["matcher"])
            dirty_a.wait_for_function("L2ReviewUI.getSnapshot().locked")
            check("stale event preserves the unsaved form while locking edits", dirty_a.locator("#saveAnswer").is_disabled() and dirty_a.is_checked('[name="option"][value="B"]') and dirty_a.locator("#reviewNotes").input_value() == "Unsaved synthetic correction; keep this text.")
            _, recovery = export(dirty_a, "#downloadReview", "unsaved-recovery.json")
            check("unsaved recovery distinguishes prior saved answer from unfinished form", recovery["schema"] == "blockmind_review_recovery_v1" and recovery["saved_review"]["answers"][base_item["id"]]["selected_options"] == ["A"] and recovery["unsaved_form"]["selected_options"] == ["B"] and recovery["unsaved_form"]["notes"] == "Unsaved synthetic correction; keep this text." and recovery["unsaved_form"]["item_id"] == base_item["id"])
            errors = dirty_a.evaluate("async doc => L2Review.validate(doc, await (await fetch('dataset.json')).json())", recovery)
            check("unfinished recovery bundle is not accepted as a completed review", bool(errors) and "Unsupported review annotation" in errors[0])

            quota = browser.new_context(accept_downloads=True)
            quota.add_init_script("Storage.prototype.setItem = function() { throw new DOMException('Synthetic quota test', 'QuotaExceededError'); };")
            quota_page = open_page(quota, "browser-quota-reviewer")
            load(quota_page, fixtures["matcher"])
            check("storage failure visibly warned", "storage is unavailable" in quota_page.locator("#notice").inner_text())
            quota_page.select_option("#answerStatus", "answered")
            quota_page.check('[name="option"][value="A"]')
            quota_page.click("#saveAnswer")
            _, quota_doc = export(quota_page, "#downloadReview", "quota-copy.json")
            check("quota failure still permits answer backup", quota_doc["answers"][base_item["id"]]["selected_options"] == ["A"])
            check("no JavaScript runtime errors", not page_errors, page_errors)
            check("no requests outside local server", not external_requests, external_requests)
            browser.close()
    except Exception as error:
        if not checks or checks[-1]["passed"]:
            checks.append({"name": "test runner", "passed": False, "detail": str(error)})
    finally:
        server.shutdown()
        server.server_close()

    report = {
        "schema": "blockmind_review_browser_validation_v1", "created_at": datetime.now(timezone.utc).isoformat(),
        "synthetic_fixtures_only": True, "source_annotations_modified": False,
        "passed": all(check["passed"] for check in checks), "checks": checks,
        "count": len(checks), "page_errors": page_errors, "external_requests": external_requests,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "checks": len(checks), "report": str(args.report)}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
