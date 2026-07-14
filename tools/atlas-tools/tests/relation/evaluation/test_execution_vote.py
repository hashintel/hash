from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

import pytest
import trio

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    BaseRunConfig,
    ConcurrencyConfig,
    GuardConfig,
    InFlightRequest,
    JudgeConfig,
    PhysicalAttempt,
    ProviderResult,
    RequestStage,
    TransientRetryConfig,
    Vote,
    VoteTask,
)
from atlas_tools.relation.evaluation.execution.api import (
    ExecutionFailedError,
    GridGuardPolicy,
    LogicalVoteRunner,
    ParsedVote,
    execute_votes,
)
from atlas_tools.relation.evaluation.storage.api import (
    DurableAttempt,
    JournalPaths,
    RunJournal,
)
from atlas_tools.relation.evaluation.transport.api import (
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionOutcome,
    CompletionRequest,
)


def _task(relation_id: str) -> VoteTask:
    return VoteTask(
        judge=JudgeConfig(
            provider_slug="provider/model",
            provider_name="Provider",
            model="test/model",
            temperature=0.0,
            seed=7,
        ),
        bundle_id="S1xF1",
        relation_id=relation_id,
        card_hash=sha256_bytes(relation_id.encode()),
        effort="minimal",
        repeat_index=0,
        prompt_pack_hash=sha256_bytes(b"prompt pack"),
        rubric_version="rubric-v1",
    )


def _provider_result(
    content: str,
    *,
    cached_tokens: int = 12,
    cost_usd: float = 0.01,
) -> ProviderResult:
    return ProviderResult.model_validate(
        {
            "id": sha256_bytes(content.encode()),
            "model": "test/model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {"content": content, "role": "assistant"},
                }
            ],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 10,
                "total_tokens": 110,
                "cost": cost_usd,
                "prompt_tokens_details": {"cached_tokens": cached_tokens},
            },
        },
        strict=True,
    )


def _response(
    content: str,
    *,
    cached_tokens: int = 12,
    cost_usd: float = 0.01,
) -> CompletionAccepted:
    return CompletionAccepted(
        result=_provider_result(
            content,
            cached_tokens=cached_tokens,
            cost_usd=cost_usd,
        ),
        content=content,
        provider_name="Provider",
    )


class _Prompt:
    def initial(self, task: VoteTask) -> tuple[CompletionMessage, ...]:
        return (
            CompletionMessage(role="system", content="rubric"),
            CompletionMessage(role="user", content="demonstration"),
            CompletionMessage(role="assistant", content="demonstration answer"),
            CompletionMessage(role="user", content=f"classify {task.relation_id}"),
        )

    def repair(
        self,
        messages: tuple[CompletionMessage, ...],
        malformed_completion: str,
    ) -> tuple[CompletionMessage, ...]:
        return (
            *messages,
            CompletionMessage(role="assistant", content=malformed_completion),
            CompletionMessage(role="user", content="Reply with only the JSON object."),
        )

    def parse(self, completion: str) -> ParsedVote:
        if completion != '{"verdict":"proximal"}':
            raise ValueError("malformed verdict")
        return ParsedVote(verdict="proximal", reason="distinct but nearby")


class _RecordingJournal(RunJournal):
    __slots__ = ("events",)

    def __init__(self, *, paths: JournalPaths) -> None:
        super().__init__(paths=paths)
        self.events: list[str] = []

    async def mark_inflight(self, request: InFlightRequest) -> None:
        await super().mark_inflight(request)
        self.events.append(f"mark:{request.request_stage}")

    async def append_attempt(self, attempt: PhysicalAttempt) -> DurableAttempt:
        durable = await super().append_attempt(attempt)
        self.events.append(f"attempt:{attempt.request_stage}")
        return durable

    async def clear_inflight(self, durable: DurableAttempt) -> None:
        await super().clear_inflight(durable)
        self.events.append("clear")

    async def append_vote(self, vote: Vote) -> None:
        await super().append_vote(vote)
        self.events.append("vote")


@dataclass(slots=True)
class _SequenceTransport:
    outcomes: list[CompletionOutcome]
    journal: _RecordingJournal
    stages: list[RequestStage] = field(default_factory=list)

    async def complete(self, request: CompletionRequest) -> CompletionOutcome:
        markers = tuple(self.journal.paths.inflight.glob("*.json"))
        if len(markers) != 1:
            raise AssertionError("transport call must have exactly one durable marker")
        self.stages.append(request.request_stage)
        self.journal.events.append(f"call:{request.request_stage}")
        return self.outcomes.pop(0)

    async def aclose(self) -> None:
        return None


def _config(*, maximum_attempts: int = 1, concurrency: int = 1) -> BaseRunConfig:
    return BaseRunConfig(
        request_timeout=timedelta(seconds=5),
        transient_retries=TransientRetryConfig(
            maximum_attempts=maximum_attempts,
            initial_delay=timedelta(),
            maximum_delay=timedelta(),
        ),
        concurrency=ConcurrencyConfig(initial=concurrency, maximum=concurrency),
    )


def _transient_failure() -> CompletionFailed:
    return CompletionFailed(
        failure=AttemptFailure(
            category="provider",
            exception_type="openrouter.errors.ServerError",
            message="provider temporarily unavailable",
            http_status_code=503,
        ),
    )


def test_vote_runner_journals_visible_retry_and_single_repair_in_protocol_order(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        journal = _RecordingJournal(paths=JournalPaths.under(tmp_path))
        await journal.create()
        transport = _SequenceTransport(
            outcomes=[
                _transient_failure(),
                _response("not json", cost_usd=0.01),
                _response('{"verdict":"proximal"}', cost_usd=0.02),
            ],
            journal=journal,
        )
        config = _config(maximum_attempts=2)
        runner = LogicalVoteRunner(
            config=config,
            prompt=_Prompt(),
            journal=journal,
            transport=transport,
        )

        completed = await execute_votes(
            (_task("test:repaired"),),
            runner=runner,
            config=config,
            journal=journal,
        )

        attempts = await journal.attempts()
        votes = await journal.votes()
        assert transport.stages == ["initial", "initial", "repair"]
        assert journal.events == [
            "mark:initial",
            "call:initial",
            "attempt:initial",
            "clear",
            "mark:initial",
            "call:initial",
            "attempt:initial",
            "clear",
            "mark:repair",
            "call:repair",
            "attempt:repair",
            "clear",
            "vote",
        ]
        assert tuple(attempt.stage_attempt for attempt in attempts) == (0, 1, 0)
        assert attempts[0].failure is not None
        assert attempts[0].result is None
        assert completed == votes
        assert votes[0].verdict == "proximal"
        assert votes[0].parse_retries == 1
        assert votes[0].initial_raw_completion == "not json"
        assert votes[0].known_cost_usd == pytest.approx(0.03)
        assert votes[0].cost_complete is False
        assert not tuple(journal.paths.inflight.glob("*.json"))

    trio.run(scenario)


def _parse_guard_response(content: str) -> object:
    return _Prompt().parse(content)


def test_billed_grid_guard_result_is_durable_before_peer_work_stops(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        journal = _RecordingJournal(paths=JournalPaths.under(tmp_path))
        await journal.create()
        inner = _SequenceTransport(
            outcomes=[
                _response(
                    '{"verdict":"proximal"}',
                    cached_tokens=0,
                    cost_usd=0.04,
                )
            ],
            journal=journal,
        )
        config = _config(concurrency=2)
        guard = GridGuardPolicy(
            config=GuardConfig(cache_check_vote=1, cost_window=10, cost_multiplier=1.5),
            retry_policy=config.transient_retries,
            pilot_cost_per_vote_usd={"test/model": 0.01},
            parse_verdict=_parse_guard_response,
        )
        runner = LogicalVoteRunner(
            config=config,
            prompt=_Prompt(),
            journal=journal,
            transport=inner,
            guard=guard,
        )

        with pytest.raises(ExecutionFailedError, match="cache assertion failed"):
            await execute_votes(
                (_task("test:first"), _task("test:peer")),
                runner=runner,
                config=config,
                journal=journal,
            )

        attempts = await journal.attempts()
        assert len(attempts) == 1
        attempt = attempts[0]
        assert attempt.failure is not None
        assert attempt.failure.category == "accounting"
        assert attempt.failure.scope == "session"
        assert attempt.result is not None
        assert attempt.result.usage is not None
        assert attempt.result.usage.cost_usd == pytest.approx(0.04)
        assert inner.stages == ["initial"]
        assert await journal.votes() == ()
        assert not tuple(journal.paths.inflight.glob("*.json"))

    trio.run(scenario)
