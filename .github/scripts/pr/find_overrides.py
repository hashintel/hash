"""
Find the overrides for a given PR (if there are any).

Output can be directly used as the `--override` argument for `create.py`.

Usage:
    find_overrides.py <content>

Arguments:
    <content>  The content of the PR body.

Exit codes:
    0: Success
    1: Invalid arguments
"""

import sys

if len(sys.argv) != 2:
    print(__doc__.strip(), file=sys.stderr)
    sys.exit(1)

CONTENT = sys.argv[1]

sections = CONTENT.split("\n/override", 1)

if len(sections) == 1:
    sys.exit(0)

overrides = sections[1].splitlines()[0]
overrides = overrides.strip()
overrides = overrides.split(":")
overrides = [override.strip() for override in overrides]

flags = [f"--override={override}" for override in overrides]

print(" ".join(flags))
