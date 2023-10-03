"""Test integration."""

#  ruff: noqa: S101


def inc(x: int) -> int:
    """Increment a number by one."""
    return x + 1


def test_integration() -> None:
    """Test integration."""
    assert inc(0) == 1
