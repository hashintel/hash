import json
import runpy
import sys
import importlib
from . import setup

if __name__ == '__main__':
    args = sys.argv
    if len(args) < 2:
        raise Exception(f"Usage: {args[0]} <AGENT_NAME> [INPUT]")

    setup()

    module_path = f"agents.{args[1]}"

    io_types = importlib.import_module(f"{module_path}.io_types")

    agent_input = None
    if len(args) > 2:
        agent_input = io_types.input_from_dict(json.loads(args[2]))

    out = runpy.run_module(module_path, run_name='HASH', init_globals={
        'IN': agent_input,
    }).get('OUT')

    agent_output = json.dumps(io_types.output_to_dict(out))
    print(agent_output)
