"""Test integration."""

#  ruff: noqa: S101


from worker.tests import inc


def test_integration() -> None:
    """Test integration."""
    assert inc(0) == 1
