"""Verify Python emits the exact relation-classifier format consumed by Atlas."""

import hashlib
import struct
from pathlib import Path

import numpy as np
import pytest

from atlas_tools.relation.evaluation.analysis.api import (
    ApplicabilityModel,
    MultinomialModel,
    PolicyClassifier,
)
from atlas_tools.relation.evaluation.application._atlas_classifier_codec import (
    atlas_classifier_bytes,
)
from atlas_tools.relation.evaluation.application.api import (
    ATLAS_CLASSIFIER_DIMENSION,
    load_atlas_classifier,
    write_atlas_classifier,
)
from atlas_tools.relation.evaluation.domain.api import ClassifierConfig

_RUST_FIXTURE = (
    Path(__file__).resolve().parents[5]
    / "libs/@local/graph/atlas/fixtures/relation-classifier-python-v1.salt"
)


def rust_fixture_classifier() -> PolicyClassifier:
    """Build the independent golden model encoded by Rust's classifier fixture."""
    coefficients: list[list[float]] = [[0.0] * ATLAS_CLASSIFIER_DIMENSION for _ in range(3)]
    coefficients[0][0] = 2.0
    coefficients[1][1] = -1.0
    coefficients[2][-1] = 0.5
    return PolicyClassifier(
        config=ClassifierConfig(folds=2, max_iterations=10, seed=17),
        model=MultinomialModel(
            dimension=ATLAS_CLASSIFIER_DIMENSION,
            coefficients=(
                tuple(coefficients[0]),
                tuple(coefficients[1]),
                tuple(coefficients[2]),
            ),
            intercepts=(0.1, 0.2, -0.3),
            iterations=1,
        ),
        temperature=2.0,
        applicability=ApplicabilityModel(
            dimension=ATLAS_CLASSIFIER_DIMENSION,
            mean=(0.0,) * ATLAS_CLASSIFIER_DIMENSION,
            inverse_scales=(1.0,) * ATLAS_CLASSIFIER_DIMENSION,
            training_distances=(0.0, 0.05, 0.1),
        ),
    )


def _rehash(payload: bytearray) -> None:
    payload[32:64] = hashlib.sha256(memoryview(payload)[64:]).digest()


def test_writer_matches_rust_fixture_and_reader_returns_immutable_arrays(
    tmp_path: Path,
) -> None:
    classifier = rust_fixture_classifier()
    expected = _RUST_FIXTURE.read_bytes()
    assert atlas_classifier_bytes(classifier) == expected

    artifact = write_atlas_classifier(tmp_path / "classifier.salt", classifier)
    loaded = load_atlas_classifier(artifact.path)

    assert artifact.path.read_bytes() == expected
    assert loaded.content_hash == hashlib.sha256(expected).hexdigest()
    assert loaded.payload_hash == hashlib.sha256(expected[64:]).hexdigest()
    assert loaded.model.temperature == 2.0
    np.testing.assert_array_equal(
        loaded.model.coefficients,
        np.asarray(classifier.model.coefficients, dtype=np.float64),
    )
    assert not loaded.model.coefficients.flags.writeable
    with pytest.raises(ValueError, match="cannot set WRITEABLE flag"):
        loaded.model.coefficients.setflags(write=True)


def test_reader_rejects_hash_schema_and_numeric_corruption(tmp_path: Path) -> None:
    original = _RUST_FIXTURE.read_bytes()

    damaged_hash = bytearray(original)
    damaged_hash[-1] ^= 1
    hash_path = tmp_path / "hash.salt"
    hash_path.write_bytes(damaged_hash)
    with pytest.raises(ValueError, match="payload hash"):
        load_atlas_classifier(hash_path)

    damaged_schema = bytearray(original)
    damaged_schema[66] = 5
    _rehash(damaged_schema)
    schema_path = tmp_path / "schema.salt"
    schema_path.write_bytes(damaged_schema)
    with pytest.raises(ValueError, match="invalid length"):
        load_atlas_classifier(schema_path)

    damaged_scale = bytearray(original)
    struct.pack_into("<d", damaged_scale, 98_944, -1.0)
    _rehash(damaged_scale)
    scale_path = tmp_path / "scale.salt"
    scale_path.write_bytes(damaged_scale)
    with pytest.raises(ValueError, match="inverse scales must be positive"):
        load_atlas_classifier(scale_path)


def test_writer_rejects_noncanonical_dimension_and_preserves_publication_claim(
    tmp_path: Path,
) -> None:
    classifier = rust_fixture_classifier()
    small = classifier.model_copy(
        update={
            "model": classifier.model.model_copy(
                update={
                    "dimension": 2,
                    "coefficients": ((1.0, 0.0), (0.0, 1.0), (-1.0, -1.0)),
                }
            ),
            "applicability": classifier.applicability.model_copy(
                update={
                    "dimension": 2,
                    "mean": (0.0, 0.0),
                    "inverse_scales": (1.0, 1.0),
                }
            ),
        }
    )
    with pytest.raises(ValueError, match="exactly 3072 dimensions"):
        write_atlas_classifier(tmp_path / "small.salt", small)

    output = tmp_path / "classifier.salt"
    staging = tmp_path / ".classifier.salt.staging"
    staging.write_text("another publisher")
    with pytest.raises(FileExistsError, match="publication already in progress"):
        write_atlas_classifier(output, classifier)
    assert not output.exists()
    assert staging.read_text() == "another publisher"
