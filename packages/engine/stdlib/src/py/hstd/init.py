"""
Initialization utility functions.
"""
import math
import random
from copy import deepcopy
from typing import Dict, List, Union, Callable, Mapping

from .agent import AgentState
from .context import Topology

# AgentTemplate can be an AgentState, or function which returns an AgentState
AgentFunction = Callable[[], AgentState]
AgentTemplate = Union[AgentState, AgentFunction]


def create_agent(template: AgentTemplate) -> AgentState:
    if callable(template):
        return template()
    else:
        return deepcopy(template)


def scatter(count: int, topology: Topology, template: AgentTemplate) -> List[AgentState]:
    """
    Generate `count` agents using the `template`, assigning them random positions within
    the `topology` bounds.

    Args:
        count: the number of agents to generate.
        topology: the `context.globals()["topology"]` value.
        template: an agent definition, or a function which returns an agent definition.
    """
    x_bounds = topology.x_bounds
    y_bounds = topology.y_bounds

    width = x_bounds[1] - x_bounds[0]
    height = y_bounds[1] - y_bounds[0]

    def assign_random_position() -> AgentState:
        x = random.uniform(0, width) + x_bounds[0]
        y = random.uniform(0, height) + y_bounds[0]

        agent = create_agent(template)
        agent["position"] = [x, y]

        return agent

    agents = [assign_random_position() for i in range(count)]

    return agents


def stack(count: int, template: AgentTemplate) -> List[AgentState]:
    """
    Generate `count` agents using the `template`.

    Args:
        count: the number of agents to generate.
        template: an agent definition, or a function which returns an agent definition.
    """
    agents = [create_agent(template) for i in range(count)]

    return agents


def grid(topology: Topology, template: AgentTemplate) -> List[AgentState]:
    """
    Generate agents on every integer location within the `topology` bounds.

    Args:
        topology: the `context.globals()["topology"]` value.
        template: an agent definition, or a function which returns an agent definition.
    """
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

    agents = [assign_grid_position(i) for i in range(int(count))]

    return agents


def create_layout(
    layout: List[List[str]], templates: Mapping[str, AgentState], offset: List[float] = [0, 0, 0]
) -> List[AgentState]:
    """
    Generate agents with positions based on a `layout`, and definitions
    based on the `templates`.

    Args:
        layout: the locations of agents, typically uploaded as a csv dataset
        templates: the definitions for each type of agent refernced in the layout
        offset: optional offset specifying the position of the bottom right corner of the `layout`
    """

    height = len(layout)
    agents: Dict[str, List[AgentState]] = {}

    for pos_y, row in enumerate(layout):
        for pos_x, template_type in enumerate(row):
            if template_type in templates:
                if template_type not in agents:
                    agents[template_type] = []

                agent_name = (templates[template_type].agent_name or template_type) + str(
                    len(agents[template_type])
                )

                agent = templates[template_type]
                agent["agent_name"] = agent_name
                agent["position"] = [pos_x + offset[0], height - pos_y + offset[1], offset[2]]

                agents[template_type].append(agent)

    agent_list = [agent for sublist in agents.values() for agent in sublist]

    return agent_list
