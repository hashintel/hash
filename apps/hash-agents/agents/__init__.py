import logging
import os
import runpy
import importlib

from datetime import datetime
from dotenv import load_dotenv


def call_agent(agent: str, **kwargs) -> dict:
    module = f"{__name__}.{agent}"

    io_types = importlib.import_module(f"{module}.io_types")

    out = runpy.run_module(module, run_name='HASH', init_globals={
        'IN': io_types.input_from_dict(dict(kwargs)),
    }).get('OUT')

    return io_types.output_to_dict(out)


def get_logger():
    logger = logging.getLogger("base_logger")
    return logger


def setup_logging():
    if not os.path.exists("./logs"):
        os.mkdir("./logs")
    logging.basicConfig(
        format="%(levelname)-8s [%(asctime)s] %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(f"./logs/run-{datetime.now().isoformat()}.log", mode="w"),
        ]
    )

    log_level = os.getenv("LOG_LEVEL")

    logger = get_logger()
    logger.setLevel(log_level if log_level else logging.WARNING)


def setup():
    setup_logging()
    load_dotenv()
