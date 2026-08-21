"""Exception types raised by the Petrinaut CLI bindings."""

from __future__ import annotations


class PetrinautClientError(RuntimeError):
    """The Petrinaut process or its transport is no longer usable."""


class PetrinautProtocolError(PetrinautClientError):
    """The Petrinaut process returned an invalid protocol response."""


class PetrinautRunError(RuntimeError):
    """One request failed while the session remains usable.

    Raised when the CLI answers a request with an error frame, and by
    ``OptimizationSession.objective`` when the objective value is not finite.
    """
