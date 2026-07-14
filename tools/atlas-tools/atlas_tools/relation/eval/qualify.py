"""Pilot qualification: the full ladder on a small deck plus gold scoring.

This is the one entry point allowed to run an unfrozen panel. It executes the
complete ladder over the pilot deck, aggregates soft labels, and emits the
per-judge qualification table (gold agreement, schema compliance, latency,
cost) that informs the human pruning decision. That decision is recorded by
freezing judges.yaml (``panel.frozen: true`` with a documented pruning floor);
corpus execution refuses to start until then.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Literal

from pydantic import NonNegativeInt, PositiveInt

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_file
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.aggregate import aggregate_soft_labels
from atlas_tools.relation.eval.artifacts import LadderPaths
from atlas_tools.relation.eval.contract import LoadedRunConfig
from atlas_tools.relation.eval.journal import load_jsonl
from atlas_tools.relation.eval.ladder_report import JudgeHealth, judge_health, load_gold
from atlas_tools.relation.eval.run import run_ladder
from atlas_tools.relation.eval.schema import LadderManifest, StrictModel, VoteRow
from atlas_tools.relation.eval.transport import (
    CompletionTransport,
    CompletionTransportFactory,
)

QUALIFICATION_SCHEMA_VERSION = 1


class QualificationTable(StrictModel):
    """The pilot's machine output: per-judge health over the gold deck."""

    schema_version: Literal[1] = QUALIFICATION_SCHEMA_VERSION
    panel_version: PositiveInt
    panel_frozen: bool
    pilot_cards: PositiveInt
    gold_cards: NonNegativeInt
    judges: list[JudgeHealth]


class QualificationDetails(StrictModel):
    schema_version: PositiveInt = QUALIFICATION_SCHEMA_VERSION


QualificationProvenance = Provenance[QualificationDetails]


@dataclass(frozen=True)
class QualificationResult:
    run_paths: LadderPaths
    soft_labels_parquet: Path
    qualification_json: Path
    qualification_md: Path
    table: QualificationTable


def _rate(value: float | None) -> str:
    return "undefined" if value is None else f"{value:.4f}"


def render_qualification_markdown(table: QualificationTable) -> str:
    lines = [
        "# Ladder pilot qualification",
        "",
        f"- Panel version: {table.panel_version} "
        f"({'frozen' if table.panel_frozen else 'NOT frozen'}).",
        f"- Pilot cards: {table.pilot_cards}; gold cards: {table.gold_cards}.",
        "",
        "| judge | rung | votes | schema compliance | repair rate | gold votes "
        "| gold agreement | median latency (s) | known cost (USD) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {judge.family_id} | {judge.rung} | {judge.votes} "
        f"| {_rate(judge.schema_compliance)} | {_rate(judge.parse_repair_rate)} "
        f"| {judge.gold_votes} | {_rate(judge.gold_agreement)} "
        f"| {_rate(judge.median_latency_seconds)} | {judge.known_cost_usd:.6f} |"
        for judge in table.judges
    )
    lines.extend(
        [
            "",
            "Record the pruning decision by freezing judges.yaml: set "
            "`panel.frozen: true`, bump `panel.version`, and document the floor in "
            "`panel.pruning_floor`. The corpus run refuses an unfrozen panel.",
            "",
        ]
    )
    return "\n".join(lines)


def run_qualification(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    gold_path: PathLike,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> QualificationResult:
    """Run the full ladder on the pilot deck and emit the qualification table."""
    config = loaded_config.ladder()
    output = Path(out_dir)
    run_dir = output / "run"
    paths = run_ladder(
        cards_dir=cards_dir,
        out_dir=run_dir,
        loaded_config=loaded_config,
        transport_factory=transport_factory,
        transport=transport,
        progress=progress,
        allow_unfrozen_panel=True,
    )
    aggregate = aggregate_soft_labels(
        run_dir=run_dir,
        cards_dir=cards_dir,
        loaded_config=loaded_config,
        out_path=output / "soft-labels.parquet",
    )
    manifest = LadderManifest.model_validate_json(paths.manifest_json.read_bytes())
    votes = load_jsonl(paths.votes_jsonl, VoteRow)
    gold = load_gold(Path(gold_path))
    table = QualificationTable(
        panel_version=config.panel.version,
        panel_frozen=config.panel.frozen,
        pilot_cards=manifest.eligible_cards,
        gold_cards=len(gold),
        judges=judge_health(
            votes=votes,
            judge_rungs=manifest.judge_rungs,
            gold_by_relation={row.relation_id: row for row in gold},
        ),
    )
    qualification_json = output / "qualification.json"
    qualification_md = output / "qualification.md"
    qualification_json.write_bytes(canonical_json_bytes(table.model_dump(mode="json")) + b"\n")
    qualification_md.write_text(render_qualification_markdown(table), encoding="utf-8")
    QualificationProvenance.make(
        producer="relation.ladder-qualify",
        input_hashes={
            "gold.jsonl": sha256_file(Path(gold_path)),
            "votes.jsonl": manifest.source_hashes["votes.jsonl"],
        },
        content_hashes={
            "qualification.json": sha256_file(qualification_json),
            "qualification.md": sha256_file(qualification_md),
        },
        details=QualificationDetails(),
    ).write(output / "qualification.meta.json")
    return QualificationResult(
        run_paths=paths,
        soft_labels_parquet=aggregate.soft_labels_parquet,
        qualification_json=qualification_json,
        qualification_md=qualification_md,
        table=table,
    )
