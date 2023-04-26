"""A python web-server that allows the orchestration of various AI-assisted tasks."""
import structlog.stdlib
from asgi_correlation_id import CorrelationIdMiddleware
from beartype import beartype
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI

from .logger import Environment, http_logging_middleware, setup_logging
from .routes import router

logger = structlog.stdlib.get_logger(__name__)


# TODO: move this to a shared file
@beartype
def setup(environment: Environment) -> None:
    """Enacts the necessary precursors to run the app."""
    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)

    setup_logging(environment)


@beartype
def create_app(environment: Environment = "dev") -> FastAPI:
    """Runs the app."""
    setup(environment)

    app = FastAPI()
    app.include_router(router)
    app.middleware("http")(http_logging_middleware)
    app.add_middleware(CorrelationIdMiddleware)

    return app
