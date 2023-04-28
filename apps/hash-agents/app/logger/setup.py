"""Utilities for setting up structured logging."""

import logging
import logging.config
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, assert_never

import structlog
from langchain import callbacks

from app.logger.langchain import LoggingCallbackHandler

Environment = Literal["dev", "prod"]


def setup_logging(environment: Environment = "dev") -> None:
    """Sets up structured logging."""
    # we're using the most ambitious approach outlined in
    # https://www.structlog.org/en/stable/standard-library.html

    shared = [
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
        # If some value is in bytes, decode it to a unicode str.
        structlog.processors.UnicodeDecoder(),
        # Add callsite parameters.
        structlog.processors.CallsiteParameterAdder(
            {
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            },
        ),
        structlog.stdlib.ExtraAdder(),
    ]

    match environment:
        case "dev":
            default_log_level = logging.DEBUG
        case "prod":
            default_log_level = logging.WARNING
        case _:
            assert_never(environment)

    log_level = os.getenv("HASH_AGENT_RUNNER_LOG_LEVEL")
    log_level = log_level or default_log_level

    log_folder = Path(os.environ.get("HASH_AGENT_RUNNER_LOG_FOLDER", "./logs"))
    if not log_folder.exists():
        log_folder.mkdir()

    file_name = f"{log_folder}/run-{datetime.now(tz=timezone.utc).isoformat()}.log"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "file": {
                    "()": structlog.stdlib.ProcessorFormatter,
                    "processors": [
                        structlog.processors.dict_tracebacks,
                        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                        structlog.processors.JSONRenderer(),
                    ],
                    "foreign_pre_chain": shared,
                },
                "stdout": {
                    "()": structlog.stdlib.ProcessorFormatter,
                    "processors": [
                        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                        structlog.dev.ConsoleRenderer(),
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
                    "level": logging.getLevelName(log_level),
                    "class": "logging.StreamHandler",
                    "formatter": "stdout",
                },
                "file": {
                    "level": logging.getLevelName(log_level),
                    "class": "logging.handlers.WatchedFileHandler",
                    "filename": file_name,
                    "formatter": "file",
                },
            },
            "loggers": {
                "": {
                    "handlers": ["default", "file"],
                    "level": "DEBUG",
                    "propagate": True,
                },
            },
        },
    )

    # Disable uvicorn access, as otherwise we have duplicate events
    logging.getLogger("uvicorn.access").handlers.clear()

    if logger := logging.getLogger("gunicorn.error"):
        # propagate errors from gunicorn
        logger.propagate = True

    if logger := logging.getLogger("uvicorn.error"):
        # propagate errors from uvicorn
        logger.propagate = True

    structlog.configure(
        processors=[
            *shared,
            # If log level is too low, abort pipeline and throw away log entry.
            structlog.stdlib.filter_by_level,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
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

    callbacks.set_handler(LoggingCallbackHandler())
