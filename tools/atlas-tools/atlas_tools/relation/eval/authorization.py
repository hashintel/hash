"""Pilot-decision loading and complete-grid authorization."""

from collections.abc import Sequence
from os import PathLike
from pathlib import Path
from typing import Literal

from pydantic import ValidationError

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.eval.contract import (
    AuthorizedJudges,
    CardCandidate,
    FamilyDecision,
    FullGridAuthorization,
    FullRunConfig,
    LoadedAnalysisDecisions,
    VerifiedConcat,
)
from atlas_tools.relation.eval.provenance import judge_pin, judge_request_hash
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    AnalysisDecisions,
    BundleId,
    FullGridExpectation,
    ReasoningEffort,
)


def load_analysis_decisions(path: str | PathLike[str]) -> AnalysisDecisions:
    """Load a strict, versioned pilot decisions artifact."""
    return load_analysis_decisions_file(Path(path)).decisions


def load_analysis_decisions_file(path: Path) -> LoadedAnalysisDecisions:
    """Load decisions together with their exact content hash."""
    try:
        payload = path.read_bytes()
        decisions = AnalysisDecisions.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid analysis decisions {path}: {error}") from error
    return LoadedAnalysisDecisions(
        path=path,
        decisions=decisions,
        content_hash=sha256_bytes(payload),
    )


def _decision_family_map[Decision: FamilyDecision](
    decisions: Sequence[Decision],
    *,
    label: str,
) -> dict[str, Decision]:
    by_family: dict[str, Decision] = {}
    for decision in decisions:
        family_id = decision.family_id
        if not family_id:
            raise ValueError(f"{label} contains an invalid family_id")
        if family_id in by_family:
            raise ValueError(f"{label} contains duplicate family {family_id}")
        by_family[family_id] = decision
    return by_family


def _validate_admissions(decisions: AnalysisDecisions) -> None:
    by_axis: dict[Literal["shell", "template"], dict[str, bool]] = {
        "shell": {},
        "template": {},
    }
    for admission in decisions.admissions:
        levels = by_axis[admission.axis]
        if admission.level in levels:
            raise ValueError(
                f"analysis decisions contain duplicate {admission.axis} admission {admission.level}"
            )
        levels[admission.level] = admission.admitted

    expected_levels = {"shell": {"S2", "S3"}, "template": {"F2", "F3"}}
    if set(by_axis["shell"]) != expected_levels["shell"]:
        raise ValueError("analysis decisions do not contain the complete shell admission policy")
    if set(by_axis["template"]) != expected_levels["template"]:
        raise ValueError("analysis decisions do not contain the complete template admission policy")

    admitted_shells = {"S1"} | {level for level, admitted in by_axis["shell"].items() if admitted}
    admitted_templates = {"F1"} | {
        level for level, admitted in by_axis["template"].items() if admitted
    }
    if set(decisions.admitted_shells) != admitted_shells:
        raise ValueError("admitted_shells is inconsistent with the recorded admission decisions")
    if set(decisions.admitted_templates) != admitted_templates:
        raise ValueError("admitted_templates is inconsistent with the recorded admission decisions")


def _remaining_families(config: FullRunConfig, decisions: AnalysisDecisions) -> set[str]:
    configured = {judge.family_id for judge in config.judges}
    qualification = _decision_family_map(decisions.qualification, label="qualification")
    if set(qualification) != configured:
        raise ValueError("analysis decisions and judge config contain different families")
    if len(decisions.pruned_families) != len(set(decisions.pruned_families)):
        raise ValueError("analysis decisions contain duplicate pruned families")
    expected_pruned = {
        family_id for family_id, result in qualification.items() if not result.passed
    }
    if set(decisions.pruned_families) != expected_pruned:
        raise ValueError("pruned_families is inconsistent with qualification results")
    remaining = configured - expected_pruned
    if not remaining:
        raise ValueError("analysis decisions pruned every configured judge family")
    return remaining


def _validate_judge_request_hashes(
    config: FullRunConfig,
    decisions: AnalysisDecisions,
) -> None:
    configured = {judge.family_id: judge_request_hash(judge_pin(judge)) for judge in config.judges}
    recorded = decisions.pilot_run_contract.judge_request_hashes
    if set(recorded) != set(configured):
        raise ValueError(
            "pilot judge request hashes and full-run config contain different families"
        )
    changed = sorted(
        family_id
        for family_id, request_hash in configured.items()
        if recorded[family_id] != request_hash
    )
    if changed:
        raise ValueError(f"full-run judge request settings differ from the pilot: {changed}")


def _authorized_judges(
    config: FullRunConfig,
    decisions: AnalysisDecisions,
) -> AuthorizedJudges:
    remaining = _remaining_families(config, decisions)
    efforts = _decision_family_map(decisions.effort_policy, label="effort_policy")
    cost_audit = _decision_family_map(decisions.cost_audit, label="cost_audit")
    if set(efforts) != remaining:
        raise ValueError("effort_policy must contain exactly the non-pruned judge families")
    if set(cost_audit) != remaining:
        raise ValueError("cost_audit must contain exactly the non-pruned judge families")

    family_efforts: dict[str, ReasoningEffort] = {}
    judges = []
    for judge in config.judges:
        if judge.family_id not in remaining:
            continue
        decision = efforts[judge.family_id]
        selected = decision.selected_effort
        if decision.baseline_effort != config.baseline_effort:
            raise ValueError(f"baseline effort mismatch for family {judge.family_id}")
        if decision.candidate_effort != judge.higher_effort:
            raise ValueError(f"candidate effort mismatch for family {judge.family_id}")
        if selected not in {config.baseline_effort, judge.higher_effort}:
            raise ValueError(f"selected effort is not configured for family {judge.family_id}")
        if cost_audit[judge.family_id].selected_effort != selected:
            raise ValueError(f"cost audit effort mismatch for family {judge.family_id}")
        family_efforts[judge.family_id] = selected
        judges.append(judge)
    return AuthorizedJudges(judges=tuple(judges), family_efforts=family_efforts)


def _admitted_bundles(decisions: AnalysisDecisions) -> list[BundleId]:
    admitted = {
        f"{shell}x{template}"
        for shell in decisions.admitted_shells
        for template in decisions.admitted_templates
    }
    return [bundle for bundle in BUNDLES if bundle in admitted]


def _validate_pilot_corpus(
    decisions: AnalysisDecisions,
    verified: VerifiedConcat,
    candidates: Sequence[CardCandidate],
) -> None:
    contract = decisions.pilot_run_contract
    if contract.cards_hash != verified.source_hashes["cards.jsonl"]:
        raise ValueError("full-run cards.jsonl differs from the corpus sampled by the pilot")
    if contract.cards_manifest_hash != verified.source_hashes["cards.manifest.json"]:
        raise ValueError("full-run cards manifest differs from the corpus sampled by the pilot")
    if contract.full_grid_card_count != len(candidates):
        raise ValueError("full-run eligible card count differs from the pilot cost basis")


def _validate_projected_calls(
    decisions: AnalysisDecisions,
    expectation: FullGridExpectation,
) -> None:
    audits = _decision_family_map(decisions.cost_audit, label="cost_audit")
    expected_calls = len(expectation.bundles) * len(expectation.relation_ids)
    for family_id in expectation.families:
        if audits[family_id].projected_calls != expected_calls:
            raise ValueError(f"projected call count mismatch for family {family_id}")


def authorize_full_grid(
    config: FullRunConfig,
    decisions: AnalysisDecisions,
    candidates: Sequence[CardCandidate],
    verified: VerifiedConcat,
) -> FullGridAuthorization:
    """Authorize only the exact corpus and judge requests qualified by the pilot."""
    if decisions.rubric_version != config.rubric_version:
        raise ValueError("analysis decisions, executor config, and current rubric do not match")
    _validate_pilot_corpus(decisions, verified, candidates)
    _validate_judge_request_hashes(config, decisions)
    _validate_admissions(decisions)
    authorized = _authorized_judges(config, decisions)
    expectation = FullGridExpectation(
        families=[judge.family_id for judge in authorized.judges],
        admitted_shells=list(decisions.admitted_shells),
        admitted_templates=list(decisions.admitted_templates),
        bundles=_admitted_bundles(decisions),
        relation_ids=sorted(candidate.relation_id for candidate in candidates),
        family_efforts=authorized.family_efforts,
    )
    _validate_projected_calls(decisions, expectation)
    return FullGridAuthorization(expectation=expectation, judges=authorized.judges)
