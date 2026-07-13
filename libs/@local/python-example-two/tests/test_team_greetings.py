"""Tests for `hash_python_example_two` (exercises the workspace dependency)."""

from hash_python_example import greet
from hash_python_example_two import greet_team, longest_greeting


def test_greet_team() -> None:
    """`greet_team` greets every recipient via `hash_python_example.greet`."""
    assert greet_team(["Tim", "Bilal"]) == [greet("Tim"), greet("Bilal")]


def test_longest_greeting() -> None:
    """`longest_greeting` picks the longest recipient name."""
    assert longest_greeting(["Tim", "Bilal"]) == "Hello, Bilal!"
