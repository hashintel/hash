import json
import sys

from beartype import beartype

from .. import setup
from . import call_agent


class InvalidArgumentError(RuntimeError):
    @beartype
    def __init__(self, program_name: str) -> None:
        super().__init__(f"Usage: {program_name} <AGENT_NAME> [INPUT]")


@beartype
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
    print(json.dumps(agent_output))  # noqa: T201


if __name__ == "__main__":
    main()
