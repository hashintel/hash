"""Command-line interface for the Wikidata miner.

W2a is layered so mining is decoupled from card formatting:

1. raw response cache (``--cache-dir``) — provenance of every API byte;
2. ``records.jsonl`` — structured, card-format-independent property records
   (plus ``entity_labels.json`` and provenance sidecars);
3. ``cards.jsonl`` — the versioned text projection of the records.

Commands:

- ``wikidata extract-properties`` (W2a): mine records via APIs, then render
  cards from them (single render code path shared with ``render-cards``).
- ``wikidata render-cards`` (W2a): re-render cards from an existing
  ``records.jsonl`` with zero transport/network involvement — changing the
  card format or token budget never requires re-extraction.
- ``wikidata entity-manifest`` (W2b): streamed per-entity manifest parquet.
- ``wikidata sampling-plan`` (W2b): P31-stratified sampling plan parquet.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.progress import NO_PROGRESS, ProgressReporter, StderrProgress


@click.group()
def main() -> None:
    """Wikidata miner (W2): relation cards + vec2slug sampling manifest."""


def _progress_reporter(quiet: bool) -> ProgressReporter:
    return NO_PROGRESS if quiet else StderrProgress()


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
@click.option("--quiet", is_flag=True, default=False, help="No progress on stderr.")
def extract_properties_command(
    config_path: str,
    out_dir: str,
    cache_dir: str | None,
    fixture_dir: str | None,
    quiet: bool,
) -> None:
    """W2a: mine relation cards (cards.jsonl + manifest + inventory)."""
    from atlas_tools.wikidata.cards import emit_cards
    from atlas_tools.wikidata.properties import extract_properties
    from atlas_tools.wikidata.transport import (
        FixtureTransport,
        RequestsTransport,
        Transport,
    )

    config = Config.load(config_path)
    transport: Transport
    if fixture_dir is not None:
        transport = FixtureTransport(fixture_dir)
    else:
        transport = RequestsTransport(policy=config.extraction.politeness)
    if cache_dir is not None:
        from atlas_tools.wikidata.cache import CachingTransport

        transport = CachingTransport(
            transport, cache_dir, snapshot_date=config.extraction.snapshot_date
        )
    progress = _progress_reporter(quiet)
    result = extract_properties(
        config,
        transport,
        checkpoint_path=Path(out_dir) / "checkpoint.json",
        progress=progress,
    )
    progress.note("emitting records + cards")
    paths = emit_cards(result, config, out_dir)
    click.echo(f"wrote {paths.records.records_jsonl} ({len(result.records)} records)")
    click.echo(f"wrote {paths.cards.cards_jsonl} ({len(result.records)} cards)")


@main.command("render-cards")
@click.option(
    "--records",
    "records_path",
    required=True,
    type=click.Path(exists=True),
    help="records.jsonl or the extract out dir containing it.",
)
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_dir", required=True, type=click.Path())
def render_cards_command(records_path: str, config_path: str, out_dir: str) -> None:
    """W2a: render cards.jsonl from records.jsonl (no network, ever)."""
    from atlas_tools.wikidata.cards import render_cards
    from atlas_tools.wikidata.records import load_records

    config = Config.load(config_path)
    record_set = load_records(records_path)
    paths = render_cards(record_set, config, out_dir)
    click.echo(f"wrote {paths.cards_jsonl} ({len(record_set.records)} cards)")


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
@click.option("--quiet", is_flag=True, default=False, help="No progress on stderr.")
def entity_manifest_command(
    config_path: str,
    input_path: str,
    out_path: str,
    checkpoint_dir: str,
    no_row_hash: bool,
    quiet: bool,
) -> None:
    """W2b: stream the dump into the per-entity manifest parquet."""
    from atlas_tools.wikidata.dump import extract_entities

    config = Config.load(config_path)
    progress = _progress_reporter(quiet)
    if input_path == "-":
        summary = extract_entities(
            sys.stdin.buffer,
            config=config,
            out_path=out_path,
            checkpoint_dir=checkpoint_dir,
            input_name="stdin",
            seekable=False,
            hash_rows=not no_row_hash,
            progress=progress,
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
                progress=progress,
            )
    click.echo(f"wrote {out_path} ({summary.rows} rows)")


@main.command("sampling-plan")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--input", "input_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_path", required=True, type=click.Path())
def sampling_plan_command(config_path: str, input_path: str, out_path: str) -> None:
    """W2b: emit the P31-stratified sampling plan parquet."""
    from atlas_tools.wikidata.manifest import build_sampling_plan

    config = Config.load(config_path)
    summary = build_sampling_plan(input_path, config=config, out_path=out_path)
    click.echo(f"wrote {out_path} ({summary.rows} rows)")


if __name__ == "__main__":
    main()
