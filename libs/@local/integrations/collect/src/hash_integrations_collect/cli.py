"""`hash-integrations-collect`: collects a source once, or on an interval.

Every setting comes from dlt's configuration, in `.dlt/config.toml` and `.dlt/secrets.toml` of the
folder `--config-dir` names, or of the working folder:

- `[integration]`: the integration the tables are collected for, as `IntegrationConfiguration`
- `[sources.<source>]`: the source's settings, such as `[sources.github]`
- `[destination.filesystem.credentials]`: the bucket's credentials, which belong in `secrets.toml`

dlt also reads each setting from an environment variable, such as `INTEGRATION__BUCKET_URI`, which
takes precedence over the files.
"""

import argparse
import os
import sys
import time
from collections.abc import Callable
from pathlib import Path
from uuid import UUID

from dlt.common.configuration import configspec, resolve_configuration
from dlt.common.configuration.specs import BaseConfiguration
from dlt.extract import DltSource

from hash_integrations_collect.collect import Integration, collect
from hash_integrations_collect.files import JsonTable, json_source
from hash_integrations_collect.github import github_source


@configspec
class IntegrationConfiguration(BaseConfiguration):
    """The integration a collector collects for, in the section `[integration]`."""

    web: str | None = None
    """The web the integration writes to."""
    connector: str | None = None
    """The connector the integration's definition names."""
    bucket_uri: str | None = None
    """The ledger's bucket, as `s3://bucket/prefix` or `file:///path`."""
    every: int = 300
    """The seconds between two collections."""

    def integration(self) -> Integration:
        """Return the integration, or exit if a setting it needs is missing."""
        missing = [
            name for name in ("web", "connector", "bucket_uri") if getattr(self, name) is None
        ]
        if missing or self.web is None or self.connector is None:
            sys.exit(f"`[integration]` of dlt's configuration lacks {', '.join(missing)}")
        return Integration(web=UUID(self.web), connector=self.connector)


def _assignments(values: list[str], option: str) -> dict[str, str]:
    """Read `<table>=<value>` arguments."""
    assignments = {}
    for value in values:
        table, separator, rest = value.partition("=")
        if not separator:
            sys.exit(f"{option} expects `<table>=<value>`, not `{value}`")
        assignments[table] = rest
    return assignments


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hash-integrations-collect")
    parser.add_argument(
        "--config-dir",
        type=Path,
        help="the folder whose `.dlt/config.toml` and `.dlt/secrets.toml` configure the collector",
    )
    parser.add_argument(
        "--once", action="store_true", help="collect once, and fail if the collection fails"
    )
    commands = parser.add_subparsers(dest="source", required=True)
    commands.add_parser(
        "github",
        help="the issues and pull requests of a GitHub repository, as `[sources.github]` configures",
    )
    files = commands.add_parser("json", help="tables given as JSON files of rows")
    files.add_argument(
        "--table",
        action="append",
        required=True,
        help="a table and the file of its rows, as `<table>=<path>`",
    )
    files.add_argument(
        "--key",
        action="append",
        required=True,
        help="a table's primary key, as `<table>=<column>[,<column>…]`",
    )
    return parser


def _sources(arguments: argparse.Namespace) -> Callable[[], DltSource]:
    """Return a function that builds the source the arguments name, once per collection."""
    if arguments.source == "github":
        return github_source
    files = _assignments(arguments.table, "--table")
    keys = _assignments(arguments.key, "--key")
    tables = {
        table: JsonTable(file=Path(file).resolve(), primary_key=keys[table].split(","))
        for table, file in files.items()
    }
    return lambda: json_source(tables)


def main() -> None:
    arguments = _parser().parse_args()
    if arguments.config_dir is not None:
        # dlt reads the folder when it first builds its configuration, which is below.
        os.environ["DLT_PROJECT_DIR"] = str(arguments.config_dir.resolve())
    settings = resolve_configuration(IntegrationConfiguration(), sections=("integration",))
    integration = settings.integration()
    bucket_uri = str(settings.bucket_uri)
    source = _sources(arguments)
    while True:
        try:
            tables = collect(integration, bucket_uri, source())
            print(", ".join(f"{table.name} at version {table.version}" for table in tables))
        except Exception as error:
            if arguments.once:
                raise
            print(f"the collection failed, trying again in {settings.every} seconds: {error!r}")
        if arguments.once:
            return
        time.sleep(settings.every)
