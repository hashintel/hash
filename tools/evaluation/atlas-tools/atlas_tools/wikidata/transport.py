"""HTTP transport abstraction.

All network access in the miner goes through a ``Transport`` so tests never
touch the network:

- ``RequestsTransport`` — production transport with a rate limiter and
  exponential backoff. The sleep function and monotonic clock are injectable
  so backoff/rate-limit behaviour is unit-testable without sleeping.
- ``FixtureTransport`` — serves committed response files keyed by request and
  counts calls; raises ``FixtureMissError`` on a miss.

A transport returns ``(status, headers, body_bytes)``. Non-200 statuses are
returned (after retries, for ``RequestsTransport``) rather than raised: the
example-ladder logic in ``properties.py`` interprets them as fallback
triggers.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable, Protocol

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes

# Statuses that RequestsTransport retries with exponential backoff before
# giving up and returning the final status to the caller.
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})

USER_AGENT = "atlas-tools-wikidata/0.1 (research tooling)"


def request_key(url: str, params: dict[str, str] | None) -> str:
    """Deterministic key for a GET request: sha256 of canonical JSON."""
    return sha256_bytes(canonical_json_bytes({"url": url, "params": params or {}}))


class Transport(Protocol):
    def get(
        self, url: str, params: dict[str, str] | None = None
    ) -> tuple[int, dict[str, str], bytes]:
        """Perform a GET; return (status, lower-cased headers, body bytes)."""
        ...


class RequestsTransport:
    """Polite production transport: rate limit + exponential backoff.

    - Rate limit: at most ``rate_limit_per_sec`` requests per second,
      enforced by sleeping for the remaining inter-request interval.
    - Backoff: on retryable statuses or connection errors, sleeps
      ``backoff_base_seconds * 2**attempt`` and retries, up to
      ``max_retries`` retries. The final response (or a synthesized status
      599 for a connection error) is returned, never raised.
    """

    def __init__(
        self,
        *,
        rate_limit_per_sec: float = 1.0,
        max_retries: int = 3,
        backoff_base_seconds: float = 1.0,
        session: Any | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        timeout_seconds: float = 60.0,
    ) -> None:
        if session is None:
            import requests

            session = requests.Session()
        self._session = session
        self._min_interval = 1.0 / rate_limit_per_sec if rate_limit_per_sec > 0 else 0.0
        self._max_retries = max_retries
        self._backoff_base = backoff_base_seconds
        self._sleep = sleep
        self._clock = clock
        self._timeout = timeout_seconds
        self._last_request_at: float | None = None

    def _respect_rate_limit(self) -> None:
        if self._last_request_at is not None and self._min_interval > 0:
            elapsed = self._clock() - self._last_request_at
            remaining = self._min_interval - elapsed
            if remaining > 0:
                self._sleep(remaining)
        self._last_request_at = self._clock()

    def get(
        self, url: str, params: dict[str, str] | None = None
    ) -> tuple[int, dict[str, str], bytes]:
        status, headers, body = 599, {}, b""
        for attempt in range(self._max_retries + 1):
            self._respect_rate_limit()
            try:
                response = self._session.get(
                    url,
                    params=params or {},
                    headers={"User-Agent": USER_AGENT},
                    timeout=self._timeout,
                )
                status = int(response.status_code)
                headers = {k.lower(): v for k, v in dict(response.headers).items()}
                body = response.content
            except Exception:  # connection error / timeout
                status, headers, body = 599, {}, b""
            if status not in RETRYABLE_STATUSES and status != 599:
                return status, headers, body
            if attempt < self._max_retries:
                self._sleep(self._backoff_base * (2**attempt))
        return status, headers, body


class FixtureMissError(KeyError):
    """A test transport was asked for a request it has no fixture for."""


class FixtureTransport:
    """Serves committed responses from ``fixture_dir``.

    ``fixture_dir/index.json`` maps ``request_key(url, params)`` to
    ``{"file": <relative path>, "status": int, "headers": {..}}``. The index
    also stores the human-readable ``url``/``params`` per entry so misses can
    be diagnosed and the generator script stays reviewable.
    """

    def __init__(self, fixture_dir: Path | str) -> None:
        self._dir = Path(fixture_dir)
        with open(self._dir / "index.json", encoding="utf-8") as f:
            self._index: dict[str, dict[str, Any]] = json.load(f)
        self.calls = 0

    def get(
        self, url: str, params: dict[str, str] | None = None
    ) -> tuple[int, dict[str, str], bytes]:
        self.calls += 1
        key = request_key(url, params)
        entry = self._index.get(key)
        if entry is None:
            raise FixtureMissError(
                f"no fixture for request key {key} url={url!r} params={params!r}"
            )
        body = (self._dir / entry["file"]).read_bytes()
        headers = {str(k).lower(): str(v) for k, v in entry.get("headers", {}).items()}
        return int(entry.get("status", 200)), headers, body
