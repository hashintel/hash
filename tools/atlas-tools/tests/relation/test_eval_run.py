"""Schema-v2 relation evaluator execution and resume tests."""

from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

import pytest
from openrouter.components import (
    ChatAssistantMessage,
    ChatChoice,
    ChatMessages,
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
from openrouter.utils.retries import RetryConfig

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.concat import (
    ConcatConfig,
    ConcatDetails,
    ConcatProvenance,
    ConcatSource,
)
from atlas_tools.relation.eval import run as eval_run
from atlas_tools.relation.eval.analysis import load_handoff
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT, RETRY_INSTRUCTION
from atlas_tools.relation.eval.run import (
    JudgeConfig,
    OpenRouterTransport,
    PilotRunConfig,
    SliceSamplingConfig,
    load_run_config,
    run_pilot,
)
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    PhysicalAttemptRow,
    ReasoningEffort,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import qualify_relation_id

MODEL = "test/model"
ENDPOINT = "test-provider/endpoint"
OTHER_MODEL = "other/model"
OTHER_ENDPOINT = "other-provider/endpoint"
LIVE_RELATION = qualify_relation_id("wikidata", "P999999")
VALID_COMPLETION = '{"reason": "P1-P3 hold", "verdict": "proximal"}'
WRONG_VALID_COMPLETION = '{"reason": "deliberately wrong", "verdict": "unclear"}'
MALFORMED_COMPLETION = "not JSON"
EXPECTED_VOTES = len(BUNDLES) * (len(HOLDOUT) + 1)


@dataclass(frozen=True)
class TransportCall:
    messages: list[ChatMessages]
    judge: JudgeConfig
    effort: ReasoningEffort
    session_id: str
    timeout_ms: int


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
        timeout_ms: int,
    ) -> ChatResult:
        call_index = len(self.calls)
        self.calls.append(
            TransportCall(
                messages=messages,
                judge=judge,
                effort=effort,
                session_id=session_id,
                timeout_ms=timeout_ms,
            )
        )
        if call_index < len(self.script):
            response = self.script[call_index]
            if isinstance(response, Exception):
                raise response
            return response
        return _result(completion_id=f"completion-{call_index}")


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
) -> OpenRouterMetadata:
    routes = [
        RouterAttempt(model=route_model, provider=route_provider, status=route_status)
        for _ in range(route_count)
    ]
    return OpenRouterMetadata(
        attempt=1,
        endpoints=EndpointsMetadata(
            available=[EndpointInfo(model=route_model, provider=route_provider, selected=True)],
            total=route_count,
        ),
        is_byok=False,
        region=None,
        requested=MODEL,
        strategy="direct",
        summary="test route",
        attempts=routes,
    )


def _result(
    content: str | None = VALID_COMPLETION,
    *,
    completion_id: str = "completion",
    model: str = MODEL,
    include_metadata: bool = True,
    route_model: str = MODEL,
    route_provider: str = ENDPOINT,
    route_status: int = 200,
    route_count: int = 1,
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
            )
            if include_metadata
            else None
        ),
        usage=_usage() if include_usage else None,
    )


def _config() -> PilotRunConfig:
    return PilotRunConfig(
        sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
        repeat_count=0,
        timeout_ms=5_000,
        judges=[
            JudgeConfig(
                family_id="judge-a-2026-07-13",
                endpoint_slug=ENDPOINT,
                model=MODEL,
                temperature=0.0,
                seed=17,
            )
        ],
    )


def _write_concat(directory: Path) -> Path:
    directory.mkdir()
    cards_path = directory / "cards.jsonl"
    relation_ids = sorted(
        {relation_id for relation_id, _ in FEW_SHOT}
        | {relation_id for relation_id, _ in HOLDOUT}
        | {LIVE_RELATION}
    )
    rows = []
    for relation_id in relation_ids:
        card_text = f"relation card for {relation_id}"
        rows.append(
            {
                "relation_id": relation_id,
                "producer": "wikidata",
                "card_text": card_text,
                "card_hash": sha256_bytes(card_text.encode("utf-8")),
                "token_count": len(card_text.split()),
                "truncations": [],
                "severely_truncated": False,
                "prescreen_stratum": "ordinary",
                "pilot_strata": [],
            }
        )
    cards_path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))
    cards_hash = sha256_file(cards_path)
    ConcatProvenance.make(
        producer="relation.concat",
        input_hashes={},
        content_hashes={"cards.jsonl": cards_hash},
        config=ConcatConfig(source_configs={"wikidata": {}}),
        details=ConcatDetails(
            sources={
                "wikidata": ConcatSource(
                    namespace="wikidata",
                    artifact_producer="test.wikidata-cards",
                    local_id_field="pid",
                    cards_hash=cards_hash,
                    manifest_hash="0" * 64,
                    config={},
                    details={},
                )
            },
            inputs=[],
            row_count=len(rows),
        ),
    ).write(directory / "cards.manifest.json")
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


def test_openrouter_transport_enforces_privacy_routing_and_disables_retries(
    monkeypatch: pytest.MonkeyPatch,
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
    judge = _config().judges[0]
    transport = OpenRouterTransport("secret")
    returned = transport.complete(
        messages=[],
        judge=judge,
        effort="minimal",
        session_id="session",
        timeout_ms=5_000,
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
    assert provider.only == [ENDPOINT]
    assert provider.allow_fallbacks is False
    assert provider.require_parameters is True
    assert client.chat.kwargs["http_headers"] == {"X-OpenRouter-Cache": "false"}
    assert client.chat.kwargs["retries"] is client.retry_config
    assert client.chat.kwargs["stream"] is False
    assert client.chat.kwargs["x_open_router_metadata"] == "enabled"
    assert client.chat.kwargs["model"] == MODEL
    transport.close()
    assert client.closed


@pytest.mark.parametrize(
    ("result", "message"),
    [
        pytest.param(_result(model=OTHER_MODEL), "returned model", id="wrong-result-model"),
        pytest.param(_result(include_metadata=False), "omitted required", id="missing-metadata"),
        pytest.param(_result(route_count=0), "omitted required", id="missing-attempts"),
        pytest.param(_result(route_count=2), "multiple provider attempts", id="multiple-attempts"),
        pytest.param(_result(route_model=OTHER_MODEL), "used model", id="wrong-route-model"),
        pytest.param(
            _result(route_provider=OTHER_ENDPOINT),
            "used endpoint",
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


def test_every_physical_attempt_must_match_the_pinned_route(
    cards_dir: Path,
    tmp_path: Path,
) -> None:
    output = tmp_path / "out"
    transport = ScriptedTransport(
        [
            _result(MALFORMED_COMPLETION),
            _result(route_provider=OTHER_ENDPOINT),
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
repeat_count: 0
timeout_ms: 5000
unknown: true
judges:
  - family_id: judge-a-2026-07-13
    endpoint_slug: test-provider/endpoint
    model: test/model
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown"):
        load_run_config(config_path)
