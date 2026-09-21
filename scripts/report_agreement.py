#!/usr/bin/env python3
"""Render the consensus output as a readable kappa report; no GT adjudication."""
import argparse
import csv
import json
from pathlib import Path

CSV_COLUMNS = ['attribute', 'kappa', 'kappa_without_nd', 'compared', 'agreed', 'disagreed',
               'agreed_nd', 'known_compared', 'with_nd', 'unanswered', 'not_applicable', 'excluded',
               'workplan_target', 'target_result', 'known_only_target_result']


def target_for(attribute):
    if attribute in ('boundary.pane_transparency', 'boundary.observed_state') or attribute.endswith('.shelter'):
        return .8
    if '.reachable.' in attribute:
        return .6
    return None


def target_result(threshold, score):
    if threshold is None:
        return 'not specified'
    if score is None:
        return 'undefined'
    return 'met' if score >= threshold else 'not met'


def report_rows(data):
    rows = []
    for attribute, values in data['agreement_by_attribute'].items():
        threshold = target_for(attribute)
        if values['n_agreed'] + values['n_disagreement'] != values['n_compared']:
            raise ValueError(f'Inconsistent agreement denominator for {attribute}')
        rows.append(dict(attribute=attribute, kappa=values['cohen_kappa'],
                         kappa_without_nd=values['cohen_kappa_excluding_nd'],
                         compared=values['n_compared'], agreed=values['n_agreed'],
                         disagreed=values['n_disagreement'], agreed_nd=values['n_agreed_nd'],
                         known_compared=values['n_known_compared'], with_nd=values['n_with_nd'],
                         unanswered=values['n_unanswered'], not_applicable=values.get('n_not_applicable', 0),
                         excluded=values['n_excluded'], workplan_target=threshold,
                         target_result=target_result(threshold, values['cohen_kappa']),
                         known_only_target_result=target_result(threshold, values['cohen_kappa_excluding_nd'])))
    return rows


def drop_summary(data):
    fields = [field for ep in data['episodes'] for field in ep['fields'].values()]
    return {
        'annotation_field_cells_total': len(fields),
        'annotation_field_cells_dropped_from_known_gt': sum(field['drop_known_gt'] for field in fields),
        'consistency_only_field_cells': sum(field.get('consistency_only', False) for field in fields),
        'consistency_check_disagreements': sum(field.get('consistency_only', False) and field['state'] == 'disagreement' for field in fields),
        'field_cells_with_disagreement': sum(field['state'] == 'disagreement' for field in fields),
        'field_cells_agreed_not_determinable': sum(field['state'] == 'agreed_not_determinable' for field in fields),
        'field_cells_conditionally_not_applicable': sum(field['state'] == 'not_applicable' for field in fields),
        'episodes_blocked_from_known_gt': sum(ep['drop_episode_known_gt'] for ep in data['episodes']),
        'benchmark_mcq_items_generated': False,
        'benchmark_mcq_items_dropped': None,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('consensus',type=Path)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--csv',type=Path)
    args=parser.parse_args()
    if args.csv and args.out.resolve() == args.csv.resolve():
        raise ValueError('Markdown and CSV output paths must differ')
    for path in (args.out,args.csv):
        if path is not None and path.exists():raise FileExistsError(f'Refusing to overwrite {path}')
    data=json.loads(args.consensus.read_text())
    if data.get('schema')!='blockmind_l2_consensus_v1':raise ValueError('Expected blockmind_l2_consensus_v1')
    rows=report_rows(data)
    drops=drop_summary(data)
    fmt=lambda v:'—' if v is None else f'{v:.3f}'
    text=['# BLOCKMIND Level 2: independent annotation agreement','',
        'Annotators: '+', '.join(data['annotators']), '',
        'Build: `'+data['build_id']+'`', 'Layout: `'+data['layout_id']+'`','',
        '## Completeness','',
        *[f'- {k.replace("_"," ")}: {v}' for k,v in data['completeness'].items()], '',
        '## Dropped annotation units','',
        *[f'- {k.replace("_"," ")}: {v}' for k,v in drops.items() if not k.startswith('benchmark_mcq')], '',
        'These are annotation field cells and episode gates, not dropped benchmark MCQs. No item generator has run, so a dropped-MCQ count is not yet available. Conditional substrate blanks are reported as not applicable, not unfinished annotations.', '',
        '## Per-attribute agreement','',
        'The primary κ treats Not determinable as an explicit category. The second excludes comparisons where either rater answered Not determinable. Undefined κ means no comparisons or a degenerate marginal distribution; it is not a passed gate.', '',
        '| Attribute | κ | κ excluding ND | Compared | Known compared | Agreed | Disagreed | Agreed ND | Unanswered | Not applicable | Excluded | Target | Result | Known-only result |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|']
    for r in rows:
        text.append(f"| {r['attribute']} | {fmt(r['kappa'])} | {fmt(r['kappa_without_nd'])} | {r['compared']} | {r['known_compared']} | {r['agreed']} | {r['disagreed']} | {r['agreed_nd']} | {r['unanswered']} | {r['not_applicable']} | {r['excluded']} | {fmt(r['workplan_target'])} | {r['target_result']} | {r['known_only_target_result']} |")
    text+=['','## Interpretation','',
        '- Targets are from the supplied workplan: 0.8 for transparency/state/shelter and 0.6 for reachability. They are study targets, not universal certification standards.',
        '- The reachability target is applied to marked-surface sun/rain fields. No additional numeric target is assumed for boundary pathway channels. Both ND-inclusive and known-only target results are shown; passing a descriptive threshold does not establish correctness or replace the episode/field eligibility gates.',
        '- Only exact agreements are retained. There is no adjudication or automatic spelling/material synonym resolution. Disagreement remains visible in the consensus JSON.',
        '- Opening passage selections are consistency checks only, even when both annotators agree. They are not benchmark answers. Answer derivation requires an approved rule applied to agreed boundary facts; disputed inputs/checks exclude dependent items.',
        '- Indoor-point after-crossing visibility uses exact set agreement. A frame-set disagreement excludes that point visibility item, not unrelated agreed material facts. None is an explicit empty visible set; Not sure remains uncertainty.',
        '- Repeated frames/markers from the same episode are correlated. These descriptive κ values and counts are not confidence intervals or independent-scene sample counts.',
        '- Agreed uncertainty is available for reviewed cannot-determine items, not treated as a negative pathway or known material.',
        '- Family annotation coverage is not MCQ ground truth. Family C still requires the reviewed frozen VHC/allowed-pairs table; class comparisons require reviewed mappings and rules.',
        '- Matching independent IDs alone cannot prove that the collection was blinded. Preserve the collection procedure and raw exports.']
    with args.out.open('x', encoding='utf-8') as handle:
        handle.write('\n'.join(text)+'\n')
    if args.csv:
        with args.csv.open('x',newline='',encoding='utf-8') as handle:
            writer=csv.DictWriter(handle,fieldnames=CSV_COLUMNS);writer.writeheader();writer.writerows(rows)
    print(json.dumps(dict(report=str(args.out),attributes=len(rows),
                         targets_met=sum(r['target_result']=='met' for r in rows),
                         targets_not_met=sum(r['target_result']=='not met' for r in rows),
                         targets_undefined=sum(r['target_result']=='undefined' for r in rows),
                         target_not_specified=sum(r['target_result']=='not specified' for r in rows),
                         drop_summary=drops),indent=2))


if __name__=='__main__':main()
