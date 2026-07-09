"""Tests for `hash_python_example`."""

from hash_python_example import Greeting, greet, greet_soon


def test_greet() -> None:
    """`greet` renders a friendly greeting."""
    assert greet("HASH") == "Hello, HASH!"


def test_greeting_render() -> None:
    """`Greeting.render` includes the recipient."""
    assert Greeting(recipient="Bilal").render() == "Hello, Bilal!"


async def test_greet_soon() -> None:
    """`greet_soon` greets after yielding to the event loop."""
    assert await greet_soon("HASH") == "Hello, HASH!"
