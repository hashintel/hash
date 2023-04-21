import structlog.stdlib
from asgi_correlation_id import CorrelationIdMiddleware
from beartype import beartype
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI

from app.logger import Environment, logging_middleware, setup_logging
from app.routes import router

logger = structlog.stdlib.get_logger(__name__)


@beartype
def setup(environment: Environment) -> None:
    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)

    setup_logging(environment)


@beartype
def create_app(environment: Environment | None = None) -> FastAPI:
    setup(environment or 'dev')

    app = FastAPI()
    app.include_router(router)
    app.middleware('http')(logging_middleware)
    app.add_middleware(CorrelationIdMiddleware)

    return app
