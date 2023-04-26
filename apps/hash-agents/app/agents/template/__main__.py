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
    OUT = main(IN)  # noqa: F821

if __name__ == "__main__":
    """Entrypoint when running the agent from the command line"""
    from app import setup

    setup()

    output = execute(Input(expression="round(pi * 13.37)"))
    logger.info(output=output.result)
