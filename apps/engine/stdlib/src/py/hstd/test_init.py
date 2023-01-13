from .agent import AgentState
from .spatial import Topology
from .init import scatter, grid, stack, create_layout

init_topology = Topology([0, 2], [0, 2], [])

agent = AgentState(agent_name="test")
agent_function = lambda: AgentState(agent_name="test")

num_agents = 4


def test_scatter():
    scatter_agents = scatter(num_agents, init_topology, agent)
    scatter_agents_function = scatter(num_agents, init_topology, agent_function)

    assert len(scatter_agents) == num_agents
    assert len(scatter_agents_function) == num_agents

    def subtest(a):
        assert a["position"][0] >= init_topology.x_bounds[0]
        assert a["position"][0] <= init_topology.x_bounds[1]
        assert a["position"][1] >= init_topology.y_bounds[0]
        assert a["position"][1] <= init_topology.y_bounds[1]

        assert a["agent_name"] == "test"

    [subtest(agent) for agent in scatter_agents]
    [subtest(agent) for agent in scatter_agents_function]


def test_stack():
    stack_agents = stack(num_agents, agent)
    stack_agents_function = stack(num_agents, agent_function)

    assert len(stack_agents) == num_agents
    assert len(stack_agents_function) == num_agents

    def subtest(a):
        assert a["agent_name"] == "test"

    [subtest(agent) for agent in stack_agents]
    [subtest(agent) for agent in stack_agents_function]


def test_grid():
    grid_agents = grid(init_topology, agent)
    grid_agents_function = grid(init_topology, agent)

    assert len(grid_agents) == num_agents
    assert len(grid_agents_function) == num_agents

    def subtest(a):
        assert a["position"][0] >= init_topology.x_bounds[0]
        assert a["position"][0] <= init_topology.x_bounds[1]
        assert a["position"][1] >= init_topology.y_bounds[0]
        assert a["position"][1] <= init_topology.y_bounds[1]

        assert int(a["position"][0]) == a["position"][0]
        assert int(a["position"][1]) == a["position"][1]

        assert a["agent_name"] == "test"

    [subtest(agent) for agent in grid_agents]
    [subtest(agent) for agent in grid_agents_function]
