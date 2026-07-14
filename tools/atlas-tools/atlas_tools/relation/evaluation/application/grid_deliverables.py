"""Publish source-bound production-grid queues and blocking gate evidence.

`gates.json` is the commit marker for the six-file bundle. The five content
files are written first; the gate artifact is published last and binds their
exact bytes, schemas, algorithms, grid sources, config, manifest, and pilot
decision record. Loading revalidates every row and re-derives queue ordering
and Markdown before exposing the bundle.
"""

import hashlib
import json
import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date, datetime, time, timedelta
from enum import Enum
from functools import partial
from pathlib import Path
from typing import Annotated, Literal, Self

import trio
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    ValidationError,
    model_validator,
)
from pydantic_core import to_jsonable_python

from atlas_tools.relation.evaluation.analysis.api import (
    CoincidentQueueEntry,
    FourClassPosterior,
    GridAnalysis,
    GridGateEvidence,
    GridGatePolicy,
    GridGates,
    HoldoutRule,
    NominationSeed,
    VerdictTally,
    coincident_queue,
    four_class_posterior,
    grid_acceptance_gates,
    nomination_queue,
)
from atlas_tools.relation.evaluation.application._analysis_codec import atomic_replace
from atlas_tools.relation.evaluation.application.analysis_artifact import hash_mapping
from atlas_tools.relation.evaluation.application.completed import (
    CompletedGrid,
    load_completed_grid_async,
)
from atlas_tools.relation.evaluation.application.pilot_reporting import (
    PilotDecisionArtifact,
)
from atlas_tools.relation.evaluation.domain.api import (
    BundleId,
    FamilyGridCounts,
    FrozenMapping,
    GridManifest,
    JudgeFamilyId,
    Probability,
    RelationId,
    Sha256Hex,
)

_POSTERIORS = "posteriors.jsonl"
_COINCIDENT = "coincident-queue.jsonl"
_NOMINATIONS = "nomination-queue.jsonl"
_DISSENT = "dissent-ledger.jsonl"
_GATES = "gates.json"
_REPORT = "report.md"
_CONTENT_NAMES = frozenset({_POSTERIORS, _COINCIDENT, _NOMINATIONS, _DISSENT, _REPORT})
_NOMINATION_FRACTION = 0.1
_ABSTENTION_CEILING = 0.05
_GRID_SOURCE_NAMES = frozenset(
    {
        "attempts.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
        "corpus.jsonl",
        "grid-config.yaml",
        "grid-manifest.json",
        "imported-attempts.jsonl",
        "imported-votes.jsonl",
        "judges-panel",
        "pilot-decisions.json",
        "pilot-votes.jsonl",
        "votes.jsonl",
    }
)


class _DeliverableModel(BaseModel):
    """Reject coercion, mutation, unknown fields, and invalid defaults."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class GridDeliverablesPolicy(_DeliverableModel):
    """Pin queue selection and systematic-dissent thresholds."""

    schema_version: Literal[1] = 1
    nomination_fraction: Annotated[
        float,
        Field(gt=0.0, le=1.0, allow_inf_nan=False),
    ] = _NOMINATION_FRACTION
    systematic_miss_minimum: Literal[2] = 2
    abstention_ceiling: Probability = _ABSTENTION_CEILING

    @model_validator(mode="after")
    def check_version_one_policy(self) -> Self:
        if (
            self.nomination_fraction != _NOMINATION_FRACTION
            or self.abstention_ceiling != _ABSTENTION_CEILING
        ):
            raise ValueError("grid deliverables schema version one uses fixed thresholds")
        return self


class PosteriorRow(_DeliverableModel):
    """Persist one card's independent tally and four-class posterior."""

    schema_version: Literal[1] = 1
    relation_id: RelationId
    card_hash: Sha256Hex
    refined: bool
    tally: VerdictTally
    posterior: FourClassPosterior

    @model_validator(mode="after")
    def check_posterior(self) -> Self:
        if self.posterior != four_class_posterior(self.tally):
            raise ValueError("posterior row disagrees with its verdict tally")
        return self


class CoincidentQueueRow(CoincidentQueueEntry):
    """Version one obligatory coincident-review row."""

    schema_version: Literal[1] = 1

    @classmethod
    def from_entry(cls, entry: CoincidentQueueEntry) -> CoincidentQueueRow:
        """Attach the disk schema version to validated queue evidence."""
        return cls.model_validate(
            {"schema_version": 1, **entry.model_dump(mode="python", round_trip=True)},
            strict=True,
        )


class NominationQueueRow(_DeliverableModel):
    """Persist one entropy-ranked nomination with its selection evidence."""

    schema_version: Literal[1] = 1
    rank: PositiveInt
    relation_id: RelationId
    card_hash: Sha256Hex
    tally: VerdictTally
    posterior: FourClassPosterior
    entropy: Probability

    @classmethod
    def from_seed(cls, seed: NominationSeed, *, rank: int) -> NominationQueueRow:
        """Attach a one-based rank and materialize the entropy used to sort."""
        return cls(
            rank=rank,
            relation_id=seed.relation_id,
            card_hash=seed.card_hash,
            tally=seed.tally,
            posterior=seed.posterior,
            entropy=seed.entropy,
        )

    @model_validator(mode="after")
    def check_posterior(self) -> Self:
        if self.posterior != four_class_posterior(self.tally):
            raise ValueError("nomination posterior disagrees with its verdict tally")
        if not math.isclose(
            self.entropy,
            self.posterior.normalized_entropy,
            rel_tol=0.0,
            abs_tol=1e-15,
        ):
            raise ValueError("nomination entropy disagrees with its posterior")
        return self


class DissentLedgerRow(_DeliverableModel):
    """Persist one systematic family-by-holdout miss from the pilot."""

    schema_version: Literal[1] = 1
    family_id: JudgeFamilyId
    relation_id: RelationId
    missed_bundles: Annotated[tuple[BundleId, ...], Field(min_length=2)]
    bundle_count: PositiveInt
    systematic_miss_minimum: Literal[2] = 2

    @model_validator(mode="after")
    def check_bundles(self) -> Self:
        if self.missed_bundles != tuple(sorted(self.missed_bundles)):
            raise ValueError("dissent missed bundles must be sorted")
        if len(self.missed_bundles) != len(set(self.missed_bundles)):
            raise ValueError("dissent missed bundles must be unique")
        if len(self.missed_bundles) > self.bundle_count:
            raise ValueError("dissent misses cannot exceed the compared bundle count")
        return self


class GridRunSummary(_DeliverableModel):
    """Retain the run facts needed to reproduce the human report."""

    pool_cards: PositiveInt
    holdout_cards: NonNegativeInt
    shot_excluded_cards: NonNegativeInt
    total_votes: PositiveInt
    refined_cards: NonNegativeInt
    realized_trigger_rate: Probability
    family_counts: Annotated[tuple[FamilyGridCounts, ...], Field(min_length=1)]

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        family_ids = tuple(row.family_id for row in self.family_counts)
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("grid summary families must be unique and sorted")
        if self.refined_cards > self.pool_cards:
            raise ValueError("refined cards cannot exceed the pool")
        if self.total_votes != sum(
            row.imported_votes + row.fresh_baseline_votes + row.refinement_votes
            for row in self.family_counts
        ):
            raise ValueError("grid summary vote count disagrees with its family rows")
        if not math.isclose(
            self.realized_trigger_rate,
            self.refined_cards / self.pool_cards,
            rel_tol=0.0,
            abs_tol=1e-15,
        ):
            raise ValueError("grid summary trigger rate disagrees with its card counts")
        return self


class GridReportData(_DeliverableModel):
    """Store every typed value consumed by `report.md`."""

    policy: GridDeliverablesPolicy
    gate_policy: GridGatePolicy
    summary: GridRunSummary
    gates: GridGates
    posterior_rows: PositiveInt
    coincident_rows: NonNegativeInt
    nomination_rows: PositiveInt
    dissent_rows: NonNegativeInt
    accepted: bool

    @model_validator(mode="after")
    def check_contract(self) -> Self:
        if self.accepted != self.gates.all_passed:
            raise ValueError("persisted grid acceptance disagrees with blocking gates")
        if self.posterior_rows != self.summary.pool_cards:
            raise ValueError("posterior rows must cover the complete card pool")
        expected_nominations = max(
            1,
            math.floor(self.posterior_rows * self.policy.nomination_fraction),
        )
        if self.nomination_rows != expected_nominations:
            raise ValueError("nomination rows must equal the configured entropy fraction")
        if self.gates.abstention_ceiling != self.gate_policy.abstention_ceiling:
            raise ValueError("gate evidence and policy use different abstention ceilings")
        if self.gates.cost_ceiling_usd != self.gate_policy.cost_ceiling_usd:
            raise ValueError("gate evidence and policy use different cost ceilings")
        summary_families = tuple(row.family_id for row in self.summary.family_counts)
        if tuple(row.family_id for row in self.gates.holdout_drift) != summary_families:
            raise ValueError("gate families disagree with the grid summary")
        known_cost = math.fsum(row.known_cost_usd for row in self.summary.family_counts)
        if not math.isclose(
            self.gates.total_known_cost_usd,
            known_cost,
            rel_tol=0.0,
            abs_tol=1e-12,
        ):
            raise ValueError("gate cost disagrees with the grid summary")
        return self


class GridGatesArtifact(_DeliverableModel):
    """Commit and bind one complete grid-deliverables bundle."""

    schema_version: Literal[1] = 1
    artifact: Literal["relation-grid-deliverables"] = "relation-grid-deliverables"
    schema_hashes: FrozenMapping[str, Sha256Hex]
    algorithms: FrozenMapping[str, str]
    algorithm_hash: Sha256Hex
    source_hashes: FrozenMapping[str, Sha256Hex]
    content_hashes: FrozenMapping[str, Sha256Hex]
    report: GridReportData
    metadata_hash: Sha256Hex

    @model_validator(mode="after")
    def check_bundle_contract(self) -> Self:
        if set(self.source_hashes) != _GRID_SOURCE_NAMES:
            raise ValueError("grid deliverables must bind every source artifact")
        if set(self.content_hashes) != _CONTENT_NAMES:
            raise ValueError("grid deliverables must bind every content artifact")
        if dict(self.algorithms) != _ALGORITHMS:
            raise ValueError("grid deliverable algorithms differ from schema version one")
        if dict(self.schema_hashes) != _SCHEMA_HASHES:
            raise ValueError("grid deliverable schema hashes differ from schema version one")
        if self.algorithm_hash != hash_mapping(self.algorithms):
            raise ValueError("grid deliverable algorithm hash disagrees with its map")
        payload = self.model_dump(mode="python", round_trip=True, exclude={"metadata_hash"})
        if self.metadata_hash != _sha256(_json_bytes(payload, newline=False)):
            raise ValueError("grid deliverable metadata hash disagrees with gates.json")
        return self


class GridDeliverableProducts(_DeliverableModel):
    """Carry all pure row projections and blocking gates before persistence."""

    posteriors: tuple[PosteriorRow, ...]
    coincident: tuple[CoincidentQueueRow, ...]
    nominations: tuple[NominationQueueRow, ...]
    dissent: tuple[DissentLedgerRow, ...]
    gates: GridGates

    @model_validator(mode="after")
    def check_order(self) -> Self:
        posterior_ids = tuple(row.relation_id for row in self.posteriors)
        if not posterior_ids or posterior_ids != tuple(sorted(posterior_ids)):
            raise ValueError("posterior rows must be non-empty and sorted by relation ID")
        if len(posterior_ids) != len(set(posterior_ids)):
            raise ValueError("posterior rows must have unique relation IDs")
        coincident_ids = tuple(row.relation_id for row in self.coincident)
        if coincident_ids != tuple(sorted(coincident_ids)):
            raise ValueError("coincident queue must be sorted by relation ID")
        if tuple(row.rank for row in self.nominations) != tuple(
            range(1, len(self.nominations) + 1)
        ):
            raise ValueError("nomination ranks must be contiguous and one-based")
        dissent_ids = tuple((row.family_id, row.relation_id) for row in self.dissent)
        if dissent_ids != tuple(sorted(dissent_ids)):
            raise ValueError("dissent ledger must be sorted by family and relation")
        return self


class GridDeliverablesRun(_DeliverableModel):
    """Return one strictly reloaded bundle and its stable output paths."""

    directory: Path
    posteriors_path: Path
    coincident_queue_path: Path
    nomination_queue_path: Path
    dissent_ledger_path: Path
    gates_path: Path
    report_path: Path
    artifact: GridGatesArtifact
    products: GridDeliverableProducts


class GridGatesBlockedError(RuntimeError):
    """Block downstream work while retaining the published gate audit."""

    __slots__ = ("run",)

    def __init__(self, run: GridDeliverablesRun) -> None:
        failed = ", ".join(gate.gate for gate in run.products.gates.gates if not gate.passed)
        super().__init__(f"grid acceptance gates failed: {failed}")
        self.run = run


_ALGORITHMS = {
    "coincident_queue": "any-coincident-complete-vote-record-v1",
    "dissent_ledger": "pilot-holdout-misses-in-at-least-two-bundles-v1",
    "gates": "coverage-routing-holdout-abstention-cost-ordered-v1",
    "json": "sorted-keys-compact-ascii-v1",
    "nomination_queue": "top-floor-decile-four-class-posterior-entropy-v1",
    "ordering": "relation-ascending-except-ranked-nominations-v1",
    "posteriors": "dirichlet-1-1-1-1-v1",
    "report": "commonmark-ascii-from-gates-artifact-v1",
}


def _canonical_json_special(
    value: Enum | Path | datetime | date | time | timedelta,
) -> object:
    if isinstance(value, Enum):
        return _canonical_json_value(value.value)
    if isinstance(value, Path):
        return str(value)
    return to_jsonable_python(value)


def _canonical_json_value(value: object) -> object:
    if isinstance(value, BaseModel):
        normalized: object = _canonical_json_value(value.model_dump(mode="python", round_trip=True))
    elif isinstance(value, Mapping):
        normalized_mapping: dict[str, object] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("canonical JSON mappings require string keys")
            normalized_mapping[key] = _canonical_json_value(item)
        normalized = normalized_mapping
    elif isinstance(value, (set, frozenset)):
        normalized_items = [_canonical_json_value(item) for item in value]
        normalized = sorted(
            normalized_items,
            key=lambda item: json.dumps(
                item,
                allow_nan=False,
                ensure_ascii=True,
                separators=(",", ":"),
                sort_keys=True,
            ),
        )
    elif isinstance(value, (list, tuple)):
        normalized = [_canonical_json_value(item) for item in value]
    elif isinstance(value, (Enum, Path, datetime, date, time, timedelta)):
        normalized = _canonical_json_special(value)
    elif value is None or isinstance(value, (str, int, float, bool)):
        normalized = value
    else:
        raise TypeError(f"unsupported canonical JSON value: {type(value).__qualname__}")
    return normalized


def _json_bytes(value: object, *, newline: bool = True) -> bytes:
    payload = json.dumps(
        _canonical_json_value(value),
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("ascii")
    return payload + (b"\n" if newline else b"")


def _sha256(payload: bytes) -> Sha256Hex:
    return hashlib.sha256(payload).hexdigest()


def _schema_hash(model: type[BaseModel]) -> Sha256Hex:
    return _sha256(_json_bytes(model.model_json_schema(mode="validation"), newline=False))


_SCHEMA_HASHES = {
    _COINCIDENT: _schema_hash(CoincidentQueueRow),
    _DISSENT: _schema_hash(DissentLedgerRow),
    _GATES: _schema_hash(GridGatesArtifact),
    _NOMINATIONS: _schema_hash(NominationQueueRow),
    _POSTERIORS: _schema_hash(PosteriorRow),
    _REPORT: _sha256(
        _json_bytes(
            {
                "encoding": "ascii",
                "format": "commonmark",
                "sections": [
                    "summary",
                    "family-accounting",
                    "blocking-gates",
                    "holdout-drift",
                    "abstention",
                ],
                "version": 1,
            },
            newline=False,
        )
    ),
}

_DEFAULT_POLICY = GridDeliverablesPolicy()


def _posterior_rows(analysis: GridAnalysis) -> tuple[PosteriorRow, ...]:
    return tuple(
        PosteriorRow(
            relation_id=card.card.relation_id,
            card_hash=card.card.card_hash,
            refined=card.refined,
            tally=card.tally,
            posterior=card.posterior,
        )
        for card in analysis.cards
    )


def _coincident_rows(analysis: GridAnalysis) -> tuple[CoincidentQueueRow, ...]:
    return tuple(CoincidentQueueRow.from_entry(entry) for entry in coincident_queue(analysis))


def _nomination_rows(
    analysis: GridAnalysis,
    policy: GridDeliverablesPolicy,
) -> tuple[NominationQueueRow, ...]:
    return tuple(
        NominationQueueRow.from_seed(seed, rank=rank)
        for rank, seed in enumerate(
            nomination_queue(analysis, fraction=policy.nomination_fraction),
            start=1,
        )
    )


def dissent_ledger(
    decisions: PilotDecisionArtifact,
    *,
    policy: GridDeliverablesPolicy | None = None,
) -> tuple[DissentLedgerRow, ...]:
    """Carry systematic cross-bundle pilot misses into rubric review.

    Every family-by-holdout group must cover the complete declared bundle
    grid. Rows are emitted only for misses in at least two distinct bundles.

    Raises:
        ValueError: Persisted holdout evidence is incomplete or duplicated.

    """
    resolved = policy or _DEFAULT_POLICY
    expected_bundles = tuple(sorted(decisions.manifest.expected_grid.bundles))
    grouped: dict[tuple[JudgeFamilyId, RelationId], list[tuple[BundleId, bool]]] = defaultdict(list)
    for row in decisions.holdout_correctness:
        grouped[(row.family_id, row.relation_id)].append((row.bundle_id, row.correct))
    results: list[DissentLedgerRow] = []
    for (family_id, relation_id), evidence in sorted(grouped.items()):
        observed = tuple(sorted(bundle for bundle, _ in evidence))
        if observed != expected_bundles or len(observed) != len(set(observed)):
            raise ValueError("pilot holdout evidence does not cover each bundle exactly once")
        missed = tuple(sorted(bundle for bundle, correct in evidence if not correct))
        if len(missed) < resolved.systematic_miss_minimum:
            continue
        results.append(
            DissentLedgerRow(
                family_id=family_id,
                relation_id=relation_id,
                missed_bundles=missed,
                bundle_count=len(expected_bundles),
                systematic_miss_minimum=resolved.systematic_miss_minimum,
            )
        )
    return tuple(results)


def derive_grid_deliverables(
    analysis: GridAnalysis,
    *,
    pilot_decisions: PilotDecisionArtifact,
    gate_policy: GridGatePolicy,
    routing_violations: int,
    policy: GridDeliverablesPolicy | None = None,
) -> GridDeliverableProducts:
    """Derive every row and blocking gate from immutable in-memory evidence."""
    resolved = policy or _DEFAULT_POLICY
    return GridDeliverableProducts(
        posteriors=_posterior_rows(analysis),
        coincident=_coincident_rows(analysis),
        nominations=_nomination_rows(analysis, resolved),
        dissent=dissent_ledger(pilot_decisions, policy=resolved),
        gates=grid_acceptance_gates(
            analysis,
            policy=gate_policy,
            evidence=GridGateEvidence(routing_violations=routing_violations),
        ),
    )


def _gate_policy(
    completed: CompletedGrid,
    decisions: PilotDecisionArtifact,
    policy: GridDeliverablesPolicy,
) -> GridGatePolicy:
    return GridGatePolicy(
        holdouts=tuple(
            HoldoutRule(
                relation_id=rule.relation_id,
                accepted_verdicts=frozenset(rule.accepted_verdicts),
                probe=rule.mandatory_probe,
            )
            for rule in decisions.policy.holdouts
        ),
        holdout_minimum_correct=decisions.policy.holdout_minimum_correct,
        abstention_ceiling=policy.abstention_ceiling,
        cost_ceiling_usd=completed.prepared.config.max_cost_usd,
    )


def _validate_lineage(completed: CompletedGrid, decisions: PilotDecisionArtifact) -> None:
    grid = completed.manifest
    pilot = decisions.manifest
    if (
        grid.prompt_pack_hash != pilot.prompt_pack_hash
        or grid.rubric_version != pilot.rubric_version
    ):
        raise ValueError("grid prompt or rubric identity differs from pilot qualification")
    if grid.source_hashes["pilot-votes.jsonl"] != pilot.source_hashes["votes.jsonl"]:
        raise ValueError("grid pilot import differs from the qualified pilot journal")
    if grid.pool_cards != pilot.full_grid_card_count:
        raise ValueError("grid pool size differs from the pilot projection")
    if grid.holdout_cards != len(decisions.policy.holdouts):
        raise ValueError("grid holdout count differs from the pilot policy")

    seated = {judge.family_id for judge in grid.judges}
    manually_pruned = set(grid.manual_prunes)
    if seated & manually_pruned:
        raise ValueError("a manually pruned pilot family still holds a grid seat")
    if seated | manually_pruned != set(decisions.qualified_families):
        raise ValueError("grid seats and manual prunes do not account for qualified families")
    pilot_pins = {judge.family_id: judge for judge in pilot.judges}
    selected_efforts = {row.family_id: row.selected_effort for row in decisions.selected_efforts}
    for judge in grid.judges:
        qualified = pilot_pins[judge.family_id]
        if (
            judge.model != qualified.model
            or judge.provider_slug != qualified.provider_slug
            or judge.provider_name != qualified.provider_name
            or judge.openrouter_region != qualified.openrouter_region
            or judge.temperature != qualified.temperature
            or judge.seed != qualified.seed
            or judge.output_token_limit != qualified.output_token_limit
        ):
            raise ValueError(f"grid request pin differs from pilot for {judge.family_id}")
        if judge.effort != selected_efforts[judge.family_id]:
            raise ValueError(f"grid effort differs from pilot decision for {judge.family_id}")


def _source_hashes(
    completed: CompletedGrid,
    *,
    grid_manifest_hash: Sha256Hex,
    pilot_decisions_hash: Sha256Hex,
) -> dict[str, Sha256Hex]:
    return {
        **dict(completed.manifest.source_hashes),
        "grid-config.yaml": completed.prepared.loaded_config.content_hash,
        "grid-manifest.json": grid_manifest_hash,
        "pilot-decisions.json": pilot_decisions_hash,
    }


def _summary(manifest: GridManifest) -> GridRunSummary:
    return GridRunSummary(
        pool_cards=manifest.pool_cards,
        holdout_cards=manifest.holdout_cards,
        shot_excluded_cards=manifest.shot_excluded_cards,
        total_votes=manifest.total_votes,
        refined_cards=manifest.refined_cards,
        realized_trigger_rate=manifest.realized_trigger_rate,
        family_counts=tuple(sorted(manifest.family_counts, key=lambda row: row.family_id)),
    )


def _markdown(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


def render_grid_report(report: GridReportData) -> str:
    """Render deterministic ASCII Markdown from the machine gate contract.

    Raises:
        ValueError: A durable identity would make the report non-ASCII.

    """
    summary = report.summary
    lines = [
        "# Production grid deliverables and blocking gates",
        "",
        f"- Acceptance: {'PASS' if report.accepted else 'BLOCKED'}.",
        f"- Pool: {summary.pool_cards} cards; {summary.holdout_cards} holdouts; "
        f"{summary.shot_excluded_cards} fixed-shot exclusions.",
        f"- Votes: {summary.total_votes}; refined cards: {summary.refined_cards} "
        f"({summary.realized_trigger_rate:.6%}).",
        f"- Posterior rows: {report.posterior_rows}.",
        f"- Coincident review rows: {report.coincident_rows}.",
        f"- Entropy nomination rows: {report.nomination_rows}.",
        f"- Systematic dissent rows: {report.dissent_rows}.",
        "",
        "## Family accounting",
        "",
        "| family | imported | fresh baseline | refinement | abstentions | known cost (USD) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.imported_votes} | "
        f"{row.fresh_baseline_votes} | {row.refinement_votes} | {row.abstentions} | "
        f"{row.known_cost_usd:.6f} |"
        for row in summary.family_counts
    )
    lines.extend(["", "## Blocking gates", ""])
    lines.extend(
        f"- {'PASS' if gate.passed else 'FAIL'} - {gate.gate}: {_markdown(gate.detail)}"
        for gate in report.gates.gates
    )
    lines.extend(
        [
            "",
            "## Holdout drift canary",
            "",
            "| family | correct | probes | result |",
            "| --- | ---: | :---: | :---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.correct}/{row.total} | "
        f"{'ok' if row.probes_correct else 'MISS'} | "
        f"{'pass' if row.passed else 'HALT'} |"
        for row in report.gates.holdout_drift
    )
    lines.extend(
        [
            "",
            "## Abstention",
            "",
            "| family | abstentions | votes | rate |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.abstentions} | {row.votes} | {row.rate:.6%} |"
        for row in report.gates.abstention
    )
    lines.append("")
    markdown = "\n".join(lines)
    try:
        markdown.encode("ascii")
    except UnicodeEncodeError as error:
        raise ValueError("grid report values must be ASCII") from error
    return markdown


def _jsonl_bytes(rows: Sequence[BaseModel]) -> bytes:
    return b"".join(_json_bytes(row) for row in rows)


def _content_payloads(
    products: GridDeliverableProducts, report: GridReportData
) -> dict[str, bytes]:
    return {
        _POSTERIORS: _jsonl_bytes(products.posteriors),
        _COINCIDENT: _jsonl_bytes(products.coincident),
        _NOMINATIONS: _jsonl_bytes(products.nominations),
        _DISSENT: _jsonl_bytes(products.dissent),
        _REPORT: render_grid_report(report).encode("ascii"),
    }


def _gates_artifact(
    *,
    source_hashes: Mapping[str, Sha256Hex],
    content_hashes: Mapping[str, Sha256Hex],
    report: GridReportData,
) -> GridGatesArtifact:
    algorithm_hash = hash_mapping(_ALGORITHMS)
    payload = {
        "algorithm_hash": algorithm_hash,
        "algorithms": _ALGORITHMS,
        "artifact": "relation-grid-deliverables",
        "content_hashes": dict(content_hashes),
        "report": report,
        "schema_hashes": _SCHEMA_HASHES,
        "schema_version": 1,
        "source_hashes": dict(source_hashes),
    }
    return GridGatesArtifact(
        algorithm_hash=algorithm_hash,
        algorithms=_ALGORITHMS,
        content_hashes=content_hashes,
        report=report,
        schema_hashes=_SCHEMA_HASHES,
        source_hashes=source_hashes,
        metadata_hash=_sha256(_json_bytes(payload, newline=False)),
    )


def _publish(
    completed: CompletedGrid,
    decisions: PilotDecisionArtifact,
    *,
    grid_manifest_hash: Sha256Hex,
    pilot_decisions_hash: Sha256Hex,
    output_directory: Path,
    policy: GridDeliverablesPolicy,
) -> GridDeliverablesRun:
    _validate_lineage(completed, decisions)
    gate_policy = _gate_policy(completed, decisions, policy)
    products = derive_grid_deliverables(
        completed.analysis,
        pilot_decisions=decisions,
        gate_policy=gate_policy,
        routing_violations=completed.routing_violations,
        policy=policy,
    )
    sources = _source_hashes(
        completed,
        grid_manifest_hash=grid_manifest_hash,
        pilot_decisions_hash=pilot_decisions_hash,
    )
    return publish_grid_deliverables(
        products,
        summary=_summary(completed.manifest),
        gate_policy=gate_policy,
        source_hashes=sources,
        output_directory=output_directory,
        policy=policy,
    )


def publish_grid_deliverables(
    products: GridDeliverableProducts,
    *,
    summary: GridRunSummary,
    gate_policy: GridGatePolicy,
    source_hashes: Mapping[str, Sha256Hex],
    output_directory: Path,
    policy: GridDeliverablesPolicy | None = None,
) -> GridDeliverablesRun:
    """Publish already-derived rows and enforce their blocking gates.

    This composition point lets a caller that already owns a validated grid
    snapshot avoid loading it twice. The path-based async entry point remains
    the normal end-to-end API.

    Raises:
        GridGatesBlockedError: Artifacts are committed, but at least one gate
            blocks downstream work.
        OSError: A content file or commit marker cannot be published.
        ValueError: Sources, row counts, or reloaded bytes disagree.

    """
    resolved = policy or _DEFAULT_POLICY
    report = GridReportData(
        policy=resolved,
        gate_policy=gate_policy,
        summary=summary,
        gates=products.gates,
        posterior_rows=len(products.posteriors),
        coincident_rows=len(products.coincident),
        nomination_rows=len(products.nominations),
        dissent_rows=len(products.dissent),
        accepted=products.gates.all_passed,
    )
    payloads = _content_payloads(products, report)
    artifact = _gates_artifact(
        source_hashes=source_hashes,
        content_hashes={name: _sha256(payload) for name, payload in payloads.items()},
        report=report,
    )
    for name in (_POSTERIORS, _COINCIDENT, _NOMINATIONS, _DISSENT, _REPORT):
        atomic_replace(output_directory / name, payloads[name])
    atomic_replace(output_directory / _GATES, _json_bytes(artifact))
    loaded = load_grid_deliverables(
        output_directory,
        expected_source_hashes=source_hashes,
    )
    if loaded.products != products or loaded.artifact != artifact:
        raise ValueError("reloaded grid deliverables differ from their in-memory derivation")
    if not loaded.products.gates.all_passed:
        raise GridGatesBlockedError(loaded)
    return loaded


def _parse_jsonl[Row: BaseModel](path: Path, payload: bytes, model: type[Row]) -> tuple[Row, ...]:
    rows: list[Row] = []
    for line_number, line in enumerate(payload.splitlines(), start=1):
        if not line:
            raise ValueError(f"{path.name} contains an empty row at line {line_number}")
        try:
            rows.append(model.model_validate_json(line, strict=True))
        except ValidationError as error:
            raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    parsed = tuple(rows)
    if _jsonl_bytes(parsed) != payload:
        raise ValueError(f"{path.name} does not use the canonical JSONL encoding")
    return parsed


def _read(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read grid deliverable {path}: {error}") from error


def _validate_loaded_products(
    artifact: GridGatesArtifact,
    products: GridDeliverableProducts,
) -> None:
    report = artifact.report
    if (
        len(products.posteriors) != report.posterior_rows
        or len(products.coincident) != report.coincident_rows
        or len(products.nominations) != report.nomination_rows
        or len(products.dissent) != report.dissent_rows
    ):
        raise ValueError("grid deliverable row counts disagree with gates.json")
    by_relation = {row.relation_id: row for row in products.posteriors}
    for row in products.coincident:
        posterior = by_relation.get(row.relation_id)
        if (
            posterior is None
            or posterior.card_hash != row.card_hash
            or posterior.tally != row.tally
        ):
            raise ValueError("coincident queue evidence disagrees with posteriors.jsonl")
    ranked = sorted(
        products.posteriors,
        key=lambda row: (-row.posterior.normalized_entropy, row.relation_id),
    )[: report.nomination_rows]
    expected = tuple(
        (rank, row.relation_id, row.card_hash, row.tally, row.posterior)
        for rank, row in enumerate(ranked, start=1)
    )
    observed = tuple(
        (row.rank, row.relation_id, row.card_hash, row.tally, row.posterior)
        for row in products.nominations
    )
    if observed != expected:
        raise ValueError("nomination queue is not the posterior entropy decile")


def load_grid_deliverables(
    output_directory: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> GridDeliverablesRun:
    """Strictly reload and cross-validate one committed deliverables bundle.

    Raises:
        ValueError: Metadata, source identity, content bytes, row invariants,
            queue ordering, or report rendering disagrees.

    """
    gates_path = output_directory / _GATES
    gates_payload = _read(gates_path)
    try:
        artifact = GridGatesArtifact.model_validate_json(gates_payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid {_GATES}: {error}") from error
    if _json_bytes(artifact) != gates_payload:
        raise ValueError("gates.json does not use the canonical JSON encoding")
    if expected_source_hashes is not None and dict(artifact.source_hashes) != dict(
        expected_source_hashes
    ):
        raise ValueError("grid deliverable sources differ from caller expectations")

    payloads = {name: _read(output_directory / name) for name in _CONTENT_NAMES}
    observed_hashes = {name: _sha256(payload) for name, payload in payloads.items()}
    if observed_hashes != dict(artifact.content_hashes):
        raise ValueError("grid deliverable content hashes disagree with gates.json")
    posteriors = _parse_jsonl(
        output_directory / _POSTERIORS,
        payloads[_POSTERIORS],
        PosteriorRow,
    )
    coincident = _parse_jsonl(
        output_directory / _COINCIDENT,
        payloads[_COINCIDENT],
        CoincidentQueueRow,
    )
    nominations = _parse_jsonl(
        output_directory / _NOMINATIONS,
        payloads[_NOMINATIONS],
        NominationQueueRow,
    )
    dissent = _parse_jsonl(
        output_directory / _DISSENT,
        payloads[_DISSENT],
        DissentLedgerRow,
    )
    products = GridDeliverableProducts(
        posteriors=posteriors,
        coincident=coincident,
        nominations=nominations,
        dissent=dissent,
        gates=artifact.report.gates,
    )
    _validate_loaded_products(artifact, products)
    expected_report = render_grid_report(artifact.report).encode("ascii")
    if payloads[_REPORT] != expected_report:
        raise ValueError("report.md is not the rendering of gates.json")
    return GridDeliverablesRun(
        directory=output_directory,
        posteriors_path=output_directory / _POSTERIORS,
        coincident_queue_path=output_directory / _COINCIDENT,
        nomination_queue_path=output_directory / _NOMINATIONS,
        dissent_ledger_path=output_directory / _DISSENT,
        gates_path=gates_path,
        report_path=output_directory / _REPORT,
        artifact=artifact,
        products=products,
    )


async def load_grid_deliverables_async(
    output_directory: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> GridDeliverablesRun:
    """Reload a deliverables bundle without blocking Trio's event loop."""
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    load = partial(load_grid_deliverables, output_directory, expected_source_hashes=expected)
    return await trio.to_thread.run_sync(load, abandon_on_cancel=False)


class _BoundPilot(_DeliverableModel):
    decisions: PilotDecisionArtifact
    digest: Sha256Hex


class _BoundManifest(_DeliverableModel):
    manifest: GridManifest
    digest: Sha256Hex


def _read_pilot(path: Path) -> _BoundPilot:
    payload = _read(path)
    try:
        decisions = PilotDecisionArtifact.model_validate_json(payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid pilot decisions {path}: {error}") from error
    return _BoundPilot(decisions=decisions, digest=_sha256(payload))


def _read_grid_manifest(path: Path) -> _BoundManifest:
    payload = _read(path)
    try:
        manifest = GridManifest.model_validate_json(payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid completed grid manifest {path}: {error}") from error
    return _BoundManifest(manifest=manifest, digest=_sha256(payload))


async def write_grid_deliverables_async(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    pilot_decisions_path: Path,
    output_directory: Path,
    policy: GridDeliverablesPolicy | None = None,
) -> GridDeliverablesRun:
    """Load one completed grid and publish its accepted deliverables.

    Independent completed-grid, pilot-decision, and manifest reads run in
    parallel. Failed gates are committed for audit and then raise
    [`GridGatesBlockedError`], preventing downstream use.

    Raises:
        GridGatesBlockedError: At least one blocking gate fails after the
            complete audit bundle is durably published.
        OSError: A durable artifact cannot be published.
        ValueError: Inputs, lineage, schemas, hashes, or derived evidence
            disagree.

    """
    completed_results: list[CompletedGrid] = []
    pilot_results: list[_BoundPilot] = []
    manifest_results: list[_BoundManifest] = []

    async def load_grid() -> None:
        completed_results.append(
            await load_completed_grid_async(
                run_directory=run_directory,
                cards_directory=cards_directory,
                config_path=config_path,
            )
        )

    async def load_pilot() -> None:
        pilot_results.append(
            await trio.to_thread.run_sync(
                _read_pilot,
                pilot_decisions_path,
                abandon_on_cancel=False,
            )
        )

    async def load_manifest() -> None:
        manifest_results.append(
            await trio.to_thread.run_sync(
                _read_grid_manifest,
                run_directory / "manifest.json",
                abandon_on_cancel=False,
            )
        )

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_grid)
        nursery.start_soon(load_pilot)
        nursery.start_soon(load_manifest)
    if (len(completed_results), len(pilot_results), len(manifest_results)) != (1, 1, 1):
        raise AssertionError("parallel grid deliverable loaders did not each return once")
    completed = completed_results[0]
    pilot = pilot_results[0]
    manifest = manifest_results[0]
    if manifest.manifest != completed.manifest:
        raise ValueError("bound grid manifest differs from the completed-grid snapshot")
    publish = partial(
        _publish,
        completed,
        pilot.decisions,
        grid_manifest_hash=manifest.digest,
        pilot_decisions_hash=pilot.digest,
        output_directory=output_directory,
        policy=policy or _DEFAULT_POLICY,
    )
    return await trio.to_thread.run_sync(publish, abandon_on_cancel=False)


def write_grid_deliverables(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    pilot_decisions_path: Path,
    output_directory: Path,
    policy: GridDeliverablesPolicy | None = None,
) -> GridDeliverablesRun:
    """Run grid deliverable publication from a synchronous process boundary."""
    write = partial(
        write_grid_deliverables_async,
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
        pilot_decisions_path=pilot_decisions_path,
        output_directory=output_directory,
        policy=policy,
    )
    return trio.run(write)
