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
_MIN_RATINGS_PER_CARD = 2
_NULL_ESTIMATE = Estimate(est=None, lo=None, hi=None, n=0)


def _defined(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None

    return value


def _validate_bootstrap(*, resamples: int, ci_level: float) -> None:
    if resamples <= 0:
        raise ValueError("resamples must be positive")

    if not 0.0 < ci_level < 1.0:
        raise ValueError("ci_level must be between zero and one")


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
) -> Estimate:
    _validate_bootstrap(resamples=resamples, ci_level=ci_level)
    if not clusters:
        return _NULL_ESTIMATE

    estimate = _defined(statistic(clusters))
    if estimate is None:
        return _NULL_ESTIMATE

    rng = np.random.default_rng(seed)
    bootstrap_values: list[float] = []
    cluster_count = len(clusters)
    for _ in range(resamples):
        sampled_indices = np.sort(rng.choice(cluster_count, size=cluster_count, replace=True))
        sampled_clusters = tuple(clusters[index] for index in sampled_indices)
        value = _defined(statistic(sampled_clusters))
        if value is not None:
            bootstrap_values.append(value)

    if not bootstrap_values:
        return _NULL_ESTIMATE

    tail = (1.0 - ci_level) / 2.0
    lower, upper = np.quantile(bootstrap_values, (tail, 1.0 - tail))
    # ``Estimate`` requires the point estimate to lie in its interval. A finite Monte Carlo
    # percentile interval can very occasionally miss it, so retain the percentile bounds while
    # expanding only the offending side.
    lo = min(float(lower), estimate)
    hi = max(float(upper), estimate)
    return Estimate(est=estimate, lo=lo, hi=hi, n=n)


def cluster_bootstrap[Observation](
    observations_by_card: Mapping[str, Sequence[Observation]],
    statistic: Statistic[Observation],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
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
) -> Estimate:
    return cluster_bootstrap(
        observations_by_card,
        mean,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
    )


def bootstrap_rate(
    observations_by_card: Mapping[str, Sequence[bool]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
) -> Estimate:
    return cluster_bootstrap(
        observations_by_card,
        rate,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
    )


def bootstrap_quantile(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    q: float,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
) -> Estimate:
    def statistic(values: Sequence[float]) -> float | None:
        return quantile(values, q=q)

    return cluster_bootstrap(
        observations_by_card,
        statistic,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
    )


def bootstrap_median(
    observations_by_card: Mapping[str, Sequence[float]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
) -> Estimate:
    return cluster_bootstrap(
        observations_by_card,
        median,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
    )


def bootstrap_cohen_kappa(
    label_pairs_by_card: Mapping[str, Sequence[LabelPair]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
) -> Estimate:
    return cluster_bootstrap(
        label_pairs_by_card,
        cohen_kappa,
        resamples=resamples,
        seed=seed,
        ci_level=ci_level,
    )


def bootstrap_krippendorff_alpha(
    ratings_by_card: Mapping[str, Sequence[Verdict]],
    *,
    resamples: int = _DEFAULT_RESAMPLES,
    seed: int = _DEFAULT_SEED,
    ci_level: float = _DEFAULT_CI_LEVEL,
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
    )
