"""Read and write Atlas's zero-copy relation-classifier artifact format."""

import hashlib
import math
import os
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Final

import numpy as np
from numpy.typing import ArrayLike, NDArray

from atlas_tools.relation.evaluation.analysis.api import PolicyClassifier
from atlas_tools.relation.evaluation.application._analysis_codec import immutable_float64
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

type FloatArray = NDArray[np.float64]

ATLAS_CLASSIFIER_DIMENSION: Final = 3_072
ATLAS_CLASSIFIER_FILENAME: Final = "classifier.salt"
ATLAS_CLASSIFIER_FORMAT_VERSION: Final = 1
ATLAS_CLASSIFIER_ARTIFACT_KIND: Final = 1

_MAGIC: Final = b"SALTMMAP"
_BYTE_ORDER_MARKER: Final = 0x0102_0304
_HEADER = struct.Struct("<8sHHIIIQ32s")
_DESCRIPTOR = struct.Struct("<HBBIQQQQQ")
_ALIGNMENT: Final = 64
_SECTION_COUNT: Final = 7
_SCALAR_U8: Final = 1
_SCALAR_F64: Final = 5
_CLASS_ORDER: Final = b"\x00\x01\x02"


@dataclass(frozen=True, slots=True, kw_only=True, eq=False)
class AtlasClassifierModel:
    """Hold the exact inference parameters persisted in ``classifier.salt``."""

    coefficients: FloatArray
    intercepts: FloatArray
    temperature: float
    applicability_mean: FloatArray
    applicability_inverse_scales: FloatArray
    applicability_training_distances: FloatArray

    def __post_init__(self) -> None:
        arrays = (
            self.coefficients,
            self.intercepts,
            self.applicability_mean,
            self.applicability_inverse_scales,
            self.applicability_training_distances,
        )
        if any(array.flags.writeable for array in arrays):
            raise ValueError("Atlas classifier arrays must be immutable")
        expected_shapes = (
            (3, ATLAS_CLASSIFIER_DIMENSION),
            (3,),
            (ATLAS_CLASSIFIER_DIMENSION,),
            (ATLAS_CLASSIFIER_DIMENSION,),
        )
        if tuple(array.shape for array in arrays[:4]) != expected_shapes:
            raise ValueError("Atlas classifier arrays do not use canonical shapes")
        if self.applicability_training_distances.ndim != 1 or not len(
            self.applicability_training_distances
        ):
            raise ValueError("Atlas classifier training distances must be a non-empty vector")
        if any(not np.isfinite(array).all() for array in arrays):
            raise ValueError("Atlas classifier arrays must be finite")
        if self.temperature <= 0.0 or not np.isfinite(self.temperature):
            raise ValueError("Atlas classifier temperature must be positive and finite")
        if np.any(self.applicability_inverse_scales <= 0.0):
            raise ValueError("Atlas classifier inverse scales must be positive")
        distances = self.applicability_training_distances
        if np.any(distances < 0.0) or np.any(distances[1:] < distances[:-1]):
            raise ValueError("Atlas classifier training distances must be non-negative and sorted")


@dataclass(frozen=True, slots=True, kw_only=True, eq=False)
class AtlasClassifierArtifact:
    """Return one fully validated Atlas classifier and its byte identity."""

    path: Path
    content_hash: Sha256Hex
    payload_hash: Sha256Hex
    model: AtlasClassifierModel


@dataclass(frozen=True, slots=True, kw_only=True)
class _Section:
    identifier: int
    scalar: int
    shape: tuple[int, ...]
    payload: bytes


@dataclass(frozen=True, slots=True, kw_only=True)
class _Descriptor:
    identifier: int
    scalar: int
    rank: int
    alignment: int
    offset: int
    length: int
    shape: tuple[int, int, int]


def _align(value: int) -> int:
    return (value + _ALIGNMENT - 1) & -_ALIGNMENT


def _f64_payload(values: ArrayLike) -> bytes:
    array = np.ascontiguousarray(values, dtype="<f8")
    if not np.isfinite(array).all():
        raise ValueError("Atlas classifier parameters must be finite")
    return array.tobytes(order="C")


def _sections(classifier: PolicyClassifier) -> tuple[_Section, ...]:
    if classifier.model.dimension != ATLAS_CLASSIFIER_DIMENSION:
        raise ValueError(
            f"Atlas classifier embeddings must have exactly {ATLAS_CLASSIFIER_DIMENSION} dimensions"
        )
    applicability = classifier.applicability
    if applicability.dimension != ATLAS_CLASSIFIER_DIMENSION:
        raise ValueError("Atlas classifier applicability dimension is not canonical")
    inverse_scales = np.asarray(applicability.inverse_scales, dtype=np.float64)
    if np.any(inverse_scales <= 0.0):
        raise ValueError("Atlas classifier inverse scales must be positive")
    distances = np.asarray(applicability.training_distances, dtype=np.float64)
    if distances.size == 0 or np.any(distances < 0.0):
        raise ValueError("Atlas classifier training distances must be non-empty and non-negative")
    if np.any(distances[1:] < distances[:-1]):
        raise ValueError("Atlas classifier training distances must be sorted")
    if not np.isfinite(classifier.temperature) or classifier.temperature <= 0.0:
        raise ValueError("Atlas classifier temperature must be positive and finite")
    return (
        _Section(identifier=1, scalar=_SCALAR_U8, shape=(3,), payload=_CLASS_ORDER),
        _Section(
            identifier=2,
            scalar=_SCALAR_F64,
            shape=(3, ATLAS_CLASSIFIER_DIMENSION),
            payload=_f64_payload(classifier.model.coefficients),
        ),
        _Section(
            identifier=3,
            scalar=_SCALAR_F64,
            shape=(3,),
            payload=_f64_payload(classifier.model.intercepts),
        ),
        _Section(
            identifier=4,
            scalar=_SCALAR_F64,
            shape=(1,),
            payload=_f64_payload((classifier.temperature,)),
        ),
        _Section(
            identifier=5,
            scalar=_SCALAR_F64,
            shape=(ATLAS_CLASSIFIER_DIMENSION,),
            payload=_f64_payload(applicability.mean),
        ),
        _Section(
            identifier=6,
            scalar=_SCALAR_F64,
            shape=(ATLAS_CLASSIFIER_DIMENSION,),
            payload=_f64_payload(inverse_scales),
        ),
        _Section(
            identifier=7,
            scalar=_SCALAR_F64,
            shape=(len(distances),),
            payload=_f64_payload(distances),
        ),
    )


def atlas_classifier_bytes(classifier: PolicyClassifier) -> bytes:
    """Encode a classifier exactly as Atlas's Rust publisher does."""
    sections = _sections(classifier)
    position = _align(_HEADER.size + len(sections) * _DESCRIPTOR.size)
    descriptors: list[tuple[_Section, int]] = []
    for section in sections:
        position = _align(position)
        descriptors.append((section, position))
        position += len(section.payload)
    payload = bytearray(position)
    for index, (section, offset) in enumerate(descriptors):
        shape = (*section.shape, *(0 for _ in range(3 - len(section.shape))))
        descriptor_offset = _HEADER.size + index * _DESCRIPTOR.size
        _DESCRIPTOR.pack_into(
            payload,
            descriptor_offset,
            section.identifier,
            section.scalar,
            len(section.shape),
            _ALIGNMENT,
            offset,
            len(section.payload),
            *shape,
        )
        payload[offset : offset + len(section.payload)] = section.payload
    payload_digest = hashlib.sha256(memoryview(payload)[_HEADER.size :]).digest()
    _HEADER.pack_into(
        payload,
        0,
        _MAGIC,
        ATLAS_CLASSIFIER_FORMAT_VERSION,
        ATLAS_CLASSIFIER_ARTIFACT_KIND,
        _BYTE_ORDER_MARKER,
        _HEADER.size,
        len(sections),
        len(payload),
        payload_digest,
    )
    return bytes(payload)


def _header(payload: bytes) -> bytes:
    if len(payload) < _HEADER.size:
        raise ValueError("Atlas classifier is shorter than its fixed header")
    magic, version, kind, byte_order, header_bytes, sections, total, digest = _HEADER.unpack_from(
        payload
    )
    if magic != _MAGIC:
        raise ValueError("Atlas classifier has invalid SALTMMAP magic")
    if version != ATLAS_CLASSIFIER_FORMAT_VERSION or kind != ATLAS_CLASSIFIER_ARTIFACT_KIND:
        raise ValueError("Atlas classifier uses an unsupported artifact kind or format version")
    if byte_order != _BYTE_ORDER_MARKER:
        raise ValueError("Atlas classifier has an invalid byte-order marker")
    if header_bytes != _HEADER.size or sections != _SECTION_COUNT:
        raise ValueError("Atlas classifier has an invalid header or section count")
    if total != len(payload):
        raise ValueError("Atlas classifier total length does not match its header")
    observed = hashlib.sha256(memoryview(payload)[_HEADER.size :]).digest()
    if observed != digest:
        raise ValueError("Atlas classifier payload hash does not match its bytes")
    return digest


def _decode_descriptor(payload: bytes, index: int) -> _Descriptor:
    values = _DESCRIPTOR.unpack_from(payload, _HEADER.size + index * _DESCRIPTOR.size)
    return _Descriptor(
        identifier=values[0],
        scalar=values[1],
        rank=values[2],
        alignment=values[3],
        offset=values[4],
        length=values[5],
        shape=(values[6], values[7], values[8]),
    )


def _scalar_width(scalar: int) -> int:
    match scalar:
        case 1:
            return 1
        case 5:
            return 8
        case _:
            return 0


def _validate_descriptor(
    payload: bytes,
    descriptor: _Descriptor,
    *,
    index: int,
    previous_end: int,
) -> int:
    if descriptor.identifier != index + 1:
        raise ValueError("Atlas classifier section IDs are not canonical")
    if descriptor.rank not in (1, 2):
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has invalid rank")
    if descriptor.alignment != _ALIGNMENT:
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has invalid alignment")
    if any(descriptor.shape[descriptor.rank :]):
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has invalid shape")
    elements = math.prod(descriptor.shape[: descriptor.rank])
    if descriptor.length != elements * _scalar_width(descriptor.scalar):
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has invalid length")
    expected_offset = _align(previous_end)
    if descriptor.offset != expected_offset or descriptor.offset + descriptor.length > len(payload):
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has invalid offset")
    if any(payload[previous_end : descriptor.offset]):
        raise ValueError(f"Atlas classifier section {descriptor.identifier} has nonzero padding")
    return descriptor.offset + descriptor.length


def _descriptors(payload: bytes) -> tuple[_Descriptor, ...]:
    table_end = _HEADER.size + _SECTION_COUNT * _DESCRIPTOR.size
    data_start = _align(table_end)
    if len(payload) < data_start or any(payload[table_end:data_start]):
        raise ValueError("Atlas classifier descriptor padding is invalid")
    descriptors: list[_Descriptor] = []
    previous_end = data_start
    for index in range(_SECTION_COUNT):
        descriptor = _decode_descriptor(payload, index)
        previous_end = _validate_descriptor(
            payload,
            descriptor,
            index=index,
            previous_end=previous_end,
        )
        descriptors.append(descriptor)
    if previous_end != len(payload):
        raise ValueError("Atlas classifier has trailing bytes")
    return tuple(descriptors)


def _require_schema(descriptors: tuple[_Descriptor, ...]) -> None:
    expected = (
        (_SCALAR_U8, 1, (3, 0, 0)),
        (_SCALAR_F64, 2, (3, ATLAS_CLASSIFIER_DIMENSION, 0)),
        (_SCALAR_F64, 1, (3, 0, 0)),
        (_SCALAR_F64, 1, (1, 0, 0)),
        (_SCALAR_F64, 1, (ATLAS_CLASSIFIER_DIMENSION, 0, 0)),
        (_SCALAR_F64, 1, (ATLAS_CLASSIFIER_DIMENSION, 0, 0)),
    )
    observed = tuple((item.scalar, item.rank, item.shape) for item in descriptors[:6])
    if observed != expected:
        raise ValueError("Atlas classifier sections do not match the relation-classifier schema")
    training = descriptors[6]
    if training.scalar != _SCALAR_F64 or training.rank != 1 or training.shape[0] == 0:
        raise ValueError("Atlas classifier training-distance section is invalid")


def _float_array(payload: bytes, descriptor: _Descriptor, shape: tuple[int, ...]) -> FloatArray:
    values = np.frombuffer(
        payload,
        dtype="<f8",
        count=descriptor.length // 8,
        offset=descriptor.offset,
    ).reshape(shape)
    if not np.isfinite(values).all():
        raise ValueError(
            f"Atlas classifier section {descriptor.identifier} contains non-finite values"
        )
    return immutable_float64(values)


def decode_atlas_classifier(payload: bytes) -> tuple[AtlasClassifierModel, Sha256Hex]:
    """Strictly decode complete ``classifier.salt`` bytes."""
    payload_digest = _header(payload)
    descriptors = _descriptors(payload)
    _require_schema(descriptors)
    class_order = descriptors[0]
    if payload[class_order.offset : class_order.offset + class_order.length] != _CLASS_ORDER:
        raise ValueError("Atlas classifier class order is not Coincident, Proximal, Overlay")
    coefficients = _float_array(
        payload,
        descriptors[1],
        (3, ATLAS_CLASSIFIER_DIMENSION),
    )
    intercepts = _float_array(payload, descriptors[2], (3,))
    temperature = float(_float_array(payload, descriptors[3], (1,))[0])
    mean = _float_array(payload, descriptors[4], (ATLAS_CLASSIFIER_DIMENSION,))
    inverse_scales = _float_array(payload, descriptors[5], (ATLAS_CLASSIFIER_DIMENSION,))
    distances = _float_array(payload, descriptors[6], (descriptors[6].shape[0],))
    if temperature <= 0.0:
        raise ValueError("Atlas classifier temperature must be positive")
    if np.any(inverse_scales <= 0.0):
        raise ValueError("Atlas classifier inverse scales must be positive")
    if np.any(distances < 0.0) or np.any(distances[1:] < distances[:-1]):
        raise ValueError("Atlas classifier training distances must be non-negative and sorted")
    return (
        AtlasClassifierModel(
            coefficients=coefficients,
            intercepts=intercepts,
            temperature=temperature,
            applicability_mean=mean,
            applicability_inverse_scales=inverse_scales,
            applicability_training_distances=distances,
        ),
        payload_digest.hex(),
    )


def load_atlas_classifier(path: Path) -> AtlasClassifierArtifact:
    """Read and validate one Atlas-native classifier artifact."""
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read Atlas classifier {path}: {error}") from error
    model, payload_hash = decode_atlas_classifier(payload)
    return AtlasClassifierArtifact(
        path=path,
        content_hash=hashlib.sha256(payload).hexdigest(),
        payload_hash=payload_hash,
        model=model,
    )


def _require_destination_absent(path: Path) -> None:
    if os.path.lexists(path):
        raise FileExistsError(f"Atlas classifier destination already exists: {path}")


def _write_complete(output: BinaryIO, path: Path, payload: bytes) -> None:
    written = output.write(payload)
    if written != len(payload):
        raise OSError(f"short write for {path}: wrote {written} of {len(payload)} bytes")


def write_atlas_classifier(path: Path, classifier: PolicyClassifier) -> AtlasClassifierArtifact:
    """Durably publish a new immutable Atlas-native classifier and read it back."""
    payload = atlas_classifier_bytes(classifier)
    _require_destination_absent(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(f".{path.name}.staging")
    try:
        output = staging.open("xb")
    except FileExistsError as error:
        raise FileExistsError(
            f"Atlas classifier publication already in progress: {staging}"
        ) from error
    try:
        with output:
            _write_complete(output, staging, payload)
            output.flush()
            os.fsync(output.fileno())
        _require_destination_absent(path)
        os.rename(staging, path)  # noqa: PTH104 -- publication requires atomic os.rename
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except BaseException:
        staging.unlink(missing_ok=True)
        raise
    return load_atlas_classifier(path)


__all__ = [
    "ATLAS_CLASSIFIER_ARTIFACT_KIND",
    "ATLAS_CLASSIFIER_DIMENSION",
    "ATLAS_CLASSIFIER_FILENAME",
    "ATLAS_CLASSIFIER_FORMAT_VERSION",
    "AtlasClassifierArtifact",
    "AtlasClassifierModel",
    "atlas_classifier_bytes",
    "decode_atlas_classifier",
    "load_atlas_classifier",
    "write_atlas_classifier",
]
