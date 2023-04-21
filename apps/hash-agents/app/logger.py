import logging
import os
from datetime import datetime


def get_logger():
    logger = logging.getLogger("base_logger")
    return logger


def setup_logging(base_logger=None):
    log_folder = os.environ.get("HASH_AGENT_RUNNER_LOG_FOLDER", "./logs")
    if not os.path.exists(log_folder):
        os.mkdir(log_folder)

    log_level = os.getenv("HASH_AGENT_RUNNER_LOG_LEVEL")

    handlers = [
        logging.FileHandler(
            f"{log_folder}/run-{datetime.now().isoformat()}.log", mode="w"
        ),
    ]

    if base_logger:
        base_logger = logging.getLogger(base_logger)
        handlers += base_logger.handlers
        if not log_level:
            log_level = base_logger.level
    else:
        handlers += [logging.StreamHandler()]
        if not log_level:
            log_level = logging.WARNING

    logging.basicConfig(
        format="%(levelname)-8s [%(asctime)s] %(message)s",
        handlers=handlers,
        level=log_level,
    )
