from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, Extra, Field

__all__ = ["StatusCode", "Status"]


class StatusCode(str, Enum):
    __slots__ = ()

    OK = "OK"
    """Not an error; returned on success.

    HTTP Mapping: 200 OK"""

    UNKNOWN = "UNKNOWN"
    """Unknown error.

    For example, this error may be returned when a `Status` value received from another
    address space belongs to an error space that is not known in this address space.
    Also errors raised by APIs that do not return enough error information may be
    converted to this error.

    HTTP Mapping: 500 Internal Server Error"""

    INVALID_ARGUMENT = "INVALID_ARGUMENT"
    """The client specified an invalid argument.

    HTTP Mapping: 400 Bad Request"""

    UNIMPLEMENTED = "UNIMPLEMENTED"
    """The operation is not implemented or is not supported/enabled in this service.

    HTTP Mapping: 501 Not Implemented"""


D = TypeVar("D")


class Status(Generic[D], BaseModel, extra=Extra.forbid):
    """The canonical shape of a response object describing the status of a request."""

    code: StatusCode
    message: str | None = None
    """A developer-facing description of the status.

    Where possible, this should provide guiding advice for debugging and/or handling the
    error."""
    contents: list[D] = Field(default_factory=list)
