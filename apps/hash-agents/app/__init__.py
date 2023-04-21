# Module level import not at top of file, required for monkey patching
# ruff: noqa: E402

from .monkey import monkey_patch

monkey_patch()

import os
import secrets
import logging

from flask import Flask, request, Response, jsonify
from dotenv import load_dotenv, find_dotenv

from .logger import setup_logging
from .agents import call_agent

logger = logging.getLogger(__name__)


def create_app(base_logger: str | None = None) -> Flask:
    setup(base_logger)

    app = Flask(__name__, instance_relative_config=True)
    secret_key = os.environ.get("HASH_AGENT_RUNNER_SECRET_KEY")
    if not secret_key:
        logger.warning(
            "No secret key set for HASH-Agent-Runner, generating a random key!"
        )
        logger.info(
            "Set the `HASH_AGENT_RUNNER_SECRET_KEY` variable to specify a secret key."
        )
        secret_key = secrets.token_hex(32)

    app.config.from_mapping(
        SECRET_KEY=secret_key,
    )

    @app.route("/health", methods=["GET"])
    def health() -> Response:
        return jsonify(True)

    @app.route("/agents/<string:agent_name>", methods=["POST"])
    def agent(agent_name: str) -> dict:
        # noinspection PyBroadException
        try:
            return call_agent(agent_name, **request.json)
        except Exception:
            logger.exception("Unable to run agent")
            return {"error": "Could not execute agent. Look in logs for cause."}

    return app


def setup(base_logger: str | None = None) -> None:
    setup_logging(base_logger)
    load_dotenv()
    load_dotenv(dotenv_path=find_dotenv(filename=".env.local"), override=True)
