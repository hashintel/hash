#!/usr/bin/env python3
"""HTTP API for Petrinaut optimization.

Endpoints
---------
POST /init             Initialise the Petri-net execution model (petrinet_model.initialize)
                       and start an optimization run in the background.
GET  /optimize         Server-Sent Events stream of objective evaluations,
                       emitted as each trial completes, ending with a summary.       
GET  /status           Current run model and state.

Run with:  uv run uvicorn optimization_api:app --reload
"""

from __future__ import annotations

import time
import uuid
import json

from contextlib import asynccontextmanager
from typing import Union, Generator

import optuna
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from petrinaut_client import PetrinautModelSpec, PetrinautModel
from petrinaut_optimizer import OptimizationSpec, PetrinautOptimizer

optuna.logging.set_verbosity(optuna.logging.WARNING)

# Concurrency is scoped per session: each `PetrinautOptimizer` holds its own lock
# so a single session can't be driven by two concurrent streams (see
# `stream_all`/`stream_best`). Independent sessions run independently — there is
# deliberately no global single-run guard.

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.sessions: dict[str, PetrinautOptimizer] = {}
    yield
    app.state.sessions.clear()

app = FastAPI(title="Petrinaut optimization API", lifespan=lifespan)


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
@app.post("/init")
async def init(opt_spec: OptimizationSpec, pn_spec: PetrinautModelSpec) -> dict:
    """Initialises the Petrinaut model and its optimization model from the Petrinaut UI

    Args:
        opt_spec (OptimizationSpec): Specification for Petri Net input optimization with respect to output
        pn_spec (PetrinautModelSpec): Specification for Petri Net execution

    Raises:
        HTTPException: _description_

    Returns:
        dict: API status and Petrinaut model name
    """
    # Build the model + optimizer. Each session is independent, so a failure here
    # only fails this request — it never wedges the service for future /init calls.
    try:
        # Build the Petri net from the client spec.
        petrinet_model = PetrinautModel(pn_spec)
        # Instantiate Petrinaut optimization class
        optimizer = PetrinautOptimizer(
            opt_spec = opt_spec,
            pn_model = petrinet_model,
        )
    except Exception as exc:
        raise HTTPException(500, f"failed to initialise optimization: {exc}")

    session_id = str(uuid.uuid4())
    app.state.sessions[session_id] = optimizer
    return {"session_id": session_id, "status": "initialised", "pn_model": petrinet_model.name, "opt_study": optimizer.study_name}


@app.get("/optimize/{session_id}/stream/all",response_class=StreamingResponse)
async def optimize_stream_all(session_id: str, request: Request, n_trials:Union[int,None]=None) -> StreamingResponse:
    """Streams optimization results per optimization step (trial) to json line

    Args:
        session_id (str): Optimization API curent session id
        request (Request): Optimization API generic request

    Raises:
        HTTPException: Unknown session id

    Returns:
        StreamingResponse: 
    """
    optimizer = app.state.sessions.get(session_id)
    if optimizer is None:
        raise HTTPException(404, "unknown session_id — call /init first")

    # Set default trials if no argument passed
    n_trials = n_trials if n_trials else optimizer.n_trials

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_all(request, n_trials=n_trials),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.get("/optimize/{session_id}/stream/best",response_class=StreamingResponse)
async def optimize_stream_best(session_id: str, request: Request, n_trials:Union[int,None]=None) -> StreamingResponse:
    """Streams current best optimization results per optimization step (trial) to json line

    Args:
        session_id (str): Optimization API curent session id
        request (Request): Optimization API generic request

    Raises:
        HTTPException: Unknown session id

    Returns:
        StreamingResponse: 
    """
    optimizer = app.state.sessions.get(session_id)
    if optimizer is None:
        raise HTTPException(404, "unknown session_id — call /init first")

    # Set default trials if no argument passed
    n_trials = n_trials if n_trials else optimizer.n_trials

    # The optimiser's SSE generator acquires/releases the session lock itself, so
    # ending the stream (completion, error, or client disconnect) never leaves the
    # session wedged.
    return StreamingResponse(
        optimizer.stream_best(request, n_trials=n_trials),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.delete("/optimize/{session_id}")
async def teardown(session_id: str):
    if app.state.sessions.pop(session_id, None) is None:
        raise HTTPException(404, "unknown session_id")
    return {"status": "deleted"}


@app.get("/status")
async def status() -> dict:
    """Lists the currently active optimization sessions."""
    return {
        "sessions": [
            {
                "session_id": session_id,
                "pn_model": optimizer.pn_model.name,
                "opt_study": optimizer.study_name,
            }
            for session_id, optimizer in app.state.sessions.items()
        ]
    }

@app.get("/")
async def root() -> dict:
    return {"message": "Welcome to Petrinaut optimization API"}
