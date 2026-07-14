"""Adopt retired flat evaluation artifacts into current run contracts.

The migration reads one stopped pilot or grid directory under an exclusive
run lock. Every legacy row is parsed by a strict, local schema before it is
transformed and parsed again by the current domain schema. Provider response
objects are compared as canonical JSON bytes, so linking a vote never depends
on an SDK projection or a lossy subset of the response.

Full adoption prepares current state and input artifacts, installs the
converted journals, and proves them against the current deterministic plan
and request contract before publication. A complete pilot gains its handoff
manifest; a stopped incomplete grid remains manifest-free and resumable.
``--journals-only`` retains the narrower forensic conversion and emits an
explicitly non-resumable ``migration-pending.json`` report.

The migration performs no network operations. Forensic conversion runs in
``O(b)`` time for ``b`` input bytes; full adoption adds ``O(p)`` deterministic
plan validation for ``p`` tasks. Additional memory is proportional to plan and
attempt identities plus accepted provider payloads needed to link votes to
physical evidence.
"""

import argparse
import fcntl
import hashlib
import os
import shutil
import sys
import tempfile
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, BinaryIO, Literal, Protocol, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    NonNegativeInt,
    TypeAdapter,
    ValidationError,
    model_serializer,
    model_validator,
)

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_file
from atlas_tools.relation.evaluation.analysis.api import analyze_grid
from atlas_tools.relation.evaluation.application.grid_plan import (
    derive_grid_plan,
    split_grid_votes,
)
from atlas_tools.relation.evaluation.application.identity import request_contract_hash
from atlas_tools.relation.evaluation.application.manifest import (
    build_grid_manifest,
    build_grid_state,
    build_pilot_manifest,
    build_pilot_state,
)
from atlas_tools.relation.evaluation.application.preparation import (
    PreparedGrid,
    PreparedPilot,
    prepare_evaluation_inputs,
)
from atlas_tools.relation.evaluation.application.prompt import RubricVotePrompt
from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AccountingFailure,
    AttemptFailure,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    BaseRunConfig,
    BundleId,
    CardHash,
    CompletionRequestPolicyId,
    FailedAttempt,
    FiniteFloat,
    FramingId,
    GridRunConfig,
    GridRunState,
    HistoricalRequestEvidence,
    HistoricalRequestSubset,
    InFlightRequest,
    JudgeFamilyId,
    JudgeRequestSpec,
    ModelId,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    PaidRequestIdentity,
    PhysicalAttempt,
    PilotRunConfig,
    PilotRunState,
    PromptPackHash,
    ProviderFailure,
    ProviderResult,
    ProviderSlug,
    ReasoningEffort,
    RejectedAttempt,
    RequestHash,
    RequestStage,
    ResponseFailure,
    RoutingFailure,
    RunConfig,
    ShellId,
    TransportFailure,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VotePlan,
    VoteProvenance,
    VoteRequest,
    VoteTask,
    VoteTiming,
    VoteVerdict,
    attempt_id,
    bundle_id,
)
from atlas_tools.relation.evaluation.execution.api import (
    build_historical_request_evidence,
    build_resume_index,
    executor_policy_payload,
    observed_request_policy_ids,
)
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    PilotPaths,
    ResumeIndex,
    load_config,
    load_json,
    load_jsonl,
    prepare_grid,
    prepare_pilot,
    write_grid_manifest,
    write_pilot_manifest,
)
from atlas_tools.relation.evaluation.transport.api import (
    COMPLETION_REQUEST_POLICY_IDS,
    HISTORICAL_COMPLETION_REQUEST_POLICY_IDS,
    request_policy_payload,
    transport_versions,
)
from atlas_tools.relation_cards.common.cards import RelationId

type MigrationMode = Literal["pilot", "grid"]
type FailureCategory = Literal["transport", "provider", "response", "routing", "accounting"]

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_HTTP_CLIENT_ERROR_START = 400
_HTTP_SERVER_ERROR_START = 500
_RETRYABLE_CLIENT_STATUSES = frozenset({408, 425, 429})
_ADOPTION_REPORT = "adoption-report.json"


class _LegacyModel(BaseModel):
    """Apply the fail-closed policy of the retired flat schema."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class _Digest(Protocol):
    def update(self, data: bytes, /) -> None: ...


class _LegacyProviderResult(_LegacyModel):
    """Preserve one native provider object as canonical JSON bytes."""

    raw_json: bytes = Field(repr=False)

    @model_validator(mode="before")
    @classmethod
    def capture_native_object(cls, value: object) -> object:
        if isinstance(value, cls):
            return value
        payload = _JSON_OBJECT_ADAPTER.validate_python(value, strict=True)
        return {"raw_json": canonical_json_bytes(payload)}

    @model_serializer
    def restore_native_object(self) -> dict[str, JsonValue]:
        return _JSON_OBJECT_ADAPTER.validate_json(self.raw_json, strict=True)

    @property
    def model(self) -> str:
        payload = _JSON_OBJECT_ADAPTER.validate_json(self.raw_json, strict=True)
        value = payload.get("model")
        if not isinstance(value, str) or not value:
            raise ValueError("legacy provider result model must be a non-empty string")
        return value


class _LegacyFailure(_LegacyModel):
    """Parse the retired flat failure union without broadening its fields."""

    category: FailureCategory
    exception_type: NonEmptyStr
    message: NonEmptyStr
    http_status_code: int | None = None
    provider_status_code: int | None = None
    retry_after: Annotated[timedelta, Field(gt=timedelta())] | None = None
    response_body: str | None = None


class _LegacyPhysicalAttempt(_LegacyModel):
    """Parse one retired flat paid-call record."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_stage: RequestStage
    stage_attempt: NonNegativeInt
    request_hash: Sha256Hex
    family_id: NonEmptyStr
    provider_slug: NonEmptyStr
    model_requested: NonEmptyStr
    result: _LegacyProviderResult | None
    failure: _LegacyFailure | None
    request_at: AwareDatetime = Field(validation_alias="ts_request")
    response_at: AwareDatetime = Field(validation_alias="ts_response")
    latency: Annotated[timedelta, Field(ge=timedelta())]

    @model_validator(mode="after")
    def check_outcome(self) -> Self:
        if self.result is None and self.failure is None:
            raise ValueError("a legacy attempt must contain a result or failure")
        if self.response_at < self.request_at:
            raise ValueError("legacy response time must not precede request time")
        return self


class _LegacyInFlightRequest(_LegacyModel):
    """Parse one retired flat unresolved-billing marker."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_hash: Sha256Hex
    request_stage: RequestStage
    stage_attempt: NonNegativeInt
    created_at: AwareDatetime


class _LegacyVote(_LegacyModel):
    """Parse one retired flat logical vote record."""

    vote_id: Sha256Hex
    relation_id: RelationId
    card_hash: Sha256Hex
    family_id: NonEmptyStr
    provider: NonEmptyStr
    model_returned: NonEmptyStr
    shell_id: ShellId
    framing_id: FramingId
    bundle_id: BundleId
    rubric_version: NonEmptyStr
    prompt_pack_hash: Sha256Hex
    verdict: VoteVerdict
    reason: str
    raw_completion: str
    parse_retries: Literal[0, 1]
    abstained: bool
    initial_raw_completion: str | None = None
    attempt_results: tuple[_LegacyProviderResult, ...]
    effort: ReasoningEffort
    temperature: FiniteFloat | None
    seed: int | None
    repeat_index: NonNegativeInt
    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    tokens_cache_write: NonNegativeInt = 0
    tokens_reasoning: NonNegativeInt = 0
    known_cost_usd: NonNegativeFiniteFloat
    cost_complete: bool
    cost_usd: NonNegativeFiniteFloat | None
    request_at: AwareDatetime = Field(validation_alias="ts_request")
    response_at: AwareDatetime = Field(validation_alias="ts_response")
    latency: Annotated[timedelta, Field(ge=timedelta())]

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if self.bundle_id != bundle_id(shell=self.shell_id, framing=self.framing_id):
            raise ValueError("legacy bundle_id must match shell_id and framing_id")
        if self.abstained != (self.verdict == "ABSTAIN"):
            raise ValueError("legacy abstained must agree with the verdict")
        if (self.initial_raw_completion is not None) != (self.parse_retries == 1):
            raise ValueError("legacy initial completion must agree with parse_retries")
        if len(self.attempt_results) != self.parse_retries + 1:
            raise ValueError("legacy attempt_results must contain one result per model call")
        if self.attempt_results[-1].model != self.model_returned:
            raise ValueError("legacy model_returned must match the final result")
        if self.cost_complete != (self.cost_usd is not None):
            raise ValueError("legacy cost completeness disagrees with cost_usd")
        if self.cost_usd is not None and self.cost_usd != self.known_cost_usd:
            raise ValueError("legacy complete cost must equal known cost")
        if self.response_at < self.request_at:
            raise ValueError("legacy response time must not precede request time")
        return self


class MigratedArtifact(_LegacyModel):
    """Report the input and output identity of one migrated file."""

    path: NonEmptyStr
    rows: NonNegativeInt
    source_hash: Sha256Hex
    migrated_hash: Sha256Hex


class OmittedArtifact(_LegacyModel):
    """Identify source state that cannot be copied into a resumable tree."""

    path: NonEmptyStr
    source_hash: Sha256Hex


class MigrationResult(_LegacyModel):
    """Describe journal output that still needs artifact-level integration."""

    kind: Literal["evaluation-journal-migration"] = "evaluation-journal-migration"
    schema_version: Literal[1] = 1
    mode: MigrationMode
    config_hash: Sha256Hex
    artifacts: tuple[MigratedArtifact, ...]
    omitted_artifacts: tuple[OmittedArtifact, ...]
    ready_for_resume: Literal[False] = False
    network_calls: Literal[0] = 0
    pending_integration: tuple[NonEmptyStr, ...]

    @property
    def regenerated_hashes(self) -> tuple[tuple[str, Sha256Hex], ...]:
        """Return deterministic filename-to-hash pairs for integration."""
        return tuple((artifact.path, artifact.migrated_hash) for artifact in self.artifacts)


class ArtifactHash(_LegacyModel):
    """Identify one input or adopted output by its logical path and bytes."""

    path: NonEmptyStr
    content_hash: Sha256Hex


class PlanTaskPointer(_LegacyModel):
    """Identify one deterministic plan position without carrying prompt text."""

    plan_index: NonNegativeInt
    vote_id: VoteId
    relation_id: RelationId
    family_id: JudgeFamilyId
    bundle_id: BundleId
    effort: ReasoningEffort
    repeat_index: NonNegativeInt


class JournalRequestPolicies(_LegacyModel):
    """Report registered wire policies observed in one closed journal."""

    path: NonEmptyStr
    closed_attempts: NonNegativeInt
    policy_ids: tuple[CompletionRequestPolicyId, ...]

    @model_validator(mode="after")
    def check_policy_order(self) -> Self:
        canonical = tuple(
            policy_id for policy_id in COMPLETION_REQUEST_POLICY_IDS if policy_id in self.policy_ids
        )
        if self.policy_ids != canonical:
            raise ValueError("observed request policy IDs must be unique and in registry order")
        if bool(self.closed_attempts) != bool(self.policy_ids):
            raise ValueError("closed attempt count and observed request policies disagree")
        return self


class AdoptionResult(_LegacyModel):
    """Prove that a fully prepared directory can resume without provider work."""

    kind: Literal["evaluation-artifact-adoption"] = "evaluation-artifact-adoption"
    schema_version: Literal[1] = 1
    mode: MigrationMode
    request_contract_hash: Sha256Hex
    historical_request_evidence: HistoricalRequestEvidence | None
    pilot_historical_request_subset: HistoricalRequestSubset | None
    request_policies: tuple[JournalRequestPolicies, ...]
    source_migrations: tuple[MigratedArtifact, ...]
    replaced_source_artifacts: tuple[OmittedArtifact, ...]
    input_hashes: tuple[ArtifactHash, ...]
    artifact_hashes: tuple[ArtifactHash, ...]
    ready_for_resume: Literal[True] = True
    next_plan_index: NonNegativeInt
    expected_votes: NonNegativeInt
    accepted_uncommitted: NonNegativeInt
    accepted_uncommitted_vote_ids: tuple[VoteId, ...]
    next_unattempted_task: PlanTaskPointer | None
    manifest_complete: bool
    network_calls: Literal[0] = 0


@dataclass(frozen=True, slots=True)
class _AcceptedEvidence:
    attempt_id: AttemptId
    stage: RequestStage
    family_id: JudgeFamilyId
    provider_slug: ProviderSlug
    model_requested: ModelId
    raw_result: bytes


@dataclass(slots=True)
class _VoteEvidence:
    accepted: list[_AcceptedEvidence] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_cache_write: int = 0
    tokens_reasoning: int = 0
    known_cost_usd: float = 0.0
    cost_complete: bool = True
    request_at: datetime | None = None
    response_at: datetime | None = None
    latency: timedelta = timedelta()

    def include(self, attempt: PhysicalAttempt, *, raw_result: bytes | None) -> None:
        """Accumulate the exact facts used by the retired vote builder."""
        result = attempt.result
        usage = result.usage if result is not None else None
        if usage is None:
            self.cost_complete = False
        else:
            self.tokens_in += usage.prompt_tokens
            self.tokens_out += usage.completion_tokens
            self.tokens_cached += usage.cached_tokens
            self.tokens_cache_write += usage.cache_write_tokens
            self.tokens_reasoning += usage.reasoning_tokens
            if usage.cost_usd is None:
                self.cost_complete = False
            else:
                self.known_cost_usd += usage.cost_usd
        self.request_at = (
            attempt.request_at
            if self.request_at is None
            else min(self.request_at, attempt.request_at)
        )
        self.response_at = (
            attempt.response_at
            if self.response_at is None
            else max(self.response_at, attempt.response_at)
        )
        self.latency += attempt.latency
        if attempt.failure is None and result is not None:
            if raw_result is None:
                raise AssertionError("an accepted attempt lost its provider result")
            self.accepted.append(
                _AcceptedEvidence(
                    attempt_id=attempt.attempt_id,
                    stage=attempt.request_stage,
                    family_id=attempt.family_id,
                    provider_slug=attempt.provider_slug,
                    model_requested=attempt.model_requested,
                    raw_result=raw_result,
                )
            )


@dataclass(frozen=True, slots=True)
class _MigratedAttempts:
    artifact: MigratedArtifact
    by_vote: dict[VoteId, _VoteEvidence]


@dataclass(slots=True)
class _JournalInventory:
    """Reject identity collisions and impossible paid-request sequences."""

    attempt_ids: set[AttemptId] = field(default_factory=set)
    vote_ids: set[VoteId] = field(default_factory=set)
    marker_ids: set[AttemptId] = field(default_factory=set)
    marker_vote_ids: set[VoteId] = field(default_factory=set)
    stage_counts: dict[tuple[VoteId, RequestStage], int] = field(default_factory=dict)
    request_hashes: dict[tuple[VoteId, RequestStage], RequestHash] = field(default_factory=dict)
    accepted_stages: set[tuple[VoteId, RequestStage]] = field(default_factory=set)
    repair_started: set[VoteId] = field(default_factory=set)

    def _validate_request_identity(
        self,
        *,
        physical_id: AttemptId,
        vote_id: VoteId,
        request_hash: RequestHash,
        stage: RequestStage,
        stage_attempt: int,
    ) -> tuple[VoteId, RequestStage]:
        expected_id = attempt_id(request_hash=request_hash, stage_attempt=stage_attempt)
        if physical_id != expected_id:
            raise ValueError(
                f"physical request {physical_id} disagrees with its request hash and ordinal"
            )
        key = (vote_id, stage)
        expected_ordinal = self.stage_counts.get(key, 0)
        if stage_attempt != expected_ordinal:
            raise ValueError(
                f"vote {vote_id} stage {stage} has ordinal "
                f"{stage_attempt}, expected {expected_ordinal}"
            )
        pinned_hash = self.request_hashes.setdefault(key, request_hash)
        if request_hash != pinned_hash:
            raise ValueError(f"vote {vote_id} stage {stage} changes request hash")
        if key in self.accepted_stages:
            raise ValueError(f"vote {vote_id} continues stage {stage} after acceptance")
        return key

    def _validate_stage_transition(
        self,
        *,
        vote_id: VoteId,
        stage: RequestStage,
    ) -> None:
        if stage == "repair":
            if (vote_id, "initial") not in self.accepted_stages:
                raise ValueError(f"vote {vote_id} starts repair before accepting initial")
            self.repair_started.add(vote_id)
        elif vote_id in self.repair_started:
            raise ValueError(f"vote {vote_id} returns to initial after starting repair")

    def include_attempt(self, row: _LegacyPhysicalAttempt) -> None:
        """Validate and reserve one durable physical-attempt identity."""
        physical_id = AttemptId(row.attempt_id)
        vote_id = VoteId(row.vote_id)
        request_hash = RequestHash(row.request_hash)
        if physical_id in self.attempt_ids:
            raise ValueError(f"duplicate physical attempt {physical_id}")
        if physical_id in self.marker_ids:
            raise ValueError(f"physical attempt {physical_id} is both closed and in flight")
        if vote_id in self.vote_ids:
            raise ValueError(f"completed vote {vote_id} has a later physical attempt")
        key = self._validate_request_identity(
            physical_id=physical_id,
            vote_id=vote_id,
            request_hash=request_hash,
            stage=row.request_stage,
            stage_attempt=row.stage_attempt,
        )
        self._validate_stage_transition(vote_id=vote_id, stage=row.request_stage)
        if row.result is not None and row.failure is None:
            self.accepted_stages.add(key)
        self.stage_counts[key] = row.stage_attempt + 1
        self.attempt_ids.add(physical_id)

    def include_vote(self, vote_id: VoteId) -> None:
        """Reserve one logical vote identity across every migrated journal."""
        if vote_id in self.vote_ids:
            raise ValueError(f"duplicate logical vote {vote_id}")
        if vote_id in self.marker_vote_ids:
            raise ValueError(f"completed vote {vote_id} still has an in-flight request")
        self.vote_ids.add(vote_id)

    def include_marker(self, row: _LegacyInFlightRequest) -> None:
        """Validate one unresolved marker against every durable attempt."""
        physical_id = AttemptId(row.attempt_id)
        vote_id = VoteId(row.vote_id)
        request_hash = RequestHash(row.request_hash)
        if physical_id in self.attempt_ids:
            raise ValueError(f"physical attempt {physical_id} is both closed and in flight")
        if physical_id in self.marker_ids:
            raise ValueError(f"duplicate in-flight request {physical_id}")
        if vote_id in self.vote_ids:
            raise ValueError(f"completed vote {vote_id} still has an in-flight request")
        if vote_id in self.marker_vote_ids:
            raise ValueError(f"vote {vote_id} has multiple in-flight requests")
        self._validate_request_identity(
            physical_id=physical_id,
            vote_id=vote_id,
            request_hash=request_hash,
            stage=row.request_stage,
            stage_attempt=row.stage_attempt,
        )
        self._validate_stage_transition(vote_id=vote_id, stage=row.request_stage)
        self.marker_ids.add(physical_id)
        self.marker_vote_ids.add(vote_id)


@dataclass(frozen=True, slots=True)
class _ConvertedJournals:
    """Carry converted file provenance and its validated identity inventory."""

    artifacts: tuple[MigratedArtifact, ...]
    inventory: _JournalInventory


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


@contextmanager
def _exclusive_source(source: Path) -> Iterator[None]:
    """Hold the source run lease without creating or changing its lock file."""
    lock_path = source / ".run.lock"
    try:
        lock = lock_path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot open source run lock {lock_path}: {error}") from error
    with lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f"evaluation run is still active: {source}") from error
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _legacy_rows[Row: BaseModel](path: Path, model: type[Row]) -> Iterator[Row]:
    """Yield strictly parsed JSONL rows while rejecting partial final appends."""
    try:
        source = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read legacy journal {path}: {error}") from error
    with source:
        for line_number, raw_line in enumerate(source, start=1):
            if not raw_line.endswith(b"\n"):
                raise ValueError(f"{path}:{line_number}: JSONL row lacks its final newline")
            if raw_line == b"\n":
                raise ValueError(f"{path}:{line_number}: blank JSONL rows are invalid")
            try:
                yield model.model_validate_json(raw_line, strict=True)
            except ValidationError as error:
                raise ValueError(f"{path}:{line_number}: invalid legacy row: {error}") from error


def _current_result(result: _LegacyProviderResult) -> ProviderResult:
    current = ProviderResult.model_validate_json(result.raw_json, strict=True)
    if canonical_json_bytes(current) != result.raw_json:
        raise ValueError("current provider projection changed native provider JSON")
    return current


def _failure(failure: _LegacyFailure) -> AttemptFailure:
    statuses = (failure.http_status_code, failure.provider_status_code)
    permanent_client_error = any(
        status is not None
        and _HTTP_CLIENT_ERROR_START <= status < _HTTP_SERVER_ERROR_START
        and status not in _RETRYABLE_CLIENT_STATUSES
        for status in statuses
    )
    scope: Literal["vote", "session"] = (
        "session"
        if permanent_client_error
        or failure.exception_type == "atlas_tools.relation.eval.transport.GridGuardError"
        else "vote"
    )
    match failure.category:
        case "transport":
            if any(status is not None for status in statuses) or failure.response_body is not None:
                raise ValueError("legacy transport failure carries response-only evidence")
            return TransportFailure(
                exception_type=failure.exception_type,
                message=failure.message,
                scope=scope,
                retry_after=failure.retry_after,
            )
        case "provider":
            return ProviderFailure(
                exception_type=failure.exception_type,
                message=failure.message,
                scope=scope,
                http_status_code=failure.http_status_code,
                provider_status_code=failure.provider_status_code,
                retry_after=failure.retry_after,
                response_body=failure.response_body,
            )
        case "response":
            if any(status is not None for status in statuses) or failure.retry_after is not None:
                raise ValueError("legacy response failure carries provider-status evidence")
            return ResponseFailure(
                exception_type=failure.exception_type,
                message=failure.message,
                scope=scope,
                response_body=failure.response_body,
            )
        case "routing":
            if (
                any(status is not None for status in statuses)
                or failure.retry_after is not None
                or failure.response_body is not None
            ):
                raise ValueError("legacy routing failure carries unrelated evidence")
            return RoutingFailure(
                exception_type=failure.exception_type,
                message=failure.message,
                scope=scope,
            )
        case "accounting":
            if (
                any(status is not None for status in statuses)
                or failure.retry_after is not None
                or failure.response_body is not None
            ):
                raise ValueError("legacy accounting failure carries unrelated evidence")
            return AccountingFailure(
                exception_type=failure.exception_type,
                message=failure.message,
                scope=scope,
            )


def _attempt(row: _LegacyPhysicalAttempt) -> PhysicalAttempt:
    result = _current_result(row.result) if row.result is not None else None
    failure = _failure(row.failure) if row.failure is not None else None
    if result is not None and failure is None:
        outcome = AcceptedAttempt(result=result)
    elif result is not None and failure is not None:
        outcome = RejectedAttempt(result=result, failure=failure)
    elif failure is not None:
        outcome = FailedAttempt(failure=failure)
    else:
        raise AssertionError("legacy outcome validation admitted an empty outcome")
    attempt = PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId(row.attempt_id),
            vote_id=VoteId(row.vote_id),
            request_hash=RequestHash(row.request_hash),
            stage=row.request_stage,
            stage_attempt=row.stage_attempt,
        ),
        route=AttemptRoute(
            family_id=JudgeFamilyId(row.family_id),
            provider_slug=ProviderSlug(row.provider_slug),
            model_requested=ModelId(row.model_requested),
        ),
        outcome=outcome,
        timing=AttemptTiming(
            request_at=row.request_at,
            response_at=row.response_at,
            latency=row.latency,
        ),
    )
    return PhysicalAttempt.model_validate_json(canonical_json_bytes(attempt), strict=True)


def _marker(row: _LegacyInFlightRequest) -> InFlightRequest:
    marker = InFlightRequest(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId(row.attempt_id),
            vote_id=VoteId(row.vote_id),
            request_hash=RequestHash(row.request_hash),
            stage=row.request_stage,
            stage_attempt=row.stage_attempt,
        ),
        created_at=row.created_at,
    )
    return InFlightRequest.model_validate_json(canonical_json_bytes(marker), strict=True)


def _judge_index(config: RunConfig) -> dict[JudgeFamilyId, JudgeRequestSpec]:
    judges: dict[JudgeFamilyId, JudgeRequestSpec] = {}
    for configured in config.judges:
        judge = configured.as_request_spec()
        family = judge.family_id
        if family in judges:
            raise ValueError(f"migration config contains duplicate family {family}")
        judges[family] = judge
    return judges


def _require_route(
    *,
    family_id: str,
    provider_slug: str,
    model_requested: str,
    judges: dict[JudgeFamilyId, JudgeRequestSpec],
) -> JudgeRequestSpec:
    judge = judges.get(JudgeFamilyId(family_id))
    if judge is None:
        raise ValueError(f"legacy artifact uses family absent from config: {family_id}")
    if provider_slug != judge.provider_slug or model_requested != judge.model:
        raise ValueError(
            f"legacy route for {family_id} is {provider_slug}/{model_requested}, "
            f"config pins {judge.provider_slug}/{judge.model}"
        )
    return judge


def _write_row(output: BinaryIO, digest: _Digest, row: BaseModel) -> None:
    payload = canonical_json_bytes(row) + b"\n"
    written = output.write(payload)
    if written != len(payload):
        raise OSError(f"short migration write: wrote {written} of {len(payload)} bytes")
    digest.update(payload)


def _write_payload(path: Path, payload: bytes) -> None:
    with path.open("xb") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short migration write to {path}: wrote {written} of {len(payload)}")
        output.flush()
        os.fsync(output.fileno())


def _publish_directory(temporary: Path, destination: Path) -> None:
    if destination.exists():
        raise ValueError(f"migration destination appeared during publication: {destination}")
    temporary.replace(destination)
    _sync_directory(destination.parent)


def _migrate_attempts(
    source: Path,
    destination: Path,
    *,
    judges: dict[JudgeFamilyId, JudgeRequestSpec],
    inventory: _JournalInventory,
    display_path: str,
) -> _MigratedAttempts:
    source_hash = sha256_file(source)
    migrated_digest = hashlib.sha256()
    by_vote: dict[VoteId, _VoteEvidence] = {}
    rows = 0
    with destination.open("xb") as output:
        for legacy in _legacy_rows(source, _LegacyPhysicalAttempt):
            rows += 1
            inventory.include_attempt(legacy)
            _require_route(
                family_id=legacy.family_id,
                provider_slug=legacy.provider_slug,
                model_requested=legacy.model_requested,
                judges=judges,
            )
            current = _attempt(legacy)
            _write_row(output, migrated_digest, current)
            evidence = by_vote.setdefault(VoteId(legacy.vote_id), _VoteEvidence())
            evidence.include(
                current,
                raw_result=legacy.result.raw_json if legacy.result is not None else None,
            )
        output.flush()
        os.fsync(output.fileno())
    return _MigratedAttempts(
        artifact=MigratedArtifact(
            path=display_path,
            rows=rows,
            source_hash=source_hash,
            migrated_hash=migrated_digest.hexdigest(),
        ),
        by_vote=by_vote,
    )


def _check_vote_evidence(
    row: _LegacyVote,
    evidence: _VoteEvidence,
) -> tuple[AttemptId, ...]:
    expected_stages: tuple[RequestStage, ...] = (
        ("initial", "repair") if row.parse_retries else ("initial",)
    )
    actual_stages = tuple(item.stage for item in evidence.accepted)
    if actual_stages != expected_stages:
        raise ValueError(
            f"vote {row.vote_id} accepted stages {actual_stages}, expected {expected_stages}"
        )
    legacy_results = tuple(result.raw_json for result in row.attempt_results)
    physical_results = tuple(item.raw_result for item in evidence.accepted)
    if physical_results != legacy_results:
        raise ValueError(
            f"vote {row.vote_id} provider results do not match accepted attempts in order"
        )
    accounting = (
        evidence.tokens_in,
        evidence.tokens_out,
        evidence.tokens_cached,
        evidence.tokens_cache_write,
        evidence.tokens_reasoning,
        evidence.known_cost_usd,
        evidence.cost_complete,
    )
    legacy_accounting = (
        row.tokens_in,
        row.tokens_out,
        row.tokens_cached,
        row.tokens_cache_write,
        row.tokens_reasoning,
        row.known_cost_usd,
        row.cost_complete,
    )
    if accounting != legacy_accounting:
        raise ValueError(f"vote {row.vote_id} accounting disagrees with physical attempts")
    timing = (evidence.request_at, evidence.response_at, evidence.latency)
    if timing != (row.request_at, row.response_at, row.latency):
        raise ValueError(f"vote {row.vote_id} timing disagrees with physical attempts")
    return tuple(item.attempt_id for item in evidence.accepted)


def _vote(
    row: _LegacyVote,
    *,
    evidence: _VoteEvidence,
    judges: dict[JudgeFamilyId, JudgeRequestSpec],
) -> Vote:
    attempt_ids = _check_vote_evidence(row, evidence)
    accepted = evidence.accepted
    final = accepted[-1]
    judge = _require_route(
        family_id=row.family_id,
        provider_slug=final.provider_slug,
        model_requested=final.model_requested,
        judges=judges,
    )
    if any(item.family_id != row.family_id for item in accepted):
        raise ValueError(f"vote {row.vote_id} spans multiple judge families")
    if row.provider != judge.provider_name:
        raise ValueError(
            f"vote {row.vote_id} provider {row.provider} disagrees with {judge.provider_name}"
        )
    if row.temperature != judge.temperature or row.seed != judge.seed:
        raise ValueError(f"vote {row.vote_id} decoding pins disagree with migration config")
    vote = Vote(
        identity=VoteIdentity(vote_id=VoteId(row.vote_id), relation_id=row.relation_id),
        provenance=VoteProvenance(
            card_hash=CardHash(row.card_hash),
            rubric_version=row.rubric_version,
            prompt_pack_hash=PromptPackHash(row.prompt_pack_hash),
        ),
        request=VoteRequest(
            judge=judge,
            bundle_id=row.bundle_id,
            effort=row.effort,
            temperature=row.temperature,
            seed=row.seed,
            repeat_index=row.repeat_index,
        ),
        decision=VoteDecision(
            verdict=row.verdict,
            reason=row.reason,
            raw_completion=row.raw_completion,
            initial_raw_completion=row.initial_raw_completion,
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=attempt_ids,
            model_returned=ModelId(row.model_returned),
        ),
        accounting=VoteAccounting(
            tokens_in=row.tokens_in,
            tokens_out=row.tokens_out,
            tokens_cached=row.tokens_cached,
            tokens_cache_write=row.tokens_cache_write,
            tokens_reasoning=row.tokens_reasoning,
            known_cost_usd=row.known_cost_usd,
            cost_complete=row.cost_complete,
        ),
        timing=VoteTiming(
            request_at=row.request_at,
            response_at=row.response_at,
            latency=row.latency,
        ),
    )
    return Vote.model_validate_json(canonical_json_bytes(vote), strict=True)


def _migrate_votes(
    source: Path,
    destination: Path,
    *,
    evidence_by_vote: dict[VoteId, _VoteEvidence],
    judges: dict[JudgeFamilyId, JudgeRequestSpec],
    inventory: _JournalInventory,
    display_path: str,
) -> MigratedArtifact:
    source_hash = sha256_file(source)
    migrated_digest = hashlib.sha256()
    rows = 0
    with destination.open("xb") as output:
        for legacy in _legacy_rows(source, _LegacyVote):
            rows += 1
            vote_id = VoteId(legacy.vote_id)
            inventory.include_vote(vote_id)
            evidence = evidence_by_vote.get(vote_id)
            if evidence is None:
                raise ValueError(f"vote {legacy.vote_id} has no physical attempts in {source}")
            _write_row(
                output,
                migrated_digest,
                _vote(legacy, evidence=evidence, judges=judges),
            )
        output.flush()
        os.fsync(output.fileno())
    return MigratedArtifact(
        path=display_path,
        rows=rows,
        source_hash=source_hash,
        migrated_hash=migrated_digest.hexdigest(),
    )


def _migrate_markers(
    source: Path,
    destination: Path,
    *,
    inventory: _JournalInventory,
    display_prefix: str,
) -> tuple[MigratedArtifact, ...]:
    destination.mkdir()
    artifacts: list[MigratedArtifact] = []
    if not source.exists():
        _sync_directory(destination)
        return ()
    if not source.is_dir():
        raise ValueError(f"legacy in-flight path is not a directory: {source}")
    for entry in sorted(source.iterdir()):
        if not entry.is_file() or entry.suffix != ".json":
            raise ValueError(f"unexpected entry in legacy in-flight directory: {entry}")
        try:
            legacy = _LegacyInFlightRequest.model_validate_json(entry.read_bytes(), strict=True)
        except (OSError, ValidationError) as error:
            raise ValueError(f"invalid legacy in-flight marker {entry}: {error}") from error
        if entry.stem != legacy.attempt_id:
            raise ValueError(f"in-flight marker filename disagrees with its attempt ID: {entry}")
        inventory.include_marker(legacy)
        current = _marker(legacy)
        output = destination / entry.name
        payload = canonical_json_bytes(current) + b"\n"
        _write_payload(output, payload)
        artifacts.append(
            MigratedArtifact(
                path=f"{display_prefix}/{entry.name}",
                rows=1,
                source_hash=sha256_file(entry),
                migrated_hash=hashlib.sha256(payload).hexdigest(),
            )
        )
    _sync_directory(destination)
    return tuple(artifacts)


def _validate_mode(config: RunConfig, mode: MigrationMode) -> None:
    if mode == "pilot" and not isinstance(config, PilotRunConfig):
        raise ValueError("pilot artifact migration requires a pilot config")
    if mode == "grid" and not isinstance(config, GridRunConfig):
        raise ValueError("grid artifact migration requires a grid config")


def _omitted_artifacts(source: Path, mode: MigrationMode) -> tuple[OmittedArtifact, ...]:
    names = (
        ("run-state.json", "manifest.json", "slice.jsonl")
        if mode == "pilot"
        else ("run-state.json", "manifest.json", "corpus.jsonl")
    )
    omitted: list[OmittedArtifact] = []
    for name in names:
        path = source / name
        if not path.exists():
            continue
        if not path.is_file():
            raise ValueError(f"legacy integration artifact is not a file: {path}")
        omitted.append(OmittedArtifact(path=name, source_hash=sha256_file(path)))
    return tuple(omitted)


def _pending_integration(mode: MigrationMode) -> tuple[NonEmptyStr, ...]:
    common = (
        "verify config-only request pins against the original request contract",
        "run semantic resume validation before publishing resumable state",
    )
    if mode == "pilot":
        return (
            *common,
            "migrate slice.jsonl to SliceRecord schema v2",
            "regenerate PilotRunState schema v3 from migrated journal hashes",
            "regenerate HandoffManifest schema v3 with migrated votes and attempts hashes",
        )
    return (
        *common,
        "migrate corpus.jsonl to CorpusRecord schema v2",
        "bind pilot manifest, votes, and attempts hashes into GridRunState schema v2",
        "regenerate GridManifest schema v3 with typed pilot config when the run completes",
    )


def _migrate_pair(
    *,
    source: Path,
    destination: Path,
    attempts_name: str,
    votes_name: str,
    judges: dict[JudgeFamilyId, JudgeRequestSpec],
    inventory: _JournalInventory,
) -> tuple[MigratedArtifact, MigratedArtifact]:
    attempts = _migrate_attempts(
        source / attempts_name,
        destination / attempts_name,
        judges=judges,
        inventory=inventory,
        display_path=attempts_name,
    )
    votes = _migrate_votes(
        source / votes_name,
        destination / votes_name,
        evidence_by_vote=attempts.by_vote,
        judges=judges,
        inventory=inventory,
        display_path=votes_name,
    )
    return attempts.artifact, votes


def _convert_journals(
    *,
    source: Path,
    destination: Path,
    config: RunConfig,
    mode: MigrationMode,
) -> _ConvertedJournals:
    judges = _judge_index(config)
    inventory = _JournalInventory()
    artifacts: list[MigratedArtifact] = []
    if mode == "pilot":
        artifacts.extend(
            _migrate_pair(
                source=source,
                destination=destination,
                attempts_name="attempts.jsonl",
                votes_name="votes.jsonl",
                judges=judges,
                inventory=inventory,
            )
        )
    else:
        for attempts_name, votes_name in (
            ("imported-attempts.jsonl", "imported-votes.jsonl"),
            ("attempts.jsonl", "votes.jsonl"),
        ):
            artifacts.extend(
                _migrate_pair(
                    source=source,
                    destination=destination,
                    attempts_name=attempts_name,
                    votes_name=votes_name,
                    judges=judges,
                    inventory=inventory,
                )
            )
    artifacts.extend(
        _migrate_markers(
            source / "inflight",
            destination / "inflight",
            inventory=inventory,
            display_prefix="inflight",
        )
    )
    return _ConvertedJournals(artifacts=tuple(artifacts), inventory=inventory)


def migrate_directory(
    *,
    source: Path,
    destination: Path,
    config_path: Path,
    mode: MigrationMode,
) -> MigrationResult:
    """Publish validated v2 journals to a new, explicitly incomplete directory.

    The source must be a stopped run with an existing ``.run.lock`` file. The
    destination and its temporary staging directory must be on the same file
    system so publication is one atomic rename.

    Raises:
        ValueError: A source row, linkage, route pin, or path is invalid.
        OSError: Durable output cannot be written or published.
    """
    source = source.resolve()
    destination = destination.resolve()
    if not source.is_dir():
        raise ValueError(f"migration source is not a directory: {source}")
    if destination.exists():
        raise ValueError(f"migration destination already exists: {destination}")
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ValueError("migration source and destination must be separate sibling trees")
    loaded = load_config(config_path)
    _validate_mode(loaded.config, mode)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(
            prefix=f".{destination.name}.migration-",
            dir=destination.parent,
        )
    )
    try:
        with _exclusive_source(source):
            converted = _convert_journals(
                source=source,
                destination=temporary,
                config=loaded.config,
                mode=mode,
            )
            result = MigrationResult(
                mode=mode,
                config_hash=loaded.content_hash,
                artifacts=converted.artifacts,
                omitted_artifacts=_omitted_artifacts(source, mode),
                pending_integration=_pending_integration(mode),
            )
            report = temporary / "migration-pending.json"
            payload = canonical_json_bytes(result) + b"\n"
            _write_payload(report, payload)
            _sync_directory(temporary)
        _publish_directory(temporary, destination)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return result


@dataclass(frozen=True, slots=True)
class _RequestPolicyProof:
    historical_request_evidence: HistoricalRequestEvidence | None
    journals: tuple[JournalRequestPolicies, ...]


def _task_index(plan: VotePlan) -> dict[VoteId, VoteTask]:
    tasks: dict[VoteId, VoteTask] = {}
    for task in plan.tasks():
        if task.vote_id in tasks:
            raise ValueError(f"current plan repeats logical vote {task.vote_id}")
        tasks[task.vote_id] = task
    return tasks


def _journal_request_policies(
    path: Path,
    *,
    display_path: str,
    tasks: Mapping[VoteId, VoteTask],
    prompt: RubricVotePrompt,
    config: BaseRunConfig,
) -> JournalRequestPolicies:
    attempts = load_jsonl(path, PhysicalAttempt)
    grouped: dict[VoteId, list[PhysicalAttempt]] = {}
    for attempt in attempts:
        grouped.setdefault(attempt.vote_id, []).append(attempt)
    observed: set[CompletionRequestPolicyId] = set()
    for vote_id, rows in grouped.items():
        task = tasks.get(vote_id)
        if task is None:
            raise ValueError(f"{display_path} contains attempt outside the current plan: {vote_id}")
        observed.update(
            observed_request_policy_ids(
                task,
                tuple(rows),
                prompt=prompt,
                config=config,
            )
        )
    return JournalRequestPolicies(
        path=display_path,
        closed_attempts=len(attempts),
        policy_ids=tuple(
            policy_id for policy_id in COMPLETION_REQUEST_POLICY_IDS if policy_id in observed
        ),
    )


def _pilot_import_task_index(prepared: PreparedGrid) -> dict[VoteId, VoteTask]:
    pilot_judges = {judge.family_id: judge for judge in prepared.pilot_import.config.judges}
    tasks: dict[VoteId, VoteTask] = {}
    for vote_id in prepared.imported_by_vote_id:
        baseline = prepared.baseline_by_vote_id[vote_id]
        pilot_judge = pilot_judges.get(baseline.judge.family_id)
        if pilot_judge is None:
            raise ValueError(f"pilot config lacks imported family {baseline.judge.family_id}")
        tasks[vote_id] = baseline.model_copy(update={"judge": pilot_judge})
    return tasks


def _request_policy_proof(
    prepared: PreparedPilot | PreparedGrid,
    converted: Path,
) -> _RequestPolicyProof:
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )
    if isinstance(prepared, PreparedPilot):
        journals = (
            _journal_request_policies(
                converted / "attempts.jsonl",
                display_path="attempts.jsonl",
                tasks=_task_index(prepared.plan),
                prompt=prompt,
                config=prepared.config,
            ),
        )
        own_journal = journals[0]
    else:
        fresh_votes = load_jsonl(converted / "votes.jsonl", Vote)
        fresh_plan = derive_grid_plan(prepared, fresh_votes)
        journals = (
            _journal_request_policies(
                converted / "imported-attempts.jsonl",
                display_path="imported-attempts.jsonl",
                tasks=_pilot_import_task_index(prepared),
                prompt=prompt,
                config=prepared.pilot_import.config,
            ),
            _journal_request_policies(
                converted / "attempts.jsonl",
                display_path="attempts.jsonl",
                tasks=_task_index(fresh_plan),
                prompt=prompt,
                config=prepared.config,
            ),
        )
        own_journal = journals[1]
    historical_policy_ids = tuple(
        policy_id
        for policy_id in HISTORICAL_COMPLETION_REQUEST_POLICY_IDS
        if policy_id in own_journal.policy_ids
    )
    historical_request_evidence = None
    if historical_policy_ids:
        historical_request_evidence = build_historical_request_evidence(
            load_jsonl(converted / "attempts.jsonl", PhysicalAttempt),
            request_policy_ids=historical_policy_ids,
        )
    return _RequestPolicyProof(
        historical_request_evidence=historical_request_evidence,
        journals=journals,
    )


def _request_contract(config: BaseRunConfig) -> tuple[Sha256Hex, str, str]:
    versions = transport_versions()
    contract = request_contract_hash(
        config,
        executor_policy=executor_policy_payload(),
        request_policy=request_policy_payload(),
        openrouter_sdk_version=versions.openrouter_sdk_version,
        openrouter_openapi_version=versions.openrouter_openapi_version,
    )
    return (
        contract,
        versions.openrouter_sdk_version,
        versions.openrouter_openapi_version,
    )


def _prepare_adoption(
    prepared: PreparedPilot | PreparedGrid,
    directory: Path,
    *,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> tuple[PilotPaths | GridPaths, PilotRunState | GridRunState]:
    contract, sdk_version, openapi_version = _request_contract(prepared.config)
    match prepared:
        case PreparedPilot():
            state = build_pilot_state(
                prepared,
                request_contract_hash=contract,
                openrouter_sdk_version=sdk_version,
                openrouter_openapi_version=openapi_version,
                historical_request_evidence=historical_request_evidence,
            )
            paths = PilotPaths.under(directory)
            prepare_pilot(paths, state=state, slice_records=prepared.slice_records)
        case PreparedGrid():
            state = build_grid_state(
                prepared,
                request_contract_hash=contract,
                openrouter_sdk_version=sdk_version,
                openrouter_openapi_version=openapi_version,
                historical_request_evidence=historical_request_evidence,
            )
            paths = GridPaths.under(directory)
            prepare_grid(
                paths,
                state=state,
                corpus=prepared.corpus,
                imported_votes=prepared.pilot_import.votes,
                imported_attempts=prepared.pilot_import.attempts,
            )
    return paths, state


def _require_same_imports(converted: Path, prepared: PreparedGrid) -> None:
    converted_votes = load_jsonl(converted / "imported-votes.jsonl", Vote)
    converted_attempts = load_jsonl(
        converted / "imported-attempts.jsonl",
        PhysicalAttempt,
    )
    converted_votes_by_id = {vote.vote_id: vote for vote in converted_votes}
    prepared_votes_by_id = {vote.vote_id: vote for vote in prepared.pilot_import.votes}
    if converted_votes_by_id != prepared_votes_by_id:
        raise ValueError("legacy grid imports differ from the fully adopted pilot votes")
    converted_attempts_by_id = {attempt.attempt_id: attempt for attempt in converted_attempts}
    prepared_attempts_by_id = {
        attempt.attempt_id: attempt for attempt in prepared.pilot_import.attempts
    }
    if converted_attempts_by_id != prepared_attempts_by_id:
        raise ValueError("legacy grid imports differ from the fully adopted pilot attempts")


def _replace_file(source: Path, destination: Path) -> None:
    if not source.is_file() or not destination.is_file():
        raise ValueError(f"cannot install converted journal {source.name}")
    source.replace(destination)


def _install_converted(
    converted: Path,
    paths: PilotPaths | GridPaths,
    prepared: PreparedPilot | PreparedGrid,
) -> None:
    if isinstance(prepared, PreparedGrid):
        if not isinstance(paths, GridPaths):
            raise TypeError("grid preparation returned pilot paths")
        _require_same_imports(converted, prepared)
        (converted / "imported-votes.jsonl").unlink()
        (converted / "imported-attempts.jsonl").unlink()
    _replace_file(converted / "votes.jsonl", paths.journal.votes)
    _replace_file(converted / "attempts.jsonl", paths.journal.attempts)
    paths.journal.inflight.rmdir()
    (converted / "inflight").replace(paths.journal.inflight)
    converted.rmdir()
    _sync_directory(paths.journal.votes.parent)


def _resume_proof(
    prepared: PreparedPilot | PreparedGrid,
    paths: PilotPaths | GridPaths,
    state: PilotRunState | GridRunState,
) -> tuple[tuple[Vote, ...], tuple[PhysicalAttempt, ...], ResumeIndex, VotePlan]:
    markers = tuple(paths.journal.inflight.iterdir())
    if markers:
        raise ValueError(
            f"full adoption cannot prove billing state with {len(markers)} in-flight markers"
        )
    votes = load_jsonl(paths.journal.votes, Vote)
    attempts = load_jsonl(paths.journal.attempts, PhysicalAttempt)
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )
    plan = (
        prepared.plan if isinstance(prepared, PreparedPilot) else derive_grid_plan(prepared, votes)
    )
    resume = build_resume_index(
        plan,
        votes=votes,
        attempts=attempts,
        prompt=prompt,
        config=prepared.config,
        historical_request_evidence=state.historical_request_evidence,
    )
    return votes, attempts, resume, plan


@dataclass(frozen=True, slots=True)
class _AdoptionProgress:
    accepted_uncommitted_vote_ids: tuple[VoteId, ...]
    next_unattempted_task: PlanTaskPointer | None


def _adoption_progress(
    plan: VotePlan,
    votes: tuple[Vote, ...],
    attempts: tuple[PhysicalAttempt, ...],
) -> _AdoptionProgress:
    completed = {vote.vote_id for vote in votes}
    accepted = {
        attempt.vote_id
        for attempt in attempts
        if attempt.result is not None and attempt.failure is None
    }
    attempted = {attempt.vote_id for attempt in attempts}
    pending = accepted - completed
    ordered_pending: list[VoteId] = []
    next_unattempted: PlanTaskPointer | None = None
    for plan_index, task in enumerate(plan.tasks()):
        if task.vote_id in pending:
            ordered_pending.append(task.vote_id)
        if next_unattempted is None and task.vote_id not in attempted:
            next_unattempted = PlanTaskPointer(
                plan_index=plan_index,
                vote_id=task.vote_id,
                relation_id=task.relation_id,
                family_id=task.judge.family_id,
                bundle_id=task.bundle_id,
                effort=task.effort,
                repeat_index=task.repeat_index,
            )
    if len(ordered_pending) != len(pending):
        raise ValueError("accepted uncommitted attempts fall outside the current plan")
    return _AdoptionProgress(
        accepted_uncommitted_vote_ids=tuple(ordered_pending),
        next_unattempted_task=next_unattempted,
    )


def _finalize_manifest(
    prepared: PreparedPilot | PreparedGrid,
    paths: PilotPaths | GridPaths,
    state: PilotRunState | GridRunState,
    *,
    votes: tuple[Vote, ...],
    resume: ResumeIndex,
    expected_votes: int,
) -> bool:
    if resume.next_plan_index != expected_votes:
        return False
    if isinstance(prepared, PreparedPilot):
        if not isinstance(paths, PilotPaths) or not isinstance(state, PilotRunState):
            raise TypeError("pilot preparation returned mismatched state or paths")
        if load_json(paths.state, PilotRunState) != state:
            raise ValueError("prepared pilot state changed before finalization")
        artifact_hashes = {
            "attempts.jsonl": sha256_file(paths.journal.attempts),
            "slice.jsonl": sha256_file(paths.slice),
            "votes.jsonl": sha256_file(paths.journal.votes),
        }
        write_pilot_manifest(
            paths.manifest,
            build_pilot_manifest(
                prepared,
                state=state,
                votes=votes,
                artifact_hashes=artifact_hashes,
            ),
        )
        return True
    if not isinstance(paths, GridPaths) or not isinstance(state, GridRunState):
        raise TypeError("grid preparation returned mismatched state or paths")
    if load_json(paths.state, GridRunState) != state:
        raise ValueError("prepared grid state changed before finalization")
    grid_votes, canary_votes = split_grid_votes(derive_grid_plan(prepared, votes), votes)
    analysis = analyze_grid(
        cards=prepared.pool,
        family_ids=tuple(judge.family_id for judge in prepared.config.judges),
        imported_votes=prepared.pilot_import.votes,
        fresh_votes=grid_votes,
    )
    artifact_hashes = {
        "attempts.jsonl": sha256_file(paths.journal.attempts),
        "corpus.jsonl": sha256_file(paths.corpus),
        "imported-attempts.jsonl": sha256_file(paths.imported_attempts),
        "imported-votes.jsonl": sha256_file(paths.imported_votes),
        "votes.jsonl": sha256_file(paths.journal.votes),
    }
    write_grid_manifest(
        paths.manifest,
        build_grid_manifest(
            prepared,
            state=state,
            analysis=analysis,
            canary_votes=canary_votes,
            artifact_hashes=artifact_hashes,
            executor_policy=executor_policy_payload(),
            request_policy=request_policy_payload(),
        ),
    )
    return True


def _verify_adoption_inputs(
    prepared: PreparedPilot | PreparedGrid,
    *,
    pilot_directory: Path | None,
) -> tuple[ArtifactHash, ...]:
    expected: dict[str, Sha256Hex] = {
        "config": prepared.loaded_config.content_hash,
        "cards/cards.jsonl": prepared.deck.source_hashes["cards.jsonl"],
        "cards/cards.manifest.json": prepared.deck.source_hashes["cards.manifest.json"],
    }
    paths = {
        "config": prepared.loaded_config.path,
        "cards/cards.jsonl": prepared.deck.cards_path,
        "cards/cards.manifest.json": prepared.deck.manifest_path,
    }
    if isinstance(prepared, PreparedGrid):
        if pilot_directory is None:
            raise TypeError("prepared grid lost its pilot directory")
        pilot = prepared.pilot_import
        expected |= {
            "pilot/manifest.json": pilot.manifest_hash,
            "pilot/votes.jsonl": pilot.votes_hash,
            "pilot/attempts.jsonl": pilot.attempts_hash,
        }
        paths |= {
            "pilot/manifest.json": pilot_directory / "manifest.json",
            "pilot/votes.jsonl": pilot_directory / "votes.jsonl",
            "pilot/attempts.jsonl": pilot_directory / "attempts.jsonl",
        }
    observed = {name: sha256_file(path) for name, path in paths.items()}
    if observed != expected:
        changed = tuple(name for name in sorted(expected) if observed[name] != expected[name])
        raise ValueError(f"adoption inputs changed during validation: {changed}")
    return tuple(ArtifactHash(path=name, content_hash=observed[name]) for name in sorted(observed))


def _artifact_hashes(directory: Path) -> tuple[ArtifactHash, ...]:
    files = tuple(
        sorted(
            path
            for path in directory.rglob("*")
            if path.is_file() and path.name != _ADOPTION_REPORT
        )
    )
    return tuple(
        ArtifactHash(
            path=str(path.relative_to(directory)),
            content_hash=sha256_file(path),
        )
        for path in files
    )


def adopt_directory(
    *,
    source: Path,
    destination: Path,
    config_path: Path,
    cards_directory: Path,
    mode: MigrationMode,
    pilot_directory: Path | None = None,
) -> AdoptionResult:
    """Publish a current, strongly validated evaluation directory atomically.

    The complete tree is prepared under the destination parent and becomes
    visible through one directory rename. No provider transport is created.

    Raises:
        ValueError: Inputs, legacy evidence, current plan replay, or paths disagree.
        OSError: Durable staging or atomic publication fails.
    """
    source = source.resolve()
    destination = destination.resolve()
    config_path = config_path.resolve()
    cards_directory = cards_directory.resolve()
    pilot_directory = pilot_directory.resolve() if pilot_directory is not None else None
    if not source.is_dir():
        raise ValueError(f"migration source is not a directory: {source}")
    if destination.exists():
        raise ValueError(f"migration destination already exists: {destination}")
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ValueError("migration source and destination must be separate sibling trees")
    prepared = prepare_evaluation_inputs(
        config_path,
        cards_directory,
        pilot_directory=pilot_directory,
    )
    if mode == "pilot" and not isinstance(prepared, PreparedPilot):
        raise ValueError("pilot artifact adoption requires a pilot config")
    if mode == "grid" and not isinstance(prepared, PreparedGrid):
        raise ValueError("grid artifact adoption requires a grid config and pilot handoff")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{destination.name}.adoption-", dir=destination.parent)
    )
    try:
        with _exclusive_source(source):
            converted_directory = temporary / ".converted"
            converted_directory.mkdir()
            converted = _convert_journals(
                source=source,
                destination=converted_directory,
                config=prepared.config,
                mode=mode,
            )
            policy_proof = _request_policy_proof(prepared, converted_directory)
            paths, state = _prepare_adoption(
                prepared,
                temporary,
                historical_request_evidence=policy_proof.historical_request_evidence,
            )
            _install_converted(converted_directory, paths, prepared)
            votes, attempts, resume, plan = _resume_proof(prepared, paths, state)
            progress = _adoption_progress(plan, votes, attempts)
            expected_votes = plan.expected_votes
            manifest_complete = _finalize_manifest(
                prepared,
                paths,
                state,
                votes=votes,
                resume=resume,
                expected_votes=expected_votes,
            )
            input_hashes = _verify_adoption_inputs(
                prepared,
                pilot_directory=pilot_directory,
            )
            result = AdoptionResult(
                mode=mode,
                request_contract_hash=state.request_contract_hash,
                historical_request_evidence=state.historical_request_evidence,
                pilot_historical_request_subset=(
                    prepared.pilot_import.historical_request_subset
                    if isinstance(prepared, PreparedGrid)
                    else None
                ),
                request_policies=policy_proof.journals,
                source_migrations=converted.artifacts,
                replaced_source_artifacts=_omitted_artifacts(source, mode),
                input_hashes=input_hashes,
                artifact_hashes=_artifact_hashes(temporary),
                next_plan_index=resume.next_plan_index,
                expected_votes=expected_votes,
                accepted_uncommitted=len(progress.accepted_uncommitted_vote_ids),
                accepted_uncommitted_vote_ids=progress.accepted_uncommitted_vote_ids,
                next_unattempted_task=progress.next_unattempted_task,
                manifest_complete=manifest_complete,
            )
            _write_payload(
                temporary / _ADOPTION_REPORT,
                canonical_json_bytes(result) + b"\n",
            )
            _sync_directory(temporary)
        _publish_directory(temporary, destination)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Adopt flat evaluation artifacts or convert their journals forensically.",
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("pilot", "grid"))
    parser.add_argument(
        "--cards",
        type=Path,
        help="verified cards directory required for full adoption",
    )
    parser.add_argument(
        "--pilot-directory",
        type=Path,
        help="fully adopted pilot required for full grid adoption",
    )
    parser.add_argument(
        "--journals-only",
        action="store_true",
        help="convert only journals and emit non-resumable forensic output",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run forensic journal conversion or full artifact adoption."""
    parser = _parser()
    arguments = parser.parse_args(argv)
    if arguments.journals_only:
        if arguments.cards is not None or arguments.pilot_directory is not None:
            parser.error("--journals-only does not accept --cards or --pilot-directory")
        result = migrate_directory(
            source=arguments.source,
            destination=arguments.destination,
            config_path=arguments.config,
            mode=arguments.mode,
        )
        sys.stdout.write(
            f"migrated {sum(artifact.rows for artifact in result.artifacts)} rows; "
            "output remains integration-pending\n"
        )
        return 0
    if arguments.cards is None:
        parser.error("full adoption requires --cards")
    if arguments.mode == "grid" and arguments.pilot_directory is None:
        parser.error("full grid adoption requires --pilot-directory")
    if arguments.mode == "pilot" and arguments.pilot_directory is not None:
        parser.error("pilot adoption does not accept --pilot-directory")
    adopted = adopt_directory(
        source=arguments.source,
        destination=arguments.destination,
        config_path=arguments.config,
        cards_directory=arguments.cards,
        mode=arguments.mode,
        pilot_directory=arguments.pilot_directory,
    )
    sys.stdout.write(
        f"adopted {adopted.next_plan_index}/{adopted.expected_votes} committed votes; "
        f"{adopted.accepted_uncommitted} accepted and uncommitted\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
