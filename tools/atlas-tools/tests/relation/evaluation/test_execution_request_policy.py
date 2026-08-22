from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    AcceptedAttempt,
    AttemptRoute,
    AttemptTiming,
    BaseRunConfig,
    CardHash,
    CompletionRequestPolicyId,
    FailedAttempt,
    JudgeConfig,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    PromptPackHash,
    ProviderFailure,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    RequestHash,
    VoteTask,
    attempt_id,
    session_id,
)
from atlas_tools.relation.evaluation.execution.api import (
    ParsedVote,
    build_historical_request_evidence,
    build_resume_index,
    observed_request_policy_ids,
)
from atlas_tools.relation.evaluation.storage.api import build_historical_request_subset
from atlas_tools.relation.evaluation.transport.api import (
    CompletionMessage,
    CompletionRequest,
    request_hash,
)


class _Prompt:
    def initial(self, task: VoteTask) -> tuple[CompletionMessage, ...]:
        return (
            CompletionMessage(role="system", content="rubric"),
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
            CompletionMessage(role="user", content="Reply with valid JSON."),
        )

    def parse(self, completion: str) -> ParsedVote:
        if completion != '{"verdict":"proximal"}':
            raise ValueError("malformed verdict")
        return ParsedVote(verdict="proximal", reason="nearby")


@dataclass(frozen=True, slots=True)
class _Plan:
    task: VoteTask

    @property
    def expected_votes(self) -> int:
        return 1

    def tasks(self) -> Iterator[VoteTask]:
        yield self.task


def _task() -> VoteTask:
    return VoteTask(
        judge=JudgeConfig(
            provider_slug=ProviderSlug("provider/model"),
            provider_name=ProviderName("Provider"),
            model=ModelId("test/model"),
            temperature=0.0,
            seed=7,
        ),
        bundle_id="S1xF1",
        relation_id="test:relation",
        card_hash=CardHash(sha256_bytes(b"card")),
        effort="minimal",
        repeat_index=0,
        prompt_pack_hash=PromptPackHash(sha256_bytes(b"prompt pack")),
        rubric_version="rubric-v1",
    )


def _config() -> BaseRunConfig:
    return BaseRunConfig(request_timeout=timedelta(seconds=5))


def _request(task: VoteTask, config: BaseRunConfig) -> CompletionRequest:
    return CompletionRequest(
        messages=_Prompt().initial(task),
        judge=task.judge,
        effort=task.effort,
        session_id=session_id(task),
        timeout=config.request_timeout,
        request_stage="initial",
    )


def _result() -> ProviderResult:
    return ProviderResult.model_validate(
        {
            "id": "completion",
            "model": "test/model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {
                        "content": '{"verdict":"proximal"}',
                        "role": "assistant",
                    },
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 2,
                "total_tokens": 12,
                "cost": 0.01,
            },
            "openrouter_metadata": {
                "attempt": 1,
                "endpoints": {
                    "available": [
                        {
                            "model": "test/model",
                            "provider": "Provider",
                            "selected": True,
                        }
                    ],
                    "total": 1,
                },
                "requested": "test/model",
                "strategy": "direct",
                "attempts": [{"model": "test/model", "provider": "Provider", "status": 200}],
            },
        },
        strict=True,
    )


def _attempt(
    task: VoteTask,
    request_hash_value: RequestHash,
    *,
    stage_attempt: int,
    accepted: bool,
) -> PhysicalAttempt:
    now = datetime(2026, 7, 15, tzinfo=UTC) + timedelta(seconds=stage_attempt)
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=attempt_id(
                request_hash=request_hash_value,
                stage_attempt=stage_attempt,
            ),
            vote_id=task.vote_id,
            request_hash=request_hash_value,
            stage="initial",
            stage_attempt=stage_attempt,
        ),
        route=AttemptRoute(
            family_id=task.judge.family_id,
            provider_slug=task.judge.provider_slug,
            model_requested=task.judge.model,
        ),
        outcome=(
            AcceptedAttempt(result=_result())
            if accepted
            else FailedAttempt(
                failure=ProviderFailure(
                    exception_type="ProviderUnavailable",
                    message="temporary provider failure",
                    http_status_code=503,
                )
            )
        ),
        timing=AttemptTiming(
            request_at=now,
            response_at=now + timedelta(seconds=1),
            latency=timedelta(seconds=1),
        ),
    )


def _hash(
    request: CompletionRequest,
    task: VoteTask,
    policy_id: CompletionRequestPolicyId,
) -> RequestHash:
    return request_hash(
        request,
        vote_id=task.vote_id,
        stage="initial",
        policy_id=policy_id,
    )


def test_historical_policy_is_limited_to_the_committed_attempt_prefix() -> None:
    task = _task()
    config = _config()
    request = _request(task, config)
    legacy = _attempt(
        task,
        _hash(request, task, LEGACY_COMPLETION_REQUEST_POLICY_ID),
        stage_attempt=0,
        accepted=False,
    )
    active = _attempt(
        task,
        _hash(request, task, ACTIVE_COMPLETION_REQUEST_POLICY_ID),
        stage_attempt=1,
        accepted=True,
    )
    evidence = build_historical_request_evidence(
        (legacy,),
        request_policy_ids=(LEGACY_COMPLETION_REQUEST_POLICY_ID,),
    )

    resume = build_resume_index(
        _Plan(task),
        votes=(),
        attempts=(legacy, active),
        prompt=_Prompt(),
        config=config,
        historical_request_evidence=evidence,
    )

    assert resume.attempts_by_vote[task.vote_id] == (legacy, active)
    late_legacy = _attempt(
        task,
        legacy.request_hash,
        stage_attempt=1,
        accepted=True,
    )
    with pytest.raises(ValueError, match="initial request hash differs"):
        build_resume_index(
            _Plan(task),
            votes=(),
            attempts=(legacy, late_legacy),
            prompt=_Prompt(),
            config=config,
            historical_request_evidence=evidence,
        )


def test_unpinned_or_content_changed_legacy_hash_is_rejected() -> None:
    task = _task()
    config = _config()
    request = _request(task, config)
    legacy = _attempt(
        task,
        _hash(request, task, LEGACY_COMPLETION_REQUEST_POLICY_ID),
        stage_attempt=0,
        accepted=False,
    )
    with pytest.raises(ValueError, match="initial request hash differs"):
        build_resume_index(
            _Plan(task),
            votes=(),
            attempts=(legacy,),
            prompt=_Prompt(),
            config=config,
        )

    changed_request = replace(
        request,
        messages=(
            request.messages[0],
            CompletionMessage(role="user", content="classify changed:relation"),
        ),
    )
    changed = _attempt(
        task,
        _hash(changed_request, task, LEGACY_COMPLETION_REQUEST_POLICY_ID),
        stage_attempt=0,
        accepted=False,
    )
    changed_evidence = build_historical_request_evidence(
        (changed,),
        request_policy_ids=(LEGACY_COMPLETION_REQUEST_POLICY_ID,),
    )
    with pytest.raises(ValueError, match="initial request hash differs"):
        build_resume_index(
            _Plan(task),
            votes=(),
            attempts=(changed,),
            prompt=_Prompt(),
            config=config,
            historical_request_evidence=changed_evidence,
        )


def test_imported_subset_requires_untampered_source_and_excludes_suffix_ids() -> None:
    task = _task()
    config = _config()
    request = _request(task, config)
    legacy = _attempt(
        task,
        _hash(request, task, LEGACY_COMPLETION_REQUEST_POLICY_ID),
        stage_attempt=0,
        accepted=False,
    )
    late_legacy = _attempt(
        task,
        legacy.request_hash,
        stage_attempt=1,
        accepted=True,
    )
    evidence = build_historical_request_evidence(
        (legacy,),
        request_policy_ids=(LEGACY_COMPLETION_REQUEST_POLICY_ID,),
    )

    subset = build_historical_request_subset(
        (legacy, late_legacy),
        (legacy, late_legacy),
        evidence,
    )

    assert subset is not None
    assert subset.attempt_ids == (legacy.attempt_id,)
    tampered_timing = AttemptTiming(
        request_at=legacy.request_at,
        response_at=legacy.response_at + timedelta(seconds=1),
        latency=legacy.latency + timedelta(seconds=1),
    )
    tampered = legacy.model_copy(update={"timing": tampered_timing})
    with pytest.raises(ValueError, match="differs from its historical evidence prefix"):
        build_historical_request_subset(
            (tampered, late_legacy),
            (tampered,),
            evidence,
        )


def test_policy_inference_reports_mixed_journal_in_registry_order() -> None:
    task = _task()
    config = _config()
    request = _request(task, config)
    attempts = (
        _attempt(
            task,
            _hash(request, task, LEGACY_COMPLETION_REQUEST_POLICY_ID),
            stage_attempt=0,
            accepted=False,
        ),
        _attempt(
            task,
            _hash(request, task, ACTIVE_COMPLETION_REQUEST_POLICY_ID),
            stage_attempt=1,
            accepted=True,
        ),
    )

    assert observed_request_policy_ids(
        task,
        attempts,
        prompt=_Prompt(),
        config=config,
    ) == (
        LEGACY_COMPLETION_REQUEST_POLICY_ID,
        ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    )
