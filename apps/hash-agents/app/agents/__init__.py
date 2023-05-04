"""A collection of AI-assisted tasks (agents) that can be executed by the app."""
import importlib
import os
import runpy
from pathlib import Path
from typing import Any

import structlog
from beartype import beartype

logger = structlog.stdlib.get_logger(__name__)


@beartype
def find_allowed_agents() -> list[str]:
    """Searches the file-system to locate the agents that can be called."""
    agents_dir = Path(__file__).parent
    allowed_agents = []
    for agent in os.listdir(agents_dir):
        agent_dir = agents_dir / agent
        if (
            agent_dir.is_dir()
            and Path.exists(agent_dir / "__main__.py")
            and Path.exists(agent_dir / "io_types.py")
        ):
            allowed_agents.append(agent)
    return allowed_agents


class InvalidAgentNameError(ValueError):
    """Raised when an invalid agent name is provided."""

    @beartype
    def __init__(  # noqa: D107
        self,
        agent_name: str,
        allowed_agents: list[str],
    ) -> None:
        super().__init__(
            f"Invalid agent name: {agent_name}. Allowed agents: {allowed_agents}",
        )


class InvalidAgentOutputError(ValueError):
    """Raised when an agent returns an unexpected output."""

    @beartype
    def __init__(self, agent_name: str, output: Any) -> None:  # noqa: ANN401, D107
        super().__init__(f"Unexpected output for agent {agent_name}: {output}")


@beartype
def call_agent(agent: str, **kwargs: dict) -> dict:
    """Calls an agent with the provided arguments."""
    allowed_agents = find_allowed_agents()
    if agent not in allowed_agents:
        raise InvalidAgentNameError(agent, allowed_agents)

    module = f"{__name__}.{agent}"

    io_types = importlib.import_module(f"{module}.io_types")

    logger.debug("Calling agent", agent=agent, kwargs=kwargs)
    out = runpy.run_module(
        module,
        run_name="HASH",
        init_globals={
            "IN": io_types.Input.parse_obj(kwargs),
        },
    ).get("OUT")

    try:
        agent_output = io_types.Output.dict(out)
    except AssertionError as e:
        raise InvalidAgentOutputError(agent, out) from e

    logger.debug(
        "Agent output",
        agent=agent,
        output=agent_output,
    )

    return agent_output
