"""Card-embedding acquisition with a permanent by-hash cache.

The embedding endpoint is the pipeline's only network surface besides
OpenRouter votes. Each card's text is embedded once per (model, card_hash) and
cached forever; reruns hit the cache and cost nothing. The budget cap counts
only uncached texts and aborts cleanly with all prior progress preserved.

Endpoint responses, cache entries, and the parquet artifact are all validated
through models at their boundaries: a malformed response or a foreign file
fails loudly with the offending location named.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from os import PathLike, environ
from pathlib import Path
from typing import Protocol

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import requests
from numpy.typing import NDArray
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    ValidationError,
)

from atlas_tools.common import Provenance, Sha256Hex, sha256_file
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.contract import EmbeddingConfig, LoadedRunConfig
from atlas_tools.relation.eval.inputs import prepare_ladder_inputs
from atlas_tools.relation_cards.common.cards import RelationId

EMBEDDINGS_SCHEMA_VERSION = 1
_HTTP_OK = 200

type EmbeddingVector = list[float]


class EmbeddingBudgetExceededError(RuntimeError):
    """The uncached-text budget cap stopped the run; cached progress is kept."""


class EmbeddingTransport(Protocol):
    """One visible embedding request for an ordered batch of texts."""

    def embed(self, texts: Sequence[str]) -> list[EmbeddingVector]: ...


class _EmbeddingDatum(BaseModel):
    """One vector of an OpenAI-compatible ``/embeddings`` response."""

    index: NonNegativeInt
    embedding: EmbeddingVector = Field(min_length=1)

    model_config = ConfigDict(extra="allow", frozen=True)


class _EmbeddingResponse(BaseModel):
    data: list[_EmbeddingDatum]

    model_config = ConfigDict(extra="allow", frozen=True)


@dataclass(frozen=True)
class HttpEmbeddingTransport:
    """OpenAI-compatible ``/embeddings`` client for the configured endpoint."""

    config: EmbeddingConfig

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key_env is not None:
            api_key = environ.get(self.config.api_key_env, "")
            if not api_key.strip():
                raise ValueError(
                    f"embedding endpoint requires the {self.config.api_key_env} "
                    "environment variable"
                )
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    def embed(self, texts: Sequence[str]) -> list[EmbeddingVector]:
        response = requests.post(
            self.config.endpoint_url,
            json={"model": self.config.model, "input": list(texts)},
            headers=self._headers(),
            timeout=self.config.request_timeout.total_seconds(),
        )
        if response.status_code != _HTTP_OK:
            raise ValueError(
                f"embedding endpoint returned HTTP {response.status_code}: {response.text[:500]}"
            )
        try:
            payload = _EmbeddingResponse.model_validate_json(response.content)
        except ValidationError as error:
            raise ValueError(f"embedding endpoint returned a malformed response: {error}") from (
                error
            )
        if sorted(datum.index for datum in payload.data) != list(range(len(texts))):
            raise ValueError("embedding endpoint response indices do not cover the request batch")
        ordered = sorted(payload.data, key=lambda datum: datum.index)
        return [datum.embedding for datum in ordered]


class CachedEmbedding(BaseModel):
    """The durable per-(model, card_hash) cache entry."""

    card_hash: Sha256Hex
    model: str = Field(min_length=1)
    vector: EmbeddingVector = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)


def _model_cache_dir(cache_dir: Path, model: str) -> Path:
    slug = re.sub(r"[^a-z0-9._-]+", "-", model.casefold()).strip("-")
    if not slug:
        raise ValueError(f"embedding model name {model!r} yields an empty cache slug")
    return cache_dir / slug


def _load_cached(path: Path, *, card_hash: Sha256Hex, model: str) -> EmbeddingVector | None:
    if not path.is_file():
        return None
    try:
        cached = CachedEmbedding.model_validate_json(path.read_bytes())
    except ValidationError as error:
        raise ValueError(f"corrupt embedding cache entry {path}: {error}") from error
    if cached.card_hash != card_hash or cached.model != model:
        raise ValueError(f"embedding cache entry {path} does not match its key")
    return cached.vector


class EmbeddingsDetails(BaseModel):
    """Sidecar details recording the embedding model, version, and shape."""

    schema_version: PositiveInt = EMBEDDINGS_SCHEMA_VERSION
    rows: PositiveInt
    dimension: PositiveInt
    embedding_model: str = Field(min_length=1)
    endpoint_url: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)


EmbeddingsProvenance = Provenance[EmbeddingsDetails]


@dataclass(frozen=True)
class EmbeddingTable:
    """Validated embeddings in row order, with an index by card hash."""

    relation_ids: tuple[RelationId, ...]
    card_hashes: tuple[Sha256Hex, ...]
    matrix: NDArray[np.float32]
    details: EmbeddingsDetails

    def row_by_card_hash(self, card_hash: Sha256Hex) -> NDArray[np.float32] | None:
        try:
            return self.matrix[self.card_hashes.index(card_hash)]
        except ValueError:
            return None


class _EmbeddingParquetRow(BaseModel):
    """The embeddings parquet row contract."""

    relation_id: RelationId
    card_hash: Sha256Hex
    vector: EmbeddingVector = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)


def read_embeddings(path: Path) -> EmbeddingTable:
    """Read and revalidate an embeddings parquet plus its provenance sidecar."""
    sidecar_path = path.with_name(f"{path.name}.meta.json")
    try:
        details = EmbeddingsProvenance.load(sidecar_path).details
        records = pq.read_table(path).to_pylist()
    except (OSError, ValidationError, pa.ArrowInvalid) as error:
        raise ValueError(f"cannot read embeddings {path}: {error}") from error
    rows: list[_EmbeddingParquetRow] = []
    for index, record in enumerate(records):
        try:
            rows.append(_EmbeddingParquetRow.model_validate(record))
        except ValidationError as error:
            raise ValueError(f"invalid embedding row {index} in {path}: {error}") from error
    if len(rows) != details.rows:
        raise ValueError(f"embeddings {path} row count does not match its sidecar")
    if any(len(row.vector) != details.dimension for row in rows):
        raise ValueError(f"embeddings {path} contain vectors off the sidecar dimension")
    return EmbeddingTable(
        relation_ids=tuple(row.relation_id for row in rows),
        card_hashes=tuple(row.card_hash for row in rows),
        matrix=np.asarray([row.vector for row in rows], dtype=np.float32),
        details=details,
    )


@dataclass(frozen=True)
class EmbedResult:
    embeddings_parquet: Path
    sidecar: Path
    rows: int
    dimension: int
    requested_texts: int
    cached_texts: int


def _validate_dimension(
    vectors: Sequence[EmbeddingVector],
    *,
    expected: int | None,
) -> int:
    dimensions = {len(vector) for vector in vectors}
    if len(dimensions) != 1:
        raise ValueError(f"embedding vectors have inconsistent dimensions: {sorted(dimensions)}")
    dimension = dimensions.pop()
    if expected is not None and dimension != expected:
        raise ValueError(f"embedding dimension {dimension} does not match configured {expected}")
    return dimension


def embed_cards(
    *,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    out_path: PathLike,
    cache_dir: PathLike,
    transport: EmbeddingTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> EmbedResult:
    """Embed every eligible card once per (model, card_hash) and write parquet."""
    config = loaded_config.ladder()
    if config.embedding is None:
        raise ValueError("config has no embedding section; embeddings cannot be produced")
    embedding = config.embedding
    prepared = prepare_ladder_inputs(cards_dir, loaded_config)
    if transport is None:
        transport = HttpEmbeddingTransport(config=embedding)

    model_cache = _model_cache_dir(Path(cache_dir), embedding.model)
    model_cache.mkdir(parents=True, exist_ok=True)

    vectors: dict[Sha256Hex, EmbeddingVector] = {}
    uncached = []
    for card in prepared.eligible:
        cached = _load_cached(
            model_cache / f"{card.card_hash}.json",
            card_hash=card.card_hash,
            model=embedding.model,
        )
        if cached is not None:
            vectors[card.card_hash] = cached
        else:
            uncached.append(card)

    progress.phase("embedding cards", total=len(uncached))
    budget = embedding.max_texts
    requested = 0
    for start in range(0, len(uncached), embedding.batch_size):
        batch = uncached[start : start + embedding.batch_size]
        if budget is not None and requested + len(batch) > budget:
            raise EmbeddingBudgetExceededError(
                f"embedding budget of {budget} uncached texts reached after {requested}; "
                "cached embeddings are preserved, so raising max_texts and rerunning resumes"
            )
        batch_vectors = transport.embed([card.card_text for card in batch])
        if len(batch_vectors) != len(batch):
            raise ValueError("embedding transport returned the wrong number of vectors")
        requested += len(batch)
        for card, vector in zip(batch, batch_vectors, strict=True):
            entry = CachedEmbedding(
                card_hash=card.card_hash,
                model=embedding.model,
                vector=vector,
            )
            cache_path = model_cache / f"{card.card_hash}.json"
            cache_path.write_bytes(entry.model_dump_json().encode("utf-8"))
            vectors[card.card_hash] = vector
        progress.advance(len(batch))

    ordered = [(card, vectors[card.card_hash]) for card in prepared.eligible]
    dimension = _validate_dimension(
        [vector for _, vector in ordered],
        expected=embedding.dimension,
    )
    table = pa.table(
        {
            "relation_id": pa.array([card.relation_id for card, _ in ordered], type=pa.string()),
            "card_hash": pa.array([card.card_hash for card, _ in ordered], type=pa.string()),
            "vector": pa.array([vector for _, vector in ordered], type=pa.list_(pa.float32())),
        }
    )
    output = Path(out_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, output)
    sidecar = EmbeddingsProvenance.make(
        producer="relation.ladder-embed",
        input_hashes={
            "cards.jsonl": prepared.source_hashes["cards.jsonl"],
            "judges-panel": prepared.panel_hash,
        },
        content_hashes={output.name: sha256_file(output)},
        details=EmbeddingsDetails(
            rows=len(ordered),
            dimension=dimension,
            embedding_model=embedding.model,
            endpoint_url=embedding.endpoint_url,
        ),
    ).write(output.with_name(f"{output.name}.meta.json"))
    return EmbedResult(
        embeddings_parquet=output,
        sidecar=sidecar,
        rows=len(ordered),
        dimension=dimension,
        requested_texts=requested,
        cached_texts=len(prepared.eligible) - len(uncached),
    )
