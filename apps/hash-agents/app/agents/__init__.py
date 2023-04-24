from typing import Coroutine

import structlog
from beartype import beartype
from pydantic import BaseModel

from app.agents.abc import Agent

logger = structlog.stdlib.get_logger(__name__)


class InvalidAgentNameError(ValueError):
    @beartype
    def __init__(self, agent_name: str, allowed_agents: list[str]) -> None:
        super().__init__(
            f"Invalid agent name: {agent_name}. Allowed agents: {allowed_agents}"
        )


class InvalidAgentOutputError(ValueError):
    @beartype
    def __init__(self, agent_name: str, output: BaseModel) -> None:
        super().__init__(f"Unexpected output for agent {agent_name}: {output}")


@beartype
async def call_agent(name: str, **kwargs: dict) -> Coroutine[None, None, dict]:
    allowed_agents = {k: v for k, v in Agent.find().items()}

    agent: Agent | None = allowed_agents.get(name)

    if agent is None:
        raise InvalidAgentNameError(name, list(allowed_agents.keys()))

    output = await agent.execute(agent.Input.parse_obj(kwargs))

    try:
        output = output.dict()
    except AssertionError as e:
        raise InvalidAgentOutputError(name, output) from e

    logger.debug(
        "Agent output",
        agent=name,
        output=output,
    )

    return output
