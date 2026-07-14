"""Define the provider-neutral boundary for one completion request."""

from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Protocol

from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    JudgeRequestSpec,
    ProviderName,
    ProviderResult,
    ReasoningEffort,
    RequestStage,
    SessionId,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletionMessage:
    """A text message with one provider-independent conversation role."""

    role: Literal["system", "developer", "user", "assistant"]
    content: str

    def __post_init__(self) -> None:
        if not self.content:
            raise ValueError("completion message content must not be empty")


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletionRequest:
    """A fully pinned non-streaming completion request.

    The timeout covers the provider operation. Retry delays and durable
    persistence happen outside this boundary and do not consume it.
    """

    messages: tuple[CompletionMessage, ...]
    judge: JudgeRequestSpec
    effort: ReasoningEffort
    session_id: SessionId
    timeout: timedelta
    request_stage: RequestStage

    def __post_init__(self) -> None:
        if not self.messages:
            raise ValueError("completion request messages must not be empty")
        if not self.session_id:
            raise ValueError("completion request session_id must not be empty")
        if self.timeout <= timedelta():
            raise ValueError("completion request timeout must be positive")


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletionAccepted:
    """An accepted completion with exact provider evidence.

    Accepted responses have one non-empty text choice, complete token usage,
    and a route matching every model and provider pin in the request.
    """

    result: ProviderResult
    content: str
    provider_name: ProviderName

    def __post_init__(self) -> None:
        if not self.content.strip():
            raise ValueError("accepted completion content must not be empty")
        if self.result.content != self.content:
            raise ValueError("accepted completion content must match its native result")
        if self.result.usage is None:
            raise ValueError("accepted completion requires usage accounting")
        if not self.provider_name:
            raise ValueError("accepted completion provider_name must not be empty")


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletionFailed:
    """A provider exchange that produced no billable response evidence."""

    failure: AttemptFailure


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletionRejected:
    """A billable response that failed local acceptance or execution policy.

    The native result is retained because a rejected HTTP-200 response may
    still be billable and must remain available for accounting and route audit.
    """

    failure: AttemptFailure
    billed_result: ProviderResult


type CompletionOutcome = CompletionAccepted | CompletionFailed | CompletionRejected


class AsyncCompletionTransport(Protocol):
    """Return expected provider outcomes without hidden retries."""

    async def complete(self, request: CompletionRequest) -> CompletionOutcome:
        """Send and validate one non-streaming provider exchange."""

    async def aclose(self) -> None:
        """Close every owned network client and connection pool."""
