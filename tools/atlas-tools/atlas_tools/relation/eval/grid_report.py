"""Grid deliverables and blocking acceptance gates over a completed run.

Deliverables: per-card Dirichlet posteriors (alpha = 1.0, admitted
configuration only), the obligatory coincident review queue (every card with
any C vote, full vote record attached), the nomination queue (top posterior
entropy decile), and the dissent ledger carried forward from the pilot's
qualification evidence.

Gates, blocking and in order: baseline coverage after reconciliation, zero
kept routing violations, the holdout drift canary (every family must still
pass the qualification gate on its grid holdout votes — a pilot-passing
family failing here means the provider changed something under the pinned
name), per-family abstention under five percent, and cost within the
configured envelope.
"""

from collections import defaultdict
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Literal

from pydantic import NonNegativeFloat, NonNegativeInt, PositiveInt, ValidationError

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_file
from atlas_tools.relation.eval.artifacts import CompletedGridRun, load_completed_grid
from atlas_tools.relation.eval.contract import LoadedRunConfig
from atlas_tools.relation.eval.grid import (
    BASELINE_REPEAT_INDEX,
    card_posterior,
    coincident_queue,
    nomination_queue,
)
from atlas_tools.relation.eval.journal import jsonl_bytes
from atlas_tools.relation.eval.prompt import HOLDOUT, accepted_holdout_verdicts
from atlas_tools.relation.eval.schema import (
    AnalysisDecisions,
    BundleId,
    CardPosterior,
    CoincidentQueueRow,
    DissentLedgerRow,
    JudgeFamilyId,
    NominationSeed,
    Probability,
    StrictModel,
)
from atlas_tools.relation.eval.transport import matches_pinned_route
from atlas_tools.relation_cards.common.cards import RelationId

GRID_REPORT_SCHEMA_VERSION = 1
ABSTENTION_CEILING = 0.05
HOLDOUT_PASS_MINIMUM = 5
_PROBE_RELATIONS: tuple[str, str] = ("wikidata:P1382", "wikidata:P2634")
_DISSENT_MISS_MINIMUM = 2

type GateName = Literal[
    "coverage",
    "routing",
    "holdout-drift",
    "abstention",
    "cost-envelope",
]


class GateResult(StrictModel):
    gate: GateName
    passed: bool
    detail: str


class HoldoutDrift(StrictModel):
    """One family's grid-time re-qualification over the six holdout anchors."""

    family_id: JudgeFamilyId
    correct: NonNegativeInt
    total: PositiveInt
    probes_correct: bool
    passed: bool
    verdicts: dict[RelationId, str]


class FamilyAbstention(StrictModel):
    family_id: JudgeFamilyId
    votes: PositiveInt
    abstentions: NonNegativeInt
    rate: Probability


class GridGatesReport(StrictModel):
    """The machine acceptance-gate report; any failed gate blocks the handoff."""

    schema_version: Literal[1] = GRID_REPORT_SCHEMA_VERSION
    gates: list[GateResult]
    holdout_drift: list[HoldoutDrift]
    abstention: list[FamilyAbstention]
    routing_violation_raw_count: NonNegativeInt
    total_known_cost_usd: NonNegativeFloat
    cost_ceiling_usd: NonNegativeFloat | None

    @property
    def all_passed(self) -> bool:
        return all(gate.passed for gate in self.gates)


class GridReportDetails(StrictModel):
    schema_version: PositiveInt = GRID_REPORT_SCHEMA_VERSION


GridReportProvenance = Provenance[GridReportDetails]


@dataclass(frozen=True)
class GridDeliverables:
    posteriors_jsonl: Path
    coincident_queue_jsonl: Path
    nomination_queue_jsonl: Path
    dissent_ledger_jsonl: Path
    gates_json: Path
    report_md: Path
    gates: GridGatesReport
    posteriors: tuple[CardPosterior, ...]
    coincident: tuple[CoincidentQueueRow, ...]
    nominations: tuple[NominationSeed, ...]
    dissent: tuple[DissentLedgerRow, ...]


def _holdout_drift(run: CompletedGridRun) -> list[HoldoutDrift]:
    """Re-run the qualification gate on each family's grid holdout baseline votes."""
    holdout_ids = [relation_id for relation_id, _ in HOLDOUT]
    families = sorted(row.family_id for row in run.manifest.family_counts)
    by_family: dict[JudgeFamilyId, dict[RelationId, str]] = defaultdict(dict)
    for record in run.records:
        if record.card.relation_id not in set(holdout_ids):
            continue
        for vote in record.votes:
            if vote.repeat_index == BASELINE_REPEAT_INDEX:
                by_family[vote.family_id][record.card.relation_id] = vote.verdict
    drift: list[HoldoutDrift] = []
    for family_id in families:
        verdicts = by_family.get(family_id, {})
        missing = sorted(set(holdout_ids) - set(verdicts))
        if missing:
            raise ValueError(
                f"family {family_id} lacks grid holdout votes for {missing}; "
                "coverage must reconcile before gating"
            )
        correct = sum(
            verdicts[relation_id] in accepted_holdout_verdicts(relation_id)
            for relation_id in holdout_ids
        )
        probes_correct = all(
            verdicts[relation_id] in accepted_holdout_verdicts(relation_id)
            for relation_id in _PROBE_RELATIONS
        )
        drift.append(
            HoldoutDrift(
                family_id=family_id,
                correct=correct,
                total=len(holdout_ids),
                probes_correct=probes_correct,
                passed=correct >= HOLDOUT_PASS_MINIMUM and probes_correct,
                verdicts=dict(sorted(verdicts.items())),
            )
        )
    return drift


def _abstention(run: CompletedGridRun) -> list[FamilyAbstention]:
    votes_by_family: dict[JudgeFamilyId, int] = defaultdict(int)
    abstentions_by_family: dict[JudgeFamilyId, int] = defaultdict(int)
    for record in run.records:
        for vote in record.votes:
            votes_by_family[vote.family_id] += 1
            abstentions_by_family[vote.family_id] += vote.abstained
    return [
        FamilyAbstention(
            family_id=family_id,
            votes=votes_by_family[family_id],
            abstentions=abstentions_by_family[family_id],
            rate=abstentions_by_family[family_id] / votes_by_family[family_id],
        )
        for family_id in sorted(votes_by_family)
    ]


def _routing_violations(run: CompletedGridRun) -> int:
    """Count kept votes whose final accepted result is off its pinned route."""
    judges = {judge.family_id: judge for judge in run.manifest.judges}
    violations = 0
    for record in run.records:
        for vote in record.votes:
            pin = judges.get(vote.family_id)
            if pin is None:
                violations += 1
                continue
            violations += not all(
                matches_pinned_route(
                    result,
                    model=pin.model,
                    provider_name=pin.provider_name,
                )
                for result in vote.attempt_results
            )
    return violations


def dissent_ledger(decisions: AnalysisDecisions) -> list[DissentLedgerRow]:
    """Carry forward each family's systematic cross-bundle holdout misses."""
    rows: list[DissentLedgerRow] = []
    for result in decisions.qualification:
        misses: dict[RelationId, list[BundleId]] = defaultdict(list)
        for bundle_id, correctness in result.bundle_correctness.items():
            for relation_id, correct in correctness.items():
                if not correct:
                    misses[relation_id].append(bundle_id)
        bundle_count = len(result.bundle_correctness)
        for relation_id, missed in sorted(misses.items()):
            if len(missed) < _DISSENT_MISS_MINIMUM:
                continue
            rows.append(
                DissentLedgerRow(
                    family_id=result.family_id,
                    relation_id=relation_id,
                    missed_bundles=sorted(missed),
                    bundle_count=bundle_count,
                )
            )
    return sorted(rows, key=lambda row: (row.family_id, row.relation_id))


def _gates(
    run: CompletedGridRun,
    *,
    drift: list[HoldoutDrift],
    abstention: list[FamilyAbstention],
    routing_violations: int,
) -> GridGatesReport:
    total_cost = sum(row.known_cost_usd for row in run.manifest.family_counts)
    ceiling = run.manifest.executor_config.get("max_cost_usd")
    ceiling_value = float(ceiling) if isinstance(ceiling, int | float) else None
    gates = [
        GateResult(
            gate="coverage",
            # load_completed_grid replays every (card x family x repeat) cell
            # and fails loudly on any gap, so reaching this point is the proof.
            passed=True,
            detail=(
                f"100% of {run.manifest.pool_cards} x "
                f"{len(run.manifest.family_counts)} baseline cells present "
                "(refinement cells included)"
            ),
        ),
        GateResult(
            gate="routing",
            passed=routing_violations == 0,
            detail=f"{routing_violations} kept votes off their pinned route",
        ),
        GateResult(
            gate="holdout-drift",
            passed=all(entry.passed for entry in drift),
            detail=(
                "families failing the grid holdout re-qualification: "
                + (", ".join(entry.family_id for entry in drift if not entry.passed) or "none")
            ),
        ),
        GateResult(
            gate="abstention",
            passed=all(entry.rate < ABSTENTION_CEILING for entry in abstention),
            detail=(
                "families at or above the 5% abstention ceiling: "
                + (
                    ", ".join(
                        f"{entry.family_id} ({entry.rate:.3f})"
                        for entry in abstention
                        if entry.rate >= ABSTENTION_CEILING
                    )
                    or "none"
                )
            ),
        ),
        GateResult(
            gate="cost-envelope",
            passed=ceiling_value is None or total_cost <= ceiling_value,
            detail=(
                f"known fresh cost ${total_cost:.2f}"
                + (
                    f" vs ceiling ${ceiling_value:.2f}"
                    if ceiling_value is not None
                    else " (no ceiling configured)"
                )
            ),
        ),
    ]
    return GridGatesReport(
        gates=gates,
        holdout_drift=drift,
        abstention=abstention,
        routing_violation_raw_count=routing_violations,
        total_known_cost_usd=total_cost,
        cost_ceiling_usd=ceiling_value,
    )


def _render_markdown(
    run: CompletedGridRun,
    gates: GridGatesReport,
    *,
    coincident_count: int,
    nomination_count: int,
    dissent_count: int,
) -> str:
    lines = [
        "# Production grid run — deliverables and gates",
        "",
        f"- Pool: {run.manifest.pool_cards} cards "
        f"({run.manifest.holdout_cards} holdout anchors voted, "
        f"{run.manifest.shot_excluded_cards} shot-excluded).",
        f"- Votes: {run.manifest.total_votes} total; refined cards "
        f"{run.manifest.refined_cards} (realized trigger rate "
        f"{run.manifest.realized_trigger_rate:.3f}).",
        f"- Coincident review queue: {coincident_count} cards (obligatory).",
        f"- Nomination queue: {nomination_count} cards (top entropy decile).",
        f"- Dissent ledger: {dissent_count} rows carried forward.",
        "",
        "## Imported vs fresh votes per family",
        "",
        "| family | imported | fresh baseline | refinement | abstentions | known cost (USD) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {row.family_id} | {row.imported_votes} | {row.fresh_baseline_votes} "
        f"| {row.refinement_votes} | {row.abstentions} | {row.known_cost_usd:.4f} |"
        for row in run.manifest.family_counts
    )
    lines.extend(["", "## Acceptance gates (blocking, in order)", ""])
    lines.extend(
        f"- {'PASS' if gate.passed else 'FAIL'} — {gate.gate}: {gate.detail}"
        for gate in gates.gates
    )
    lines.extend(["", "## Holdout drift canary", ""])
    lines.append("| family | correct | probes | verdict |")
    lines.append("| --- | ---: | --- | --- |")
    lines.extend(
        f"| {entry.family_id} | {entry.correct}/{entry.total} "
        f"| {'ok' if entry.probes_correct else 'MISS'} "
        f"| {'pass' if entry.passed else 'HALT: investigate the pinned route'} |"
        for entry in gates.holdout_drift
    )
    lines.append("")
    return "\n".join(lines)


def write_grid_deliverables(
    *,
    run_dir: PathLike,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    decisions_path: PathLike,
    out_dir: PathLike,
) -> GridDeliverables:
    """Emit posteriors, both queues, the dissent ledger, and the gate report."""
    run = load_completed_grid(
        run_dir=Path(run_dir),
        cards_dir=Path(cards_dir),
        loaded_config=loaded_config,
    )
    try:
        decisions = AnalysisDecisions.model_validate_json(Path(decisions_path).read_bytes())
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid pilot decisions {decisions_path}: {error}") from error

    posteriors = tuple(card_posterior(record) for record in run.records)
    coincident = tuple(coincident_queue(run.records))
    nominations = tuple(nomination_queue(run.records))
    dissent = tuple(dissent_ledger(decisions))
    drift = _holdout_drift(run)
    gates = _gates(
        run,
        drift=drift,
        abstention=_abstention(run),
        routing_violations=_routing_violations(run),
    )

    output = Path(out_dir)
    output.mkdir(parents=True, exist_ok=True)
    paths = GridDeliverables(
        posteriors_jsonl=output / "posteriors.jsonl",
        coincident_queue_jsonl=output / "coincident-queue.jsonl",
        nomination_queue_jsonl=output / "nomination-queue.jsonl",
        dissent_ledger_jsonl=output / "dissent-ledger.jsonl",
        gates_json=output / "gates.json",
        report_md=output / "report.md",
        gates=gates,
        posteriors=posteriors,
        coincident=coincident,
        nominations=nominations,
        dissent=dissent,
    )
    paths.posteriors_jsonl.write_bytes(jsonl_bytes(posteriors))
    paths.coincident_queue_jsonl.write_bytes(jsonl_bytes(coincident))
    paths.nomination_queue_jsonl.write_bytes(jsonl_bytes(nominations))
    paths.dissent_ledger_jsonl.write_bytes(jsonl_bytes(dissent))
    paths.gates_json.write_bytes(canonical_json_bytes(gates.model_dump(mode="json")) + b"\n")
    paths.report_md.write_text(
        _render_markdown(
            run,
            gates,
            coincident_count=len(coincident),
            nomination_count=len(nominations),
            dissent_count=len(dissent),
        ),
        encoding="utf-8",
    )
    GridReportProvenance.make(
        producer="relation.grid-deliverables",
        input_hashes={
            "votes.jsonl": run.manifest.source_hashes["votes.jsonl"],
            "imported-votes.jsonl": run.manifest.source_hashes["imported-votes.jsonl"],
            "decisions.json": sha256_file(Path(decisions_path)),
        },
        content_hashes={
            path.name: sha256_file(path)
            for path in (
                paths.posteriors_jsonl,
                paths.coincident_queue_jsonl,
                paths.nomination_queue_jsonl,
                paths.dissent_ledger_jsonl,
                paths.gates_json,
                paths.report_md,
            )
        },
        details=GridReportDetails(),
    ).write(output / "report.meta.json")
    return paths
