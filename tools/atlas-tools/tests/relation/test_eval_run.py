"""Schema-v3 relation evaluator execution and resume tests."""

import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from shutil import copytree
from threading import Event, Lock, Thread
from typing import ClassVar, Literal, Self

import httpx
import pytest
import yaml
from openrouter.components import (
    AnthropicCacheControlDirective,
    ChatAssistantMessage,
    ChatChoice,
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ChatToolCall,
    ChatToolCallFunction,
    ChatUsage,
    ChatUsageCompletionTokensDetails,
    ChatUsagePromptTokensDetails,
    EndpointInfo,
    EndpointsMetadata,
    OpenRouterMetadata,
    ProviderPreferences,
    RouterAttempt,
)
from openrouter.errors import ResponseValidationError
from openrouter.types import UNSET
from openrouter.utils.retries import RetryConfig
from pydantic import JsonValue

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import concat_relations
from atlas_tools.relation.eval import control as eval_control
from atlas_tools.relation.eval import executor as eval_executor
from atlas_tools.relation.eval import transport as eval_transport
from atlas_tools.relation.eval.accounting import CostGate, CostLimitReachedError
from atlas_tools.relation.eval.analysis import load_handoff
from atlas_tools.relation.eval.contract import PilotVotePlan, VoteTask
from atlas_tools.relation.eval.inputs import prepare_pilot_inputs
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    RETRY_INSTRUCTION,
    prompt_pack_hash,
)
from atlas_tools.relation.eval.provenance import (
    judge_pin,
    judge_request_hash,
    plan_hash,
    request_contract_hash,
)
from atlas_tools.relation.eval.resume import validate_resume
from atlas_tools.relation.eval.run import (
    ConcurrencyConfig,
    EvaluationCard,
    FullGridPaths,
    FullRunConfig,
    JudgeConfig,
    LoadedRunConfig,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    OpenRouterRegion,
    OpenRouterTransport,
    PilotRunConfig,
    SliceSamplingConfig,
    TransientRetryConfig,
    load_run_config,
    run_full_grid,
    run_pilot,
)
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    AdmissionDecision,
    AgreementResults,
    AnalysisDecisions,
    AnalysisPolicy,
    AxisStatistics,
    BundleId,
    DataHealth,
    EffortDecision,
    Estimate,
    FamilyCostAudit,
    FullGridManifest,
    OrderingCheck,
    PhysicalAttemptRow,
    PilotRunContract,
    QualificationResult,
    ReasoningEffort,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import (
    CardRow,
    RelationSourceSpec,
    qualify_relation_id,
)

MODEL = "test/model"
PROVIDER_SLUG = "test-provider/endpoint"
PROVIDER_NAME = "Test Provider"
OTHER_MODEL = "other/model"
OTHER_PROVIDER_NAME = "Other Provider"
LIVE_RELATION = qualify_relation_id("wikidata", "P999999")
SEVERE_RELATION = qualify_relation_id("wikidata", "P999998")
VALID_COMPLETION = '{"reason": "P1-P3 hold", "verdict": "proximal"}'
WRONG_VALID_COMPLETION = '{"reason": "deliberately wrong", "verdict": "unclear"}'
MALFORMED_COMPLETION = "not JSON"
PILOT_REPEAT_COUNT = 1
EXPECTED_VOTES = len(BUNDLES) * (len(HOLDOUT) + 1) + PILOT_REPEAT_COUNT

FAMILY_BASELINE = MODEL
FAMILY_HIGH = "test/judge-high-2026-07-13"
FAMILY_PRUNED = "test/judge-pruned-2026-07-13"
ADMITTED_BUNDLES: tuple[BundleId, ...] = ("S1xF1", "S1xF2", "S3xF1", "S3xF2")
FAMILY_EFFORTS: dict[str, ReasoningEffort] = {
    FAMILY_BASELINE: "minimal",
    FAMILY_HIGH: "high",
}


@dataclass(frozen=True)
class InvalidVotePlan:
    declared_votes: int
    stream: tuple[VoteTask, ...]

    @property
    def expected_votes(self) -> int:
        return self.declared_votes

    def tasks(self) -> Iterator[VoteTask]:
        return iter(self.stream)


@dataclass(frozen=True)
class TransportCall:
    messages: list[ChatMessages]
    judge: JudgeConfig
    effort: ReasoningEffort
    session_id: str
    timeout: timedelta


class ScriptedProviderError(RuntimeError):
    """Provider-shaped failure used to exercise native status/body/header handling."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        body: str,
        retry_after: timedelta | None = None,
    ) -> None:
        super().__init__(message)
        headers = (
            {"Retry-After": str(retry_after.total_seconds())} if retry_after is not None else None
        )
        self.status_code = status_code
        self.body = body
        self.raw_response = httpx.Response(status_code, headers=headers, text=body)


class ScriptedTransport:
    def __init__(self, script: list[ChatResult | Exception] | None = None) -> None:
        self.script = script or []
        self.calls: list[TransportCall] = []

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        call_index = len(self.calls)
        self.calls.append(
            TransportCall(
                messages=messages,
                judge=judge,
                effort=effort,
                session_id=session_id,
                timeout=timeout,
            )
        )
        if call_index < len(self.script):
            response = self.script[call_index]
            if isinstance(response, Exception):
                raise response
            return response
        return _result(
            completion_id=f"completion-{call_index}",
            model=judge.model,
            route_model=judge.model,
            route_provider=judge.provider_name,
            requested_model=judge.model,
        )


def _usage() -> ChatUsage:
    return ChatUsage(
        prompt_tokens=100,
        completion_tokens=5,
        total_tokens=105,
        cost=0.01,
        prompt_tokens_details=ChatUsagePromptTokensDetails(
            cached_tokens=80,
            cache_write_tokens=3,
        ),
        completion_tokens_details=ChatUsageCompletionTokensDetails(reasoning_tokens=2),
    )


def _metadata(
    *,
    route_model: str,
    route_provider: str,
    route_status: int,
    route_count: int,
    requested_model: str,
    include_attempts: bool,
) -> OpenRouterMetadata:
    routes = [
        RouterAttempt(model=route_model, provider=route_provider, status=route_status)
        for _ in range(route_count)
    ]
    return OpenRouterMetadata(
        attempt=1,
        endpoints=EndpointsMetadata(
            available=[
                EndpointInfo(
                    model=route_model,
                    provider=route_provider,
                    selected=index == 0,
                )
                for index in range(route_count)
            ],
            total=route_count,
        ),
        is_byok=False,
        region=None,
        requested=requested_model,
        strategy="direct",
        summary="test route",
        attempts=routes if include_attempts else None,
    )


def _result(
    content: str | None = VALID_COMPLETION,
    *,
    completion_id: str = "completion",
    model: str = MODEL,
    include_metadata: bool = True,
    route_model: str = MODEL,
    route_provider: str = PROVIDER_NAME,
    route_status: int = 200,
    route_count: int = 1,
    requested_model: str = MODEL,
    include_route_attempts: bool = True,
    include_usage: bool = True,
    choice_count: int = 1,
    choice_index: int = 0,
    finish_reason: str = "stop",
    refusal: str | None = None,
    tool_calls: list[ChatToolCall] | None = None,
) -> ChatResult:
    choices = [
        ChatChoice(
            finish_reason=finish_reason,
            index=choice_index,
            message=ChatAssistantMessage(
                role="assistant",
                content=content,
                refusal=refusal,
                tool_calls=tool_calls,
            ),
        )
        for _ in range(choice_count)
    ]
    return ChatResult(
        choices=choices,
        created=1,
        id=completion_id,
        model=model,
        object="chat.completion",
        system_fingerprint=None,
        openrouter_metadata=(
            _metadata(
                route_model=route_model,
                route_provider=route_provider,
                route_status=route_status,
                route_count=route_count,
                requested_model=requested_model,
                include_attempts=include_route_attempts,
            )
            if include_metadata
            else None
        ),
        usage=_usage() if include_usage else None,
    )


def _config(
    *,
    transient_retries: TransientRetryConfig | None = None,
) -> PilotRunConfig:
    return PilotRunConfig(
        schema_version=3,
        mode="pilot",
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=PILOT_REPEAT_COUNT,
        request_timeout=timedelta(seconds=5),
        transient_retries=transient_retries or TransientRetryConfig(),
        concurrency=ConcurrencyConfig(initial=1, maximum=1),
        judges=[
            JudgeConfig(
                provider_slug=PROVIDER_SLUG,
                provider_name=PROVIDER_NAME,
                model=MODEL,
                temperature=0.0,
                seed=17,
            )
        ],
    )


def _transient_retries(
    maximum_attempts: int,
    *,
    initial_delay: timedelta = timedelta(),
    maximum_delay: timedelta = timedelta(),
) -> TransientRetryConfig:
    return TransientRetryConfig(
        maximum_attempts=maximum_attempts,
        initial_delay=initial_delay,
        maximum_delay=maximum_delay,
    )


def _write_concat(directory: Path, *, include_severe: bool = False) -> Path:
    source = directory.with_name(f"{directory.name}-source")
    source.mkdir()
    cards_path = source / "cards.jsonl"
    relation_ids = sorted(
        {relation_id for relation_id, _ in FEW_SHOT}
        | {relation_id for relation_id, _ in HOLDOUT}
        | {LIVE_RELATION}
        | ({SEVERE_RELATION} if include_severe else set())
    )
    rows: list[CardRow] = []
    for relation_id in relation_ids:
        card_text = f"relation card for {relation_id}"
        local_id = relation_id.removeprefix("wikidata:")
        rows.append(
            CardRow.model_validate(
                {
                    "relation_id": relation_id,
                    "pid": local_id,
                    "card_text": card_text,
                    "card_hash": sha256_bytes(card_text.encode()),
                    "token_count": len(card_text.split()),
                    "truncations": ["fixture"] if relation_id == SEVERE_RELATION else [],
                    "severely_truncated": relation_id == SEVERE_RELATION,
                    "prescreen_stratum": "ordinary",
                    "pilot_strata": [],
                }
            )
        )
    cards_path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))
    Provenance[JsonValue, JsonValue].make(
        producer="test.wikidata-cards",
        content_hashes={"cards.jsonl": sha256_file(cards_path)},
        config={},
        details={
            "relation_source": RelationSourceSpec(
                namespace="wikidata",
                local_id_field="pid",
            ).model_dump(mode="json")
        },
    ).write(source / "cards.manifest.json")
    directory.mkdir()
    concat_relations([source], out=directory)
    return directory


@pytest.fixture
def cards_dir(tmp_path: Path) -> Path:
    return _write_concat(tmp_path / "concat")


def _read_votes(path: Path) -> list[VoteRow]:
    return [
        VoteRow.model_validate_json(line) for line in path.read_text(encoding="utf-8").splitlines()
    ]


def _read_attempts(path: Path) -> list[PhysicalAttemptRow]:
    return [
        PhysicalAttemptRow.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
    ]


def _read_slice(path: Path) -> list[SliceRow]:
    return [
        SliceRow.model_validate_json(line) for line in path.read_text(encoding="utf-8").splitlines()
    ]


@dataclass(frozen=True)
class FullGridFixture:
    cards_dir: Path
    decisions_path: Path
    decisions: AnalysisDecisions
    config: FullRunConfig
    paths: FullGridPaths
    transport: ScriptedTransport


def _family_model(family_id: str) -> str:
    return family_id


def _family_provider_slug(family_id: str) -> str:
    return PROVIDER_SLUG if family_id == FAMILY_BASELINE else f"test-provider/{family_id}"


def _family_provider_name(family_id: str) -> str:
    return PROVIDER_NAME if family_id == FAMILY_BASELINE else f"Provider {family_id}"


def _family_output_token_limit(
    family_id: str,
) -> MaxTokensLimit | MaxCompletionTokensLimit:
    if family_id == FAMILY_HIGH:
        return MaxCompletionTokensLimit(tokens=1024)
    return MaxTokensLimit(tokens=1024)


def _full_grid_config(decisions_path: Path) -> FullRunConfig:
    return FullRunConfig(
        schema_version=3,
        mode="full",
        decisions=decisions_path,
        request_timeout=timedelta(seconds=5),
        concurrency=ConcurrencyConfig(initial=1, maximum=1),
        judges=[
            JudgeConfig(
                provider_slug=_family_provider_slug(family_id),
                provider_name=_family_provider_name(family_id),
                model=_family_model(family_id),
                temperature=0.0,
                seed=17,
                higher_effort="high",
                output_token_limit=_family_output_token_limit(family_id),
            )
            for family_id in (FAMILY_BASELINE, FAMILY_HIGH, FAMILY_PRUNED)
        ],
    )


def _estimate(value: float = 0.0) -> Estimate:
    return Estimate(est=value, lo=value, hi=value, n=1)


def _analysis_decisions(cards_dir: Path, config: FullRunConfig) -> AnalysisDecisions:
    cards = {
        card.relation_id: card
        for line in (cards_dir / "cards.jsonl").read_text(encoding="utf-8").splitlines()
        if (card := EvaluationCard.model_validate_json(line))
    }
    zero = _estimate()
    judges = {judge.family_id: judge for judge in config.judges}
    eligible_card_count = len(_eligible_cards(cards_dir))
    projected_calls = eligible_card_count * len(ADMITTED_BUNDLES)
    return AnalysisDecisions(
        schema_version=3,
        policy=AnalysisPolicy(),
        input_hashes={},
        pilot_run_contract=PilotRunContract(
            cards_hash=sha256_file(cards_dir / "cards.jsonl"),
            cards_manifest_hash=sha256_file(cards_dir / "cards.manifest.json"),
            full_grid_card_count=eligible_card_count,
            judge_request_hashes={
                family_id: judge_request_hash(judge_pin(judge))
                for family_id, judge in judges.items()
            },
        ),
        prompt_pack_hash=prompt_pack_hash(cards),
        rubric_version="rubric-v1",
        sampling_seeds=[42],
        pruned_families=[FAMILY_PRUNED],
        admitted_shells=["S1", "S3"],
        admitted_templates=["F1", "F2"],
        escalation_order=[],
        floor_error_bar=zero,
        nomination_seeds=[],
        projected_grid_cost_usd=1.0,
        projected_grid_cost=_estimate(1.0),
        per_card_posteriors=[],
        effort_policy=[
            EffortDecision(
                family_id=family_id,
                baseline_effort=config.baseline_effort,
                selected_effort=selected_effort,
                candidate_effort=judges[family_id].higher_effort,
                baseline_holdout_correct=len(HOLDOUT),
                candidate_holdout_correct=len(HOLDOUT),
                non_contested_flip=zero,
                rescues=0,
                regressions=0,
                reasons=["validated fixture decision"],
            )
            for family_id, selected_effort in FAMILY_EFFORTS.items()
        ],
        data_health=DataHealth(
            votes_loaded=1,
            clean_votes=1,
            duplicate_vote_ids=[],
            contaminated_vote_ids=[],
            routing_violations=0,
            reasons_over_60_words=0,
            reason_over_60_word_rate=zero,
            coverage=[],
            routing=[],
            family_bundle=[],
            family_cost=[],
            warnings=[],
        ),
        qualification=[
            QualificationResult(
                family_id=family_id,
                correct_count=1 if family_id != FAMILY_PRUNED else 0,
                total_count=1,
                p1382_correct=family_id != FAMILY_PRUNED,
                p2634_correct=family_id != FAMILY_PRUNED,
                passed=family_id != FAMILY_PRUNED,
                bundle_correctness={},
                holdout_expected={},
                holdout_verdicts={},
            )
            for family_id in (FAMILY_BASELINE, FAMILY_HIGH, FAMILY_PRUNED)
        ],
        axis_statistics=AxisStatistics(
            entropy_tercile_cuts=(0.0, 0.0),
            marginals=[],
            noise_floor=zero,
            flips=[],
            agreement=AgreementResults(
                bundle_kappa_by_family={},
                qualification_family_kappa={},
                all_candidate_krippendorff_alpha=zero,
                qualified_panel_krippendorff_alpha=zero,
            ),
            ordering=OrderingCheck(rates={}, healthy_order_holds=True),
        ),
        admissions=[
            AdmissionDecision(
                axis="shell",
                level="S2",
                admitted=False,
                non_contested_flip=zero,
                family_flip=zero,
                reasons=["fixture policy"],
            ),
            AdmissionDecision(
                axis="shell",
                level="S3",
                admitted=True,
                non_contested_flip=zero,
                family_flip=zero,
                reasons=["fixture policy"],
            ),
            AdmissionDecision(
                axis="template",
                level="F2",
                admitted=True,
                non_contested_flip=zero,
                family_flip=zero,
                reasons=["fixture policy"],
            ),
            AdmissionDecision(
                axis="template",
                level="F3",
                admitted=False,
                non_contested_flip=zero,
                family_flip=zero,
                reasons=["fixture policy"],
            ),
        ],
        escalation=[],
        cost_audit=[
            FamilyCostAudit(
                family_id=family_id,
                selected_effort=selected_effort,
                cost_basis_bundles=list(ADMITTED_BUNDLES),
                n=1,
                cost_reported_n=1,
                measured_cost_per_vote_usd=_estimate(0.01),
                projected_calls=projected_calls,
                projected_cost=_estimate(0.01),
                billed_tokens_per_vote=_estimate(105.0),
                token_inflation_factor=_estimate(1.0),
            )
            for family_id, selected_effort in FAMILY_EFFORTS.items()
        ],
    )


def _write_decisions(path: Path, decisions: AnalysisDecisions) -> Path:
    path.write_bytes(canonical_json_bytes(decisions) + b"\n")
    return path


def _loaded_full_config(
    config: FullRunConfig,
    decisions_path: Path | None = None,
) -> LoadedRunConfig:
    resolved_decisions = decisions_path or config.decisions
    resolved_config = config.model_copy(update={"decisions": resolved_decisions})
    return LoadedRunConfig(
        path=resolved_decisions.with_name("run.yaml"),
        config=resolved_config,
        decisions_path=resolved_decisions,
    )


def _replace_decisions(
    decisions: AnalysisDecisions,
    **replacements: object,
) -> AnalysisDecisions:
    payload: dict[str, object] = decisions.model_dump(mode="python")
    payload.update(replacements)
    return AnalysisDecisions.model_validate(payload)


def _eligible_cards(cards_dir: Path) -> dict[str, EvaluationCard]:
    few_shot_ids = {relation_id for relation_id, _ in FEW_SHOT}
    return {
        card.relation_id: card
        for line in (cards_dir / "cards.jsonl").read_text(encoding="utf-8").splitlines()
        if (card := EvaluationCard.model_validate_json(line)).relation_id not in few_shot_ids
    }


@pytest.fixture(scope="module")
def completed_full_grid(tmp_path_factory: pytest.TempPathFactory) -> FullGridFixture:
    root = tmp_path_factory.mktemp("completed-full-grid")
    cards_dir = _write_concat(root / "cards", include_severe=True)
    decisions_path = root / "decisions.json"
    config = _full_grid_config(decisions_path)
    decisions = _analysis_decisions(cards_dir, config)
    _write_decisions(decisions_path, decisions)
    transport = ScriptedTransport()
    paths = run_full_grid(
        cards_dir=cards_dir,
        out_dir=root / "out",
        loaded_config=_loaded_full_config(config),
        transport=transport,
    )
    return FullGridFixture(
        cards_dir=cards_dir,
        decisions_path=decisions_path,
        decisions=decisions,
        config=config,
        paths=paths,
        transport=transport,
    )


def test_full_grid_executes_only_the_complete_authorized_product(
    completed_full_grid: FullGridFixture,
) -> None:
    fixture = completed_full_grid
    votes = _read_votes(fixture.paths.votes_jsonl)
    attempts = _read_attempts(fixture.paths.attempts_jsonl)
    eligible = _eligible_cards(fixture.cards_dir)
    expected_cells = {
        (family_id, bundle_id, relation_id, FAMILY_EFFORTS[family_id])
        for family_id in FAMILY_EFFORTS
        for bundle_id in ADMITTED_BUNDLES
        for relation_id in eligible
    }

    assert {
        (vote.family_id, vote.bundle_id, vote.relation_id, vote.effort) for vote in votes
    } == expected_cells
    assert len(votes) == len(expected_cells)
    assert len(attempts) == len(expected_cells)
    assert len(fixture.transport.calls) == len(expected_cells)
    assert {vote.family_id for vote in votes} == set(FAMILY_EFFORTS)
    assert FAMILY_PRUNED not in {vote.family_id for vote in votes}
    assert {vote.bundle_id for vote in votes} == set(ADMITTED_BUNDLES)
    assert {vote.repeat_index for vote in votes} == {0}
    assert eligible[SEVERE_RELATION].severely_truncated is True
    assert SEVERE_RELATION in {vote.relation_id for vote in votes}
    assert not ({relation_id for relation_id, _ in FEW_SHOT} & {vote.relation_id for vote in votes})

    judges = {judge.family_id: judge for judge in fixture.config.judges}
    for vote in votes:
        judge = judges[vote.family_id]
        assert vote.provider == judge.provider_name
        assert vote.model_returned == judge.model
        assert vote.effort == FAMILY_EFFORTS[vote.family_id]
        assert isinstance(vote.latency, timedelta)
    for attempt in attempts:
        judge = judges[attempt.family_id]
        assert attempt.provider_slug == judge.provider_slug
        assert attempt.model_requested == judge.model
        assert attempt.attempt_id == sha256_bytes(
            canonical_json_bytes(
                {
                    "request_hash": attempt.request_hash,
                    "stage_attempt": attempt.stage_attempt,
                }
            )
        )
        assert isinstance(attempt.latency, timedelta)
    assert all(call.timeout == fixture.config.request_timeout for call in fixture.transport.calls)

    manifest = FullGridManifest.model_validate_json(fixture.paths.manifest_json.read_bytes())
    assert manifest.expectation.families == list(FAMILY_EFFORTS)
    assert manifest.expectation.bundles == list(ADMITTED_BUNDLES)
    assert manifest.expectation.relation_ids == sorted(eligible)
    assert manifest.expectation.family_efforts == FAMILY_EFFORTS


def test_full_grid_rejects_prompt_pack_hash_mismatch(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    decisions = _replace_decisions(fixture.decisions, prompt_pack_hash="0" * 64)
    decisions_path = _write_decisions(tmp_path / "decisions.json", decisions)
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="prompt_pack_hash does not match"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(fixture.config, decisions_path),
            transport=transport,
        )

    assert transport.calls == []


def test_full_grid_rejects_rubric_mismatch(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    decisions = _replace_decisions(fixture.decisions, rubric_version="rubric-v2")
    decisions_path = _write_decisions(tmp_path / "decisions.json", decisions)
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="rubric do not match"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(fixture.config, decisions_path),
            transport=transport,
        )

    assert transport.calls == []


def test_full_grid_rejects_config_and_decisions_family_mismatch(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    decisions = _replace_decisions(
        fixture.decisions,
        qualification=fixture.decisions.qualification[:-1],
    )
    decisions_path = _write_decisions(tmp_path / "decisions.json", decisions)
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="contain different families"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(fixture.config, decisions_path),
            transport=transport,
        )

    assert transport.calls == []


def test_full_grid_rejects_judge_request_drift(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    judges = list(fixture.config.judges)
    judges[0] = judges[0].model_copy(update={"provider_slug": "different-provider"})
    changed_config = fixture.config.model_copy(update={"judges": judges})
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="request settings differ from the pilot"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(changed_config),
            transport=transport,
        )

    assert transport.calls == []


def test_full_grid_rejects_a_different_verified_card_corpus(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    different_cards = _write_concat(tmp_path / "cards", include_severe=False)
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="differs from the corpus sampled by the pilot"):
        run_full_grid(
            cards_dir=different_cards,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(fixture.config),
            transport=transport,
        )

    assert transport.calls == []


def test_full_grid_rejects_a_stale_projected_call_count(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    cost_audit = list(fixture.decisions.cost_audit)
    first = cost_audit[0]
    cost_audit[0] = first.model_copy(update={"projected_calls": first.projected_calls + 1})
    decisions = _replace_decisions(fixture.decisions, cost_audit=cost_audit)
    decisions_path = _write_decisions(tmp_path / "decisions.json", decisions)
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="projected call count mismatch"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=tmp_path / "out",
            loaded_config=_loaded_full_config(fixture.config, decisions_path),
            transport=transport,
        )

    assert transport.calls == []


def test_load_full_run_config_resolves_decisions_relative_to_the_config(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    config_dir = tmp_path / "config"
    artifact_dir = tmp_path / "artifacts"
    config_dir.mkdir()
    artifact_dir.mkdir()
    decisions_path = _write_decisions(artifact_dir / "decisions.json", fixture.decisions)
    payload = fixture.config.model_dump(mode="json")
    payload["decisions"] = "../artifacts/decisions.json"
    config_path = config_dir / "full.yaml"
    config_path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")

    loaded = load_run_config(config_path)

    assert loaded.decisions_path == decisions_path.resolve()
    assert isinstance(loaded.config, FullRunConfig)
    assert loaded.config.decisions == Path("../artifacts/decisions.json")


def test_interrupted_full_grid_resumes_with_deterministic_request_and_attempt_ids(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = completed_full_grid
    config = fixture.config.model_copy(update={"transient_retries": _transient_retries(2)})
    output = tmp_path / "out"
    interrupt_backoff = True

    def interrupt_once(
        _control: eval_control.ExecutionControl,
        _delay: timedelta,
    ) -> None:
        nonlocal interrupt_backoff
        if interrupt_backoff:
            interrupt_backoff = False
            raise InterruptedError("process stopped during full-grid retry backoff")

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", interrupt_once)
    interrupted = ScriptedTransport(
        [
            _result(completion_id="first"),
            _result(
                completion_id="second",
                model=_family_model(FAMILY_HIGH),
                route_model=_family_model(FAMILY_HIGH),
                route_provider=_family_provider_name(FAMILY_HIGH),
                requested_model=_family_model(FAMILY_HIGH),
            ),
            ConnectionError("boom"),
        ]
    )
    with pytest.raises(InterruptedError, match="process stopped during full-grid retry backoff"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=output,
            loaded_config=_loaded_full_config(config),
            transport=interrupted,
        )

    partial_votes = _read_votes(output / "votes.jsonl")
    partial_attempts = _read_attempts(output / "attempts.jsonl")
    assert len(partial_votes) == 2
    assert len(partial_attempts) == 3
    failed = partial_attempts[-1]
    assert failed.failure is not None

    resumed = ScriptedTransport()
    paths = run_full_grid(
        cards_dir=fixture.cards_dir,
        out_dir=output,
        loaded_config=_loaded_full_config(config),
        transport=resumed,
    )

    votes = _read_votes(paths.votes_jsonl)
    attempts = _read_attempts(paths.attempts_jsonl)
    expected_votes = len(_read_votes(fixture.paths.votes_jsonl))
    assert len(votes) == expected_votes
    assert len(resumed.calls) == expected_votes - len(partial_votes)
    assert len(attempts) == expected_votes + 1
    retried = next(
        attempt
        for attempt in attempts
        if attempt.vote_id == failed.vote_id and attempt.failure is None
    )
    assert retried.stage_attempt == 1
    assert retried.request_hash == failed.request_hash
    for attempt in (failed, retried):
        assert attempt.attempt_id == sha256_bytes(
            canonical_json_bytes(
                {
                    "request_hash": attempt.request_hash,
                    "stage_attempt": attempt.stage_attempt,
                }
            )
        )
    assert len({attempt.attempt_id for attempt in attempts}) == len(attempts)
    assert paths.manifest_json.is_file()


@pytest.mark.parametrize("artifact", ["votes.jsonl", "attempts.jsonl", "manifest.json"])
def test_completed_full_grid_rejects_artifact_tampering(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
    artifact: str,
) -> None:
    fixture = completed_full_grid
    output = tmp_path / "out"
    copytree(fixture.paths.manifest_json.parent, output)
    artifact_path = output / artifact
    if artifact == "manifest.json":
        manifest = FullGridManifest.model_validate_json(artifact_path.read_bytes())
        executor_policy = manifest.executor_policy | {"tampered": True}
        tampered = FullGridManifest.model_validate(
            {
                **manifest.model_dump(mode="python"),
                "executor_policy": executor_policy,
            }
        )
        artifact_path.write_bytes(canonical_json_bytes(tampered) + b"\n")
    else:
        with artifact_path.open("ab") as output_file:
            output_file.write(b"\n")
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="completed full-grid manifest does not match"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            out_dir=output,
            loaded_config=_loaded_full_config(fixture.config),
            transport=transport,
        )

    assert transport.calls == []


def test_complete_validated_full_grid_requires_no_api_key(
    completed_full_grid: FullGridFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = completed_full_grid
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    paths = run_full_grid(
        cards_dir=fixture.cards_dir,
        out_dir=fixture.paths.manifest_json.parent,
        loaded_config=_loaded_full_config(fixture.config),
    )

    assert paths == fixture.paths


def test_full_grid_uses_pilot_openrouter_privacy_and_provider_pins(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = completed_full_grid
    judges_by_slug = {judge.provider_slug: judge for judge in fixture.config.judges}

    class FakeChat:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def send(self, **kwargs: object) -> ChatResult:
            self.calls.append(kwargs)
            provider = kwargs["provider"]
            assert isinstance(provider, ProviderPreferences)
            only = provider.only
            assert isinstance(only, list)
            assert len(only) == 1
            judge = judges_by_slug[only[0]]
            return _result(
                completion_id=f"completion-{len(self.calls)}",
                model=judge.model,
                route_model=judge.model,
                route_provider=judge.provider_name,
                requested_model=judge.model,
            )

    class FakeOpenRouter:
        instances: ClassVar[list[Self]] = []

        def __init__(self, api_key: str, retry_config: RetryConfig) -> None:
            self.api_key = api_key
            self.retry_config = retry_config
            self.chat = FakeChat()
            self.closed = False
            self.instances.append(self)

        def __exit__(
            self,
            exception_type: object,
            exception: object,
            traceback: object,
        ) -> None:
            self.closed = True

    monkeypatch.setattr(eval_transport, "OpenRouter", FakeOpenRouter)
    monkeypatch.setenv("OPENROUTER_API_KEY", "secret")
    paths = run_full_grid(
        cards_dir=fixture.cards_dir,
        out_dir=tmp_path / "out",
        loaded_config=_loaded_full_config(fixture.config),
    )

    client = FakeOpenRouter.instances[0]
    assert client.api_key == "secret"
    assert client.closed is True
    assert len(client.chat.calls) == len(_read_votes(paths.votes_jsonl))
    assert client.retry_config.strategy == "none"
    assert client.retry_config.retry_connection_errors is False
    for kwargs in client.chat.calls:
        provider = kwargs["provider"]
        assert isinstance(provider, ProviderPreferences)
        only = provider.only
        assert isinstance(only, list)
        assert len(only) == 1
        judge = judges_by_slug[only[0]]
        reasoning = kwargs["reasoning"]
        assert isinstance(reasoning, ChatRequestReasoning)
        assert reasoning.effort == FAMILY_EFFORTS[judge.family_id]
        assert provider.zdr is True
        assert provider.data_collection == "deny"
        assert provider.allow_fallbacks is False
        assert provider.require_parameters is True
        assert kwargs["model"] == judge.model
        assert kwargs["timeout_ms"] == 5_000
        assert kwargs["http_headers"] == {"X-OpenRouter-Cache": "false"}
        assert kwargs["retries"] is client.retry_config
        assert kwargs["stream"] is False
        assert kwargs["x_open_router_metadata"] == "enabled"
        assert kwargs["server_url"] == "https://openrouter.ai/api/v1"
        assert "response_format" not in kwargs
        match judge.output_token_limit:
            case MaxTokensLimit(tokens=tokens):
                assert kwargs["max_tokens"] == tokens
                assert "max_completion_tokens" not in kwargs
            case MaxCompletionTokensLimit(tokens=tokens):
                assert kwargs["max_completion_tokens"] == tokens
                assert "max_tokens" not in kwargs


@pytest.mark.parametrize(
    (
        "output_token_limit",
        "openrouter_region",
        "expected_server_url",
        "expected_parameter",
        "unexpected_parameter",
    ),
    [
        pytest.param(
            MaxTokensLimit(tokens=1024),
            "eu",
            "https://eu.openrouter.ai/api/v1",
            "max_tokens",
            "max_completion_tokens",
            id="max-tokens",
        ),
        pytest.param(
            MaxCompletionTokensLimit(tokens=1024),
            "global",
            "https://openrouter.ai/api/v1",
            "max_completion_tokens",
            "max_tokens",
            id="max-completion-tokens",
        ),
    ],
)
def test_openrouter_transport_enforces_privacy_routing_and_disables_retries(
    monkeypatch: pytest.MonkeyPatch,
    output_token_limit: MaxTokensLimit | MaxCompletionTokensLimit,
    openrouter_region: OpenRouterRegion,
    expected_server_url: str,
    expected_parameter: str,
    unexpected_parameter: str,
) -> None:
    class FakeChat:
        def __init__(self) -> None:
            self.kwargs: dict[str, object] | None = None

        def send(self, **kwargs: object) -> ChatResult:
            self.kwargs = kwargs
            return _result()

    class FakeOpenRouter:
        instances: ClassVar[list[Self]] = []

        def __init__(self, api_key: str, retry_config: RetryConfig) -> None:
            self.api_key = api_key
            self.retry_config = retry_config
            self.chat = FakeChat()
            self.closed = False
            self.instances.append(self)

        def __exit__(
            self,
            exception_type: object,
            exception: object,
            traceback: object,
        ) -> None:
            self.closed = True

    monkeypatch.setattr(eval_transport, "OpenRouter", FakeOpenRouter)
    judge = (
        _config()
        .judges[0]
        .model_copy(
            update={
                "output_token_limit": output_token_limit,
                "openrouter_region": openrouter_region,
                "seed": None,
                "temperature": None,
            }
        )
    )
    transport = OpenRouterTransport("secret")
    returned = transport.complete(
        messages=[],
        judge=judge,
        effort="minimal",
        session_id="session",
        timeout=timedelta(seconds=5),
    )

    client = FakeOpenRouter.instances[0]
    assert returned == _result()
    assert client.api_key == "secret"
    assert client.retry_config.strategy == "none"
    assert client.retry_config.retry_connection_errors is False
    assert client.retry_config.backoff.max_elapsed_time == 0
    assert client.chat.kwargs is not None
    provider = client.chat.kwargs["provider"]
    assert isinstance(provider, ProviderPreferences)
    assert provider.zdr is True
    assert provider.data_collection == "deny"
    assert provider.only == [PROVIDER_SLUG]
    assert provider.allow_fallbacks is False
    assert provider.require_parameters is True
    reasoning = client.chat.kwargs["reasoning"]
    assert isinstance(reasoning, ChatRequestReasoning)
    assert reasoning.effort == "minimal"
    assert client.chat.kwargs["timeout_ms"] == 5_000
    assert client.chat.kwargs["http_headers"] == {"X-OpenRouter-Cache": "false"}
    assert client.chat.kwargs["retries"] is client.retry_config
    assert client.chat.kwargs["stream"] is False
    assert client.chat.kwargs["x_open_router_metadata"] == "enabled"
    assert client.chat.kwargs["model"] == MODEL
    assert client.chat.kwargs["server_url"] == expected_server_url
    assert "response_format" not in client.chat.kwargs
    assert client.chat.kwargs[expected_parameter] == 1024
    assert unexpected_parameter not in client.chat.kwargs
    assert client.chat.kwargs["seed"] is UNSET
    assert client.chat.kwargs["temperature"] is UNSET
    # Prompt caching is an Anthropic-vendor directive: absent for other models,
    # attached as OpenRouter's automatic ephemeral breakpoint for anthropic/*.
    assert client.chat.kwargs["cache_control"] is None
    anthropic_judge = judge.model_copy(update={"model": "anthropic/claude-test"})
    transport.complete(
        messages=[],
        judge=anthropic_judge,
        effort="minimal",
        session_id="session",
        timeout=timedelta(seconds=5),
    )
    assert client.chat.kwargs is not None
    directive = client.chat.kwargs["cache_control"]
    assert isinstance(directive, AnthropicCacheControlDirective)
    assert directive.type == "ephemeral"
    transport.close()
    assert client.closed


@pytest.mark.parametrize(
    ("result", "message"),
    [
        pytest.param(_result(model=OTHER_MODEL), "returned model", id="wrong-result-model"),
        pytest.param(_result(include_metadata=False), "omitted required", id="missing-metadata"),
        pytest.param(
            _result(route_count=0),
            "exactly one selected endpoint",
            id="missing-selected-endpoint",
        ),
        pytest.param(_result(route_count=2), "multiple provider attempts", id="multiple-attempts"),
        pytest.param(
            _result(requested_model=OTHER_MODEL),
            "router metadata requested model",
            id="wrong-requested-model",
        ),
        pytest.param(
            _result(route_provider=OTHER_PROVIDER_NAME),
            "selected endpoint used provider",
            id="wrong-provider",
        ),
        pytest.param(_result(route_status=503), "status must be 200", id="provider-failure"),
    ],
)
def test_rejects_missing_or_wrong_model_and_provider_metadata(
    cards_dir: Path,
    tmp_path: Path,
    result: ChatResult,
    message: str,
) -> None:
    output = tmp_path / "out"
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([result]),
    )

    attempts = _read_attempts(paths.attempts_jsonl)
    assert attempts[0].result == result
    assert attempts[0].failure is not None
    assert attempts[0].failure.category == "routing"
    assert message in attempts[0].failure.message
    # The rejected vote recovered on the re-pass instead of ending the session.
    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES


def test_accepts_selected_endpoint_metadata_without_optional_attempts(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    result = _result(
        route_model="anthropic/provider-deployment-name",
        include_route_attempts=False,
    )
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(),
        transport=ScriptedTransport([result]),
    )

    first_vote = _read_votes(paths.votes_jsonl)[0]
    assert first_vote.provider == PROVIDER_NAME
    assert first_vote.model_returned == MODEL


_TOOL_CALL = ChatToolCall(
    id="tool-call",
    type="function",
    function=ChatToolCallFunction(name="lookup", arguments="{}"),
)


@pytest.mark.parametrize(
    ("result", "message"),
    [
        pytest.param(_result(choice_count=0), "exactly one choice", id="missing-choice"),
        pytest.param(_result(choice_count=2), "exactly one choice", id="multiple-choices"),
        pytest.param(_result(choice_index=1), "index must be zero", id="wrong-index"),
        pytest.param(_result(finish_reason="length"), "finish_reason", id="not-stop"),
        pytest.param(_result(content="  "), "non-empty string", id="empty-content"),
        pytest.param(_result(content=None), "non-empty string", id="missing-content"),
        pytest.param(_result(refusal="I refuse"), "contained a refusal", id="refusal"),
        pytest.param(_result(tool_calls=[_TOOL_CALL]), "contained tool calls", id="tools"),
    ],
)
def test_rejects_invalid_completion_envelopes(
    cards_dir: Path,
    tmp_path: Path,
    result: ChatResult,
    message: str,
) -> None:
    output = tmp_path / "out"
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([result]),
    )

    attempts = _read_attempts(paths.attempts_jsonl)
    assert attempts[0].failure is not None
    assert attempts[0].failure.category == "response"
    assert message in attempts[0].failure.message
    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES


def test_rejects_missing_usage_without_abstaining(cards_dir: Path, tmp_path: Path) -> None:
    output = tmp_path / "out"
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([_result(include_usage=False)]),
    )

    attempt = _read_attempts(paths.attempts_jsonl)[0]
    assert attempt.failure is not None
    assert attempt.failure.category == "accounting"
    assert "usage" in attempt.failure.message
    recovered = next(
        vote for vote in _read_votes(paths.votes_jsonl) if vote.vote_id == attempt.vote_id
    )
    assert not recovered.abstained


def test_malformed_initial_is_repaired_conversationally_and_attempts_are_persisted(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    transport = ScriptedTransport([_result(MALFORMED_COMPLETION), _result()])
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(),
        transport=transport,
    )

    votes = _read_votes(paths.votes_jsonl)
    attempts = _read_attempts(paths.attempts_jsonl)
    derived_slice = _read_slice(paths.slice_jsonl)
    assert len(votes) == EXPECTED_VOTES
    assert len(attempts) == EXPECTED_VOTES + 1
    first = votes[0]
    assert first.parse_retries == 1
    assert not first.abstained
    assert first.initial_raw_completion == MALFORMED_COMPLETION
    assert first.verdict == "proximal"
    assert len(first.attempt_results) == 2
    assert all(isinstance(result, ChatResult) for result in first.attempt_results)
    assert first.tokens_in == 200
    assert first.tokens_out == 10
    assert first.tokens_cached == 160
    assert first.tokens_cache_write == 6
    assert first.tokens_reasoning == 4
    assert first.cost_usd == 0.02
    assert isinstance(first.latency, timedelta)
    assert all(call.timeout == timedelta(seconds=5) for call in transport.calls)
    repair_messages = transport.calls[1].messages
    assert isinstance(repair_messages[-2], ChatAssistantMessage)
    assert repair_messages[-2].content == MALFORMED_COMPLETION
    assert repair_messages[-1].role == "user"
    assert repair_messages[-1].content == RETRY_INSTRUCTION
    assert [attempt.request_stage for attempt in attempts[:2]] == ["initial", "repair"]
    assert all(attempt.result is not None for attempt in attempts)
    assert all(attempt.failure is None for attempt in attempts)
    assert len(derived_slice) == len(HOLDOUT) + 1
    assert sum(not row.is_holdout for row in derived_slice) == 1
    assert {row.relation_id for row in derived_slice if not row.is_holdout} == {LIVE_RELATION}
    assert all(row.relation_id.startswith("wikidata:") for row in derived_slice)
    assert all(vote.relation_id.startswith("wikidata:") for vote in votes)
    manifest = load_handoff(paths.manifest_json.parent).manifest
    assert manifest.schema_version == 2
    assert manifest.slice_derivation.selected_non_holdouts == 1
    assert manifest.full_grid_card_count == len(HOLDOUT) + 1
    assert manifest.source_hashes["attempts.jsonl"] == sha256_file(paths.attempts_jsonl)


def test_second_malformed_completion_abstains_without_a_third_call(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    transport = ScriptedTransport([_result(MALFORMED_COMPLETION), _result("still malformed")])
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(),
        transport=transport,
    )

    votes = _read_votes(paths.votes_jsonl)
    assert len(transport.calls) == EXPECTED_VOTES + 1
    assert votes[0].parse_retries == 1
    assert votes[0].abstained
    assert votes[0].verdict == "ABSTAIN"
    assert votes[0].reason == ""
    assert votes[0].raw_completion == "still malformed"
    assert len(votes[0].attempt_results) == 2


def test_wrong_but_valid_verdict_is_not_retried(cards_dir: Path, tmp_path: Path) -> None:
    transport = ScriptedTransport([_result(WRONG_VALID_COMPLETION)])
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(),
        transport=transport,
    )

    votes = _read_votes(paths.votes_jsonl)
    first = votes[0]
    expected_holdouts = dict(HOLDOUT)
    assert first.relation_id in expected_holdouts
    assert first.verdict == "unclear"
    assert first.verdict != expected_holdouts[first.relation_id]
    assert first.parse_retries == 0
    assert not first.abstained
    assert len(first.attempt_results) == 1
    assert len(transport.calls) == EXPECTED_VOTES
    assert len(_read_attempts(paths.attempts_jsonl)) == EXPECTED_VOTES


@pytest.mark.parametrize(
    ("error_type", "message", "expected_category"),
    [
        pytest.param(ConnectionError, "connection lost", "transport", id="transport"),
        pytest.param(RuntimeError, "local failure", "response", id="local"),
    ],
)
def test_transport_or_provider_failure_is_not_converted_to_abstain(
    cards_dir: Path,
    tmp_path: Path,
    error_type: type[Exception],
    message: str,
    expected_category: Literal["transport", "response"],
) -> None:
    output = tmp_path / "out"
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([error_type(message)]),
    )

    attempt = _read_attempts(paths.attempts_jsonl)[0]
    assert attempt.result is None
    assert attempt.failure is not None
    assert attempt.failure.category == expected_category
    assert message in attempt.failure.message
    recovered = next(
        vote for vote in _read_votes(paths.votes_jsonl) if vote.vote_id == attempt.vote_id
    )
    assert not recovered.abstained


def test_provider_error_status_and_body_are_persisted(cards_dir: Path, tmp_path: Path) -> None:
    class ProviderResponseError(RuntimeError):
        status_code = 400
        body = '{"error":{"message":"upstream detail"}}'

    output = tmp_path / "out"
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([ProviderResponseError("Provider returned error")]),
    )

    attempt = _read_attempts(paths.attempts_jsonl)[0]
    assert attempt.failure is not None
    assert attempt.failure.http_status_code == 400
    assert attempt.failure.response_body == ProviderResponseError.body
    assert "Provider returned error" in attempt.failure.message


def test_retryable_429_honors_retry_after_and_persists_both_attempts(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    retry_after = timedelta(seconds=7)
    error = ScriptedProviderError(
        "rate limited",
        status_code=429,
        body=(
            '{"error":{"code":429,"message":"rate limited","metadata":{"retry_after_seconds":2}}}'
        ),
        retry_after=retry_after,
    )
    observed_delays: list[timedelta] = []

    def observe_delay(
        _control: eval_control.ExecutionControl,
        delay: timedelta,
    ) -> None:
        observed_delays.append(delay)

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", observe_delay)
    transport = ScriptedTransport([error, _result(completion_id="after-429")])

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(transient_retries=_transient_retries(2)),
        transport=transport,
    )

    attempts = _read_attempts(paths.attempts_jsonl)
    failed, retried = attempts[:2]
    assert (failed.stage_attempt, retried.stage_attempt) == (0, 1)
    assert failed.request_hash == retried.request_hash
    assert failed.failure is not None
    assert failed.failure.http_status_code == 429
    assert failed.failure.provider_status_code == 429
    assert failed.failure.retry_after == retry_after
    assert retried.failure is None
    assert len(observed_delays) == 1
    assert observed_delays[0] > retry_after - timedelta(seconds=1)
    assert _read_votes(paths.votes_jsonl)[0].parse_retries == 0


def test_http_200_with_embedded_provider_502_retries(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    body = '{"error":{"code":502,"message":"upstream processing error"}}'
    response = httpx.Response(200, text=body)
    error = ResponseValidationError(
        "failed to validate response",
        response,
        ValueError("missing chat completion fields"),
        body=body,
    )
    transport = ScriptedTransport([error, _result(completion_id="after-502")])

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(transient_retries=_transient_retries(2)),
        transport=transport,
    )

    attempts = _read_attempts(paths.attempts_jsonl)
    failed, retried = attempts[:2]
    assert failed.failure is not None
    assert failed.failure.http_status_code == 200
    assert failed.failure.provider_status_code == 502
    assert (failed.stage_attempt, retried.stage_attempt) == (0, 1)
    assert retried.failure is None


def test_retry_policy_rejects_permanent_client_error_codes() -> None:
    with pytest.raises(ValueError, match="permanent client errors"):
        TransientRetryConfig(status_codes=(403,))


def test_permanent_403_defers_without_in_vote_retries_and_repasses(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    error = ScriptedProviderError(
        "model unavailable in this region",
        status_code=403,
        body='{"error":{"code":"permission-denied","message":"unavailable"}}',
    )
    transport = ScriptedTransport([error])
    output = tmp_path / "out"

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(transient_retries=_transient_retries(5)),
        transport=transport,
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    # The 403 vote consumed exactly one call in the first pass (no in-vote
    # retry burned budget against a permanent status) and was re-attempted
    # only after the rest of the plan drained.
    assert len(transport.calls) == EXPECTED_VOTES + 1
    assert transport.calls[-1].messages == transport.calls[0].messages
    failed_vote_id = _read_attempts(paths.attempts_jsonl)[0].vote_id
    recovered = [
        attempt
        for attempt in _read_attempts(paths.attempts_jsonl)
        if attempt.vote_id == failed_vote_id
    ]
    assert [(attempt.stage_attempt, attempt.failure is None) for attempt in recovered] == [
        (0, False),
        (1, True),
    ]


@pytest.mark.parametrize(
    ("http_status", "provider_status"),
    [
        pytest.param(403, 502, id="permanent-http"),
        pytest.param(502, 403, id="permanent-provider"),
    ],
)
def test_permanent_status_vetoes_retryable_status_from_other_layer(
    cards_dir: Path,
    tmp_path: Path,
    http_status: int,
    provider_status: int,
) -> None:
    error = ScriptedProviderError(
        "mixed provider status",
        status_code=http_status,
        body=(f'{{"error":{{"code":{provider_status},"message":"mixed provider status"}}}}'),
    )
    transport = ScriptedTransport([error])

    run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(transient_retries=_transient_retries(2)),
        transport=transport,
    )

    # The permanent status vetoed in-vote retries: one first-pass call, then
    # a single re-pass call at the end of the plan.
    assert len(transport.calls) == EXPECTED_VOTES + 1
    assert transport.calls[-1].messages == transport.calls[0].messages


def test_transient_retry_exhaustion_defers_and_repass_recovers(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    transport = ScriptedTransport(
        [ConnectionError("first interruption"), ConnectionError("second interruption")]
    )
    output = tmp_path / "out"

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(transient_retries=_transient_retries(2)),
        transport=transport,
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    exhausted_vote_id = _read_attempts(paths.attempts_jsonl)[0].vote_id
    recovered = [
        attempt
        for attempt in _read_attempts(paths.attempts_jsonl)
        if attempt.vote_id == exhausted_vote_id
    ]
    assert [(attempt.stage_attempt, attempt.failure is None) for attempt in recovered] == [
        (0, False),
        (1, False),
        (2, True),
    ]


def test_resume_grants_a_fresh_attempt_budget_after_a_billing_failure(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    error = ScriptedProviderError(
        "Insufficient credits",
        status_code=402,
        body='{"error":{"code":402,"message":"Insufficient credits"}}',
    )
    output = tmp_path / "out"
    config = _config(transient_retries=_transient_retries(5))

    with pytest.raises(RuntimeError, match="terminal outcome"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=ScriptedTransport([error]),
        )

    wedged = _read_attempts(output / "attempts.jsonl")
    assert len(wedged) == 1
    assert wedged[0].failure is not None
    assert wedged[0].failure.http_status_code == 402

    resumed = ScriptedTransport()
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=config,
        transport=resumed,
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    recovered = [
        attempt
        for attempt in _read_attempts(paths.attempts_jsonl)
        if attempt.vote_id == wedged[0].vote_id
    ]
    assert [(attempt.stage_attempt, attempt.failure is None) for attempt in recovered] == [
        (0, False),
        (1, True),
    ]
    assert paths.manifest_json.is_file()


def test_rejected_envelope_defers_and_repass_recovers(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    # A model that stochastically emits tool calls instead of a completion
    # (observed in the field) must not poison the vote or end the session.
    rejected = _result(finish_reason="tool_calls")
    output = tmp_path / "out"

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(transient_retries=_transient_retries(5)),
        transport=ScriptedTransport([rejected]),
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    attempts = _read_attempts(paths.attempts_jsonl)
    failed_vote_id = attempts[0].vote_id
    recovered = [attempt for attempt in attempts if attempt.vote_id == failed_vote_id]
    assert [(attempt.stage_attempt, attempt.failure is None) for attempt in recovered] == [
        (0, False),
        (1, True),
    ]
    assert recovered[0].failure is not None
    assert recovered[0].failure.category == "response"
    assert recovered[0].result is not None


class CardFailingTransport(ScriptedTransport):
    """Fail every request for one relation card; default-succeed otherwise."""

    def __init__(self, card_text: str) -> None:
        super().__init__()
        self.card_text = card_text

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        if self.card_text in str(messages[-1].content):
            raise ScriptedProviderError(
                "model unavailable in this region",
                status_code=403,
                body='{"error":{"code":"permission-denied"}}',
            )
        return super().complete(
            messages=messages,
            judge=judge,
            effort=effort,
            session_id=session_id,
            timeout=timeout,
        )


def test_no_progress_pass_reports_all_failed_votes_and_later_session_recovers(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    output = tmp_path / "out"
    config = _config(transient_retries=_transient_retries(2))
    prepared = prepare_pilot_inputs(cards_dir, config)
    live_card_text = prepared.cards[LIVE_RELATION].card_text
    live_vote_count = sum(
        1 for task in PilotVotePlan(config, prepared).tasks() if task.relation_id == LIVE_RELATION
    )

    with pytest.raises(RuntimeError, match="remain failed after re-passes") as raised:
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=CardFailingTransport(live_card_text),
        )

    assert f"{live_vote_count} logical votes remain failed" in str(raised.value)
    # The ordered commit stalls at the first failed vote, but every completed
    # peer is durable in attempts.jsonl and reusable.
    assert len(_read_votes(output / "votes.jsonl")) < EXPECTED_VOTES
    successes = [
        attempt for attempt in _read_attempts(output / "attempts.jsonl") if attempt.failure is None
    ]
    assert len(successes) == EXPECTED_VOTES - live_vote_count

    recovered = ScriptedTransport()
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=config,
        transport=recovered,
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    # Only the failed votes were re-bought in the recovery session.
    assert len(recovered.calls) == live_vote_count
    assert paths.manifest_json.is_file()


def test_request_contract_ignores_operational_scheduling_knobs(cards_dir: Path) -> None:
    base = _config()
    retuned = base.model_copy(
        update={
            "concurrency": ConcurrencyConfig(initial=128, maximum=512),
            "max_cost_usd": 300.0,
        }
    )

    assert request_contract_hash(retuned) == request_contract_hash(base)
    prepared = prepare_pilot_inputs(cards_dir, base)
    assert plan_hash(retuned, PilotVotePlan(retuned, prepared)) == plan_hash(
        base, PilotVotePlan(base, prepared)
    )

    slower = base.model_copy(update={"request_timeout": timedelta(seconds=6)})
    assert request_contract_hash(slower) != request_contract_hash(base)


class ClosableScriptedTransport(ScriptedTransport):
    def close(self) -> None:
        return None


def test_resume_accepts_retuned_concurrency_between_sessions(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = tmp_path / "out"
    config = _config(transient_retries=_transient_retries(2))
    interrupt_backoff = True

    def interrupt_once(
        _control: eval_control.ExecutionControl,
        _delay: timedelta,
    ) -> None:
        nonlocal interrupt_backoff
        if interrupt_backoff:
            interrupt_backoff = False
            raise InterruptedError("process stopped during retry backoff")

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", interrupt_once)
    with pytest.raises(InterruptedError, match="process stopped during retry backoff"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=ScriptedTransport([_result(completion_id="first"), ConnectionError("boom")]),
        )
    assert len(_read_votes(output / "votes.jsonl")) == 1

    retuned = config.model_copy(update={"concurrency": ConcurrencyConfig(initial=2, maximum=2)})
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=retuned,
        transport_factory=ClosableScriptedTransport,
    )

    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES
    assert paths.manifest_json.is_file()


def test_cost_cap_fails_closed_before_retrying_unknown_billed_cost(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    transport = ScriptedTransport([ConnectionError("billing outcome unknown")])
    config = _config(transient_retries=_transient_retries(2)).model_copy(
        update={"max_cost_usd": 1.0}
    )
    output = tmp_path / "out"

    with pytest.raises(RuntimeError, match="incomplete provider costs"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=transport,
        )

    assert len(transport.calls) == 1
    assert len(_read_attempts(output / "attempts.jsonl")) == 1


def test_cost_settlement_blocks_new_authorization_until_unknown_cost_is_visible(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    output = tmp_path / "failed-attempt"
    run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=ScriptedTransport([ConnectionError("unknown cost fixture")]),
    )
    failed_attempt = _read_attempts(output / "attempts.jsonl")[0]

    cost_gate = CostGate.from_attempts(maximum_usd=1.0, attempts=[])
    cost_gate.authorize()
    persistence_started = Event()
    allow_persistence = Event()
    authorization_finished = Event()
    settlement_errors: list[Exception] = []
    authorization_errors: list[CostLimitReachedError] = []

    def persist() -> None:
        persistence_started.set()
        if not allow_persistence.wait(timeout=5):
            raise TimeoutError("test did not release attempt persistence")

    def settle() -> None:
        try:
            cost_gate.settle_attempt(failed_attempt, persist)
        except (RuntimeError, TimeoutError) as error:
            settlement_errors.append(error)

    def authorize() -> None:
        try:
            cost_gate.authorize()
        except CostLimitReachedError as error:
            authorization_errors.append(error)
        finally:
            authorization_finished.set()

    settlement_thread = Thread(target=settle)
    authorization_thread = Thread(target=authorize)
    settlement_thread.start()
    assert persistence_started.wait(timeout=5)
    authorization_thread.start()
    assert not authorization_finished.wait(timeout=0.05)
    allow_persistence.set()
    settlement_thread.join(timeout=5)
    authorization_thread.join(timeout=5)

    assert not settlement_thread.is_alive()
    assert not authorization_thread.is_alive()
    assert settlement_errors == []
    assert len(authorization_errors) == 1
    assert isinstance(authorization_errors[0], CostLimitReachedError)


def test_terminal_stop_interrupts_retry_backoff() -> None:
    control = eval_control.ExecutionControl()
    waiting = Event()
    finished = Event()
    errors: list[eval_control.ExecutionStoppedError] = []

    def wait_for_retry() -> None:
        waiting.set()
        try:
            control.wait_for_retry(timedelta(hours=1))
        except eval_control.ExecutionStoppedError as error:
            errors.append(error)
        finally:
            finished.set()

    waiter = Thread(target=wait_for_retry, daemon=True)
    waiter.start()
    assert waiting.wait(timeout=5)
    control.stop()
    assert finished.wait(timeout=1)
    waiter.join(timeout=1)
    assert len(errors) == 1
    assert "during transient retry backoff" in str(errors[0])


def test_repair_stage_retries_transport_without_incrementing_parse_retries(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    transport = ScriptedTransport(
        [
            _result(MALFORMED_COMPLETION),
            ScriptedProviderError(
                "repair provider unavailable",
                status_code=502,
                body='{"error":{"code":502,"message":"unavailable"}}',
            ),
            _result(completion_id="repaired-after-502"),
        ]
    )

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=_config(transient_retries=_transient_retries(2)),
        transport=transport,
    )

    first_vote = _read_votes(paths.votes_jsonl)[0]
    first_attempts = _read_attempts(paths.attempts_jsonl)[:3]
    assert first_vote.parse_retries == 1
    assert not first_vote.abstained
    assert [
        (attempt.request_stage, attempt.stage_attempt, attempt.failure is None)
        for attempt in first_attempts
    ] == [
        ("initial", 0, True),
        ("repair", 0, False),
        ("repair", 1, True),
    ]


def test_every_physical_attempt_must_match_the_pinned_route(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    output = tmp_path / "out"
    transport = ScriptedTransport(
        [
            _result(MALFORMED_COMPLETION),
            _result(route_provider=OTHER_PROVIDER_NAME),
        ]
    )
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=_config(),
        transport=transport,
    )

    attempts = _read_attempts(paths.attempts_jsonl)
    rejected_vote_id = attempts[1].vote_id
    vote_attempts = [attempt for attempt in attempts if attempt.vote_id == rejected_vote_id]
    # The mispinned repair response was rejected and journaled; the re-pass
    # reused the malformed initial and re-bought only the repair call.
    assert [
        (attempt.request_stage, attempt.stage_attempt, attempt.failure is None)
        for attempt in vote_attempts
    ] == [
        ("initial", 0, True),
        ("repair", 0, False),
        ("repair", 1, True),
    ]
    assert attempts[1].failure is not None
    assert attempts[1].failure.category == "routing"
    assert "selected endpoint used provider" in attempts[1].failure.message
    assert len(_read_votes(paths.votes_jsonl)) == EXPECTED_VOTES


def test_interrupted_run_resumes_from_persisted_physical_attempts(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = tmp_path / "out"
    config = _config(transient_retries=_transient_retries(2))
    interrupt_backoff = True

    def interrupt_once(
        _control: eval_control.ExecutionControl,
        _delay: timedelta,
    ) -> None:
        nonlocal interrupt_backoff
        if interrupt_backoff:
            interrupt_backoff = False
            raise InterruptedError("process stopped during retry backoff")

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", interrupt_once)
    interrupted = ScriptedTransport(
        [_result(completion_id="first"), _result(completion_id="second"), ConnectionError("boom")]
    )
    with pytest.raises(InterruptedError, match="process stopped during retry backoff"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=interrupted,
        )
    partial_votes = _read_votes(output / "votes.jsonl")
    partial_attempts = _read_attempts(output / "attempts.jsonl")
    assert len(partial_votes) == 2
    assert len(partial_attempts) == 3
    failed = partial_attempts[-1]
    assert failed.failure is not None

    resumed = ScriptedTransport()
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=config,
        transport=resumed,
    )

    votes = _read_votes(paths.votes_jsonl)
    attempts = _read_attempts(paths.attempts_jsonl)
    assert len(votes) == EXPECTED_VOTES
    assert len(resumed.calls) == EXPECTED_VOTES - len(partial_votes)
    assert len(attempts) == EXPECTED_VOTES + 1
    retried = [attempt for attempt in attempts if attempt.stage_attempt == 1]
    assert len(retried) == 1
    assert retried[0].vote_id == failed.vote_id
    assert retried[0].request_hash == failed.request_hash
    assert retried[0].failure is None
    assert len({attempt.attempt_id for attempt in attempts}) == len(attempts)
    assert paths.manifest_json.is_file()


def test_resume_uses_pending_malformed_initial_before_repair(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = tmp_path / "out"
    config = _config(transient_retries=_transient_retries(2))
    interrupt_backoff = True

    def interrupt_once(
        _control: eval_control.ExecutionControl,
        _delay: timedelta,
    ) -> None:
        nonlocal interrupt_backoff
        if interrupt_backoff:
            interrupt_backoff = False
            raise InterruptedError("process stopped during repair backoff")

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", interrupt_once)
    interrupted = ScriptedTransport(
        [_result(MALFORMED_COMPLETION), ConnectionError("repair interrupted")]
    )
    with pytest.raises(InterruptedError, match="process stopped during repair backoff"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=interrupted,
        )
    assert _read_votes(output / "votes.jsonl") == []
    pending = _read_attempts(output / "attempts.jsonl")
    assert [(attempt.request_stage, attempt.stage_attempt) for attempt in pending] == [
        ("initial", 0),
        ("repair", 0),
    ]
    assert pending[0].failure is None
    assert pending[1].failure is not None

    resumed = ScriptedTransport()
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=config,
        transport=resumed,
    )

    first_call = resumed.calls[0]
    assert isinstance(first_call.messages[-2], ChatAssistantMessage)
    assert first_call.messages[-2].content == MALFORMED_COMPLETION
    assert first_call.messages[-1].content == RETRY_INSTRUCTION
    votes = _read_votes(paths.votes_jsonl)
    assert votes[0].parse_retries == 1
    assert votes[0].initial_raw_completion == MALFORMED_COMPLETION
    assert not votes[0].abstained
    assert len(resumed.calls) == EXPECTED_VOTES
    first_vote_attempts = [
        attempt
        for attempt in _read_attempts(paths.attempts_jsonl)
        if attempt.vote_id == votes[0].vote_id
    ]
    assert [
        (attempt.request_stage, attempt.stage_attempt, attempt.failure is None)
        for attempt in first_vote_attempts
    ] == [
        ("initial", 0, True),
        ("repair", 0, False),
        ("repair", 1, True),
    ]


@dataclass
class ConcurrencyProbe:
    call_latency: timedelta = timedelta(milliseconds=10)
    reorder_second_and_third: bool = False
    failed_card_text: str | None = None
    lock: Lock = field(default_factory=Lock)
    concurrent_peer_started: Event = field(default_factory=Event)
    third_started: Event = field(default_factory=Event)
    third_completed: Event = field(default_factory=Event)
    next_call: int = 0
    active_calls: int = 0
    maximum_active_calls: int = 0
    worker_count: int = 0
    closed_workers: int = 0
    completion_order: list[int] = field(default_factory=list)

    def create_worker(self) -> None:
        with self.lock:
            self.worker_count += 1

    def close_worker(self) -> None:
        with self.lock:
            self.closed_workers += 1

    def begin_call(self) -> int:
        with self.lock:
            call_index = self.next_call
            self.next_call += 1
            self.active_calls += 1
            self.maximum_active_calls = max(self.maximum_active_calls, self.active_calls)
            if self.active_calls >= 2:
                self.concurrent_peer_started.set()
        if call_index == 2:
            self.third_started.set()
        return call_index

    def before_completion(self, call_index: int, *, should_fail: bool) -> None:
        if should_fail:
            if not self.concurrent_peer_started.wait(timeout=5):
                raise TimeoutError("the concurrent peer request did not start")
            raise ConnectionError("deliberate concurrent failure")
        if (
            call_index == 1
            and self.reorder_second_and_third
            and not self.third_completed.wait(timeout=5)
        ):
            raise TimeoutError("the concurrent peer request did not complete")
        time.sleep(self.call_latency.total_seconds())

    def finish_call(self, call_index: int) -> None:
        with self.lock:
            self.active_calls -= 1
            self.completion_order.append(call_index)
        if call_index == 2:
            self.third_completed.set()


@dataclass
class ConcurrentTransport:
    probe: ConcurrencyProbe

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        del effort, session_id, timeout
        call_index = self.probe.begin_call()
        live_prompt = str(messages[-1].content)
        should_fail = (
            self.probe.failed_card_text is not None and self.probe.failed_card_text in live_prompt
        )
        try:
            self.probe.before_completion(call_index, should_fail=should_fail)
            return _result(
                completion_id=f"concurrent-{call_index}",
                model=judge.model,
                route_model=judge.model,
                route_provider=judge.provider_name,
                requested_model=judge.model,
            )
        finally:
            self.probe.finish_call(call_index)

    def close(self) -> None:
        self.probe.close_worker()


@dataclass(frozen=True)
class ConcurrentTransportFactory:
    probe: ConcurrencyProbe

    def __call__(self) -> ConcurrentTransport:
        self.probe.create_worker()
        return ConcurrentTransport(self.probe)


@dataclass
class RecordingProgress:
    phase_name: str | None = None
    total: int | None = None
    advances: list[int] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def phase(self, name: str, *, total: int | None = None) -> None:
        self.phase_name = name
        self.total = total

    def advance(self, count: int = 1) -> None:
        self.advances.append(count)

    def note(self, message: str) -> None:
        self.notes.append(message)


def test_terminal_failure_drain_does_not_start_peer_repair_calls(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = _config().model_copy(update={"concurrency": ConcurrencyConfig(initial=2, maximum=2)})
    prepared = prepare_pilot_inputs(cards_dir, config)
    first_task, second_task = list(PilotVotePlan(config, prepared).tasks())[:2]
    first_card_text = prepared.cards[first_task.relation_id].card_text
    second_card_text = prepared.cards[second_task.relation_id].card_text
    peer_started = Event()
    stop_called = Event()
    transport_lock = Lock()
    transport_calls = 0

    real_stop = eval_control.ExecutionControl.stop

    def observed_stop(control: eval_control.ExecutionControl) -> None:
        real_stop(control)
        stop_called.set()

    monkeypatch.setattr(eval_control.ExecutionControl, "stop", observed_stop)

    @dataclass
    class DrainTransport:
        def complete(
            self,
            *,
            messages: list[ChatMessages],
            judge: JudgeConfig,
            effort: ReasoningEffort,
            session_id: str,
            timeout: timedelta,
        ) -> ChatResult:
            nonlocal transport_calls
            del effort, session_id, timeout
            with transport_lock:
                transport_calls += 1
            live_prompt = str(messages[-1].content)
            if first_card_text in live_prompt:
                peer_started.set()
                if not stop_called.wait(timeout=5):
                    raise TimeoutError("terminal stop was not published")
                return _result(
                    MALFORMED_COMPLETION,
                    model=judge.model,
                    route_model=judge.model,
                    route_provider=judge.provider_name,
                    requested_model=judge.model,
                )
            if second_card_text in live_prompt:
                if not peer_started.wait(timeout=5):
                    raise TimeoutError("peer request did not start")
                raise ScriptedProviderError(
                    "insufficient credits",
                    status_code=402,
                    body='{"error":{"code":402,"message":"insufficient credits"}}',
                )
            raise AssertionError("drain test dispatched an unexpected logical vote")

        def close(self) -> None:
            return None

    with pytest.raises(RuntimeError, match="terminal outcome"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=tmp_path / "out",
            config=config,
            transport_factory=DrainTransport,
        )

    attempts = _read_attempts(tmp_path / "out" / "attempts.jsonl")
    assert transport_calls == 2
    assert len(attempts) == 2
    assert all(attempt.request_stage == "initial" for attempt in attempts)
    assert _read_votes(tmp_path / "out" / "votes.jsonl") == []


def test_trio_executor_ramps_and_commits_out_of_order_results_in_plan_order(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    config = _config().model_copy(update={"concurrency": ConcurrencyConfig(initial=1, maximum=4)})
    prepared = prepare_pilot_inputs(cards_dir, config)
    expected_vote_ids = [task.vote_id for task in PilotVotePlan(config, prepared).tasks()]
    probe = ConcurrencyProbe(reorder_second_and_third=True)
    progress = RecordingProgress()

    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=tmp_path / "out",
        config=config,
        transport_factory=ConcurrentTransportFactory(probe),
        progress=progress,
    )

    votes = _read_votes(paths.votes_jsonl)
    assert [vote.vote_id for vote in votes] == expected_vote_ids
    assert probe.completion_order.index(2) < probe.completion_order.index(1)
    assert probe.maximum_active_calls == config.concurrency.maximum
    assert probe.worker_count == config.concurrency.maximum
    assert probe.closed_workers == probe.worker_count
    assert progress.phase_name == "Executing relation-evaluation votes"
    assert progress.total == len(expected_vote_ids)
    assert sum(progress.advances) == len(expected_vote_ids)


def test_concurrent_failure_drains_attempts_and_resume_reuses_successful_work(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = _config(transient_retries=_transient_retries(2)).model_copy(
        update={"concurrency": ConcurrencyConfig(initial=1, maximum=2)}
    )
    interrupt_backoff = True

    def interrupt_once(
        _control: eval_control.ExecutionControl,
        _delay: timedelta,
    ) -> None:
        nonlocal interrupt_backoff
        if interrupt_backoff:
            interrupt_backoff = False
            raise InterruptedError("process stopped during concurrent retry backoff")

    monkeypatch.setattr(eval_control.ExecutionControl, "wait_for_retry", interrupt_once)
    output = tmp_path / "out"
    prepared = prepare_pilot_inputs(cards_dir, config)
    failed_task = list(PilotVotePlan(config, prepared).tasks())[1]
    interrupted_probe = ConcurrencyProbe(
        failed_card_text=prepared.cards[failed_task.relation_id].card_text
    )

    with pytest.raises(InterruptedError, match="process stopped during concurrent retry backoff"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport_factory=ConcurrentTransportFactory(interrupted_probe),
        )

    partial_votes = _read_votes(output / "votes.jsonl")
    partial_attempts = _read_attempts(output / "attempts.jsonl")
    assert len(partial_votes) == 1
    assert len(partial_attempts) == 3
    assert interrupted_probe.closed_workers == interrupted_probe.worker_count == 2

    resumed_probe = ConcurrencyProbe()
    paths = run_pilot(
        cards_dir=cards_dir,
        out_dir=output,
        config=config,
        transport_factory=ConcurrentTransportFactory(resumed_probe),
    )

    votes = _read_votes(paths.votes_jsonl)
    attempts = _read_attempts(paths.attempts_jsonl)
    assert len(votes) == EXPECTED_VOTES
    assert resumed_probe.next_call == EXPECTED_VOTES - 2
    assert len(attempts) == EXPECTED_VOTES + 1
    retried = [attempt for attempt in attempts if attempt.stage_attempt == 1]
    assert len(retried) == 1
    assert retried[0].vote_id == partial_attempts[1].vote_id
    assert retried[0].failure is None


def test_ambiguous_vote_append_is_not_retried_while_workers_drain(
    cards_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = _config().model_copy(update={"concurrency": ConcurrencyConfig(initial=2, maximum=2)})
    prepared = prepare_pilot_inputs(cards_dir, config)
    first_task = next(PilotVotePlan(config, prepared).tasks())
    first_card_text = prepared.cards[first_task.relation_id].card_text
    peer_started = Event()
    append_failed = Event()
    lock = Lock()
    closed = 0

    @dataclass
    class AppendFailureTransport:
        def complete(
            self,
            *,
            messages: list[ChatMessages],
            judge: JudgeConfig,
            effort: ReasoningEffort,
            session_id: str,
            timeout: timedelta,
        ) -> ChatResult:
            del effort, session_id, timeout
            is_first_vote = first_card_text in str(messages[-1].content)
            if is_first_vote:
                if not peer_started.wait(timeout=5):
                    raise TimeoutError("the peer request did not start")
            else:
                peer_started.set()
                if not append_failed.wait(timeout=5):
                    raise TimeoutError("the first vote append did not fail")
            return _result(
                completion_id=f"append-failure-{is_first_vote}",
                model=judge.model,
                route_model=judge.model,
                route_provider=judge.provider_name,
                requested_model=judge.model,
            )

        def close(self) -> None:
            nonlocal closed
            with lock:
                closed += 1

    real_append = eval_executor.append_jsonl
    vote_appends = 0

    def ambiguous_append(path: Path, row: VoteRow) -> None:
        nonlocal vote_appends
        real_append(path, row)
        if path.name == "votes.jsonl" and vote_appends == 0:
            vote_appends += 1
            append_failed.set()
            raise OSError("durability acknowledgement was lost")

    monkeypatch.setattr(eval_executor, "append_jsonl", ambiguous_append)

    with pytest.raises(OSError, match="durability acknowledgement was lost"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=tmp_path / "out",
            config=config,
            transport_factory=AppendFailureTransport,
        )

    assert len(_read_votes(tmp_path / "out" / "votes.jsonl")) == 1
    assert len(_read_attempts(tmp_path / "out" / "attempts.jsonl")) == 2
    assert closed == 2


def test_resume_accepts_unattempted_gaps_before_a_higher_pending_attempt(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    config = _config()
    prepared = prepare_pilot_inputs(cards_dir, config)
    plan = PilotVotePlan(config, prepared)
    output = tmp_path / "out"
    transport = ScriptedTransport(
        [
            _result(completion_id="lower-success"),
            ScriptedProviderError(
                "insufficient credits",
                status_code=402,
                body='{"error":{"code":402,"message":"insufficient credits"}}',
            ),
        ]
    )
    with pytest.raises(RuntimeError, match="terminal outcome"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=config,
            transport=transport,
        )
    higher_attempt = _read_attempts(output / "attempts.jsonl")[1]

    pending = validate_resume(
        plan=plan,
        votes=[],
        attempts=[higher_attempt],
        prepared=prepared,
        timeout=config.request_timeout,
    )

    assert len(pending.attempted_votes) == 2
    lower, higher = pending.attempted_votes
    assert lower.plan_index == 0
    assert lower.attempts == ()
    assert higher.plan_index == 1
    assert higher.attempts == (higher_attempt,)


@pytest.mark.parametrize(
    ("declared_votes", "invalidity", "message"),
    [
        pytest.param(1, "excess", "more votes than it declared", id="excess"),
        pytest.param(2, "duplicate", "duplicate vote", id="duplicate"),
    ],
)
def test_unstarted_plan_stream_rejects_invalid_tasks_before_yielding_them(
    cards_dir: Path,
    declared_votes: int,
    invalidity: Literal["excess", "duplicate"],
    message: str,
) -> None:
    config = _config()
    prepared = prepare_pilot_inputs(cards_dir, config)
    tasks = PilotVotePlan(config, prepared).tasks()
    first = next(tasks)
    second = first if invalidity == "duplicate" else next(tasks)
    plan = InvalidVotePlan(declared_votes=declared_votes, stream=(first, second))
    pending = validate_resume(
        plan=plan,
        votes=[],
        attempts=[],
        prepared=prepared,
        timeout=config.request_timeout,
    )
    unstarted = pending.take_unstarted_tasks()

    assert next(unstarted) == first
    with pytest.raises(ValueError, match=message):
        next(unstarted)


def test_concat_artifact_is_verified_before_execution(cards_dir: Path, tmp_path: Path) -> None:
    with (cards_dir / "cards.jsonl").open("a", encoding="utf-8") as output:
        output.write("{}\n")
    transport = ScriptedTransport()

    with pytest.raises(ValueError, match="does not match its concat manifest"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=tmp_path / "out",
            config=_config(),
            transport=transport,
        )

    assert transport.calls == []


def test_load_run_config_rejects_unknown_schema_v3_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "judges.yaml"
    config_path.write_text(
        """schema_version: 3
mode: pilot
rubric_version: rubric-v1
sampling:
  algorithm: stratified-hash-v1
  seed: 42
  non_holdout_count: 1
baseline_effort: minimal
repeat_count: 1
request_timeout: PT5S
concurrency:
  initial: 1
  maximum: 1
unknown: true
judges:
  - provider_slug: test-provider/endpoint
    provider_name: Test Provider
    model: test/model
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown"):
        load_run_config(config_path)
