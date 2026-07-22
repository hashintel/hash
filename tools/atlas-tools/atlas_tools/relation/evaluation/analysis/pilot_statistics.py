"""Compute deterministic card-cluster rate estimates for pilot decisions."""

import math
from collections.abc import Mapping, Sequence
from typing import Literal, Self

import numpy as np
from pydantic import NonNegativeInt, PositiveInt, computed_field, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.domain.api import OpenProbability, Probability, RelationId


class RateEstimate(AnalysisModel):
    """Carry a rate and the complete identity of its card bootstrap."""

    estimate: Probability | None
    lower: Probability | None
    upper: Probability | None
    observations: NonNegativeInt
    successes: NonNegativeInt
    cluster_unit: Literal["card"] = "card"
    clusters: NonNegativeInt
    bootstrap_seed: int
    confidence_level: OpenProbability
    bootstrap_resamples: PositiveInt
    bootstrap_defined: NonNegativeInt

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if self.successes > self.observations:
            raise ValueError("rate successes cannot exceed observations")
        if self.bootstrap_defined > self.bootstrap_resamples:
            raise ValueError("defined bootstrap draws cannot exceed requested draws")
        if self.observations == 0:
            if self.estimate is not None or self.lower is not None or self.upper is not None:
                raise ValueError("an empty rate cannot have an estimate or interval")
            if self.clusters != 0 or self.bootstrap_defined != 0:
                raise ValueError("an empty rate cannot have bootstrap evidence")
            return self
        if self.estimate is None:
            raise ValueError("a non-empty rate requires an estimate")
        if self.clusters == 0:
            raise ValueError("a non-empty rate requires at least one card cluster")
        if (self.lower is None) != (self.upper is None):
            raise ValueError("rate interval bounds must be both set or both null")
        if self.lower is not None and self.upper is not None and self.lower > self.upper:
            raise ValueError("rate interval lower bound cannot exceed upper bound")
        return self

    @computed_field
    @property
    def failures(self) -> int:
        """Count false observations."""
        return self.observations - self.successes


def card_cluster_rate(
    observations_by_card: Mapping[RelationId, Sequence[bool]],
    *,
    resamples: int,
    seed: int,
    confidence_level: float,
    minimum_defined_rate: float,
) -> RateEstimate:
    """Bootstrap cards while retaining every observation within a sampled card.

    Card IDs are sorted before sampling. Each invocation starts from the
    declared seed, so insertion order and earlier estimates cannot alter the
    interval.

    Raises:
        ValueError: A bootstrap parameter is outside its finite valid range.

    """
    if resamples <= 0:
        raise ValueError("bootstrap resamples must be positive")
    if not 0.0 < confidence_level < 1.0:
        raise ValueError("confidence level must be in (0, 1)")
    if not 0.0 < minimum_defined_rate <= 1.0:
        raise ValueError("minimum defined rate must be in (0, 1]")

    clusters = tuple(
        values
        for relation_id in sorted(observations_by_card)
        if (values := tuple(observations_by_card[relation_id]))
    )
    observations = sum(map(len, clusters))
    successes = sum(value for cluster in clusters for value in cluster)
    if not clusters:
        return RateEstimate(
            estimate=None,
            lower=None,
            upper=None,
            observations=0,
            successes=0,
            clusters=0,
            bootstrap_seed=seed,
            confidence_level=confidence_level,
            bootstrap_resamples=resamples,
            bootstrap_defined=0,
        )

    cluster_sums = np.asarray([sum(cluster) for cluster in clusters], dtype=np.int64)
    cluster_sizes = np.asarray([len(cluster) for cluster in clusters], dtype=np.int64)
    estimate = float(cluster_sums.sum() / cluster_sizes.sum())
    generator = np.random.default_rng(seed)
    bootstrap = np.empty(resamples, dtype=np.float64)
    cluster_count = len(clusters)
    for index in range(resamples):
        sampled = generator.choice(cluster_count, size=cluster_count, replace=True)
        bootstrap[index] = cluster_sums[sampled].sum() / cluster_sizes[sampled].sum()

    defined = len(bootstrap)
    if defined < math.ceil(resamples * minimum_defined_rate):
        lower = upper = None
    else:
        tail = (1.0 - confidence_level) / 2.0
        raw_lower, raw_upper = np.quantile(bootstrap, (tail, 1.0 - tail))
        lower, upper = float(raw_lower), float(raw_upper)
    return RateEstimate(
        estimate=estimate,
        lower=lower,
        upper=upper,
        observations=observations,
        successes=successes,
        clusters=cluster_count,
        bootstrap_seed=seed,
        confidence_level=confidence_level,
        bootstrap_resamples=resamples,
        bootstrap_defined=defined,
    )


def normalized_verdict_entropy(counts: tuple[int, int, int, int]) -> Probability:
    """Return empirical Shannon entropy normalized by the four-class maximum."""
    total = sum(counts)
    if total == 0:
        raise ValueError("entropy requires at least one verdict")
    entropy = -math.fsum(
        proportion * math.log(proportion)
        for count in counts
        if count
        for proportion in (count / total,)
    )
    return entropy / math.log(4.0)
