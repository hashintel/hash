"""Deterministic card-cluster bootstrap and relation-evaluation statistics."""

import math
from collections.abc import Callable, Mapping, Sequence
from itertools import chain
from typing import Literal

import numpy as np

from atlas_tools.relation.eval.schema import VERDICTS, Estimate, Verdict

type Statistic[Observation] = Callable[[Sequence[Observation]], float | None]
type LabelPair = tuple[Verdict, Verdict]
type CountUnit = Literal["observations", "cards"]

_DEFAULT_RESAMPLES = 1000
_DEFAULT_SEED = 0
_DEFAULT_CI_LEVEL = 0.95
_DEFAULT_MINIMUM_DEFINED_RATE = 0.95
_MIN_RATINGS_PER_CARD = 2


def _defined(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None

    return value


def _validate_bootstrap(*, resamples: int, ci_level: float, minimum_defined_rate: float) -> None:
    if resamples <= 0:
        raise ValueError("resamples must be positive")
    if not 0.0 < ci_level < 1.0:
        raise ValueError("ci_level must be between zero and one")
    if not 0.0 < minimum_defined_rate <= 1.0:
        raise ValueError("minimum_defined_rate must be in (0, 1]")


def _ordered_clusters[Observation](
    observations_by_card: Mapping[str, Sequence[Observation]],
) -> tuple[tuple[Observation, ...], ...]:
    return tuple(
        cluster
        for card_id in sorted(observations_by_card)
        if (cluster := tuple(observations_by_card[card_id]))
    )


def _estimate_from_clusters[Observation](
    clusters: tuple[tuple[Observation, ...], ...],
    statistic: Callable[[Sequence[tuple[Observation, ...]]], float | None],
    *,
    n: int,
    resamples: int,
    seed: int,
    ci_level: float,
    minimum_defined_rate: float,
) -> Estimate:
    _validate_bootstrap(
        resamples=resamples,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )
    if not clusters:
        return Estimate(
            est=None,
            lo=None,
            hi=None,
            n=n,
            bootstrap_resamples=resamples,
            bootstrap_defined=0,
        )

    estimate = _defined(statistic(clusters))
    if estimate is None:
        return Estimate(
            est=None,
            lo=None,
            hi=None,
            n=n,
            bootstrap_resamples=resamples,
            bootstrap_defined=0,
        )

    rng = np.random.default_rng(seed)
    bootstrap_values: list[float] = []
    cluster_count = len(clusters)
    for _ in range(resamples):
        sampled_indices = rng.choice(cluster_count, size=cluster_count, replace=True)
        sampled_clusters = tuple(clusters[index] for index in sampled_indices)
        value = _defined(statistic(sampled_clusters))
        if value is not None:
            bootstrap_values.append(value)

    defined = len(bootstrap_values)
    if defined < math.ceil(resamples * minimum_defined_rate):
        return Estimate(
            est=estimate,
            lo=None,
            hi=None,
            n=n,
            bootstrap_resamples=resamples,
            bootstrap_defined=defined,
        )

    tail = (1.0 - ci_level) / 2.0
    lower, upper = np.quantile(bootstrap_values, (tail, 1.0 - tail))
    return Estimate(
        est=estimate,
        lo=float(lower),
        hi=float(upper),
        n=n,
        bootstrap_resamples=resamples,
        bootstrap_defined=defined,
    )


def cluster_bootstrap[Observation](
    observations_by_card: Mapping[str, Sequence[Observation]],
    statistic: Statistic[Observation],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
    count_unit: CountUnit = "observations",
) -> Estimate:
    """Bootstrap cards, carrying every observation belonging to each sampled card.

    Card IDs are sorted before sampling so insertion order cannot affect seeded results. Empty
    card clusters do not contribute. ``n`` is the total number of atomic observations by default;
    for a statistic whose atomic values are card-level measurements, pass ``count_unit="cards"``
    to report the number of contributing non-empty cards instead.
    """
    clusters = _ordered_clusters(observations_by_card)
    if count_unit == "observations":
        n = sum(map(len, clusters))
    elif count_unit == "cards":
        n = len(clusters)
    else:
        raise ValueError("count_unit must be 'observations' or 'cards'")

    def clustered_statistic(sampled: Sequence[tuple[Observation, ...]]) -> float | None:
        return statistic(tuple(chain.from_iterable(sampled)))

    return _estimate_from_clusters(
        clusters,
        clustered_statistic,
        n=n,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )


def _bootstrap_additive_mean(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    resamples: int,
    seed: int,
    ci_level: float,
    minimum_defined_rate: float,
) -> Estimate:
    _validate_bootstrap(
        resamples=resamples,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )
    clusters = _ordered_clusters(observations_by_card)
    n = sum(map(len, clusters))
    if not clusters:
        return Estimate(
            est=None,
            lo=None,
            hi=None,
            n=0,
            bootstrap_resamples=resamples,
            bootstrap_defined=0,
        )

    cluster_sums = np.asarray([math.fsum(cluster) for cluster in clusters], dtype=np.float64)
    cluster_sizes = np.asarray([len(cluster) for cluster in clusters], dtype=np.int64)
    estimate = float(cluster_sums.sum() / cluster_sizes.sum())
    rng = np.random.default_rng(seed)
    values = np.empty(resamples, dtype=np.float64)
    cluster_count = len(clusters)
    for index in range(resamples):
        sampled = rng.choice(cluster_count, size=cluster_count, replace=True)
        values[index] = cluster_sums[sampled].sum() / cluster_sizes[sampled].sum()

    tail = (1.0 - ci_level) / 2.0
    lower, upper = np.quantile(values, (tail, 1.0 - tail))
    return Estimate(
        est=estimate,
        lo=float(lower),
        hi=float(upper),
        n=n,
        bootstrap_resamples=resamples,
        bootstrap_defined=resamples,
    )


def mean(values: Sequence[float]) -> float | None:
    """Return the arithmetic mean, or ``None`` for an empty sequence."""
    if not values:
        return None

    return math.fsum(values) / len(values)


def rate(values: Sequence[bool]) -> float | None:
    """Return the true-value proportion, or ``None`` for an empty sequence."""
    if not values:
        return None

    return sum(values) / len(values)


def quantile(values: Sequence[float], *, q: float) -> float | None:
    """Return a linearly interpolated quantile, or ``None`` for an empty sequence."""
    if not 0.0 <= q <= 1.0:
        raise ValueError("q must be between zero and one")

    if not values:
        return None

    return float(np.quantile(values, q))


def median(values: Sequence[float]) -> float | None:
    """Return the median, or ``None`` for an empty sequence."""
    return quantile(values, q=0.5)


def normalized_entropy(verdicts: Sequence[Verdict]) -> float | None:
    """Return Shannon entropy normalized by the four verdict classes."""
    if not verdicts:
        return None

    counts = dict.fromkeys(VERDICTS, 0)
    for verdict in verdicts:
        counts[verdict] += 1

    total = len(verdicts)
    entropy = -math.fsum(
        proportion * math.log(proportion)
        for count in counts.values()
        if count
        for proportion in (count / total,)
    )
    return entropy / math.log(len(VERDICTS))


def cohen_kappa(label_pairs: Sequence[LabelPair]) -> float | None:
    """Return Cohen's kappa for paired four-class labels, or ``None`` if undefined."""
    if not label_pairs:
        return None

    first_counts = dict.fromkeys(VERDICTS, 0)
    second_counts = dict.fromkeys(VERDICTS, 0)
    agreements = 0
    for first, second in label_pairs:
        first_counts[first] += 1
        second_counts[second] += 1
        agreements += first == second

    total = len(label_pairs)
    observed = agreements / total
    expected = math.fsum(first_counts[verdict] * second_counts[verdict] for verdict in VERDICTS) / (
        total * total
    )

    if math.isclose(expected, 1.0):
        return None
    return (observed - expected) / (1.0 - expected)


def _krippendorff_alpha_units(rating_units: Sequence[Sequence[Verdict]]) -> float | None:
    pairable_units = tuple(
        tuple(ratings) for ratings in rating_units if len(ratings) >= _MIN_RATINGS_PER_CARD
    )
    if not pairable_units:
        return None

    pooled_counts = dict.fromkeys(VERDICTS, 0)
    observed_disagreement_sum = 0.0
    rating_count = 0
    for ratings in pairable_units:
        unit_counts = dict.fromkeys(VERDICTS, 0)
        for rating in ratings:
            unit_counts[rating] += 1
            pooled_counts[rating] += 1

        unit_size = len(ratings)
        rating_count += unit_size
        agreeing_ordered_pairs = sum(count * (count - 1) for count in unit_counts.values())
        observed_disagreement_sum += (unit_size * (unit_size - 1) - agreeing_ordered_pairs) / (
            unit_size - 1
        )

    observed_disagreement = observed_disagreement_sum / rating_count
    agreeing_expected_pairs = sum(count * (count - 1) for count in pooled_counts.values())
    expected_disagreement = 1.0 - agreeing_expected_pairs / (rating_count * (rating_count - 1))
    if math.isclose(expected_disagreement, 0.0):
        return None

    return 1.0 - observed_disagreement / expected_disagreement


def krippendorff_alpha(
    ratings_by_card: Mapping[str, Sequence[Verdict]],
) -> float | None:
    """Return nominal Krippendorff's alpha; cards with fewer than two ratings are omitted."""
    rating_units = tuple(
        ratings
        for card_id in sorted(ratings_by_card)
        if len(ratings := tuple(ratings_by_card[card_id])) >= _MIN_RATINGS_PER_CARD
    )

    return _krippendorff_alpha_units(rating_units)


def bootstrap_mean(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    return _bootstrap_additive_mean(
        observations_by_card,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )


def bootstrap_rate(
    observations_by_card: Mapping[str, Sequence[bool]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    numeric = {
        card_id: tuple(float(value) for value in values)
        for card_id, values in observations_by_card.items()
    }
    estimate = _bootstrap_additive_mean(
        numeric,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )
    return estimate.model_copy(
        update={
            "successes": sum(value for values in observations_by_card.values() for value in values)
        }
    )


def bootstrap_quantile(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    q: float,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    def statistic(values: Sequence[float]) -> float | None:
        return quantile(values, q=q)

    return cluster_bootstrap(
        observations_by_card,
        statistic,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )


def bootstrap_median(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    return cluster_bootstrap(
        observations_by_card,
        median,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )


def bootstrap_cohen_kappa(
    label_pairs_by_card: Mapping[str, Sequence[LabelPair]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    return cluster_bootstrap(
        label_pairs_by_card,
        cohen_kappa,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )


def bootstrap_krippendorff_alpha(
    ratings_by_card: Mapping[str, Sequence[Verdict]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
    minimum_defined_rate: float = _DEFAULT_MINIMUM_DEFINED_RATE,
) -> Estimate:
    """Bootstrap nominal alpha by card; ``n`` is the number of pairable cards."""
    clusters = tuple(
        ratings
        for card_id in sorted(ratings_by_card)
        if len(ratings := tuple(ratings_by_card[card_id])) >= _MIN_RATINGS_PER_CARD
    )

    return _estimate_from_clusters(
        clusters,
        _krippendorff_alpha_units,
        n=len(clusters),
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
        minimum_defined_rate=minimum_defined_rate,
    )
