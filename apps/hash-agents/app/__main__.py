import os

from . import create_app, setup

if __name__ == "__main__":
    setup()
    create_app().run(
        host=os.getenv("HASH_AGENT_RUNNER_HOST"),
        port=os.getenv("HASH_AGENT_RUNNER_PORT"),
    )
