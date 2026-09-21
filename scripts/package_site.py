#!/usr/bin/env python3
"""Package only the immutable dataset, source code, docs, and test evidence.

Never include browser drafts, arbitrary annotation exports, .git, caches, or
credentials. The output must be outside this site and must not already exist.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from build_boundary_measurements import build as build_boundary_measurements
from verify_redpoint_sources import verify as verify_redpoint_sources

SITE = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    "index.html", "app.js", "core.js", "styles.css", "dataset.json", "catalogue.json",
    ".nojekyll", ".gitignore", "README.md", "CONTRACT.md", "ANNOTATION_GUIDE.md",
    "PROPOSAL_COVERAGE.md", "VALIDATION.md",
    "advanced.html", "guided.html", "guided.js", "guided.css", "guided-core.js", "GUIDED_MODE.md",
    "ADVANCED_GUIDE.md",
    "full.html", "full.js", "full.css", "full-core.js", "collection-tasks.json",
    "setup.html", "setup.js", "setup.css", "FULL_WORKFLOW.md", "RESEARCH_SETUP.md",
    "review.html", "review.js", "review-core.js", "RESEARCH_REVIEW.md",
    "compact-core.js", "COMPACT_WORKFLOW.md", "boundary-measurements.json", "BOUNDARY_QUESTIONS.md",
    "redpoint-core.js", "instance-labels.js", "RED_POINTS.md",
    "SUN_RAIN.md",
    "COLLECTION_CHECKS.md",
    "COLLECTION_RELEASE.md", "data/provisional_collection_preparation.json",
}
VALIDATION_FILES = {
    "collection_release_summary.json",
    "browser_test_report.json", "scientific_review.md", "bundle_check.json",
    "welcome-desktop.png", "coordinator-desktop.png", "annotator-surfaces-desktop.png",
    "annotator-mobile.png",
    "guided-desktop.png", "guided-mobile.png", "guided_browser_report.json",
    "guided-point-desktop.png",
    "full-desktop.png", "full-mobile.png", "full_browser_report.json",
    "setup_browser_report.json", "review_browser_report.json",
    "full_bundle_check.json",
    "compact_browser_report.json", "compact_conservation.json",
    "compact-desktop.png", "compact-mobile.png", "compact-exposure.png", "compact-exposure-mobile.png",
    "boundary_browser_report.json", "boundary-desktop.png", "boundary-mobile.png",
    "redpoint_browser_report.json", "redpoint-desktop.png", "redpoint-mobile.png", "redpoint_source_audit.json",
    "sunrain_browser_report.json", "sunrain-desktop.png", "sunrain-mobile.png",
    "collection_checks_browser_report.json", "checks-desktop.png", "checks-mobile.png",
}


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    target = args.out.resolve()
    if target.is_relative_to(SITE) or target.exists():
        parser.error("Output must be a new file outside the website directory.")
    manifest = target.with_suffix(target.suffix + ".manifest.json")
    if manifest.exists():
        parser.error("Archive manifest already exists; choose a new archive path.")
    if json.loads((SITE / "boundary-measurements.json").read_text()) != build_boundary_measurements(SITE):
        parser.error("Boundary measurement supplement differs from the frozen mesh-instance source.")
    # Earlier delivery reports remain historical evidence. Re-check the actual
    # currently packaged targets instead of requiring an old task-file hash.
    source_audit = verify_redpoint_sources(SITE)
    if source_audit.get("passed") is not True or any(
            source_audit.get("input_sha256", {}).get(name) != sha(SITE / name)
            for name in ("dataset.json", "catalogue.json", "collection-tasks.json")):
        parser.error("Red-point source audit failed or belongs to a different dataset/task package.")
    for name in ("collection_checks_browser_report.json", "sunrain_browser_report.json", "redpoint_browser_report.json", "boundary_browser_report.json", "compact_browser_report.json", "full_browser_report.json", "setup_browser_report.json", "review_browser_report.json",
                 "guided_browser_report.json", "browser_test_report.json"):
        evidence = json.loads((SITE / "validation" / name).read_text())
        checks = evidence.get("checks", [])
        passed = evidence.get("passed")
        if (not checks or passed is False or
                (type(passed) is int and passed != len(checks)) or
                any(isinstance(item, dict) and item.get("passed") is not True for item in checks)):
            parser.error(f"Incomplete or failed browser evidence: {name}")
        for key in ("javascript_errors", "page_errors", "http_failures", "failed_requests", "failed_http_responses", "external_requests"):
            if evidence.get(key):
                parser.error(f"Unexpected browser diagnostics in {name}: {key}")
    inventory = json.loads((SITE / "data/asset_inventory.json").read_text())
    names = set(inventory["sha256"]) | ROOT_FILES | {"data/asset_inventory.json"}
    for dirname in ("scripts", "tests"):
        names.update(path.relative_to(SITE).as_posix() for path in (SITE / dirname).iterdir()
                     if path.is_file() and path.suffix in {".py", ".js", ".cjs"})
    names.update("validation/" + name for name in VALIDATION_FILES)
    paths = []
    for name in sorted(names):
        path = SITE / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(SITE):
            parser.error(f"Missing or unsafe package member: {name}")
        expected = inventory["sha256"].get(name)
        if expected and sha(path) != expected:
            parser.error(f"Dataset integrity failure: {name}")
        paths.append((name, path))
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, path in paths:
            archive.write(path, f"{SITE.name}/{name}")
    with zipfile.ZipFile(target) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise RuntimeError(f"ZIP CRC failed: {corrupt}")
    summary = {
        "archive": target.name, "sha256": sha(target), "bytes": target.stat().st_size,
        "file_count": len(paths), "build_id": inventory["build_id"],
        "zip_crc_check": "passed", "human_annotation_exports_included": False,
        "scope": "Static website, all frozen reference assets, code, guides, synthetic test evidence",
    }
    with manifest.open("x", encoding="utf-8") as stream:
        json.dump(summary, stream, indent=2)
        stream.write("\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
