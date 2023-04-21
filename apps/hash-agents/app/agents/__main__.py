import json
import sys
from typing import Self

from .. import setup
from . import call_agent


class InvalidArgumentError(RuntimeError):
    def __init__(self: Self, program_name: str) -> None:
        super().__init__(f"Usage: {program_name} <AGENT_NAME> [INPUT]")


def main() -> None:
    setup()

    args = sys.argv
    if len(args) < 2:
        raise InvalidArgumentError(program_name=args[0])

    agent_name = args[1]
    agent_input = json.loads(args[2]) if len(args) > 2 else {}
    try:
        agent_output = call_agent(agent_name, **agent_input)
    except Exception as e:
        agent_output = {"error": str(e)}
    print(json.dumps(agent_output))


if __name__ == "__main__":
    main()
