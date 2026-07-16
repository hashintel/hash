# Driving scenario optimization from Python

This document describes the boundary Yannis's Python optimizer should use when
the HASH Optimization form drives Petrinaut CLI. The CLI evaluates simulations;
it does not own the Optuna search space or decide whether a metric is maximized
or minimized.

## Responsibility split

The Optimization form provides:

- the current Petrinaut model snapshot;
- one selected scenario;
- a complete flat value map for that scenario's parameters;
- the non-empty subset of those parameters that Optuna may change;
- one selected metric ID and `maximize` or `minimize` direction; and
- the simulation horizon, time step, seed, sampler, and trial count.

The Python service:

- starts one CLI process for the immutable model snapshot;
- creates the Optuna study with the selected direction;
- suggests values only for the selected flat parameter subset;
- overlays those suggestions on the complete scenario value map; and
- sends the merged values and selected metric ID to the CLI for every trial.

The CLI:

- validates and compiles the model once at startup;
- validates and materializes the selected scenario for every trial;
- runs the simulation; and
- returns the requested final-frame metric as a scalar.

The CLI never receives search-space bounds or optimization direction. Those are
Optuna concerns.

## Start one process per model snapshot

Start the packaged executable with model bootstrap over stdio:

```python
process = subprocess.Popen(
    ["petrinaut", "serve", "--model-stdin", "--stdio"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1,
)
```

The first stdin line must be the complete legacy model object:

```python
legacy_model = {**model["definition"], "title": model["title"]}
process.stdin.write(json.dumps(legacy_model) + "\n")
process.stdin.flush()
```

Wait for `Petrinaut stdio ready` on stderr before sending protocol requests.
Keep this process alive for all trials of the study. Start a new process if the
model changes.

This includes metrics: when the Optimization form creates a metric, that metric
must be present in `model.definition.metrics` before the bootstrap line is sent.
The running CLI process cannot acquire a metric added to a later model snapshot.

## Concrete scenario example

The bundled `supply-chain-profit-model.json` contains the Baseline scenario:

```text
scenario_baseline_supply_chain
```

Its complete default parameter snapshot is:

| Scenario parameter  | Type  | Baseline value | Example role             |
| ------------------- | ----- | -------------: | ------------------------ |
| `production_rate`   | real  |          `100` | optimize, e.g. `80..140` |
| `selling_price`     | real  |           `34` | optimize, e.g. `25..50`  |
| `marketing_spend`   | real  |           `20` | optimize, e.g. `0..50`   |
| `reorder_threshold` | real  |          `160` | fixed                    |
| `batch_size`        | real  |          `180` | fixed                    |
| `expedite_fraction` | ratio |         `0.25` | fixed                    |

The ranges above are illustrative. The Optimization form is authoritative for
which parameters are optimized and for their domains. Parameters omitted from
the search space remain fixed at the complete scenario snapshot value.

For example, if Optuna suggests:

```python
suggested = {
    "production_rate": 112.5,
    "selling_price": 38.0,
    "marketing_spend": 27.0,
}
```

Python sends all six scenario parameters, not only the three suggestions:

```python
parameter_values = {
    "production_rate": 100.0,
    "reorder_threshold": 160.0,
    "batch_size": 180.0,
    "selling_price": 34.0,
    "expedite_fraction": 0.25,
    "marketing_spend": 20.0,
    **suggested,
}
```

This makes the optimized-versus-fixed split explicit in Python while keeping
the CLI request independent of Optuna.

## Run one trial

Select the stable scenario and metric IDs. To maximize the model's Profit
metric, send this JSON line:

```json
{
  "id": 1,
  "method": "run",
  "params": {
    "scenario": {
      "id": "scenario_baseline_supply_chain",
      "parameterValues": {
        "production_rate": 112.5,
        "reorder_threshold": 160,
        "batch_size": 180,
        "selling_price": 38,
        "expedite_fraction": 0.25,
        "marketing_spend": 27
      }
    },
    "metrics": ["metric_profit"],
    "maxTime": 100,
    "dt": 0.1,
    "seed": 42
  }
}
```

The response uses the same metric selector as its key:

```json
{
  "id": 1,
  "result": {
    "status": "complete",
    "metrics": { "metric_profit": 1234.5 }
  }
}
```

Read `result.metrics.metric_profit` and return it from the Optuna objective.
The actual result also contains completion, timing, seed, and final-marking
summary fields.

## Maximize or minimize

Direction belongs in study creation, not the CLI request:

```python
study = optuna.create_study(direction="maximize")
```

Use `maximize` for `metric_profit`. The example model also contains the
loss-style `metric_negative_profit`; use `minimize` when that metric is selected:

```python
study = optuna.create_study(direction="minimize")
```

The selected metric ID and direction must come from the same Optimization form
submission so Python cannot accidentally optimize one metric using another
metric's direction.

## Optuna objective shape

```python
scenario_values = {
    "production_rate": 100.0,
    "reorder_threshold": 160.0,
    "batch_size": 180.0,
    "selling_price": 34.0,
    "expedite_fraction": 0.25,
    "marketing_spend": 20.0,
}

def objective(trial):
    suggested = {
        "production_rate": trial.suggest_float("production_rate", 80, 140),
        "selling_price": trial.suggest_float("selling_price", 25, 50),
        "marketing_spend": trial.suggest_float("marketing_spend", 0, 50),
    }
    result = cli_request(
        method="run",
        params={
            "scenario": {
                "id": "scenario_baseline_supply_chain",
                "parameterValues": {**scenario_values, **suggested},
            },
            "metrics": ["metric_profit"],
            "maxTime": 100,
            "dt": 0.1,
            "seed": 42,
        },
    )
    return result["metrics"]["metric_profit"]
```

One CLI process handles requests serially. Use `n_jobs=1` for one process, or
create one independently bootstrapped CLI process per parallel Optuna worker.

## Validation rules to mirror in Python

- Require a scenario before optimization starts.
- Keep the search space flat: identifiers must reference scenario parameters.
- Send a complete value map for the selected scenario on every trial.
- Use numbers for real/ratio parameters, integers for integer parameters, and
  JSON booleans for boolean parameters.
- Keep ratio values and ranges inside `[0, 1]`.
- Request the metric by stable ID and expect the result under that same ID.
- Treat a CLI error response as a failed trial; treat malformed output, timeout,
  or process exit as a broken CLI transport.
- Close the CLI process when the study completes or its caller disconnects.
