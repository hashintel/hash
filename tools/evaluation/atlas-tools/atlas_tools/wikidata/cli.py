"""Command-line interface for the Wikidata miner.

Commands:

- ``wikidata extract-properties`` (W2a): relation cards via APIs, no dump.
- ``wikidata entity-manifest`` (W2b): streamed per-entity manifest parquet.
- ``wikidata sampling-plan`` (W2b): P31-stratified sampling plan parquet.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from atlas_tools.wikidata.config import Config


@click.group()
def main() -> None:
    """Wikidata miner (W2): relation cards + vec2slug sampling manifest."""


@main.command("extract-properties")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_dir", required=True, type=click.Path())
@click.option("--cache-dir", default=None, type=click.Path())
@click.option(
    "--fixture-dir",
    default=None,
    type=click.Path(exists=True),
    help="Serve responses from committed fixtures instead of the network"
    " (offline testing).",
)
def extract_properties_cmd(
    config_path: str, out_dir: str, cache_dir: str | None, fixture_dir: str | None
) -> None:
    """W2a: mine relation cards (cards.jsonl + manifest + inventory)."""
    from atlas_tools.wikidata.cards import emit_cards
    from atlas_tools.wikidata.properties import extract_properties
    from atlas_tools.wikidata.transport import FixtureTransport, RequestsTransport

    config = Config.load(config_path)
    if fixture_dir is not None:
        transport = FixtureTransport(fixture_dir)
    else:
        transport = RequestsTransport(
            rate_limit_per_sec=config.rate_limit_per_sec,
            max_retries=config.max_retries,
            backoff_base_seconds=config.backoff_base_seconds,
        )
    if cache_dir is not None:
        from atlas_tools.wikidata.cache import CachingTransport

        transport = CachingTransport(
            transport, cache_dir, snapshot_date=config.snapshot_date
        )
    result = extract_properties(
        config, transport, checkpoint_path=Path(out_dir) / "checkpoint.json"
    )
    paths = emit_cards(result, config, out_dir)
    click.echo(f"wrote {paths['cards']} ({len(result.records)} cards)")


@main.command("entity-manifest")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option(
    "--input",
    "input_path",
    required=True,
    help="Dump JSON path, or '-' for stdin (production: download | bzip2 -dc |).",
)
@click.option("--out", "out_path", required=True, type=click.Path())
@click.option("--checkpoint", "checkpoint_dir", required=True, type=click.Path())
@click.option("--no-row-hash", is_flag=True, default=False)
def entity_manifest_cmd(
    config_path: str,
    input_path: str,
    out_path: str,
    checkpoint_dir: str,
    no_row_hash: bool,
) -> None:
    """W2b: stream the dump into the per-entity manifest parquet."""
    from atlas_tools.wikidata.dump import extract_entities

    config = Config.load(config_path)
    if input_path == "-":
        summary = extract_entities(
            sys.stdin.buffer,
            config=config,
            out_path=out_path,
            checkpoint_dir=checkpoint_dir,
            input_name="stdin",
            seekable=False,
            hash_rows=not no_row_hash,
        )
    else:
        with open(input_path, "rb") as stream:
            summary = extract_entities(
                stream,
                config=config,
                out_path=out_path,
                checkpoint_dir=checkpoint_dir,
                input_name=Path(input_path).name,
                seekable=True,
                hash_rows=not no_row_hash,
            )
    click.echo(f"wrote {out_path} ({summary['rows']} rows)")


@main.command("sampling-plan")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--input", "input_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_path", required=True, type=click.Path())
def sampling_plan_cmd(config_path: str, input_path: str, out_path: str) -> None:
    """W2b: emit the P31-stratified sampling plan parquet."""
    from atlas_tools.wikidata.manifest import build_sampling_plan

    config = Config.load(config_path)
    summary = build_sampling_plan(input_path, config=config, out_path=out_path)
    click.echo(f"wrote {out_path} ({summary['rows']} rows)")


if __name__ == "__main__":
    main()
