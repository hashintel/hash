# Petrinaut optimization

Black-box optimization of a **Petri-net execution**. For each candidate the
optimizer runs the Petri net — via the bundled
[`petrinaut-cli`](../../libs/@hashintel/petrinaut-cli), which it spawns as a
subprocess and drives over stdio — for a set of parameters and initial states,
and reads back a single metric value per run.
[Optuna](https://optuna.org/) searches the input space to maximise (or minimise)
that metric. Results stream out one evaluation at a time over Server-Sent Events,
so a UI can watch the optimization live.

The search space is **continuous and discrete**, and evaluations are treated as
expensive, so a sample-efficient sampler (TPE by default) is used.

> [!IMPORTANT]
> **Demo model is hard-coded.** For demo purposes,
> [petrinaut_optimizer.py](src/petrinaut_optimizer.py) is hard-coded to the
> [`supply-chain-profit-model.json`](../../libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json)
> Petri net. Its search space (`BOUNDS`) and the `Parameters` / `InitialStates`
> shapes are all specific to that model — serve that same model from the CLI, or
> the optimizer's inputs will not line up with the Petri net. Switching models
> means editing these definitions in `petrinaut_optimizer.py` by hand.

## How it connects to Petrinaut

This package does **not** execute the Petri net itself — it launches the
[`petrinaut-cli`](../../libs/@hashintel/petrinaut-cli) as a subprocess
(`serve --stdio`) and exchanges JSON-RPC lines with it. You must **build the CLI
first** so its `dist/cli.js` exists — follow
[its README](../../libs/@hashintel/petrinaut-cli/README.md). For demo purposes
the optimizer is hard-coded to the CLI's
[`supply-chain-profit-model.json`](../../libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json)
example (see the note above).

## Components

| File                                                 | Role                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [petrinaut_client.py](src/petrinaut_client.py)       | `PetrinautModel` — spawns the Petrinaut CLI subprocess (stdio), builds each `run` request, and returns the metric. `PetrinautModelSpec` configures the execution.                                                                                                                                                                                                    |
| [petrinaut_optimizer.py](src/petrinaut_optimizer.py) | `PetrinautOptimizer` — drives the Optuna study: proposes inputs, runs the model, and streams evaluations (`stream_all` / `stream_best`) as Server-Sent Events. `OptimizationSpec` configures a run; `BOUNDS` defines the search space. **Hard-coded for demo purposes to the `supply-chain-profit-model.json` Petri net** (`BOUNDS`, `Parameters`, `InitialStates`). |
| [optimization_api.py](src/optimization_api.py)       | FastAPI service exposing the two streaming endpoints (`/optimize/all`, `/optimize/best`), `/status`, and `/`.                                                                                                                                                                                                                                                        |

## Setup

This is a [uv](https://docs.astral.sh/uv/) project (Python ≥ 3.10.20):

```bash
uv sync
```

Imports are package-qualified (`from src...`), so run everything from the package
root using module syntax.

## Run the optimizer directly

`main()` runs a study end-to-end and logs each evaluation. It spawns the CLI
itself, so you only need `petrinaut-cli` built (`dist/cli.js` present):

```bash
# from apps/petrinaut-opt:
uv run python -m src.petrinaut_optimizer
```

## Run the API

The service binds to `HASH_PETRINAUT_OPT_HOST` and `HASH_PETRINAUT_OPT_PORT`,
loaded from the module's `.env` (defaults `localhost:4004`):

```bash
uv run python -m src.optimization_api
```

For autoreload during development, run uvicorn directly (this bypasses the
`.env` host/port — pass `--host`/`--port` to override uvicorn's defaults):

```bash
uv run uvicorn src.optimization_api:app --reload
```

### Request body (both `/optimize/*` endpoints)

Both streaming endpoints take the same JSON body carrying **two** objects:
`opt_spec` (what to optimize) and `pn_spec` (the Petri-net execution model). The
stream starts immediately. Each response includes an `X-Optimization-Run-ID`
header which identifies the run for status queries.

### Stream every evaluation — `GET /optimize/all`

Opens a Server-Sent Events stream: one frame per finished trial, then a final
`event: done`. Disconnecting the client stops the underlying study. Each frame
reports the inputs that were **searched** this trial (fixed inputs are constant
and omitted) plus the resulting metric.

```bash
curl -N -X GET "http://localhost:4004/optimize/all" \
  -H "Content-Type: application/json" \
  -d '{
  "opt_spec": {
    "parameters": {
      "demand_multiplier":1.0
    },
    "initial_state": {
      "RawInventory": 220,
      "FinishedGoods": 120,
      "CustomerDemand": 0,
      "SoldOrders": 0,
      "LostSales": 0
    },
    "study_name": "param_opt",
    "direction": "maximize",
    "n_trials": 500
  },
  "pn_spec": {
    "model_path": "/Users/yz/code/hash/libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json",
    "cli_path": "/Users/yz/code/hash/libs/@hashintel/petrinaut-cli/dist/cli.js",
    "metric": "Profit",
    "dt":0.1,
    "steps": 365,
    "seed": 1234
  }
}'

# data: {"step": 0, "params": {"production_rate": 137.2, ...}, "init_state": {"FinishedGoods": 88, ...}, "metric": 12530.4, "state": "COMPLETE"}
# data: {"step": 1, ...}
# event: done
# data: {}
```

Here `demand_multiplier`, `RawInventory`, `FinishedGoods`, `CustomerDemand`, `SoldOrders`, `LostSales` are **fixed** at the given values, and
every other input in the search space is **optimized** — see
[Configuring a run](#configuring-a-run). `state` is the Optuna trial state
(`COMPLETE`, `PRUNED`, `FAIL`); `metric` is `null` for a pruned trial.

### Stream the running best — `GET /optimize/best`

Same request body and frame shape, but each frame reports the **best-so-far**
inputs and metric rather than the latest trial. Frames are suppressed until at
least one trial has completed.

### Other endpoints

- `GET /status` — a snapshot of all run statuses (`run_id`, `phase`, `detail`,
  `updated_at`).
- `GET /status/{run_id}` — the status of the run identified by the streaming
  response's `X-Optimization-Run-ID` header.
- `GET /` — welcome message.

## Configuring a run

**Search space** — the universe of optimizable inputs is defined once in `BOUNDS`
at the top of [petrinaut_optimizer.py](src/petrinaut_optimizer.py). It is
hard-coded for demo purposes to the `supply-chain-profit-model.json` Petri net,
so its keys mirror that model's parameters and places:

```python
BOUNDS = {
    "parameters": {
        "production_rate": FloatBounds(20.0, 250.0, log=True),
        "reorder_threshold": IntBounds(100, 1000, log=True),
        "batch_size": IntBounds(50, 800, log=True),
        "selling_price": FloatBounds(22.0, 60.0, log=True),
        "expedite_fraction": FloatBounds(0.0, 1.0),
        "marketing_spend": FloatBounds(0.01, 100.0, log=True),
        "demand_multiplier": FloatBounds(0.5, 2.0)
    },
    "initial_state": {
        "RawInventory": IntBounds(0, 400),
        "FinishedGoods": IntBounds(0, 400),
        "CustomerDemand": IntBounds(0, 400),
        "SoldOrders": IntBounds(0, 400),
        "LostSales": IntBounds(0, 400)
    }
}

```

Changing the target Petri net means editing these `BOUNDS` and the matching
`Parameters` / `InitialStates` models in
[petrinaut_optimizer.py](src/petrinaut_optimizer.py) by hand.

**`OptimizationSpec`** ([petrinaut_optimizer.py](src/petrinaut_optimizer.py))
partitions those inputs per run:

- `parameters` / `initial_state` — any input you give a value here is **held
  fixed** at that value; any input you omit (leave `null`) is **optimized** over
  its `BOUNDS` range. Provided values must fall within `BOUNDS` (validated when
  the request is received).
- `sampler` — `tpe` or `random`.
- `direction` — `maximize` or `minimize`.
- `n_trials` — number of evaluations (default `100`).
- `study_name` — optional label for the Optuna study (default `opt_study`).

**`PetrinautModelSpec`** ([petrinaut_client.py](src/petrinaut_client.py))
configures the execution sent to the CLI:

- `model_path` — path to the Petri-net JSON model (defaults to the CLI's
  `supply-chain-profit-model.json`).
- `cli_path` — path to the CLI bundle (defaults to `petrinaut-cli/dist/cli.js`).
- `metric` — metric name computed at the end of a run and used as the objective
  (default `Profit`); must match a metric defined in the loaded model.
- `steps` — number of steps per run (sent as `maxSteps`; default `100`).
- `dt` — timestep for the dynamics (default `0.1`).
- `seed` — RNG seed (default `1234`; fixed → deterministic runs and optimisation steps).
- `eval_timeout` - per-trial CLI execution timeout in seconds; a trial that exceeds it is pruned so a hung run can't block the optimization (default `None`; no timeout).
- `store`, `outpath`, `command` — accepted but currently unused.

## Notes

- **Failures/timeouts**: any error returned by the CLI (or other exception during
  a trial) marks that trial pruned; after a timeout the CLI process is restarted
  before the study continues with the next trial.
- **Streaming model**: evaluations run in a background thread and are pushed to
  the SSE client through an `asyncio.Queue`. Each optimizer instance holds a lock,
  so it can't be driven by two concurrent streams — a second stream on the same
  instance receives `event: error` (`already running`).
- **No shared state**: each request builds its own model, CLI subprocess, and
  Optuna study and is fully independent; there is no session registry or global
  run guard.
- **Leave one input free per group**: each group (`parameters`, `initial_state`)
  should leave at least one input unfixed so there is something to optimize.
  </content>
