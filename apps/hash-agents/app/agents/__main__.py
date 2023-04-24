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
    fields = agent.Input.__fields__
    args = ((name, field.type_) for name, field in fields.items())

    def invoke(**kwargs: dict):
        try:

            async def wrap():
                return await call_agent(name, **kwargs)

            agent_output = anyio.run(wrap)
        except Exception as e:
            agent_output = {"error": str(e)}

        pprint(agent_output)

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
