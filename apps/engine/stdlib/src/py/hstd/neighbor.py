"""
Neighbor utility functions.
"""
from typing import List

from .spatial import distance_between
from .agent import AgentFieldError, AgentState


def neighbors_on_position(agent: AgentState, neighbors: List[AgentState]) -> List[AgentState]:
    """
    Returns all `neighbors` whose position is identical to the `agent`.
    """
    if agent.position is None:
        raise AgentFieldError(agent.agent_id, "position", "cannot be None")

    return [n for n in neighbors if n.position == agent.position]


def neighbors_in_radius(
    agent: AgentState,
    neighbors: List[AgentState],
    max_radius: float = 1,
    min_radius: float = 0,
    distance_function: str = "euclidean",
    z_axis: bool = False,
) -> List[AgentState]:
    """
    Returns all neighbors within a certain vision radius of an agent.
    Default is 2D (`z_axis` set to false). Set `z_axis` to true for 3D positions.

    Args:
        agent: central agent
        neighbors: context.neighbors() array, or an array of agents
        max_radius: minimum radius for valid neighbors
        min_radius: maximum radius for valid neighbors
        distance_function: type of distance function to use
        z_axis: include z-axis in distance calculations
    """

    if agent.position is None:
        raise AgentFieldError(agent.agent_id, "position", "cannot be None")

    def in_radius(neighbor: AgentState) -> bool:
        if neighbor.position is None:
            return False

        d = distance_between(neighbor, agent, distance_function, z_axis)
        if d is None:
            return False

        return (d <= max_radius) and (d >= min_radius)

    return [n for n in neighbors if in_radius(n)]


def difference_vector(vec1: List[float], vec2: List[float]):
    """
    Calculate the difference vector `vec2` - `vec1`.
    """
    return [vec2[ind] - vec1[ind] for ind in range(len(vec1))]


def in_front_planar(agent: AgentState, neighbor: AgentState) -> bool:
    """
    Return True if a neighbor is anywhere in front of the agent.
    """

    a_dir = agent["direction"]

    [dx, dy, dz] = difference_vector(agent["position"], neighbor["position"])
    D = a_dir[0] * dx + a_dir[1] * dy + a_dir[2] * dz

    return D > 0


def is_linear(agent: AgentState, neighbor: AgentState, front: bool) -> bool:
    """
    Check if a neighbor lies along the direction vector of the agent, and is
    in front of or behind the agent, based on `front`.
    """
    [dx, dy, dz] = difference_vector(agent["position"], neighbor["position"])
    [ax, ay, az] = agent["direction"]

    cross_product = [dy * az - dz * ay, dx * az - dz * ax, dx * ay - dy * ax]

    if cross_product != [0, 0, 0]:
        return False

    # check if same direction
    same_dir = (ax * dx > 0) or (ay * dy > 0) or (az * dz > 0)

    return same_dir is front


def neighbors_in_front(
    agent: AgentState, neighbors: List[AgentState], colinear: bool = False
) -> List[AgentState]:
    """
    Return all `neighbors` in front of the `agent`. If `colinear` is True
    check that the neighbor lies along the agent's direction vector.
    """

    if agent.position is None:
        raise AgentFieldError(agent.agent_id, "position", "cannot be None")
    if agent.direction is None:
        raise AgentFieldError(agent.agent_id, "direction", "cannot be None")

    if colinear:
        return [n for n in neighbors if is_linear(agent, n, True)]
    else:
        return [n for n in neighbors if in_front_planar(agent, n)]


def neighbors_behind(
    agent: AgentState, neighbors: List[AgentState], colinear: bool = False
) -> List[AgentState]:
    """
    Return all `neighbors` behind the `agent`. If `colinear` is True
    check that the neighbor lies along the agent's direction vector.
    """

    if agent.position is None:
        raise AgentFieldError(agent.agent_id, "position", "cannot be None")
    if agent.direction is None:
        raise AgentFieldError(agent.agent_id, "direction", "cannot be None")

    if colinear:
        return [n for n in neighbors if is_linear(agent, n, False)]
    else:
        return [n for n in neighbors if not in_front_planar(agent, n)]
