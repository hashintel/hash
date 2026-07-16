# Petrinaut optimization

Black-box optimization of a **Petri-net execution**. A request is submitted to a
Petrinaut UNIX socket server that executes the Petri net for a set of parameters
and initial states and returns a single metric value per run.
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

This package does **not** run the Petri net itself — it drives the
[`petrinaut-cli`](../petrinaut-cli) socket server. Follow the instructions
on [there](../petrinaut-cli/README.md) first. For demo purposes the optimizer is
hard-coded to the CLI's
[`supply-chain-profit-model.json`](../../libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json)
example (see the note above), so serve that model.

## Components

| File                                                 | Role                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [petrinaut_client.py](src/petrinaut_client.py)       | `PetrinautModel` — connects to the Petrinaut CLI socket, builds each `run` request, and returns the metric. `PetrinautModelSpec` configures the execution.                                                                                                                                                                                                           |
| [petrinaut_optimizer.py](src/petrinaut_optimizer.py) | `PetrinautOptimizer` — drives the Optuna study: proposes inputs, runs the model, and streams evaluations (`stream_all` / `stream_best`) as Server-Sent Events. `OptimizationSpec` configures a run; `BOUNDS` defines the search space. **Hard-coded for demo purposes to the `supply-chain-profit-model.json` Petri net** (`BOUNDS`, `Parameters`, `InitialStates`). |
| [optimization_api.py](src/optimization_api.py)       | FastAPI service exposing `/init`, the two streaming endpoints, `/status`, and `/`.                                                                                                                                                                                                                                                                                   |

## Setup

This is a [uv](https://docs.astral.sh/uv/) project (Python ≥ 3.10.20):

```bash
uv sync
```

Imports are package-qualified (`from src...`), so run everything from the package
root using module syntax.

## Run the optimizer directly

`main()` runs a short study against the socket and logs each evaluation:

```bash
# 1. petrinaut serve --model <...> --socket /tmp/petrinaut.sock   (in another shell)
# 2. from libs/@hashintel/petrinaut-opt:
uv run python -m src.petrinaut_optimizer
```

## Run the API

```bash
uv run uvicorn src.optimization_api:app --reload
```

### 1. Initialise a run — `POST /init`

The body carries **two** objects: `opt_spec` (what to optimize) and `pn_spec`
(the Petri-net execution model). It returns a `session_id`.

```bash
curl -s -X POST localhost:8000/init -H 'content-type: application/json' -d '{
  "opt_spec": {
    "parameters": {"infection_rate": 0.5},
    "initial_states": {"Susceptible": 990},
    "n_trials": 30,
    "sampler": "tpe",
    "direction": "minimize"
  },
  "pn_spec": {
    "name": "SIR",
    "metric": "Infected Fraction",
    "steps": 100,
    "dt": 0.1,
    "seed": 1234
  }
}'
# -> {"session_id": "...", "status": "initialised", "pn_model": "SIR", "opt_study": "input_opt_..."}
```

Here `infection_rate`, and `Susceptible` are **fixed** at the given
values, and every other input in the search space (`recovery_rate`, `Recovered`, `Infected`)
is **optimized** — see [Configuring a run](#configuring-a-run).

### 2. Stream evaluations — `GET /optimize/{session_id}/stream/all`

Opens a Server-Sent Events stream: one frame per finished trial, then a final
`event: done`. Disconnecting the client stops the underlying study. Each frame
reports the inputs that were **searched** this trial (fixed inputs are constant
and omitted) plus the resulting metric.

```bash
curl -sN localhost:8000/optimize/<session_id>/stream/all
# data: {"step": 0, "params": {"recovery_rate": 3.21}, "init_states": {"Recovered": 412.7}, "metric": 0.87, "state": "COMPLETE"}
# data: {"step": 1, ...}
# event: done
# data: {}
```

`state` is the Optuna trial state (`COMPLETE`, `PRUNED`, `FAIL`); `metric` is
`null` for a pruned trial. Pass `?n_trials=<n>` to override the run's `n_trials`.

### 3. Stream the running best — `GET /optimize/{session_id}/stream/best`

Same shape, but each frame reports the **best-so-far** inputs and metric rather
than the latest trial. Frames are suppressed until at least one trial has
completed.

### Other endpoints

- `GET /status` — lists the currently active sessions (`session_id`, `pn_model`,
  `opt_study`).
- `DELETE /optimize/{session_id}` — drops a session.
- `GET /` — welcome message.

## Configuring a run

**Search space** — the universe of optimizable inputs is defined once in `BOUNDS`
at the top of [petrinaut_optimizer.py](src/petrinaut_optimizer.py). It is
hard-coded for demo purposes to the `supply-chain-profit-model.json` Petri net,
so its keys mirror that model's parameters and places:

```python
BOUNDS = {
    "parameters": {
        "production_rate":   FloatBounds(20.0, 250.0),
        "reorder_threshold": IntBounds(100, 1000),
        "batch_size":        IntBounds(50, 800),
        "selling_price":     FloatBounds(22.0, 60.0),
        "expedite_fraction": FloatBounds(0.0, 1.0),
        "marketing_spend":   FloatBounds(0.0, 100.0),
        "demand_multiplier": FloatBounds(0.5, 2.0),
    },
    "initial_state": {
        "RawInventory":   IntBounds(0, 400),
        "FinishedGoods":  IntBounds(0, 400),
        "CustomerDemand": IntBounds(0, 400),
        "SoldOrders":     IntBounds(0, 400),
        "LostSales":      IntBounds(0, 400),
    },
}
```

Changing the target Petri net means editing these `BOUNDS` and the matching
`Parameters` / `InitialStates` models in
[petrinaut_optimizer.py](src/petrinaut_optimizer.py) by hand.

**`OptimizationSpec`** ([petrinaut_optimizer.py](src/petrinaut_optimizer.py))
partitions those inputs per run:

- `parameters` / `initial_states` — any input you give a value here is **held
  fixed** at that value; any input you omit (leave `null`) is **optimized** over
  its `BOUNDS` range. Provided values must fall within `BOUNDS` (validated on
  `/init`).
- `sampler` — `tpe` or `random`.
- `direction` — `maximize` or `minimize`.
- `n_trials` — number of evaluations (overridable per stream via the `n_trials`
  query parameter).
- `study_name` — optional label for the Optuna study.

**`PetrinautModelSpec`** ([petrinaut_client.py](src/petrinaut_client.py))
configures the execution sent to the CLI:

- `name` — Petri-net class name (default `SIR`).
- `metric` — metric name computed at the end of a run and used as the objective
  (default `Infected Fraction`); must match a metric defined in the loaded model.
- `steps` — number of steps per run (sent as `maxSteps`).
- `dt` — timestep for the dynamics.
- `seed` — RNG seed (fixed → deterministic runs).
- `structure`, `outpath`, `store`, `eval_timeout` — accepted but currently unused
  (the model structure is loaded server-side via the CLI's `--model`).

## Notes

- **Failures/timeouts**: any error returned by the CLI (or other exception during
  a trial) marks that trial pruned; the study continues.
- **Streaming model**: evaluations run in a background thread and are pushed to
  the SSE client through an `asyncio.Queue`. Each optimizer instance holds a lock,
  so one session can't be driven by two concurrent streams — a second concurrent
  stream on the same session receives `event: error` (`already running`).
- **Sessions are independent**: there is no global single-run guard; multiple
  `/init` sessions can exist and run at once.
- **Leave one input free per group**: each group (`parameters`, `initial_states`)
  should leave at least one input unfixed so there is something to optimize.
  </content>
