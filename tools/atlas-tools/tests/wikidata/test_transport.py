"""Backoff and rate-limit tests with a fake clock: no sleeping, no network."""

from collections.abc import Mapping
from datetime import UTC, datetime

import pytest

from atlas_tools.wikidata.transport import (
    FixtureMissError,
    FixtureTransport,
    RequestsTransport,
    RetryPolicy,
    retry_after_seconds,
)
from tests.wikidata.conftest import RESPONSES


class FakeReply:
    def __init__(
        self,
        status_code: int,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.content = content
        self.headers: dict[str, str] = dict(headers or {})


class FakeSession:
    def __init__(self, replies: list[FakeReply]) -> None:
        self._replies = list(replies)
        self.requests: list[tuple[str, dict[str, str]]] = []

    # The Session protocol passes ``headers`` and ``timeout`` by keyword,
    # so they cannot be underscore-renamed; the fake ignores them.
    def get(
        self,
        url: str,
        params: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,  # noqa: ARG002
        timeout: float | None = None,  # noqa: ARG002
    ) -> FakeReply:
        self.requests.append((url, dict(params or {})))
        return self._replies.pop(0)


def test_backoff_is_exponential_then_returns_success() -> None:
    session = FakeSession([FakeReply(429), FakeReply(503), FakeReply(200, b"ok")])
    sleeps: list[float] = []
    transport = RequestsTransport(
        # rate limiting disabled to isolate backoff
        policy=RetryPolicy(rate_limit_per_sec=0, max_retries=3, backoff_base_seconds=1.5),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
    )
    response = transport.get("http://example.test", {"q": "1"})
    assert response.status == 200
    assert response.body == b"ok"
    assert sleeps == [1.5, 3.0]  # base * 2**attempt
    assert len(session.requests) == 3


_NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=UTC)


def _fixed_now() -> datetime:
    return _NOW


def test_retry_after_parsing() -> None:
    assert retry_after_seconds({"retry-after": "7"}, _fixed_now) == 7.0
    assert retry_after_seconds({"retry-after": "0"}, _fixed_now) == 0.0
    assert retry_after_seconds({"retry-after": "-3"}, _fixed_now) == 0.0
    # HTTP-date form: 90 seconds ahead of the fixed clock.
    assert retry_after_seconds({"retry-after": "Sat, 11 Jul 2026 12:01:30 GMT"}, _fixed_now) == 90.0
    # Dates in the past clamp to zero; garbage and absence yield None.
    assert retry_after_seconds({"retry-after": "Sat, 11 Jul 2026 11:00:00 GMT"}, _fixed_now) == 0.0
    assert retry_after_seconds({"retry-after": "soonish"}, _fixed_now) is None
    assert retry_after_seconds({}, _fixed_now) is None


def test_retry_after_header_overrides_exponential_backoff() -> None:
    session = FakeSession(
        [
            FakeReply(429, headers={"Retry-After": "7"}),
            FakeReply(429, headers={"Retry-After": "600"}),  # above the cap
            FakeReply(200, b"ok"),
        ]
    )
    sleeps: list[float] = []
    transport = RequestsTransport(
        policy=RetryPolicy(
            rate_limit_per_sec=0,
            max_retries=3,
            backoff_base_seconds=1.0,
            max_retry_after_seconds=120.0,
        ),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
        now=lambda: _NOW,
    )
    response = transport.get("http://example.test")
    assert response.status == 200
    # First wait: server-directed 7s (not the 1s backoff). Second: the 600s
    # request is capped at 120s.
    assert sleeps == [7.0, 120.0]


def test_retry_after_never_waits_less_than_backoff() -> None:
    # A tiny Retry-After must not defeat exponential backoff.
    session = FakeSession(
        [
            FakeReply(429, headers={"Retry-After": "0"}),
            FakeReply(429, headers={"Retry-After": "0"}),
            FakeReply(200, b"ok"),
        ]
    )
    sleeps: list[float] = []
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=0, max_retries=2, backoff_base_seconds=1.0),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
        now=lambda: _NOW,
    )
    assert transport.get("http://example.test").status == 200
    assert sleeps == [1.0, 2.0]


def test_backoff_gives_up_and_returns_final_status() -> None:
    session = FakeSession([FakeReply(503)] * 3)
    sleeps: list[float] = []
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=0, max_retries=2, backoff_base_seconds=1.0),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
    )
    response = transport.get("http://example.test")
    assert response.status == 503  # returned, not raised: the ladder handles it
    assert not response.ok
    assert sleeps == [1.0, 2.0]
    assert len(session.requests) == 3


def test_500_is_deterministic_and_never_retried() -> None:
    # WDQS/QLever signal query timeouts as 500; the ladder needs the failure
    # immediately, not after max_retries * 60s.
    session = FakeSession([FakeReply(500), FakeReply(200, b"never reached")])
    sleeps: list[float] = []
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=0, max_retries=3, backoff_base_seconds=1.0),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
    )
    response = transport.get("http://example.test")
    assert response.status == 500
    assert sleeps == []
    assert len(session.requests) == 1


def test_rate_limit_sleeps_for_remaining_interval() -> None:
    session = FakeSession([FakeReply(200), FakeReply(200)])
    sleeps: list[float] = []
    clock_values = [0.0, 0.2]  # slot reservations for the two requests
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=2.0, max_retries=0),  # 0.5s interval
        session=session,
        sleep=sleeps.append,
        clock=lambda: clock_values.pop(0),
    )
    transport.get("http://example.test")
    assert sleeps == []  # first request never waits
    transport.get("http://example.test")
    assert sleeps == [pytest.approx(0.3)]  # next slot at 0.5, now 0.2


def test_rate_limit_is_per_host() -> None:
    # Politeness is a property of the server being asked: pacing one host
    # must never delay the first request to another (the WDQS fallback
    # rung does not queue behind QLever's schedule).
    session = FakeSession([FakeReply(200), FakeReply(200), FakeReply(200)])
    sleeps: list[float] = []
    clock_values = [0.0, 0.0, 0.0]
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=1.0, max_retries=0),
        session=session,
        sleep=sleeps.append,
        clock=lambda: clock_values.pop(0),
    )
    transport.get("http://qlever.test/api")
    transport.get("http://wdqs.test/sparql")  # different host: no wait
    assert sleeps == []
    transport.get("http://qlever.test/other-path")  # same host: full interval
    assert sleeps == [pytest.approx(1.0)]


def test_fixture_transport_counts_calls_and_raises_on_miss() -> None:
    transport = FixtureTransport(RESPONSES)
    assert transport.calls == 0
    with pytest.raises(FixtureMissError):
        transport.get("http://not-a-fixture.test", {"q": "nope"})
    assert transport.calls == 1
