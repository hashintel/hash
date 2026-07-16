# `@hashintel/petrinaut-cli`

Internal JSON-lines CLI for running one Petrinaut model repeatedly from scripts,
Python optimization loops, or backend jobs.

`petrinaut serve` is a long-lived process. It loads Petrinaut Core once,
compiles one model once, then accepts one simulation request per parameter set.
It supports stdin/stdout by default or an explicit Unix socket. It does not
expose HTTP or TCP.

The process reports ready only after TypeScript/HIR compilation and an engine
preflight have succeeded, including every metric advertised by `metadata`.

See [Using Petrinaut CLI from Python](./PYTHON_INTEGRATION.md) for a compact
stdio wrapper and Optuna example.

## Transports

With no transport flag, JSON lines are read from stdin and written to stdout:

```bash
petrinaut serve --model ./model.json
```

The explicit equivalent is `--stdio`. To use a Unix socket instead, pass
`--socket <path>`:

```bash
petrinaut serve --model ./model.json --socket /tmp/petrinaut.sock
```

`--stdio` and `--socket` are mutually exclusive; passing both is an error.

## Example Flow

Build first:

```bash
turbo --filter @hashintel/petrinaut-cli build
```

Start the model process with the Unix-socket transport:

```bash
yarn workspace @hashintel/petrinaut-cli serve --model ./examples/sir-model.json --socket /tmp/petrinaut.sock
```

Connect from the caller once, ask for model metadata, then send `run` requests
for each parameter set:

```python
import json
import socket

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect("/tmp/petrinaut.sock")
stream = sock.makefile("rwb")

def request(payload):
    stream.write((json.dumps(payload) + "\n").encode())
    stream.flush()
    response = json.loads(stream.readline())
    if "error" in response:
        raise RuntimeError(response["error"]["message"])
    return response["result"]

metadata = request({"id": 1, "method": "metadata"})

result = request({
    "id": 2,
    "method": "run",
    "params": {
        "parameters": {"infection_rate": 1.5, "recovery_rate": 0.8},
        "initialState": {"Susceptible": 990, "Infected": 10, "Recovered": 0},
        "metrics": ["Infected Fraction"],
        "maxSteps": 100,
        "dt": 0.1,
        "seed": 4242,
    },
})

objective = result["metrics"]["Infected Fraction"]
```

Example JSON models copied from Petrinaut Core live in `examples/`.

### Python stdio client

`examples/python_stdio.py` launches the CLI using its native JSON-lines stdio
transport. It uses only the Python standard library.

After building the CLI, run the complete SIR example:

```bash
python3 libs/@hashintel/petrinaut-cli/examples/python_stdio.py --demo
```

Or forward raw protocol requests over stdio:

```bash
printf '%s\n' \
  '{"id":1,"method":"run","params":{"parameters":{"infection_rate":1.5,"recovery_rate":0.8},"initialState":{"Susceptible":990,"Infected":10,"Recovered":0},"metrics":["Infected Fraction"],"maxSteps":100,"dt":0.1,"seed":4242}}' \
  | python3 libs/@hashintel/petrinaut-cli/examples/python_stdio.py \
      --model libs/@hashintel/petrinaut-cli/examples/sir-model.json
```

The `PetrinautClient` class can also be imported directly into an Optuna
script and reused across trials.

## JSON-lines Protocol

Send one JSON object per line and read one JSON object per line back over the
selected transport.

Request:

```json
{ "id": 1, "method": "metadata" }
```

Response:

```json
{ "id": 1, "result": { "parameters": [], "places": [], "metrics": [] } }
```

Methods:

- `healthz`: returns `{ "ok": true }`.
- `metadata`: returns parameters, places and metrics.
- `run`: runs one simulation. Pass the run config in `params`.

## Run Request

```json
{
  "id": 2,
  "method": "run",
  "params": {
    "parameters": {
      "infection_rate": 1.5,
      "recovery_rate": 0.8
    },
    "initialState": {
      "Susceptible": 990,
      "Infected": 10,
      "Recovered": 0
    },
    "metrics": ["Infected Fraction"],
    "maxSteps": 100,
    "dt": 0.1,
    "seed": 4242
  }
}
```

Run config fields:

- `parameters`: parameter values. Keys may be parameter variable name,
  parameter id, or display name. Exact ids take priority, followed by variable
  names and then display names; duplicate aliases use the model's last entry.
  Real values must be finite, integers must be integral, and booleans must be
  JSON booleans or the strings `"true"` and `"false"`.
- `initialState`: initial markings. Keys may be place id or display name.
  Exact ids take priority; duplicate display names use the model's last entry.
  Uncolored token counts must be integers from `0` through `4,294,967,295`.
- `metrics`: metric names/ids evaluated on the final frame.
- `maxSteps`: optional maximum number of simulation steps.
- `maxTime`: optional maximum simulation time. At least one of `maxSteps` or
  `maxTime` is required. The last step is shortened when necessary so a
  `maxTime` completion returns that exact `finalTime`. `dt` defaults to `1` if
  omitted.
- `seed`: optional deterministic integer seed from `0` through
  `2,147,483,647`.

Transition predicates are part of the model structure, not the run request. To
change predicate logic, edit the model; to change values used by predicate
logic, pass new `parameters`.

## Output

Metrics are evaluated only on the final frame and returned as scalar values:

```json
{
  "id": 2,
  "result": {
    "seed": 4242,
    "status": "complete",
    "completionReason": "maxSteps",
    "frameCount": 101,
    "finalTime": 10,
    "finalPlaceTokenCounts": {
      "place__susceptible": 900,
      "place__infected": 40
    },
    "metrics": {
      "Infected Fraction": 0.04
    }
  }
}
```

`metrics` may contain multiple names. Each requested metric is evaluated on the
final frame and returned as a scalar under `result.metrics`. For an optimizer
that needs one objective value, read the one metric key it requested.
Metric display names must be unique because result values are keyed by name.

`finalPlaceTokenCounts` contains the root places advertised by `metadata`.
Internal places created by subnet expansion are not part of the CLI contract.

Errors return one JSON-line response:

```json
{ "id": 2, "error": { "message": "Unknown parameter \"x\"" } }
```

The first version does not return metric distributions or full frame histories.
It is intentionally summary-first for optimization loops.
