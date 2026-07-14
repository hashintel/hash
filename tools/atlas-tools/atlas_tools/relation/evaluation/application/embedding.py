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
from datetime import timedelta
from functools import partial
from pathlib import Path
from typing import IO, Literal, Self
from urllib.parse import urlsplit, urlunsplit

import trio
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    ValidationError,
    field_validator,
    model_validator,
)

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.evaluation.analysis.api import EmbeddingRow
from atlas_tools.relation.evaluation.application._lifetime import close_owned_transport
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    EmbeddingsArtifact,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_embeddings_async,
    write_embeddings_async,
)
from atlas_tools.relation.evaluation.application.settings import OpenRouterSettings
from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    EvaluationCard,
    FiniteFloat,
    GridRunConfig,
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
    AsyncEmbeddingTransport,
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingVector,
    OpenRouterEmbeddingTransport,
)

_CACHE_ENTRY_ALGORITHM = "relation-embedding-cache-f32-json-v1"
_CACHE_KEY_ALGORITHM = "relation-embedding-cache-key-v1"
_OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"
_FLOAT32_BYTES = 4


class EmbeddingConfigurationError(ValueError):
    """Report an incomplete or contradictory embedding configuration."""


class EmbeddingCacheError(ValueError):
    """Report a cache entry that cannot prove its expected identity and shape."""


class EmbeddingBudgetExceededError(RuntimeError):
    """Report that the number of cache misses exceeds the configured paid bound."""


class EmbeddingTransportContractError(RuntimeError):
    """Report an accepted transport response that disagrees with its request."""


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
    """Identify one provider-neutral cache record without path-sensitive text."""

    algorithm: Literal["relation-embedding-cache-key-v1"] = _CACHE_KEY_ALGORITHM
    model: str = Field(min_length=1)
    card_hash: Sha256Hex


class _CacheEntry(_CacheModel):
    """Bind one normalized vector to its exact model, card, and dimension."""

    schema_version: Literal[1] = 1
    algorithm: Literal["relation-embedding-cache-f32-json-v1"] = _CACHE_ENTRY_ALGORITHM
    model: str = Field(min_length=1)
    card_hash: Sha256Hex
    dimension: PositiveInt
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
        if len(self.vector) != self.dimension:
            raise ValueError(
                f"cached embedding has dimension {len(self.vector)}, expected {self.dimension}"
            )
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


def _cache_path(
    cache_directory: Path,
    *,
    model: str,
    card_hash: Sha256Hex,
) -> Path:
    """Derive a sharded filename while omitting dimension to detect its drift."""
    key = _CacheKey(model=model, card_hash=card_hash)
    digest = hashlib.sha256(_canonical_json_bytes(key.model_dump(mode="json"))).hexdigest()
    return cache_directory / digest[:2] / f"{digest}.json"


def _validate_cache_identity(
    entry: _CacheEntry,
    *,
    path: Path,
    model: str,
    card_hash: Sha256Hex,
    dimension: int,
) -> None:
    if entry.model != model:
        raise EmbeddingCacheError(f"cached embedding model disagrees at {path}")
    if entry.card_hash != card_hash:
        raise EmbeddingCacheError(f"cached embedding card hash disagrees at {path}")
    if entry.dimension != dimension:
        raise EmbeddingCacheError(f"cached embedding dimension disagrees at {path}")


def _load_cache_entry(
    path: Path,
    *,
    model: str,
    card_hash: Sha256Hex,
    dimension: int,
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
        model=model,
        card_hash=card_hash,
        dimension=dimension,
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


def _publish_cache_entry(path: Path, entry: _CacheEntry) -> None:
    """Publish one immutable cache record or prove an identical record won."""
    existing = _load_cache_entry(
        path,
        model=entry.model,
        card_hash=entry.card_hash,
        dimension=entry.dimension,
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
                model=entry.model,
                card_hash=entry.card_hash,
                dimension=entry.dimension,
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
    try:
        packed = struct.pack(f"<{entry.dimension}f", *entry.vector)
    except (OverflowError, struct.error) as error:
        raise EmbeddingCacheError(
            "cached embedding cannot be represented as finite float32"
        ) from error
    if len(packed) != entry.dimension * _FLOAT32_BYTES:
        raise EmbeddingCacheError("cached embedding produced an invalid packed shape")
    if any(not math.isfinite(value[0]) for value in struct.iter_unpack("<f", packed)):
        raise EmbeddingCacheError("cached embedding is not finite float32")
    return packed


def _cache_snapshot(
    cache_directory: Path,
    cards: Sequence[_CardText],
    *,
    model: str,
    dimension: int,
) -> tuple[dict[Sha256Hex, bytes], tuple[_CardText, ...]]:
    hits: dict[Sha256Hex, bytes] = {}
    misses: list[_CardText] = []
    for card in cards:
        path = _cache_path(
            cache_directory,
            model=model,
            card_hash=card.card_hash,
        )
        entry = _load_cache_entry(
            path,
            model=model,
            card_hash=card.card_hash,
            dimension=dimension,
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


def _openrouter_server_url(endpoint_url: str) -> str:
    """Convert the pinned embedding operation URL into the SDK server base."""
    parsed = urlsplit(endpoint_url)
    path = parsed.path.rstrip("/")
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not path.endswith("/embeddings")
    ):
        raise EmbeddingConfigurationError(
            "embedding endpoint_url must be an HTTPS /embeddings operation URL"
        )
    base_path = path.removesuffix("/embeddings")
    return urlunsplit((parsed.scheme, parsed.netloc, base_path, "", ""))


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
) -> tuple[EmbeddingVector, ...] | str:
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
    return accepted.vectors


async def _embedding_worker(
    batches: trio.MemoryReceiveChannel[_EmbeddingBatch],
    *,
    transport: AsyncEmbeddingTransport,
    model: str,
    dimension: int,
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
                texts=tuple(card.text for card in batch.cards),
                model=model,
                dimension=dimension,
                timeout=request_timeout,
            )
            try:
                outcome = await transport.embed(request)
                match outcome:
                    case EmbeddingFailed(failure=failure) | EmbeddingRejected(failure=failure):
                        results[batch.index] = _BatchFailed(failure=failure)
                        stop.set()
                        continue
                    case EmbeddingAccepted() as accepted:
                        values = _accepted_vectors(accepted, request)
                        if isinstance(values, str):
                            results[batch.index] = _BatchInvalid(message=values)
                            stop.set()
                            continue

                packed: dict[Sha256Hex, bytes] = {}
                entries: list[tuple[Path, _CacheEntry]] = []
                for card, vector in zip(batch.cards, values, strict=True):
                    payload, normalized = _normalize_vector(vector, dimension=dimension)
                    entry = _CacheEntry(
                        model=model,
                        card_hash=card.card_hash,
                        dimension=dimension,
                        vector=normalized,
                    )
                    path = _cache_path(
                        cache_directory,
                        model=model,
                        card_hash=card.card_hash,
                    )
                    packed[card.card_hash] = payload
                    entries.append((path, entry))
                await trio.to_thread.run_sync(
                    _publish_cache_entries,
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
                    model=embedding.model,
                    dimension=embedding.dimension,
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
            expected_embedding_model=embedding.model,
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
    cached, misses = await trio.to_thread.run_sync(
        partial(
            _cache_snapshot,
            model=embedding.model,
            dimension=embedding.dimension,
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
                server_url=_openrouter_server_url(embedding.endpoint_url),
            )
            try:
                acquired = await _acquire_missing(
                    misses,
                    transport=owned_transport,
                    config=config,
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
        embedding_model=embedding.model,
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
