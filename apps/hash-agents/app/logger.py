import logging
import os
import sys
from datetime import datetime
from typing import Literal, assert_never

import structlog

Environment = Literal['dev', 'prod']


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

    handlers = [logging.StreamHandler()]

    if environment == 'prod':
        log_folder = os.environ.get("HASH_AGENT_RUNNER_LOG_FOLDER", "./logs")
        if not os.path.exists(log_folder):
            os.mkdir(log_folder)

        handlers.append(
            logging.FileHandler(
                f"{log_folder}/run-{datetime.now().isoformat()}.log", mode="w"
            )
        )

    for handler in handlers:
        handler.setFormatter(formatter)

    handler = logging.StreamHandler()
    # Use OUR `ProcessorFormatter` to format all `logging` entries.
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()

    for handler in handlers:
        root_logger.addHandler(handler)

    root_logger.setLevel(log_level)

    for _log in ["uvicorn", "uvicorn.error"]:
        # Clear the log handlers for uvicorn loggers, and enable propagation
        # so the messages are caught by our root logger and formatted correctly
        # by structlog
        logging.getLogger(_log).handlers.clear()
        logging.getLogger(_log).propagate = True

    # Since we re-create the access logs ourselves, to add all information
    # in the structured log (see the `logging_middleware` in main.py), we clear
    # the handlers and prevent the logs to propagate to a logger higher up in the
    # hierarchy (effectively rendering them silent).
    logging.getLogger("uvicorn.access").handlers.clear()
    logging.getLogger("uvicorn.access").propagate = False

    def handle_exception(exc_type, exc_value, exc_traceback):
        """
        Log any uncaught exception instead of letting it be printed by Python
        (but leave KeyboardInterrupt untouched to allow users to Ctrl+C to stop)
        See https://stackoverflow.com/a/16993115/3641865
        """
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return

        root_logger.error(
            "Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback)
        )

    sys.excepthook = handle_exception
