"""
Spatial utility functions.
"""
import math
import random
from typing import Optional, List

from .agent import AgentState, AgentFieldError
from .context import Topology


def manhattan_distance(p1: List[float], p2: List[float], z_axis: bool = True) -> float:
    dx = abs(p1[0] - p2[0])
    dy = abs(p1[1] - p2[1])
    dz = abs(p1[2] - p2[2])
    return dx + dy + (dz if z_axis else 0)


def euclidean_squared_distance(p1: List[float], p2: List[float], z_axis: bool = True) -> float:
    dx = p1[0] - p2[0]
    dy = p1[1] - p2[1]
    dz = p1[2] - p2[2]
    return dx * dx + dy * dy + (dz * dz if z_axis else 0)


def euclidean_distance(p1: List[float], p2: List[float], z_axis: bool = True) -> float:
    return math.sqrt(euclidean_squared_distance(p1, p2, z_axis))


def chebyshev_distance(p1: List[float], p2: List[float], z_axis: bool = True) -> float:
    dx = abs(p1[0] - p2[0])
    dy = abs(p1[1] - p2[1])
    dz = abs(p1[2] - p2[2])
    return max(dx, dy, (dz if z_axis else 0))


def distance_between(
    a: AgentState, b: AgentState, distance="euclidean", z_axis=True
) -> Optional[float]:
    """
    Returns the specified distance between two agents. The parameter `distance` must be one
    of 'euclidean', 'euclidean_sq', 'manhattan' or 'chebyshev'.
    """
    if a.position is None:
        raise AgentFieldError(a.agent_id, "position", "cannot be None")
    if b.position is None:
        raise AgentFieldError(b.agent_id, "position", "cannot be None")

    if distance == "euclidean":
        return euclidean_distance(a.position, b.position, z_axis)
    elif distance == "euclidean_sq":
        return euclidean_squared_distance(a.position, b.position, z_axis)
    elif distance == "manhattan":
        return manhattan_distance(a.position, b.position, z_axis)
    elif distance == "chebyshev":
        return chebyshev_distance(a.position, b.position, z_axis)

    raise ValueError(
        "distance must be one of 'euclidean', 'euclidean_sq', 'manhattan' or 'chebyshev'"
    )


def normalize_vector(vec: List[float]) -> List[float]:
    """
    Returns a copy of the vector `vec` with unit (Euclidean) length.
    """
    magnitude = math.sqrt(sum(v * v for v in vec))
    return [v / magnitude for v in vec]


def random_position(topology: Topology, z_plane=False) -> List[float]:
    """
    Returns a random position vector within the bounds specified in `topology`. Unless
    `z_plane` is set to `True`, the generated position will be in the x-y plane.

    Args:
        topology: the `context.globals()["topology"]` value.
        z_plane: if True, will generate a position with a z-axis component. If False,
        the z-axis component will be zero.
    """
    xpos = int(random.uniform(topology.x_bounds[0], topology.x_bounds[1]))
    ypos = int(random.uniform(topology.y_bounds[0], topology.y_bounds[1]))
    zpos = 0
    if z_plane:
        if topology.z_bounds is None:
            raise ValueError("topology z_bounds is required if z_plane is True")
        zpos = int(random.uniform(topology.z_bounds[0], topology.z_bounds[1]))

    return [xpos, ypos, zpos]
