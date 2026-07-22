"""HTTP transport abstraction.

All network access in the miner goes through a ``Transport`` so tests never
touch the network:

- ``RequestsTransport``: production transport with a rate limiter and
  exponential backoff (a :class:`RetryPolicy` value). The sleep function and
  monotonic clock are injectable so backoff/rate-limit behaviour is
  unit-testable without sleeping.
- ``FixtureTransport``: serves committed response files keyed by request and
  counts calls; raises ``FixtureMissError`` on a miss.

A transport returns a :class:`Response`. Non-200 statuses are returned
(after retries, for ``RequestsTransport``) rather than raised: the
example-ladder logic in ``properties.py`` interprets them as fallback
triggers.
"""

import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from http import HTTPStatus
from os import PathLike
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeFloat,
    NonNegativeInt,
    PositiveFloat,
    TypeAdapter,
)

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes

# Statuses that RequestsTransport retries with exponential backoff before
# giving up and returning the final status to the caller. 500 is deliberately
# excluded: WDQS/QLever signal deterministic query timeouts as 500, the
# example ladder treats them as fallback triggers, and retrying multiplies a
# 60-second server-side timeout by max_retries for zero benefit.
RETRYABLE_STATUSES = frozenset({429, 502, 503, 504})

# Synthesized status for connection errors / timeouts (never a real reply).
CONNECTION_FAILED_STATUS = 599

# Transient failures: retrying later can succeed, so these must never be
# cached (see cache.py). Deterministic failures (a WDQS query that always
# times out with 500, say) are cached, which the example-ladder fallback
# semantics rely on.
TRANSIENT_STATUSES = frozenset({429, 503, CONNECTION_FAILED_STATUS})

USER_AGENT = "atlas-tools-wikidata/0.1 (research tooling)"


@dataclass(frozen=True)
class Response:
    """One HTTP response: status, lower-cased headers, raw body bytes."""

    status: int
    headers: Mapping[str, str] = field(default_factory=dict)
    body: bytes = b""

    @property
    def ok(self) -> bool:
        return self.status == HTTPStatus.OK


class _RequestKey(BaseModel):
    """Canonical request identity; hashing it yields the fixture/cache key."""

    url: str
    params: dict[str, str]


def request_key(url: str, params: Mapping[str, str] | None) -> str:
    """Deterministic key for a GET request: sha256 of canonical JSON."""
    return sha256_bytes(canonical_json_bytes(_RequestKey(url=url, params=dict(params or {}))))


class Transport(Protocol):
    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        """Perform a GET; never raises for HTTP-level failures."""
        ...


class RetryPolicy(BaseModel):
    """Politeness knobs for the production transport (also a config value).

    ``rate_limit_per_sec`` is enforced *per host*: politeness is a
    property of the server being asked, so pacing QLever never slows the
    WDQS fallback rung or the wikibase API, and vice versa.
    """

    rate_limit_per_sec: NonNegativeFloat = 1.0
    max_retries: NonNegativeInt = 3
    backoff_base_seconds: NonNegativeFloat = 1.0
    timeout_seconds: PositiveFloat = 60.0
    # Upper bound on honoring a server's Retry-After header, so a buggy or
    # hostile header cannot stall a run indefinitely.
    max_retry_after_seconds: NonNegativeFloat = 120.0

    model_config = ConfigDict(extra="forbid", frozen=True)


def retry_after_seconds(headers: Mapping[str, str], now: Callable[[], datetime]) -> float | None:
    """Parse a ``Retry-After`` header: delta-seconds or an HTTP date.

    Returns the non-negative wait in seconds, or ``None`` when the header is
    absent or unparseable (callers fall back to exponential backoff).
    """
    raw = headers.get("retry-after")
    if raw is None:
        return None

    raw = raw.strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        pass

    try:
        at = parsedate_to_datetime(raw)
    except TypeError, ValueError:
        return None
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)

    return max(0.0, (at - now()).total_seconds())


class SessionResponse(Protocol):
    """The subset of ``requests.Response`` the transport reads."""

    @property
    def status_code(self) -> int: ...
    @property
    def headers(self) -> Mapping[str, str]: ...
    @property
    def content(self) -> bytes: ...


class Session(Protocol):
    """The subset of ``requests.Session`` the transport calls."""

    def get(
        self,
        url: str,
        *,
        params: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
    ) -> SessionResponse: ...


def _requests_session() -> Session:
    # Imported lazily: tests inject fake sessions and never need requests.
    import requests  # noqa: PLC0415

    return requests.Session()


class _HostRateLimiter:
    """Thread-safe per-host request pacing.

    Politeness is a property of the server, not of the client process:
    each host gets its own schedule at the configured rate, so pacing one
    endpoint never slows another. Slots are reserved under a lock and
    slept for outside it, so concurrent workers queue politely on the
    same host instead of racing the interval check.
    """

    def __init__(
        self,
        *,
        min_interval: float,
        clock: Callable[[], float],
        sleep: Callable[[float], None],
    ) -> None:
        self._min_interval = min_interval
        self._clock = clock
        self._sleep = sleep
        self._lock = threading.Lock()
        self._next_slot_at: dict[str, float] = {}

    def wait(self, url: str) -> None:
        """Block until the reserved slot for ``url``'s host arrives."""
        if self._min_interval <= 0:
            return
        host = urlsplit(url).netloc
        with self._lock:
            now = self._clock()
            slot = max(self._next_slot_at.get(host, now), now)
            self._next_slot_at[host] = slot + self._min_interval
        if (delay := slot - now) > 0:
            self._sleep(delay)


class RequestsTransport:
    """Polite production transport: rate limit + exponential backoff.

    - Rate limit: at most ``policy.rate_limit_per_sec`` requests per second
      *per host* (see :class:`_HostRateLimiter`), safe under concurrent
      callers.
    - Backoff: on retryable statuses or connection errors, sleeps and
      retries up to ``policy.max_retries`` times, then returns the final
      response (or a synthesized status-599 response for a connection
      error); it never raises. The wait honors the server's ``Retry-After``
      header when present (delta-seconds or HTTP date, capped at
      ``policy.max_retry_after_seconds``), falling back to exponential
      backoff (``policy.backoff_base_seconds * 2**attempt``).
    - Sessions: ``requests.Session`` is not thread-safe, so each thread
      lazily gets its own unless an explicit ``session`` was injected
      (tests inject fakes and drive them single-threaded).
    """

    def __init__(
        self,
        *,
        policy: RetryPolicy | None = None,
        session: Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._policy = policy if policy is not None else RetryPolicy()
        self._injected_session = session
        self._thread_sessions = threading.local()
        self._limiter = _HostRateLimiter(
            min_interval=(
                1.0 / self._policy.rate_limit_per_sec
                if self._policy.rate_limit_per_sec > 0
                else 0.0
            ),
            clock=clock,
            sleep=sleep,
        )
        self._sleep = sleep
        self._now = now

    def _session(self) -> Session:
        if self._injected_session is not None:
            return self._injected_session
        session: Session | None = getattr(self._thread_sessions, "session", None)
        if session is None:
            session = _requests_session()
            self._thread_sessions.session = session
        return session

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        response = Response(status=CONNECTION_FAILED_STATUS)
        for attempt in range(self._policy.max_retries + 1):
            self._limiter.wait(url)
            try:
                reply = self._session().get(
                    url,
                    params=dict(params or {}),
                    headers={"User-Agent": USER_AGENT},
                    timeout=self._policy.timeout_seconds,
                )
                response = Response(
                    status=int(reply.status_code),
                    headers={key.lower(): value for key, value in reply.headers.items()},
                    body=reply.content,
                )
            except OSError:
                # Connection errors and timeouts: every requests transport
                # failure derives from OSError (requests.RequestException
                # subclasses IOError). Anything else is a programming
                # error and propagates.
                response = Response(status=CONNECTION_FAILED_STATUS)
            if (
                response.status not in RETRYABLE_STATUSES
                and response.status != CONNECTION_FAILED_STATUS
            ):
                return response
            if attempt < self._policy.max_retries:
                self._sleep(self._retry_wait(response, attempt))
        return response

    def _retry_wait(self, response: Response, attempt: int) -> float:
        """Server-directed wait when available, else exponential backoff."""
        backoff = self._policy.backoff_base_seconds * (2**attempt)
        server_wait = retry_after_seconds(response.headers, self._now)
        if server_wait is None:
            return backoff

        return max(backoff, min(server_wait, self._policy.max_retry_after_seconds))


class FixtureMissError(KeyError):
    """A test transport was asked for a request it has no fixture for."""


class FixtureEntry(BaseModel):
    """One committed response in ``fixture_dir/index.json``.

    The index also stores the human-readable ``url``/``params`` per entry so
    misses can be diagnosed and the generator script stays reviewable.
    """

    file: str
    status: int = 200
    headers: dict[str, str] = Field(default_factory=dict)
    url: str = ""
    params: dict[str, str] = Field(default_factory=dict)


_FIXTURE_INDEX_ADAPTER = TypeAdapter(dict[str, FixtureEntry])


class FixtureTransport:
    """Serves committed responses keyed by ``request_key(url, params)``."""

    def __init__(self, fixture_dir: PathLike) -> None:
        self._dir = Path(fixture_dir)
        self._index = _FIXTURE_INDEX_ADAPTER.validate_json((self._dir / "index.json").read_bytes())

        self.calls = 0
        # Concurrent example mining hits fixtures from worker threads; the
        # call counter must not under-count in those tests.
        self._lock = threading.Lock()

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        with self._lock:
            self.calls += 1
        key = request_key(url, params)
        entry = self._index.get(key)

        if entry is None:
            raise FixtureMissError(
                f"no fixture for request key {key} url={url!r} params={params!r}"
            )

        return Response(
            status=entry.status,
            headers={key.lower(): value for key, value in entry.headers.items()},
            body=(self._dir / entry.file).read_bytes(),
        )
