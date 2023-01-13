# type: ignore
import pytest

from .agent import AgentState
from .spatial import distance_between, normalize_vector, random_position, Topology

a = AgentState(position=[0, 0, 0], direction=[1, 1])
b = AgentState(position=[1, 1, 0], direction=[1, 3])
c = AgentState(position=[1, 6, 0])
d = AgentState(position=[1, 6, 2])

topology = Topology(x_bounds=[0, 20], y_bounds=[0, 20], z_bounds=[0, 20])


def test_manhattan_distance_between():
    assert distance_between(a, b, "manhattan") == 2
    assert distance_between(a, c, "manhattan") == 7
    assert distance_between(a, d, "manhattan") == 9


def test_euclidean_distance_between():
    assert distance_between(a, b, "euclidean") == pytest.approx(1.4142135623730951)
    assert distance_between(a, c, "euclidean") == pytest.approx(6.082762530298219)
    assert distance_between(a, d, "euclidean") == pytest.approx(6.4031242374328485)


def test_euclidean_distance_between_squared():
    assert distance_between(a, b, "euclidean_sq") == 2
    assert distance_between(a, c, "euclidean_sq") == 37
    assert distance_between(a, d, "euclidean_sq") == 41


def test_chebyshev_distance_between_tests():
    assert distance_between(a, b, "chebyshev") == 1
    assert distance_between(a, c, "chebyshev") == 6
    assert distance_between(a, d, "chebyshev") == 6


def test_normalize_direction():
    if a.direction:
        assert normalize_vector(a.direction) == [0.7071067811865475, 0.7071067811865475]
    if b.direction:
        assert normalize_vector(b.direction) == [0.31622776601683794, 0.9486832980505138]


def test_random_position():
    assert random_position(topology)[2] == 0

    pos = random_position(topology, True)
    assert len(pos) == 3
    assert 0 <= pos[0] < 20
    assert 0 <= pos[1] < 20
    assert 0 <= pos[2] < 20
