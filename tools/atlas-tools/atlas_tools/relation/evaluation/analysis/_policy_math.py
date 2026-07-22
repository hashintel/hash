"""Provide exact statistical rules shared by policy construction and validation."""

import math
from statistics import NormalDist


def wilson_lower_bound(successes: int, trials: int, *, confidence: float) -> float:
    """Return a one-sided Wilson lower confidence bound.

    Raises:
        ValueError: Confidence is outside `(0, 1)`, trials are not positive,
            or successes are outside `[0, trials]`.

    """
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must be in (0, 1)")
    if trials <= 0:
        raise ValueError("Wilson bound requires at least one trial")
    if not 0 <= successes <= trials:
        raise ValueError("successes must be between zero and trials")

    z = NormalDist().inv_cdf(confidence)
    proportion = successes / trials
    z_squared = z * z
    center = proportion + z_squared / (2 * trials)
    margin = z * math.sqrt((proportion * (1.0 - proportion) + z_squared / (4 * trials)) / trials)

    return max(0.0, (center - margin) / (1.0 + z_squared / trials))


def minimum_feedable_count(target: float, *, confidence: float) -> int:
    """Return the smallest zero-error sample whose Wilson bound clears target.

    Raises:
        ValueError: Target or confidence is outside `(0, 1)`.

    """
    if not 0.0 < target < 1.0:
        raise ValueError("precision target must be in (0, 1)")
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must be in (0, 1)")

    z = NormalDist().inv_cdf(confidence)
    minimum = max(1, math.ceil(z * z * target / (1.0 - target)))

    while (
        minimum > 1
        and wilson_lower_bound(
            minimum - 1,
            minimum - 1,
            confidence=confidence,
        )
        >= target
    ):
        minimum -= 1

    while wilson_lower_bound(minimum, minimum, confidence=confidence) < target:
        minimum += 1

    return minimum
