from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import BaseModel

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    PilotAnalysis,
    PilotAnalysisError,
    PilotAnalysisPolicy,
    PilotHoldoutRule,
    analyze_pilot,
)
from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    AcceptedAttempt,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    BundleId,
    CardHash,
    EvaluationCard,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    HandoffManifest,
    JudgeConfig,
    JudgeFamilyId,
    MaxCompletionTokensLimit,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    PilotJudgePin,
    PromptPackHash,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    ReasoningEffort,
    RelationId,
    RequestHash,
    RunDates,
    SliceDerivation,
    SliceRecord,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VoteProvenance,
    VoteRequest,
    VoteTiming,
    VoteVerdict,
    bundle_parts,
)
from atlas_tools.relation.evaluation.storage.api import load_deck

_NOW = datetime(2026, 7, 14, tzinfo=UTC)
_PROMPT_HASH = PromptPackHash(sha256_bytes(b"pilot prompt"))
_FAMILIES = (
    JudgeFamilyId("model/c"),
    JudgeFamilyId("model/a"),
    JudgeFamilyId("model/b"),
)
_RELATIONS = (
    "test:N3",
    "test:H2",
    "test:N1",
    "test:H1",
    "test:N2",
    "test:H3",
)
_HOLDOUTS = frozenset({"test:H1", "test:H2", "test:H3"})
_PAID = Path(__file__).parents[3] / "runs" / "evaluate"


def _policy(*, routing_ceiling: float = 0.005) -> PilotAnalysisPolicy:
    return PilotAnalysisPolicy(
        holdouts=(
            PilotHoldoutRule(
                relation_id="test:H1",
                accepted_verdicts=("proximal",),
                mandatory_probe=True,
            ),
            PilotHoldoutRule(
                relation_id="test:H2",
                accepted_verdicts=("proximal",),
                mandatory_probe=True,
            ),
            PilotHoldoutRule(
                relation_id="test:H3",
                accepted_verdicts=("proximal",),
            ),
        ),
        holdout_minimum_correct=2,
        stream_missing_rerun_rate=0.2,
        routing_rerun_rate=routing_ceiling,
        bootstrap_resamples=20,
        confidence_level=0.8,
        minimum_bootstrap_defined_rate=1.0,
        estimated_tokens_per_vote=100,
    )


def _card(relation_id: RelationId) -> EvaluationCard:
    text = f"Pilot card for {relation_id}"
    return EvaluationCard(
        relation_id=relation_id,
        producer="test",
        card_text=text,
        card_hash=CardHash(sha256_bytes(text.encode())),
        token_count=5,
    )


def _manifest(cards: tuple[EvaluationCard, ...]) -> HandoffManifest:
    relation_ids = tuple(card.relation_id for card in cards)
    family_efforts: dict[JudgeFamilyId, ReasoningEffort] = {
        JudgeFamilyId("model/a"): "high"
    }
    return HandoffManifest(
        schema_version=3,
        expected_grid=ExpectedGrid(
            families=_FAMILIES,
            bundles=BUNDLES,
            relation_ids=relation_ids,
            effort="minimal",
        ),
        expected_repeat_arm=ExpectedRepeatArm(
            families=_FAMILIES,
            relation_ids=("test:N1",),
            effort="minimal",
            repeat_indices=(1, 2),
        ),
        expected_effort_arm=ExpectedEffortArm(
            family_efforts=family_efforts,
            relation_ids=relation_ids,
        ),
        slice_derivation=SliceDerivation(
            algorithm="stratified-hash-v1",
            sampling_seed=7,
            requested_non_holdouts=3,
            eligible_non_holdouts=3,
            selected_non_holdouts=3,
            cards_hash=sha256_bytes(b"cards"),
            sampling_config_hash=sha256_bytes(b"sampling"),
            selection_hash=sha256_bytes(b"selection"),
        ),
        run_dates=RunDates(started_at=_NOW, completed_at=_NOW),
        judges=tuple(
            PilotJudgePin(
                judge=JudgeConfig(
                    provider_slug=ProviderSlug(f"provider-{family_id}"),
                    provider_name=ProviderName(f"Provider {family_id}"),
                    model=ModelId(family_id),
                    higher_effort="high" if family_id == "model/a" else None,
                    output_token_limit=MaxCompletionTokensLimit(tokens=256),
                ),
            )
            for family_id in _FAMILIES
        ),
        prompt_pack_hash=_PROMPT_HASH,
        rubric_version="rubric-v1",
        full_grid_card_count=10,
        source_hashes={
            "attempts.jsonl": sha256_bytes(b"attempts"),
            "cards.jsonl": sha256_bytes(b"deck"),
            "cards.manifest.json": sha256_bytes(b"deck manifest"),
            "slice.jsonl": sha256_bytes(b"slice"),
            "votes.jsonl": sha256_bytes(b"votes"),
        },
        openrouter_sdk_version="test-sdk",
        openrouter_openapi_version="test-openapi",
        executor_config={},
    )


def _slice(cards: tuple[EvaluationCard, ...]) -> tuple[SliceRecord, ...]:
    return tuple(
        SliceRecord(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            prescreen_stratum=card.prescreen_stratum,
            sampling_stratum="holdout" if card.relation_id in _HOLDOUTS else "ordinary",
            length_quartile=1,
            pilot_strata=card.pilot_strata,
            token_count=card.token_count,
            is_holdout=card.relation_id in _HOLDOUTS,
            holdout_verdict=("proximal" if card.relation_id in _HOLDOUTS else None),
            sampling_seed=7,
            selection_key=sha256_bytes(f"selection:{card.relation_id}".encode()),
        )
        for card in cards
    )


def _baseline_verdict(
    relation_id: RelationId,
    family_id: JudgeFamilyId,
    bundle: BundleId,
) -> VoteVerdict:
    if relation_id in _HOLDOUTS:
        if family_id == "model/a" and relation_id == "test:H3":
            return "overlay"
        if family_id == "model/c" and relation_id == "test:H1":
            return "overlay"
        return "proximal"
    if family_id == "model/c":
        return "ABSTAIN" if bundle == "S3xF3" else "unclear"
    shell, framing = bundle_parts(bundle)
    flipped = (shell == "S3") != (framing == "F3")
    if family_id == "model/a":
        return "overlay" if flipped else "proximal"
    return "proximal" if flipped else "overlay"


def _result(family_id: JudgeFamilyId, verdict: VoteVerdict, cost: float) -> ProviderResult:
    return ProviderResult.model_validate(
        {
            "id": f"result-{family_id}",
            "model": family_id,
            "choices": [{"message": {"content": f'{{"verdict":"{verdict}"}}'}}],
            "usage": {"prompt_tokens": 60, "completion_tokens": 40, "cost": cost},
            "openrouter_metadata": {
                "requested": family_id,
                "strategy": "direct",
                "attempt": 1,
                "endpoints": {
                    "available": [
                        {
                            "provider": f"Provider {family_id}",
                            "model": family_id,
                            "selected": True,
                        }
                    ]
                },
            },
        },
        strict=True,
    )


def _vote(
    card: EvaluationCard,
    family_id: JudgeFamilyId,
    bundle: BundleId,
    effort: ReasoningEffort,
    repeat_index: int,
    verdict: VoteVerdict,
) -> tuple[Vote, PhysicalAttempt]:
    cost = 0.3 if family_id == "model/a" and effort == "high" else 0.1
    result = _result(family_id, verdict, cost)
    identity = f"{card.relation_id}|{family_id}|{bundle}|{effort}|{repeat_index}"
    vote_id = VoteId(sha256_bytes(identity.encode()))
    physical_id = AttemptId(sha256_bytes(f"attempt:{identity}".encode()))
    attempt = PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=physical_id,
            vote_id=vote_id,
            request_hash=RequestHash(sha256_bytes(f"request:{identity}".encode())),
            stage="initial",
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=family_id,
            provider_slug=ProviderSlug(f"provider-{family_id}"),
            model_requested=ModelId(family_id),
        ),
        outcome=AcceptedAttempt(result=result),
        timing=AttemptTiming(
            request_at=_NOW,
            response_at=_NOW,
            latency=timedelta(),
        ),
    )
    vote = Vote(
        identity=VoteIdentity(vote_id=vote_id, relation_id=card.relation_id),
        provenance=VoteProvenance(
            card_hash=card.card_hash,
            rubric_version="rubric-v1",
            prompt_pack_hash=_PROMPT_HASH,
        ),
        request=VoteRequest(
            judge=JudgeConfig(
                provider_name=ProviderName(f"Provider {family_id}"),
                provider_slug=ProviderSlug(f"provider-{family_id}"),
                model=ModelId(family_id),
                higher_effort="high" if family_id == "model/a" else None,
            ),
            bundle_id=bundle,
            effort=effort,
            temperature=0.0,
            seed=7,
            repeat_index=repeat_index,
        ),
        decision=VoteDecision(
            verdict=verdict,
            reason="hand-computed evidence",
            raw_completion=f'{{"verdict":"{verdict}"}}',
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=(physical_id,),
            model_returned=ModelId(family_id),
        ),
        accounting=VoteAccounting(
            tokens_in=60,
            tokens_out=40,
            tokens_cached=0,
            known_cost_usd=cost,
            cost_complete=True,
        ),
        timing=VoteTiming(
            request_at=_NOW,
            response_at=_NOW,
            latency=timedelta(),
        ),
    )
    return vote, attempt


def _cohort() -> tuple[
    HandoffManifest,
    tuple[SliceRecord, ...],
    tuple[EvaluationCard, ...],
    tuple[Vote, ...],
    tuple[PhysicalAttempt, ...],
]:
    cards = tuple(_card(relation_id) for relation_id in _RELATIONS)
    manifest = _manifest(cards)
    evidence: list[tuple[Vote, PhysicalAttempt]] = []
    evidence.extend(
        _vote(
            card,
            family_id,
            bundle,
            "minimal",
            0,
            _baseline_verdict(card.relation_id, family_id, bundle),
        )
        for card in cards
        for family_id in _FAMILIES
        for bundle in BUNDLES
    )
    repeat_card = next(card for card in cards if card.relation_id == "test:N1")
    repeat_verdicts: dict[JudgeFamilyId, tuple[VoteVerdict, VoteVerdict]] = {
        JudgeFamilyId("model/a"): ("proximal", "overlay"),
        JudgeFamilyId("model/b"): ("overlay", "overlay"),
        JudgeFamilyId("model/c"): ("unclear", "unclear"),
    }
    for family_id, verdicts in repeat_verdicts.items():
        for repeat_index, verdict in enumerate(verdicts, start=1):
            evidence.append(
                _vote(repeat_card, family_id, "S1xF1", "minimal", repeat_index, verdict)
            )
    evidence.extend(
        _vote(card, JudgeFamilyId("model/a"), "S1xF1", "high", 0, "proximal")
        for card in cards
    )
    votes, attempts = zip(*reversed(evidence), strict=True)
    return manifest, _slice(cards), cards, votes, attempts


def _analyze(policy: PilotAnalysisPolicy | None = None) -> PilotAnalysis:
    manifest, slice_records, cards, votes, attempts = _cohort()
    return analyze_pilot(
        manifest=manifest,
        slice_records=slice_records,
        cards=cards,
        votes=votes,
        attempts=attempts,
        policy=policy or _policy(),
    )


def test_pilot_analysis_derives_pruning_admission_effort_and_cost() -> None:
    result = _analyze()

    assert result.qualified_families == ("model/a", "model/b")
    assert result.pruned_families == ("model/c",)
    assert tuple(
        (row.family_id, row.correct_count, row.mandatory_probes_correct, row.passed)
        for row in result.qualification
    ) == (
        ("model/a", 2, True, True),
        ("model/b", 3, True, True),
        ("model/c", 2, False, False),
    )
    assert result.contested_relations == ("test:N1",)
    assert result.family_stability.estimate == 1.0
    assert result.repeat_stability.expected_pairs == 6
    assert result.repeat_stability.rate.observations == 6
    assert result.repeat_stability.rate.successes == 2
    assert result.repeat_stability.rate.estimate == pytest.approx(1 / 3)

    assert tuple((row.axis, row.level, row.admitted) for row in result.admissions) == (
        ("shell", "S2", True),
        ("shell", "S3", False),
        ("framing", "F2", True),
        ("framing", "F3", False),
    )
    assert result.admitted_shells == ("S1", "S2")
    assert result.admitted_framings == ("F1", "F2")
    assert tuple((row.family_id, row.selected_effort) for row in result.effort) == (
        ("model/a", "high"),
        ("model/b", "minimal"),
    )
    candidate = result.effort[0].candidate
    assert candidate is not None
    assert (
        candidate.holdout.correct,
        candidate.holdout.rescues,
        candidate.holdout.regressions,
    ) == (
        3,
        1,
        0,
    )

    assert result.economics.admitted_bundles == ("S1xF1", "S1xF2", "S2xF1", "S2xF2")
    assert result.economics.projected_calls == 40
    family_a, family_b = result.economics.families
    assert (family_a.observations, family_a.measured_cost_per_vote_usd) == pytest.approx((6, 0.3))
    assert (family_b.observations, family_b.measured_cost_per_vote_usd) == pytest.approx((24, 0.1))
    assert result.economics.projected_grid_cost_usd == pytest.approx(16.0)
    flagged = tuple(
        (row.family_id, row.bundle_id, row.abstention_rate)
        for row in result.data_health.family_bundle
        if row.prompt_compatibility_flag
    )
    assert flagged == (("model/c", "S3xF3", 0.5),)


def test_route_replay_fails_before_decisions_when_stream_threshold_is_exceeded() -> None:
    manifest, slice_records, cards, votes, attempts = _cohort()
    target = next(
        attempt
        for attempt in attempts
        if attempt.family_id == "model/c"
        and next(vote for vote in votes if vote.vote_id == attempt.vote_id).bundle_id == "S3xF3"
    )
    corrupted = target.model_copy(
        update={
            "route": target.route.model_copy(
                update={"model_requested": ModelId("wrong/model")}
            ),
        }
    )
    replaced = tuple(
        corrupted if attempt.attempt_id == target.attempt_id else attempt for attempt in attempts
    )

    with pytest.raises(PilotAnalysisError, match="routing requires stream reruns"):
        analyze_pilot(
            manifest=manifest,
            slice_records=slice_records,
            cards=cards,
            votes=votes,
            attempts=replaced,
            policy=_policy(routing_ceiling=0.1),
        )


def _rows[Model: BaseModel](path: Path, model: type[Model]) -> tuple[Model, ...]:
    with path.open("rb") as input_file:
        return tuple(
            model.model_validate_json(line, strict=True) for line in input_file if line.strip()
        )


def _paid_policy() -> PilotAnalysisPolicy:
    return PilotAnalysisPolicy(
        holdouts=(
            PilotHoldoutRule(
                relation_id="wikidata:P1382",
                accepted_verdicts=("proximal",),
                mandatory_probe=True,
            ),
            PilotHoldoutRule(
                relation_id="wikidata:P2634",
                accepted_verdicts=("overlay",),
                mandatory_probe=True,
            ),
            PilotHoldoutRule(relation_id="wikidata:P2739", accepted_verdicts=("overlay",)),
            PilotHoldoutRule(
                relation_id="wikidata:P3403",
                accepted_verdicts=("coincident", "proximal"),
            ),
            PilotHoldoutRule(relation_id="wikidata:P47", accepted_verdicts=("proximal",)),
            PilotHoldoutRule(relation_id="wikidata:P6", accepted_verdicts=("overlay",)),
        ),
        holdout_minimum_correct=5,
    )


def test_paid_handoff_decision_projection_matches_legacy_golden_hash() -> None:
    manifest = HandoffManifest.model_validate_json(
        (_PAID / "manifest.json").read_bytes(), strict=True
    )
    slice_records = _rows(_PAID / "slice.jsonl", SliceRecord)
    relation_ids = {row.relation_id for row in slice_records}
    deck = load_deck(_PAID.parent / "cards")
    cards = tuple(card for card in deck.cards if card.relation_id in relation_ids)
    result = analyze_pilot(
        manifest=manifest,
        slice_records=slice_records,
        cards=cards,
        votes=_rows(_PAID / "votes.jsonl", Vote),
        attempts=_rows(_PAID / "attempts.jsonl", PhysicalAttempt),
        policy=_paid_policy(),
    )
    compatibility = {
        "source_hashes": dict(result.source_hashes),
        "pruned_families": result.pruned_families,
        "admitted_shells": result.admitted_shells,
        "admitted_framings": result.admitted_framings,
        "selected_efforts": tuple((row.family_id, row.selected_effort) for row in result.effort),
        "projected_grid_cost_usd": result.economics.projected_grid_cost_usd,
    }

    assert sha256_bytes(canonical_json_bytes(compatibility)) == (
        "158664cd41d7247f55ec85ea953a5554a7969002c7aa9ab4d8ddcd179aa14a04"
    )
