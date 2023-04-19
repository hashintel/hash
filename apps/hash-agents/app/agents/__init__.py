import runpy
import os
import importlib


def find_allowed_agents():
    agents_dir = os.path.dirname(__file__)
    allowed_agents = []
    for agent in os.listdir(agents_dir):
        agent_dir = os.path.join(agents_dir, agent)
        if (
            os.path.isdir(agent_dir)
            and os.path.exists(os.path.join(agent_dir, "__main__.py"))
            and os.path.exists(os.path.join(agent_dir, "io_types.py"))
        ):
            allowed_agents.append(agent)
    return allowed_agents


def call_agent(agent: str, **kwargs) -> dict:
    allowed_agents = find_allowed_agents()
    if agent not in allowed_agents:
        raise Exception(f"Invalid agent name, allowed agents are: {allowed_agents}")

    module = f"{__name__}.{agent}"

    io_types = importlib.import_module(f"{module}.io_types")

    out = runpy.run_module(
        module,
        run_name="HASH",
        init_globals={
            "IN": io_types.input_from_dict(dict(kwargs)),
        },
    ).get("OUT")

    return io_types.output_to_dict(out)
