"""Command-line interface for the Wikidata miner.

The relation-card pipeline is layered so mining is decoupled from card
formatting:

1. raw response cache (``--cache-dir``): provenance of every API byte;
2. ``records.jsonl``: structured, card-format-independent property records
   (plus entity labels, direct lineage facts, and provenance sidecars);
3. ``cards.jsonl``: the versioned text projection of the records;
4. ``lineage.jsonl``: source lineage bound to the finalized leaf cards.

Commands:

- ``wikidata extract-properties``: mine records via the SPARQL and
  wbgetentities APIs, then render cards from them (single render code path
  shared with ``render-cards``).
- ``wikidata backfill-lineage``: bind lineage-rich records to an exact
  existing card leaf without rerendering the evaluated card text.
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
from typing import Literal, Self

from pydantic import BaseModel, DirectoryPath, Field, FilePath, model_validator
from pydantic_extra_types.path import ExistingPath
from pydantic_settings import CliSubCommand, CliToggleFlag

from atlas_tools.common.cli import echo, run_cli
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter, StderrProgress
from atlas_tools.wikidata.config import Config


def _progress_reporter(*, quiet: bool) -> ProgressReporter:
    return NO_PROGRESS if quiet else StderrProgress()


class ExtractPropertiesCommand(BaseModel):
    """Mine relation cards (cards.jsonl + manifest + inventory)."""

    config: FilePath
    out: Path
    cache_dir: Path | None = None
    cache_only: CliToggleFlag[bool] = Field(
        default=False,
        description="Fail rather than issue a request missing from the snapshot cache.",
    )
    fixture_dir: DirectoryPath | None = Field(
        default=None,
        description="Serve responses from committed fixtures instead of the network.",
    )
    taxonomy: FilePath | None = Field(
        default=None,
        description=(
            "taxonomy.parquet from `wikidata taxonomy`; required while subject-type filtering "
            "is enabled."
        ),
    )
    quiet: CliToggleFlag[bool] = Field(default=False, description="No progress on stderr.")

    @model_validator(mode="after")
    def check_cache_only(self) -> Self:
        if self.cache_only and self.cache_dir is None:
            raise ValueError("cache-only extraction requires --cache-dir")
        return self

    def cli_cmd(self) -> None:
        from atlas_tools.relation_cards.wikidata.api import emit_cards
        from atlas_tools.wikidata.properties.api import extract_properties
        from atlas_tools.wikidata.taxonomy import Taxonomy
        from atlas_tools.wikidata.transport import (
            FixtureTransport,
            RequestsTransport,
            Transport,
        )

        config = Config.load(self.config)
        transport: Transport
        if self.fixture_dir is not None:
            transport = FixtureTransport(self.fixture_dir)
        else:
            transport = RequestsTransport(policy=config.extraction.politeness)

        if self.cache_dir is not None:
            from atlas_tools.wikidata.cache import CachingTransport

            transport = CachingTransport(
                transport,
                self.cache_dir,
                snapshot_date=config.extraction.snapshot_date,
                read_only=self.cache_only,
            )

        taxonomy = Taxonomy.load(self.taxonomy) if self.taxonomy is not None else None
        progress = _progress_reporter(quiet=self.quiet)
        result = extract_properties(
            config,
            transport,
            taxonomy=taxonomy,
            checkpoint_path=self.out / "checkpoint.json",
            progress=progress,
        )

        progress.note("emitting records + cards")
        paths = emit_cards(result, config, self.out)

        echo(f"wrote {paths.records.records_jsonl} ({len(result.records)} records)")
        echo(f"wrote {paths.records.lineage_records} ({len(result.lineage)} direct-fact records)")
        echo(f"wrote {paths.cards.cards_jsonl} ({len(result.records)} records considered)")
        echo(f"wrote {paths.cards.manifest}")
        echo(f"wrote {paths.cards.lineage_jsonl} ({len(result.lineage)} lineage nodes)")
        echo(f"wrote {paths.cards.lineage_manifest}")


class RenderCardsCommand(BaseModel):
    """Render cards.jsonl from records.jsonl (no network, ever)."""

    records: ExistingPath = Field(
        description="records.jsonl or the extraction output directory containing it."
    )
    config: FilePath
    out: Path

    def cli_cmd(self) -> None:
        from atlas_tools.relation_cards.wikidata.api import render_cards
        from atlas_tools.wikidata.records import load_records

        config = Config.load(self.config)
        record_set = load_records(self.records)
        paths = render_cards(record_set, config, self.out)
        echo(f"wrote {paths.cards_jsonl} ({len(record_set.records)} records considered)")
        echo(f"wrote {paths.manifest}")
        echo(f"wrote {paths.lineage_jsonl} ({len(record_set.lineage)} lineage nodes)")
        echo(f"wrote {paths.lineage_manifest}")


class BackfillLineageCommand(BaseModel):
    """Bind lineage-rich records to exact existing Wikidata card bytes."""

    records: ExistingPath = Field(
        description="Schema-v4 records file or extraction directory containing direct lineage."
    )
    cards: DirectoryPath = Field(
        description="Exact evaluated leaf containing cards.jsonl and cards.manifest.json."
    )
    out: Path

    def cli_cmd(self) -> None:
        from atlas_tools.relation_cards.wikidata.api import backfill_lineage
        from atlas_tools.wikidata.records import load_records

        record_set = load_records(self.records)
        paths = backfill_lineage(
            record_set,
            cards_directory=self.cards,
            output_directory=self.out,
        )
        echo(f"wrote {paths.cards_jsonl} ({len(record_set.records)} exact evaluated cards)")
        echo(f"wrote {paths.manifest}")
        echo(f"wrote {paths.lineage_jsonl} ({len(record_set.lineage)} lineage nodes)")
        echo(f"wrote {paths.lineage_manifest}")


class TaxonomyCommand(BaseModel):
    """Pull the full P279 edge list into taxonomy.parquet (QLever)."""

    config: FilePath
    out: Path
    checkpoint: Path
    quiet: CliToggleFlag[bool] = Field(default=False, description="No progress on stderr.")

    def cli_cmd(self) -> None:
        from atlas_tools.wikidata.taxonomy import extract_taxonomy
        from atlas_tools.wikidata.transport import RequestsTransport

        config = Config.load(self.config)
        # Deliberately the plain transport: each page body is ~48 MB of JSON and
        # the parquet + checkpoint parts are the persistence; a CachingTransport
        # here would roughly double local storage for zero benefit.
        transport = RequestsTransport(policy=config.extraction.politeness)
        summary = extract_taxonomy(
            transport,
            config=config,
            out_path=self.out,
            checkpoint_dir=self.checkpoint,
            progress=_progress_reporter(quiet=self.quiet),
        )
        echo(f"wrote {self.out} ({summary.edges} edges, {summary.pages} pages)")


class EntityManifestCommand(BaseModel):
    """Stream the dump into the per-entity manifest parquet."""

    config: FilePath
    input: FilePath | Literal["-"] = Field(
        description="Dump JSON path, or '-' for stdin (production: download | bzip2 -dc |)."
    )
    out: Path
    checkpoint: Path
    row_hash: CliToggleFlag[bool] = True
    quiet: CliToggleFlag[bool] = Field(default=False, description="No progress on stderr.")

    def cli_cmd(self) -> None:
        from atlas_tools.wikidata.dump import extract_entities

        config = Config.load(self.config)
        progress = _progress_reporter(quiet=self.quiet)
        if self.input == "-":
            summary = extract_entities(
                sys.stdin.buffer,
                config=config,
                out_path=self.out,
                checkpoint_dir=self.checkpoint,
                input_name="stdin",
                seekable=False,
                hash_rows=self.row_hash,
                progress=progress,
            )
        else:
            input_path = self.input
            with input_path.open("rb") as stream:
                summary = extract_entities(
                    stream,
                    config=config,
                    out_path=self.out,
                    checkpoint_dir=self.checkpoint,
                    input_name=input_path.name,
                    seekable=True,
                    hash_rows=self.row_hash,
                    progress=progress,
                )
        echo(f"wrote {self.out} ({summary.rows} rows)")


class SamplingPlanCommand(BaseModel):
    """Emit the P31-stratified sampling plan parquet."""

    config: FilePath
    input: FilePath
    out: Path

    def cli_cmd(self) -> None:
        from atlas_tools.wikidata.manifest import build_sampling_plan

        config = Config.load(self.config)
        summary = build_sampling_plan(self.input, config=config, out_path=self.out)
        echo(f"wrote {self.out} ({summary.rows} rows)")


class WikidataCli(BaseModel):
    """Wikidata miner: relation cards and the vec2slug sampling manifest."""

    backfill_lineage: CliSubCommand[BackfillLineageCommand]
    entity_manifest: CliSubCommand[EntityManifestCommand]
    extract_properties: CliSubCommand[ExtractPropertiesCommand]
    render_cards: CliSubCommand[RenderCardsCommand]
    sampling_plan: CliSubCommand[SamplingPlanCommand]
    taxonomy: CliSubCommand[TaxonomyCommand]

    def cli_cmd(self) -> None:
        from pydantic_settings import CliApp

        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the Wikidata command-line application."""
    run_cli(WikidataCli, args)


if __name__ == "__main__":
    main()
