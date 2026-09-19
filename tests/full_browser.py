#!/usr/bin/env python3
"""Compatibility entry point for the full collector's compact browser suite."""
import argparse
from compact_browser import run

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', default='index.html')
    args = parser.parse_args()
    print(f'{run(args.entry)} compact full workflow checks passed.')
