"""
Initialization utility functions.
"""
import math
import random
from copy import deepcopy
from dataclasses import dataclass
from typing import Optional, List, Union, Callable, Mapping

from .agent import AgentState

AgentFunction = Callable[[], AgentState]
AgentTemplate = Union[AgentState, AgentFunction]


@dataclass
class Topology:
    x_bounds: List[float]
    y_bounds: List[float]
    z_bounds: Optional[List[float]]


def create_agent(template: AgentTemplate) -> AgentState:
    if callable(template):
        return template()
    else:
        return deepcopy(template)


def scatter(count: int, topology: Topology, template: AgentTemplate) -> List[AgentState]:

    x_bounds = topology.x_bounds
    y_bounds = topology.y_bounds

    width = x_bounds[1] - x_bounds[0]
    height = y_bounds[1] - y_bounds[0]

    def assign_random_position() -> AgentState:
        x = random.uniform(0, width) + x_bounds[0]
        y = random.uniform(0, height) + y_bounds[0]

        agent = create_agent(template)
        agent['position'] = [x, y]

        return agent

    agents = [assign_random_position() for i in range(count)]

    return agents


def stack(count: int, template: AgentTemplate) -> List[AgentState]:
    agents = [create_agent(template) for i in range(count)]

    return agents


def grid(topology: Topology, template: AgentTemplate) -> List[AgentState]:
    x_bounds = topology.x_bounds
    y_bounds = topology.y_bounds

    width = x_bounds[1] - x_bounds[0]
    height = y_bounds[1] - y_bounds[0]
    count = width * height

    def assign_grid_position(ind: int) -> AgentState:
        x = (ind % width) + x_bounds[0]
        y = math.floor(ind / width) + y_bounds[0]

        agent = create_agent(template)
        agent["position"] = [x, y]

        return agent

    agents = [assign_grid_position(i) for i in range(count)]

    return agents


def create_layout(
    layout: List[List[str]], templates: Mapping[str, AgentState], offset: List[float] = [0, 0, 0]
) -> List[AgentState]:

    height = len(layout)
    agents = {}

    for pos_y, row in enumerate(layout):
        for pos_x, template_type in enumerate(row):
            if template_type in templates:
                if template_type not in agents:
                    agents[template_type] = []

                agent_name = (templates[template_type].agent_name or template_type) + len(
                    agents[template_type]
                )

                agent = templates[template_type]
                agent["agent_name"] = agent_name
                agent["position"] = [pos_x + offset[0], height - pos_y + offset[1], offset[2]]

                agents[template_type].append()

    agent_list = [agent for sublist in agents.values() for agent in sublist]

    return agent_list
