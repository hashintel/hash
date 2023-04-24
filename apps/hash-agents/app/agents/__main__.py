import inspect
import json

import anyio
from beartype import beartype
from rich.pretty import pprint
from typer import Typer

from .. import setup
from . import Agent, call_agent

app = Typer()


@app.command()
def help():
    # always here because typer is otherwise short-circuits
    print("use --help to get help")


@beartype
def register_command(name: str, agent: Agent):
    """
    Register a new command

    Typer doesn't support creating commands directly from models,
    therefore, we need to employ a bit of trickery.

    This function takes a function that takes any arguments (`invoke`)
    and transforms it in a way that typer recognizes each of the `Input` arguments.
    """

    # each pydantic models has an attribute `__fields__` which is a dict with the name
    # and type of the field (resolved annotation).
    fields = agent.Input.__fields__
    args = ((name, field.type_) for name, field in fields.items())

    def invoke(**kwargs: dict):
        try:

            async def run():
                # we know that kwargs will be a valid Input, due to Typer
                return await call_agent(name, **kwargs)

            agent_output = anyio.run(run)
        except Exception as e:
            agent_output = {"error": str(e)}

        pprint(agent_output)

    # `inspect` caches the signature of a function using the `__signature__` key, which
    # typer uses to figure out which arguments are allowed.
    #
    # Example:
    # ```
    # class Input(BaseModel):
    #   expression: str
    #
    # def invoke(**kwargs):
    #    ...
    # ```
    #
    # here in this example kwargs can be any value, which removes one of the major
    # benefits of typer, what we do instead is replace the **signature**
    # (not the actual signature definition) to:
    #
    # ```
    # def invoke(*, expression: str):
    #   ...
    # ```
    #
    # Nothing in the behaviour has changed, but now anything that inspects the signature
    # (like typer) will see a typed representation of the kwargs attribute that we're
    # expecting.
    signature = inspect.signature(invoke)
    invoke.__signature__ = signature.replace(
        parameters=[
            inspect.Parameter(name=k, kind=inspect.Parameter.KEYWORD_ONLY, annotation=v)
            for k, v in args
        ]
    )

    app.command(name)(invoke)


if __name__ == '__main__':
    setup('dev')

    for name, agent in Agent.find().items():
        register_command(name, agent)

    app()
