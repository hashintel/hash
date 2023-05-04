"""Contains code for pre-run setup."""

from beartype import beartype
from dotenv import find_dotenv, load_dotenv

from .logger import Environment, setup_logging


@beartype
def setup_prerun(environment: Environment) -> None:
    """Loads and configures surrounding tooling in preparation for running."""
    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)

    setup_logging(environment)
