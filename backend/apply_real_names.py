"""Swap the demo dataset's STF-nn placeholders for real salesperson names.

Run deliberately, with the path to a real POS export:

    python apply_real_names.py "C:/path/to/real export.csv"

Why the names are not stored in this file: `backend/*.csv` is gitignored, so a
demo dataset carrying real names stays on this machine and in the project's own
database. Hard-coding the names into this script — which *is* tracked — would
copy them into git history permanently. So the list is read from the export you
point at, and nothing is committed.

Each placeholder is matched to a real person who actually worked at the same
branch, so the branch/salesperson pairings stay believable rather than random.
"""
from __future__ import annotations

import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.join(HERE, "Sales Profit Report - By Product Group DEMO 2025-2026.csv")

# Identifiers that are systems, not people, and should survive untouched.
NON_PERSON = {"POS"}


def primary_branch(df: pd.DataFrame) -> dict[str, str]:
    """The branch each salesperson sells at most often."""
    counts = df.groupby(["saleman_cd", "com_unit"]).size()
    return {
        person: group.idxmax()[1]
        for person, group in counts.groupby(level=0)
    }


def main(real_path: str) -> None:
    demo = pd.read_csv(DEMO, dtype=str)
    real = pd.read_csv(real_path, dtype=str)

    demo["saleman_cd"] = demo["saleman_cd"].str.strip()
    real["saleman_cd"] = real["saleman_cd"].str.strip()
    real["com_unit"] = real["com_unit"].str.strip()

    demo_home = primary_branch(demo)
    real_home = primary_branch(real)

    placeholders = sorted(p for p in demo["saleman_cd"].dropna().unique()
                          if p not in NON_PERSON)
    candidates = [n for n in real_home if n and n not in NON_PERSON]

    # Prefer a real person from the same branch; fall back to anyone unused so
    # every placeholder still ends up with a name.
    by_branch: dict[str, list[str]] = {}
    for name in sorted(candidates):
        by_branch.setdefault(real_home[name], []).append(name)

    used: set[str] = set()
    mapping: dict[str, str] = {}
    same_branch = 0

    for person in placeholders:
        branch = demo_home.get(person)
        pool = [n for n in by_branch.get(branch, []) if n not in used]
        if pool:
            pick = pool[0]
            same_branch += 1
        else:
            spare = [n for n in sorted(candidates) if n not in used]
            if not spare:
                raise SystemExit("ran out of real names to assign")
            pick = spare[0]
        used.add(pick)
        mapping[person] = pick

    demo["saleman_cd"] = demo["saleman_cd"].replace(mapping)
    demo.to_csv(DEMO, index=False)

    print(f"renamed {len(mapping)} salespeople "
          f"({same_branch} matched to their real branch)")
    print(f"kept unchanged: {', '.join(sorted(NON_PERSON))}")
    print(f"rows updated  : {len(demo):,}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
