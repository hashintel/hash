"""End-to-end deterministic analysis of factorial-pilot relation votes."""

import itertools
import math
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import timedelta
from os import PathLike
from pathlib import Path
from typing import Self, TypedDict, cast

import numpy as np
from pydantic import BaseModel, ValidationError

from atlas_tools.common import (
    Sha256Hex,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT, accepted_holdout_verdicts
from atlas_tools.relation.eval.provenance import judge_request_hash
from atlas_tools.relation.eval.reporting import render_markdown
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    FRAMINGS,
    QUALIFICATION_BUNDLE,
    SHELLS,
    VERDICTS,
    AdmissionAxis,
    AdmissionDecision,
    AgreementResults,
    AnalysisDecisions,
    AnalysisPolicy,
    Axis,
    AxisStatistics,
    BundleId,
    CardPosterior,
    ContestStratum,
    CoverageStream,
    DataHealth,
    DurationEstimate,
    EffortDecision,
    EscalationAxis,
    EscalationAxisName,
    Estimate,
    FamilyBundleHealth,
    FamilyCostAudit,
    FamilyCostHealth,
    FlipAxis,
    FlipResult,
    FramingId,
    HandoffManifest,
    MarginalAxis,
    MarginalResult,
    NominationSeed,
    OrderingCheck,
    PhysicalAttemptRow,
    PilotRunContract,
    QualificationResult,
    RoutingStream,
    ShellId,
    SliceRow,
    Verdict,
    VoteRow,
    VoteVerdict,
)
from atlas_tools.relation.eval.statistics import (
    bootstrap_cohen_kappa,
    bootstrap_krippendorff_alpha,
    bootstrap_mean,
    bootstrap_rate,
    cluster_bootstrap,
    mean,
    normalized_entropy,
)
from atlas_tools.relation.eval.transport import matches_pinned_route

MAX_REASON_WORDS = 60

HOLDOUT_PASS_COUNT = 5
MIN_PANEL_FAMILIES = 2
ESCALATION_AXES: tuple[EscalationAxisName, ...] = (
    "family",
    "template",
    "shell",
    "repeat",
    "effort",
)


class BootstrapOptions(TypedDict):
    resamples: int
    seed: int
    ci_level: float
    minimum_defined_rate: float


@dataclass(frozen=True)
class Handoff:
    manifest: HandoffManifest
    slice_rows: tuple[SliceRow, ...]
    votes: tuple[VoteRow, ...]
    attempts_by_vote: dict[str, tuple[PhysicalAttemptRow, ...]]
    input_hashes: dict[str, Sha256Hex]


@dataclass(frozen=True)
class AnalysisRunResult:
    decisions: AnalysisDecisions
    decisions_json: Path
    report_md: Path


@dataclass(frozen=True)
class VotePartitions:
    clean: list[VoteRow]
    raw_grid: list[VoteRow]
    clean_grid: list[VoteRow]
    contaminated: list[VoteRow]
    routing_bad: list[VoteRow]


@dataclass(frozen=True)
class EffortCandidate:
    effort: str
    eligible: bool
    holdout_correct: int
    flip_rate: Estimate
    rescues: int
    regressions: int
    reasons: list[str]


@dataclass(frozen=True)
class PairObservations:
    values: dict[str, list[bool]]
    expected_by_card: dict[str, int]


@dataclass(frozen=True)
class EntropyStrata:
    entropy_by_relation: dict[str, float]
    contested_relations: set[str]
    tercile_cuts: tuple[float, float]


@dataclass(frozen=True)
class HoldoutEffortComparison:
    correct: int
    rescues: int
    regressions: int
    mandatory_probes_correct: bool


@dataclass(frozen=True)
class AxisDecisionResults:
    statistics: AxisStatistics
    admissions: list[AdmissionDecision]
    entropy_by_relation: dict[str, float]
    contested_relations: set[str]
    family_flip_rate: Estimate
    floor_error_bar: Estimate


@dataclass(frozen=True)
class CostAuditResults:
    families: list[FamilyCostAudit]
    projected_cost: Estimate


@dataclass(frozen=True)
class EscalationEstimates:
    disagreement_yield: Estimate
    marginal_cost: Estimate
    yield_per_dollar: Estimate


@dataclass(frozen=True)
class EscalationResults:
    axes: list[EscalationAxis]
    order: list[EscalationAxisName]


def _load_jsonl[Model: BaseModel](path: Path, model: type[Model]) -> list[Model]:
    rows: list[Model] = []

    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                rows.append(model.model_validate_json(line))
            except ValidationError as error:
                raise ValueError(
                    f"invalid {path.name} record at line {line_number}: {error}"
                ) from error

    return rows


def _duplicates(values: Iterable[str]) -> list[str]:
    counts = Counter(values)
    return sorted(value for value, count in counts.items() if count > 1)


def _expected_holdouts() -> dict[str, Verdict]:
    return dict(HOLDOUT)


def _accepted_holdouts() -> dict[str, frozenset[Verdict]]:
    """Map each holdout to its accepted verdicts; contested cards score several."""
    return {relation_id: accepted_holdout_verdicts(relation_id) for relation_id, _ in HOLDOUT}


def _ordered_accepted(relation_id: str) -> list[Verdict]:
    """Canonical verdict first, then alternates, for persistence and rendering."""
    canonical = dict(HOLDOUT)[relation_id]
    alternates = sorted(accepted_holdout_verdicts(relation_id) - {canonical})
    return [canonical, *alternates]


def _shot_relation_ids() -> set[str]:
    return {relation_id for relation_id, _ in FEW_SHOT}


def _handoff_paths(directory: Path) -> tuple[Path, Path, Path, Path]:
    votes_path = directory / "votes.jsonl"
    attempts_path = directory / "attempts.jsonl"
    slice_path = directory / "slice.jsonl"
    manifest_path = directory / "manifest.json"
    for required in (votes_path, attempts_path, slice_path, manifest_path):
        if not required.is_file():
            raise ValueError(f"handoff is missing {required.name}")
    return votes_path, attempts_path, slice_path, manifest_path


def _load_manifest(path: Path) -> HandoffManifest:
    try:
        return HandoffManifest.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as error:
        raise ValueError(f"invalid manifest.json: {error}") from error


def _validate_slice(
    slice_rows: Sequence[SliceRow],
    manifest: HandoffManifest,
) -> dict[str, SliceRow]:
    duplicate_relations = _duplicates(row.relation_id for row in slice_rows)
    if duplicate_relations:
        raise ValueError(
            f"slice.jsonl contains duplicate relation_id values: {duplicate_relations}"
        )

    slice_by_relation = {row.relation_id: row for row in slice_rows}
    expected_relations = set(manifest.expected_grid.relation_ids)
    if set(slice_by_relation) != expected_relations:
        missing = sorted(expected_relations - set(slice_by_relation))
        unexpected = sorted(set(slice_by_relation) - expected_relations)
        raise ValueError(
            "slice.jsonl does not match expected_grid.relation_ids: "
            f"missing={missing}, unexpected={unexpected}"
        )

    contaminated = sorted(set(slice_by_relation) & _shot_relation_ids())
    if contaminated:
        raise ValueError(f"pilot slice contains few-shot relation IDs: {contaminated}")

    actual_holdouts = {row.relation_id: row.holdout_verdict for row in slice_rows if row.is_holdout}
    expected_holdouts = _expected_holdouts()
    if actual_holdouts != expected_holdouts:
        raise ValueError(
            "slice holdouts must exactly match the six rubric-v1 anchors: "
            f"expected={expected_holdouts}, observed={actual_holdouts}"
        )
    derivation = manifest.slice_derivation
    if {row.sampling_seed for row in slice_rows} != {derivation.sampling_seed}:
        raise ValueError("slice sampling seeds do not match manifest.slice_derivation")
    selection_hash = sha256_bytes(
        canonical_json_bytes([row.model_dump(mode="json") for row in slice_rows])
    )
    if selection_hash != derivation.selection_hash:
        raise ValueError("slice rows do not match manifest.slice_derivation selection hash")
    return slice_by_relation


type LogicalCell = tuple[str, str, str, str, int]


def _vote_cell(vote: VoteRow) -> LogicalCell:
    return (
        vote.relation_id,
        vote.family_id,
        vote.bundle_id,
        vote.effort,
        vote.repeat_index,
    )


@dataclass(frozen=True)
class CellContract:
    grid_relations: frozenset[str]
    grid_families: frozenset[str]
    grid_bundles: frozenset[str]
    grid_effort: str
    grid_repeat_index: int
    repeat_relations: frozenset[str]
    repeat_families: frozenset[str]
    repeat_bundle: str
    repeat_effort: str
    repeat_indices: frozenset[int]
    effort_relations: frozenset[str]
    effort_by_family: dict[str, str]
    effort_bundle: str | None
    effort_repeat_index: int | None

    @classmethod
    def from_manifest(cls, manifest: HandoffManifest) -> Self:
        grid = manifest.expected_grid
        repeat = manifest.expected_repeat_arm
        effort = manifest.expected_effort_arm
        return cls(
            grid_relations=frozenset(grid.relation_ids),
            grid_families=frozenset(grid.families),
            grid_bundles=frozenset(grid.bundles),
            grid_effort=grid.effort,
            grid_repeat_index=grid.repeat_index,
            repeat_relations=frozenset(repeat.relation_ids),
            repeat_families=frozenset(repeat.families),
            repeat_bundle=repeat.bundle_id,
            repeat_effort=repeat.effort,
            repeat_indices=frozenset(repeat.repeat_indices),
            effort_relations=frozenset(effort.relation_ids if effort is not None else ()),
            effort_by_family=dict(effort.family_efforts) if effort is not None else {},
            effort_bundle=effort.bundle_id if effort is not None else None,
            effort_repeat_index=effort.repeat_index if effort is not None else None,
        )

    def contains(self, cell: LogicalCell) -> bool:
        relation_id, family_id, bundle_id, effort, repeat_index = cell
        is_grid = (
            relation_id in self.grid_relations
            and family_id in self.grid_families
            and bundle_id in self.grid_bundles
            and effort == self.grid_effort
            and repeat_index == self.grid_repeat_index
        )
        is_repeat = (
            relation_id in self.repeat_relations
            and family_id in self.repeat_families
            and bundle_id == self.repeat_bundle
            and effort == self.repeat_effort
            and repeat_index in self.repeat_indices
        )
        is_effort = (
            relation_id in self.effort_relations
            and self.effort_by_family.get(family_id) == effort
            and bundle_id == self.effort_bundle
            and repeat_index == self.effort_repeat_index
        )
        return is_grid or is_repeat or is_effort

    def auxiliary_cells(self) -> Iterator[LogicalCell]:
        yield from (
            (relation_id, family_id, self.repeat_bundle, self.repeat_effort, repeat_index)
            for relation_id in self.repeat_relations
            for family_id in self.repeat_families
            for repeat_index in self.repeat_indices
        )
        if self.effort_bundle is not None and self.effort_repeat_index is not None:
            yield from (
                (
                    relation_id,
                    family_id,
                    self.effort_bundle,
                    effort,
                    self.effort_repeat_index,
                )
                for relation_id in self.effort_relations
                for family_id, effort in self.effort_by_family.items()
            )


def _validate_vote(
    vote: VoteRow,
    manifest: HandoffManifest,
    slice_by_relation: Mapping[str, SliceRow],
) -> None:
    if vote.relation_id not in slice_by_relation and vote.relation_id not in _shot_relation_ids():
        raise ValueError(f"vote {vote.vote_id} references unknown relation {vote.relation_id}")
    slice_row = slice_by_relation.get(vote.relation_id)
    if slice_row is not None and vote.card_hash != slice_row.card_hash:
        raise ValueError(f"vote {vote.vote_id} card_hash does not match slice.jsonl")
    if vote.family_id not in manifest.expected_grid.families:
        raise ValueError(f"vote {vote.vote_id} has unexpected family_id {vote.family_id}")
    if vote.bundle_id not in manifest.expected_grid.bundles:
        raise ValueError(f"vote {vote.vote_id} has unexpected bundle_id {vote.bundle_id}")
    if vote.prompt_pack_hash != manifest.prompt_pack_hash:
        raise ValueError(f"vote {vote.vote_id} prompt_pack_hash does not match manifest")
    if vote.rubric_version != manifest.rubric_version:
        raise ValueError(f"vote {vote.vote_id} rubric_version does not match manifest")


def _validate_votes(
    votes: Sequence[VoteRow],
    manifest: HandoffManifest,
    slice_by_relation: Mapping[str, SliceRow],
) -> None:
    duplicate_vote_ids = _duplicates(vote.vote_id for vote in votes)
    if duplicate_vote_ids:
        raise ValueError(f"votes.jsonl contains duplicate vote_id values: {duplicate_vote_ids}")
    for vote in votes:
        _validate_vote(vote, manifest, slice_by_relation)

    contract = CellContract.from_manifest(manifest)
    actual: set[LogicalCell] = set()
    for vote in votes:
        if vote.relation_id in _shot_relation_ids():
            continue
        cell = _vote_cell(vote)
        if cell in actual:
            raise ValueError("votes.jsonl contains duplicate logical cells across pilot arms")
        if not contract.contains(cell):
            raise ValueError(f"votes.jsonl contains unexpected pilot-arm cell: {cell}")
        actual.add(cell)

    missing_auxiliary = sum(cell not in actual for cell in contract.auxiliary_cells())
    if missing_auxiliary:
        raise ValueError(f"votes.jsonl is missing {missing_auxiliary} repeat/effort arm cells")


def _validate_attempts(
    attempts: Sequence[PhysicalAttemptRow],
    votes: Sequence[VoteRow],
) -> dict[str, tuple[PhysicalAttemptRow, ...]]:
    duplicates = _duplicates(attempt.attempt_id for attempt in attempts)
    if duplicates:
        raise ValueError(f"attempts.jsonl contains duplicate attempt_id values: {duplicates}")
    votes_by_id = {vote.vote_id: vote for vote in votes}
    grouped: dict[str, list[PhysicalAttemptRow]] = defaultdict(list)
    for attempt in attempts:
        vote = votes_by_id.get(attempt.vote_id)
        if vote is None:
            raise ValueError(
                f"attempt {attempt.attempt_id} references unknown vote {attempt.vote_id}"
            )
        if attempt.family_id != vote.family_id:
            raise ValueError(f"attempt {attempt.attempt_id} family does not match its vote")
        grouped[attempt.vote_id].append(attempt)

    reconciled: dict[str, tuple[PhysicalAttemptRow, ...]] = {}
    for vote in votes:
        vote_attempts = grouped.get(vote.vote_id, [])
        if not vote_attempts:
            raise ValueError(f"vote {vote.vote_id} has no physical attempt evidence")
        for stage in ("initial", "repair"):
            stage_attempts = [
                attempt for attempt in vote_attempts if attempt.request_stage == stage
            ]
            indices = [attempt.stage_attempt for attempt in stage_attempts]
            if indices != list(range(len(indices))):
                raise ValueError(
                    f"attempts for {vote.vote_id}/{stage} are not a contiguous journal"
                )
        successful_results = [
            attempt.result
            for attempt in vote_attempts
            if attempt.failure is None and attempt.result is not None
        ]
        if successful_results != vote.attempt_results:
            raise ValueError(f"vote {vote.vote_id} native results do not match attempts.jsonl")
        reconciled[vote.vote_id] = tuple(vote_attempts)
    return reconciled


def _validate_recorded_hash(manifest: HandoffManifest, path: Path) -> None:
    expected = manifest.source_hashes.get(path.name)
    if expected is None:
        raise ValueError(f"manifest does not record {path.name} hash")
    if sha256_file(path) != expected:
        raise ValueError(f"{path.name} does not match the hash recorded in manifest.json")


def load_handoff(path: PathLike) -> Handoff:
    """Load and cross-validate a handoff directory without performing statistics."""
    votes_path, attempts_path, slice_path, manifest_path = _handoff_paths(Path(path))
    manifest = _load_manifest(manifest_path)
    for recorded in (votes_path, attempts_path, slice_path):
        _validate_recorded_hash(manifest, recorded)
    slice_rows = _load_jsonl(slice_path, SliceRow)
    votes = _load_jsonl(votes_path, VoteRow)
    attempts = _load_jsonl(attempts_path, PhysicalAttemptRow)
    slice_by_relation = _validate_slice(slice_rows, manifest)
    _validate_votes(votes, manifest, slice_by_relation)
    attempts_by_vote = _validate_attempts(attempts, votes)
    return Handoff(
        manifest=manifest,
        slice_rows=tuple(sorted(slice_rows, key=lambda row: row.relation_id)),
        votes=tuple(sorted(votes, key=lambda vote: vote.vote_id)),
        attempts_by_vote=attempts_by_vote,
        input_hashes={
            "attempts.jsonl": sha256_file(attempts_path),
            "manifest.json": sha256_file(manifest_path),
            "slice.jsonl": sha256_file(slice_path),
            "votes.jsonl": sha256_file(votes_path),
        },
    )


def _nominal(vote: VoteRow) -> Verdict | None:
    if vote.verdict == "ABSTAIN":
        return None

    return vote.verdict


def _matches_route_pin(
    vote: VoteRow,
    attempts: Sequence[PhysicalAttemptRow],
    *,
    model: str,
    provider_slug: str,
    provider_name: str,
) -> bool:
    """Re-check a persisted vote against the exact live routing contract.

    Route acceptance is delegated to the transport's rule so the analysis
    cannot drift from what the executor enforced. Only accepted completions
    are judged: rejected results carried by recovered votes are evidence of a
    provider failure, not of the accepted answer's route.
    """
    if vote.model_returned != model or vote.provider != provider_name:
        return False
    if any(
        attempt.model_requested != model or attempt.provider_slug != provider_slug
        for attempt in attempts
    ):
        return False
    accepted_results = [
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    ]
    return bool(accepted_results) and all(
        matches_pinned_route(result, model=model, provider_name=provider_name)
        for result in accepted_results
    )


def _card_values[Value](
    values: Iterable[tuple[str, Value]],
) -> dict[str, list[Value]]:
    grouped: dict[str, list[Value]] = defaultdict(list)
    for relation_id, value in values:
        grouped[relation_id].append(value)

    return dict(grouped)


def _bootstrap_kwargs(policy: AnalysisPolicy) -> BootstrapOptions:
    return {
        "resamples": policy.bootstrap_resamples,
        "seed": policy.bootstrap_seed,
        "ci_level": policy.ci_level,
        "minimum_defined_rate": policy.minimum_bootstrap_defined_rate,
    }


def _partition_votes(handoff: Handoff) -> VotePartitions:
    pins = {
        judge.family_id: (judge.model, judge.provider_slug, judge.provider_name)
        for judge in handoff.manifest.judges
    }
    shot_ids = _shot_relation_ids()
    contaminated = [vote for vote in handoff.votes if vote.relation_id in shot_ids]
    candidates = [vote for vote in handoff.votes if vote.relation_id not in shot_ids]

    def route_matches(vote: VoteRow) -> bool:
        model, provider_slug, provider_name = pins[vote.family_id]
        return _matches_route_pin(
            vote,
            handoff.attempts_by_vote[vote.vote_id],
            model=model,
            provider_slug=provider_slug,
            provider_name=provider_name,
        )

    routing_bad = [vote for vote in candidates if not route_matches(vote)]
    clean = [vote for vote in candidates if route_matches(vote)]
    grid = handoff.manifest.expected_grid

    def is_grid_vote(vote: VoteRow) -> bool:
        return (
            vote.relation_id in grid.relation_ids
            and vote.family_id in grid.families
            and vote.bundle_id in grid.bundles
            and vote.effort == grid.effort
            and vote.repeat_index == grid.repeat_index
        )

    raw_grid = [vote for vote in candidates if is_grid_vote(vote)]
    clean_grid = [vote for vote in clean if is_grid_vote(vote)]
    return VotePartitions(
        clean=clean,
        raw_grid=raw_grid,
        clean_grid=clean_grid,
        contaminated=contaminated,
        routing_bad=routing_bad,
    )


def _coverage_health(
    manifest: HandoffManifest,
    raw_grid: Sequence[VoteRow],
    clean_grid: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[list[CoverageStream], list[str]]:
    raw_keys = {(vote.family_id, vote.bundle_id, vote.relation_id) for vote in raw_grid}
    clean_keys = {(vote.family_id, vote.bundle_id, vote.relation_id) for vote in clean_grid}
    coverage: list[CoverageStream] = []
    reruns: list[str] = []
    expected = len(manifest.expected_grid.relation_ids)
    for family_id in sorted(manifest.expected_grid.families):
        for bundle_id in sorted(manifest.expected_grid.bundles):
            expected_keys = {
                (family_id, bundle_id, relation_id)
                for relation_id in manifest.expected_grid.relation_ids
            }
            raw_observed = len(expected_keys & raw_keys)
            observed = len(expected_keys & clean_keys)
            missing = expected - observed
            missing_rate = missing / expected
            rerun = missing_rate > policy.stream_missing_rerun_rate
            coverage.append(
                CoverageStream(
                    family_id=family_id,
                    bundle_id=bundle_id,
                    expected=expected,
                    raw_observed=raw_observed,
                    routing_dropped=raw_observed - observed,
                    observed=observed,
                    missing=missing,
                    missing_rate=missing_rate,
                    rerun_required=rerun,
                )
            )
            if rerun:
                reruns.append(f"{family_id}/{bundle_id}={missing_rate:.3%}")
    return coverage, reruns


def _routing_health(
    handoff: Handoff,
    grid_votes: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[list[RoutingStream], list[str]]:
    manifest = handoff.manifest
    pins = {
        judge.family_id: (judge.model, judge.provider_slug, judge.provider_name)
        for judge in manifest.judges
    }
    routing: list[RoutingStream] = []
    reruns: list[str] = []
    for family_id in sorted(manifest.expected_grid.families):
        for bundle_id in sorted(manifest.expected_grid.bundles):
            stream = [
                vote
                for vote in grid_votes
                if vote.family_id == family_id and vote.bundle_id == bundle_id
            ]
            model, provider_slug, provider_name = pins[family_id]
            violations = sum(
                not _matches_route_pin(
                    vote,
                    handoff.attempts_by_vote[vote.vote_id],
                    model=model,
                    provider_slug=provider_slug,
                    provider_name=provider_name,
                )
                for vote in stream
            )
            violation_rate = violations / len(stream) if stream else 0.0
            rerun = violation_rate > policy.routing_rerun_rate
            routing.append(
                RoutingStream(
                    family_id=family_id,
                    bundle_id=bundle_id,
                    observed=len(stream),
                    violations=violations,
                    violation_rate=violation_rate,
                    rerun_required=rerun,
                )
            )
            if rerun:
                reruns.append(f"{family_id}/{bundle_id}={violation_rate:.3%}")
    return routing, reruns


def _require_healthy_streams(missing: Sequence[str], routing: Sequence[str]) -> None:
    if missing:
        raise ValueError(
            "phase-0 coverage requires stream reruns (>2% missing): " + ", ".join(missing)
        )
    if routing:
        raise ValueError(
            "phase-0 routing requires stream reruns (>0.5% violations): " + ", ".join(routing)
        )


def _family_bundle_health(
    manifest: HandoffManifest,
    clean: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[list[FamilyBundleHealth], list[str]]:
    bootstrap = _bootstrap_kwargs(policy)
    results: list[FamilyBundleHealth] = []
    warnings: list[str] = []
    for family_id in sorted(manifest.expected_grid.families):
        for bundle_id in sorted(manifest.expected_grid.bundles):
            stream = [
                vote
                for vote in clean
                if vote.family_id == family_id and vote.bundle_id == bundle_id
            ]
            abstention = bootstrap_rate(
                _card_values((vote.relation_id, vote.abstained) for vote in stream),
                **bootstrap,
            )
            retry = bootstrap_rate(
                _card_values((vote.relation_id, vote.parse_retries == 1) for vote in stream),
                **bootstrap,
            )
            flagged = abstention.est is not None and abstention.est > policy.abstention_flag_rate
            if flagged:
                warnings.append(
                    f"{family_id}/{bundle_id} abstention {abstention.est:.3%} exceeds 5%"
                )
            results.append(
                FamilyBundleHealth(
                    family_id=family_id,
                    bundle_id=bundle_id,
                    n=len(stream),
                    abstention_rate=abstention,
                    parse_retry_rate=retry,
                    prompt_compat_flag=flagged,
                )
            )
    return results, warnings


def _duration_estimate(estimate: Estimate) -> DurationEstimate:
    return DurationEstimate(
        est=timedelta(seconds=estimate.est) if estimate.est is not None else None,
        lo=timedelta(seconds=estimate.lo) if estimate.lo is not None else None,
        hi=timedelta(seconds=estimate.hi) if estimate.hi is not None else None,
        n=estimate.n,
        bootstrap_resamples=estimate.bootstrap_resamples,
        bootstrap_defined=estimate.bootstrap_defined,
    )


def _one_family_cost_health(
    family_id: str,
    votes: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> FamilyCostHealth:
    bootstrap = _bootstrap_kwargs(policy)
    costs = _card_values(
        (vote.relation_id, cost)
        for vote, cost in ((vote, _vote_reported_cost(vote)) for vote in votes)
        if cost is not None
    )
    tokens = _card_values(
        (vote.relation_id, float(vote.tokens_in + vote.tokens_out)) for vote in votes
    )
    inflation = _card_values(
        (
            vote.relation_id,
            (vote.tokens_in + vote.tokens_out) / policy.estimated_tokens_per_vote,
        )
        for vote in votes
    )
    latency = _card_values((vote.relation_id, vote.latency.total_seconds()) for vote in votes)
    return FamilyCostHealth(
        family_id=family_id,
        n=len(votes),
        cost_reported_n=sum(_vote_reported_cost(vote) is not None for vote in votes),
        mean_cost_usd=bootstrap_mean(costs, **bootstrap),
        tokens_per_vote=bootstrap_mean(tokens, **bootstrap),
        token_inflation_factor=bootstrap_mean(inflation, **bootstrap),
        latency=_duration_estimate(bootstrap_mean(latency, **bootstrap)),
    )


def _family_cost_health(
    manifest: HandoffManifest,
    clean: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> list[FamilyCostHealth]:
    return [
        _one_family_cost_health(
            family_id,
            [vote for vote in clean if vote.family_id == family_id],
            policy,
        )
        for family_id in sorted(manifest.expected_grid.families)
    ]


def _reason_health(
    votes: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[int, Estimate]:
    over_limit = [vote for vote in votes if len(vote.reason.split()) > MAX_REASON_WORDS]
    rate_by_card = _card_values(
        (vote.relation_id, len(vote.reason.split()) > MAX_REASON_WORDS)
        for vote in votes
        if vote.relation_id not in _shot_relation_ids()
    )
    return len(over_limit), bootstrap_rate(rate_by_card, **_bootstrap_kwargs(policy))


def _clean_votes(
    handoff: Handoff,
    policy: AnalysisPolicy,
) -> tuple[list[VoteRow], DataHealth]:
    partitions = _partition_votes(handoff)
    coverage, missing_reruns = _coverage_health(
        handoff.manifest,
        partitions.raw_grid,
        partitions.clean_grid,
        policy,
    )
    routing, routing_reruns = _routing_health(
        handoff,
        partitions.raw_grid,
        policy,
    )
    _require_healthy_streams(missing_reruns, routing_reruns)
    family_bundle, warnings = _family_bundle_health(handoff.manifest, partitions.clean, policy)
    family_cost = _family_cost_health(handoff.manifest, partitions.clean, policy)
    reasons_over_limit, reason_rate = _reason_health(handoff.votes, policy)
    if partitions.contaminated:
        warnings.append(f"dropped {len(partitions.contaminated)} contaminated few-shot vote(s)")
    if partitions.routing_bad:
        warnings.append(f"dropped {len(partitions.routing_bad)} routing violation(s)")
    return partitions.clean, DataHealth(
        votes_loaded=len(handoff.votes),
        clean_votes=len(partitions.clean),
        duplicate_vote_ids=[],
        contaminated_vote_ids=sorted(vote.vote_id for vote in partitions.contaminated),
        routing_violations=len(partitions.routing_bad),
        reasons_over_60_words=reasons_over_limit,
        reason_over_60_word_rate=reason_rate,
        coverage=coverage,
        routing=routing,
        family_bundle=family_bundle,
        family_cost=family_cost,
        warnings=sorted(warnings),
    )


def _vote_lookup(votes: Iterable[VoteRow]) -> dict[LogicalCell, VoteRow]:
    lookup: dict[LogicalCell, VoteRow] = {}
    for vote in votes:
        cell = _vote_cell(vote)
        if cell in lookup:
            raise ValueError(f"duplicate logical vote cell {cell}")
        lookup[cell] = vote
    return lookup


def _qualify(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
) -> list[QualificationResult]:
    accepted = _accepted_holdouts()
    lookup = _vote_lookup(clean_votes)
    results: list[QualificationResult] = []
    baseline_effort = handoff.manifest.expected_grid.effort
    for family_id in sorted(handoff.manifest.expected_grid.families):
        bundle_correctness: dict[BundleId, dict[str, bool]] = {}
        for bundle_id in BUNDLES:
            if bundle_id not in handoff.manifest.expected_grid.bundles:
                continue
            correctness: dict[str, bool] = {}
            for relation_id, accepted_verdicts in sorted(accepted.items()):
                vote = lookup.get((relation_id, family_id, bundle_id, baseline_effort, 0))
                correctness[relation_id] = vote is not None and _nominal(vote) in accepted_verdicts
            bundle_correctness[bundle_id] = correctness

        qualification_bundle = bundle_correctness[QUALIFICATION_BUNDLE]
        correct_count = sum(qualification_bundle.values())
        p1382 = qualification_bundle["wikidata:P1382"]
        p2634 = qualification_bundle["wikidata:P2634"]
        holdout_verdicts: dict[str, VoteVerdict | None] = {}
        for relation_id in sorted(accepted):
            vote = lookup.get((relation_id, family_id, QUALIFICATION_BUNDLE, baseline_effort, 0))
            holdout_verdicts[relation_id] = vote.verdict if vote is not None else None
        results.append(
            QualificationResult(
                family_id=family_id,
                correct_count=correct_count,
                total_count=len(accepted),
                p1382_correct=p1382,
                p2634_correct=p2634,
                passed=correct_count >= HOLDOUT_PASS_COUNT and p1382 and p2634,
                bundle_correctness=bundle_correctness,
                holdout_expected={
                    relation_id: _ordered_accepted(relation_id) for relation_id in sorted(accepted)
                },
                holdout_verdicts=holdout_verdicts,
            )
        )
    return results


def _analysis_votes(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: set[str],
) -> list[VoteRow]:
    holdouts = {row.relation_id for row in handoff.slice_rows if row.is_holdout}
    return [
        vote
        for vote in clean_votes
        if vote.family_id in passed_families
        and vote.effort == handoff.manifest.expected_grid.effort
        and vote.repeat_index == 0
        and vote.relation_id not in holdouts
        and vote.verdict != "ABSTAIN"
    ]


def _entropy_strata(
    handoff: Handoff,
    eligible_votes: Sequence[VoteRow],
) -> EntropyStrata:
    by_card: dict[str, list[Verdict]] = defaultdict(list)
    for vote in eligible_votes:
        verdict = _nominal(vote)
        if verdict is not None:
            by_card[vote.relation_id].append(verdict)
    relation_ids = [row.relation_id for row in handoff.slice_rows if not row.is_holdout]
    if not relation_ids:
        raise ValueError("pilot slice has no non-holdout cards")
    entropies: dict[str, float] = {}
    for relation_id in relation_ids:
        entropy = normalized_entropy(by_card.get(relation_id, []))
        if entropy is None:
            raise ValueError(f"eligible panel has no nominal votes for {relation_id}")
        entropies[relation_id] = entropy
    entropy_values = np.asarray(list(entropies.values()), dtype=np.float64)
    lower, upper = np.quantile(entropy_values, np.asarray([1 / 3, 2 / 3])).tolist()
    cuts = (float(lower), float(upper))
    contested_count = max(1, math.ceil(len(entropies) / 3))
    ranked = sorted(entropies, key=lambda relation_id: (-entropies[relation_id], relation_id))
    contested = set(ranked[:contested_count])
    return EntropyStrata(
        entropy_by_relation=entropies,
        contested_relations=contested,
        tercile_cuts=cuts,
    )


def _marginal(
    votes: Sequence[VoteRow],
    *,
    axis: MarginalAxis,
    level: str,
    select: Callable[[VoteRow], bool],
    policy: AnalysisPolicy,
) -> list[MarginalResult]:
    selected = [vote for vote in votes if select(vote)]
    bootstrap = _bootstrap_kwargs(policy)
    return [
        MarginalResult(
            axis=axis,
            level=level,
            verdict=verdict,
            rate=bootstrap_rate(
                _card_values((vote.relation_id, vote.verdict == verdict) for vote in selected),
                **bootstrap,
            ),
        )
        for verdict in VERDICTS
    ]


def _pair_observations(
    votes: Sequence[VoteRow],
    *,
    axis: MarginalAxis,
    first: str,
    second: str,
    expected_per_card: int,
) -> PairObservations:
    selected: dict[tuple[str, ...], dict[str, Verdict]] = defaultdict(dict)
    for vote in votes:
        verdict = _nominal(vote)
        if verdict is None:
            continue
        if axis == "shell":
            level = vote.shell_id
            key = (vote.relation_id, vote.family_id, vote.framing_id)
        elif axis == "template":
            level = vote.framing_id
            key = (vote.relation_id, vote.family_id, vote.shell_id)
        elif axis == "family":
            level = vote.family_id
            key = (vote.relation_id, vote.bundle_id)
        else:
            raise ValueError(f"unsupported pair axis {axis}")
        selected[key][level] = verdict

    observations: dict[str, list[bool]] = defaultdict(list)
    for key, levels in selected.items():
        if first in levels and second in levels:
            observations[key[0]].append(levels[first] != levels[second])
    relation_ids = {vote.relation_id for vote in votes}
    return PairObservations(
        values=dict(observations),
        expected_by_card=dict.fromkeys(relation_ids, expected_per_card),
    )


def _repeat_observations(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: set[str],
) -> PairObservations:
    repeat = handoff.manifest.expected_repeat_arm
    repeat_relations = set(repeat.relation_ids)
    allowed_indices = {0, *repeat.repeat_indices}
    grouped: dict[tuple[str, str], list[tuple[int, Verdict]]] = defaultdict(list)
    for vote in clean_votes:
        verdict = _nominal(vote)
        if (
            verdict is None
            or vote.family_id not in passed_families
            or vote.relation_id not in repeat_relations
            or vote.bundle_id != repeat.bundle_id
            or vote.effort != repeat.effort
            or vote.repeat_index not in allowed_indices
        ):
            continue
        grouped[(vote.relation_id, vote.family_id)].append((vote.repeat_index, verdict))

    observations: dict[str, list[bool]] = defaultdict(list)
    for (relation_id, _), repeats in grouped.items():
        for (_, first), (_, second) in itertools.combinations(sorted(repeats), 2):
            observations[relation_id].append(first != second)
    comparisons = len(list(itertools.combinations((0, *repeat.repeat_indices), 2)))
    return PairObservations(
        values=dict(observations),
        expected_by_card={
            relation_id: len(passed_families) * comparisons for relation_id in repeat.relation_ids
        },
    )


def _subset_observations[Value](
    observations: Mapping[str, Sequence[Value]], relation_ids: set[str]
) -> dict[str, Sequence[Value]]:
    return {
        relation_id: values
        for relation_id, values in observations.items()
        if relation_id in relation_ids
    }


def _flip_results(
    handoff: Handoff,
    observations: PairObservations,
    *,
    axis: FlipAxis,
    level_pair: str,
    contested: set[str],
    policy: AnalysisPolicy,
) -> list[FlipResult]:
    bootstrap = _bootstrap_kwargs(policy)
    all_relations = set(observations.expected_by_card)
    strata: dict[ContestStratum, set[str]] = {
        "all": all_relations,
        "contested": contested,
        "non-contested": all_relations - contested,
    }

    def result(
        name: ContestStratum,
        relation_ids: set[str],
        prescreen: str | None,
    ) -> FlipResult:
        matched = sum(len(observations.values.get(relation_id, ())) for relation_id in relation_ids)
        expected = sum(
            observations.expected_by_card.get(relation_id, 0) for relation_id in relation_ids
        )
        return FlipResult(
            axis=axis,
            level_pair=level_pair,
            contest_stratum=name,
            prescreen_stratum=prescreen,
            rate=bootstrap_rate(
                _subset_observations(observations.values, relation_ids), **bootstrap
            ),
            expected_pairs=expected,
            matched_pairs=matched,
            missing_pairs=expected - matched,
        )

    results = [result(name, relation_ids, None) for name, relation_ids in strata.items()]
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    for prescreen in sorted({row.prescreen_stratum for row in handoff.slice_rows}):
        relation_ids = {
            relation_id
            for relation_id in all_relations
            if slice_by_relation[relation_id].prescreen_stratum == prescreen
        }
        results.append(result("all", relation_ids, prescreen))
    return results


def _combined(observations: Iterable[PairObservations]) -> PairObservations:
    combined: dict[str, list[bool]] = defaultdict(list)
    expected: dict[str, int] = defaultdict(int)
    for group in observations:
        for relation_id, values in group.values.items():
            combined[relation_id].extend(values)
        for relation_id, count in group.expected_by_card.items():
            expected[relation_id] += count
    return PairObservations(values=dict(combined), expected_by_card=dict(expected))


def _kappa_pairs(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    relation_ids: Sequence[str],
    *,
    left_family: str,
    left_bundle: BundleId,
    right_family: str,
    right_bundle: BundleId,
    effort: str,
) -> dict[str, list[tuple[Verdict, Verdict]]]:
    pairs: dict[str, list[tuple[Verdict, Verdict]]] = {}
    for relation_id in relation_ids:
        left = lookup.get((relation_id, left_family, left_bundle, effort, 0))
        right = lookup.get((relation_id, right_family, right_bundle, effort, 0))
        if left is None or right is None:
            continue
        left_verdict, right_verdict = _nominal(left), _nominal(right)
        if left_verdict is not None and right_verdict is not None:
            pairs[relation_id] = [(left_verdict, right_verdict)]
    return pairs


def _one_bundle_kappa_matrix(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    relation_ids: Sequence[str],
    family_id: str,
    effort: str,
    policy: AnalysisPolicy,
) -> dict[BundleId, dict[BundleId, Estimate]]:
    matrix: dict[BundleId, dict[BundleId, Estimate]] = {}
    for first in BUNDLES:
        row: dict[BundleId, Estimate] = {}
        for second in BUNDLES:
            if second in matrix:
                row[second] = matrix[second][first]
            else:
                pairs = _kappa_pairs(
                    lookup,
                    relation_ids,
                    left_family=family_id,
                    left_bundle=first,
                    right_family=family_id,
                    right_bundle=second,
                    effort=effort,
                )
                row[second] = bootstrap_cohen_kappa(pairs, **_bootstrap_kwargs(policy))
        matrix[first] = row
    return matrix


def _bundle_kappas(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    relation_ids: Sequence[str],
    passed_families: Sequence[str],
    effort: str,
    policy: AnalysisPolicy,
) -> dict[str, dict[BundleId, dict[BundleId, Estimate]]]:
    return {
        family_id: _one_bundle_kappa_matrix(lookup, relation_ids, family_id, effort, policy)
        for family_id in passed_families
    }


def _family_kappas(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    relation_ids: Sequence[str],
    passed_families: Sequence[str],
    effort: str,
    policy: AnalysisPolicy,
) -> dict[str, dict[str, Estimate]]:
    matrix: dict[str, dict[str, Estimate]] = {}
    for first in passed_families:
        row: dict[str, Estimate] = {}
        for second in passed_families:
            if second in matrix:
                row[second] = matrix[second][first]
            else:
                pairs = _kappa_pairs(
                    lookup,
                    relation_ids,
                    left_family=first,
                    left_bundle=QUALIFICATION_BUNDLE,
                    right_family=second,
                    right_bundle=QUALIFICATION_BUNDLE,
                    effort=effort,
                )
                row[second] = bootstrap_cohen_kappa(pairs, **_bootstrap_kwargs(policy))
        matrix[first] = row
    return matrix


def _agreement(
    handoff: Handoff,
    qualified_votes: Sequence[VoteRow],
    all_candidate_votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    policy: AnalysisPolicy,
) -> AgreementResults:
    lookup = _vote_lookup(qualified_votes)
    relation_ids = sorted({vote.relation_id for vote in qualified_votes})
    effort = handoff.manifest.expected_grid.effort
    qualified_ratings = _card_values(
        (vote.relation_id, vote.verdict) for vote in qualified_votes if vote.verdict != "ABSTAIN"
    )
    all_candidate_ratings = _card_values(
        (vote.relation_id, vote.verdict)
        for vote in all_candidate_votes
        if vote.verdict != "ABSTAIN"
    )
    bootstrap = _bootstrap_kwargs(policy)
    return AgreementResults(
        bundle_kappa_by_family=_bundle_kappas(
            lookup, relation_ids, passed_families, effort, policy
        ),
        qualification_family_kappa=_family_kappas(
            lookup, relation_ids, passed_families, effort, policy
        ),
        all_candidate_krippendorff_alpha=bootstrap_krippendorff_alpha(
            all_candidate_ratings, **bootstrap
        ),
        qualified_panel_krippendorff_alpha=bootstrap_krippendorff_alpha(
            qualified_ratings, **bootstrap
        ),
    )


def _pairwise_disagreement(values: Sequence[Verdict]) -> float | None:
    total_pairs = len(values) * (len(values) - 1) // 2
    if total_pairs == 0:
        return None
    agreeing_pairs = sum(count * (count - 1) // 2 for count in Counter(values).values())
    return (total_pairs - agreeing_pairs) / total_pairs


def _card_axis_disagreement(values: Sequence[tuple[str, str, Verdict]]) -> float | None:
    by_condition: dict[tuple[str, str], list[Verdict]] = defaultdict(list)
    for family_id, bundle_id, verdict in values:
        by_condition[(family_id, bundle_id)].append(verdict)

    disagreeing_pairs = 0.0
    total_pairs = 0
    for verdicts in by_condition.values():
        condition_pairs = len(verdicts) * (len(verdicts) - 1) // 2
        disagreement = _pairwise_disagreement(verdicts)
        if disagreement is not None:
            disagreeing_pairs += disagreement * condition_pairs
            total_pairs += condition_pairs
    return disagreeing_pairs / total_pairs if total_pairs else None


def _admission(
    *,
    axis: AdmissionAxis,
    level: str,
    candidate: Estimate,
    family_rate: Estimate,
    policy: AnalysisPolicy,
) -> AdmissionDecision:
    reasons: list[str] = []
    if candidate.est is None or candidate.lo is None or candidate.hi is None:
        reasons.append("candidate flip rate is undefined")
    elif candidate.hi > policy.absolute_flip_ceiling:
        reasons.append(
            f"upper CI {candidate.hi:.6f} exceeds absolute ceiling "
            f"{policy.absolute_flip_ceiling:.6f}"
        )
    if family_rate.est is None or family_rate.lo is None or family_rate.hi is None:
        reasons.append("family flip rate is undefined")
    elif candidate.est is not None and candidate.est >= family_rate.est / 2:
        reasons.append("point estimate is not below half the family flip rate")
    if candidate.hi is not None and family_rate.lo is not None and candidate.hi >= family_rate.lo:
        reasons.append("candidate and family confidence intervals overlap")
    return AdmissionDecision(
        axis=axis,
        level=level,
        admitted=not reasons,
        non_contested_flip=candidate,
        family_flip=family_rate,
        reasons=reasons or ["meets absolute and family-relative admission rules"],
    )


def _scale_estimate(value: Estimate, factor: int) -> Estimate:
    return Estimate(
        est=value.est * factor if value.est is not None else None,
        lo=value.lo * factor if value.lo is not None else None,
        hi=value.hi * factor if value.hi is not None else None,
        n=value.n,
        bootstrap_resamples=value.bootstrap_resamples,
        bootstrap_defined=value.bootstrap_defined,
    )


def _cost_population(
    clean_votes: Sequence[VoteRow],
    *,
    family_id: str,
    selected_effort: str,
    grid_effort: str,
    admitted_bundles: set[BundleId],
) -> list[VoteRow]:
    basis_bundles = admitted_bundles if selected_effort == grid_effort else {QUALIFICATION_BUNDLE}
    return [
        vote
        for vote in clean_votes
        if vote.family_id == family_id
        and vote.effort == selected_effort
        and vote.repeat_index == 0
        and vote.bundle_id in basis_bundles
    ]


def _reported_cost_estimate(
    votes: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> Estimate:
    """Estimate per-vote cost under the policy's reported-known-cost basis."""
    costs = [_vote_reported_cost(vote) for vote in votes]
    if not costs or any(cost is None for cost in costs):
        return Estimate(est=None, lo=None, hi=None, n=len(votes))
    return bootstrap_mean(
        _card_values(
            (vote.relation_id, cast("float", cost)) for vote, cost in zip(votes, costs, strict=True)
        ),
        **_bootstrap_kwargs(policy),
    )


def _total_projected_cost(
    populations: Mapping[str, Sequence[VoteRow]],
    projected_calls: int,
    policy: AnalysisPolicy,
) -> Estimate:
    if any(
        not votes or any(_vote_reported_cost(vote) is None for vote in votes)
        for votes in populations.values()
    ):
        return Estimate(
            est=None,
            lo=None,
            hi=None,
            n=sum(len(votes) for votes in populations.values()),
        )
    observations = _card_values(
        (vote.relation_id, (family_id, cast("float", _vote_reported_cost(vote))))
        for family_id, votes in populations.items()
        for vote in votes
    )

    def total(values: Sequence[tuple[str, float]]) -> float | None:
        by_family: dict[str, list[float]] = defaultdict(list)
        for family_id, cost in values:
            by_family[family_id].append(cost)
        family_means = [mean(by_family[family_id]) for family_id in populations]
        if any(value is None for value in family_means):
            return None
        return math.fsum(cast("list[float]", family_means)) * projected_calls

    return cluster_bootstrap(observations, total, **_bootstrap_kwargs(policy))


def _cost_audit(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    effort_policy: Sequence[EffortDecision],
    admitted_shells: Sequence[ShellId],
    admitted_templates: Sequence[FramingId],
    policy: AnalysisPolicy,
) -> CostAuditResults:
    bootstrap = _bootstrap_kwargs(policy)
    admitted_bundles: set[BundleId] = {
        cast("BundleId", f"{shell}x{template}")
        for shell in admitted_shells
        for template in admitted_templates
    }
    projected_calls = handoff.manifest.full_grid_card_count * len(admitted_bundles)
    grid_effort = handoff.manifest.expected_grid.effort
    populations = {
        decision.family_id: _cost_population(
            clean_votes,
            family_id=decision.family_id,
            selected_effort=decision.selected_effort,
            grid_effort=grid_effort,
            admitted_bundles=admitted_bundles,
        )
        for decision in effort_policy
    }
    audits: list[FamilyCostAudit] = []
    for decision in effort_policy:
        votes = populations[decision.family_id]
        measured = _reported_cost_estimate(votes, policy)
        tokens = _card_values(
            (vote.relation_id, float(vote.tokens_in + vote.tokens_out)) for vote in votes
        )
        inflation = _card_values(
            (
                vote.relation_id,
                (vote.tokens_in + vote.tokens_out) / policy.estimated_tokens_per_vote,
            )
            for vote in votes
        )
        basis_bundles: list[BundleId] = sorted({vote.bundle_id for vote in votes})
        audits.append(
            FamilyCostAudit(
                family_id=decision.family_id,
                selected_effort=decision.selected_effort,
                cost_basis_bundles=basis_bundles,
                n=len(votes),
                cost_reported_n=sum(_vote_reported_cost(vote) is not None for vote in votes),
                measured_cost_per_vote_usd=measured,
                projected_calls=projected_calls,
                projected_cost=_scale_estimate(measured, projected_calls),
                billed_tokens_per_vote=bootstrap_mean(tokens, **bootstrap),
                token_inflation_factor=bootstrap_mean(inflation, **bootstrap),
            )
        )
    return CostAuditResults(
        families=audits,
        projected_cost=_total_projected_cost(populations, projected_calls, policy),
    )


def _holdout_effort_comparison(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    *,
    family_id: str,
    baseline: str,
    effort: str,
) -> HoldoutEffortComparison:
    correct = 0
    rescues = 0
    regressions = 0
    mandatory = {"wikidata:P1382": False, "wikidata:P2634": False}
    for relation_id, accepted_verdicts in _accepted_holdouts().items():
        base_vote = lookup.get((relation_id, family_id, QUALIFICATION_BUNDLE, baseline, 0))
        candidate_vote = lookup.get((relation_id, family_id, QUALIFICATION_BUNDLE, effort, 0))
        base_correct = base_vote is not None and _nominal(base_vote) in accepted_verdicts
        candidate_correct = (
            candidate_vote is not None and _nominal(candidate_vote) in accepted_verdicts
        )
        correct += candidate_correct
        rescues += candidate_correct and not base_correct
        regressions += base_correct and not candidate_correct
        if relation_id in mandatory:
            mandatory[relation_id] = candidate_correct
    return HoldoutEffortComparison(
        correct=correct,
        rescues=rescues,
        regressions=regressions,
        mandatory_probes_correct=all(mandatory.values()),
    )


def _effort_flip_rate(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    *,
    family_id: str,
    baseline: str,
    effort: str,
    bundle_ids: Sequence[BundleId],
    relation_ids: set[str],
    policy: AnalysisPolicy,
) -> Estimate:
    flips: dict[str, list[bool]] = defaultdict(list)
    for relation_id in relation_ids:
        for bundle_id in bundle_ids:
            base_vote = lookup.get((relation_id, family_id, bundle_id, baseline, 0))
            candidate_vote = lookup.get((relation_id, family_id, bundle_id, effort, 0))
            if base_vote is None or candidate_vote is None:
                continue
            base_verdict, candidate_verdict = _nominal(base_vote), _nominal(candidate_vote)
            if base_verdict is not None and candidate_verdict is not None:
                flips[relation_id].append(base_verdict != candidate_verdict)
    return bootstrap_rate(flips, **_bootstrap_kwargs(policy))


def _effort_candidate(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    *,
    family_id: str,
    baseline: str,
    effort: str,
    bundle_ids: Sequence[BundleId],
    non_contested: set[str],
    family_rate: Estimate,
    policy: AnalysisPolicy,
) -> EffortCandidate:
    holdout = _holdout_effort_comparison(
        lookup,
        family_id=family_id,
        baseline=baseline,
        effort=effort,
    )
    flip_rate = _effort_flip_rate(
        lookup,
        family_id=family_id,
        baseline=baseline,
        effort=effort,
        bundle_ids=bundle_ids,
        relation_ids=non_contested,
        policy=policy,
    )
    admission = _admission(
        axis="template",
        level=effort,
        candidate=flip_rate,
        family_rate=family_rate,
        policy=policy,
    )
    reasons = list(admission.reasons)
    if holdout.correct < HOLDOUT_PASS_COUNT or not holdout.mandatory_probes_correct:
        reasons.append("candidate effort fails the qualification-bundle holdout gate")
    if holdout.rescues <= holdout.regressions:
        reasons.append("candidate effort does not produce net holdout rescues")
    if reasons == ["meets absolute and family-relative admission rules"]:
        reasons = ["higher effort passes stability and improves holdout performance"]
    return EffortCandidate(
        effort=effort,
        eligible=(
            admission.admitted
            and holdout.correct >= HOLDOUT_PASS_COUNT
            and holdout.mandatory_probes_correct
            and holdout.rescues > holdout.regressions
        ),
        holdout_correct=holdout.correct,
        flip_rate=flip_rate,
        rescues=holdout.rescues,
        regressions=holdout.regressions,
        reasons=reasons,
    )


def _effort_decision(
    family_id: str,
    baseline: str,
    baseline_correct: int,
    candidates: Sequence[EffortCandidate],
) -> EffortDecision:
    eligible = [candidate for candidate in candidates if candidate.eligible]
    selected = max(
        eligible,
        default=None,
        key=lambda candidate: (candidate.holdout_correct, candidate.effort),
    )
    representative = selected or (candidates[0] if candidates else None)
    return EffortDecision(
        family_id=family_id,
        baseline_effort=baseline,
        selected_effort=selected.effort if selected else baseline,
        candidate_effort=representative.effort if representative else None,
        baseline_holdout_correct=baseline_correct,
        candidate_holdout_correct=(representative.holdout_correct if representative else None),
        non_contested_flip=representative.flip_rate if representative else None,
        rescues=representative.rescues if representative else 0,
        regressions=representative.regressions if representative else 0,
        reasons=(
            representative.reasons
            if representative
            else ["no higher-effort arm was recorded; keep baseline"]
        ),
    )


def _effort_policy(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    qualification: Sequence[QualificationResult],
    passed_families: Sequence[str],
    contested: set[str],
    family_rate: Estimate,
    policy: AnalysisPolicy,
) -> list[EffortDecision]:
    non_contested = {
        row.relation_id
        for row in handoff.slice_rows
        if not row.is_holdout and row.relation_id not in contested
    }
    lookup = _vote_lookup(clean_votes)
    baseline = handoff.manifest.expected_grid.effort
    qualification_by_family = {result.family_id: result for result in qualification}
    decisions: list[EffortDecision] = []
    for family_id in passed_families:
        efforts = sorted(
            {
                vote.effort
                for vote in clean_votes
                if vote.family_id == family_id and vote.effort != baseline
            }
        )
        candidates = [
            _effort_candidate(
                lookup,
                family_id=family_id,
                baseline=baseline,
                effort=effort,
                bundle_ids=[QUALIFICATION_BUNDLE],
                non_contested=non_contested,
                family_rate=family_rate,
                policy=policy,
            )
            for effort in efforts
        ]
        decisions.append(
            _effort_decision(
                family_id,
                baseline,
                qualification_by_family[family_id].correct_count,
                candidates,
            )
        )
    return decisions


def _axis_statistics_and_decisions(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    qualification: Sequence[QualificationResult],
    policy: AnalysisPolicy,
) -> AxisDecisionResults:
    passed_families = sorted(result.family_id for result in qualification if result.passed)
    passed_set = set(passed_families)
    votes = _analysis_votes(handoff, clean_votes, passed_set)
    all_candidate_votes = _analysis_votes(
        handoff,
        clean_votes,
        {result.family_id for result in qualification},
    )
    if len(passed_families) < MIN_PANEL_FAMILIES:
        raise ValueError("at least two families must pass qualification for panel analysis")
    entropy_strata = _entropy_strata(handoff, votes)
    entropies = entropy_strata.entropy_by_relation
    contested = entropy_strata.contested_relations
    all_relations = {vote.relation_id for vote in votes}
    non_contested = all_relations - contested
    bootstrap = _bootstrap_kwargs(policy)

    marginals: list[MarginalResult] = []
    for shell in SHELLS:
        marginals += _marginal(
            votes,
            axis="shell",
            level=shell,
            select=lambda vote, shell=shell: vote.shell_id == shell,
            policy=policy,
        )
    for framing in FRAMINGS:
        marginals += _marginal(
            votes,
            axis="template",
            level=framing,
            select=lambda vote, framing=framing: vote.framing_id == framing,
            policy=policy,
        )
    for family_id in passed_families:
        marginals += _marginal(
            votes,
            axis="family",
            level=family_id,
            select=lambda vote, family_id=family_id: vote.family_id == family_id,
            policy=policy,
        )

    shell_pairs: dict[str, PairObservations] = {
        f"{first}-{second}": _pair_observations(
            votes,
            axis="shell",
            first=first,
            second=second,
            expected_per_card=len(passed_families) * len(FRAMINGS),
        )
        for first, second in itertools.combinations(SHELLS, 2)
    }
    template_pairs: dict[str, PairObservations] = {
        f"{first}-{second}": _pair_observations(
            votes,
            axis="template",
            first=first,
            second=second,
            expected_per_card=len(passed_families) * len(SHELLS),
        )
        for first, second in itertools.combinations(FRAMINGS, 2)
    }
    family_pairs: dict[str, PairObservations] = {
        f"{first}-{second}": _pair_observations(
            votes,
            axis="family",
            first=first,
            second=second,
            expected_per_card=len(BUNDLES),
        )
        for first, second in itertools.combinations(passed_families, 2)
    }
    repeat = _repeat_observations(handoff, clean_votes, passed_set)

    pair_groups: tuple[tuple[FlipAxis, dict[str, PairObservations]], ...] = (
        ("shell", shell_pairs),
        ("template", template_pairs),
        ("family", family_pairs),
    )
    flips: list[FlipResult] = []
    for axis, groups in pair_groups:
        for level_pair, observations in groups.items():
            flips += _flip_results(
                handoff,
                observations,
                axis=axis,
                level_pair=level_pair,
                contested=contested,
                policy=policy,
            )
        flips += _flip_results(
            handoff,
            _combined(groups.values()),
            axis=axis,
            level_pair="all",
            contested=contested,
            policy=policy,
        )
    flips += _flip_results(
        handoff,
        repeat,
        axis="repeat",
        level_pair="repeat-index",
        contested=contested,
        policy=policy,
    )

    shell_combined = _combined(shell_pairs.values())
    template_combined = _combined(template_pairs.values())
    family_combined = _combined(family_pairs.values())
    noise_floor = bootstrap_rate(repeat.values, **bootstrap)
    family_non_contested = bootstrap_rate(
        _subset_observations(family_combined.values, non_contested), **bootstrap
    )
    admissions: list[AdmissionDecision] = []
    for shell in ("S2", "S3"):
        observations = shell_pairs[f"S1-{shell}"]
        admissions.append(
            _admission(
                axis="shell",
                level=shell,
                candidate=bootstrap_rate(
                    _subset_observations(observations.values, non_contested), **bootstrap
                ),
                family_rate=family_non_contested,
                policy=policy,
            )
        )
    for framing in ("F2", "F3"):
        observations = template_pairs[f"F1-{framing}"]
        admissions.append(
            _admission(
                axis="template",
                level=framing,
                candidate=bootstrap_rate(
                    _subset_observations(observations.values, non_contested), **bootstrap
                ),
                family_rate=family_non_contested,
                policy=policy,
            )
        )

    card_ratings = _card_values(
        (
            vote.relation_id,
            cast("tuple[str, str, Verdict]", (vote.family_id, vote.bundle_id, verdict)),
        )
        for vote in votes
        if (verdict := _nominal(vote)) is not None
    )
    card_rate = cluster_bootstrap(
        card_ratings,
        _card_axis_disagreement,
        count_unit="cards",
        **bootstrap,
    )
    ordering_rates: dict[Axis, Estimate] = {
        "card": card_rate,
        "family": bootstrap_rate(family_combined.values, **bootstrap),
        "template": bootstrap_rate(template_combined.values, **bootstrap),
        "shell": bootstrap_rate(shell_combined.values, **bootstrap),
        "repeat": noise_floor,
    }
    ordered_estimates = [ordering_rates[axis] for axis in ("card", "family", "template", "shell")]
    ordered = [estimate.est for estimate in ordered_estimates if estimate.est is not None]
    healthy = all(
        estimate.est is not None and estimate.lo is not None and estimate.hi is not None
        for estimate in ordered_estimates
    ) and all(first > second for first, second in itertools.pairwise(ordered))
    statistics = AxisStatistics(
        entropy_tercile_cuts=entropy_strata.tercile_cuts,
        marginals=marginals,
        noise_floor=noise_floor,
        flips=flips,
        agreement=_agreement(handoff, votes, all_candidate_votes, passed_families, policy),
        ordering=OrderingCheck(rates=ordering_rates, healthy_order_holds=healthy),
    )
    floor = bootstrap_rate(_subset_observations(shell_combined.values, non_contested), **bootstrap)
    return AxisDecisionResults(
        statistics=statistics,
        admissions=admissions,
        entropy_by_relation=entropies,
        contested_relations=contested,
        family_flip_rate=family_non_contested,
        floor_error_bar=floor,
    )


def _nominations(
    handoff: Handoff,
    eligible_votes: Sequence[VoteRow],
    entropies: Mapping[str, float],
) -> list[NominationSeed]:
    if not entropies:
        raise ValueError("cannot nominate cards from an empty entropy set")
    nomination_count = max(1, math.ceil(len(entropies) / 10))
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    counts_by_card: dict[str, Counter[Verdict]] = defaultdict(Counter)
    abstentions_by_card: Counter[str] = Counter()
    for vote in eligible_votes:
        if vote.relation_id not in entropies:
            continue
        verdict = _nominal(vote)
        if verdict is None:
            abstentions_by_card[vote.relation_id] += 1
        else:
            counts_by_card[vote.relation_id][verdict] += 1
    return [
        NominationSeed(
            relation_id=relation_id,
            card_hash=slice_by_relation[relation_id].card_hash,
            entropy=entropy,
            vote_counts={verdict: counts_by_card[relation_id][verdict] for verdict in VERDICTS},
            n_votes=sum(counts_by_card[relation_id].values()),
            abstentions=abstentions_by_card[relation_id],
        )
        for relation_id, entropy in sorted(entropies.items(), key=lambda item: (-item[1], item[0]))[
            :nomination_count
        ]
    ]


def _posteriors(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    selected_efforts: Mapping[str, str],
    admitted_shells: set[ShellId],
    admitted_templates: set[FramingId],
    policy: AnalysisPolicy,
) -> list[CardPosterior]:
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    baseline_effort = handoff.manifest.expected_grid.effort
    lookup = _vote_lookup(clean_votes)
    admitted_bundles = {
        cast("BundleId", f"{shell}x{framing}")
        for shell in admitted_shells
        for framing in admitted_templates
    }
    counts: dict[str, Counter[Verdict]] = defaultdict(Counter)
    abstentions: Counter[str] = Counter()
    for relation_id, slice_row in slice_by_relation.items():
        if slice_row.is_holdout:
            continue
        for family_id, selected_effort in selected_efforts.items():
            for bundle_id in admitted_bundles:
                vote = lookup.get((relation_id, family_id, bundle_id, selected_effort, 0))
                if vote is None and selected_effort != baseline_effort:
                    vote = lookup.get((relation_id, family_id, bundle_id, baseline_effort, 0))
                if vote is None:
                    continue
                verdict = _nominal(vote)
                if verdict is None:
                    abstentions[relation_id] += 1
                else:
                    counts[relation_id][verdict] += 1

    alpha = policy.dirichlet_alpha
    posteriors: list[CardPosterior] = []
    for relation_id in sorted(
        relation_id
        for relation_id, slice_row in slice_by_relation.items()
        if not slice_row.is_holdout
    ):
        card_counts = counts[relation_id]
        n = sum(card_counts.values())
        denominator = n + alpha * len(VERDICTS)
        posteriors.append(
            CardPosterior(
                relation_id=relation_id,
                card_hash=slice_by_relation[relation_id].card_hash,
                counts={verdict: card_counts[verdict] for verdict in VERDICTS},
                probabilities={
                    verdict: (card_counts[verdict] + alpha) / denominator for verdict in VERDICTS
                },
                n_votes=n,
                abstentions=abstentions[relation_id],
            )
        )
    return posteriors


type EscalationObservation = tuple[bool, float | None]


def _vote_reported_cost(vote: VoteRow) -> float | None:
    """Return the vote's reported cost under the known-cost lower-bound basis.

    ``cost_usd`` is exact when billing is complete. When a failed attempt made
    billing incomplete (rate limits report no usage but bill nothing),
    ``known_cost_usd`` still carries the accepted completions' exact reported
    cost. A vote that reported no cost anywhere stays unknown and fails closed.
    """
    if vote.cost_usd is not None:
        return vote.cost_usd
    return vote.known_cost_usd if vote.known_cost_usd > 0 else None


def _comparison_cost(votes: Sequence[VoteRow]) -> float | None:
    costs = [_vote_reported_cost(vote) for vote in votes]
    if any(cost is None for cost in costs):
        return None
    return math.fsum(cast("list[float]", costs)) / len(costs)


def _append_escalation_pair(
    observations: dict[str, list[EscalationObservation]],
    relation_id: str,
    first: VoteRow | None,
    second: VoteRow | None,
    cost_votes: Sequence[VoteRow],
) -> None:
    if first is None or second is None:
        return
    first_verdict, second_verdict = _nominal(first), _nominal(second)
    if first_verdict is None or second_verdict is None:
        return
    observations[relation_id].append(
        (first_verdict != second_verdict, _comparison_cost(cost_votes))
    )


def _shell_escalation_observations(
    lookup: Mapping[LogicalCell, VoteRow],
    relations: Sequence[str],
    families: Sequence[str],
    effort: str,
) -> dict[str, list[EscalationObservation]]:
    observations: dict[str, list[EscalationObservation]] = defaultdict(list)
    for relation_id in relations:
        for family_id in families:
            for framing in FRAMINGS:
                baseline_bundle = cast("BundleId", f"S1x{framing}")
                baseline = lookup.get((relation_id, family_id, baseline_bundle, effort, 0))
                for shell in ("S2", "S3"):
                    candidate_bundle = cast("BundleId", f"{shell}x{framing}")
                    candidate = lookup.get((relation_id, family_id, candidate_bundle, effort, 0))
                    _append_escalation_pair(
                        observations,
                        relation_id,
                        baseline,
                        candidate,
                        [candidate] if candidate is not None else [],
                    )
    return dict(observations)


def _template_escalation_observations(
    lookup: Mapping[LogicalCell, VoteRow],
    relations: Sequence[str],
    families: Sequence[str],
    effort: str,
) -> dict[str, list[EscalationObservation]]:
    observations: dict[str, list[EscalationObservation]] = defaultdict(list)
    for relation_id in relations:
        for family_id in families:
            for shell in SHELLS:
                baseline_bundle = cast("BundleId", f"{shell}xF1")
                baseline = lookup.get((relation_id, family_id, baseline_bundle, effort, 0))
                for framing in ("F2", "F3"):
                    candidate_bundle = cast("BundleId", f"{shell}x{framing}")
                    candidate = lookup.get((relation_id, family_id, candidate_bundle, effort, 0))
                    _append_escalation_pair(
                        observations,
                        relation_id,
                        baseline,
                        candidate,
                        [candidate] if candidate is not None else [],
                    )
    return dict(observations)


def _family_escalation_observations(
    lookup: Mapping[LogicalCell, VoteRow],
    relations: Sequence[str],
    families: Sequence[str],
    effort: str,
) -> dict[str, list[EscalationObservation]]:
    observations: dict[str, list[EscalationObservation]] = defaultdict(list)
    for relation_id in relations:
        for bundle in BUNDLES:
            for first_family, second_family in itertools.combinations(families, 2):
                first = lookup.get((relation_id, first_family, bundle, effort, 0))
                second = lookup.get((relation_id, second_family, bundle, effort, 0))
                costs = [vote for vote in (first, second) if vote is not None]
                _append_escalation_pair(
                    observations,
                    relation_id,
                    first,
                    second,
                    costs,
                )
    return dict(observations)


def _repeat_escalation_observations(
    handoff: Handoff,
    lookup: Mapping[LogicalCell, VoteRow],
    relations: Sequence[str],
    families: Sequence[str],
    effort: str,
) -> dict[str, list[EscalationObservation]]:
    observations: dict[str, list[EscalationObservation]] = defaultdict(list)
    repeat_arm = handoff.manifest.expected_repeat_arm
    if repeat_arm is None:
        return {}
    for relation_id in relations:
        for family_id in families:
            baseline = lookup.get((relation_id, family_id, repeat_arm.bundle_id, effort, 0))
            for repeat_index in repeat_arm.repeat_indices:
                candidate = lookup.get(
                    (relation_id, family_id, repeat_arm.bundle_id, effort, repeat_index)
                )
                _append_escalation_pair(
                    observations,
                    relation_id,
                    baseline,
                    candidate,
                    [candidate] if candidate is not None else [],
                )
    return dict(observations)


def _effort_escalation_observations(
    handoff: Handoff,
    lookup: Mapping[LogicalCell, VoteRow],
    relations: Sequence[str],
    families: Sequence[str],
    effort: str,
) -> dict[str, list[EscalationObservation]]:
    observations: dict[str, list[EscalationObservation]] = defaultdict(list)
    effort_arm = handoff.manifest.expected_effort_arm
    if effort_arm is None:
        return {}
    arm_relations = set(effort_arm.relation_ids)
    for relation_id in relations:
        if relation_id not in arm_relations:
            continue
        for family_id in families:
            candidate_effort = effort_arm.family_efforts.get(family_id)
            if candidate_effort is None or candidate_effort == effort:
                continue
            baseline = lookup.get((relation_id, family_id, effort_arm.bundle_id, effort, 0))
            candidate = lookup.get(
                (relation_id, family_id, effort_arm.bundle_id, candidate_effort, 0)
            )
            _append_escalation_pair(
                observations,
                relation_id,
                baseline,
                candidate,
                [candidate] if candidate is not None else [],
            )
    return dict(observations)


def _escalation_estimates(
    observations: Mapping[str, Sequence[EscalationObservation]],
    policy: AnalysisPolicy,
) -> EscalationEstimates:
    def disagreement(values: Sequence[EscalationObservation]) -> float | None:
        return sum(flip for flip, _ in values) / len(values) if values else None

    def cost(values: Sequence[EscalationObservation]) -> float | None:
        costs = [value for _, value in values]
        if not costs or any(value is None for value in costs):
            return None
        return math.fsum(cast("list[float]", costs)) / len(costs)

    def ratio(values: Sequence[EscalationObservation]) -> float | None:
        yield_value = disagreement(values)
        cost_value = cost(values)
        if yield_value is None or cost_value is None or cost_value <= 0:
            return None
        return yield_value / cost_value

    bootstrap = _bootstrap_kwargs(policy)
    disagreement_observations = {
        relation_id: [flip for flip, _ in values] for relation_id, values in observations.items()
    }
    return EscalationEstimates(
        disagreement_yield=bootstrap_rate(disagreement_observations, **bootstrap),
        marginal_cost=cluster_bootstrap(observations, cost, **bootstrap),
        yield_per_dollar=cluster_bootstrap(observations, ratio, **bootstrap),
    )


def _escalation(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    contested: set[str],
    policy: AnalysisPolicy,
) -> EscalationResults:
    lookup = _vote_lookup(clean_votes)
    relations = sorted(contested)
    effort = handoff.manifest.expected_grid.effort
    observations = {
        "family": _family_escalation_observations(lookup, relations, passed_families, effort),
        "template": _template_escalation_observations(lookup, relations, passed_families, effort),
        "shell": _shell_escalation_observations(lookup, relations, passed_families, effort),
        "repeat": _repeat_escalation_observations(
            handoff, lookup, relations, passed_families, effort
        ),
        "effort": _effort_escalation_observations(
            handoff, lookup, relations, passed_families, effort
        ),
    }
    results: list[EscalationAxis] = []
    for axis in ESCALATION_AXES:
        axis_observations = observations[axis]
        estimates = _escalation_estimates(axis_observations, policy)
        ratio = estimates.yield_per_dollar
        results.append(
            EscalationAxis(
                axis=axis,
                disagreement_yield=estimates.disagreement_yield,
                marginal_cost=estimates.marginal_cost,
                cost_eligible_n=sum(map(len, axis_observations.values())),
                cost_reported_n=sum(
                    cost is not None for values in axis_observations.values() for _, cost in values
                ),
                yield_per_dollar_estimate=ratio,
                rankable=ratio.est is not None and ratio.lo is not None and ratio.hi is not None,
            )
        )
    ranked = sorted(
        (result for result in results if result.rankable),
        key=lambda result: (
            -cast("float", result.yield_per_dollar_estimate.est),
            result.axis,
        ),
    )
    return EscalationResults(
        axes=results,
        order=[result.axis for result in ranked],
    )


def analyze_handoff(
    handoff_dir: PathLike,
    out_dir: PathLike,
    *,
    policy: AnalysisPolicy | None = None,
) -> AnalysisRunResult:
    """Analyze a validated handoff and write byte-deterministic decisions/report files."""
    resolved_policy = policy or AnalysisPolicy()
    handoff = load_handoff(handoff_dir)
    clean_votes, health = _clean_votes(handoff, resolved_policy)
    qualification = _qualify(handoff, clean_votes)
    passed = sorted(result.family_id for result in qualification if result.passed)
    pruned = sorted(result.family_id for result in qualification if not result.passed)
    axis_results = _axis_statistics_and_decisions(
        handoff,
        clean_votes,
        qualification,
        resolved_policy,
    )
    admitted_shells: list[ShellId] = ["S1"]
    admitted_shells.extend(
        cast("ShellId", decision.level)
        for decision in axis_results.admissions
        if decision.axis == "shell" and decision.admitted
    )
    admitted_templates: list[FramingId] = ["F1"]
    admitted_templates.extend(
        cast("FramingId", decision.level)
        for decision in axis_results.admissions
        if decision.axis == "template" and decision.admitted
    )
    effort = _effort_policy(
        handoff,
        clean_votes,
        qualification,
        passed,
        axis_results.contested_relations,
        axis_results.family_flip_rate,
        resolved_policy,
    )
    cost_results = _cost_audit(
        handoff,
        clean_votes,
        effort,
        admitted_shells,
        admitted_templates,
        resolved_policy,
    )
    escalation_results = _escalation(
        handoff,
        clean_votes,
        passed,
        axis_results.contested_relations,
        resolved_policy,
    )
    eligible_votes = _analysis_votes(handoff, clean_votes, set(passed))
    selected_efforts = {decision.family_id: decision.selected_effort for decision in effort}
    decisions = AnalysisDecisions(
        schema_version=3,
        policy=resolved_policy,
        input_hashes=handoff.input_hashes,
        pilot_run_contract=PilotRunContract(
            cards_hash=handoff.manifest.source_hashes["cards.jsonl"],
            cards_manifest_hash=handoff.manifest.source_hashes["cards.manifest.json"],
            full_grid_card_count=handoff.manifest.full_grid_card_count,
            judge_request_hashes={
                judge.family_id: judge_request_hash(judge) for judge in handoff.manifest.judges
            },
        ),
        prompt_pack_hash=handoff.manifest.prompt_pack_hash,
        rubric_version=handoff.manifest.rubric_version,
        sampling_seeds=sorted({row.sampling_seed for row in handoff.slice_rows}),
        pruned_families=pruned,
        admitted_shells=admitted_shells,
        admitted_templates=admitted_templates,
        escalation_order=escalation_results.order,
        floor_error_bar=axis_results.floor_error_bar,
        nomination_seeds=_nominations(
            handoff,
            eligible_votes,
            axis_results.entropy_by_relation,
        ),
        projected_grid_cost_usd=cost_results.projected_cost.est,
        projected_grid_cost=cost_results.projected_cost,
        per_card_posteriors=_posteriors(
            handoff,
            clean_votes,
            selected_efforts,
            set(admitted_shells),
            set(admitted_templates),
            resolved_policy,
        ),
        effort_policy=effort,
        data_health=health,
        qualification=qualification,
        axis_statistics=axis_results.statistics,
        admissions=axis_results.admissions,
        escalation=escalation_results.axes,
        cost_audit=cost_results.families,
    )

    output = Path(out_dir)
    output.mkdir(parents=True, exist_ok=True)
    decisions_path = write_sidecar(output / "decisions.json", decisions.model_dump(mode="json"))
    from_disk = AnalysisDecisions.model_validate_json(decisions_path.read_text(encoding="utf-8"))
    report_path = output / "report.md"
    report_path.write_text(render_markdown(from_disk), encoding="utf-8")
    return AnalysisRunResult(
        decisions=from_disk,
        decisions_json=decisions_path,
        report_md=report_path,
    )
