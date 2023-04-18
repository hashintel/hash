import json
import runpy
import sys
import importlib
from . import setup


def call_agent(agent: str, **kwargs) -> dict:
    module = f"agents.{agent}"

    io_types = importlib.import_module(f"{module}.io_types")

    out = runpy.run_module(module, run_name='HASH', init_globals={
        'IN': io_types.input_from_dict(dict(kwargs)),
    }).get('OUT')

    return io_types.output_to_dict(out)


def main():
    setup()

    args = sys.argv
    if len(args) < 2:
        raise Exception(f"Usage: {args[0]} <AGENT_NAME> [INPUT]")

    agent_input = json.loads(args[2]) if len(args) > 2 else {}
    agent_output = call_agent(args[1], **agent_input)
    print(json.dumps(agent_output))


if __name__ == '__main__':
    main()
