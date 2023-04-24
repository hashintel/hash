import inspect

import anyio
from argdantic import ArgParser
from beartype import beartype
from rich.pretty import pprint

from .. import setup
from . import Agent, call_agent

app = ArgParser()


@app.command()
def help():
    print("use --help for help")


@beartype
def register_command(name: str, agent: Agent):
    @app.command(name, singleton=True)
    def invoke(input: agent.Input):
        try:

            async def run():
                # we know that kwargs will be a valid Input, due to Typer
                return await call_agent(name, **input.dict())

            agent_output = anyio.run(run)
        except Exception as e:
            agent_output = {"error": str(e)}

        pprint(agent_output)


if __name__ == '__main__':
    setup('dev')

    for name, agent in Agent.find().items():
        register_command(name, agent)

    app()
