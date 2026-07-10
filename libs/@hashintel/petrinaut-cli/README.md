# `@hashintel/petrinaut-cli`

Internal Unix-socket CLI for running one Petrinaut model repeatedly from
scripts, Python optimization loops, or backend jobs.

`petrinaut serve` is a long-lived process. It loads Petrinaut Core once,
compiles one model once, then accepts one simulation request per parameter set.
It does not expose HTTP or TCP.

## Example Flow

Build first:

```bash
turbo --filter @hashintel/petrinaut-cli build
```

Start the model process:

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

## Socket Protocol

Send one JSON object per line to the socket. Read one JSON object per line back.

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
  parameter id, or display name.
- `initialState`: initial markings. Keys may be place id or display name.
- `metrics`: metric names/ids evaluated on the final frame.
- `maxSteps`: number of simulation steps. `dt` defaults to `1` if omitted.
- `seed`: optional random seed.

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

Errors return one JSON-line response:

```json
{ "id": 2, "error": { "message": "Unknown parameter \"x\"" } }
```

The first version does not return metric distributions or full frame histories.
It is intentionally summary-first for optimization loops.
