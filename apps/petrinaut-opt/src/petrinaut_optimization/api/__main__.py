"""Run the API with the configured development host and port."""

import os

import uvicorn

from petrinaut_optimization.api import app

uvicorn.run(
    app,
    host=os.getenv("HASH_PETRINAUT_OPT_HOST", "localhost"),
    port=int(os.getenv("HASH_PETRINAUT_OPT_PORT", "4004")),
)
