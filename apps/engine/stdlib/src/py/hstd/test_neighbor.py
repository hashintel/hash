from .agent import AgentState
from .neighbor import (
    neighbors_on_position,
    neighbors_in_radius,
    neighbors_in_front,
    neighbors_behind,
)

na = AgentState(position=[1, 1, 0], direction=[1, 0, 0])
nb = AgentState(position=[1, 2, 0], direction=[1, 1, 0])
nc = AgentState(position=[-1, 1, 0])
nd = AgentState(position=[1, 1, 0])
ne = AgentState(position=[2, 3, 0])
nf = AgentState(position=[3, 2, 0])
ng = AgentState(position=[6, 6, -1], direction=[1, 0, 0])
nh = AgentState(position=[6, 9, 0])
ni = AgentState(position=[4, 9, 0])
nj = AgentState(position=[3, 2, 2])
nk = AgentState(position=[3, 1, 0])
nl = AgentState(position=[1, 0, 0], direction=[1, 1, 1])
nm = AgentState(position=[0, 1, 0])
nn = AgentState(position=[0, -1, -1])


def same_position_test():
    same_pos = neighbors_on_position(na, [nb, nc, nd, ne, nf])
    assert same_pos == [nd]


def test_max_radius():
    in_radius = neighbors_in_radius(
        ng, [na, nb, nc, nd, ne, nf, nh, ni], 3, distance_function="chebyshev"
    )
    assert in_radius == [nh, ni]


def test_max_min_radius():
    in_radius_1 = neighbors_in_radius(ng, [na, nb, nc, nd, nf, nh, ni, nj], 4, 3.5)
    assert in_radius_1 == [ni]

    in_radius_2 = neighbors_in_radius(
        ng, [na, nb, nc, nd, nf, nh, ni, nj], 7, 3.5, "euclidean", True
    )
    assert in_radius_2 == [nb, nf, ni, nj]


def test_front():
    in_front_1 = neighbors_in_front(nb, [na, nc, ne, nf, ng, nh, nj])
    assert in_front_1 == [ne, nf, ng, nh, nj]

    in_front_2 = neighbors_in_front(na, [nb, nc, ne, nf, ng, nh, nj, nk, nl], True)
    assert in_front_2 == [nk]

    in_front_3 = neighbors_in_front(nl, [na, nb, nc, ne, nf, ng, nh, nj, nk], True)
    assert in_front_3 == [nj]

    in_front_4 = neighbors_in_front(nb, [na, nc, ne, nf, ng, nh, nj, nk], True)
    assert in_front_4 == [ne]


def test_behind():
    behind_1 = neighbors_behind(nb, [na, ne, ng, nh, nj, nm])
    assert behind_1 == [na, nm]

    behind_2 = neighbors_behind(nb, [na, ne, ng, nh, nj, nm], True)
    assert behind_2 == [nm]

    behind_3 = neighbors_behind(na, [nb, nc, ne, ng, nh, nj, nm], True)
    assert behind_3 == [nc, nm]

    behind_4 = neighbors_behind(nl, [na, nb, nc, ne, ng, nh, nj, nm, nn], True)
    assert behind_4 == [nn]
