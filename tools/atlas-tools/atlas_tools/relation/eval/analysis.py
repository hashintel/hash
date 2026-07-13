"""End-to-end deterministic analysis of factorial-pilot relation votes."""

import itertools
import math
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import TypedDict, assert_never, cast

import numpy as np
from pydantic import BaseModel, ValidationError

from atlas_tools.common import Sha256Hex, sha256_file, write_sidecar
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT
from atlas_tools.relation.eval.reporting import render_markdown
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    FRAMINGS,
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
    QualificationResult,
    RoutingStream,
    ShellId,
    SliceRow,
    Verdict,
    VoteRow,
)
from atlas_tools.relation.eval.statistics import (
    bootstrap_cohen_kappa,
    bootstrap_krippendorff_alpha,
    bootstrap_mean,
    bootstrap_rate,
    cluster_bootstrap,
    mean,
    normalized_entropy,
    quantile,
    rate,
)

CANONICAL_BUNDLE: BundleId = "S1xF1"
MAX_REASON_WORDS = 60
HOLDOUT_PASS_COUNT = 5
MIN_PANEL_FAMILIES = 2
ESCALATION_AXES: tuple[EscalationAxisName, ...] = (
    "family",
    "template",
    "shell",
    "repeat",
)


class BootstrapOptions(TypedDict):
    resamples: int
    seed: int
    ci_level: float


@dataclass(frozen=True)
class Handoff:
    manifest: HandoffManifest
    slice_rows: tuple[SliceRow, ...]
    votes: tuple[VoteRow, ...]
    input_hashes: dict[str, Sha256Hex]


@dataclass(frozen=True)
class AnalysisRunResult:
    decisions: AnalysisDecisions
    decisions_json: Path
    report_md: Path


@dataclass(frozen=True)
class VotePartitions:
    clean: list[VoteRow]
    baseline: list[VoteRow]
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


def _load_jsonl[Model: BaseModel](path: Path, model: type[Model]) -> list[Model]:
    rows: list[Model] = []

    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line:
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
    return {str(provider_id): verdict for _, provider_id, verdict in HOLDOUT}


def _shot_relation_ids() -> set[str]:
    return {str(provider_id) for _, provider_id, _ in FEW_SHOT}


def _handoff_paths(directory: Path) -> tuple[Path, Path, Path]:
    votes_path = directory / "votes.jsonl"
    slice_path = directory / "slice.jsonl"
    manifest_path = directory / "manifest.json"
    for required in (votes_path, slice_path, manifest_path):
        if not required.is_file():
            raise ValueError(f"handoff is missing {required.name}")
    return votes_path, slice_path, manifest_path


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
    return slice_by_relation


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

    baseline_cells = [
        (vote.family_id, vote.bundle_id, vote.relation_id)
        for vote in votes
        if vote.effort == manifest.baseline_effort
        and vote.repeat_index == 0
        and vote.relation_id in slice_by_relation
    ]
    duplicate_cells = _duplicates("\x1f".join(cell) for cell in baseline_cells)
    if duplicate_cells:
        raise ValueError("votes.jsonl contains duplicate baseline grid cells")


def load_handoff(path: PathLike) -> Handoff:
    """Load and cross-validate a handoff directory without performing statistics."""
    votes_path, slice_path, manifest_path = _handoff_paths(Path(path))
    manifest = _load_manifest(manifest_path)
    slice_rows = _load_jsonl(slice_path, SliceRow)
    votes = _load_jsonl(votes_path, VoteRow)
    slice_by_relation = _validate_slice(slice_rows, manifest)
    _validate_votes(votes, manifest, slice_by_relation)
    return Handoff(
        manifest=manifest,
        slice_rows=tuple(sorted(slice_rows, key=lambda row: row.relation_id)),
        votes=tuple(sorted(votes, key=lambda vote: vote.vote_id)),
        input_hashes={
            "manifest.json": sha256_file(manifest_path),
            "slice.jsonl": sha256_file(slice_path),
            "votes.jsonl": sha256_file(votes_path),
        },
    )


def _nominal(vote: VoteRow) -> Verdict | None:
    if vote.verdict == "ABSTAIN":
        return None

    return vote.verdict


def _matches_model_pin(vote: VoteRow, model: str) -> bool:
    returned_models = vote.attempt_models or [vote.model_returned]
    return vote.model_returned == model and all(
        returned_model == model for returned_model in returned_models
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
    }


def _partition_votes(handoff: Handoff) -> VotePartitions:
    pins = {judge.family_id: judge.model for judge in handoff.manifest.judges}
    shot_ids = _shot_relation_ids()
    contaminated = [vote for vote in handoff.votes if vote.relation_id in shot_ids]
    candidates = [vote for vote in handoff.votes if vote.relation_id not in shot_ids]
    routing_bad = [
        vote for vote in candidates if not _matches_model_pin(vote, pins[vote.family_id])
    ]
    clean = [vote for vote in candidates if _matches_model_pin(vote, pins[vote.family_id])]
    baseline = [
        vote
        for vote in candidates
        if vote.effort == handoff.manifest.baseline_effort and vote.repeat_index == 0
    ]
    return VotePartitions(
        clean=clean,
        baseline=baseline,
        contaminated=contaminated,
        routing_bad=routing_bad,
    )


def _coverage_health(
    manifest: HandoffManifest,
    baseline: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[list[CoverageStream], list[str]]:
    baseline_keys = {(vote.family_id, vote.bundle_id, vote.relation_id) for vote in baseline}
    coverage: list[CoverageStream] = []
    reruns: list[str] = []
    expected = len(manifest.expected_grid.relation_ids)
    for family_id in sorted(manifest.expected_grid.families):
        for bundle_id in sorted(manifest.expected_grid.bundles):
            observed = sum(
                (family_id, bundle_id, relation_id) in baseline_keys
                for relation_id in manifest.expected_grid.relation_ids
            )
            missing = expected - observed
            missing_rate = missing / expected
            rerun = missing_rate > policy.stream_missing_rerun_rate
            coverage.append(
                CoverageStream(
                    family_id=family_id,
                    bundle_id=bundle_id,
                    expected=expected,
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
    manifest: HandoffManifest,
    baseline: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> tuple[list[RoutingStream], list[str]]:
    pins = {judge.family_id: judge.model for judge in manifest.judges}
    routing: list[RoutingStream] = []
    reruns: list[str] = []
    for family_id in sorted(manifest.expected_grid.families):
        for bundle_id in sorted(manifest.expected_grid.bundles):
            stream = [
                vote
                for vote in baseline
                if vote.family_id == family_id and vote.bundle_id == bundle_id
            ]
            violations = sum(not _matches_model_pin(vote, pins[family_id]) for vote in stream)
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


def _one_family_cost_health(
    family_id: str,
    votes: Sequence[VoteRow],
    policy: AnalysisPolicy,
) -> FamilyCostHealth:
    bootstrap = _bootstrap_kwargs(policy)
    costs = _card_values(
        (vote.relation_id, vote.cost_usd) for vote in votes if vote.cost_usd is not None
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
    latency = _card_values(
        (vote.relation_id, (vote.ts_response - vote.ts_request).total_seconds()) for vote in votes
    )
    return FamilyCostHealth(
        family_id=family_id,
        n=len(votes),
        cost_reported_n=sum(vote.cost_usd is not None for vote in votes),
        mean_cost_usd=bootstrap_mean(costs, **bootstrap),
        tokens_per_vote=bootstrap_mean(tokens, **bootstrap),
        token_inflation_factor=bootstrap_mean(inflation, **bootstrap),
        latency_seconds=bootstrap_mean(latency, **bootstrap),
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
    coverage, missing_reruns = _coverage_health(handoff.manifest, partitions.baseline, policy)
    routing, routing_reruns = _routing_health(handoff.manifest, partitions.baseline, policy)
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


def _vote_lookup(votes: Iterable[VoteRow]) -> dict[tuple[str, str, str, str, int], VoteRow]:
    return {
        (vote.relation_id, vote.family_id, vote.bundle_id, vote.effort, vote.repeat_index): vote
        for vote in votes
    }


def _qualify(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
) -> list[QualificationResult]:
    expected = _expected_holdouts()
    lookup = _vote_lookup(clean_votes)
    results: list[QualificationResult] = []
    baseline_effort = handoff.manifest.baseline_effort
    for family_id in sorted(handoff.manifest.expected_grid.families):
        bundle_correctness: dict[BundleId, dict[str, bool]] = {}
        for bundle_id in BUNDLES:
            if bundle_id not in handoff.manifest.expected_grid.bundles:
                continue
            correctness: dict[str, bool] = {}
            for relation_id, expected_verdict in sorted(expected.items()):
                vote = lookup.get((relation_id, family_id, bundle_id, baseline_effort, 0))
                correctness[relation_id] = vote is not None and _nominal(vote) == expected_verdict
            bundle_correctness[bundle_id] = correctness

        canonical = bundle_correctness[CANONICAL_BUNDLE]
        correct_count = sum(canonical.values())
        p1382 = canonical["P1382"]
        p2634 = canonical["P2634"]
        results.append(
            QualificationResult(
                family_id=family_id,
                correct_count=correct_count,
                total_count=len(expected),
                p1382_correct=p1382,
                p2634_correct=p2634,
                passed=correct_count >= HOLDOUT_PASS_COUNT and p1382 and p2634,
                bundle_correctness=bundle_correctness,
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
        and vote.effort == handoff.manifest.baseline_effort
        and vote.repeat_index == 0
        and vote.relation_id not in holdouts
        and vote.verdict != "ABSTAIN"
    ]


def _entropy_strata(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
) -> tuple[dict[str, float], set[str], tuple[float, float]]:
    holdouts = {row.relation_id for row in handoff.slice_rows if row.is_holdout}
    grid_votes = [
        vote
        for vote in clean_votes
        if vote.effort == handoff.manifest.baseline_effort
        and vote.repeat_index == 0
        and vote.relation_id not in holdouts
        and vote.verdict != "ABSTAIN"
    ]
    by_card: dict[str, list[Verdict]] = defaultdict(list)
    for vote in grid_votes:
        verdict = _nominal(vote)
        if verdict is not None:
            by_card[vote.relation_id].append(verdict)
    relation_ids = [row.relation_id for row in handoff.slice_rows if not row.is_holdout]
    if not relation_ids:
        raise ValueError("pilot slice has no non-holdout cards")
    entropies: dict[str, float] = {}
    for relation_id in relation_ids:
        entropy = normalized_entropy(by_card.get(relation_id, []))
        entropies[relation_id] = 1.0 if entropy is None else entropy
    entropy_values = np.asarray(list(entropies.values()), dtype=np.float64)
    lower, upper = np.quantile(entropy_values, np.asarray([1 / 3, 2 / 3])).tolist()
    cuts = (float(lower), float(upper))
    contested = {relation_id for relation_id, entropy in entropies.items() if entropy >= cuts[1]}
    return entropies, contested, cuts


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
) -> dict[str, list[bool]]:
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
    return dict(observations)


def _repeat_observations(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: set[str],
) -> dict[str, list[bool]]:
    holdouts = {row.relation_id for row in handoff.slice_rows if row.is_holdout}
    grouped: dict[tuple[str, str, BundleId, str], list[tuple[int, Verdict]]] = defaultdict(list)
    for vote in clean_votes:
        verdict = _nominal(vote)
        if verdict is None or vote.family_id not in passed_families or vote.relation_id in holdouts:
            continue
        grouped[(vote.relation_id, vote.family_id, vote.bundle_id, vote.effort)].append(
            (vote.repeat_index, verdict)
        )

    observations: dict[str, list[bool]] = defaultdict(list)
    for (relation_id, _, _, _), repeats in grouped.items():
        for (_, first), (_, second) in itertools.combinations(sorted(repeats), 2):
            observations[relation_id].append(first != second)
    return dict(observations)


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
    observations: Mapping[str, Sequence[bool]],
    *,
    axis: FlipAxis,
    level_pair: str,
    contested: set[str],
    policy: AnalysisPolicy,
) -> list[FlipResult]:
    bootstrap = _bootstrap_kwargs(policy)
    all_relations = set(observations)
    strata: dict[ContestStratum, set[str]] = {
        "all": all_relations,
        "contested": contested,
        "non-contested": all_relations - contested,
    }
    results = [
        FlipResult(
            axis=axis,
            level_pair=level_pair,
            contest_stratum=name,
            prescreen_stratum=None,
            rate=bootstrap_rate(_subset_observations(observations, relation_ids), **bootstrap),
        )
        for name, relation_ids in strata.items()
    ]
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    for prescreen in sorted({row.prescreen_stratum for row in handoff.slice_rows}):
        relation_ids = {
            relation_id
            for relation_id in all_relations
            if slice_by_relation[relation_id].prescreen_stratum == prescreen
        }
        results.append(
            FlipResult(
                axis=axis,
                level_pair=level_pair,
                contest_stratum="all",
                prescreen_stratum=prescreen,
                rate=bootstrap_rate(_subset_observations(observations, relation_ids), **bootstrap),
            )
        )
    return results


def _combined(observations: Iterable[Mapping[str, Sequence[bool]]]) -> dict[str, list[bool]]:
    combined: dict[str, list[bool]] = defaultdict(list)
    for group in observations:
        for relation_id, values in group.items():
            combined[relation_id].extend(values)
    return dict(combined)


def _identity_kappa(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    relation_ids: Sequence[str],
    *,
    family_id: str,
    bundle_id: BundleId,
    effort: str,
) -> Estimate:
    n = sum(
        (relation_id, family_id, bundle_id, effort, 0) in lookup for relation_id in relation_ids
    )
    return Estimate(est=1.0, lo=1.0, hi=1.0, n=n)


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
            if first == second:
                row[second] = _identity_kappa(
                    lookup,
                    relation_ids,
                    family_id=family_id,
                    bundle_id=first,
                    effort=effort,
                )
            elif second in matrix:
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
            if first == second:
                row[second] = _identity_kappa(
                    lookup,
                    relation_ids,
                    family_id=first,
                    bundle_id=CANONICAL_BUNDLE,
                    effort=effort,
                )
            elif second in matrix:
                row[second] = matrix[second][first]
            else:
                pairs = _kappa_pairs(
                    lookup,
                    relation_ids,
                    left_family=first,
                    left_bundle=CANONICAL_BUNDLE,
                    right_family=second,
                    right_bundle=CANONICAL_BUNDLE,
                    effort=effort,
                )
                row[second] = bootstrap_cohen_kappa(pairs, **_bootstrap_kwargs(policy))
        matrix[first] = row
    return matrix


def _agreement(
    handoff: Handoff,
    votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    policy: AnalysisPolicy,
) -> AgreementResults:
    lookup = _vote_lookup(votes)
    relation_ids = sorted({vote.relation_id for vote in votes})
    effort = handoff.manifest.baseline_effort
    ratings = _card_values(
        (vote.relation_id, vote.verdict) for vote in votes if vote.verdict != "ABSTAIN"
    )
    return AgreementResults(
        bundle_kappa_by_family=_bundle_kappas(
            lookup, relation_ids, passed_families, effort, policy
        ),
        canonical_family_kappa=_family_kappas(
            lookup, relation_ids, passed_families, effort, policy
        ),
        krippendorff_alpha=bootstrap_krippendorff_alpha(ratings, **_bootstrap_kwargs(policy)),
    )


def _pairwise_disagreement(values: Sequence[Verdict]) -> float | None:
    pairs = list(itertools.combinations(values, 2))
    return rate([first != second for first, second in pairs])


def _admission(
    *,
    axis: AdmissionAxis,
    level: str,
    candidate: Estimate,
    family_rate: Estimate,
    policy: AnalysisPolicy,
) -> AdmissionDecision:
    reasons: list[str] = []
    if candidate.est is None or candidate.hi is None:
        reasons.append("candidate flip rate is undefined")
    elif candidate.hi > policy.absolute_flip_ceiling:
        reasons.append(
            f"upper CI {candidate.hi:.6f} exceeds absolute ceiling "
            f"{policy.absolute_flip_ceiling:.6f}"
        )
    if family_rate.est is None or family_rate.lo is None:
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
    if value.est is None or value.lo is None or value.hi is None:
        return Estimate(est=None, lo=None, hi=None, n=value.n)
    return Estimate(
        est=value.est * factor,
        lo=value.lo * factor,
        hi=value.hi * factor,
        n=value.n,
    )


def _total_projected_cost(
    votes: Sequence[VoteRow],
    family_ids: Sequence[str],
    projected_calls: int,
    policy: AnalysisPolicy,
) -> Estimate:
    observations = _card_values(
        (vote.relation_id, (vote.family_id, vote.cost_usd))
        for vote in votes
        if vote.cost_usd is not None
    )

    def total(values: Sequence[tuple[str, float]]) -> float | None:
        by_family: dict[str, list[float]] = defaultdict(list)
        for family_id, cost in values:
            by_family[family_id].append(cost)
        family_means = [mean(by_family[family_id]) for family_id in family_ids]
        if any(value is None for value in family_means):
            return None
        return math.fsum(cast("list[float]", family_means)) * projected_calls

    return cluster_bootstrap(observations, total, **_bootstrap_kwargs(policy))


def _cost_audit(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    admitted_shells: Sequence[ShellId],
    admitted_templates: Sequence[FramingId],
    policy: AnalysisPolicy,
) -> tuple[list[FamilyCostAudit], Estimate]:
    bootstrap = _bootstrap_kwargs(policy)
    projected_calls = (
        handoff.manifest.full_grid_card_count * len(admitted_shells) * len(admitted_templates)
    )
    baseline_votes = [
        vote
        for vote in clean_votes
        if vote.family_id in passed_families
        and vote.effort == handoff.manifest.baseline_effort
        and vote.repeat_index == 0
    ]
    audits: list[FamilyCostAudit] = []
    for family_id in passed_families:
        votes = [vote for vote in baseline_votes if vote.family_id == family_id]
        costs = _card_values(
            (vote.relation_id, vote.cost_usd) for vote in votes if vote.cost_usd is not None
        )
        measured = bootstrap_mean(costs, **bootstrap)
        projected = _scale_estimate(measured, projected_calls)
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
        audits.append(
            FamilyCostAudit(
                family_id=family_id,
                n=len(votes),
                cost_reported_n=sum(vote.cost_usd is not None for vote in votes),
                measured_cost_per_vote_usd=measured,
                projected_calls=projected_calls,
                projected_cost_usd=projected.est,
                projected_cost=projected,
                billed_tokens_per_vote=bootstrap_mean(tokens, **bootstrap),
                token_inflation_factor=bootstrap_mean(inflation, **bootstrap),
            )
        )
    return audits, _total_projected_cost(baseline_votes, passed_families, projected_calls, policy)


def _holdout_effort_comparison(
    lookup: Mapping[tuple[str, str, str, str, int], VoteRow],
    *,
    family_id: str,
    baseline: str,
    effort: str,
) -> tuple[int, int, int, bool]:
    correct = 0
    rescues = 0
    regressions = 0
    mandatory = {"P1382": False, "P2634": False}
    for relation_id, expected_verdict in _expected_holdouts().items():
        base_vote = lookup.get((relation_id, family_id, CANONICAL_BUNDLE, baseline, 0))
        candidate_vote = lookup.get((relation_id, family_id, CANONICAL_BUNDLE, effort, 0))
        base_correct = base_vote is not None and _nominal(base_vote) == expected_verdict
        candidate_correct = (
            candidate_vote is not None and _nominal(candidate_vote) == expected_verdict
        )
        correct += candidate_correct
        rescues += candidate_correct and not base_correct
        regressions += base_correct and not candidate_correct
        if relation_id in mandatory:
            mandatory[relation_id] = candidate_correct
    return correct, rescues, regressions, all(mandatory.values())


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
    correct, rescues, regressions, mandatory = _holdout_effort_comparison(
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
    if correct < HOLDOUT_PASS_COUNT or not mandatory:
        reasons.append("candidate effort fails the canonical holdout gate")
    if rescues <= regressions:
        reasons.append("candidate effort does not produce net holdout rescues")
    if reasons == ["meets absolute and family-relative admission rules"]:
        reasons = ["higher effort passes stability and improves holdout performance"]
    return EffortCandidate(
        effort=effort,
        eligible=(
            admission.admitted
            and correct >= HOLDOUT_PASS_COUNT
            and mandatory
            and rescues > regressions
        ),
        holdout_correct=correct,
        flip_rate=flip_rate,
        rescues=rescues,
        regressions=regressions,
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
    baseline = handoff.manifest.baseline_effort
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
                bundle_ids=handoff.manifest.expected_grid.bundles,
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
) -> tuple[
    AxisStatistics,
    list[AdmissionDecision],
    dict[str, float],
    set[str],
    Estimate,
    Estimate,
]:
    passed_families = sorted(result.family_id for result in qualification if result.passed)
    passed_set = set(passed_families)
    votes = _analysis_votes(handoff, clean_votes, passed_set)
    if len(passed_families) < MIN_PANEL_FAMILIES:
        raise ValueError("at least two families must pass qualification for panel analysis")
    entropies, contested, cuts = _entropy_strata(handoff, clean_votes)
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

    shell_pairs: dict[str, dict[str, list[bool]]] = {
        f"{first}-{second}": _pair_observations(votes, axis="shell", first=first, second=second)
        for first, second in itertools.combinations(SHELLS, 2)
    }
    template_pairs: dict[str, dict[str, list[bool]]] = {
        f"{first}-{second}": _pair_observations(votes, axis="template", first=first, second=second)
        for first, second in itertools.combinations(FRAMINGS, 2)
    }
    family_pairs: dict[str, dict[str, list[bool]]] = {
        f"{first}-{second}": _pair_observations(votes, axis="family", first=first, second=second)
        for first, second in itertools.combinations(passed_families, 2)
    }
    repeat = _repeat_observations(handoff, clean_votes, passed_set)

    pair_groups: tuple[tuple[FlipAxis, dict[str, dict[str, list[bool]]]], ...] = (
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
        repeat,
        axis="repeat",
        level_pair="repeat-index",
        contested=contested,
        policy=policy,
    )

    shell_combined = _combined(shell_pairs.values())
    template_combined = _combined(template_pairs.values())
    family_combined = _combined(family_pairs.values())
    noise_floor = bootstrap_rate(repeat, **bootstrap)
    family_non_contested = bootstrap_rate(
        _subset_observations(family_combined, non_contested), **bootstrap
    )
    admissions: list[AdmissionDecision] = []
    for shell in ("S2", "S3"):
        observations = shell_pairs[f"S1-{shell}"]
        admissions.append(
            _admission(
                axis="shell",
                level=shell,
                candidate=bootstrap_rate(
                    _subset_observations(observations, non_contested), **bootstrap
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
                    _subset_observations(observations, non_contested), **bootstrap
                ),
                family_rate=family_non_contested,
                policy=policy,
            )
        )

    card_ratings = _card_values(
        (vote.relation_id, vote.verdict) for vote in votes if vote.verdict != "ABSTAIN"
    )
    card_rate = cluster_bootstrap(
        card_ratings,
        _pairwise_disagreement,
        count_unit="cards",
        **bootstrap,
    )
    ordering_rates: dict[Axis, Estimate] = {
        "card": card_rate,
        "family": bootstrap_rate(family_combined, **bootstrap),
        "template": bootstrap_rate(template_combined, **bootstrap),
        "shell": bootstrap_rate(shell_combined, **bootstrap),
        "repeat": noise_floor,
    }
    ordered = [ordering_rates[axis].est for axis in ("card", "family", "template", "shell")]
    defined_ordered = [value for value in ordered if value is not None]
    healthy = len(defined_ordered) == len(ordered) and all(
        first > second for first, second in itertools.pairwise(defined_ordered)
    )
    statistics = AxisStatistics(
        entropy_tercile_cuts=cuts,
        marginals=marginals,
        noise_floor=noise_floor,
        flips=flips,
        agreement=_agreement(handoff, votes, passed_families, policy),
        ordering=OrderingCheck(rates=ordering_rates, healthy_order_holds=healthy),
    )
    floor = bootstrap_rate(_subset_observations(shell_combined, non_contested), **bootstrap)
    return statistics, admissions, entropies, contested, family_non_contested, floor


def _nominations(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    entropies: Mapping[str, float],
) -> list[NominationSeed]:
    cutoff = quantile(list(entropies.values()), q=0.9)
    if cutoff is None:
        raise ValueError("cannot nominate cards from an empty entropy set")
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    votes = [
        vote
        for vote in clean_votes
        if vote.effort == handoff.manifest.baseline_effort
        and vote.repeat_index == 0
        and vote.verdict != "ABSTAIN"
    ]
    counts_by_card: dict[str, Counter[Verdict]] = defaultdict(Counter)
    for vote in votes:
        verdict = _nominal(vote)
        if vote.relation_id in entropies and verdict is not None:
            counts_by_card[vote.relation_id][verdict] += 1
    return [
        NominationSeed(
            relation_id=relation_id,
            card_hash=slice_by_relation[relation_id].card_hash,
            entropy=entropy,
            vote_counts={verdict: counts_by_card[relation_id][verdict] for verdict in VERDICTS},
            n_votes=sum(counts_by_card[relation_id].values()),
        )
        for relation_id, entropy in sorted(entropies.items(), key=lambda item: (-item[1], item[0]))
        if entropy >= cutoff
    ]


def _posteriors(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: set[str],
    admitted_shells: set[ShellId],
    admitted_templates: set[FramingId],
    policy: AnalysisPolicy,
) -> list[CardPosterior]:
    slice_by_relation = {row.relation_id: row for row in handoff.slice_rows}
    counts: dict[str, Counter[Verdict]] = defaultdict(Counter)
    for vote in clean_votes:
        verdict = _nominal(vote)
        if (
            verdict is not None
            and vote.family_id in passed_families
            and vote.shell_id in admitted_shells
            and vote.framing_id in admitted_templates
            and vote.effort == handoff.manifest.baseline_effort
            and vote.repeat_index == 0
        ):
            counts[vote.relation_id][verdict] += 1

    alpha = policy.dirichlet_alpha
    posteriors: list[CardPosterior] = []
    for relation_id in sorted(slice_by_relation):
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
            )
        )
    return posteriors


def _yield_per_dollar(metric: Estimate, cost: float | None) -> float | None:
    if metric.est is None or cost is None or cost == 0:
        return None
    return metric.est / cost


def _yield_per_dollar_estimate(metric: Estimate, cost: Estimate) -> Estimate:
    n = min(metric.n, cost.n)
    if (
        metric.est is None
        or metric.lo is None
        or metric.hi is None
        or cost.est is None
        or cost.lo is None
        or cost.hi is None
        or cost.lo <= 0
    ):
        return Estimate(est=None, lo=None, hi=None, n=n)
    return Estimate(
        est=metric.est / cost.est,
        lo=metric.lo / cost.hi,
        hi=metric.hi / cost.lo,
        n=n,
    )


def _is_axis_cost_vote(
    vote: VoteRow,
    axis: EscalationAxisName,
    baseline_effort: str,
) -> bool:
    if vote.effort != baseline_effort:
        return False
    match axis:
        case "family":
            return vote.bundle_id == CANONICAL_BUNDLE and vote.repeat_index == 0
        case "template":
            return vote.shell_id == "S1" and vote.framing_id != "F1" and vote.repeat_index == 0
        case "shell":
            return vote.framing_id == "F1" and vote.shell_id != "S1" and vote.repeat_index == 0
        case "repeat":
            return vote.bundle_id == CANONICAL_BUNDLE and vote.repeat_index > 0
        case _:
            assert_never(axis)


def _axis_marginal_costs(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    policy: AnalysisPolicy,
) -> dict[EscalationAxisName, Estimate]:
    return {
        axis: bootstrap_mean(
            _card_values(
                (vote.relation_id, vote.cost_usd)
                for vote in clean_votes
                if vote.family_id in passed_families
                and vote.cost_usd is not None
                and _is_axis_cost_vote(vote, axis, handoff.manifest.baseline_effort)
            ),
            **_bootstrap_kwargs(policy),
        )
        for axis in ESCALATION_AXES
    }


def _escalation(
    handoff: Handoff,
    clean_votes: Sequence[VoteRow],
    passed_families: Sequence[str],
    statistics: AxisStatistics,
    policy: AnalysisPolicy,
) -> tuple[list[EscalationAxis], list[EscalationAxisName]]:

    # Use the mean of level-pair point estimates as disagreement yield, retaining the original
    # card-cluster CI envelope by selecting the widest bounds.
    yields: dict[EscalationAxisName, Estimate] = {}
    for axis in ESCALATION_AXES:
        metrics = [
            flip.rate
            for flip in statistics.flips
            if flip.axis == axis
            and flip.contest_stratum == "contested"
            and flip.prescreen_stratum is None
            and flip.rate.est is not None
        ]
        defined = [
            (metric.est, metric.lo, metric.hi, metric.n)
            for metric in metrics
            if metric.est is not None and metric.lo is not None and metric.hi is not None
        ]
        yields[axis] = (
            Estimate(
                est=math.fsum(item[0] for item in defined) / len(defined),
                lo=min(item[1] for item in defined),
                hi=max(item[2] for item in defined),
                n=sum(item[3] for item in defined),
            )
            if defined
            else Estimate(est=None, lo=None, hi=None, n=0)
        )

    marginal_costs = _axis_marginal_costs(handoff, clean_votes, passed_families, policy)
    results = [
        EscalationAxis(
            axis=axis,
            disagreement_yield=yields[axis],
            marginal_cost_usd=marginal_costs[axis].est,
            marginal_cost=marginal_costs[axis],
            yield_per_dollar=_yield_per_dollar(yields[axis], marginal_costs[axis].est),
            yield_per_dollar_estimate=_yield_per_dollar_estimate(
                yields[axis], marginal_costs[axis]
            ),
        )
        for axis in ESCALATION_AXES
    ]
    ordered_results = sorted(
        results,
        key=lambda result: (
            result.yield_per_dollar is None,
            -(result.yield_per_dollar or 0.0),
            result.axis,
        ),
    )
    return results, [result.axis for result in ordered_results]


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
    (
        statistics,
        admissions,
        entropies,
        contested,
        family_rate,
        floor,
    ) = _axis_statistics_and_decisions(handoff, clean_votes, qualification, resolved_policy)
    admitted_shells: list[ShellId] = ["S1"]
    admitted_shells.extend(
        cast("ShellId", decision.level)
        for decision in admissions
        if decision.axis == "shell" and decision.admitted
    )
    admitted_templates: list[FramingId] = ["F1"]
    admitted_templates.extend(
        cast("FramingId", decision.level)
        for decision in admissions
        if decision.axis == "template" and decision.admitted
    )
    cost_audit, projected_cost = _cost_audit(
        handoff,
        clean_votes,
        passed,
        admitted_shells,
        admitted_templates,
        resolved_policy,
    )
    escalation, escalation_order = _escalation(
        handoff, clean_votes, passed, statistics, resolved_policy
    )
    effort = _effort_policy(
        handoff,
        clean_votes,
        qualification,
        passed,
        contested,
        family_rate,
        resolved_policy,
    )
    decisions = AnalysisDecisions(
        schema_version=1,
        policy=resolved_policy,
        input_hashes=handoff.input_hashes,
        prompt_pack_hash=handoff.manifest.prompt_pack_hash,
        rubric_version=handoff.manifest.rubric_version,
        sampling_seeds=sorted({row.sampling_seed for row in handoff.slice_rows}),
        pruned_families=pruned,
        admitted_shells=admitted_shells,
        admitted_templates=admitted_templates,
        escalation_order=escalation_order,
        floor_error_bar=floor,
        nomination_seeds=_nominations(handoff, clean_votes, entropies),
        projected_grid_cost_usd=projected_cost.est,
        projected_grid_cost=projected_cost,
        per_card_posteriors=_posteriors(
            handoff,
            clean_votes,
            set(passed),
            set(admitted_shells),
            set(admitted_templates),
            resolved_policy,
        ),
        effort_policy=effort,
        data_health=health,
        qualification=qualification,
        axis_statistics=statistics,
        admissions=admissions,
        escalation=escalation,
        cost_audit=cost_audit,
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
