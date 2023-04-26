"""A python web-server that allows the orchestration of various AI-assisted tasks."""
import structlog.stdlib
from asgi_correlation_id import CorrelationIdMiddleware
from beartype import beartype
from fastapi import FastAPI

from .logger import Environment, http_logging_middleware
from .prerun import setup_prerun
from .routes import router

logger = structlog.stdlib.get_logger(__name__)


@beartype
def create_app(environment: Environment = "dev") -> FastAPI:
    """Runs the app."""
    setup_prerun(environment)

    app = FastAPI()
    app.include_router(router)
    app.middleware("http")(http_logging_middleware)
    app.add_middleware(CorrelationIdMiddleware)

    return app
