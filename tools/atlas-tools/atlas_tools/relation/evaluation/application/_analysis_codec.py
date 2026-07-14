"""Implement normalized rows and deterministic byte encodings for analysis artifacts."""

import hashlib
import io
import json
import os
import tempfile
import zipfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Literal, Self

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, NonNegativeInt, PositiveInt, ValidationError

from atlas_tools.relation.evaluation.analysis.api import (
    EmbeddingRow,
    OutOfFoldPrediction,
    PlacementPosterior,
    PlacementTally,
    SoftLabel,
    placement_posterior,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    NonEmptyStr,
    Probability,
    RelationFamilyId,
    RelationId,
    RelationNamespace,
    Sha256Hex,
)

type FloatArray = NDArray[np.float64]

CLASSIFIER_METADATA_FILENAME = "classifier.json"
CLASSIFIER_ARRAYS_FILENAME = "arrays.npz"
CLASSIFIER_OUT_OF_FOLD_FILENAME = "out-of-fold.parquet"
ORDERING_ALGORITHM = "relation-id-ascending-v1"
PARQUET_ALGORITHM = "pyarrow-parquet-zstd-3-no-dictionary-v1"

_PARQUET_ROW_GROUP_SIZE = 65_536
_NPZ_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
_NPZ_MODE = 0o600


class _DiskModel(BaseModel):
    """Reject coercion and extra columns at every decoded row boundary."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class SoftLabelDiskRow(_DiskModel):
    """Store only independent soft-label fields; posterior values are derived."""

    relation_id: RelationId
    card_hash: CardHash
    producer: RelationNamespace
    family_id: RelationFamilyId | None
    prescreen_stratum: NonEmptyStr
    coincident_votes: NonNegativeInt
    proximal_votes: NonNegativeInt
    overlay_votes: NonNegativeInt
    unclear_votes: NonNegativeInt
    abstentions: NonNegativeInt
    refined: bool
    review: bool

    @classmethod
    def from_label(cls, label: SoftLabel) -> Self:
        """Normalize a validated label for its on-disk schema."""
        return cls(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            producer=label.producer,
            family_id=label.family_id,
            prescreen_stratum=label.prescreen_stratum,
            coincident_votes=label.tally.coincident,
            proximal_votes=label.tally.proximal,
            overlay_votes=label.tally.overlay,
            unclear_votes=label.unclear_votes,
            abstentions=label.abstentions,
            refined=label.refined,
            review=label.review,
        )

    def to_label(self) -> SoftLabel:
        """Reconstruct and validate every derived soft-label invariant."""
        tally = PlacementTally(
            coincident=self.coincident_votes,
            proximal=self.proximal_votes,
            overlay=self.overlay_votes,
        )
        return SoftLabel(
            relation_id=self.relation_id,
            card_hash=self.card_hash,
            producer=self.producer,
            family_id=self.family_id,
            prescreen_stratum=self.prescreen_stratum,
            tally=tally,
            unclear_votes=self.unclear_votes,
            abstentions=self.abstentions,
            posterior=placement_posterior(tally),
            refined=self.refined,
            review=self.review,
        )


class EmbeddingDiskRow(_DiskModel):
    """Store one packed little-endian float32 embedding."""

    relation_id: RelationId
    card_hash: CardHash
    encoding: Literal["f32-le-v1"]
    dimension: PositiveInt
    vector_f32_le: bytes

    @classmethod
    def from_embedding(cls, row: EmbeddingRow) -> Self:
        """Project an embedding into the explicit Parquet row contract."""
        return cls(
            relation_id=row.relation_id,
            card_hash=row.card_hash,
            encoding=row.encoding,
            dimension=row.dimension,
            vector_f32_le=row.vector_f32_le,
        )

    def to_embedding(self) -> EmbeddingRow:
        """Validate packed bytes through the analysis embedding contract."""
        return EmbeddingRow(
            relation_id=self.relation_id,
            card_hash=self.card_hash,
            encoding=self.encoding,
            dimension=self.dimension,
            vector_f32_le=self.vector_f32_le,
        )


class OutOfFoldDiskRow(_DiskModel):
    """Flatten one held-out prediction into fixed class-order columns."""

    relation_id: RelationId
    card_hash: CardHash
    family_id: RelationFamilyId
    fold: NonNegativeInt
    applicability: Probability
    distance: float
    logit_coincident: float
    logit_proximal: float
    logit_overlay: float
    raw_coincident: Probability
    raw_proximal: Probability
    raw_overlay: Probability
    calibrated_coincident: Probability
    calibrated_proximal: Probability
    calibrated_overlay: Probability

    @classmethod
    def from_prediction(cls, row: OutOfFoldPrediction) -> Self:
        """Flatten class tuples without relying on positional foreign schemas."""
        return cls(
            relation_id=row.relation_id,
            card_hash=row.card_hash,
            family_id=row.family_id,
            fold=row.fold,
            applicability=row.applicability,
            distance=row.distance,
            logit_coincident=row.logits[0],
            logit_proximal=row.logits[1],
            logit_overlay=row.logits[2],
            raw_coincident=row.raw.coincident,
            raw_proximal=row.raw.proximal,
            raw_overlay=row.raw.overlay,
            calibrated_coincident=row.calibrated.coincident,
            calibrated_proximal=row.calibrated.proximal,
            calibrated_overlay=row.calibrated.overlay,
        )

    def to_prediction(self) -> OutOfFoldPrediction:
        """Rebuild the strict held-out prediction model."""
        return OutOfFoldPrediction(
            relation_id=self.relation_id,
            card_hash=self.card_hash,
            family_id=self.family_id,
            fold=self.fold,
            applicability=self.applicability,
            distance=self.distance,
            logits=(
                self.logit_coincident,
                self.logit_proximal,
                self.logit_overlay,
            ),
            raw=PlacementPosterior(
                coincident=self.raw_coincident,
                proximal=self.raw_proximal,
                overlay=self.raw_overlay,
            ),
            calibrated=PlacementPosterior(
                coincident=self.calibrated_coincident,
                proximal=self.calibrated_proximal,
                overlay=self.calibrated_overlay,
            ),
        )


SOFT_LABEL_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("producer", pa.string(), nullable=False),
        pa.field("family_id", pa.string(), nullable=True),
        pa.field("prescreen_stratum", pa.string(), nullable=False),
        pa.field("coincident_votes", pa.int64(), nullable=False),
        pa.field("proximal_votes", pa.int64(), nullable=False),
        pa.field("overlay_votes", pa.int64(), nullable=False),
        pa.field("unclear_votes", pa.int64(), nullable=False),
        pa.field("abstentions", pa.int64(), nullable=False),
        pa.field("refined", pa.bool_(), nullable=False),
        pa.field("review", pa.bool_(), nullable=False),
    ]
)

EMBEDDING_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("encoding", pa.string(), nullable=False),
        pa.field("dimension", pa.int32(), nullable=False),
        pa.field("vector_f32_le", pa.binary(), nullable=False),
    ]
)

OUT_OF_FOLD_SCHEMA = pa.schema(
    [
        pa.field("relation_id", pa.string(), nullable=False),
        pa.field("card_hash", pa.string(), nullable=False),
        pa.field("family_id", pa.string(), nullable=False),
        pa.field("fold", pa.int32(), nullable=False),
        pa.field("applicability", pa.float64(), nullable=False),
        pa.field("distance", pa.float64(), nullable=False),
        pa.field("logit_coincident", pa.float64(), nullable=False),
        pa.field("logit_proximal", pa.float64(), nullable=False),
        pa.field("logit_overlay", pa.float64(), nullable=False),
        pa.field("raw_coincident", pa.float64(), nullable=False),
        pa.field("raw_proximal", pa.float64(), nullable=False),
        pa.field("raw_overlay", pa.float64(), nullable=False),
        pa.field("calibrated_coincident", pa.float64(), nullable=False),
        pa.field("calibrated_proximal", pa.float64(), nullable=False),
        pa.field("calibrated_overlay", pa.float64(), nullable=False),
    ]
)

ARRAY_SCHEMA = {
    "applicability_inverse_scales": {"dtype": "<f8", "shape": ["dimension"]},
    "applicability_mean": {"dtype": "<f8", "shape": ["dimension"]},
    "applicability_training_distances": {
        "dtype": "<f8",
        "shape": ["training_cards"],
    },
    "coefficients": {"dtype": "<f8", "shape": [3, "dimension"]},
    "intercepts": {"dtype": "<f8", "shape": [3]},
}

_ARTIFACT_METADATA_FIELDS = {
    "algorithm_hash": "sha256",
    "algorithms": "map[string,string]",
    "artifact": "non-empty-string",
    "content_hashes": "map[string,sha256]",
    "metadata_hash": "computed-sha256",
    "schema_hashes": "map[string,sha256]",
    "schema_version": "literal[1]",
    "source_hashes": "map[string,sha256]",
}

SOFT_LABEL_METADATA_SCHEMA = {
    "artifact": "relation-soft-labels",
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "relation_order_hash": "sha256",
        "rows": "positive-int",
    },
    "schema_version": 1,
}

EMBEDDING_METADATA_SCHEMA = {
    "artifact": "relation-embeddings",
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "dimension": "positive-int",
        "embedding_model": "non-empty-string",
        "relation_order_hash": "sha256",
        "rows": "positive-int",
        "vector_encoding": "literal[f32-le-v1]",
    },
    "schema_version": 1,
}

METADATA_SCHEMA = {
    "artifact": "relation-policy-classifier",
    "content": [
        CLASSIFIER_ARRAYS_FILENAME,
        CLASSIFIER_OUT_OF_FOLD_FILENAME,
    ],
    "fields": {
        **_ARTIFACT_METADATA_FIELDS,
        "classes": "tuple[coincident,proximal,overlay]",
        "config": "classifier-config-v1",
        "embedding_dimension": "positive-int",
        "fold_assignment_hash": "sha256",
        "metrics": "classifier-metrics-v1",
        "model_iterations": "positive-int",
        "relation_order_hash": "sha256",
        "rows": "positive-int",
        "temperature": "positive-finite-float64",
    },
    "schema_version": 1,
}


def canonical_json_bytes(value: object) -> bytes:
    """Serialize a model or JSON-compatible value with one canonical encoding."""
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def sha256_bytes(payload: bytes) -> Sha256Hex:
    """Return the lowercase SHA-256 digest of immutable bytes."""
    return hashlib.sha256(payload).hexdigest()


def schema_hash(schema: pa.Schema | Mapping[str, object]) -> Sha256Hex:
    """Hash a normalized Arrow or structured-array schema descriptor."""
    if isinstance(schema, pa.Schema):
        descriptor = [
            {
                "name": field.name,
                "nullable": field.nullable,
                "type": str(field.type),
            }
            for field in schema
        ]
        return sha256_bytes(canonical_json_bytes(descriptor))
    return sha256_bytes(canonical_json_bytes(dict(schema)))


def relation_order_hash(
    rows: Sequence[SoftLabel | EmbeddingRow | OutOfFoldPrediction],
) -> Sha256Hex:
    """Hash relation and card identities in their durable row order."""
    identities = [[row.relation_id, row.card_hash] for row in rows]
    return sha256_bytes(canonical_json_bytes(identities))


def fold_assignment_hash(rows: Sequence[OutOfFoldPrediction]) -> Sha256Hex:
    """Hash held-out fold assignments in durable relation order."""
    assignments = [[row.relation_id, row.fold] for row in rows]
    return sha256_bytes(canonical_json_bytes(assignments))


def require_exact_mapping(
    observed: Mapping[str, str],
    expected: Mapping[str, str],
    *,
    label: str,
) -> None:
    """Require a metadata mapping to equal its supported contract."""
    if dict(observed) != dict(expected):
        raise ValueError(f"{label} does not match the supported artifact contract")


def verify_content_hashes(
    observed: Mapping[str, Sha256Hex],
    payloads: Mapping[str, bytes],
) -> None:
    """Require content names and hashes to equal the supplied durable bytes."""
    expected = {name: sha256_bytes(payload) for name, payload in payloads.items()}
    if dict(observed) != expected:
        raise ValueError("artifact content hashes do not match durable bytes")


def verify_expected_sources(
    observed: Mapping[str, Sha256Hex],
    expected: Mapping[str, Sha256Hex] | None,
) -> None:
    """Require exact source provenance when a caller supplies an expectation."""
    if expected is not None and dict(observed) != dict(expected):
        raise ValueError("artifact source hashes do not match expected inputs")


def ordered_rows[RowT](
    rows: Sequence[RowT],
    relation_id: Callable[[RowT], RelationId],
) -> tuple[RowT, ...]:
    """Sort non-empty rows by unique relation identity."""
    ordered = tuple(sorted(rows, key=relation_id))
    if not ordered:
        raise ValueError("analysis artifacts must contain at least one row")
    identifiers = tuple(relation_id(row) for row in ordered)
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("analysis artifact repeats a relation ID")
    return ordered


def require_canonical_order(relation_ids: Sequence[RelationId]) -> None:
    """Require non-empty, unique relation IDs in ascending order."""
    if not relation_ids:
        raise ValueError("analysis artifacts must contain at least one row")
    if len(set(relation_ids)) != len(relation_ids):
        raise ValueError("analysis artifact repeats a relation ID")
    if tuple(relation_ids) != tuple(sorted(relation_ids)):
        raise ValueError("analysis artifact rows are not in canonical relation order")


def sidecar_path(path: Path) -> Path:
    """Return the manifest path published after a table is durable."""
    return path.with_name(f"{path.name}.meta.json")


def atomic_replace(path: Path, payload: bytes) -> None:
    """Replace one file durably, publishing its directory entry last.

    Raises:
        OSError: Creating, syncing, or replacing the destination fails.

    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            _write_complete(output.write, temporary, payload)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _write_complete(write: Callable[[bytes], int], path: Path, payload: bytes) -> None:
    written = write(payload)
    if written != len(payload):
        raise OSError(f"short write to {path}: wrote {written} of {len(payload)} bytes")


def read_bytes(path: Path) -> bytes:
    """Read one complete artifact or report a path-qualified validation error."""
    try:
        return path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read analysis artifact {path}: {error}") from error


def model_bytes(model: BaseModel) -> bytes:
    """Encode a strict manifest deterministically with a final newline."""
    return canonical_json_bytes(model) + b"\n"


def load_model[ModelT: BaseModel](path: Path, model: type[ModelT]) -> ModelT:
    """Decode one strict JSON manifest with path-qualified diagnostics."""
    try:
        return model.model_validate_json(read_bytes(path), strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid analysis artifact metadata {path}: {error}") from error


def parquet_bytes(rows: Sequence[BaseModel], schema: pa.Schema) -> bytes:
    """Encode fixed-schema rows with deterministic writer settings."""
    table = pa.Table.from_pylist(
        [row.model_dump(mode="python") for row in rows],
        schema=schema,
    )
    output = pa.BufferOutputStream()
    pq.write_table(
        table,
        output,
        compression="zstd",
        compression_level=3,
        data_page_version="1.0",
        row_group_size=_PARQUET_ROW_GROUP_SIZE,
        use_dictionary=False,
        version="2.6",
        write_page_checksum=True,
        write_page_index=False,
        write_statistics=False,
    )
    return output.getvalue().to_pybytes()


def read_parquet(path: Path, payload: bytes, schema: pa.Schema) -> pa.Table:
    """Decode Parquet and require exact names, order, types, and nullability."""
    try:
        table = pq.read_table(pa.BufferReader(payload))
    except pa.ArrowException as error:
        raise ValueError(f"invalid Parquet artifact {path}: {error}") from error
    if not table.schema.equals(schema, check_metadata=True):
        raise ValueError(f"Parquet schema mismatch in {path}")
    return table


def decode_rows[RowT: BaseModel](
    path: Path,
    table: pa.Table,
    model: type[RowT],
) -> tuple[RowT, ...]:
    """Validate every Arrow record through its strict row model."""
    rows: list[RowT] = []
    for index, record in enumerate(table.to_pylist()):
        try:
            rows.append(model.model_validate(record, strict=True))
        except ValidationError as error:
            raise ValueError(f"invalid row {index} in {path}: {error}") from error
    return tuple(rows)


def immutable_float64(array: FloatArray) -> FloatArray:
    """Copy an array behind immutable bytes so writeability cannot be restored."""
    contiguous = np.ascontiguousarray(array, dtype="<f8")
    payload = contiguous.tobytes(order="C")
    return np.frombuffer(payload, dtype="<f8").reshape(contiguous.shape)


def deterministic_npz(arrays: Mapping[str, FloatArray]) -> bytes:
    """Encode little-endian float64 arrays in a timestamp-free NPZ container."""
    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_STORED) as archive:
        for name in sorted(arrays):
            array = np.ascontiguousarray(arrays[name], dtype="<f8")
            member = io.BytesIO()
            np.lib.format.write_array(member, array, allow_pickle=False)
            information = zipfile.ZipInfo(f"{name}.npy", date_time=_NPZ_TIMESTAMP)
            information.compress_type = zipfile.ZIP_STORED
            information.create_system = 3
            information.external_attr = _NPZ_MODE << 16
            archive.writestr(information, member.getvalue())
    return output.getvalue()


def _decode_deterministic_npz(payload: bytes) -> dict[str, FloatArray]:
    expected = tuple(f"{name}.npy" for name in sorted(ARRAY_SCHEMA))
    arrays: dict[str, FloatArray] = {}
    with zipfile.ZipFile(io.BytesIO(payload), mode="r") as archive:
        information = archive.infolist()
        observed = tuple(item.filename for item in information)
        if observed != expected or len(set(observed)) != len(observed):
            raise ValueError(f"NPZ members differ from the classifier schema: {observed}")
        for item in information:
            if item.compress_type != zipfile.ZIP_STORED:
                raise ValueError(f"NPZ member {item.filename} uses an unexpected codec")
            name = item.filename.removesuffix(".npy")
            member = io.BytesIO(archive.read(item))
            decoded = np.lib.format.read_array(member, allow_pickle=False)
            if decoded.dtype != np.dtype("<f8"):
                raise ValueError(f"NPZ member {name} must use little-endian float64")
            if not np.isfinite(decoded).all():
                raise ValueError(f"NPZ member {name} contains non-finite values")
            arrays[name] = immutable_float64(decoded)
    return arrays


def read_deterministic_npz(path: Path, payload: bytes) -> dict[str, FloatArray]:
    """Decode the exact numeric member set without permitting pickle data."""
    try:
        arrays = _decode_deterministic_npz(payload)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        raise ValueError(f"invalid classifier arrays {path}: {error}") from error
    return arrays
