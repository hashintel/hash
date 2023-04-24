import importlib
import os.path
from abc import ABC, ABCMeta, abstractmethod
from typing import Any, Coroutine, Generic, TypeVar

import structlog.stdlib
from pydantic import BaseModel

from app.agents.globals import AGENTS

logger = structlog.stdlib.get_logger()


DENY_LIST = frozenset(("__init__.py", "__main__.py", "abc.py", "globals.py"))


class AgentMeta(ABCMeta):
    def __new__(
        mcls, name: str, bases: tuple[type, ...], namespace: dict[str, Any], /, **kwargs
    ):
        cls = super().__new__(mcls, name, bases, namespace, **kwargs)

        if ABC in bases:
            # only process agents that are not abstract base classes (are real agents)
            return cls

        AGENTS[cls.name()] = cls()

        return cls

    # noinspection PyMethodMayBeStatic
    @classmethod
    def find(mcls) -> "dict[str, Agent]":
        if AGENTS:
            return AGENTS

        # find any file or directory in the current directory of abc, and import them if
        # they are not on the deny list.
        directory = os.path.dirname(__file__)

        for agent in os.listdir(directory):
            if agent in DENY_LIST:
                continue

            agent = agent.removesuffix('.py')
            # import them, this will register any agent declared in the file or __init__
            importlib.import_module(f"app.agents.{agent}")

        return AGENTS


Input = TypeVar('Input', bound=BaseModel)
Output = TypeVar('Output', bound=BaseModel)


class Agent(ABC, Generic[Input, Output], metaclass=AgentMeta):
    # make I/O types accessible to scripts
    Input: type[Input]
    Output: type[Output]

    # creating this as an abstractmethod allows us to force certain attributes
    @abstractmethod
    def __init__(self):
        ...

    @staticmethod
    @abstractmethod
    def name():
        ...

    @abstractmethod
    async def execute(self, input: Input) -> Coroutine[None, None, Output]:
        ...


if __name__ == '__main__':
    print(Agent.find())
