"""Physical-failure persistence and deterministic transient-retry policy."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Literal, cast

from openrouter.errors import NoResponseError
from pydantic import JsonValue

from atlas_tools.relation.eval.contract import (
    HTTP_CLIENT_ERROR_START,
    HTTP_SERVER_ERROR_START,
    RETRYABLE_CLIENT_ERROR_STATUS_CODES,
    TransientRetryConfig,
)
from atlas_tools.relation.eval.schema import AttemptFailure, PhysicalAttemptRow

type FailureCategory = Literal["transport", "provider", "response", "routing", "accounting"]

SYSTEMIC_STATUS_CODES = frozenset({401, 402})
"""Authentication and billing statuses that doom every subsequent request.

A failure carrying one of these stops the whole session immediately: continuing
would burn wall time on requests that cannot succeed until the operator fixes
the account. All other failures are vote-local; the executor defers the vote
and keeps working the rest of the plan.
"""


def is_systemic_failure(failure: AttemptFailure) -> bool:
    """Return whether a durable failure indicates an account-wide condition."""
    return any(
        status in SYSTEMIC_STATUS_CODES
        for status in (failure.http_status_code, failure.provider_status_code)
        if status is not None
    )


@dataclass(frozen=True)
class RetryDirective:
    delay: timedelta
    reason: str


def _status_code(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _http_status_code(error: Exception) -> int | None:
    direct = _status_code(getattr(error, "status_code", None))
    if direct is not None:
        return direct
    response = getattr(error, "raw_response", None)
    return _status_code(getattr(response, "status_code", None))


def request_failure_category(error: Exception) -> FailureCategory:
    """Classify only known connection/timeout failures as statusless transport errors."""
    if _http_status_code(error) is not None:
        return "provider"
    if isinstance(error, NoResponseError | ConnectionError | TimeoutError):
        return "transport"
    return "response"


def completion_failure_category(error: ValueError) -> FailureCategory:
    """Classify a rejected native completion consistently for attempt persistence."""
    message = str(error)
    if "usage" in message:
        return "accounting"
    if any(token in message for token in ("route", "model", "provider", "metadata")):
        return "routing"
    return "response"


def _response_body(error: Exception) -> str | None:
    body = getattr(error, "body", None)
    if isinstance(body, str):
        return body
    if isinstance(body, dict):
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
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
    return cast("dict[str, JsonValue]", error) if isinstance(error, dict) else None


def _provider_status_code(body: str | None) -> int | None:
    error = _error_object(body)
    if error is None:
        return None
    code = error.get("code")
    return code if isinstance(code, int) and not isinstance(code, bool) else None


def _positive_duration(seconds: JsonValue | None) -> timedelta | None:
    if isinstance(seconds, bool) or not isinstance(seconds, int | float) or seconds <= 0:
        return None
    return timedelta(seconds=float(seconds))


def _body_retry_after(body: str | None) -> timedelta | None:
    error = _error_object(body)
    if error is None:
        return None
    metadata = error.get("metadata")
    if not isinstance(metadata, dict):
        return None
    return _positive_duration(metadata.get("retry_after_seconds"))


def _header_retry_after(error: Exception) -> timedelta | None:
    response = getattr(error, "raw_response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    value = headers.get("retry-after")
    if not isinstance(value, str) or not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except TypeError, ValueError:
            return None
        if retry_at.tzinfo is None:
            return None
        remaining = retry_at - datetime.now(retry_at.tzinfo)
        return remaining if remaining > timedelta() else None
    return _positive_duration(seconds)


def failure_from_exception(
    error: Exception,
    category: FailureCategory,
) -> AttemptFailure:
    """Preserve HTTP status, provider status, retry timing, and native response body."""
    body = _response_body(error)
    retry_candidates = [
        delay
        for delay in (_body_retry_after(body), _header_retry_after(error))
        if delay is not None
    ]
    retry_after = max(retry_candidates, default=None)
    return AttemptFailure(
        category=category,
        exception_type=f"{type(error).__module__}.{type(error).__qualname__}",
        message=str(error) or type(error).__qualname__,
        http_status_code=_http_status_code(error),
        provider_status_code=_provider_status_code(body),
        retry_after=retry_after,
        response_body=body,
    )


def retry_directive(
    attempt: PhysicalAttemptRow,
    policy: TransientRetryConfig,
    *,
    now: datetime | None = None,
) -> RetryDirective | None:
    """Return the remaining deterministic backoff for a retryable failed attempt."""
    failure = attempt.failure
    if failure is None or attempt.result is not None:
        return None
    reported_statuses = [
        status
        for status in (failure.provider_status_code, failure.http_status_code)
        if status is not None
    ]
    if any(
        HTTP_CLIENT_ERROR_START <= status < HTTP_SERVER_ERROR_START
        and status not in RETRYABLE_CLIENT_ERROR_STATUS_CODES
        for status in reported_statuses
    ):
        return None

    retryable_statuses = set(policy.status_codes)
    status_reason = next(
        (
            f"{source} status {status}"
            for source, status in {
                "provider": failure.provider_status_code,
                "HTTP": failure.http_status_code,
            }.items()
            if status in retryable_statuses
        ),
        None,
    )
    retryable_transport = policy.retry_transport_errors and failure.category == "transport"
    if status_reason is None and not retryable_transport:
        return None

    exponent = min(attempt.stage_attempt, 30)
    backoff_seconds = policy.initial_delay.total_seconds() * policy.backoff_multiplier**exponent
    bounded = timedelta(seconds=min(backoff_seconds, policy.maximum_delay.total_seconds()))
    requested = failure.retry_after or timedelta()
    delay = max(bounded, requested)
    current = now or datetime.now(UTC)
    remaining = max(attempt.ts_response + delay - current, timedelta())
    return RetryDirective(
        delay=remaining,
        reason=status_reason or "transport error",
    )
