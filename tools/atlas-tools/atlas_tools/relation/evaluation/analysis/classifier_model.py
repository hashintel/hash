"""Define immutable classifier inputs, parameters, and result records."""

from collections.abc import Sequence
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, Self

import numpy as np
from numpy.typing import NDArray
from pydantic import Field, NonNegativeInt, PositiveInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.deliverables import PlacementPosterior
from atlas_tools.relation.evaluation.domain.api import (
    PLACEMENT_CLASSES,
    CardHash,
    ClassifierConfig,
    FiniteFloat,
    NonNegativeFiniteFloat,
    PlacementClass,
    PositiveFiniteFloat,
    Probability,
    RelationFamilyId,
    RelationId,
)

type FloatMatrix = NDArray[np.float64]
type FloatVector = NDArray[np.float64]
type IntVector = NDArray[np.int64]
type ProbabilityVector = tuple[float, float, float]

_CLASS_COUNT = len(PLACEMENT_CLASSES)
_FLOAT32_BYTES = 4


class EmbeddingRow(AnalysisModel):
    """Bind one immutable float32 embedding to an exact card identity.

    `vector_f32_le` is little-endian packed float32 data. The immutable byte
    representation avoids millions of boxed Python floats and admits zero-copy
    validation before fitting.
    """

    relation_id: RelationId
    card_hash: CardHash
    encoding: Literal["f32-le-v1"] = "f32-le-v1"
    dimension: PositiveInt
    vector_f32_le: bytes = Field(repr=False)

    @classmethod
    def from_values(
        cls,
        *,
        relation_id: RelationId,
        card_hash: CardHash,
        values: Sequence[float],
    ) -> Self:
        """Pack one finite, non-empty vector into the immutable row format.

        Raises:
            ValueError: The vector is not one-dimensional, is empty, or
                contains a non-finite value.

        """
        vector = np.asarray(values, dtype="<f4")
        if vector.ndim != 1 or vector.size == 0:
            raise ValueError("an embedding vector must be one-dimensional and non-empty")
        if not np.isfinite(vector).all():
            raise ValueError("an embedding vector must contain only finite values")
        return cls(
            relation_id=relation_id,
            card_hash=card_hash,
            dimension=int(vector.size),
            vector_f32_le=vector.tobytes(order="C"),
        )

    @model_validator(mode="after")
    def check_vector(self) -> Self:
        expected = self.dimension * _FLOAT32_BYTES
        if len(self.vector_f32_le) != expected:
            raise ValueError(f"embedding has {len(self.vector_f32_le)} bytes, expected {expected}")

        if not np.isfinite(embedding_view(self)).all():
            raise ValueError("embedding bytes contain a non-finite float32 value")

        return self


class MultinomialModel(AnalysisModel):
    """Store one converged three-class linear model in explicit class order."""

    algorithm: Literal["soft-target-multinomial-lbfgs-v1"] = "soft-target-multinomial-lbfgs-v1"
    classes: tuple[PlacementClass, PlacementClass, PlacementClass] = (
        "coincident",
        "proximal",
        "overlay",
    )
    dimension: PositiveInt
    coefficients: tuple[
        tuple[FiniteFloat, ...],
        tuple[FiniteFloat, ...],
        tuple[FiniteFloat, ...],
    ]
    intercepts: tuple[FiniteFloat, FiniteFloat, FiniteFloat]
    iterations: PositiveInt

    @model_validator(mode="after")
    def check_shape(self) -> Self:
        if self.classes != PLACEMENT_CLASSES:
            raise ValueError("classifier classes must use coincident, proximal, overlay order")
        if any(len(row) != self.dimension for row in self.coefficients):
            raise ValueError("each coefficient row must match the embedding dimension")
        return self


class ApplicabilityModel(AnalysisModel):
    """Store a diagonal-shrinkage standardized-distance distribution.

    Per-dimension inverse scales retain `O(d)` state and make scoring `O(nd)`
    for `n` embeddings of dimension `d`. Training distances are sorted
    ascending for logarithmic empirical-survival lookup.
    """

    algorithm: Literal["diagonal-shrinkage-v1"] = "diagonal-shrinkage-v1"
    dimension: PositiveInt
    mean: tuple[FiniteFloat, ...]
    inverse_scales: tuple[PositiveFiniteFloat, ...]
    training_distances: tuple[NonNegativeFiniteFloat, ...]

    @model_validator(mode="after")
    def check_shape(self) -> Self:
        if len(self.mean) != self.dimension or len(self.inverse_scales) != self.dimension:
            raise ValueError("applicability location and scale must match the dimension")
        if not self.training_distances:
            raise ValueError("applicability requires at least one training distance")
        if self.training_distances != tuple(sorted(self.training_distances)):
            raise ValueError("applicability training distances must be sorted")
        return self


class PolicyClassifier(AnalysisModel):
    """Carry the final model, calibration, and applicability contract."""

    calibration: Literal["grouped-oof-scalar-temperature-golden-section-v2"] = (
        "grouped-oof-scalar-temperature-golden-section-v2"
    )
    config: ClassifierConfig
    model: MultinomialModel
    temperature: PositiveFiniteFloat
    applicability: ApplicabilityModel

    @model_validator(mode="after")
    def check_dimensions(self) -> Self:
        if self.model.dimension != self.applicability.dimension:
            raise ValueError("classifier and applicability dimensions must match")
        return self


class PolicyPrediction(AnalysisModel):
    """Describe one calibrated prediction with its applicability evidence."""

    relation_id: RelationId
    card_hash: CardHash
    applicability: Probability
    distance: NonNegativeFiniteFloat
    logits: tuple[FiniteFloat, FiniteFloat, FiniteFloat]
    raw: PlacementPosterior
    calibrated: PlacementPosterior

    @computed_field
    @property
    def top_class(self) -> PlacementClass:
        """Return the calibrated argmax with C, P, O tie order."""
        return posterior_argmax(self.calibrated)

    @computed_field
    @property
    def top_probability(self) -> Probability:
        """Return the calibrated probability of [`top_class`][self.top_class]."""
        return posterior_value(self.calibrated, self.top_class)


class OutOfFoldPrediction(PolicyPrediction):
    """Add the held-out cohort and its independently fitted temperature."""

    family_id: RelationFamilyId
    fold: NonNegativeInt
    calibration_temperature: PositiveFiniteFloat


class CrossFitFold(AnalysisModel):
    """Validation evidence fitted without the fold's relation families."""

    algorithm: Literal["nested-grouped-calibration-applicability-v1"] = (
        "nested-grouped-calibration-applicability-v1"
    )
    fold: NonNegativeInt
    validation_relation_ids: tuple[RelationId, ...]
    temperature: PositiveFiniteFloat
    applicability: ApplicabilityModel

    @model_validator(mode="after")
    def check_validation_relations(self) -> Self:
        if not self.validation_relation_ids:
            raise ValueError("cross-fit fold requires at least one validation relation")
        if self.validation_relation_ids != tuple(sorted(self.validation_relation_ids)):
            raise ValueError("cross-fit validation relations must use ascending order")
        if len(self.validation_relation_ids) != len(set(self.validation_relation_ids)):
            raise ValueError("cross-fit validation relations must be unique")
        return self


class ClassifierMetrics(AnalysisModel):
    """Summarize weighted out-of-fold discrimination and calibration.

    Calibrated row metrics use the temperature fitted without that row's
    outer fold. `deployed_temperature_cross_entropy` is the all-row grouped
    out-of-fold objective used to fit the final deployment temperature; it is
    recorded as fitting evidence rather than an independent estimate.
    """

    training_cards: PositiveInt
    training_vote_weight: PositiveFiniteFloat
    folds: PositiveInt
    max_fold_iterations: PositiveInt
    out_of_fold_cross_entropy: NonNegativeFiniteFloat
    calibrated_cross_entropy: NonNegativeFiniteFloat
    deployed_temperature_cross_entropy: NonNegativeFiniteFloat
    out_of_fold_brier: NonNegativeFiniteFloat
    calibrated_brier: NonNegativeFiniteFloat
    raw_expected_accuracy: Probability
    calibrated_expected_accuracy: Probability

    @model_validator(mode="after")
    def check_calibration(self) -> Self:
        if self.deployed_temperature_cross_entropy > self.out_of_fold_cross_entropy + 1e-12:
            raise ValueError("deployed temperature must not increase fitting cross-entropy")

        return self


@dataclass(frozen=True, slots=True, kw_only=True)
class ClassifierFit:
    """Return a fitted classifier and every deterministic validation artifact."""

    classifier: PolicyClassifier
    cross_fit_folds: tuple[CrossFitFold, ...]
    out_of_fold: tuple[OutOfFoldPrediction, ...]
    metrics: ClassifierMetrics
    fold_by_relation_id: MappingProxyType[RelationId, int]


def embedding_view(row: EmbeddingRow) -> NDArray[np.float32]:
    """Return a read-only zero-copy view over one packed embedding."""
    return np.frombuffer(row.vector_f32_le, dtype="<f4", count=row.dimension)


def posterior_vector(posterior: PlacementPosterior) -> ProbabilityVector:
    """Project a posterior into explicit coincident, proximal, overlay order."""
    return posterior.coincident, posterior.proximal, posterior.overlay


def posterior_value(
    posterior: PlacementPosterior,
    placement_class: PlacementClass,
) -> Probability:
    """Return one explicitly named probability from a placement posterior."""
    match placement_class:
        case "coincident":
            return posterior.coincident
        case "proximal":
            return posterior.proximal
        case "overlay":
            return posterior.overlay


def posterior_argmax(posterior: PlacementPosterior) -> PlacementClass:
    """Return the posterior argmax with coincident, proximal, overlay tie order."""
    values = posterior_vector(posterior)
    index = max(range(_CLASS_COUNT), key=lambda item: (values[item], -item))
    return PLACEMENT_CLASSES[index]


def posterior_from_array(row: FloatVector) -> PlacementPosterior:
    """Validate a length-three probability vector as a placement posterior."""
    return PlacementPosterior(
        coincident=float(row[0]),
        proximal=float(row[1]),
        overlay=float(row[2]),
    )
