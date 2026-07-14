"""Dirichlet posterior, Wilson lower-bound, and feedability arithmetic.

These are the closed-form pieces of the ladder's aggregation and its
Coincident release gate; keeping them dependency-light makes the hand-computed
acceptance fixtures direct to verify.
"""

import math
from collections.abc import Mapping

from scipy.stats import norm

from atlas_tools.relation.eval.schema import PLACEMENT_CLASSES, PlacementClass

_DIRICHLET_ALPHA = 1.0


def dirichlet_posterior_mean(
    counts: Mapping[PlacementClass, int],
) -> dict[PlacementClass, float]:
    """Return the Dirichlet(1,1,1)-smoothed posterior mean over {C, P, O}.

    Unclear votes are excluded upstream: they carry no placement evidence and
    are surfaced through the ambiguity column instead.
    """
    for placement_class, count in counts.items():
        if count < 0:
            raise ValueError(f"posterior count for {placement_class} is negative")
    total = sum(counts.get(placement_class, 0) for placement_class in PLACEMENT_CLASSES)
    denominator = total + _DIRICHLET_ALPHA * len(PLACEMENT_CLASSES)
    return {
        placement_class: (counts.get(placement_class, 0) + _DIRICHLET_ALPHA) / denominator
        for placement_class in PLACEMENT_CLASSES
    }


def normalized_posterior_entropy(posterior: Mapping[PlacementClass, float]) -> float:
    """Return Shannon entropy of the {C, P, O} posterior, normalized to [0, 1]."""
    probabilities = [posterior[placement_class] for placement_class in PLACEMENT_CLASSES]
    if not math.isclose(math.fsum(probabilities), 1.0, abs_tol=1e-9):
        raise ValueError("posterior probabilities must sum to one")
    entropy = -math.fsum(p * math.log(p) for p in probabilities if p > 0.0)
    return entropy / math.log(len(PLACEMENT_CLASSES))


def wilson_lower_bound(successes: int, trials: int, *, confidence: float = 0.95) -> float:
    """Return the one-sided Wilson score lower confidence bound for a proportion."""
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must be between zero and one")
    if trials <= 0:
        raise ValueError("Wilson bound requires at least one trial")
    if not 0 <= successes <= trials:
        raise ValueError("successes must be between zero and trials")
    z = float(norm.ppf(confidence))
    proportion = successes / trials
    z_squared = z * z
    center = proportion + z_squared / (2 * trials)
    margin = z * math.sqrt((proportion * (1 - proportion) + z_squared / (4 * trials)) / trials)
    return max(0.0, (center - margin) / (1 + z_squared / trials))


def minimum_feedable_count(target: float, *, confidence: float = 0.95) -> int:
    """Return the smallest zero-error stratum size whose Wilson LCB clears ``target``.

    With every prediction correct the Wilson lower bound reduces to
    ``n / (n + z^2)``, so the requirement ``n / (n + z^2) >= target`` gives
    ``n >= z^2 * target / (1 - target)``.
    """
    if not 0.0 < target < 1.0:
        raise ValueError("target must be between zero and one")
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must be between zero and one")
    z = float(norm.ppf(confidence))
    exact = z * z * target / (1.0 - target)
    minimum = max(1, math.ceil(exact))
    # Guard the ceiling against float error on exact boundaries.
    while minimum > 1 and wilson_lower_bound(minimum - 1, minimum - 1, confidence=confidence) >= (
        target
    ):
        minimum -= 1
    while wilson_lower_bound(minimum, minimum, confidence=confidence) < target:
        minimum += 1
    return minimum
