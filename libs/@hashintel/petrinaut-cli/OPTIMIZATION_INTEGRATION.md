# Running an optimization manifest

Petrinaut CLI owns the Petrinaut side of optimization: it validates the
manifest, applies fixed and suggested scenario parameters, materializes the
initial state, runs the model, and returns one scalar objective. An optimizer
such as Optuna only needs to consume the flat parameter description and submit
one suggestion per trial.

An optimization manifest is a versioned JSON document containing a complete
model snapshot with **one scenario** and **one metric**. Its
`scenario.parameterBindings` lists every scenario parameter once as either
`fixed` or `optimize`. Bounds, integer steps, and numeric scales belong to the
manifest and are therefore transient to that optimization run.

## Raw CLI

Start one long-lived CLI process for a study, passing the manifest file:

```sh
petrinaut serve --optimization ./optimization.json --stdio
```

`--optimization` is available only with `--stdio`. For a read-only container,
send the manifest as the first JSON line instead:

```sh
petrinaut serve --optimization-stdin --stdio
```

After the manifest has been loaded, stdin and stdout are JSON Lines. The CLI
writes diagnostics (including its ready message) to stderr. Keep the process
alive and send one request per line; it handles requests serially.

### Supply-chain example

The checked-in example defines a reproducible supply-chain profit study:

```sh
node libs/@hashintel/petrinaut-cli/dist/cli.js serve \
  --optimization libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-optimization.json \
  --stdio
```

It maximizes `Profit` with TPE over 1,000 trials. Optuna varies
`production_rate`, `reorder_threshold`, `batch_size`, `selling_price`,
`expedite_fraction`, and `marketing_spend`; the manifest fixes
`demand_multiplier`. Its seven scenario parameters override the corresponding
seven net parameters before every trial.

### Read the search space

Send:

```json
{ "id": 1, "method": "optimization.describe" }
```

The response contains the optimization direction, study configuration, and
only the non-fixed parameters:

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
        "step": 1,
        "scale": "linear"
      },
      { "identifier": "enabled", "type": "boolean", "default": true }
    ]
  }
}
```

The parameter types map as follows:

| CLI type  | Domain                                                    | Optuna suggestion                    |
| --------- | --------------------------------------------------------- | ------------------------------------ |
| `float`   | `minimum`, `maximum`, `scale` (`linear` or `log`)         | `suggest_float`                      |
| `int`     | `minimum`, `maximum`, `step`, `scale` (`linear` or `log`) | `suggest_int`                        |
| `boolean` | no numeric bounds                                         | `suggest_categorical([False, True])` |

Optuna requires a logarithmic integer domain to use `step: 1`.

`default` is the scenario's default value. It is informative; the optimizer
chooses the trial value. Fixed parameters are deliberately omitted from this
response.

### Run one trial

Send every and only parameter returned by `optimization.describe`:

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

The CLI validates those values against the manifest, injects the fixed values,
and returns the objective value:

```json
{ "id": 2, "result": { "objective": 1234.5 } }
```

Use one CLI process with a single Optuna worker, or start an independent CLI
process for each parallel worker.

## Python wrapper with Optuna

This minimal wrapper starts the CLI with a manifest file and implements the
JSON Lines request/response protocol:

```python
import json
import subprocess


class PetrinautOptimization:
    def __init__(self, manifest_path: str):
        self.process = subprocess.Popen(
            [
                "petrinaut",
                "serve",
                "--optimization",
                manifest_path,
                "--stdio",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.request_id = 0

    def request(self, method: str, params: dict | None = None) -> dict:
        self.request_id += 1
        request = {"id": self.request_id, "method": method}
        if params is not None:
            request["params"] = params

        assert self.process.stdin and self.process.stdout
        self.process.stdin.write(json.dumps(request) + "\\n")
        self.process.stdin.flush()
        response = json.loads(self.process.stdout.readline())
        if "error" in response:
            raise RuntimeError(response["error"]["message"])
        return response["result"]

    def close(self) -> None:
        self.process.terminate()
        self.process.wait()
```

Read the CLI description once, then map each returned parameter directly to an
Optuna suggestion. Pass the resulting flat dictionary unchanged to
`optimization.evaluate`:

```python
import optuna


def suggest_parameter(trial: optuna.Trial, parameter: dict):
    name = parameter["identifier"]
    match parameter["type"]:
        case "float":
            return trial.suggest_float(
                name,
                parameter["minimum"],
                parameter["maximum"],
                log=parameter["scale"] == "log",
            )
        case "int":
            return trial.suggest_int(
                name,
                parameter["minimum"],
                parameter["maximum"],
                step=parameter["step"],
                log=parameter["scale"] == "log",
            )
        case "boolean":
            return trial.suggest_categorical(name, [False, True])
        case _:
            raise ValueError(f"Unsupported parameter type: {parameter['type']}")


optimizer = PetrinautOptimization("./optimization.json")
description = optimizer.request("optimization.describe")

sampler = (
    optuna.samplers.TPESampler(seed=description["study"]["seed"])
    if description["study"]["sampler"] == "tpe"
    else optuna.samplers.RandomSampler(seed=description["study"]["seed"])
)
study = optuna.create_study(
    direction=description["direction"],
    sampler=sampler,
)


def objective(trial: optuna.Trial) -> float:
    values = {
        parameter["identifier"]: suggest_parameter(trial, parameter)
        for parameter in description["parameters"]
    }
    result = optimizer.request(
        "optimization.evaluate",
        {"parameterValues": values},
    )
    return result["objective"]


try:
    study.optimize(objective, n_trials=description["study"]["trials"])
finally:
    optimizer.close()
```

The wrapper never reads Petrinaut types, compiles a scenario, or supplies fixed
values. Those remain part of the manifest and CLI contract.
