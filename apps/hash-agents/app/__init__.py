import os
import secrets
import json

from logging import getLogger
from flask import Flask, request
from dotenv import load_dotenv

from .logger import setup_logging
from .agents import call_agent


def create_app(base_logger=None):
    setup(base_logger)

    app = Flask(__name__, instance_relative_config=True)
    secret_key = os.environ.get("HASH_AGENT_RUNNER_SECRET_KEY")
    if not secret_key:
        getLogger(__name__).warning("No secret key set for HASH-Agent-Runner, generating a random key!")
        getLogger(__name__).info("Set the `HASH_AGENT_RUNNER_SECRET_KEY` variable to specify a secret key.")
        secret_key = secrets.token_hex(32)

    app.config.from_mapping(
        SECRET_KEY=secret_key,
    )

    @app.route("/health", methods=["GET"])
    def health():
        return ""

    @app.route("/agents/<string:agent_name>", methods=["POST"])
    def agent(agent_name):
        try:
            return call_agent(agent_name, **request.json)
        except Exception as e:
            return json.dumps({"error": str(e)})

    return app


def setup(base_logger=None):
    setup_logging(base_logger)
    load_dotenv()
