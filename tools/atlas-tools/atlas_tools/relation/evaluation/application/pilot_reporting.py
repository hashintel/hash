"""Persist and render the complete pilot decision record.

The JSON artifact is the machine contract. It stores the round-trippable
fields of the pure analysis together with validated decision projections that
would otherwise exist only as computed fields. Markdown is rendered only from
a strict re-read of those JSON bytes, so the human report cannot disagree with
the durable decision record.
"""

import json
import math
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from atlas_tools.common import Sha256Hex, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    PilotAnalysis,
    PilotAnalysisPolicy,
    RateEstimate,
)
from atlas_tools.relation.evaluation.domain.api import (
    BundleId,
    FramingId,
    FrozenMapping,
    HandoffManifest,
    JudgeFamilyId,
    ReasoningEffort,
    RelationId,
    ShellId,
    Verdict,
    VoteVerdict,
    bundle_id,
)

_INPUT_NAMES = frozenset(
    {
        "attempts.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
        "manifest.json",
        "slice.jsonl",
        "votes.jsonl",
    }
)


class _ReportModel(BaseModel):
    """Reject coercion, mutation, unknown fields, and invalid defaults."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class HoldoutCorrectness(_ReportModel):
    """Persist one family, bundle, and holdout answer for downstream ledgers."""

    family_id: JudgeFamilyId
    bundle_id: BundleId
    relation_id: RelationId
    accepted_verdicts: tuple[Verdict, ...]
    mandatory_probe: bool
    verdict: VoteVerdict | None
    correct: bool

    @model_validator(mode="after")
    def check_correctness(self) -> Self:
        if self.correct != (self.verdict in self.accepted_verdicts):
            raise ValueError("persisted holdout correctness disagrees with its verdict")
        return self


class EffortSelection(_ReportModel):
    """Persist the selected effort for one qualified family."""

    family_id: JudgeFamilyId
    selected_effort: ReasoningEffort


class PilotDecisionArtifact(_ReportModel):
    """Bind one pilot decision to its manifest, policy, and exact input bytes."""

    schema_version: Literal[1] = 1
    producer: Literal["atlas-tools.relation.evaluation.pilot-analysis"] = (
        "atlas-tools.relation.evaluation.pilot-analysis"
    )
    input_hashes: FrozenMapping[str, Sha256Hex]
    manifest: HandoffManifest
    policy: PilotAnalysisPolicy
    qualified_families: tuple[JudgeFamilyId, ...]
    pruned_families: tuple[JudgeFamilyId, ...]
    admitted_shells: tuple[ShellId, ...]
    admitted_framings: tuple[FramingId, ...]
    selected_efforts: tuple[EffortSelection, ...]
    projected_grid_cost_usd: float | None = Field(ge=0.0, allow_inf_nan=False)
    holdout_correctness: tuple[HoldoutCorrectness, ...]
    analysis: PilotAnalysis

    @classmethod
    def from_analysis(
        cls,
        *,
        input_hashes: FrozenMapping[str, Sha256Hex] | dict[str, Sha256Hex],
        manifest: HandoffManifest,
        policy: PilotAnalysisPolicy,
        analysis: PilotAnalysis,
    ) -> PilotDecisionArtifact:
        """Build the durable projection from one completed pure analysis."""
        return cls(
            input_hashes=input_hashes,
            manifest=manifest,
            policy=policy,
            qualified_families=analysis.qualified_families,
            pruned_families=analysis.pruned_families,
            admitted_shells=analysis.admitted_shells,
            admitted_framings=analysis.admitted_framings,
            selected_efforts=tuple(
                EffortSelection(
                    family_id=row.family_id,
                    selected_effort=row.selected_effort,
                )
                for row in analysis.effort
            ),
            projected_grid_cost_usd=analysis.economics.projected_grid_cost_usd,
            holdout_correctness=_holdout_correctness(analysis),
            analysis=analysis,
        )

    @model_validator(mode="after")
    def check_bindings(self) -> Self:
        if set(self.input_hashes) != _INPUT_NAMES:
            raise ValueError("pilot decisions must bind every handoff and card artifact")
        recorded_inputs = {
            name: digest for name, digest in self.input_hashes.items() if name != "manifest.json"
        }
        if recorded_inputs != dict(self.manifest.source_hashes):
            raise ValueError("decision inputs disagree with the completed pilot manifest")
        if dict(self.analysis.source_hashes) != dict(self.manifest.source_hashes):
            raise ValueError("analysis sources disagree with the completed pilot manifest")
        return self

    @model_validator(mode="after")
    def check_projections(self) -> Self:
        if self.qualified_families != self.analysis.qualified_families:
            raise ValueError("persisted qualified families disagree with analysis")
        if self.pruned_families != self.analysis.pruned_families:
            raise ValueError("persisted pruned families disagree with analysis")
        if self.admitted_shells != self.analysis.admitted_shells:
            raise ValueError("persisted shell admissions disagree with analysis")
        if self.admitted_framings != self.analysis.admitted_framings:
            raise ValueError("persisted framing admissions disagree with analysis")
        expected_efforts = tuple(
            EffortSelection(family_id=row.family_id, selected_effort=row.selected_effort)
            for row in self.analysis.effort
        )
        if self.selected_efforts != expected_efforts:
            raise ValueError("persisted effort selections disagree with analysis")
        if self.projected_grid_cost_usd != self.analysis.economics.projected_grid_cost_usd:
            raise ValueError("persisted projected cost disagrees with analysis")
        if self.holdout_correctness != _holdout_correctness(self.analysis):
            raise ValueError("persisted holdout correctness disagrees with analysis")
        _validate_analysis_contract(self)
        return self


class PilotAnalysisRun(_ReportModel):
    """Return the revalidated decision model and exact output identities."""

    decisions: PilotDecisionArtifact
    decisions_json: Path
    report_md: Path
    decisions_hash: Sha256Hex
    report_hash: Sha256Hex


@dataclass(frozen=True, slots=True, kw_only=True)
class LoadedPilotDecisions:
    """Bind one strict decision model to the exact bytes that supplied it."""

    path: Path
    decisions: PilotDecisionArtifact
    content_hash: Sha256Hex


def _holdout_correctness(analysis: PilotAnalysis) -> tuple[HoldoutCorrectness, ...]:
    return tuple(
        HoldoutCorrectness(
            family_id=family.family_id,
            bundle_id=bundle.bundle_id,
            relation_id=holdout.relation_id,
            accepted_verdicts=holdout.accepted_verdicts,
            mandatory_probe=holdout.mandatory_probe,
            verdict=holdout.verdict,
            correct=holdout.correct,
        )
        for family in analysis.qualification
        for bundle in family.bundles
        for holdout in bundle.holdouts
    )


def _rates(analysis: PilotAnalysis) -> tuple[RateEstimate, ...]:
    rates: list[RateEstimate] = [analysis.family_stability, analysis.repeat_stability.rate]
    for admission in analysis.admissions:
        rates.extend((admission.stability.candidate, admission.stability.family))
    for effort in analysis.effort:
        if effort.candidate is not None:
            rates.extend((effort.candidate.stability.candidate, effort.candidate.stability.family))
    return tuple(rates)


def _validate_rate_contract(decisions: PilotDecisionArtifact) -> None:
    policy = decisions.policy
    for rate in _rates(decisions.analysis):
        if (
            rate.cluster_unit != "card"
            or rate.bootstrap_seed != policy.bootstrap_seed
            or rate.bootstrap_resamples != policy.bootstrap_resamples
            or rate.confidence_level != policy.confidence_level
        ):
            raise ValueError("analysis rate metadata disagrees with the persisted policy")


def _validate_qualification_contract(decisions: PilotDecisionArtifact) -> None:
    manifest = decisions.manifest
    policy = decisions.policy
    analysis = decisions.analysis
    family_ids = tuple(row.family_id for row in analysis.qualification)
    if family_ids != tuple(sorted(manifest.expected_grid.families)):
        raise ValueError("analysis qualification families disagree with the manifest")
    expected_bundles = tuple(sorted(manifest.expected_grid.bundles))
    expected_holdouts = tuple(
        (rule.relation_id, rule.accepted_verdicts, rule.mandatory_probe) for rule in policy.holdouts
    )
    for family in analysis.qualification:
        if family.minimum_correct != policy.holdout_minimum_correct:
            raise ValueError("analysis qualification threshold disagrees with the policy")
        if tuple(bundle.bundle_id for bundle in family.bundles) != expected_bundles:
            raise ValueError("analysis qualification bundles disagree with the manifest")
        for bundle in family.bundles:
            observed_holdouts = tuple(
                (row.relation_id, row.accepted_verdicts, row.mandatory_probe)
                for row in bundle.holdouts
            )
            if observed_holdouts != expected_holdouts:
                raise ValueError("analysis holdout rules disagree with the persisted policy")


def _validate_health_contract(decisions: PilotDecisionArtifact) -> None:
    health = decisions.analysis.data_health
    policy = decisions.policy
    if health.reason_word_limit != policy.reason_word_limit:
        raise ValueError("analysis reason limit disagrees with the persisted policy")
    if any(row.missing_ceiling != policy.stream_missing_rerun_rate for row in health.coverage):
        raise ValueError("analysis coverage ceiling disagrees with the persisted policy")
    if any(row.violation_ceiling != policy.routing_rerun_rate for row in health.routing):
        raise ValueError("analysis routing ceiling disagrees with the persisted policy")
    if any(row.abstention_flag_rate != policy.abstention_flag_rate for row in health.family_bundle):
        raise ValueError("analysis abstention ceiling disagrees with the persisted policy")


def _validate_decision_contract(decisions: PilotDecisionArtifact) -> None:
    analysis = decisions.analysis
    manifest = decisions.manifest
    policy = decisions.policy
    expected_contested = max(1, math.ceil(len(analysis.card_entropy) * policy.contested_fraction))
    ranked = sorted(analysis.card_entropy, key=lambda row: (-row.entropy, row.relation_id))
    contested = tuple(sorted(row.relation_id for row in ranked[:expected_contested]))
    if analysis.contested_relations != contested:
        raise ValueError("analysis contested-card set disagrees with the persisted policy")
    repeat_indices = (0, *manifest.expected_repeat_arm.repeat_indices)
    if analysis.repeat_stability.repeat_indices != repeat_indices:
        raise ValueError("analysis repeat indices disagree with the manifest")
    expected_pairs = (
        len(manifest.expected_repeat_arm.relation_ids)
        * len(analysis.qualified_families)
        * math.comb(len(repeat_indices), 2)
    )
    if analysis.repeat_stability.expected_pairs != expected_pairs:
        raise ValueError("analysis repeat pair count disagrees with the manifest")
    for admission in analysis.admissions:
        if (
            admission.stability.absolute_flip_ceiling != policy.absolute_flip_ceiling
            or admission.stability.relative_flip_factor != policy.relative_flip_factor
        ):
            raise ValueError("analysis admission thresholds disagree with the policy")


def _validate_effort_economics_contract(decisions: PilotDecisionArtifact) -> None:
    analysis = decisions.analysis
    manifest = decisions.manifest
    effort_arm = manifest.expected_effort_arm
    effort_by_family = dict(effort_arm.family_efforts) if effort_arm is not None else {}
    for effort in analysis.effort:
        if effort.baseline_effort != manifest.expected_grid.effort:
            raise ValueError("analysis baseline effort disagrees with the manifest")
        expected_candidate = effort_by_family.get(effort.family_id)
        observed_candidate = effort.candidate.effort if effort.candidate is not None else None
        if observed_candidate != expected_candidate:
            raise ValueError("analysis effort candidate disagrees with the manifest")

    expected_bundles = tuple(
        sorted(
            bundle_id(shell=shell, framing=framing)
            for shell in analysis.admitted_shells
            for framing in analysis.admitted_framings
        )
    )
    if analysis.economics.admitted_bundles != expected_bundles:
        raise ValueError("analysis admitted bundles disagree with axis decisions")
    expected_calls = manifest.full_grid_card_count * len(expected_bundles)
    if analysis.economics.projected_calls != expected_calls:
        raise ValueError("analysis projected calls disagree with the manifest")


def _validate_analysis_contract(decisions: PilotDecisionArtifact) -> None:
    _validate_qualification_contract(decisions)
    _validate_health_contract(decisions)
    _validate_rate_contract(decisions)
    _validate_decision_contract(decisions)
    _validate_effort_economics_contract(decisions)


def _markdown(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


def _joined(values: tuple[str, ...]) -> str:
    return ", ".join(_markdown(value) for value in values) or "none"


def _yes(*, value: bool) -> str:
    return "yes" if value else "no"


def _rate(value: RateEstimate) -> str:
    evidence = (
        f"successes={value.successes}/{value.observations}; clusters={value.clusters}; "
        f"cluster={value.cluster_unit}; bootstrap={value.bootstrap_defined}/"
        f"{value.bootstrap_resamples}; seed={value.bootstrap_seed}"
    )
    if value.estimate is None:
        return f"undefined ({evidence})"
    if value.lower is None or value.upper is None:
        return f"{value.estimate:.6f} [CI undefined] ({evidence})"
    return f"{value.estimate:.6f} [{value.lower:.6f}, {value.upper:.6f}] ({evidence})"


def _money(value: float | None) -> str:
    return "unknown" if value is None else f"${value:.6f}"


def _summary(decisions: PilotDecisionArtifact) -> list[str]:
    return [
        "# Factorial pilot analysis - rubric v1",
        "",
        "## Decision summary",
        "",
        f"- Qualified families: {_joined(decisions.qualified_families)}.",
        f"- Pruned families: {_joined(decisions.pruned_families)}.",
        f"- Admitted shells: {_joined(decisions.admitted_shells)}.",
        f"- Admitted framings: {_joined(decisions.admitted_framings)}.",
        f"- Projected full-grid cost: {_money(decisions.projected_grid_cost_usd)}.",
        "",
        "The analysis resamples cards, never votes. Every rate below records its "
        "cluster unit, seed, requested resamples, and defined resamples.",
    ]


def _health(decisions: PilotDecisionArtifact) -> list[str]:
    health = decisions.analysis.data_health
    lines = [
        "## Phase 0 - validation and data health",
        "",
        f"Loaded {health.votes_loaded} logical votes; {health.clean_votes} passed exact "
        f"route replay and {health.routing_violations} were rejected.",
        f"Reasons over {health.reason_word_limit} words: {health.reasons_over_word_limit} "
        f"({health.reason_over_limit_rate:.6%}).",
        "",
        "### Cell coverage",
        "",
        "| family | bundle | raw | route-dropped | clean | expected | missing rate | rerun |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |",
    ]
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.bundle_id} | {row.raw_observed} | "
        f"{row.routing_dropped} | {row.observed} | {row.expected} | "
        f"{row.missing_rate:.6%} | {_yes(value=row.rerun_required)} |"
        for row in health.coverage
    )
    lines.extend(
        [
            "",
            "### Routing fidelity",
            "",
            "| family | bundle | violations | observed | violation rate | rerun |",
            "| --- | --- | ---: | ---: | ---: | :---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.bundle_id} | {row.violations} | "
        f"{row.observed} | {row.violation_rate:.6%} | {_yes(value=row.rerun_required)} |"
        for row in health.routing
    )
    lines.extend(
        [
            "",
            "### Prompt compatibility",
            "",
            "| family | bundle | responses | abstention | repair | flag |",
            "| --- | --- | ---: | ---: | ---: | :---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.bundle_id} | {row.responses} | "
        f"{row.abstention_rate:.6%} | {row.parse_retry_rate:.6%} | "
        f"{_yes(value=row.prompt_compatibility_flag)} |"
        for row in health.family_bundle
    )
    if health.warnings:
        lines.extend(["", "Findings:"])
        lines.extend(f"- {_markdown(warning)}." for warning in health.warnings)
    return lines


def _qualification(decisions: PilotDecisionArtifact) -> list[str]:
    lines = [
        "## Phase 1 - qualification",
        "",
        "| family | correct | mandatory probes | decision |",
        "| --- | ---: | :---: | :---: |",
    ]
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.correct_count}/{row.total_count} | "
        f"{_yes(value=row.mandatory_probes_correct)} | "
        f"{'QUALIFY' if row.passed else 'PRUNE'} |"
        for row in decisions.analysis.qualification
    )
    lines.extend(
        [
            "",
            "### Cross-bundle holdout answers",
            "",
            "`ok` means the observed verdict is accepted; `miss` includes abstention or "
            "a missing answer. `*` marks a mandatory probe.",
        ]
    )
    for family in decisions.analysis.qualification:
        relation_ids = tuple(row.relation_id for row in family.bundles[0].holdouts)
        header = " | ".join(
            f"{_markdown(row.relation_id)}{'*' if row.mandatory_probe else ''}"
            for row in family.bundles[0].holdouts
        )
        lines.extend(
            [
                "",
                f"#### {_markdown(family.family_id)}",
                "",
                f"| bundle | {header} |",
                "| --- | " + " | ".join(":---:" for _ in relation_ids) + " |",
            ]
        )
        for bundle in family.bundles:
            cells = " | ".join(
                f"{'ok' if holdout.correct else 'miss'}:{_markdown(holdout.verdict or 'missing')}"
                for holdout in bundle.holdouts
            )
            lines.append(f"| {bundle.bundle_id} | {cells} |")
    return lines


def _stability(decisions: PilotDecisionArtifact) -> list[str]:
    analysis = decisions.analysis
    lines = [
        "## Phase 2 - stability and admissions",
        "",
        f"Family disagreement: {_rate(analysis.family_stability)}.",
        f"Repeat instability: {_rate(analysis.repeat_stability.rate)}.",
        f"Repeat pair coverage: {analysis.repeat_stability.matched_pairs}/"
        f"{analysis.repeat_stability.expected_pairs}; missing "
        f"{analysis.repeat_stability.missing_pairs}.",
        "",
        "| axis | level | candidate flip rate | admitted | basis |",
        "| --- | --- | --- | :---: | --- |",
    ]
    lines.extend(
        f"| {row.axis} | {row.level} | {_rate(row.stability.candidate)} | "
        f"{_yes(value=row.admitted)} | {_markdown('; '.join(row.reasons))} |"
        for row in analysis.admissions
    )
    lines.extend(["", "### Contested non-holdout cards", ""])
    contested = set(analysis.contested_relations)
    lines.extend(
        [
            "| relation | normalized entropy | nominal votes |",
            "| --- | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.relation_id)} | {row.entropy:.6f} | {row.nominal_votes} |"
        for row in analysis.card_entropy
        if row.relation_id in contested
    )
    return lines


def _effort_and_economics(decisions: PilotDecisionArtifact) -> list[str]:
    analysis = decisions.analysis
    lines = [
        "## Phase 3 - effort and projected economics",
        "",
        "| family | baseline | candidate | holdout | rescues | regressions | selected | basis |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ]
    for row in analysis.effort:
        candidate = row.candidate
        holdout_correct = (
            candidate.holdout.correct if candidate is not None else row.baseline_holdout_correct
        )
        lines.append(
            f"| {_markdown(row.family_id)} | {row.baseline_effort} | "
            f"{candidate.effort if candidate is not None else 'none'} | "
            f"{holdout_correct} | "
            f"{candidate.holdout.rescues if candidate is not None else 0} | "
            f"{candidate.holdout.regressions if candidate is not None else 0} | "
            f"{row.selected_effort} | {_markdown('; '.join(row.reasons))} |"
        )
    lines.extend(
        [
            "",
            f"Admitted bundles: {_joined(analysis.economics.admitted_bundles)}. "
            f"Projected calls per family: {analysis.economics.projected_calls}.",
            "",
            "| family | effort | cost basis | reported | mean cost/vote | calls | projected | "
            "tokens/vote | inflation |",
            "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {_markdown(row.family_id)} | {row.selected_effort} | "
        f"{_joined(row.cost_basis_bundles)} | {row.cost_reported}/{row.observations} | "
        f"{_money(row.measured_cost_per_vote_usd)} | {row.projected_calls} | "
        f"{_money(row.projected_cost_usd)} | "
        f"{row.billed_tokens_per_vote if row.billed_tokens_per_vote is not None else 'unknown'} | "
        f"{row.token_inflation_factor if row.token_inflation_factor is not None else 'unknown'} |"
        for row in analysis.economics.families
    )
    lines.extend(["", f"Projected full-grid cost: {_money(decisions.projected_grid_cost_usd)}."])
    return lines


def render_pilot_markdown(decisions: PilotDecisionArtifact) -> str:
    """Render the human report exclusively from validated decision data.

    Raises:
        ValueError: A persisted identity would make the report non-ASCII.

    """
    lines: list[str] = []
    for section in (
        _summary(decisions),
        _health(decisions),
        _qualification(decisions),
        _stability(decisions),
        _effort_and_economics(decisions),
    ):
        lines.extend(section)
        lines.append("")
    report = "\n".join(lines)
    try:
        report.encode("ascii")
    except UnicodeEncodeError as error:
        raise ValueError("pilot report values must be ASCII") from error
    return report


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _require_full_write(path: Path, *, written: int, expected: int) -> None:
    if written != expected:
        raise OSError(f"short write to {path}: wrote {written} of {expected} bytes")


def _atomic_replace(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            written = output.write(payload)
            _require_full_write(path, written=written, expected=len(payload))
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
        _sync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def load_pilot_decisions(path: Path) -> LoadedPilotDecisions:
    """Load one source-bound pilot decision artifact without coercion.

    Args:
        path: Exact `decisions.json` path to read.

    Returns:
        The strict decision model and SHA-256 identity of its source bytes.

    Raises:
        ValueError: The file cannot be read or fails the complete decision
            contract.

    """
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read pilot decisions {path}: {error}") from error
    try:
        decisions = PilotDecisionArtifact.model_validate_json(payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid pilot decisions {path}: {error}") from error
    return LoadedPilotDecisions(
        path=path,
        decisions=decisions,
        content_hash=sha256_bytes(payload),
    )


def write_pilot_artifacts(
    output_directory: Path,
    decisions: PilotDecisionArtifact,
) -> PilotAnalysisRun:
    """Atomically write, revalidate, and render one pilot analysis.

    `decisions.json` is committed first. A crash before `report.md` leaves the
    machine contract intact, and rerunning deterministically repairs the human
    report.

    Raises:
        OSError: An output cannot be written or synchronized.
        ValueError: Serialized decisions or rendered Markdown fail validation.

    """
    decision_payload = (
        json.dumps(
            decisions.model_dump(mode="json", round_trip=True),
            allow_nan=False,
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ).encode("ascii")
        + b"\n"
    )
    decisions_path = output_directory / "decisions.json"
    report_path = output_directory / "report.md"
    _atomic_replace(decisions_path, decision_payload)
    persisted_payload = decisions_path.read_bytes()
    persisted = PilotDecisionArtifact.model_validate_json(persisted_payload, strict=True)
    report_payload = render_pilot_markdown(persisted).encode("ascii")
    _atomic_replace(report_path, report_payload)
    return PilotAnalysisRun(
        decisions=persisted,
        decisions_json=decisions_path,
        report_md=report_path,
        decisions_hash=sha256_bytes(persisted_payload),
        report_hash=sha256_bytes(report_payload),
    )
