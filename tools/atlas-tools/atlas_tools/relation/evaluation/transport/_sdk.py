"""Share generated-SDK policy across OpenRouter capabilities."""

from datetime import timedelta
from typing import Final

from openrouter.utils.retries import BackoffStrategy, RetryConfig

NO_RETRIES: Final = RetryConfig(
    strategy="none",
    backoff=BackoffStrategy(0, 0, 1.0, 0),
    retry_connection_errors=False,
)


def timeout_milliseconds(timeout: timedelta) -> int:
    """Convert one positive timeout without silently rounding it to zero."""
    milliseconds = round(timeout.total_seconds() * 1_000)
    if milliseconds <= 0:
        raise ValueError("provider request timeout must be positive")
    return milliseconds
