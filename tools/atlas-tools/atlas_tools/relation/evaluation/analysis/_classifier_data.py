"""Join classifier inputs and derive auditable family-grouped folds."""

import hashlib
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType
from typing import Protocol

import numpy as np

from atlas_tools.relation.evaluation.analysis.classifier_model import (
    EmbeddingRow,
    FloatMatrix,
    FloatVector,
    IntVector,
    embedding_view,
    posterior_vector,
)
from atlas_tools.relation.evaluation.analysis.deliverables import SoftLabel
from atlas_tools.relation.evaluation.domain.api import (
    ClassifierConfig,
    RelationFamilyId,
    RelationId,
    Sha256Hex,
)

_MIN_FOLDS = 2


class FamilyGroupedRow(Protocol):
    """A relation identity with an optional classifier cohort."""

    @property
    def relation_id(self) -> RelationId: ...

    @property
    def family_id(self) -> RelationFamilyId | None: ...


class FamilyBindingRow(FamilyGroupedRow, Protocol):
    """A required classifier cohort bound to the exact current card bytes."""

    @property
    def family_id(self) -> RelationFamilyId: ...

    @property
    def card_hash(self) -> Sha256Hex: ...


@dataclass(frozen=True, slots=True)
class _JoinedFamily:
    relation_id: RelationId
    family_id: RelationFamilyId


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
    for label in labels:
        if label.relation_id in labels_by_relation:
            raise ValueError(f"soft labels repeat relation {label.relation_id}")
        labels_by_relation[label.relation_id] = label
        if label.n_votes <= 0:
            raise ValueError(f"soft label {label.relation_id} has no placement-vote weight")
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


def _family_index(
    families: Sequence[FamilyBindingRow],
) -> dict[RelationId, FamilyBindingRow]:
    families_by_relation: dict[RelationId, FamilyBindingRow] = {}
    for row in families:
        if row.relation_id in families_by_relation:
            raise ValueError(f"family closure repeats relation {row.relation_id}")
        families_by_relation[row.relation_id] = row
    return families_by_relation


def _matching_relation_ids(
    labels: Mapping[RelationId, SoftLabel],
    embeddings: Mapping[RelationId, EmbeddingRow],
    families: Mapping[RelationId, FamilyBindingRow],
) -> tuple[RelationId, ...]:
    label_ids = set(labels)
    embedding_ids = set(embeddings)
    family_ids = set(families)
    missing_embeddings = tuple(sorted(label_ids - embedding_ids))
    extra_embeddings = tuple(sorted(embedding_ids - label_ids))
    if missing_embeddings or extra_embeddings:
        raise ValueError(
            "embedding relation coverage differs: "
            f"missing={missing_embeddings}, extra={extra_embeddings}"
        )
    missing_families = tuple(sorted(label_ids - family_ids))
    if missing_families:
        raise ValueError(
            f"family closure does not cover every labeled relation: missing={missing_families}"
        )
    return tuple(sorted(label_ids))


def join_training_data(
    labels: Sequence[SoftLabel],
    embeddings: Sequence[EmbeddingRow],
    families: Sequence[FamilyBindingRow],
) -> TrainingData:
    """Join exact one-to-one label, embedding, and closure relation sets.

    Labels and embeddings must have identical relation coverage. The verified
    closure may additionally contain non-training deck rows, but it must cover
    every label and bind each one to the same card hash.

    Raises [`ValueError`] for missing families, zero weights, duplicate or
    unequal label/embedding sets, mismatched card hashes, or mixed dimensions.
    """
    labels_by_relation = _label_index(labels)
    embeddings_by_relation = _embedding_index(embeddings)
    families_by_relation = _family_index(families)
    ordered_ids = _matching_relation_ids(
        labels_by_relation,
        embeddings_by_relation,
        families_by_relation,
    )
    ordered_labels = tuple(labels_by_relation[relation_id] for relation_id in ordered_ids)
    ordered_embeddings = tuple(embeddings_by_relation[relation_id] for relation_id in ordered_ids)
    dimensions = {row.dimension for row in ordered_embeddings}
    if len(dimensions) != 1:
        raise ValueError(f"embedding dimensions differ: {tuple(sorted(dimensions))}")
    [dimension] = dimensions

    joined_families: list[RelationFamilyId] = []
    matrix = np.empty((len(ordered_embeddings), dimension), dtype=np.float64)
    for index, (label, row) in enumerate(zip(ordered_labels, ordered_embeddings, strict=True)):
        family = families_by_relation[label.relation_id]
        if label.card_hash != row.card_hash:
            raise ValueError(
                f"embedding card hash differs for relation {label.relation_id}: "
                f"label {label.card_hash}, embedding {row.card_hash}"
            )
        if label.card_hash != family.card_hash:
            raise ValueError(
                f"family closure card hash differs for relation {label.relation_id}: "
                f"label {label.card_hash}, closure {family.card_hash}"
            )
        joined_families.append(family.family_id)
        matrix[index] = embedding_view(row)

    targets = np.asarray(
        [posterior_vector(label.posterior) for label in ordered_labels],
        dtype=np.float64,
    )
    weights = np.asarray([label.n_votes for label in ordered_labels], dtype=np.float64)
    return TrainingData(
        labels=ordered_labels,
        families=tuple(joined_families),
        embeddings=matrix,
        targets=targets,
        vote_weights=weights,
    )


def validate_grouped_folds(
    rows: Sequence[FamilyGroupedRow],
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
    relation_ids = tuple(row.relation_id for row in rows)
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
    for row in rows:
        if row.family_id is None:
            raise ValueError(f"relation {row.relation_id} lacks a required family_id")
        fold = fold_by_relation_id[row.relation_id]
        if isinstance(fold, bool) or not 0 <= fold < folds:
            raise ValueError(f"relation {row.relation_id} has invalid fold {fold}")
        family_id = row.family_id
        previous = family_folds.setdefault(family_id, fold)
        if previous != fold:
            raise ValueError(f"fold assignment leaks relation family {family_id}")
        used.add(fold)
    if used != set(range(folds)):
        empty = tuple(sorted(set(range(folds)) - used))
        raise ValueError(f"fold assignment leaves folds empty: {empty}")


def _relations_by_family(
    rows: Sequence[FamilyGroupedRow],
) -> dict[RelationFamilyId, list[RelationId]]:
    """Index unique relations by their required classifier cohort."""
    if not rows:
        raise ValueError("classifier cohorts require at least one relation")
    relation_ids: set[RelationId] = set()
    by_family: dict[RelationFamilyId, list[RelationId]] = defaultdict(list)
    missing: list[RelationId] = []
    for row in rows:
        if row.relation_id in relation_ids:
            raise ValueError(f"classifier cohorts repeat relation {row.relation_id}")
        relation_ids.add(row.relation_id)
        if row.family_id is None:
            missing.append(row.relation_id)
        else:
            by_family[row.family_id].append(row.relation_id)
    if missing:
        examples = tuple(sorted(missing)[:5])
        raise ValueError(
            "classifier cross-fitting requires relation-family grouping on every card; "
            f"{len(missing)} cards lack family_id, for example {examples}"
        )
    return by_family


def _fold_by_family(
    relations_by_family: Mapping[RelationFamilyId, Sequence[RelationId]],
    config: ClassifierConfig,
) -> dict[RelationFamilyId, int]:
    if len(relations_by_family) < config.folds:
        raise ValueError(
            f"grouped CV needs {config.folds} relation families, found {len(relations_by_family)}"
        )

    def family_key(
        item: tuple[RelationFamilyId, Sequence[RelationId]],
    ) -> tuple[int, bytes, str]:
        family_id, relation_ids = item
        digest = hashlib.sha256(f"{config.seed}\0{family_id}".encode()).digest()
        return -len(relation_ids), digest, family_id

    fold_sizes = [0] * config.folds
    assignment: dict[RelationFamilyId, int] = {}
    for family_id, relation_ids in sorted(relations_by_family.items(), key=family_key):
        fold = min(range(config.folds), key=lambda index: (fold_sizes[index], index))
        assignment[family_id] = fold
        fold_sizes[fold] += len(relation_ids)
    return assignment


def validate_classifier_cohorts(
    rows: Sequence[FamilyGroupedRow],
    config: ClassifierConfig,
) -> None:
    """Validate that nested grouped cross-fitting is possible.

    Every outer validation cohort is removed before its temperature and
    applicability evidence is fitted. The remaining families must still fill
    every configured inner fold. Validation takes `O(n log n)` time for `n`
    relations and performs no fitting or provider work.

    Raises:
        ValueError: Relations repeat, lack a family, cannot fill the outer
            folds, or leave an outer-training partition unable to fill every
            inner fold.

    """
    relations_by_family = _relations_by_family(rows)
    family_folds = _fold_by_family(relations_by_family, config)
    family_count = len(relations_by_family)
    for fold in range(config.folds):
        validation_families = sum(assigned_fold == fold for assigned_fold in family_folds.values())
        training_families = family_count - validation_families
        if training_families < config.folds:
            raise ValueError(
                f"outer fold {fold} leaves {training_families} relation families for "
                f"{config.folds}-fold calibration; nested grouped CV is impossible"
            )


def _joined_training_families(data: TrainingData) -> tuple[_JoinedFamily, ...]:
    return tuple(
        _JoinedFamily(relation_id=label.relation_id, family_id=family_id)
        for label, family_id in zip(data.labels, data.families, strict=True)
    )


def validate_training_cohorts(data: TrainingData, config: ClassifierConfig) -> None:
    """Validate nested grouped CV against exactly the joined training cohort."""
    validate_classifier_cohorts(_joined_training_families(data), config)


def grouped_fold_assignment(
    data: TrainingData,
    config: ClassifierConfig,
) -> MappingProxyType[RelationId, int]:
    """Assign whole families to deterministic size-balanced folds."""
    if config.folds < _MIN_FOLDS:
        raise ValueError("classifier config requires at least two grouped folds")
    grouped_rows = _joined_training_families(data)
    relation_ids_by_family = _relations_by_family(grouped_rows)
    fold_by_family = _fold_by_family(relation_ids_by_family, config)

    assignment = MappingProxyType(
        {
            label.relation_id: fold_by_family[family_id]
            for label, family_id in zip(data.labels, data.families, strict=True)
        }
    )
    validate_grouped_folds(grouped_rows, assignment, folds=config.folds)
    return assignment


def training_subset(data: TrainingData, indices: IntVector) -> TrainingData:
    """Select a non-empty training partition while preserving row order."""
    if indices.ndim != 1 or not len(indices):
        raise ValueError("classifier training subset must be one-dimensional and non-empty")
    positions = tuple(int(index) for index in indices)
    return TrainingData(
        labels=tuple(data.labels[index] for index in positions),
        families=tuple(data.families[index] for index in positions),
        embeddings=data.embeddings[indices],
        targets=data.targets[indices],
        vote_weights=data.vote_weights[indices],
    )
