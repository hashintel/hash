#!/usr/bin/env python3
"""Structured JSON-lines logging with cross-service correlation fields.

Every record is emitted to stdout as one JSON object per line so the
service's logs can be joined with NodeAPI logs (via ``request_id``), traces
(via ``trace_id``), and CLI diagnostics (via ``run_id``). Only stdlib
facilities are used. Log statements must never include optimization
manifests, user-authored code, or other unbounded payloads — log sizes,
counts, and identifiers instead.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

SERVICE_NAME = "petrinaut-opt"
LOG_LEVEL_ENVIRONMENT_VARIABLE = "HASH_PETRINAUT_OPT_LOG_LEVEL"
_HANDLER_MARKER = "_hash_petrinaut_opt_json_handler"
_HEX_DIGITS = frozenset("0123456789abcdef")

_LEVELS_BY_NAME = {
    "CRITICAL": logging.CRITICAL,
    "ERROR": logging.ERROR,
    "WARNING": logging.WARNING,
    "INFO": logging.INFO,
    "DEBUG": logging.DEBUG,
}

# Attributes every LogRecord carries; anything else was attached via
# ``extra`` and is forwarded as a top-level JSON field.
_RESERVED_RECORD_ATTRIBUTES = frozenset(logging.makeLogRecord({}).__dict__) | {
    "asctime",
    "message",
    "taskName",
}


class JsonLineFormatter(logging.Formatter):
    """Format one log record as a single JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc)
        payload: dict[str, Any] = {
            "timestamp": timestamp.isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": SERVICE_NAME,
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED_RECORD_ATTRIBUTES or key in payload:
                continue
            if value is None or isinstance(value, (str, int, float, bool)):
                payload[key] = value
            else:
                payload[key] = str(value)
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def _configured_level() -> int:
    """Read the service log level; unknown names fall back to INFO."""
    raw = os.environ.get(LOG_LEVEL_ENVIRONMENT_VARIABLE, "").strip().upper()
    return _LEVELS_BY_NAME.get(raw, logging.INFO)


def configure_logging() -> None:
    """Attach the JSON stdout handler once; safe to call repeatedly.

    Repeated calls (module reimports, pytest collecting the app several
    times) must not stack handlers or fight over levels, so the function is
    a no-op when the marked handler is already installed.
    """
    root = logging.getLogger()
    if any(getattr(handler, _HANDLER_MARKER, False) for handler in root.handlers):
        return
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonLineFormatter())
    setattr(handler, _HANDLER_MARKER, True)
    root.addHandler(handler)
    root.setLevel(_configured_level())


def trace_id_from_traceparent(traceparent: str | None) -> str | None:
    """Extract the trace id from a W3C ``traceparent`` header value.

    This is a deliberately cheap parse (``00-<trace_id>-<span_id>-<flags>``)
    so logs can be joined with Tempo traces without an OTel dependency.
    """
    if not traceparent:
        return None
    parts = traceparent.strip().split("-")
    if len(parts) < 4:
        return None
    trace_id = parts[1].lower()
    # An explicit charset test — `int(trace_id, 16)` would accept `0x` prefixes,
    # underscores, and signs, letting a hostile header into the log field.
    if (
        len(trace_id) != 32
        or not _HEX_DIGITS.issuperset(trace_id)
        or set(trace_id) == {"0"}
    ):
        return None
    return trace_id


def request_correlation(request: Any) -> dict[str, str | None]:
    """Read the inbound correlation identifiers from a request's headers.

    Tolerates request doubles without headers so optimizer tests can use
    plain fakes.
    """
    headers = getattr(request, "headers", None)
    get = getattr(headers, "get", None)
    if not callable(get):
        return {"request_id": None, "trace_id": None}
    return {
        "request_id": get("x-hash-request-id"),
        "trace_id": trace_id_from_traceparent(get("traceparent")),
    }
