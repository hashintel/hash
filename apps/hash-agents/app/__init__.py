import os

from flask import Flask, request
from dotenv import load_dotenv

from .logger import setup_logging
from .agents import call_agent


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("HASH_AGENT_SECRET_KEY"),
    )

    @app.route("/health", methods=["GET"])
    def health():
        return ""

    @app.route("/agents/<string:agent_name>", methods=["POST"])
    def agent(agent_name):
        return call_agent(agent_name, **request.json)

    return app


def setup():
    setup_logging()
    load_dotenv()
