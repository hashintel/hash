"""Exception types raised by the Petrinaut CLI bindings."""

from __future__ import annotations


class PetrinautClientError(RuntimeError):
    """The Petrinaut process or its transport is no longer usable."""


class PetrinautProtocolError(PetrinautClientError):
    """The Petrinaut process returned an invalid protocol response."""


class PetrinautRunError(RuntimeError):
    """The CLI answered one request with an error frame; it remains usable."""
