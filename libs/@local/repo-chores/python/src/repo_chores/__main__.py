"""Run repo-chores commands as a Python module or console script."""

import argparse
from collections.abc import Sequence

from repo_chores.constraints.cli import configure_parser


def main(argv: Sequence[str] | None = None) -> int:
    """Dispatch a repo-chores command."""
    parser = argparse.ArgumentParser(prog="repo-chores")
    commands = parser.add_subparsers(dest="subcommand", required=True)
    configure_parser(commands.add_parser("constraints", help="check Python workspace constraints"))
    args = parser.parse_args(argv)
    return args.command(args)


if __name__ == "__main__":
    raise SystemExit(main())
