# ruff: file-ignore[implicit-namespace-package]
# A standalone script, not part of a package.
"""Recomputes the size table of the spec from the source tables of the milestone files.

A source table row ends in `| moved | 40 |`, `| adapted | 40 |` or `| new | 40 |`.
For each milestone the rows are summed, and the sums are compared with the
milestone's own Size table and with the table in `README.md`.

Run it from any folder:

    python3 sizes.py

It prints the table and exits with status 1 if a number does not match.
"""

import re
import sys
from pathlib import Path

SPEC = Path(__file__).parent
KINDS = ("moved", "adapted", "new")

SOURCE_ROW = re.compile(r"\|\s*(moved|adapted|new)\s*\|\s*([\d,]+)\s*\|\s*$")
SIZE_ROW = re.compile(r"^\|\s*\**(Moved|Adapted|New|Total)\**\s*\|\s*\**([\d,]+)\**\s*\|")
README_ROW = re.compile(
    r"^\|\s*(\d+)\s*\|.*?\|\s*\**([\d,]+)\**\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*\d+%\s*\|"
)
README_TOTAL = re.compile(
    r"^\|\s*\|\s*\*\*All\*\*.*?\|\s*\**([\d,]+)\**\s*\|\s*\**([\d,]+)\**\s*\|\s*\**([\d,]+)\**\s*\|\s*\**([\d,]+)\**\s*\|"
)


def number(text: str) -> int:
    return int(text.replace(",", ""))


def milestone(path: Path) -> tuple[dict[str, int], dict[str, int]]:
    """Return the sums of a milestone's source table and the numbers of its Size table."""
    summed = dict.fromkeys(KINDS, 0)
    stated = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if match := SOURCE_ROW.search(line):
            summed[match[1]] += number(match[2])
        elif match := SIZE_ROW.match(line):
            stated[match[1].lower()] = number(match[2])
    return summed, stated


def readme() -> tuple[dict[int, tuple[int, ...]], tuple[int, ...]]:
    """Return the rows of the table in `README.md` by milestone number, and its last row."""
    rows, total = {}, ()
    for line in (SPEC / "README.md").read_text(encoding="utf-8").splitlines():
        if match := README_ROW.match(line):
            rows[int(match[1])] = tuple(number(match[i]) for i in (2, 3, 4, 5))
        elif match := README_TOTAL.match(line):
            total = tuple(number(match[i]) for i in (1, 2, 3, 4))
    return rows, total


def main() -> int:
    """Print the size table and return 1 if a number does not match."""
    out = sys.stdout.write
    problems = []
    readme_rows, readme_total = readme()
    all_sums = dict.fromkeys(KINDS, 0)

    out(
        f"{'#':>2}  {'file':<34} {'total':>6} {'moved':>6} {'adapted':>8} {'new':>6} {'reused':>7}\n"
    )
    for path in sorted(SPEC.glob("[0-9][0-9]-*.md")):
        index = int(path.name[:2])
        summed, stated = milestone(path)
        total = sum(summed.values())
        reused = round(100 * (summed["moved"] + summed["adapted"]) / total) if total else 0
        out(
            f"{index:>2}  {path.name:<34} {total:>6,} {summed['moved']:>6,}"
            f" {summed['adapted']:>8,} {summed['new']:>6,} {reused:>6}%\n"
        )
        for kind in KINDS:
            all_sums[kind] += summed[kind]
            if stated.get(kind) != summed[kind]:
                problems.append(
                    f"{path.name}: Size table has {kind} {stated.get(kind)}, source table sums to {summed[kind]}"
                )
        if stated.get("total") != total:
            problems.append(
                f"{path.name}: Size table has total {stated.get('total')}, source table sums to {total}"
            )
        expected = (total, summed["moved"], summed["adapted"], summed["new"])
        if readme_rows.get(index) != expected:
            problems.append(
                f"README.md row {index}: has {readme_rows.get(index)}, source table gives {expected}"
            )

    total = sum(all_sums.values())
    reused = round(100 * (all_sums["moved"] + all_sums["adapted"]) / total)
    out(
        f"{'':>2}  {'all':<34} {total:>6,} {all_sums['moved']:>6,}"
        f" {all_sums['adapted']:>8,} {all_sums['new']:>6,} {reused:>6}%\n"
    )
    expected = (total, all_sums["moved"], all_sums["adapted"], all_sums["new"])
    if readme_total != expected:
        problems.append(f"README.md last row: has {readme_total}, the milestones sum to {expected}")

    for problem in problems:
        out(f"MISMATCH  {problem}\n")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
