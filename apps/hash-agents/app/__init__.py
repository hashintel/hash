import logging

from asgi_correlation_id import CorrelationIdMiddleware
from beartype import beartype
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI

from app.logger import logging_middleware, setup_logging
from app.routes import router

logger = logging.getLogger(__name__)


@beartype
def setup(base_logger: logging.Logger | None = None) -> None:
    setup_logging('dev')

    logger.info("Hello world!")

    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)


@beartype
def create_app(base_logger_name: str | None = None) -> FastAPI:
    setup(logging.getLogger(base_logger_name or "uvicorn"))

    app = FastAPI()
    app.include_router(router)
    app.middleware('http')(logging_middleware)
    app.add_middleware(CorrelationIdMiddleware)

    return app
