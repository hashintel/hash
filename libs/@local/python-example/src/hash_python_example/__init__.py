"""Minimal example package demonstrating the Python monorepo infrastructure (H-6664)."""

import asyncio
from dataclasses import dataclass

__all__ = ["Greeting", "greet", "greet_soon"]


@dataclass(frozen=True)
class Greeting:
    """A greeting addressed to a recipient."""

    recipient: str

    def render(self) -> str:
        """Format the greeting as a human-readable string."""
        return f"Hello, {self.recipient}!"


def greet(recipient: str) -> str:
    """Return a greeting for `recipient`."""
    return Greeting(recipient=recipient).render()


async def greet_soon(recipient: str, *, delay_seconds: float = 0.0) -> str:
    """Return a greeting for `recipient` after waiting `delay_seconds`."""
    await asyncio.sleep(delay_seconds)
    return greet(recipient)
