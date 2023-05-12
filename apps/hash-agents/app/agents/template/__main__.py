"""Provides the executable entry point for the agent."""
import structlog.stdlib

from . import execute
from .io_types import Input

logger = structlog.stdlib.get_logger(__name__)

if __name__ == "HASH":
    """
    Entrypoint when running the agent from the server or the agent orchestrator
    """

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT

    program_in = IN  # noqa: F821
    program_out = execute(program_in)
    OUT = program_out

if __name__ == "__main__":
    """Entrypoint when running the agent from the command line"""
    from app.prerun import setup_prerun

    setup_prerun("dev")

    output = execute(Input(expression="round(pi * 13.37)"))
    logger.info(output=output.result)
