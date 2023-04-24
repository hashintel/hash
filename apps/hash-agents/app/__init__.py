import structlog.stdlib
from asgi_correlation_id import CorrelationIdMiddleware
from beartype import beartype
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI

from app.logger import Environment, http_logging_middleware, setup_logging
from app.routes import router

from .logger import setup_logging

logger = structlog.stdlib.get_logger(__name__)


@beartype
def setup(environment: Environment) -> None:
    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)

    setup_logging(environment)


@beartype
def create_app(environment: Environment = "dev") -> FastAPI:
    setup(environment)

    app = FastAPI()
    app.include_router(router)
    app.middleware("http")(http_logging_middleware)
    app.add_middleware(CorrelationIdMiddleware)

    return app
