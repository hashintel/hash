import runpy
import importlib


def call_agent(agent: str, **kwargs) -> dict:
    if "." in agent:
        raise Exception("Invalid agent name, an agent name must not contain a dot.")

    module = f"{__name__}.{agent}"

    io_types = importlib.import_module(f"{module}.io_types")

    out = runpy.run_module(
        module,
        run_name="HASH",
        init_globals={
            "IN": io_types.input_from_dict(dict(kwargs)),
        },
    ).get("OUT")

    return io_types.output_to_dict(out)
