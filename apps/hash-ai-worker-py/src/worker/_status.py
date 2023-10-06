# WARNING: this module has to be passed through
#   `workflow.unsafe.imports_passed_through()`, otherwise error handling will not work!

from collections.abc import Sequence
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

__all__ = ["StatusCode", "Status", "StatusError"]


class StatusCode(str, Enum):
    __slots__ = ()

    OK = "OK"
    """Not an error; returned on success.

    HTTP Mapping: 200 OK"""

    CANCELLED = "CANCELLED"
    """The operation was cancelled, typically by the caller.

    HTTP Mapping: 499 Client Closed Request"""

    UNKNOWN = "UNKNOWN"
    """Unknown error. For example, this error may be returned when a Status value
    received from another address space belongs to an error space that is not
    known in this address space. Also errors raised by APIs that do not return
    enough error information may be converted to this error.

    HTTP Mapping: 500 Internal Server Error"""

    INVALID_ARGUMENT = "INVALID_ARGUMENT"
    """The client specified an invalid argument. Note that this differs from
    `FAILED_PRECONDITION`. `INVALID_ARGUMENT` indicates arguments that are
    problematic regardless of the state of the system (e.g., a malformed file name).

    HTTP Mapping: 400 Bad Request"""

    DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED"
    """The deadline expired before the operation could complete. For operations that
    change the state of the system, this error may be returned even if the
    operation has completed successfully. For example, a successful response
    from a server could have been delayed long enough for the deadline to expire.

    HTTP Mapping: 504 Gateway Timeout"""

    NOT_FOUND = "NOT_FOUND"
    """Some requested entity (e.g., file or directory) was not found.

    Note to server developers: if a request is denied for an entire class of users,
    such as gradual feature rollout or undocumented allowlist, `NOT_FOUND` may be used.
    If a request is denied for some users within a class of users, such as user-based
    access control, `PERMISSION_DENIED` must be used.

    HTTP Mapping: 404 Not Found"""

    ALREADY_EXISTS = "ALREADY_EXISTS"
    """The entity that a client attempted to create (e.g., file or directory) already
    exists.

    HTTP Mapping: 409 Conflict"""

    PERMISSION_DENIED = "PERMISSION_DENIED"
    """The caller does not have permission to execute the specified operation.
    `PERMISSION_DENIED` must not be used for rejections caused by exhausting some
    resource (use `RESOURCE_EXHAUSTED` instead for those errors).
    `PERMISSION_DENIED` must not be used if the caller cannot be identified
    (use `UNAUTHENTICATED` instead for those errors). This error code does not
    imply the request is valid or the requested entity exists or satisfies other
    pre-conditions.

    HTTP Mapping: 403 Forbidden"""

    UNAUTHENTICATED = "UNAUTHENTICATED"
    """The request does not have valid authentication credentials for the operation.

    HTTP Mapping: 401 Unauthorized"""

    RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED"
    """Some resource has been exhausted, perhaps a per-user quota, or perhaps the
    entire file system is out of space.

    HTTP Mapping: 429 Too Many Requests"""

    FAILED_PRECONDITION = "FAILED_PRECONDITION"
    """The operation was rejected because the system is not in a state required for
    the operation's execution. For example, the directory to be deleted is non-empty,
    an rmdir operation is applied to a non-directory, etc. Service implementors can
    use the following guidelines to decide between `FAILED_PRECONDITION`, `ABORTED`,
    and `UNAVAILABLE`:
      - Use `UNAVAILABLE` if the client can retry just the failing call.
      - Use `ABORTED` if the client should retry at a higher level. For example, when
        a client-specified test-and-set fails, indicating the client should restart a
        read-modify-write sequence.
      - Use `FAILED_PRECONDITION` if the client should not retry until the system state
        has been explicitly fixed. For example, if an "rmdir" fails because the
        directory is non-empty, `FAILED_PRECONDITION` should be returned since the
        client should not retry unless the files are deleted from the directory.

    HTTP Mapping: 400 Bad Request"""

    ABORTED = "ABORTED"
    """The operation was aborted, typically due to a concurrency issue such as a
    sequencer check failure or transaction abort.
    See the guidelines above for deciding between `FAILED_PRECONDITION`, `ABORTED`,
    and `UNAVAILABLE`.

    HTTP Mapping: 409 Conflict"""

    OUT_OF_RANGE = "OUT_OF_RANGE"
    """The operation was attempted past the valid range. E.g., seeking or reading past
    end-of-file.
    Unlike `INVALID_ARGUMENT`, this error indicates a problem that may be fixed if
    the system state changes. For example, a 32-bit file system will generate
    INVALID_ARGUMENT if asked to read at an offset that is not in the range [0,2^32-1],
    but it will generate `OUT_OF_RANGE` if asked to read from an offset past the current
    file size. There is a fair bit of overlap between `FAILED_PRECONDITION` and
    `OUT_OF_RANGE`. We recommend using `OUT_OF_RANGE` (the more specific error) when
    it applies so that callers who are iterating through a space can easily look
    for an `OUT_OF_RANGE` error to detect when they are done.

    HTTP Mapping: 400 Bad Request"""

    UNIMPLEMENTED = "UNIMPLEMENTED"
    """The operation is not implemented or is not supported/enabled in this service.

    HTTP Mapping: 501 Not Implemented"""

    INTERNAL = "INTERNAL"
    """Internal errors. This means that some invariants expected by the underlying
    system have been broken. This error code is reserved for serious errors.

    HTTP Mapping: 500 Internal Server Error"""

    UNAVAILABLE = "UNAVAILABLE"
    """The service is currently unavailable.  This is most likely a transient condition,
    which can be corrected by retrying with a backoff. Note that it is not always
    safe to retry non-idempotent operations.
    See the guidelines above for deciding between `FAILED_PRECONDITION`, `ABORTED`,
    and `UNAVAILABLE`.

    HTTP Mapping: 503 Service Unavailable"""

    DATA_LOSS = "DATA_LOSS"
    """Unrecoverable data loss or corruption.

    HTTP Mapping: 500 Internal Server Error"""


D = TypeVar("D")


class Status(Generic[D], BaseModel, extra="forbid"):
    """The canonical shape of a response object describing the status of a request."""

    code: StatusCode
    message: str | None = None
    """A developer-facing description of the status.

    Where possible, this should provide guiding advice for debugging and/or handling the
    error."""
    contents: Sequence[D] = Field(default_factory=list)

    def into_contents(self) -> Sequence[D]:
        """Converts this status into the contents if the status is OK."""
        if self.code != StatusCode.OK:
            raise StatusError(self)
        return self.contents

    def into_content(self) -> D:
        """Converts this status into the content if the status is OK."""
        return self.into_contents()[0]


# WARNING: this has to be passed through `workflow.unsafe.imports_passed_through()`,
#          otherwise error handling will not work!
class StatusError(RuntimeError):
    """Error raised when a status code is not OK."""

    def __init__(self, status: Status[Any]) -> None:
        """Initializes the status error."""
        self.status = status
        super().__init__(status.message)
