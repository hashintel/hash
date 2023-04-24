import importlib
import os.path
from abc import ABC, ABCMeta, abstractmethod
from typing import Any, Coroutine, Self

import structlog.stdlib
from beartype import beartype

from app.agents.template.io_types import Input, Output

logger = structlog.stdlib.get_logger()

# Python has no notion of private items, this hides it from the docs at least
_AGENTS: "dict[str, Agent] | None" = None

DENY_LIST = frozenset(("__init__.py", "__main__.py", "abc.py"))


class AgentMeta(ABCMeta):
    def __new__(
        mcls, name: str, bases: tuple[type, ...], namespace: dict[str, Any], /, **kwargs
    ):
        cls = super().__new__(mcls, name, bases, namespace, **kwargs)

        if ABC in bases:
            # only process agents that are not abstract base classes (are real agents)
            return cls

        module = namespace.get('__module__')
        if module is None:
            logger.warning("unable to determine module of agent", agent=name)
            return cls

        global _AGENTS

        if _AGENTS is None:
            _AGENTS = {}

        _AGENTS[module] = cls()

        return cls

    # noinspection PyMethodMayBeStatic
    def find(cls) -> "dict[str, Agent]":
        if _AGENTS:
            return _AGENTS

        # find any file or directory in the current directory of abc, and import them if
        # they are not on the deny list.
        directory = os.path.dirname(__file__)

        for agent in os.listdir(directory):
            if agent in DENY_LIST:
                continue

            agent = agent.removeprefix('.py')
            # import them, this will register any agent declared in the file or __init__
            importlib.import_module(f".{agent}")

        return _AGENTS or {}


class Agent(ABC, metaclass=AgentMeta):
    # creating this as an abstractmethod allows us to force certain attributes
    @abstractmethod
    def __init__(self):
        ...

    @abstractmethod
    async def execute(self, input: Input) -> Coroutine[None, None, Output]:
        ...


if __name__ == '__main__':
    print(Agent.find())
