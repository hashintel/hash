from __future__ import annotations

import json
import logging

import pytest

from src import logging_config
from src.logging_config import (
    JsonLineFormatter,
    configure_logging,
    request_correlation,
    trace_id_from_traceparent,
)


def _format_record(**extra: object) -> dict:
    record = logging.LogRecord(
        name="pn_test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="trial %d completed",
        args=(7,),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return json.loads(JsonLineFormatter().format(record))


def test_formatter_emits_one_json_object_with_correlation_fields() -> None:
    payload = _format_record(
        run_id="run-1",
        request_id="request-1",
        trace_id="0af7651916cd43dd8448eb211c80319c",
        event="trial_completed",
        trial=7,
    )

    assert payload["message"] == "trial 7 completed"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "pn_test"
    assert payload["service"] == "petrinaut-opt"
    assert payload["run_id"] == "run-1"
    assert payload["request_id"] == "request-1"
    assert payload["trace_id"] == "0af7651916cd43dd8448eb211c80319c"
    assert payload["event"] == "trial_completed"
    assert payload["trial"] == 7
    assert payload["timestamp"].endswith("Z")
    assert "T" in payload["timestamp"]


def test_formatter_stringifies_non_scalar_extras() -> None:
    payload = _format_record(termination=("sigterm",))

    assert payload["termination"] == "('sigterm',)"


def test_configure_logging_is_idempotent() -> None:
    root = logging.getLogger()

    def marked_handlers() -> list[logging.Handler]:
        return [
            handler
            for handler in root.handlers
            if getattr(handler, "_hash_petrinaut_opt_json_handler", False)
        ]

    configure_logging()
    installed = marked_handlers()
    configure_logging()

    assert len(marked_handlers()) == len(installed) == 1


def test_configure_logging_reads_the_level_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HASH_PETRINAUT_OPT_LOG_LEVEL", "warning")
    assert logging_config._configured_level() == logging.WARNING

    monkeypatch.setenv("HASH_PETRINAUT_OPT_LOG_LEVEL", "not-a-level")
    assert logging_config._configured_level() == logging.INFO

    monkeypatch.delenv("HASH_PETRINAUT_OPT_LOG_LEVEL")
    assert logging_config._configured_level() == logging.INFO


@pytest.mark.parametrize(
    ("traceparent", "expected"),
    [
        (
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
            "0af7651916cd43dd8448eb211c80319c",
        ),
        (
            "  00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-00  ",
            "0af7651916cd43dd8448eb211c80319c",
        ),
        (None, None),
        ("", None),
        ("garbage", None),
        ("00-tooshort-b7ad6b7169203331-01", None),
        ("00-00000000000000000000000000000000-b7ad6b7169203331-01", None),
        ("00-zzf7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", None),
        # `int(x, 16)` would accept these; the charset check must not.
        ("00-0x" + "a" * 30 + "-b7ad6b7169203331-01", None),
        ("00-" + "a_" * 15 + "aa" + "-b7ad6b7169203331-01", None),
        ("00-+" + "a" * 31 + "-b7ad6b7169203331-01", None),
        ("00-0x" + "0" * 30 + "-b7ad6b7169203331-01", None),
    ],
)
def test_trace_id_from_traceparent(
    traceparent: str | None, expected: str | None
) -> None:
    assert trace_id_from_traceparent(traceparent) == expected


def test_request_correlation_reads_headers() -> None:
    class FakeRequest:
        headers = {
            "x-hash-request-id": "request-9",
            "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        }

    assert request_correlation(FakeRequest()) == {
        "request_id": "request-9",
        "trace_id": "0af7651916cd43dd8448eb211c80319c",
    }


def test_request_correlation_tolerates_requests_without_headers() -> None:
    assert request_correlation(object()) == {
        "request_id": None,
        "trace_id": None,
    }
