"""Acquire one durable embedding artifact for the production grid.

The orchestration in this module keeps provider work behind the neutral
embedding transport. It validates the grid and deck before reading its private
content-addressed cache, starts OpenRouter only for cache misses, and delegates
the final deterministic artifact to the analysis codec.
"""

import hashlib
import json
import math
import os
import stat
import struct
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import partial
from pathlib import Path
from typing import IO, Annotated, Literal, Self
from uuid import uuid7

import trio
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    ValidationError,
    field_validator,
    model_validator,
)

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.evaluation.analysis.api import EmbeddingRow
from atlas_tools.relation.evaluation.application._lifetime import close_owned_transport
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    EmbeddingProducerIdentity,
    EmbeddingRequestIdentity,
    EmbeddingResponseIdentity,
    EmbeddingsArtifact,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_embeddings_async,
    write_embeddings_async,
)
from atlas_tools.relation.evaluation.application.settings import OpenRouterSettings
from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    EmbeddingConfig,
    EvaluationCard,
    FiniteFloat,
    GridRunConfig,
    NonNegativeFiniteFloat,
    ResponseFailure,
    Sha256Hex,
)
from atlas_tools.relation.evaluation.modes.api import FEW_SHOTS
from atlas_tools.relation.evaluation.storage.api import (
    LoadedConfig,
    VerifiedDeck,
    load_config_async,
    load_deck_async,
)
from atlas_tools.relation.evaluation.transport.api import (
    EMBEDDING_REQUEST_SCHEMA_VERSION,
    AsyncEmbeddingTransport,
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingUsage,
    EmbeddingVector,
    OpenRouterEmbeddingTransport,
    normalize_openrouter_embedding_endpoint,
    openrouter_embedding_server_url,
)

_CACHE_ENTRY_ALGORITHM = "relation-embedding-cache-f32-json-v2"
_CACHE_KEY_ALGORITHM = "relation-embedding-cache-key-v2"
_OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"
_FLOAT32_BYTES = 4
_AUDIT_DIRECTORY = "_requests"


class EmbeddingConfigurationError(ValueError):
    """Report an incomplete or contradictory embedding configuration."""


class EmbeddingCacheError(ValueError):
    """Report a cache entry that cannot prove its expected identity and shape."""


class EmbeddingBudgetExceededError(RuntimeError):
    """Report that the number of cache misses exceeds the configured paid bound."""


class EmbeddingTransportContractError(RuntimeError):
    """Report an accepted transport response that disagrees with its request."""


class EmbeddingIncompleteRequestError(RuntimeError):
    """Refuse to reissue a batch whose prior paid outcome is unknown."""


class EmbeddingAcquisitionError(RuntimeError):
    """Expose one explicit provider or response failure from the transport."""

    __slots__ = ("failure",)

    failure: AttemptFailure

    def __init__(self, failure: AttemptFailure) -> None:
        self.failure = failure
        super().__init__(
            f"embedding transport {failure.category} failure: "
            f"{failure.exception_type}: {failure.message}"
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingRun:
    """Return the artifact and the exact work used to obtain it.

    A reused artifact performs no cache or network work. A newly written
    artifact accounts for every unique card as either a validated cache hit or
    one network input.
    """

    artifact: EmbeddingsArtifact
    relation_count: int
    unique_card_count: int
    cache_hits: int
    network_texts: int
    reused_artifact: bool

    def __post_init__(self) -> None:
        counts = (
            self.relation_count,
            self.unique_card_count,
            self.cache_hits,
            self.network_texts,
        )
        if any(type(value) is not int or value < 0 for value in counts):
            raise ValueError("embedding run counts must be non-negative integers")
        if self.unique_card_count > self.relation_count:
            raise ValueError("unique embedding cards cannot exceed relations")
        accounted = self.cache_hits + self.network_texts
        expected = 0 if self.reused_artifact else self.unique_card_count
        if accounted != expected:
            raise ValueError(f"embedding run accounts for {accounted} cards, expected {expected}")


class _CacheModel(BaseModel):
    """Reject coercion and undeclared fields in private cache records."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class _CacheKey(_CacheModel):
    """Identify one normalized vector by producer and content, never by path."""

    algorithm: Literal["relation-embedding-cache-key-v2"] = _CACHE_KEY_ALGORITHM
    producer: EmbeddingProducerIdentity
    card_hash: Sha256Hex


class _CacheEntry(_CacheModel):
    """Bind one normalized vector to its full producer and card identity."""

    schema_version: Literal[2] = 2
    algorithm: Literal["relation-embedding-cache-f32-json-v2"] = _CACHE_ENTRY_ALGORITHM
    producer: EmbeddingProducerIdentity
    card_hash: Sha256Hex
    vector: tuple[FiniteFloat, ...] = Field(min_length=1)

    @field_validator("vector", mode="before")
    @classmethod
    def require_float_components(cls, value: object) -> object:
        """Reject JSON integers and booleans instead of coercing cache bytes."""
        if isinstance(value, list | tuple):
            if any(type(item) is not float for item in value):
                raise TypeError("cached embedding components must be JSON floats")
            return tuple(value)
        return value

    @model_validator(mode="after")
    def check_dimension(self) -> Self:
        """Require the declared dimension to equal the stored vector shape."""
        dimension = self.producer.response.dimension
        if len(self.vector) != dimension:
            raise ValueError(
                f"cached embedding has dimension {len(self.vector)}, expected {dimension}"
            )

        return self


class _AuditRequestKey(_CacheModel):
    """Identify one ordered batch without storing private card text."""

    schema_version: Literal[1] = 1
    request: EmbeddingRequestIdentity
    card_hashes: tuple[Sha256Hex, ...] = Field(min_length=1)


class _AuditMarker(_CacheModel):
    """Prove a provider request may have escaped without a known outcome."""

    kind: Literal["embedding-in-flight"] = "embedding-in-flight"
    schema_version: Literal[1] = 1
    request_key: Sha256Hex
    attempt_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    request_at: AwareDatetime
    request: EmbeddingRequestIdentity
    card_hashes: tuple[Sha256Hex, ...] = Field(min_length=1)


class _AuditUsage(_CacheModel):
    """Persist returned usage while making missing cost explicit."""

    input_tokens: NonNegativeInt
    total_tokens: NonNegativeInt
    cost_usd: NonNegativeFiniteFloat | None

    @model_validator(mode="after")
    def check_totals(self) -> Self:
        if self.total_tokens < self.input_tokens:
            raise ValueError("embedding total tokens must cover input tokens")
        return self

    @classmethod
    def from_usage(cls, usage: EmbeddingUsage | None) -> Self | None:
        """Preserve returned accounting without manufacturing unknown values."""
        if usage is None:
            return None
        return cls(
            input_tokens=usage.input_tokens,
            total_tokens=usage.total_tokens,
            cost_usd=usage.cost_usd,
        )


class _AuditAccepted(_CacheModel):
    """Persist a billed response and enough bytes to recover its cache entries."""

    kind: Literal["accepted"] = "accepted"
    producer: EmbeddingProducerIdentity
    usage: _AuditUsage | None
    cost_complete: bool
    entries: tuple[_CacheEntry, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def check_accounting(self) -> Self:
        expected = self.usage is not None and self.usage.cost_usd is not None
        if self.cost_complete is not expected:
            raise ValueError("embedding cost completeness disagrees with returned usage")

        if any(entry.producer != self.producer for entry in self.entries):
            raise ValueError("embedding audit entries disagree on producer identity")

        return self


class _AuditFailed(_CacheModel):
    """Persist one transport failure with explicitly incomplete cost."""

    kind: Literal["failed"] = "failed"
    failure: AttemptFailure
    cost_complete: Literal[False] = False


class _AuditRejected(_CacheModel):
    """Persist one rejected response with any accounting that survived."""

    kind: Literal["rejected"] = "rejected"
    failure: AttemptFailure
    usage: _AuditUsage | None
    cost_complete: bool

    @model_validator(mode="after")
    def check_accounting(self) -> Self:
        expected = self.usage is not None and self.usage.cost_usd is not None
        if self.cost_complete is not expected:
            raise ValueError("embedding cost completeness disagrees with returned usage")
        return self


type _AuditOutcome = Annotated[
    _AuditAccepted | _AuditFailed | _AuditRejected,
    Field(discriminator="kind"),
]


class _AuditAttempt(_CacheModel):
    """Record one provider exchange before clearing its in-flight marker."""

    kind: Literal["embedding-attempt"] = "embedding-attempt"
    schema_version: Literal[1] = 1
    request_key: Sha256Hex
    attempt_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    request_at: AwareDatetime
    response_at: AwareDatetime
    request: EmbeddingRequestIdentity
    card_hashes: tuple[Sha256Hex, ...] = Field(min_length=1)
    outcome: _AuditOutcome

    @model_validator(mode="after")
    def check_timing(self) -> Self:
        if self.response_at < self.request_at:
            raise ValueError("embedding response precedes its request")
        return self


@dataclass(frozen=True, slots=True, kw_only=True)
class _CardText:
    card_hash: Sha256Hex
    text: str


@dataclass(frozen=True, slots=True, kw_only=True)
class _EmbeddingBatch:
    index: int
    cards: tuple[_CardText, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class _AcceptedPayload:
    producer: EmbeddingProducerIdentity
    vectors: tuple[EmbeddingVector, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class _BatchAccepted:
    vectors: Mapping[Sha256Hex, bytes]


@dataclass(frozen=True, slots=True, kw_only=True)
class _BatchFailed:
    failure: AttemptFailure


@dataclass(frozen=True, slots=True, kw_only=True)
class _BatchInvalid:
    message: str


@dataclass(frozen=True, slots=True, kw_only=True)
class _BatchErrored:
    error: Exception


@dataclass(frozen=True, slots=True)
class _BatchSkipped:
    pass


type _BatchResult = _BatchAccepted | _BatchFailed | _BatchInvalid | _BatchErrored | _BatchSkipped


def _canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")


def _model_bytes(model: BaseModel) -> bytes:
    return _canonical_json_bytes(model.model_dump(mode="json")) + b"\n"


def _producer_identity(
    *,
    endpoint_url: str,
    model: str,
    dimension: int,
) -> EmbeddingProducerIdentity:
    producer = EmbeddingProducerIdentity.verified(
        endpoint_url=endpoint_url,
        model=model,
        dimension=dimension,
    )

    if producer.request.schema_version != EMBEDDING_REQUEST_SCHEMA_VERSION:
        raise RuntimeError("embedding producer and transport schema versions disagree")

    return producer


def _configured_producer(embedding: EmbeddingConfig) -> EmbeddingProducerIdentity:
    if embedding.dimension is None:
        raise EmbeddingConfigurationError(
            "grid embedding configuration requires an explicit dimension"
        )
    try:
        endpoint_url = normalize_openrouter_embedding_endpoint(embedding.endpoint_url)
    except ValueError as error:
        raise EmbeddingConfigurationError(str(error)) from error
    return _producer_identity(
        endpoint_url=endpoint_url,
        model=embedding.model,
        dimension=embedding.dimension,
    )


def _cache_path(
    cache_directory: Path,
    *,
    producer: EmbeddingProducerIdentity,
    card_hash: Sha256Hex,
) -> Path:
    """Derive a sharded filename from every vector-producing semantic."""
    key = _CacheKey(producer=producer, card_hash=card_hash)
    digest = hashlib.sha256(_canonical_json_bytes(key.model_dump(mode="json"))).hexdigest()
    return cache_directory / digest[:2] / f"{digest}.json"


def _validate_cache_identity(
    entry: _CacheEntry,
    *,
    path: Path,
    producer: EmbeddingProducerIdentity,
    card_hash: Sha256Hex,
) -> None:
    if entry.producer != producer:
        raise EmbeddingCacheError(f"cached embedding producer identity disagrees at {path}")
    if entry.card_hash != card_hash:
        raise EmbeddingCacheError(f"cached embedding card hash disagrees at {path}")


def _load_cache_entry(
    path: Path,
    *,
    producer: EmbeddingProducerIdentity,
    card_hash: Sha256Hex,
) -> _CacheEntry | None:
    try:
        information = path.stat(follow_symlinks=False)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise EmbeddingCacheError(f"cannot inspect embedding cache {path}: {error}") from error
    if not stat.S_ISREG(information.st_mode):
        raise EmbeddingCacheError(f"embedding cache entry is not a regular file: {path}")
    try:
        payload = path.read_bytes()
        entry = _CacheEntry.model_validate_json(payload, strict=True)
    except (OSError, TypeError, ValidationError) as error:
        raise EmbeddingCacheError(f"invalid embedding cache entry {path}: {error}") from error
    if payload != _model_bytes(entry):
        raise EmbeddingCacheError(f"embedding cache entry is not canonical: {path}")
    _validate_cache_identity(
        entry,
        path=path,
        producer=producer,
        card_hash=card_hash,
    )
    return entry


def _write_all(output: IO[bytes], payload: bytes) -> None:
    written = output.write(payload)
    if written != len(payload):
        raise OSError(f"short cache write: wrote {written} of {len(payload)} bytes")


def _sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ensure_directory(directory: Path) -> None:
    """Create and durably publish each missing directory without following symlinks."""
    missing: list[Path] = []
    current = directory
    while True:
        try:
            information = current.stat(follow_symlinks=False)
        except FileNotFoundError:
            missing.append(current)
            parent = current.parent
            if parent == current:
                raise OSError(f"cannot find an existing ancestor for {directory}") from None
            current = parent
            continue
        if not stat.S_ISDIR(information.st_mode):
            raise EmbeddingCacheError(f"embedding cache parent is not a directory: {current}")
        break
    for path in reversed(missing):
        try:
            path.mkdir()
        except FileExistsError:
            information = path.stat(follow_symlinks=False)
            if not stat.S_ISDIR(information.st_mode):
                raise EmbeddingCacheError(
                    f"embedding cache parent is not a directory: {path}"
                ) from None
        _sync_directory(path.parent)


def _publish_exclusive_model(path: Path, model: BaseModel) -> None:
    """Durably publish one immutable audit model without overwriting a peer."""
    _ensure_directory(path.parent)
    payload = _model_bytes(model)

    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            _write_all(output, payload)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise

    try:
        os.link(temporary, path)
        _sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _load_audit_model[ModelT: BaseModel](path: Path, model: type[ModelT]) -> ModelT:
    try:
        information = path.stat(follow_symlinks=False)
        if not stat.S_ISREG(information.st_mode):
            raise EmbeddingCacheError(f"embedding audit record is not regular: {path}")
        payload = path.read_bytes()
        record = model.model_validate_json(payload, strict=True)
    except (OSError, TypeError, ValidationError) as error:
        raise EmbeddingCacheError(f"invalid embedding audit record {path}: {error}") from error
    if payload != _model_bytes(record):
        raise EmbeddingCacheError(f"embedding audit record is not canonical: {path}")
    return record


def _audit_request_key(
    request: EmbeddingRequestIdentity,
    card_hashes: tuple[Sha256Hex, ...],
) -> Sha256Hex:
    identity = _AuditRequestKey(request=request, card_hashes=card_hashes)
    return hashlib.sha256(_canonical_json_bytes(identity.model_dump(mode="json"))).hexdigest()


def _audit_marker_path(cache_directory: Path, request_key: Sha256Hex) -> Path:
    return cache_directory / _AUDIT_DIRECTORY / "inflight" / f"{request_key}.json"


def _audit_attempt_path(cache_directory: Path, attempt_id: str) -> Path:
    return cache_directory / _AUDIT_DIRECTORY / "attempts" / f"{attempt_id}.json"


def _begin_audit(
    cache_directory: Path,
    request: EmbeddingRequestIdentity,
    cards: Sequence[_CardText],
) -> _AuditMarker:
    card_hashes = tuple(card.card_hash for card in cards)
    request_key = _audit_request_key(request, card_hashes)
    marker = _AuditMarker(
        request_key=request_key,
        attempt_id=uuid7().hex,
        request_at=datetime.now(UTC),
        request=request,
        card_hashes=card_hashes,
    )
    path = _audit_marker_path(cache_directory, request_key)
    try:
        _publish_exclusive_model(path, marker)
    except FileExistsError as error:
        raise EmbeddingIncompleteRequestError(
            f"embedding batch {request_key} already has an in-flight request"
        ) from error
    return marker


def _finish_audit(
    cache_directory: Path,
    marker: _AuditMarker,
    outcome: _AuditOutcome,
) -> _AuditAttempt:
    attempt = _AuditAttempt(
        request_key=marker.request_key,
        attempt_id=marker.attempt_id,
        request_at=marker.request_at,
        response_at=datetime.now(UTC),
        request=marker.request,
        card_hashes=marker.card_hashes,
        outcome=outcome,
    )
    _publish_exclusive_model(
        _audit_attempt_path(cache_directory, marker.attempt_id),
        attempt,
    )
    return attempt


def _clear_audit_marker(cache_directory: Path, marker: _AuditMarker) -> None:
    path = _audit_marker_path(cache_directory, marker.request_key)
    path.unlink()
    _sync_directory(path.parent)


def _validate_audit_pair(marker: _AuditMarker, attempt: _AuditAttempt) -> None:
    marker_identity = (
        marker.request_key,
        marker.attempt_id,
        marker.request_at,
        marker.request,
        marker.card_hashes,
    )
    attempt_identity = (
        attempt.request_key,
        attempt.attempt_id,
        attempt.request_at,
        attempt.request,
        attempt.card_hashes,
    )
    if attempt_identity != marker_identity:
        raise EmbeddingCacheError("embedding attempt does not match its in-flight marker")


def _recover_audit(
    cache_directory: Path,
    target_card_hashes: frozenset[Sha256Hex],
) -> None:
    marker_directory = cache_directory / _AUDIT_DIRECTORY / "inflight"
    try:
        marker_paths = tuple(sorted(marker_directory.glob("*.json")))
    except OSError as error:
        raise EmbeddingCacheError(f"cannot inspect embedding audit markers: {error}") from error

    for marker_path in marker_paths:
        marker = _load_audit_model(marker_path, _AuditMarker)
        attempt_path = _audit_attempt_path(cache_directory, marker.attempt_id)
        try:
            attempt_path.stat(follow_symlinks=False)
        except FileNotFoundError:
            if target_card_hashes.intersection(marker.card_hashes):
                raise EmbeddingIncompleteRequestError(
                    f"embedding batch {marker.request_key} has an unknown paid outcome"
                ) from None
            continue
        except OSError as error:
            raise EmbeddingCacheError(
                f"cannot inspect embedding audit attempt {attempt_path}: {error}"
            ) from error
        attempt = _load_audit_model(attempt_path, _AuditAttempt)
        _validate_audit_pair(marker, attempt)
        if isinstance(attempt.outcome, _AuditAccepted):
            entries = tuple(
                (
                    _cache_path(
                        cache_directory,
                        producer=entry.producer,
                        card_hash=entry.card_hash,
                    ),
                    entry,
                )
                for entry in attempt.outcome.entries
            )
            _publish_cache_entries(entries)
        _clear_audit_marker(cache_directory, marker)


def _record_terminal_audit(
    cache_directory: Path,
    marker: _AuditMarker,
    outcome: _AuditFailed | _AuditRejected,
) -> None:
    _finish_audit(cache_directory, marker, outcome)
    _clear_audit_marker(cache_directory, marker)


def _record_accepted_audit(
    cache_directory: Path,
    marker: _AuditMarker,
    outcome: _AuditAccepted,
    entries: Sequence[tuple[Path, _CacheEntry]],
) -> None:
    _finish_audit(cache_directory, marker, outcome)
    _publish_cache_entries(entries)
    _clear_audit_marker(cache_directory, marker)


def _publish_cache_entry(path: Path, entry: _CacheEntry) -> None:
    """Publish one immutable cache record or prove an identical record won."""
    existing = _load_cache_entry(
        path,
        producer=entry.producer,
        card_hash=entry.card_hash,
    )
    if existing is not None:
        if existing != entry:
            raise EmbeddingCacheError(f"embedding cache contains a conflicting vector: {path}")
        return

    _ensure_directory(path.parent)
    payload = _model_bytes(entry)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            _write_all(output, payload)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        try:
            os.link(temporary, path)
        except FileExistsError:
            winner = _load_cache_entry(
                path,
                producer=entry.producer,
                card_hash=entry.card_hash,
            )
            if winner != entry:
                raise EmbeddingCacheError(
                    f"concurrent embedding cache publication disagreed at {path}"
                ) from None
        else:
            _sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _publish_cache_entries(
    entries: Sequence[tuple[Path, _CacheEntry]],
) -> None:
    for path, entry in entries:
        _publish_cache_entry(path, entry)


def _normalize_vector(
    vector: EmbeddingVector,
    *,
    dimension: int,
) -> tuple[bytes, tuple[float, ...]]:
    if len(vector) != dimension:
        raise EmbeddingTransportContractError(
            f"embedding vector has dimension {len(vector)}, expected {dimension}"
        )
    try:
        packed = struct.pack(f"<{dimension}f", *vector)
    except (OverflowError, struct.error) as error:
        raise EmbeddingTransportContractError(
            "embedding vector cannot be represented as finite float32"
        ) from error
    normalized = struct.unpack(f"<{dimension}f", packed)
    if any(not math.isfinite(value) for value in normalized):
        raise EmbeddingTransportContractError(
            "embedding vector cannot be represented as finite float32"
        )
    return packed, normalized


def _pack_cached(entry: _CacheEntry) -> bytes:
    dimension = entry.producer.response.dimension
    try:
        packed = struct.pack(f"<{dimension}f", *entry.vector)
    except (OverflowError, struct.error) as error:
        raise EmbeddingCacheError(
            "cached embedding cannot be represented as finite float32"
        ) from error

    if len(packed) != dimension * _FLOAT32_BYTES:
        raise EmbeddingCacheError("cached embedding produced an invalid packed shape")

    if any(not math.isfinite(value[0]) for value in struct.iter_unpack("<f", packed)):
        raise EmbeddingCacheError("cached embedding is not finite float32")

    return packed


def _cache_snapshot(
    cache_directory: Path,
    cards: Sequence[_CardText],
    *,
    producer: EmbeddingProducerIdentity,
) -> tuple[dict[Sha256Hex, bytes], tuple[_CardText, ...]]:
    hits: dict[Sha256Hex, bytes] = {}
    misses: list[_CardText] = []
    for card in cards:
        path = _cache_path(
            cache_directory,
            producer=producer,
            card_hash=card.card_hash,
        )
        entry = _load_cache_entry(
            path,
            producer=producer,
            card_hash=card.card_hash,
        )

        if entry is None:
            misses.append(card)
        else:
            hits[card.card_hash] = _pack_cached(entry)

    return hits, tuple(misses)


def _eligible_cards(deck: VerifiedDeck) -> tuple[EvaluationCard, ...]:
    shot_ids = frozenset(shot.relation_id for shot in FEW_SHOTS)
    cards = tuple(
        sorted(
            (card for card in deck.cards if card.relation_id not in shot_ids),
            key=lambda card: card.relation_id,
        )
    )
    if not cards:
        raise ValueError("deck contains no grid-eligible cards")
    return cards


def _unique_card_texts(cards: Sequence[EvaluationCard]) -> tuple[_CardText, ...]:
    by_hash: dict[Sha256Hex, _CardText] = {}
    for card in cards:
        existing = by_hash.get(card.card_hash)
        if existing is not None and existing.text != card.card_text:
            raise ValueError(f"card hash {card.card_hash} identifies more than one card text")
        by_hash[card.card_hash] = _CardText(
            card_hash=card.card_hash,
            text=card.card_text,
        )
    return tuple(by_hash[card_hash] for card_hash in sorted(by_hash))


def _source_hashes(
    loaded_config: LoadedConfig,
    deck: VerifiedDeck,
) -> dict[str, Sha256Hex]:
    return {
        "cards.jsonl": deck.source_hashes["cards.jsonl"],
        "cards.manifest.json": deck.source_hashes["cards.manifest.json"],
        "grid-config": loaded_config.content_hash,
    }


def _artifact_presence(path: Path) -> tuple[bool, bool]:
    sidecar = path.with_name(f"{path.name}.meta.json")
    return path.exists(), sidecar.exists()


def _validate_artifact(
    artifact: EmbeddingsArtifact,
    *,
    cards: Sequence[EvaluationCard],
    dimension: int,
) -> None:
    expected = tuple((card.relation_id, card.card_hash) for card in cards)
    observed = tuple((row.relation_id, row.card_hash) for row in artifact.rows)
    if observed != expected:
        raise ValueError("embedding artifact does not match the eligible grid cards")
    if artifact.metadata.dimension != dimension:
        raise ValueError("embedding artifact dimension does not match grid configuration")


def _batches(
    cards: Sequence[_CardText],
    *,
    batch_size: int,
) -> tuple[_EmbeddingBatch, ...]:
    return tuple(
        _EmbeddingBatch(index=index, cards=tuple(cards[offset : offset + batch_size]))
        for index, offset in enumerate(range(0, len(cards), batch_size))
    )


def _check_miss_budget(cards: Sequence[_CardText], maximum: int | None) -> None:
    if maximum is not None and len(cards) > maximum:
        raise EmbeddingBudgetExceededError(
            f"embedding cache has {len(cards)} misses, maximum is {maximum}"
        )


def _accepted_vectors(
    accepted: EmbeddingAccepted,
    request: EmbeddingRequest,
    expected_producer: EmbeddingProducerIdentity,
) -> _AcceptedPayload | str:
    if accepted.model != request.model:
        return f"embedding response used model {accepted.model!r}, expected {request.model!r}"
    if accepted.dimension != request.dimension:
        return (
            f"embedding response declared dimension {accepted.dimension}, "
            f"expected {request.dimension}"
        )
    if len(accepted.vectors) != len(request.texts):
        return (
            f"embedding response returned {len(accepted.vectors)} vectors for "
            f"{len(request.texts)} texts"
        )
    observed = EmbeddingProducerIdentity(
        request=expected_producer.request,
        response=EmbeddingResponseIdentity(
            model=accepted.model,
            dimension=accepted.dimension,
        ),
    )
    return _AcceptedPayload(producer=observed, vectors=accepted.vectors)


async def _embedding_worker(
    batches: trio.MemoryReceiveChannel[_EmbeddingBatch],
    *,
    transport: AsyncEmbeddingTransport,
    producer: EmbeddingProducerIdentity,
    request_timeout: timedelta,
    cache_directory: Path,
    results: dict[int, _BatchResult],
    stop: trio.Event,
    progress: ProgressReporter,
) -> None:
    async with batches:
        async for batch in batches:
            if stop.is_set():
                results[batch.index] = _BatchSkipped()
                continue
            request = EmbeddingRequest(
                endpoint_url=producer.request.endpoint_url,
                texts=tuple(card.text for card in batch.cards),
                model=producer.request.model,
                dimension=producer.request.dimension,
                timeout=request_timeout,
            )
            try:
                marker = await trio.to_thread.run_sync(
                    _begin_audit,
                    cache_directory,
                    producer.request,
                    batch.cards,
                    abandon_on_cancel=False,
                )
                outcome = await transport.embed(request)
                match outcome:
                    case EmbeddingFailed(failure=failure):
                        await trio.to_thread.run_sync(
                            _record_terminal_audit,
                            cache_directory,
                            marker,
                            _AuditFailed(failure=failure),
                            abandon_on_cancel=False,
                        )
                        results[batch.index] = _BatchFailed(failure=failure)
                        stop.set()
                        continue
                    case EmbeddingRejected(failure=failure, usage=rejected_usage):
                        usage = _AuditUsage.from_usage(rejected_usage)
                        await trio.to_thread.run_sync(
                            _record_terminal_audit,
                            cache_directory,
                            marker,
                            _AuditRejected(
                                failure=failure,
                                usage=usage,
                                cost_complete=usage is not None and usage.cost_usd is not None,
                            ),
                            abandon_on_cancel=False,
                        )
                        results[batch.index] = _BatchFailed(failure=failure)
                        stop.set()
                        continue
                    case EmbeddingAccepted() as accepted:
                        accepted_payload = _accepted_vectors(accepted, request, producer)
                        if isinstance(accepted_payload, str):
                            failure = ResponseFailure(
                                exception_type="EmbeddingTransportContractError",
                                message=accepted_payload,
                            )
                            usage = _AuditUsage.from_usage(accepted.usage)
                            await trio.to_thread.run_sync(
                                _record_terminal_audit,
                                cache_directory,
                                marker,
                                _AuditRejected(
                                    failure=failure,
                                    usage=usage,
                                    cost_complete=usage is not None and usage.cost_usd is not None,
                                ),
                                abandon_on_cancel=False,
                            )
                            results[batch.index] = _BatchInvalid(message=accepted_payload)
                            stop.set()
                            continue

                packed: dict[Sha256Hex, bytes] = {}
                entries: list[tuple[Path, _CacheEntry]] = []
                for card, vector in zip(batch.cards, accepted_payload.vectors, strict=True):
                    vector_bytes, normalized = _normalize_vector(
                        vector,
                        dimension=producer.request.dimension,
                    )
                    entry = _CacheEntry(
                        producer=accepted_payload.producer,
                        card_hash=card.card_hash,
                        vector=normalized,
                    )
                    path = _cache_path(
                        cache_directory,
                        producer=producer,
                        card_hash=card.card_hash,
                    )
                    packed[card.card_hash] = vector_bytes
                    entries.append((path, entry))
                usage = _AuditUsage.from_usage(accepted.usage)
                audit_outcome = _AuditAccepted(
                    producer=accepted_payload.producer,
                    usage=usage,
                    cost_complete=usage is not None and usage.cost_usd is not None,
                    entries=tuple(entry for _, entry in entries),
                )
                await trio.to_thread.run_sync(
                    _record_accepted_audit,
                    cache_directory,
                    marker,
                    audit_outcome,
                    tuple(entries),
                    abandon_on_cancel=False,
                )
                progress.advance(len(batch.cards))
                results[batch.index] = _BatchAccepted(vectors=packed)
            except (
                EmbeddingCacheError,
                EmbeddingTransportContractError,
                OSError,
                RuntimeError,
                TypeError,
                ValueError,
            ) as error:
                results[batch.index] = _BatchErrored(error=error)
                stop.set()


def _merge_batch_results(
    batches: Sequence[_EmbeddingBatch],
    results: Mapping[int, _BatchResult],
) -> dict[Sha256Hex, bytes]:
    acquired: dict[Sha256Hex, bytes] = {}
    for batch in batches:
        result = results.get(batch.index)
        if result is None:
            raise RuntimeError(f"embedding worker omitted batch {batch.index}")
        match result:
            case _BatchAccepted(vectors=vectors):
                acquired.update(vectors)
            case _BatchFailed(failure=failure):
                raise EmbeddingAcquisitionError(failure)
            case _BatchInvalid(message=message):
                raise EmbeddingTransportContractError(message)
            case _BatchErrored(error=error):
                raise error
            case _BatchSkipped():
                continue
    return acquired


async def _acquire_missing(
    cards: Sequence[_CardText],
    *,
    transport: AsyncEmbeddingTransport,
    config: GridRunConfig,
    producer: EmbeddingProducerIdentity,
    cache_directory: Path,
    maximum_concurrency: int,
    progress: ProgressReporter,
) -> dict[Sha256Hex, bytes]:
    embedding = config.embedding
    if embedding is None or embedding.dimension is None:
        raise EmbeddingConfigurationError(
            "grid embedding configuration requires an explicit dimension"
        )
    batches = _batches(cards, batch_size=embedding.batch_size)
    results: dict[int, _BatchResult] = {}
    stop = trio.Event()
    send, receive = trio.open_memory_channel[_EmbeddingBatch](maximum_concurrency)
    worker_count = min(maximum_concurrency, len(batches))
    async with trio.open_nursery() as nursery:
        for _ in range(worker_count):
            nursery.start_soon(
                partial(
                    _embedding_worker,
                    transport=transport,
                    producer=producer,
                    request_timeout=embedding.request_timeout,
                    cache_directory=cache_directory,
                    results=results,
                    stop=stop,
                    progress=progress,
                ),
                receive.clone(),
            )
        await receive.aclose()
        async with send:
            for batch in batches:
                await send.send(batch)

    return _merge_batch_results(batches, results)


async def _load_inputs(
    config_path: Path,
    deck_directory: Path,
) -> tuple[LoadedConfig, VerifiedDeck]:
    loaded_config: LoadedConfig | None = None
    deck: VerifiedDeck | None = None

    async def load_config_task() -> None:
        nonlocal loaded_config
        loaded_config = await load_config_async(config_path)

    async def load_deck_task() -> None:
        nonlocal deck
        deck = await load_deck_async(deck_directory)

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_config_task)
        nursery.start_soon(load_deck_task)
    if loaded_config is None or deck is None:
        raise RuntimeError("parallel embedding input loading did not complete")
    return loaded_config, deck


async def embed_grid_async(
    *,
    config_path: Path,
    deck_directory: Path,
    output_path: Path,
    cache_directory: Path,
    transport: AsyncEmbeddingTransport | None = None,
    maximum_concurrency: int = 4,
    progress: ProgressReporter = NO_PROGRESS,
) -> EmbeddingRun:
    """Build or validate the production-grid embedding artifact.

    The caller retains ownership of an injected `transport`. When misses exist
    and no transport is supplied, this function reads `OPENROUTER_API_KEY`,
    creates one OpenRouter adapter, and closes it before returning.

    Args:
        config_path: Strict grid YAML configuration.
        deck_directory: Verified `relation.concat` card artifact.
        output_path: Final embedding Parquet path.
        cache_directory: Private content-addressed embedding cache root.
        transport: Optional caller-owned provider-neutral transport.
        maximum_concurrency: Maximum simultaneous embedding batches.
        progress: Reporter for durable unique-card completion.

    Returns:
        The validated artifact and exact cache/network accounting.

    Raises:
        EmbeddingConfigurationError: Embedding configuration is incomplete.
        EmbeddingBudgetExceededError: Misses exceed `max_texts`.
        EmbeddingCacheError: A cache record is corrupt or disagrees.
        EmbeddingAcquisitionError: The transport returns an explicit failure.
        EmbeddingTransportContractError: An accepted response disagrees with
            its request or cannot be represented as finite float32.
        ValueError: Verified inputs or an existing artifact disagree.

    """
    if isinstance(maximum_concurrency, bool) or maximum_concurrency <= 0:
        raise ValueError("maximum_concurrency must be positive")

    loaded_config, deck = await _load_inputs(config_path, deck_directory)
    config = loaded_config.grid()
    embedding = config.embedding
    if embedding is None or embedding.dimension is None:
        raise EmbeddingConfigurationError(
            "grid embedding configuration requires an explicit dimension"
        )
    producer = _configured_producer(embedding)
    endpoint_url = producer.request.endpoint_url
    cards = _eligible_cards(deck)
    unique_cards = _unique_card_texts(cards)
    source_hashes = _source_hashes(loaded_config, deck)

    output_exists, sidecar_exists = await trio.to_thread.run_sync(
        _artifact_presence,
        output_path,
        abandon_on_cancel=False,
    )
    if output_exists != sidecar_exists:
        raise ValueError("embedding artifact and metadata must either both exist or both be absent")
    if output_exists:
        artifact = await load_embeddings_async(
            output_path,
            expected_source_hashes=source_hashes,
            expected_producer=producer,
        )
        _validate_artifact(artifact, cards=cards, dimension=embedding.dimension)
        return EmbeddingRun(
            artifact=artifact,
            relation_count=len(cards),
            unique_card_count=len(unique_cards),
            cache_hits=0,
            network_texts=0,
            reused_artifact=True,
        )

    progress.phase("embedding cards", total=len(unique_cards))
    await trio.to_thread.run_sync(
        _recover_audit,
        cache_directory,
        frozenset(card.card_hash for card in unique_cards),
        abandon_on_cancel=False,
    )
    cached, misses = await trio.to_thread.run_sync(
        partial(
            _cache_snapshot,
            producer=producer,
        ),
        cache_directory,
        unique_cards,
        abandon_on_cancel=False,
    )
    if cached:
        progress.advance(len(cached))
    _check_miss_budget(misses, embedding.max_texts)

    acquired: dict[Sha256Hex, bytes] = {}
    if misses:
        if transport is None:
            if embedding.api_key_env != _OPENROUTER_API_KEY_ENV:
                raise EmbeddingConfigurationError(
                    "automatic OpenRouter transport requires "
                    f"api_key_env={_OPENROUTER_API_KEY_ENV!r}"
                )
            settings = OpenRouterSettings()
            owned_transport = OpenRouterEmbeddingTransport(
                settings.api_key.get_secret_value(),
                maximum_batch_size=embedding.batch_size,
                server_url=openrouter_embedding_server_url(endpoint_url),
            )
            try:
                acquired = await _acquire_missing(
                    misses,
                    transport=owned_transport,
                    config=config,
                    producer=producer,
                    cache_directory=cache_directory,
                    maximum_concurrency=maximum_concurrency,
                    progress=progress,
                )
            finally:
                await close_owned_transport(owned_transport)
        else:
            acquired = await _acquire_missing(
                misses,
                transport=transport,
                config=config,
                producer=producer,
                cache_directory=cache_directory,
                maximum_concurrency=maximum_concurrency,
                progress=progress,
            )

    vectors = cached | acquired
    if len(vectors) != len(unique_cards):
        raise RuntimeError(
            f"embedding acquisition produced {len(vectors)} unique cards, "
            f"expected {len(unique_cards)}"
        )
    rows = tuple(
        EmbeddingRow(
            relation_id=card.relation_id,
            card_hash=card.card_hash,
            dimension=embedding.dimension,
            vector_f32_le=vectors[card.card_hash],
        )
        for card in cards
    )
    artifact = await write_embeddings_async(
        output_path,
        rows,
        producer=producer,
        source_hashes=source_hashes,
    )
    return EmbeddingRun(
        artifact=artifact,
        relation_count=len(cards),
        unique_card_count=len(unique_cards),
        cache_hits=len(cached),
        network_texts=len(misses),
        reused_artifact=False,
    )


def embed_grid(
    *,
    config_path: Path,
    deck_directory: Path,
    output_path: Path,
    cache_directory: Path,
    transport: AsyncEmbeddingTransport | None = None,
    maximum_concurrency: int = 4,
    progress: ProgressReporter = NO_PROGRESS,
) -> EmbeddingRun:
    """Run `embed_grid_async` in a fresh Trio event loop."""
    operation = partial(
        embed_grid_async,
        config_path=config_path,
        deck_directory=deck_directory,
        output_path=output_path,
        cache_directory=cache_directory,
        transport=transport,
        maximum_concurrency=maximum_concurrency,
        progress=progress,
    )
    return trio.run(operation)
