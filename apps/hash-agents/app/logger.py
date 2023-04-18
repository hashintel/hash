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

    handlers = [
        logging.FileHandler(f"{log_folder}/run-{datetime.now().isoformat()}.log", mode="w"),
    ]

    if base_logger:
        base_logger = logging.getLogger(base_logger)
        handlers += base_logger.handlers
        print(base_logger)
    else:
        handlers += [logging.StreamHandler()]

    logging.basicConfig(
        format="%(levelname)-8s [%(asctime)s] %(message)s",
        handlers=handlers,
    )

    log_level = os.getenv("HASH_AGENT_RUNNER_LOG_LEVEL")

    logger = get_logger()
    logger.setLevel(log_level if log_level else logging.WARNING)
