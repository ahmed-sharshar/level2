#!/usr/bin/env python3
"""Check a simplified BLOCKMIND export without certifying benchmark readiness.

Uses the browser's exact guided-core.js; Python standard library only.
Node can be on PATH, supplied with --node, or available via Playwright.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from validate_export import SITE, node_binary, read_json


def validate_document(document, dataset, catalogue, node=None):
    code = r"""
const fs=require('fs'),guided=require(process.argv[1]);
const x=JSON.parse(fs.readFileSync(0,'utf8'));
const errors=guided.validate(x.document,x.dataset,x.catalogue);
const d=x.document, result={valid:errors.length===0,
  schema:d&&d.schema||null,build_id:d&&d.build_id||null,
  benchmark_ready:false,errors};
if(!errors.length){
  const counts=d.episodes.map((_,i)=>guided.status(d,i));
  result.episodes=counts.length;
  result.answered_basic_fields=counts.reduce((n,s)=>n+s.answered,0);
  result.total_basic_fields=counts.reduce((n,s)=>n+s.total,0);
  result.reviewed_steps=counts.reduce((n,s)=>n+Object.values(s.reviewed).filter(Boolean).length,0);
  result.skipped_episodes=counts.filter(s=>s.skipped).length;
}
result.note='Validity checks file structure and values only. Partial annotations are allowed. Answer counts include explicit Not sure. This does not certify geometry, independent agreement or benchmark ground truth.';
process.stdout.write(JSON.stringify(result));
"""
    payload = {"document": document, "dataset": dataset, "catalogue": catalogue}
    result = subprocess.run(
        [node_binary(node), "-e", code, str(SITE / "guided-core.js")],
        input=json.dumps(payload, allow_nan=False), text=True,
        capture_output=True, check=True, timeout=60,
    )
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--dataset", type=Path, default=SITE / "dataset.json")
    parser.add_argument("--catalogue", type=Path, default=SITE / "catalogue.json")
    parser.add_argument("--node")
    args = parser.parse_args()
    try:
        document, dataset, catalogue = map(read_json, (args.export, args.dataset, args.catalogue))
        result = validate_document(document, dataset, catalogue, args.node)
        print(json.dumps(result, indent=2))
        return 0 if result["valid"] else 1
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"valid": False, "benchmark_ready": False, "errors": [str(exc)]}, indent=2))
        return 2


if __name__ == "__main__":
    sys.exit(main())
