# type: ignore
import pytest

from .rand import set_seed, random


def test_random():
    n = random()
    nn = random()
    assert n != nn

    set_seed("test")
    n = random()
    set_seed("test")
    nn = random()
    assert n == pytest.approx(nn)
