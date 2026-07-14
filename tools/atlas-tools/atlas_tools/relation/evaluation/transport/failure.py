"""Normalize provider failures without retaining SDK exception types."""

import json
import math
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Literal

from pydantic import JsonValue

from atlas_tools.relation.evaluation.domain.api import AttemptFailure

_SESSION_STATUS_CODES = frozenset({401, 402})


def _status_code(error: Exception) -> int | None:
    direct = getattr(error, "status_code", None)
    if isinstance(direct, int) and not isinstance(direct, bool):
        return direct
    response = getattr(error, "raw_response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) and not isinstance(status, bool) else None


def _body(error: Exception) -> str | None:
    body = getattr(error, "body", None)
    if isinstance(body, str):
        return body
    if isinstance(body, dict):
        return json.dumps(body, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return None


def _error_object(body: str | None) -> dict[str, JsonValue] | None:
    if body is None:
        return None
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if not isinstance(error, dict):
        return None
    return {str(key): value for key, value in error.items()}


def _provider_status(body: str | None) -> int | None:
    error = _error_object(body)
    if error is None:
        return None
    status = error.get("code")
    return status if isinstance(status, int) and not isinstance(status, bool) else None


def _positive_delay(value: object) -> timedelta | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        return None
    seconds = float(value)
    return timedelta(seconds=seconds) if math.isfinite(seconds) else None


def _retry_after(error: Exception, body: str | None) -> timedelta | None:
    candidates: list[timedelta] = []

    error_payload = _error_object(body)
    if error_payload is not None:
        metadata = error_payload.get("metadata")

        if isinstance(metadata, dict):
            delay = _positive_delay(metadata.get("retry_after_seconds"))
            if delay is not None:
                candidates.append(delay)

    response = getattr(error, "raw_response", None)
    headers = getattr(response, "headers", None)
    value = headers.get("retry-after") if headers is not None else None

    if isinstance(value, str) and value:
        try:
            delay = _positive_delay(float(value))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
            except TypeError, ValueError:
                delay = None
            else:
                now = datetime.now(retry_at.tzinfo) if retry_at.tzinfo is not None else retry_at
                delay = retry_at - now if retry_at.tzinfo is not None else None
                if delay is not None and delay <= timedelta():
                    delay = None

        if delay is not None:
            candidates.append(delay)

    return max(candidates, default=None)


def request_failure(error: Exception) -> AttemptFailure:
    """Preserve status, retry, and body evidence from one known SDK failure."""
    status = _status_code(error)
    body = _body(error)
    provider_status = _provider_status(body)
    category: Literal["transport", "provider"] = "provider" if status is not None else "transport"
    statuses = (status, provider_status)
    return AttemptFailure(
        category=category,
        exception_type=f"{type(error).__module__}.{type(error).__qualname__}",
        message=str(error) or type(error).__qualname__,
        http_status_code=status,
        provider_status_code=provider_status,
        retry_after=_retry_after(error, body),
        response_body=body,
        scope=("session" if any(value in _SESSION_STATUS_CODES for value in statuses) else "vote"),
    )
