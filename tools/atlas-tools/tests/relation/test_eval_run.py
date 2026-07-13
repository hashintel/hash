"""Schema-v2 relation evaluator execution and resume tests."""

from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from shutil import copytree
from typing import ClassVar

import pytest
from openrouter.components import (
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
from openrouter.types import UNSET
from openrouter.utils.retries import RetryConfig
from pydantic import JsonValue

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import concat_relations
from atlas_tools.relation.eval import run as eval_run
from atlas_tools.relation.eval.analysis import load_handoff
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    RETRY_INSTRUCTION,
    prompt_pack_hash,
)
from atlas_tools.relation.eval.run import (
    EvaluationCard,
    FullGridPaths,
    JudgeConfig,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    OpenRouterTransport,
    PilotRunConfig,
    SliceSamplingConfig,
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

FAMILY_BASELINE = "judge-baseline-2026-07-13"
FAMILY_HIGH = "judge-high-2026-07-13"
FAMILY_PRUNED = "judge-pruned-2026-07-13"
ADMITTED_BUNDLES: tuple[BundleId, ...] = ("S1xF1", "S1xF2", "S3xF1", "S3xF2")
FAMILY_EFFORTS: dict[str, ReasoningEffort] = {
    FAMILY_BASELINE: "minimal",
    FAMILY_HIGH: "high",
}


@dataclass(frozen=True)
class TransportCall:
    messages: list[ChatMessages]
    judge: JudgeConfig
    effort: ReasoningEffort
    session_id: str
    timeout: timedelta


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


def _config() -> PilotRunConfig:
    return PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=PILOT_REPEAT_COUNT,
        request_timeout=timedelta(seconds=5),
        judges=[
            JudgeConfig(
                family_id="judge-a-2026-07-13",
                provider_slug=PROVIDER_SLUG,
                provider_name=PROVIDER_NAME,
                model=MODEL,
                temperature=0.0,
                seed=17,
            )
        ],
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
    config: PilotRunConfig
    paths: FullGridPaths
    transport: ScriptedTransport


def _family_model(family_id: str) -> str:
    return MODEL if family_id == FAMILY_BASELINE else f"test/{family_id}"


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


def _full_grid_config() -> PilotRunConfig:
    return PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=1,
        request_timeout=timedelta(seconds=5),
        judges=[
            JudgeConfig(
                family_id=family_id,
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


def _analysis_decisions(cards_dir: Path, config: PilotRunConfig) -> AnalysisDecisions:
    cards = {
        card.relation_id: card
        for line in (cards_dir / "cards.jsonl").read_text(encoding="utf-8").splitlines()
        if (card := EvaluationCard.model_validate_json(line))
    }
    zero = _estimate()
    judges = {judge.family_id: judge for judge in config.judges}
    return AnalysisDecisions(
        schema_version=2,
        policy=AnalysisPolicy(),
        input_hashes={},
        prompt_pack_hash=prompt_pack_hash(cards),
        rubric_version="rubric-v1",
        sampling_seeds=[config.sampling.seed],
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
                krippendorff_alpha=zero,
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
                projected_calls=1,
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
    config = _full_grid_config()
    decisions = _analysis_decisions(cards_dir, config)
    decisions_path = _write_decisions(root / "decisions.json", decisions)
    transport = ScriptedTransport()
    paths = run_full_grid(
        cards_dir=cards_dir,
        decisions_path=decisions_path,
        out_dir=root / "out",
        config=config,
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
            decisions_path=decisions_path,
            out_dir=tmp_path / "out",
            config=fixture.config,
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
            decisions_path=decisions_path,
            out_dir=tmp_path / "out",
            config=fixture.config,
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
            decisions_path=decisions_path,
            out_dir=tmp_path / "out",
            config=fixture.config,
            transport=transport,
        )

    assert transport.calls == []


def test_interrupted_full_grid_resumes_with_deterministic_request_and_attempt_ids(
    completed_full_grid: FullGridFixture,
    tmp_path: Path,
) -> None:
    fixture = completed_full_grid
    output = tmp_path / "out"
    interrupted = ScriptedTransport(
        [
            _result(completion_id="first"),
            _result(completion_id="second"),
            ConnectionError("boom"),
        ]
    )
    with pytest.raises(RuntimeError, match="physical request failed"):
        run_full_grid(
            cards_dir=fixture.cards_dir,
            decisions_path=fixture.decisions_path,
            out_dir=output,
            config=fixture.config,
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
        decisions_path=fixture.decisions_path,
        out_dir=output,
        config=fixture.config,
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
            decisions_path=fixture.decisions_path,
            out_dir=output,
            config=fixture.config,
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
        decisions_path=fixture.decisions_path,
        out_dir=fixture.paths.manifest_json.parent,
        config=fixture.config,
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
            )

    class FakeOpenRouter:
        instances: ClassVar[list[FakeOpenRouter]] = []

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

    monkeypatch.setattr(eval_run, "OpenRouter", FakeOpenRouter)
    monkeypatch.setenv("OPENROUTER_API_KEY", "secret")
    paths = run_full_grid(
        cards_dir=fixture.cards_dir,
        decisions_path=fixture.decisions_path,
        out_dir=tmp_path / "out",
        config=fixture.config,
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
    openrouter_region: eval_run.OpenRouterRegion,
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
        instances: ClassVar[list[FakeOpenRouter]] = []

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

    monkeypatch.setattr(eval_run, "OpenRouter", FakeOpenRouter)
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
    transport.close()
    assert client.closed


@pytest.mark.parametrize(
    ("result", "message"),
    [
        pytest.param(_result(model=OTHER_MODEL), "returned model", id="wrong-result-model"),
        pytest.param(_result(include_metadata=False), "omitted required", id="missing-metadata"),
        pytest.param(_result(route_count=0), "omitted required", id="missing-attempts"),
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
    with pytest.raises(RuntimeError, match="provider response rejected") as raised:
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=ScriptedTransport([result]),
        )

    assert raised.value.__cause__ is not None
    assert message in str(raised.value.__cause__)
    assert _read_votes(output / "votes.jsonl") == []
    attempts = _read_attempts(output / "attempts.jsonl")
    assert len(attempts) == 1
    assert attempts[0].result == result
    assert attempts[0].failure is not None
    assert attempts[0].failure.category == "routing"


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
    with pytest.raises(RuntimeError, match="provider response rejected") as raised:
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=ScriptedTransport([result]),
        )

    assert raised.value.__cause__ is not None
    assert message in str(raised.value.__cause__)
    attempts = _read_attempts(output / "attempts.jsonl")
    assert len(attempts) == 1
    assert attempts[0].failure is not None
    assert attempts[0].failure.category == "response"
    assert _read_votes(output / "votes.jsonl") == []


def test_rejects_missing_usage_without_abstaining(cards_dir: Path, tmp_path: Path) -> None:
    output = tmp_path / "out"
    with pytest.raises(RuntimeError, match="provider response rejected") as raised:
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=ScriptedTransport([_result(include_usage=False)]),
        )

    assert raised.value.__cause__ is not None
    assert "usage" in str(raised.value.__cause__)
    attempt = _read_attempts(output / "attempts.jsonl")[0]
    assert attempt.failure is not None
    assert attempt.failure.category == "accounting"
    assert _read_votes(output / "votes.jsonl") == []


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
    ("error_type", "message"),
    [
        pytest.param(ConnectionError, "connection lost", id="transport"),
        pytest.param(RuntimeError, "provider unavailable", id="provider"),
    ],
)
def test_transport_or_provider_failure_is_not_converted_to_abstain(
    cards_dir: Path,
    tmp_path: Path,
    error_type: type[Exception],
    message: str,
) -> None:
    output = tmp_path / "out"
    with pytest.raises(RuntimeError, match="physical request failed"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=ScriptedTransport([error_type(message)]),
        )

    assert _read_votes(output / "votes.jsonl") == []
    attempt = _read_attempts(output / "attempts.jsonl")[0]
    assert attempt.result is None
    assert attempt.failure is not None
    assert attempt.failure.category == "transport"
    assert message in attempt.failure.message


def test_provider_error_status_and_body_are_persisted(cards_dir: Path, tmp_path: Path) -> None:
    class ProviderResponseError(RuntimeError):
        status_code = 400
        body = '{"error":{"message":"upstream detail"}}'

    output = tmp_path / "out"
    with pytest.raises(RuntimeError, match="physical request failed"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=ScriptedTransport([ProviderResponseError("Provider returned error")]),
        )

    attempt = _read_attempts(output / "attempts.jsonl")[0]
    assert attempt.failure is not None
    assert attempt.failure.status_code == 400
    assert attempt.failure.response_body == ProviderResponseError.body


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
    with pytest.raises(RuntimeError, match="provider response rejected"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
            transport=transport,
        )

    attempts = _read_attempts(output / "attempts.jsonl")
    assert [(attempt.request_stage, attempt.failure is None) for attempt in attempts] == [
        ("initial", True),
        ("repair", False),
    ]
    assert attempts[1].failure is not None
    assert attempts[1].failure.category == "routing"
    assert _read_votes(output / "votes.jsonl") == []


def test_interrupted_run_resumes_from_persisted_physical_attempts(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    output = tmp_path / "out"
    interrupted = ScriptedTransport(
        [_result(completion_id="first"), _result(completion_id="second"), ConnectionError("boom")]
    )
    with pytest.raises(RuntimeError, match="physical request failed"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
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
        config=_config(),
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
) -> None:
    output = tmp_path / "out"
    interrupted = ScriptedTransport(
        [_result(MALFORMED_COMPLETION), ConnectionError("repair interrupted")]
    )
    with pytest.raises(RuntimeError, match="physical request failed"):
        run_pilot(
            cards_dir=cards_dir,
            out_dir=output,
            config=_config(),
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
        config=_config(),
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


def test_load_run_config_rejects_unknown_schema_v2_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "judges.yaml"
    config_path.write_text(
        """schema_version: 2
rubric_version: rubric-v1
sampling:
  algorithm: stratified-hash-v1
  seed: 42
  non_holdout_count: 1
baseline_effort: minimal
repeat_count: 1
request_timeout: PT5S
unknown: true
judges:
  - family_id: judge-a-2026-07-13
    provider_slug: test-provider/endpoint
    provider_name: Test Provider
    model: test/model
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown"):
        load_run_config(config_path)
