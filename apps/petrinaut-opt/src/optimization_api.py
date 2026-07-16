#!/usr/bin/env python3
"""HTTP API for Petrinaut optimization.

Endpoints
---------
GET  /optimize         Server-Sent Events stream of objective evaluations,
                       emitted as each trial completes, ending with a summary.       
GET  /status           Current state of all optimization runs.

Run with:  uv run python -m src.optimization_api
       or:  uv run uvicorn optimization_api:app --reload

The service binds to HASH_PETRINAUT_OPT_HOST and HASH_PETRINAUT_OPT_PORT
(loaded from the module's `.env`).
"""

from __future__ import annotations

import os
import time
import json

from pathlib import Path
from contextlib import asynccontextmanager
from typing import Union, Generator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.utils import AppStatus, Phase, StatusStore, set_status

# Load HASH_PETRINAUT_OPT_* (and any other) variables from the module's `.env`.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOTENV_PATH = REPO_ROOT / ".env"
load_dotenv(DOTENV_PATH)
from src.petrinaut_client import PetrinautModelSpec, PetrinautModel
from src.petrinaut_optimizer import OptimizationSpec, PetrinautOptimizer

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise the app-wide run status registry on startup.

    Args:
        app (FastAPI): The application whose `state.statuses` is initialised.
    """
    app.state.statuses = StatusStore()
    yield

app = FastAPI(title="Petrinaut optimization Python API",lifespan=lifespan)


# ─────────────────────────────────────────────────────────────────────────────
# Dummy functions
# ─────────────────────────────────────────────────────────────────────────────

def dummy_stream() -> Generator[dict[str,Union[float,int]]]:
    """Dummy data stream to check that API endpoint works
    """
    from datetime import datetime
    n = 0   
    while n < 10:
        time.sleep(2)
        event = {"inputs":[1.2,3.4],"output":datetime.now().strftime('%H:%M:%S'),"step":n}
        yield f"{json.dumps(event)}\n\n"
        n +=1 



# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/optimize/all",response_class=StreamingResponse)
async def get_optimize_all(request: Request, opt_spec: OptimizationSpec, pn_spec: PetrinautModelSpec) -> StreamingResponse:
    """Streams optimization results per optimization step (trial) to json line

    Args:
        request (Request): Optimization API generic request
        opt_spec (OptimizationSpec): Specification for Petri Net input optimization with respect to output
        pn_spec (PetrinautModelSpec): Specification for Petri Net execution

    Raises:
        HTTPException: failed to initialise optimization

    Returns:
        StreamingResponse: SSE stream of per-trial evaluation frames.
    """
    run_id = app.state.statuses.create().run_id

    # Build the model + optimizer.
    try:
        # Build the Petri net from the client spec.
        petrinet_model = PetrinautModel(pn_spec)
        # Instantiate Petrinaut optimization class
        optimizer = PetrinautOptimizer(
            opt_spec = opt_spec,
            pn_model = petrinet_model,
        )
        # Start the Petrinaut model
        optimizer.pn_model.start()

        set_status(
            app,
            run_id,
            phase=Phase.running,
            detail="Petrinaut CLI and Optimization Model initialized",
        )
    except Exception as exc:
        set_status(
            app,
            run_id,
            phase=Phase.error,
            detail="Petrinaut CLI and Optimization Model could NOT be initialized",
        )
        raise HTTPException(
            500,
            f"failed to initialise optimization: {exc}",
            headers={"X-Optimization-Run-ID": run_id},
        )

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_all(request, run_id=run_id, n_trials=optimizer.n_trials),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Optimization-Run-ID": run_id,
        },
    )

@app.get("/optimize/best",response_class=StreamingResponse)
async def get_optimize_best(request: Request, opt_spec: OptimizationSpec, pn_spec: PetrinautModelSpec) -> StreamingResponse:
    """Streams current best optimization results per optimization step (trial) to json line

    Args:
        request (Request): Optimization API generic request
        opt_spec (OptimizationSpec): Specification for Petri Net input optimization with respect to output
        pn_spec (PetrinautModelSpec): Specification for Petri Net execution

    Raises:
        HTTPException: failed to initialise optimization

    Returns:
        StreamingResponse: SSE stream of best-so-far evaluation frames.
    """
    run_id = app.state.statuses.create().run_id

    # Build the model + optimizer.
    try:
        # Build the Petri net from the client spec.
        petrinet_model = PetrinautModel(pn_spec)
        # Instantiate Petrinaut optimization class
        optimizer = PetrinautOptimizer(
            opt_spec = opt_spec,
            pn_model = petrinet_model,
        )
        # Start the Petrinaut model
        optimizer.pn_model.start()
        set_status(
            app,
            run_id,
            phase=Phase.running,
            detail="Petrinaut CLI and Optimization Model initialized",
        )
    except Exception as exc:
        set_status(
            app,
            run_id,
            phase=Phase.error,
            detail="Petrinaut CLI and Optimization Model could NOT be initialized",
        )
        raise HTTPException(
            500,
            f"failed to initialise optimization: {exc}",
            headers={"X-Optimization-Run-ID": run_id},
        )

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_best(request, run_id=run_id, n_trials=optimizer.n_trials),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Optimization-Run-ID": run_id,
        },
    )

@app.get("/status")
def get_status() -> list[AppStatus]:
    """Return a snapshot of every optimization run's status.

    Returns:
        list[AppStatus]: Statuses containing their run identifiers.
    """
    return app.state.statuses.all()


@app.get("/status/{run_id}")
def get_run_status(run_id: str) -> AppStatus:
    """Return the status of one optimization run."""
    status = app.state.statuses.get(run_id)
    if status is None:
        raise HTTPException(404, f"optimization run not found: {run_id}")
    return status

@app.get("/")
async def root() -> dict:
    """Return a welcome message for the API root.

    Returns:
        dict: A greeting payload.
    """
    return {"message": "Welcome to Petrinaut optimization API"}


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HASH_PETRINAUT_OPT_HOST", "localhost")
    port = int(os.getenv("HASH_PETRINAUT_OPT_PORT", "4004"))
    uvicorn.run(app, host=host, port=port)
