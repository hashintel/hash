import hashlib
import json
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from atlas_tools.relation.evaluation.analysis.api import (
    EmbeddingRow,
    PlacementTally,
    SoftLabel,
    fit_policy_classifier,
    placement_posterior,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import ArtifactMetadata
from atlas_tools.relation.evaluation.application.analysis_codec import (
    EmbeddingProducerIdentity,
    load_classifier_bundle,
    load_embeddings,
    load_soft_labels,
    write_classifier_bundle,
    write_embeddings,
    write_soft_labels,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    ClassifierConfig,
    PlacementClass,
    RelationFamilyId,
)
from tests.relation.evaluation.classifier_fixtures import write_verified_family_closure

_SOURCE_HASHES = {"fixture-cards": "a" * 64}


def _embedding_producer(model: str, *, dimension: int = 2) -> EmbeddingProducerIdentity:
    return EmbeddingProducerIdentity.verified(
        endpoint_url="https://embedding.test/v1/embeddings",
        model=model,
        dimension=dimension,
    )


def _card_hash(relation_id: str) -> CardHash:
    return CardHash(hashlib.sha256(relation_id.encode()).hexdigest())


def _label(
    index: int,
    *,
    family_id: RelationFamilyId,
    placement_class: PlacementClass,
) -> SoftLabel:
    match placement_class:
        case "coincident":
            tally = PlacementTally(coincident=9)
        case "proximal":
            tally = PlacementTally(proximal=9)
        case "overlay":
            tally = PlacementTally(overlay=9)
    relation_id = f"test:relation-{index:02d}"
    return SoftLabel(
        relation_id=relation_id,
        card_hash=_card_hash(relation_id),
        producer="test",
        family_id=family_id,
        prescreen_stratum="fixture",
        tally=tally,
        unclear_votes=index % 2,
        abstentions=index % 3,
        posterior=placement_posterior(tally),
        refined=index % 2 == 0,
        review=tally.coincident > 0,
    )


def _dataset() -> tuple[tuple[SoftLabel, ...], tuple[EmbeddingRow, ...]]:
    specifications: tuple[tuple[RelationFamilyId, PlacementClass, tuple[float, float]], ...] = (
        (RelationFamilyId("family-a"), "coincident", (-2.0, 0.0)),
        (RelationFamilyId("family-a"), "coincident", (-2.0, 0.5)),
        (RelationFamilyId("family-b"), "proximal", (2.0, 0.0)),
        (RelationFamilyId("family-b"), "proximal", (2.0, 0.5)),
        (RelationFamilyId("family-c"), "overlay", (0.0, 2.0)),
        (RelationFamilyId("family-c"), "overlay", (0.5, 2.0)),
        (RelationFamilyId("family-d"), "coincident", (-2.0, -0.5)),
        (RelationFamilyId("family-d"), "coincident", (-1.5, 0.0)),
        (RelationFamilyId("family-e"), "proximal", (2.0, -0.5)),
        (RelationFamilyId("family-e"), "proximal", (1.5, 0.0)),
        (RelationFamilyId("family-f"), "overlay", (0.0, 1.5)),
        (RelationFamilyId("family-f"), "overlay", (-0.5, 2.0)),
    )
    labels = tuple(
        _label(index, family_id=family_id, placement_class=placement_class)
        for index, (family_id, placement_class, _) in enumerate(specifications)
    )
    embeddings = tuple(
        EmbeddingRow.from_values(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            values=coordinates,
        )
        for label, (_, _, coordinates) in zip(labels, specifications, strict=True)
    )
    return labels, embeddings


def _write_metadata(path: Path, metadata: ArtifactMetadata) -> None:
    payload = json.dumps(
        metadata.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("ascii")
    path.write_bytes(payload + b"\n")


def _rebind_content(
    metadata_path: Path,
    metadata: ArtifactMetadata,
    artifact_path: Path,
) -> None:
    hashes = dict(metadata.content_hashes)
    hashes[artifact_path.name] = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    _write_metadata(metadata_path, metadata.model_copy(update={"content_hashes": hashes}))


def test_table_codecs_are_canonical_deterministic_and_hash_bound(tmp_path: Path) -> None:
    labels, embeddings = _dataset()
    first = tmp_path / "first"
    second = tmp_path / "second"
    first_labels = write_soft_labels(
        first / "soft-labels.parquet",
        tuple(reversed(labels)),
        source_hashes=_SOURCE_HASHES,
    )
    second_labels = write_soft_labels(
        second / "soft-labels.parquet",
        labels,
        source_hashes=_SOURCE_HASHES,
    )
    first_embeddings = write_embeddings(
        first / "embeddings.parquet",
        tuple(reversed(embeddings)),
        producer=_embedding_producer("fixture-v1"),
        source_hashes=_SOURCE_HASHES,
    )
    second_embeddings = write_embeddings(
        second / "embeddings.parquet",
        embeddings,
        producer=_embedding_producer("fixture-v1"),
        source_hashes=_SOURCE_HASHES,
    )

    assert first_labels.path.read_bytes() == second_labels.path.read_bytes()
    assert first_labels.sidecar_path.read_bytes() == second_labels.sidecar_path.read_bytes()
    assert first_embeddings.path.read_bytes() == second_embeddings.path.read_bytes()
    assert first_embeddings.sidecar_path.read_bytes() == second_embeddings.sidecar_path.read_bytes()
    assert load_soft_labels(first_labels.path).rows == labels
    assert load_embeddings(first_embeddings.path).rows == embeddings

    metadata_document = json.loads(second_labels.sidecar_path.read_bytes())
    metadata_document["rows"] += 1
    second_labels.sidecar_path.write_text(
        json.dumps(metadata_document, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="ascii",
    )
    with pytest.raises(ValueError, match="metadata_hash"):
        load_soft_labels(second_labels.path)

    damaged = bytearray(first_labels.path.read_bytes())
    damaged[len(damaged) // 2] ^= 1
    first_labels.path.write_bytes(damaged)
    with pytest.raises(ValueError, match="content hashes"):
        load_soft_labels(first_labels.path)


def test_table_loaders_reject_semantic_order_and_card_drift(tmp_path: Path) -> None:
    labels, embeddings = _dataset()
    labels_artifact = write_soft_labels(
        tmp_path / "soft-labels.parquet",
        labels,
        source_hashes=_SOURCE_HASHES,
    )
    embeddings_artifact = write_embeddings(
        tmp_path / "embeddings.parquet",
        embeddings,
        producer=_embedding_producer("fixture-v1"),
        source_hashes=_SOURCE_HASHES,
    )

    labels_table = pq.read_table(labels_artifact.path)
    reversed_indices = pa.array(range(len(labels) - 1, -1, -1), type=pa.int64())
    pq.write_table(labels_table.take(reversed_indices), labels_artifact.path)
    _rebind_content(
        labels_artifact.sidecar_path,
        labels_artifact.metadata,
        labels_artifact.path,
    )
    with pytest.raises(ValueError, match="canonical relation order"):
        load_soft_labels(labels_artifact.path)

    embeddings_table = pq.read_table(embeddings_artifact.path)
    card_hashes = embeddings_table.column("card_hash").to_pylist()
    card_hashes[0] = "f" * 64
    card_hash_index = embeddings_table.schema.get_field_index("card_hash")
    drifted = embeddings_table.set_column(
        card_hash_index,
        embeddings_table.schema.field(card_hash_index),
        pa.array(card_hashes, type=pa.string()),
    )
    pq.write_table(drifted, embeddings_artifact.path)
    _rebind_content(
        embeddings_artifact.sidecar_path,
        embeddings_artifact.metadata,
        embeddings_artifact.path,
    )
    with pytest.raises(ValueError, match="relation/card order"):
        load_embeddings(embeddings_artifact.path)


def test_classifier_bundle_is_deterministic_cross_validated_and_immutable(
    tmp_path: Path,
) -> None:
    labels, embeddings = _dataset()
    closure = write_verified_family_closure(tmp_path / "closure", labels)
    fit = fit_policy_classifier(
        labels,
        embeddings,
        closure.rows,
        ClassifierConfig(folds=3, max_iterations=500, seed=17),
    )
    first = write_classifier_bundle(
        tmp_path / "first",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )
    second = write_classifier_bundle(
        tmp_path / "second",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )

    assert first.metadata_path.read_bytes() == second.metadata_path.read_bytes()
    assert first.arrays_path.read_bytes() == second.arrays_path.read_bytes()
    assert first.out_of_fold_path.read_bytes() == second.out_of_fold_path.read_bytes()

    loaded = load_classifier_bundle(
        first.directory,
        closure=closure,
        expected_source_hashes=_SOURCE_HASHES,
    )
    assert loaded.fit == first.fit
    assert not loaded.arrays.coefficients.flags.writeable
    with pytest.raises(ValueError, match="cannot set WRITEABLE flag"):
        loaded.arrays.coefficients.setflags(write=True)
    with pytest.raises(ValueError, match="source hashes"):
        load_classifier_bundle(
            first.directory,
            closure=closure,
            expected_source_hashes={"fixture-cards": "b" * 64},
        )

    assert first.metadata.closure.artifact_id == closure.manifest.details.artifact_id
    assert first.metadata.closure.families_hash == closure.families_hash
    assert first.metadata.closure.manifest_hash == closure.manifest_hash
    mismatched_closure = write_verified_family_closure(
        tmp_path / "mismatched-closure",
        labels,
        provenance_seed="mismatched",
    )
    with pytest.raises(ValueError, match="different family closure"):
        load_classifier_bundle(first.directory, closure=mismatched_closure)


def test_classifier_loader_rejects_hash_and_card_identity_corruption(tmp_path: Path) -> None:
    labels, embeddings = _dataset()
    closure = write_verified_family_closure(tmp_path / "closure", labels)
    fit = fit_policy_classifier(
        labels,
        embeddings,
        closure.rows,
        ClassifierConfig(folds=3, max_iterations=500, seed=17),
    )
    damaged = write_classifier_bundle(
        tmp_path / "damaged",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )
    payload = bytearray(damaged.arrays_path.read_bytes())
    payload[len(payload) // 2] ^= 1
    damaged.arrays_path.write_bytes(payload)
    with pytest.raises(ValueError, match="content hashes"):
        load_classifier_bundle(damaged.directory, closure=closure)

    drifted = write_classifier_bundle(
        tmp_path / "drifted",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )
    table = pq.read_table(drifted.out_of_fold_path)
    card_hashes = table.column("card_hash").to_pylist()
    card_hashes[0] = "f" * 64
    card_hash_index = table.schema.get_field_index("card_hash")
    table = table.set_column(
        card_hash_index,
        table.schema.field(card_hash_index),
        pa.array(card_hashes, type=pa.string()),
    )
    pq.write_table(table, drifted.out_of_fold_path)
    _rebind_content(
        drifted.metadata_path,
        drifted.metadata,
        drifted.out_of_fold_path,
    )
    with pytest.raises(ValueError, match="relation/card order"):
        load_classifier_bundle(drifted.directory, closure=closure)

    probability_drift = write_classifier_bundle(
        tmp_path / "probability-drift",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )
    table = pq.read_table(probability_drift.out_of_fold_path)
    coincident = table.column("calibrated_coincident").to_pylist()
    proximal = table.column("calibrated_proximal").to_pylist()
    coincident[0], proximal[0] = proximal[0], coincident[0]
    for name, values in (
        ("calibrated_coincident", coincident),
        ("calibrated_proximal", proximal),
    ):
        index = table.schema.get_field_index(name)
        table = table.set_column(
            index,
            table.schema.field(index),
            pa.array(values, type=pa.float64()),
        )
    pq.write_table(table, probability_drift.out_of_fold_path)
    _rebind_content(
        probability_drift.metadata_path,
        probability_drift.metadata,
        probability_drift.out_of_fold_path,
    )
    with pytest.raises(ValueError, match="calibrated probabilities disagree"):
        load_classifier_bundle(probability_drift.directory, closure=closure)


def test_classifier_loader_never_enables_pickle_arrays(tmp_path: Path) -> None:
    labels, embeddings = _dataset()
    closure = write_verified_family_closure(tmp_path / "closure", labels)
    fit = fit_policy_classifier(
        labels,
        embeddings,
        closure.rows,
        ClassifierConfig(folds=3, max_iterations=500, seed=17),
    )
    bundle = write_classifier_bundle(
        tmp_path / "bundle",
        fit,
        source_hashes=_SOURCE_HASHES,
        closure=closure,
    )
    with np.load(bundle.arrays_path, allow_pickle=False) as archive:
        arrays = {name: archive[name] for name in archive.files}
    arrays["intercepts"] = np.asarray(["not", "numeric", "data"], dtype=object)
    with bundle.arrays_path.open("wb") as output:
        np.savez(output, **arrays)
    _rebind_content(bundle.metadata_path, bundle.metadata, bundle.arrays_path)

    with pytest.raises(ValueError, match="Object arrays cannot be loaded"):
        load_classifier_bundle(bundle.directory, closure=closure)
