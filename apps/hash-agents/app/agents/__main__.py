"""Executes the agent with the given name and input."""
import json
import sys

from beartype import beartype

from app.prerun import setup_prerun

from . import call_agent


class InvalidArgumentError(RuntimeError):
    """Raised when the input for the agent is invalid."""

    @beartype
    def __init__(self, program_name: str) -> None:  # noqa: D107
        super().__init__(f"Usage: {program_name} <AGENT_NAME> [INPUT]")


@beartype
def main() -> None:
    """Execute the agent."""
    # TODO: make this configurable
    setup_prerun("dev")

    args = sys.argv
    if len(args) < 2:  # noqa: PLR2004
        raise InvalidArgumentError(program_name=args[0])

    agent_name = args[1]
    agent_input = json.loads(args[2]) if len(args) > 2 else {}  # noqa: PLR2004
    try:
        agent_output = call_agent(agent_name, **agent_input)

    # We don't put limitations on the kinds of exceptions produced by agents currently
    except Exception as e:  # noqa: BLE001
        agent_output = {"error": str(e)}
    print(json.dumps(agent_output))  # noqa: T201 we want to return the output on stdout


if __name__ == "__main__":
    main()
