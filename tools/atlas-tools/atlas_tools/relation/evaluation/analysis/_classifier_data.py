"""Join classifier inputs and derive auditable family-grouped folds."""

import hashlib
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType

import numpy as np

from atlas_tools.relation.evaluation.analysis.classifier_model import (
    EmbeddingRow,
    FloatMatrix,
    FloatVector,
    embedding_view,
    posterior_vector,
)
from atlas_tools.relation.evaluation.analysis.deliverables import SoftLabel
from atlas_tools.relation.evaluation.domain.api import (
    ClassifierConfig,
    RelationFamilyId,
    RelationId,
)

_MIN_FOLDS = 2


@dataclass(frozen=True, slots=True)
class TrainingData:
    """Keep joined arrays in stable ascending relation order."""

    labels: tuple[SoftLabel, ...]
    families: tuple[RelationFamilyId, ...]
    embeddings: FloatMatrix
    targets: FloatMatrix
    vote_weights: FloatVector


def _label_index(labels: Sequence[SoftLabel]) -> dict[RelationId, SoftLabel]:
    if not labels:
        raise ValueError("classifier training requires at least one soft label")
    labels_by_relation: dict[RelationId, SoftLabel] = {}
    missing_families: list[RelationId] = []
    for label in labels:
        if label.relation_id in labels_by_relation:
            raise ValueError(f"soft labels repeat relation {label.relation_id}")
        labels_by_relation[label.relation_id] = label
        if label.family_id is None:
            missing_families.append(label.relation_id)
        if label.n_votes <= 0:
            raise ValueError(f"soft label {label.relation_id} has no placement-vote weight")
    if missing_families:
        raise ValueError(
            "grouped cross-validation requires family_id for every relation: "
            f"{tuple(sorted(missing_families))}"
        )
    return labels_by_relation


def _embedding_index(
    embeddings: Sequence[EmbeddingRow],
) -> dict[RelationId, EmbeddingRow]:
    embeddings_by_relation: dict[RelationId, EmbeddingRow] = {}
    for row in embeddings:
        if row.relation_id in embeddings_by_relation:
            raise ValueError(f"embeddings repeat relation {row.relation_id}")
        embeddings_by_relation[row.relation_id] = row
    return embeddings_by_relation


def _matching_relation_ids(
    labels: Mapping[RelationId, SoftLabel],
    embeddings: Mapping[RelationId, EmbeddingRow],
) -> tuple[RelationId, ...]:
    label_ids = set(labels)
    embedding_ids = set(embeddings)
    missing = tuple(sorted(label_ids - embedding_ids))
    extra = tuple(sorted(embedding_ids - label_ids))
    if missing or extra:
        raise ValueError(f"embedding relation coverage differs: missing={missing}, extra={extra}")
    return tuple(sorted(label_ids))


def join_training_data(
    labels: Sequence[SoftLabel],
    embeddings: Sequence[EmbeddingRow],
) -> TrainingData:
    """Join an exact one-to-one label and embedding relation set.

    Raises [`ValueError`] for missing families, zero weights, duplicate or
    unequal relation sets, mismatched card hashes, or mixed dimensions.
    """
    labels_by_relation = _label_index(labels)
    embeddings_by_relation = _embedding_index(embeddings)
    ordered_ids = _matching_relation_ids(labels_by_relation, embeddings_by_relation)
    ordered_labels = tuple(labels_by_relation[relation_id] for relation_id in ordered_ids)
    ordered_embeddings = tuple(embeddings_by_relation[relation_id] for relation_id in ordered_ids)
    dimensions = {row.dimension for row in ordered_embeddings}
    if len(dimensions) != 1:
        raise ValueError(f"embedding dimensions differ: {tuple(sorted(dimensions))}")
    [dimension] = dimensions

    families: list[RelationFamilyId] = []
    matrix = np.empty((len(ordered_embeddings), dimension), dtype=np.float64)
    for index, (label, row) in enumerate(zip(ordered_labels, ordered_embeddings, strict=True)):
        if label.card_hash != row.card_hash:
            raise ValueError(
                f"embedding card hash differs for relation {label.relation_id}: "
                f"label {label.card_hash}, embedding {row.card_hash}"
            )
        if label.family_id is None:
            raise AssertionError("family validation did not narrow a soft label")
        families.append(label.family_id)
        matrix[index] = embedding_view(row)

    targets = np.asarray(
        [posterior_vector(label.posterior) for label in ordered_labels],
        dtype=np.float64,
    )
    weights = np.asarray([label.n_votes for label in ordered_labels], dtype=np.float64)
    return TrainingData(
        labels=ordered_labels,
        families=tuple(families),
        embeddings=matrix,
        targets=targets,
        vote_weights=weights,
    )


def validate_grouped_folds(
    labels: Sequence[SoftLabel],
    fold_by_relation_id: Mapping[RelationId, int],
    *,
    folds: int,
) -> None:
    """Prove that a complete fold assignment never splits a relation family.

    Raises:
        ValueError: Relations are missing or extra, a fold is out of range, a
            configured fold is empty, a family ID is absent, or a family leaks
            across folds. Time and additional memory are `O(n)` for `n` labels.

    """
    if folds < _MIN_FOLDS:
        raise ValueError("grouped cross-validation requires at least two folds")
    relation_ids = tuple(label.relation_id for label in labels)
    if len(relation_ids) != len(set(relation_ids)):
        raise ValueError("fold validation received duplicate label relations")
    expected = set(relation_ids)
    observed = set(fold_by_relation_id)
    if expected != observed:
        missing = tuple(sorted(expected - observed))
        extra = tuple(sorted(observed - expected))
        raise ValueError(f"fold relation coverage differs: missing={missing}, extra={extra}")

    family_folds: dict[RelationFamilyId, int] = {}
    used: set[int] = set()
    for label in labels:
        if label.family_id is None:
            raise ValueError(f"relation {label.relation_id} lacks a required family_id")
        fold = fold_by_relation_id[label.relation_id]
        if isinstance(fold, bool) or not 0 <= fold < folds:
            raise ValueError(f"relation {label.relation_id} has invalid fold {fold}")
        previous = family_folds.setdefault(label.family_id, fold)
        if previous != fold:
            raise ValueError(f"fold assignment leaks relation family {label.family_id}")
        used.add(fold)
    if used != set(range(folds)):
        empty = tuple(sorted(set(range(folds)) - used))
        raise ValueError(f"fold assignment leaves folds empty: {empty}")


def grouped_fold_assignment(
    data: TrainingData,
    config: ClassifierConfig,
) -> MappingProxyType[RelationId, int]:
    """Assign whole families to deterministic size-balanced folds."""
    if config.folds < _MIN_FOLDS:
        raise ValueError("classifier config requires at least two grouped folds")
    relation_ids_by_family: dict[RelationFamilyId, list[RelationId]] = defaultdict(list)
    for label, family_id in zip(data.labels, data.families, strict=True):
        relation_ids_by_family[family_id].append(label.relation_id)
    if len(relation_ids_by_family) < config.folds:
        raise ValueError(
            f"grouped CV needs {config.folds} relation families, "
            f"found {len(relation_ids_by_family)}"
        )

    def family_key(item: tuple[RelationFamilyId, list[RelationId]]) -> tuple[int, bytes, str]:
        family_id, relation_ids = item
        digest = hashlib.sha256(f"{config.seed}\0{family_id}".encode()).digest()
        return -len(relation_ids), digest, family_id

    fold_sizes = [0] * config.folds
    fold_by_family: dict[RelationFamilyId, int] = {}
    for family_id, relation_ids in sorted(relation_ids_by_family.items(), key=family_key):
        fold = min(range(config.folds), key=lambda index: (fold_sizes[index], index))
        fold_by_family[family_id] = fold
        fold_sizes[fold] += len(relation_ids)

    assignment = MappingProxyType(
        {
            label.relation_id: fold_by_family[family_id]
            for label, family_id in zip(data.labels, data.families, strict=True)
        }
    )
    validate_grouped_folds(data.labels, assignment, folds=config.folds)
    return assignment
