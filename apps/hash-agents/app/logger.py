import logging
import logging.config
import os
import time
from datetime import datetime
from typing import Callable, Literal, assert_never

import structlog
from asgi_correlation_id import correlation_id
from starlette.requests import Request
from starlette.responses import Response
from uvicorn.protocols.utils import get_path_with_query_string

Environment = Literal['dev', 'prod']

access_logger = structlog.stdlib.get_logger("api.access")


async def logging_middleware(request: Request, call_next: Callable) -> Response:
    """
    Adapted from https://gist.github.com/nymous/f138c7f06062b7c43c060bf03759c29e
    """

    structlog.contextvars.clear_contextvars()
    # These context vars will be added to all log entries emitted during the request
    request_id = correlation_id.get()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    start_time = time.perf_counter_ns()
    # If the call_next raises an error, we still want to return our own 500 response,
    # so we can add headers to it (process time, request ID...)
    response = Response(status_code=500)
    try:
        response = await call_next(request)
    except Exception:
        structlog.stdlib.get_logger("api.error").exception("Uncaught exception")
        raise
    finally:
        process_time = time.perf_counter_ns() - start_time

        status_code = response.status_code
        url = get_path_with_query_string(request.scope)
        client_host = request.client.host
        client_port = request.client.port
        http_method = request.method
        http_version = request.scope["http_version"]

        # Recreate the Uvicorn access log format, but add all parameters as structured information
        access_logger.info(
            f"""{client_host}:{client_port} - "{http_method} {url} HTTP/{http_version}" {status_code}""",
            http={
                "url": str(request.url),
                "status_code": status_code,
                "method": http_method,
                "request_id": request_id,
                "version": http_version,
            },
            network={"client": {"ip": client_host, "port": client_port}},
            duration=process_time,
        )

        return response


def extract_from_record(_, __, event_dict: dict):
    """
    Extract thread and process names and add them to the event dict.
    """
    record = event_dict["_record"]
    event_dict["thread_name"] = record.threadName
    event_dict["process_name"] = record.processName

    return event_dict


def setup_logging(environment: Environment = 'dev') -> None:
    # we're using the most ambitious approach outlined in
    # https://www.structlog.org/en/stable/standard-library.html#rendering-using-structlog-based-formatters-within-logging

    shared = [
        # If log level is too low, abort pipeline and throw away log entry.
        structlog.stdlib.filter_by_level,
        # Add the name of the logger to event dict.
        structlog.stdlib.add_logger_name,
        # Add log level to event dict.
        structlog.stdlib.add_log_level,
        # Perform %-style formatting.
        structlog.stdlib.PositionalArgumentsFormatter(),
        # Add a timestamp in ISO 8601 format.
        structlog.processors.TimeStamper(fmt="iso"),
        # If the "stack_info" key in the event dict is true, remove it and
        # render the current stack trace in the "stack" key.
        structlog.processors.StackInfoRenderer(),
        # If the "exc_info" key in the event dict is either true or a
        # sys.exc_info() tuple, remove "exc_info" and render the exception
        # with traceback into the "exception" key.
        structlog.processors.format_exc_info,
        # If some value is in bytes, decode it to a unicode str.
        structlog.processors.UnicodeDecoder(),
        # Add callsite parameters.
        structlog.processors.CallsiteParameterAdder(
            {
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }
        ),
    ]

    match environment:
        case "dev":
            # Use a nice console renderer (utilizing rich) for development.
            processor = structlog.dev.ConsoleRenderer()
        case "prod":
            # Render the final event dict as JSON (if in production).
            processor = structlog.processors.JSONRenderer()
        case _:
            assert_never(environment)

    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        # `wrapper_class` is the bound logger that you get back from
        # get_logger(). This one imitates the API of `logging.Logger`.
        # we also use the typings of this one
        wrapper_class=structlog.stdlib.BoundLogger,
        # `logger_factory` is used to create wrapped loggers that are used for
        # OUTPUT. This one returns a `logging.Logger`. The final value (a JSON
        # string) from the final processor (`JSONRenderer`) will be passed to
        # the method of the same name as that you've called on the bound logger.
        logger_factory=structlog.stdlib.LoggerFactory(),
        # Effectively freeze configuration after creating the first bound
        # logger.
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        # These run ONLY on `logging` entries that do NOT originate within
        # structlog.
        foreign_pre_chain=shared,
        # These run on ALL entries after the pre_chain is done.
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            processor,
        ],
    )

    log_level = os.getenv("HASH_AGENT_RUNNER_LOG_LEVEL")
    log_level = log_level or logging.WARNING

    log_folder = os.environ.get("HASH_AGENT_RUNNER_LOG_FOLDER", "./logs")
    if not os.path.exists(log_folder):
        os.mkdir(log_folder)

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": True,
            "formatters": {
                "file": {
                    "()": structlog.stdlib.ProcessorFormatter,
                    "processors": [
                        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                        structlog.processors.JSONRenderer(),
                    ],
                    "foreign_pre_chain": shared,
                },
                "stdout": {
                    "()": structlog.stdlib.ProcessorFormatter,
                    "processors": [
                        extract_from_record,
                        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                        processor,
                    ],
                    "foreign_pre_chain": shared,
                },
                "uvicorn_default": {
                    "()": "uvicorn.logging.DefaultFormatter",
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                },
                "uvicorn_access": {
                    "()": "uvicorn.logging.AccessFormatter",
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                },
            },
            "handlers": {
                "default": {
                    "level": "DEBUG",
                    "class": "logging.StreamHandler",
                    "formatter": "stdout",
                },
                "file": {
                    "level": "DEBUG",
                    "class": "logging.handlers.WatchedFileHandler",
                    "filename": f"{log_folder}/run-{datetime.now().isoformat()}.log",
                    "formatter": "file",
                },
                "uvicorn_default": {
                    "formatter": "uvicorn_default",
                    "class": "logging.NullHandler",
                },
                "uvicorn_access": {
                    "formatter": "uvicorn_access",
                    "class": "logging.NullHandler",
                },
            },
            "loggers": {
                "": {
                    "handlers": ["default", "file"],
                    "level": "DEBUG",
                    "propagate": True,
                },
                "uvicorn.error": {
                    "level": "INFO",
                    "handlers": ["uvicorn_default"],
                    "propagate": False,
                },
                "uvicorn.access": {
                    "level": "INFO",
                    "handlers": ["uvicorn_access"],
                    "propagate": False,
                },
            },
        }
    )
