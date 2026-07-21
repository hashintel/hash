# Using Petrinaut CLI from Python

This page covers the generic `--model` and `run` protocol. For the
manifest-driven flow where the CLI describes the search space and evaluates
Optuna suggestions, see
[Running an optimization manifest](./OPTIMIZATION_INTEGRATION.md).

Petrinaut CLI is a long-lived Node.js process. Start it once for one model,
then reuse it for every Optuna trial. The model and its TypeScript/HIR code are
compiled, type-checked, and engine-preflighted before the CLI becomes ready.
Every advertised metric must also compile; every `run` gets fresh simulation
state.

See [Petrinaut CLI model examples](./MODEL_EXAMPLES.md) for complete requests
using parameters, uncolored tokens, and several colored token schemas.

## Build

From the HASH repository root:

```bash
turbo --filter @hashintel/petrinaut-cli build
```

The executable is then available at:

```text
libs/@hashintel/petrinaut-cli/dist/cli.js
```

## Python wrapper

The CLI uses JSON Lines over stdin/stdout. Send one JSON object per line and
read one response per line. Keep stdout for protocol messages; CLI lifecycle
messages are written to stderr.

```python
import json
import subprocess


class PetrinautClient:
    def __init__(self, cli_path: str, model_path: str):
        self.process = subprocess.Popen(
            ["node", cli_path, "serve", "--model", model_path, "--stdio"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.next_id = 1

    def request(self, method: str, params=None):
        request = {"id": self.next_id, "method": method}
        self.next_id += 1
        if params is not None:
            request["params"] = params

        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()

        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(self.process.stderr.read() or "Petrinaut exited")

        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(response["error"]["message"])
        return response["result"]

    def metadata(self):
        return self.request("metadata")

    def run(self, **params):
        return self.request("run", params)

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=5)
```

Start one client and reuse it:

```python
client = PetrinautClient(
    cli_path="libs/@hashintel/petrinaut-cli/dist/cli.js",
    model_path="libs/@hashintel/petrinaut-cli/examples/sir-model.json",
)

metadata = client.metadata()

result = client.run(
    parameters={"infection_rate": 1.5, "recovery_rate": 0.8},
    initialState={"Susceptible": 990, "Infected": 10, "Recovered": 0},
    metrics=["Infected Fraction"],
    maxSteps=100,
    dt=0.1,
    seed=4242,
)

objective_value = result["metrics"]["Infected Fraction"]
client.close()
```

## Optuna usage

The client must be created outside the objective so Node and the model are not
restarted for every trial:

```python
import optuna

client = PetrinautClient(CLI_PATH, MODEL_PATH)

def objective(trial):
    result = client.run(
        parameters={
            "infection_rate": trial.suggest_float("infection_rate", 0.1, 2.0),
            "recovery_rate": trial.suggest_float("recovery_rate", 0.1, 1.0),
        },
        initialState={"Susceptible": 990, "Infected": 10, "Recovered": 0},
        metrics=["Infected Fraction"],
        maxSteps=100,
        dt=0.1,
        seed=4242,
    )
    return result["metrics"]["Infected Fraction"]

study = optuna.create_study(direction="minimize")
study.optimize(objective, n_trials=100, n_jobs=1)
client.close()
```

One CLI process executes requests serially, so use `n_jobs=1` with one client.
For parallel trials, create one client/process per Optuna worker.

## Inputs and outputs

- `parameters`: keys may be parameter variable names, IDs, or display names.
  Exact IDs take priority, then variable names, then display names; duplicate
  aliases use the model's last entry.
- `initialState`: keys may be place IDs or display names. Exact IDs take
  priority; duplicate display names use the model's last entry.
- Uncolored places accept an integer token count from `0` through
  `4,294,967,295`, for example `"Infected": 10`.
- Colored places accept one object per token. Different places may use
  different color schemas:

  ```python
  initialState={
      "InboundShipments": [
          {"eta": 1, "risk_score": 0.2, "source": 1, "cost": 10},
          {"eta": 2, "risk_score": 0.4, "source": 2, "cost": 12},
      ],
      "MachineUp": [
          {"health": 0.9, "wear": 0.1},
      ],
  }
  ```

- `metrics`: model metric names or IDs. Multiple metrics may be requested;
  metric display names must be unique because results are keyed by name.
- `maxSteps` or `maxTime`: simulation stopping condition. When `maxTime` stops
  the run, the last step is shortened so `finalTime` equals it exactly.
- `dt`: simulation time step; defaults to `1`.
- `seed`: optional deterministic integer seed from `0` through
  `2,147,483,647`.

Metrics are evaluated on the final frame. The response also includes the seed,
completion reason, final time, frame count, and final token count for each root
place advertised by `metadata`. Internal subnet places are not returned. Use
`metadata` first to discover the model's parameters, places, colors, and
available metrics.

A runnable version of the wrapper is available in
[`examples/python_stdio.py`](./examples/python_stdio.py).
