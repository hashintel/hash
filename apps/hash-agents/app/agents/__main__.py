import json
import sys

from .. import setup
from . import call_agent


def main():
    setup()

    args = sys.argv
    if len(args) < 2:
        raise Exception(f"Usage: {args[0]} <AGENT_NAME> [INPUT]")

    agent_input = json.loads(args[2]) if len(args) > 2 else {}
    agent_output = call_agent(args[1], **agent_input)
    print(json.dumps(agent_output))


if __name__ == "__main__":
    main()
