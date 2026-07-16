#!/usr/bin/env python3
"""HTTP API for Petrinaut optimization.

Endpoints
---------
GET  /optimize         Server-Sent Events stream of objective evaluations,
                       emitted as each trial completes, ending with a summary.       
GET  /status           Current run model and state.

Run with:  uv run python -m src.optimization_api
       or:  uv run uvicorn optimization_api:app --reload

The service binds to HASH_PETRINAUT_OPT_HOST and HASH_PETRINAUT_OPT_PORT
(loaded from the module's `.env`).
"""

from __future__ import annotations

import os
import time
import json

from contextlib import asynccontextmanager
from typing import Union, Generator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.utils import AppStatus, Phase, set_status

# Load HASH_PETRINAUT_OPT_* (and any other) variables from the module's `.env`.
load_dotenv()
from src.petrinaut_client import PetrinautModelSpec, PetrinautModel
from src.petrinaut_optimizer import OptimizationSpec, PetrinautOptimizer

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Single, app-wide status — no session ids
    app.state.status = AppStatus()
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
        StreamingResponse: 
    """
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
        
        set_status(app, phase=Phase.running, detail="Petrinaut CLI and Optimization Model initialized")
    except Exception as exc:
        set_status(app, phase=Phase.error, detail="Petrinaut CLI and Optimization Model could NOT be initialized")
        raise HTTPException(500, f"failed to initialise optimization: {exc}")

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_all(request, n_trials=optimizer.n_trials),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
        StreamingResponse: 
    """
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
        set_status(app, phase=Phase.running, detail="Petrinaut CLI and Optimization Model initialized")
    except Exception as exc:
        set_status(app, phase=Phase.error, detail="Petrinaut CLI and Optimization Model could NOT be initialized")
        raise HTTPException(500, f"failed to initialise optimization: {exc}")

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_best(request, n_trials=optimizer.n_trials),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/status")
def get_status():
    return app.state.status

@app.get("/")
async def root() -> dict:
    return {"message": "Welcome to Petrinaut optimization API"}


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HASH_PETRINAUT_OPT_HOST", "127.0.0.1")
    port = int(os.getenv("HASH_PETRINAUT_OPT_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
