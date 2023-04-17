import runpy
import sys

if __name__ == '__main__':
    args = sys.argv
    if len(args) < 2:
        raise Exception(f"Usage: {args[0]} <AGENT_NAME> [INPUT]")

    out = runpy.run_module(args[1], run_name='HASH', init_globals={
        'IN': args[2] if len(args) > 2 else None,
    }).get('OUT')

    if out is not None:
        print("agent output:")
        print(out)
