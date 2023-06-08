import uuid
from dataclasses import dataclass, field
from typing import Optional, List


def generate_agent_id():
    """
    Generate a valid UUID-V4 address to create a new agent with.
    """
    return str(uuid.uuid4())


@dataclass
class AgentState:
    agent_id: str = field(default_factory=generate_agent_id)
    agent_name: Optional[str] = None
    position: Optional[List[float]] = None
    direction: Optional[List[float]] = None

    def __setitem__(self, key, value):
        setattr(self, key, value)

    def __getitem__(self, key):
        return getattr(self, key)


class AgentFieldError(Exception):
    def __init__(self, agent_id: str, field: str, msg: str = ""):
        self.agent_id = agent_id
        self.field = field
        self.msg = msg

    def __str__(self):
        return f"field '{self.field}' on agent '{self.agent_id}': {self.msg}"
