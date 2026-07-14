"""Define immutable metadata and loaded values for analysis artifacts.

The models in this module are the durable contract between pure analysis and
filesystem codecs. Metadata contains no timestamps or host paths, so identical
inputs produce identical manifest bytes. Every artifact records content,
schema, algorithm, source, and ordered card identities independently.
"""

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Self

import numpy as np
from numpy.typing import NDArray
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    ValidationInfo,
    computed_field,
    field_validator,
    model_validator,
)

from atlas_tools.relation.evaluation.analysis.api import (
    ClassifierFit,
    ClassifierMetrics,
    EmbeddingRow,
    SoftLabel,
)
from atlas_tools.relation.evaluation.domain.api import (
    PLACEMENT_CLASSES,
    ClassifierConfig,
    FrozenMapping,
    NonEmptyStr,
    PlacementClass,
    Sha256Hex,
)

type FloatArray = NDArray[np.float64]


def _hash_json(value: object) -> Sha256Hex:
    payload = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def hash_mapping(values: Mapping[str, str]) -> Sha256Hex:
    """Hash a string mapping as canonical ASCII-compatible JSON."""
    return _hash_json(dict(values))


class ArtifactMetadata(BaseModel):
    """Bind one artifact to exact schemas, algorithms, inputs, and bytes."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )

    schema_version: Literal[1] = 1
    artifact: NonEmptyStr
    schema_hashes: FrozenMapping[NonEmptyStr, Sha256Hex]
    algorithms: FrozenMapping[NonEmptyStr, NonEmptyStr]
    algorithm_hash: Sha256Hex
    source_hashes: FrozenMapping[NonEmptyStr, Sha256Hex]
    content_hashes: FrozenMapping[NonEmptyStr, Sha256Hex]

    @model_validator(mode="before")
    @classmethod
    def verify_serialized_hash(cls, value: object, information: ValidationInfo) -> object:
        """Verify and remove the computed hash before strict JSON validation."""
        if information.mode != "json" or not isinstance(value, Mapping):
            return value
        payload = dict(value)
        observed = payload.pop("metadata_hash", None)
        if observed is None:
            raise ValueError("artifact metadata is missing metadata_hash")
        if observed != _hash_json(payload):
            raise ValueError("metadata_hash does not match artifact metadata")
        return payload

    @computed_field
    @property
    def metadata_hash(self) -> Sha256Hex:
        """Hash every stored metadata field except this derived digest."""
        payload = self.model_dump(mode="json", exclude={"metadata_hash"})
        return _hash_json(payload)

    @model_validator(mode="after")
    def check_hashes(self) -> Self:
        """Reject empty provenance and an algorithm map that disagrees with its hash."""
        if not self.schema_hashes:
            raise ValueError("artifact metadata requires at least one schema hash")
        if not self.algorithms:
            raise ValueError("artifact metadata requires at least one algorithm")
        if not self.source_hashes:
            raise ValueError("artifact metadata requires at least one source hash")
        if not self.content_hashes:
            raise ValueError("artifact metadata requires at least one content hash")
        expected = hash_mapping(self.algorithms)
        if self.algorithm_hash != expected:
            raise ValueError("algorithm_hash does not match algorithms")
        return self


class SoftLabelsMetadata(ArtifactMetadata):
    """Describe a canonical soft-label Parquet artifact."""

    artifact: Literal["relation-soft-labels"] = "relation-soft-labels"
    rows: PositiveInt
    relation_order_hash: Sha256Hex


class EmbeddingsMetadata(ArtifactMetadata):
    """Describe packed embeddings in canonical relation order."""

    artifact: Literal["relation-embeddings"] = "relation-embeddings"
    rows: PositiveInt
    relation_order_hash: Sha256Hex
    embedding_model: NonEmptyStr
    dimension: PositiveInt
    vector_encoding: Literal["f32-le-v1"] = "f32-le-v1"


class ClassifierBundleMetadata(ArtifactMetadata):
    """Describe all files and scalar contracts in a classifier bundle."""

    artifact: Literal["relation-policy-classifier"] = "relation-policy-classifier"
    rows: PositiveInt
    relation_order_hash: Sha256Hex
    fold_assignment_hash: Sha256Hex
    classes: tuple[PlacementClass, PlacementClass, PlacementClass] = (
        "coincident",
        "proximal",
        "overlay",
    )
    embedding_dimension: PositiveInt
    model_iterations: PositiveInt
    temperature: float = Field(gt=0.0, allow_inf_nan=False)
    config: ClassifierConfig
    metrics: ClassifierMetrics

    @field_validator("classes", mode="before")
    @classmethod
    def normalize_json_classes(cls, value: object) -> object:
        """Normalize the JSON array after base metadata hash verification."""
        return tuple(value) if isinstance(value, list) else value

    @model_validator(mode="after")
    def check_training_contract(self) -> Self:
        """Cross-check dimensions and counts duplicated across bundle components."""
        if self.classes != PLACEMENT_CLASSES:
            raise ValueError("classifier metadata uses an unexpected class order")
        if self.rows != self.metrics.training_cards:
            raise ValueError("classifier row count does not match its metrics")
        if self.config.folds != self.metrics.folds:
            raise ValueError("classifier fold count does not match its metrics")
        if self.config.folds > self.rows:
            raise ValueError("classifier cannot have more folds than training rows")
        if self.model_iterations > self.config.max_iterations:
            raise ValueError("final model iterations exceed the configured maximum")
        if self.metrics.max_fold_iterations > self.config.max_iterations:
            raise ValueError("fold iterations exceed the configured maximum")
        return self


@dataclass(frozen=True, slots=True, kw_only=True)
class SoftLabelsArtifact:
    """Return validated soft labels together with their durable identity."""

    path: Path
    sidecar_path: Path
    metadata: SoftLabelsMetadata
    rows: tuple[SoftLabel, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingsArtifact:
    """Return validated packed embeddings and their durable identity."""

    path: Path
    sidecar_path: Path
    metadata: EmbeddingsMetadata
    rows: tuple[EmbeddingRow, ...]


@dataclass(frozen=True, slots=True, kw_only=True, eq=False)
class ClassifierArrays:
    """Hold immutable views of every numeric array in a classifier bundle."""

    coefficients: FloatArray
    intercepts: FloatArray
    applicability_mean: FloatArray
    applicability_inverse_scales: FloatArray
    applicability_training_distances: FloatArray

    def __post_init__(self) -> None:
        """Require callers to receive arrays that cannot be made writeable."""
        arrays = (
            self.coefficients,
            self.intercepts,
            self.applicability_mean,
            self.applicability_inverse_scales,
            self.applicability_training_distances,
        )
        if any(array.flags.writeable for array in arrays):
            raise ValueError("classifier arrays must be immutable")


@dataclass(frozen=True, slots=True, kw_only=True)
class ClassifierBundle:
    """Return a fully cross-validated classifier bundle."""

    directory: Path
    metadata_path: Path
    arrays_path: Path
    out_of_fold_path: Path
    metadata: ClassifierBundleMetadata
    fit: ClassifierFit
    arrays: ClassifierArrays
