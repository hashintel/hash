"""
Neighbor utility functions.
"""
from typing import List
from functools import reduce
from .spatial import (
    manhattan_distance,
    euclidean_squared_distance,
    euclidean_distance,
    chebyshev_distance,
)

from .agent import AgentState

pos_error = Exception("agent must have a position")
dir_error = Exception("agent must have a direction")


def neighbors_on_position(agent: AgentState, neighbors: List[AgentState]) -> List[AgentState]:

    if not agent["position"]:
        raise pos_error

    def on_position(neighbor: AgentState) -> bool:
        pos = agent["position"]
        pos_equal = [pos[ind] == neighbor[ind] for ind in range(len(pos))]

        return reduce(lambda a, b: (bool(a and b)), pos_equal)

    return list(filter(on_position, neighbors))


def neighbors_in_radius(
    agent: AgentState,
    neighbors: List[AgentState],
    max_radius: float = 1,
    min_radius: float = 0,
    distance_function: str = "euclidean",
    z_axis: bool = False,
) -> List[AgentState]:

    if not agent["position"]:
        raise pos_error

    func = {
        "manhattan": manhattan_distance,
        "euclidean": euclidean_distance,
        "euclidean_squared": euclidean_squared_distance,
        "chebyshev": chebyshev_distance,
    }

    def in_radius(neighbor: AgentState) -> bool:
        if not neighbor["position"]:
            return False

        pos = agent["position"]
        d = func[distance_function](neighbor["position"], pos, z_axis)

        return (d <= max_radius) and (d >= min_radius)

    return list(filter(in_radius, neighbors))


def in_front_planar(agent: AgentState, neighbor: List[AgentState]) -> bool:

    a_pos = agent["position"]
    n_pos = neighbor["position"]
    a_dir = agent["direction"]

    [dx, dy, dz] = [n_pos[ind] - a_pos[ind] for ind in range(3)]
    D = a_dir[0] * dx + a_dir[1] * dy + a_dir[2] * dz

    return D > 0


def is_linear(agent: AgentState, neighbor: AgentState, front: bool) -> bool:

    a_pos = agent["position"]
    n_pos = neighbor["position"]
    [dx, dy, dz] = [n_pos[ind] - a_pos[ind] for ind in range(3)]
    [ax, ay, az] = agent["direction"]

    cross_product = [dy * az - dz * ay, dx * az - dz * ax, dx * ay - dy * ax]
    all_zero = all([i == 0 for i in cross_product])
    # all_zero = reduce(lambda a, b: not bool(a or b), cross_product, False)

    # if cross_product is not 0
    if not all_zero:
        return False

    # check if same direction
    same_dir = (ax * dx > 0) or (ay * dy > 0) or (az * dz > 0)

    return same_dir is front


def neighbors_in_front(
    agent: AgentState, neighbors: List[AgentState], colinear: bool = False
) -> List[AgentState]:

    if not agent["position"]:
        raise pos_error
    if not agent["direction"]:
        raise dir_error

    if colinear:
        return list(filter(lambda n: is_linear(agent, n, True), neighbors))
    else:
        return list(filter(lambda n: in_front_planar(agent, n), neighbors))


def neighbors_behind(
    agent: AgentState, neighbors: List[AgentState], colinear: bool = False
) -> List[AgentState]:

    if not agent["position"]:
        raise pos_error
    if not agent["direction"]:
        raise dir_error

    if colinear:
        return list(filter(lambda n: is_linear(agent, n, False), neighbors))
    else:
        return list(filter(lambda n: not in_front_planar(agent, n), neighbors))
