"""Backoff/rate-limit tests with a fake clock — no sleeping, no network."""

from __future__ import annotations

from collections.abc import Mapping

import pytest

from atlas_tools.wikidata.transport import (
    FixtureMissError,
    FixtureTransport,
    RequestsTransport,
    RetryPolicy,
)
from tests.wikidata.conftest import RESPONSES


class FakeReply:
    def __init__(self, status_code: int, content: bytes = b""):
        self.status_code = status_code
        self.content = content
        self.headers: dict[str, str] = {}


class FakeSession:
    def __init__(self, replies: list[FakeReply]):
        self._replies = list(replies)
        self.requests: list[tuple[str, dict[str, str]]] = []

    def get(
        self,
        url: str,
        params: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
    ) -> FakeReply:
        self.requests.append((url, dict(params or {})))
        return self._replies.pop(0)


def test_backoff_is_exponential_then_returns_success():
    session = FakeSession([FakeReply(429), FakeReply(500), FakeReply(200, b"ok")])
    sleeps: list[float] = []
    transport = RequestsTransport(
        # rate limiting disabled to isolate backoff
        policy=RetryPolicy(
            rate_limit_per_sec=0, max_retries=3, backoff_base_seconds=1.5
        ),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
    )
    response = transport.get("http://example.test", {"q": "1"})
    assert response.status == 200
    assert response.body == b"ok"
    assert sleeps == [1.5, 3.0]  # base * 2**attempt
    assert len(session.requests) == 3


def test_backoff_gives_up_and_returns_final_status():
    session = FakeSession([FakeReply(500)] * 3)
    sleeps: list[float] = []
    transport = RequestsTransport(
        policy=RetryPolicy(
            rate_limit_per_sec=0, max_retries=2, backoff_base_seconds=1.0
        ),
        session=session,
        sleep=sleeps.append,
        clock=lambda: 0.0,
    )
    response = transport.get("http://example.test")
    assert response.status == 500  # returned, not raised: the ladder handles it
    assert not response.ok
    assert sleeps == [1.0, 2.0]
    assert len(session.requests) == 3


def test_rate_limit_sleeps_for_remaining_interval():
    session = FakeSession([FakeReply(200), FakeReply(200)])
    sleeps: list[float] = []
    clock_values = [0.0, 0.2, 0.5]  # 1st stamp, elapsed check, 2nd stamp
    transport = RequestsTransport(
        policy=RetryPolicy(rate_limit_per_sec=2.0, max_retries=0),  # 0.5s interval
        session=session,
        sleep=sleeps.append,
        clock=lambda: clock_values.pop(0),
    )
    transport.get("http://example.test")
    assert sleeps == []  # first request never waits
    transport.get("http://example.test")
    assert sleeps == [pytest.approx(0.3)]  # 0.5 - elapsed 0.2


def test_fixture_transport_counts_calls_and_raises_on_miss():
    transport = FixtureTransport(RESPONSES)
    assert transport.calls == 0
    with pytest.raises(FixtureMissError):
        transport.get("http://not-a-fixture.test", {"q": "nope"})
    assert transport.calls == 1
