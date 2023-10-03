"""Test unit."""

#  ruff: noqa: S101


def inc(x: int) -> int:
    """Increment a number by one."""
    return x + 1


def test_unit() -> None:
    """Test unit."""
    assert inc(0) == 1
