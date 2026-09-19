#!/usr/bin/env python3
"""Validate a BLOCKMIND L2 layout/annotation with the browser's exact core.js.

No pip dependency. Requires Node (PATH, --node, or an existing Playwright driver).
Drafts may have unanswered cells, but malformed enums, IDs and provenance fail.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

SITE = Path(__file__).resolve().parents[1]


def node_binary(explicit=None):
    candidates = [explicit, os.environ.get("BLOCKMIND_NODE"), shutil.which("node"),
                  "/home/ahmed/miniconda3/envs/scannetpp/lib/python3.10/site-packages/playwright/driver/node",
                  "/home/ahmed/miniconda3/lib/python3.13/site-packages/playwright/driver/node"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    raise ValueError("Node runtime not found; install Node or pass --node /path/to/node")


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def read_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle, object_pairs_hook=unique_pairs,
                         parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON number: " + value)))


def validate_document(document, dataset, catalogue, require_complete=False, layout_draft=False, node=None):
    code = """
const fs=require('fs'),core=require(process.argv[1]),full=require(process.argv[2]);
const x=JSON.parse(fs.readFileSync(0,'utf8'));let errors;
try {
 if(x.document.schema==='blockmind_l2_annotations_v2') {
   errors=full.validate(x.document,x.dataset,x.catalogue,x.require_complete);
 } else if(x.document.schema==='blockmind_l2_tasks_v1') {
   errors=full.validateTasks(x.document,x.dataset,x.catalogue,x.require_complete);
 } else if(x.document.schema==='blockmind_l2_layout_v1') {
   errors=x.layout_draft?core.validateLayoutDraft(x.document,x.dataset):core.validateLayout(x.document,x.dataset);
   if(!x.layout_draft && x.document.layout_id!==core.layoutId(x.document))errors.push('layout_id: frozen identity missing/mismatch');
 } else errors=core.validateExport(x.document,x.dataset,x.catalogue,x.require_complete);
} catch(e){errors=['Malformed document: '+e.message];}
process.stdout.write(JSON.stringify(errors));
"""
    payload = {"document": document, "dataset": dataset, "catalogue": catalogue,
               "require_complete": require_complete, "layout_draft": layout_draft}
    completed = subprocess.run([node_binary(node), "-e", code, str(SITE / "core.js"), str(SITE / "full-core.js")],
                               input=json.dumps(payload, allow_nan=False), text=True,
                               capture_output=True, check=True)
    return json.loads(completed.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--dataset", type=Path, default=SITE / "dataset.json")
    parser.add_argument("--catalogue", type=Path, default=SITE / "catalogue.json")
    parser.add_argument("--require-complete", action="store_true")
    parser.add_argument("--layout-draft", action="store_true", help="Allow incomplete coordinator layout only")
    parser.add_argument("--node")
    args = parser.parse_args()
    try:
        document, dataset, catalogue = [read_json(p) for p in (args.export, args.dataset, args.catalogue)]
        if args.layout_draft and document.get("schema") != "blockmind_l2_layout_v1":
            raise ValueError("--layout-draft only applies to coordinator layouts")
        errors = validate_document(document, dataset, catalogue, args.require_complete, args.layout_draft, args.node)
        result = {"valid": not errors, "schema": document.get("schema"), "build_id": document.get("build_id"),
                  "layout_id": document.get("layout_id"), "task_id": document.get("task_id"),
                  "require_complete": args.require_complete, "errors": errors}
        print(json.dumps(result, indent=2))
        return 1 if errors else 0
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"valid": False, "errors": [str(exc)]}, indent=2))
        return 2


if __name__ == "__main__":
    sys.exit(main())
