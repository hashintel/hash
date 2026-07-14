"""Soft-label policy classifier: fit, grouped CV, calibration, applicability.

The classifier is a multinomial logistic regression over card embeddings
trained against the panel's soft labels. Soft-target cross-entropy is
optimized exactly by expanding each card into one row per class weighted by
``n_votes * p_class``. Cross-validation groups exclusively by the card's
relation ``family_id``, so a relation and its inverse or siblings can never
straddle a train/test split. Every card participates, weighted by its vote
count; there is deliberately no full-panel-only restriction (that would select
on ambiguity).

Calibration is scalar temperature scaling fitted on out-of-fold logits.
Applicability is an embedding-space OOD score against the training card
distribution: the Ledoit-Wolf Mahalanobis distance mapped through the
training distances' survival function, so 1.0 is central and 0.0 is farther
than every training card.
"""

import json
import math
import re
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Annotated, Self

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from numpy.typing import NDArray
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    StringConstraints,
    ValidationError,
)
from scipy.optimize import minimize_scalar
from sklearn.covariance import LedoitWolf
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold

from atlas_tools.common import Sha256Hex, sha256_file
from atlas_tools.relation.concat import CONCAT_SCHEMA_VERSION
from atlas_tools.relation.eval.aggregate import SoftLabelRow, read_soft_labels
from atlas_tools.relation.eval.contract import ClassifierConfig, LoadedRunConfig
from atlas_tools.relation.eval.embeddings import EmbeddingTable, read_embeddings
from atlas_tools.relation.eval.schema import (
    PLACEMENT_CLASSES,
    PlacementClass,
    Probability,
    RelationFamilyId,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

CLASSIFIER_BUNDLE_SCHEMA_VERSION = 1
_TEMPERATURE_BOUNDS = (0.05, 20.0)

type FloatMatrix = NDArray[np.float64]
type FloatVector = NDArray[np.float64]

_GIT_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
type GitCommitSha = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{40}$")]


class ClassifierBundleMetadata(BaseModel):
    """Everything the generation pipeline needs to consume one fitted policy."""

    schema_version: PositiveInt = CLASSIFIER_BUNDLE_SCHEMA_VERSION
    classes: tuple[PlacementClass, ...] = PLACEMENT_CLASSES
    temperature: float = Field(gt=0.0, allow_inf_nan=False)
    rubric_version: str = Field(min_length=1)
    card_format_version: PositiveInt
    embedding_model: str = Field(min_length=1)
    embedding_dimension: PositiveInt
    judges_config_hash: Sha256Hex
    soft_labels_hash: Sha256Hex
    embeddings_hash: Sha256Hex
    git_commit: GitCommitSha | None
    folds: PositiveInt
    seed: int
    regularization: float = Field(gt=0.0, allow_inf_nan=False)
    training_cards: PositiveInt
    training_vote_weight: float = Field(ge=0.0, allow_inf_nan=False)
    out_of_fold_cross_entropy: float = Field(ge=0.0, allow_inf_nan=False)
    calibrated_cross_entropy: float = Field(ge=0.0, allow_inf_nan=False)

    model_config = ConfigDict(extra="forbid", frozen=True)


class PredictionRow(BaseModel):
    """One out-of-fold prediction: the predictions parquet row contract."""

    relation_id: RelationId
    card_hash: Sha256Hex
    producer: RelationNamespace
    family_id: RelationFamilyId
    fold: NonNegativeInt
    applicability: Probability
    logit_coincident: float = Field(allow_inf_nan=False)
    logit_proximal: float = Field(allow_inf_nan=False)
    logit_overlay: float = Field(allow_inf_nan=False)
    p_raw_coincident: Probability
    p_raw_proximal: Probability
    p_raw_overlay: Probability
    p_cal_coincident: Probability
    p_cal_proximal: Probability
    p_cal_overlay: Probability

    model_config = ConfigDict(extra="forbid", frozen=True)

    def calibrated(self, placement_class: PlacementClass) -> Probability:
        match placement_class:
            case "coincident":
                return self.p_cal_coincident
            case "proximal":
                return self.p_cal_proximal
            case "overlay":
                return self.p_cal_overlay

    def calibrated_argmax(self) -> tuple[PlacementClass, Probability]:
        """Return the calibrated top class; ties break toward the earlier class."""
        best = max(
            PLACEMENT_CLASSES,
            key=lambda placement_class: (
                self.calibrated(placement_class),
                -PLACEMENT_CLASSES.index(placement_class),
            ),
        )
        return best, self.calibrated(best)


@dataclass(frozen=True)
class TrainingData:
    """Joined soft labels and embeddings in soft-label row order."""

    labels: tuple[SoftLabelRow, ...]
    families: tuple[RelationFamilyId, ...]
    embeddings: FloatMatrix
    targets: FloatMatrix
    vote_weights: FloatVector


@dataclass(frozen=True)
class FitResult:
    bundle_dir: Path
    metadata_json: Path
    arrays_npz: Path
    predictions_parquet: Path
    metadata: ClassifierBundleMetadata


def _read_git_commit(start: Path) -> GitCommitSha | None:
    """Best-effort resolve the repository HEAD commit above ``start``."""
    for directory in (start, *start.parents):
        git_path = directory / ".git"
        if git_path.is_file():
            content = git_path.read_text(encoding="utf-8").strip()
            prefix = "gitdir:"
            if not content.startswith(prefix):
                return None
            git_path = (directory / content.removeprefix(prefix).strip()).resolve()
        if not git_path.is_dir():
            continue
        head = git_path / "HEAD"
        if not head.is_file():
            return None
        reference = head.read_text(encoding="utf-8").strip()
        if not reference.startswith("ref:"):
            return _validate_commit(reference)
        ref_file = git_path / reference.removeprefix("ref:").strip()
        if ref_file.is_file():
            return _validate_commit(ref_file.read_text(encoding="utf-8").strip())
        return None
    return None


def _validate_commit(candidate: str) -> GitCommitSha | None:
    return candidate if _GIT_COMMIT_PATTERN.fullmatch(candidate) else None


def load_training_data(
    soft_labels_path: Path,
    embeddings_path: Path,
) -> tuple[TrainingData, EmbeddingTable]:
    """Join soft labels with embeddings; every labeled card must embed."""
    labels = read_soft_labels(soft_labels_path)
    table = read_embeddings(embeddings_path)

    missing_embeddings = [
        row.relation_id for row in labels if table.row_by_card_hash(row.card_hash) is None
    ]
    if missing_embeddings:
        raise ValueError(
            f"{len(missing_embeddings)} labeled cards have no embedding, "
            f"for example {missing_embeddings[:5]}"
        )
    families: list[RelationFamilyId] = []
    missing_families: list[RelationId] = []
    for row in labels:
        if row.family_id is None:
            missing_families.append(row.relation_id)
        else:
            families.append(row.family_id)
    if missing_families:
        raise ValueError(
            "grouped cross-validation requires family_id on every card; "
            f"{len(missing_families)} cards lack one, for example {missing_families[:5]}"
        )

    row_index = {card_hash: index for index, card_hash in enumerate(table.card_hashes)}
    embeddings = table.matrix[[row_index[row.card_hash] for row in labels]].astype(np.float64)
    targets = np.asarray(
        [[row.p_coincident, row.p_proximal, row.p_overlay] for row in labels],
        dtype=np.float64,
    )
    vote_weights = np.asarray([row.n_votes for row in labels], dtype=np.float64)
    data = TrainingData(
        labels=tuple(labels),
        families=tuple(families),
        embeddings=embeddings,
        targets=targets,
        vote_weights=vote_weights,
    )
    return data, table


def _expand_soft_targets(
    embeddings: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
) -> tuple[FloatMatrix, NDArray[np.int64], FloatVector]:
    """Expand each card into one weighted row per class.

    Minimizing weighted log loss over the expansion equals minimizing the
    soft-target cross-entropy sample-weighted by ``n_votes``.
    """
    samples, class_count = targets.shape
    expanded_x = np.repeat(embeddings, class_count, axis=0)
    expanded_y = np.tile(np.arange(class_count, dtype=np.int64), samples)
    expanded_w = (targets * vote_weights[:, np.newaxis]).reshape(-1)
    keep = expanded_w > 0.0
    return expanded_x[keep], expanded_y[keep], expanded_w[keep]


def _fit_regression(
    embeddings: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
    config: ClassifierConfig,
) -> LogisticRegression:
    expanded_x, expanded_y, expanded_w = _expand_soft_targets(embeddings, targets, vote_weights)
    if len(np.unique(expanded_y)) < len(PLACEMENT_CLASSES):
        raise ValueError("training data does not carry positive weight for every class")
    regression = LogisticRegression(
        C=config.regularization,
        max_iter=config.max_iterations,
        solver="lbfgs",
        random_state=config.seed,
    )
    regression.fit(expanded_x, expanded_y, sample_weight=expanded_w)
    return regression


def _softmax(logits: FloatMatrix) -> FloatMatrix:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exponents = np.exp(shifted)
    return exponents / exponents.sum(axis=1, keepdims=True)


def soft_cross_entropy(
    probabilities: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
) -> float:
    """Return the ``n_votes``-weighted mean soft-target cross-entropy in nats."""
    total_weight = float(vote_weights.sum())
    if total_weight <= 0.0:
        raise ValueError("cross-entropy requires positive total vote weight")
    clipped = np.clip(probabilities, 1e-12, 1.0)
    per_sample = -(targets * np.log(clipped)).sum(axis=1)
    return float((per_sample * vote_weights).sum() / total_weight)


def out_of_fold_logits(
    data: TrainingData,
    config: ClassifierConfig,
) -> tuple[FloatMatrix, NDArray[np.int64]]:
    """Return grouped out-of-fold decision logits and each row's fold index."""
    unique_families = len(set(data.families))
    if unique_families < config.folds:
        raise ValueError(
            f"grouped CV needs at least {config.folds} relation families, found {unique_families}"
        )
    groups = np.asarray(data.families)
    logits = np.zeros_like(data.targets)
    fold_indices = np.full(len(data.families), -1, dtype=np.int64)
    splitter = GroupKFold(n_splits=config.folds)
    for fold, (train_index, test_index) in enumerate(
        splitter.split(data.embeddings, groups=groups)
    ):
        train_families = set(groups[train_index])
        test_families = set(groups[test_index])
        if train_families & test_families:
            raise ValueError("grouped CV split leaked a relation family across folds")
        regression = _fit_regression(
            data.embeddings[train_index],
            data.targets[train_index],
            data.vote_weights[train_index],
            config,
        )
        logits[test_index] = regression.decision_function(data.embeddings[test_index])
        fold_indices[test_index] = fold
    if (fold_indices < 0).any():
        raise ValueError("grouped CV left rows without an out-of-fold prediction")
    return logits, fold_indices


def fit_temperature(
    logits: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
) -> float:
    """Fit scalar temperature scaling against the soft targets."""

    def objective(log_temperature: float) -> float:
        temperature = math.exp(log_temperature)
        return soft_cross_entropy(_softmax(logits / temperature), targets, vote_weights)

    result = minimize_scalar(
        objective,
        bounds=(math.log(_TEMPERATURE_BOUNDS[0]), math.log(_TEMPERATURE_BOUNDS[1])),
        method="bounded",
    )
    return float(math.exp(result.x))


@dataclass(frozen=True)
class Applicability:
    """Ledoit-Wolf Mahalanobis OOD parameters over the training embeddings."""

    mean: FloatVector
    precision: FloatMatrix
    training_distances: FloatVector

    @classmethod
    def fit(cls, embeddings: FloatMatrix) -> Self:
        covariance = LedoitWolf().fit(embeddings)
        mean = np.asarray(covariance.location_, dtype=np.float64)
        precision = np.asarray(covariance.get_precision(), dtype=np.float64)
        centered = embeddings - mean
        distances = np.sqrt(np.einsum("ij,jk,ik->i", centered, precision, centered))
        return cls(
            mean=mean,
            precision=precision,
            training_distances=np.sort(distances),
        )

    def distances(self, embeddings: FloatMatrix) -> FloatVector:
        centered = embeddings - self.mean
        return np.sqrt(np.einsum("ij,jk,ik->i", centered, self.precision, centered))

    def scores(self, embeddings: FloatMatrix) -> FloatVector:
        """Return the training-distance survival fraction at each embedding."""
        positions = np.searchsorted(self.training_distances, self.distances(embeddings))
        return 1.0 - positions / len(self.training_distances)


def _prediction_rows(
    *,
    data: TrainingData,
    logits: FloatMatrix,
    fold_indices: NDArray[np.int64],
    temperature: float,
    applicability_scores: FloatVector,
) -> list[PredictionRow]:
    raw = _softmax(logits)
    calibrated = _softmax(logits / temperature)
    rows: list[PredictionRow] = []
    for index, label in enumerate(data.labels):
        if label.family_id is None:
            raise ValueError(f"card {label.relation_id} lost its family_id during fitting")
        rows.append(
            PredictionRow(
                relation_id=label.relation_id,
                card_hash=label.card_hash,
                producer=label.producer,
                family_id=label.family_id,
                fold=int(fold_indices[index]),
                applicability=float(applicability_scores[index]),
                logit_coincident=float(logits[index, 0]),
                logit_proximal=float(logits[index, 1]),
                logit_overlay=float(logits[index, 2]),
                p_raw_coincident=float(raw[index, 0]),
                p_raw_proximal=float(raw[index, 1]),
                p_raw_overlay=float(raw[index, 2]),
                p_cal_coincident=float(calibrated[index, 0]),
                p_cal_proximal=float(calibrated[index, 1]),
                p_cal_overlay=float(calibrated[index, 2]),
            )
        )
    return rows


def read_predictions(path: Path) -> list[PredictionRow]:
    """Read and revalidate every out-of-fold prediction row from parquet."""
    try:
        records = pq.read_table(path).to_pylist()
    except (OSError, pa.ArrowInvalid) as error:
        raise ValueError(f"cannot read predictions {path}: {error}") from error
    rows: list[PredictionRow] = []
    for index, record in enumerate(records):
        try:
            rows.append(PredictionRow.model_validate(record))
        except ValidationError as error:
            raise ValueError(f"invalid prediction row {index} in {path}: {error}") from error
    if not rows:
        raise ValueError(f"predictions {path} contain no rows")
    return rows


def fit_classifier(
    *,
    soft_labels_path: PathLike,
    embeddings_path: PathLike,
    loaded_config: LoadedRunConfig,
    out_dir: PathLike,
) -> FitResult:
    """Fit, calibrate, and score the policy classifier into one versioned bundle."""
    config = loaded_config.grid()
    labels_path = Path(soft_labels_path)
    vectors_path = Path(embeddings_path)
    data, table = load_training_data(labels_path, vectors_path)

    logits, fold_indices = out_of_fold_logits(data, config.classifier)
    raw_cross_entropy = soft_cross_entropy(_softmax(logits), data.targets, data.vote_weights)
    temperature = fit_temperature(logits, data.targets, data.vote_weights)
    calibrated_cross_entropy = soft_cross_entropy(
        _softmax(logits / temperature), data.targets, data.vote_weights
    )
    final = _fit_regression(data.embeddings, data.targets, data.vote_weights, config.classifier)
    applicability = Applicability.fit(data.embeddings)

    bundle_dir = Path(out_dir)
    bundle_dir.mkdir(parents=True, exist_ok=True)
    arrays_npz = bundle_dir / "arrays.npz"
    metadata_json = bundle_dir / "classifier.json"
    predictions_parquet = bundle_dir / "predictions.parquet"

    np.savez(
        arrays_npz,
        coefficients=np.asarray(final.coef_, dtype=np.float64),
        intercepts=np.asarray(final.intercept_, dtype=np.float64),
        applicability_mean=applicability.mean,
        applicability_precision=applicability.precision.astype(np.float32),
        applicability_training_distances=applicability.training_distances,
    )
    rows = _prediction_rows(
        data=data,
        logits=logits,
        fold_indices=fold_indices,
        temperature=temperature,
        applicability_scores=applicability.scores(data.embeddings),
    )
    pq.write_table(
        pa.Table.from_pylist([row.model_dump(mode="python") for row in rows]),
        predictions_parquet,
    )
    metadata = ClassifierBundleMetadata(
        temperature=temperature,
        rubric_version=config.rubric_version,
        card_format_version=CONCAT_SCHEMA_VERSION,
        embedding_model=table.details.embedding_model,
        embedding_dimension=table.details.dimension,
        judges_config_hash=loaded_config.content_hash,
        soft_labels_hash=sha256_file(labels_path),
        embeddings_hash=sha256_file(vectors_path),
        git_commit=_read_git_commit(loaded_config.path.parent),
        folds=config.classifier.folds,
        seed=config.classifier.seed,
        regularization=config.classifier.regularization,
        training_cards=len(data.labels),
        training_vote_weight=float(data.vote_weights.sum()),
        out_of_fold_cross_entropy=raw_cross_entropy,
        calibrated_cross_entropy=calibrated_cross_entropy,
    )
    metadata_json.write_bytes(
        json.dumps(metadata.model_dump(mode="json"), indent=2, sort_keys=True).encode("utf-8")
        + b"\n"
    )
    return FitResult(
        bundle_dir=bundle_dir,
        metadata_json=metadata_json,
        arrays_npz=arrays_npz,
        predictions_parquet=predictions_parquet,
        metadata=metadata,
    )


def load_bundle(bundle_dir: Path) -> tuple[ClassifierBundleMetadata, list[PredictionRow]]:
    """Load a bundle's metadata and its out-of-fold predictions."""
    metadata = ClassifierBundleMetadata.model_validate_json(
        (bundle_dir / "classifier.json").read_bytes()
    )
    return metadata, read_predictions(bundle_dir / "predictions.parquet")
