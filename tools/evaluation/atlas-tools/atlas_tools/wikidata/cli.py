"""Command-line interface for the Wikidata miner.

The relation-card pipeline is layered so mining is decoupled from card
formatting:

1. raw response cache (``--cache-dir``): provenance of every API byte;
2. ``records.jsonl``: structured, card-format-independent property records
   (plus ``entity_labels.json`` and provenance sidecars);
3. ``cards.jsonl``: the versioned text projection of the records.

Commands:

- ``wikidata extract-properties``: mine records via the SPARQL and
  wbgetentities APIs, then render cards from them (single render code path
  shared with ``render-cards``).
- ``wikidata render-cards``: re-render cards from an existing
  ``records.jsonl`` with zero transport/network involvement; changing the
  card format or token budget never requires re-extraction.
- ``wikidata taxonomy``: pull the full P279 edge list from QLever into
  ``taxonomy.parquet``, the local subsumption oracle for the subject-type
  example filter (in-query subsumption times out on public endpoints).
- ``wikidata entity-manifest``: stream the JSON dump into the per-entity
  manifest parquet.
- ``wikidata sampling-plan``: emit the P31-stratified sampling plan parquet
  from the entity manifest.
"""

import sys
from pathlib import Path

import click

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.progress import NO_PROGRESS, ProgressReporter, StderrProgress


@click.group()
def main() -> None:
    """Wikidata miner: relation cards and the vec2slug sampling manifest."""


def _progress_reporter(*, quiet: bool) -> ProgressReporter:
    return NO_PROGRESS if quiet else StderrProgress()


@main.command("extract-properties")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_dir", required=True, type=click.Path())
@click.option("--cache-dir", default=None, type=click.Path())
@click.option(
    "--fixture-dir",
    default=None,
    type=click.Path(exists=True),
    help="Serve responses from committed fixtures instead of the network (offline testing).",
)
@click.option(
    "--taxonomy",
    "taxonomy_path",
    default=None,
    type=click.Path(exists=True),
    help="taxonomy.parquet from `wikidata taxonomy` (required while"
    " extraction.filter_examples_by_subject_type is enabled).",
)
@click.option("--quiet", is_flag=True, default=False, help="No progress on stderr.")
def extract_properties_command(
    *,
    config_path: str,
    out_dir: str,
    cache_dir: str | None,
    fixture_dir: str | None,
    taxonomy_path: str | None,
    quiet: bool,
) -> None:
    """Mine relation cards (cards.jsonl + manifest + inventory)."""
    from atlas_tools.wikidata.cards import emit_cards
    from atlas_tools.wikidata.properties import extract_properties
    from atlas_tools.wikidata.taxonomy import Taxonomy
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
    taxonomy = Taxonomy.load(taxonomy_path) if taxonomy_path is not None else None
    progress = _progress_reporter(quiet=quiet)
    result = extract_properties(
        config,
        transport,
        taxonomy=taxonomy,
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
    help="records.jsonl or the extraction output directory containing it.",
)
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_dir", required=True, type=click.Path())
def render_cards_command(records_path: str, config_path: str, out_dir: str) -> None:
    """Render cards.jsonl from records.jsonl (no network, ever)."""
    from atlas_tools.wikidata.cards import render_cards
    from atlas_tools.wikidata.records import load_records

    config = Config.load(config_path)
    record_set = load_records(records_path)
    paths = render_cards(record_set, config, out_dir)
    click.echo(f"wrote {paths.cards_jsonl} ({len(record_set.records)} cards)")


@main.command("taxonomy")
@click.option("--config", "config_path", required=True, type=click.Path(exists=True))
@click.option("--out", "out_path", required=True, type=click.Path())
@click.option("--checkpoint", "checkpoint_dir", required=True, type=click.Path())
@click.option("--quiet", is_flag=True, default=False, help="No progress on stderr.")
def taxonomy_command(*, config_path: str, out_path: str, checkpoint_dir: str, quiet: bool) -> None:
    """Pull the full P279 edge list into taxonomy.parquet (QLever)."""
    from atlas_tools.wikidata.taxonomy import extract_taxonomy
    from atlas_tools.wikidata.transport import RequestsTransport

    config = Config.load(config_path)
    # Deliberately the plain transport: each page body is ~48 MB of JSON and
    # the parquet + checkpoint parts are the persistence; a CachingTransport
    # here would roughly double local storage for zero benefit.
    transport = RequestsTransport(policy=config.extraction.politeness)
    summary = extract_taxonomy(
        transport,
        config=config,
        out_path=out_path,
        checkpoint_dir=checkpoint_dir,
        progress=_progress_reporter(quiet=quiet),
    )
    click.echo(f"wrote {out_path} ({summary.edges} edges, {summary.pages} pages)")


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
    *,
    config_path: str,
    input_path: str,
    out_path: str,
    checkpoint_dir: str,
    no_row_hash: bool,
    quiet: bool,
) -> None:
    """Stream the dump into the per-entity manifest parquet."""
    from atlas_tools.wikidata.dump import extract_entities

    config = Config.load(config_path)
    progress = _progress_reporter(quiet=quiet)
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
        with Path(input_path).open("rb") as stream:
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
    """Emit the P31-stratified sampling plan parquet."""
    from atlas_tools.wikidata.manifest import build_sampling_plan

    config = Config.load(config_path)
    summary = build_sampling_plan(input_path, config=config, out_path=out_path)
    click.echo(f"wrote {out_path} ({summary.rows} rows)")


if __name__ == "__main__":
    main()
