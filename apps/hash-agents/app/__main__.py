import os

from . import setup, create_app

if __name__ == "__main__":
    setup()
    create_app().run(
        host=os.getenv("HASH_AGENT_RUNNER_HOST"),
        port=os.getenv("HASH_AGENT_RUNNER_PORT"),
    )
