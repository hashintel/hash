# Driving scenario optimization from Python

Petrinaut CLI owns the Petrinaut-specific part of an optimization: validating
the selected scenario and metric, materializing fixed and suggested scenario
parameters, running a trial, and returning its scalar objective. Python only
needs to translate the CLI's flat parameter description into Optuna calls.

## Start the CLI

An optimization manifest is an immutable, versioned JSON document containing a
complete model snapshot with exactly one scenario and exactly one metric. Start
one CLI process per study:

```sh
petrinaut serve --optimization optimize.json --stdio
```

For containers with a read-only filesystem, bootstrap the same manifest as the
first JSON line on stdin:

```sh
petrinaut serve --optimization-stdin --stdio
```

Keep the process alive for all trials. Subsequent stdin lines and all stdout
lines use the request/response JSON-lines protocol. Diagnostics and the ready
message are written to stderr.

## Manifest

```json
{
  "kind": "petrinaut-optimization",
  "version": 1,
  "name": "Maximize profit",
  "model": {
    "title": "Supply chain",
    "definition": {
      "places": [],
      "transitions": [],
      "types": [],
      "differentialEquations": [],
      "parameters": [],
      "subnets": [],
      "componentInstances": [],
      "scenarios": ["exactly one complete scenario object"],
      "metrics": ["exactly one saved or transient metric object"]
    }
  },
  "scenario": {
    "id": "scenario_baseline",
    "parameterBindings": {
      "production_rate": {
        "kind": "optimize",
        "domain": {
          "kind": "continuous",
          "minimum": 80,
          "maximum": 140,
          "scale": "linear"
        }
      },
      "batch_size": { "kind": "fixed", "value": 180 },
      "worker_count": {
        "kind": "optimize",
        "domain": {
          "kind": "integer",
          "minimum": 1,
          "maximum": 20,
          "step": 1
        }
      },
      "enabled": {
        "kind": "optimize",
        "domain": { "kind": "boolean" }
      }
    }
  },
  "objective": { "metricId": "metric_profit", "direction": "maximize" },
  "execution": { "seed": 42, "dt": 0.1, "maxTime": 100 },
  "study": { "trials": 100, "sampler": "tpe" }
}
```

`parameterBindings` must contain every scenario parameter exactly once. Bounds,
integer steps, and float scales are transient study configuration; the
scenario parameter's type and default continue to come from the embedded model.
Ratio domains must stay inside `[0, 1]`.

The metric may be copied from the saved model or created inline by the
Optimization form. In both cases it is simply the manifest snapshot's sole
metric; the CLI does not persist it.

## Describe the Optuna study

Request:

```json
{ "id": 1, "method": "optimization.describe" }
```

Response:

```json
{
  "id": 1,
  "result": {
    "direction": "maximize",
    "study": { "trials": 100, "sampler": "tpe", "seed": 42 },
    "parameters": [
      {
        "identifier": "production_rate",
        "type": "float",
        "default": 100,
        "minimum": 80,
        "maximum": 140,
        "scale": "linear"
      },
      {
        "identifier": "worker_count",
        "type": "int",
        "default": 5,
        "minimum": 1,
        "maximum": 20,
        "step": 1
      },
      { "identifier": "enabled", "type": "boolean", "default": true }
    ]
  }
}
```

Only optimized parameters are returned. Python can map `float` to
`trial.suggest_float` (`scale: "log"` means `log=True`), `int` to
`trial.suggest_int`, and `boolean` to `trial.suggest_categorical([false, true])`.
The described seed is the manifest execution seed; use it for the Optuna
sampler as well as the deterministic Petrinaut trials.

## Evaluate one trial

Send values for every and only the parameters returned by
`optimization.describe`:

```json
{
  "id": 2,
  "method": "optimization.evaluate",
  "params": {
    "parameterValues": {
      "production_rate": 112.5,
      "worker_count": 8,
      "enabled": true
    }
  }
}
```

The CLI validates the suggestions against their domains, injects fixed values,
compiles the scenario into the trial's initial state and net parameters, runs
the sole metric, and returns only its scalar value:

```json
{ "id": 2, "result": { "objective": 1234.5 } }
```

One process handles requests serially. Use one process with `n_jobs=1`, or an
independently bootstrapped CLI process per parallel worker.

## Minimal Optuna loop

```python
description = cli_request("optimization.describe")
study = optuna.create_study(
    direction=description["direction"],
    sampler=create_sampler(
        description["study"]["sampler"],
        seed=description["study"]["seed"],
    ),
)

def objective(trial):
    values = {}
    for parameter in description["parameters"]:
        name = parameter["identifier"]
        if parameter["type"] == "float":
            values[name] = trial.suggest_float(
                name,
                parameter["minimum"],
                parameter["maximum"],
                log=parameter["scale"] == "log",
            )
        elif parameter["type"] == "int":
            values[name] = trial.suggest_int(
                name,
                parameter["minimum"],
                parameter["maximum"],
                step=parameter["step"],
            )
        else:
            values[name] = trial.suggest_categorical(name, [False, True])

    return cli_request(
        "optimization.evaluate", {"parameterValues": values}
    )["objective"]

study.optimize(objective, n_trials=description["study"]["trials"])
```
