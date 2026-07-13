"""Second example package exercising cross-package uv workspace dependencies (H-6664)."""

from typing import TYPE_CHECKING

from hash_python_example import Greeting, greet

if TYPE_CHECKING:
    from collections.abc import Sequence

__all__ = ["greet_team", "longest_greeting"]


def greet_team(recipients: Sequence[str]) -> list[str]:
    """Return a greeting for every recipient, in order."""
    return [greet(recipient) for recipient in recipients]


def longest_greeting(recipients: Sequence[str]) -> str:
    """Return the rendered greeting for the recipient with the longest name."""
    longest = max(recipients, key=len)
    return Greeting(recipient=longest).render()
