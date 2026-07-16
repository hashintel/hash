# Petrinaut optimization

This service optimizes the flat parameters of one selected Petrinaut scenario.
It uses Optuna to propose values, reuses one compiled Petrinaut CLI process for
all trials, and streams progress as newline-delimited JSON (NDJSON).

The HASH Node API is the authenticated public boundary. This Python service is
an internal container service: callers cannot select an executable, filesystem
path, arbitrary model field, or initial-place value.

## API

### `POST /optimize`

The request contains an immutable model and scenario snapshot:

```json
{
  "name": "Find the best rate",
  "model": {
    "title": "Example",
    "definition": {
      "places": [],
      "transitions": [],
      "types": [],
      "differentialEquations": [],
      "parameters": [],
      "subnets": [],
      "componentInstances": [],
      "scenarios": [
        {
          "id": "baseline",
          "name": "Baseline",
          "scenarioParameters": [
            { "identifier": "rate", "type": "real", "default": 0.5 },
            { "identifier": "enabled", "type": "boolean", "default": 1 }
          ],
          "parameterOverrides": {},
          "initialState": { "type": "per_place", "content": {} }
        }
      ],
      "metrics": [{ "id": "profit", "name": "Profit", "code": "return 1;" }]
    }
  },
  "scenario": {
    "id": "baseline",
    "parameterValues": { "rate": 0.5, "enabled": true }
  },
  "searchSpace": {
    "version": 1,
    "variables": [
      {
        "identifier": "rate",
        "domain": {
          "kind": "continuous",
          "minimum": 0.1,
          "maximum": 2,
          "scale": "linear"
        }
      }
    ]
  },
  "objective": { "metricId": "profit", "direction": "maximize" },
  "execution": { "seed": 42, "dt": 0.1, "maxTime": 100 },
  "optimization": { "trials": 20, "sampler": "tpe" }
}
```

`scenario.parameterValues` is the complete, flat snapshot for the selected
scenario. `searchSpace.variables` is the non-empty subset Optuna may replace.
The supported domains are:

- `continuous`: `minimum`, `maximum`, and `scale` (`linear` or `log`)
- `integer`: `minimum`, `maximum`, and a positive `step` that divides the range
  exactly, so the maximum is reachable
- `categorical`: at least two unique numeric or boolean `values`

Real and ratio parameters use continuous domains, integer parameters use
integer domains, and boolean parameters use exactly `[false, true]`. Ratio
ranges must remain inside `[0, 1]`. The objective is one saved model metric,
selected by ID, with an explicit maximize/minimize direction.

To bound work accepted by one request, the service allows at most 1,000 trials,
100,000 simulation steps per trial (`ceil(maxTime / dt)`), and 5,000,000
aggregate simulation steps across the study. A process accepts at most four
simultaneous studies, rejects request bodies larger than 8 MiB, limits each CLI
trial to four minutes, and stops a study after 14 minutes.

The response content type is `application/x-ndjson`. Each line is one typed
event, in order:

```json
{"type":"started","requestedTrials":20}
{"type":"trial","trial":0,"parameters":{"rate":1.2},"objective":14.5,"state":"complete","best":{"trial":0,"parameters":{"rate":1.2},"objective":14.5}}
{"type":"complete","requestedTrials":20,"completedTrials":20,"prunedTrials":0,"failedTrials":0,"best":{"trial":7,"parameters":{"rate":1.6},"objective":18.1}}
```

A trial may instead be `pruned` or `failed`, with a `null` objective. A
well-formed CLI error response for one scenario run, or a non-finite metric
produced for one proposed value, is recoverable: Optuna marks that trial as
`failed`, emits its trial event, and continues with the remaining requested
trials. Failed trials are not retried, and a study in which every trial fails
still ends with a `complete` event whose `best` is `null`.

CLI startup errors are terminal `petrinaut_start_failed` events. A process,
pipe, or timeout failure during a study is terminal
`petrinaut_transport_failed`; an invalid CLI response is terminal
`petrinaut_protocol_failed`. Other unexpected study failures use
`optimization_failed`. Terminal failures stop the study immediately and are
emitted as `{ "type": "error", "code", "message", "retryable" }` instead of a
`complete` event. Disconnecting the client stops the study and closes its CLI
process; optimization runs do not survive client disconnection.

### `GET /status`

Returns process-level status for infrastructure health checks.

## CLI transport

For each request the service starts:

```text
petrinaut serve --model-stdin --stdio
```

It writes the legacy Petrinaut file shape (`{ ...definition, title }`) as the
first stdin line. Once the CLI reports ready on stderr, every Optuna trial sends
a JSON-lines `run` request containing the selected scenario ID, the complete
merged flat parameter values, the objective metric ID, and simulation settings.
Scenario expressions and initial states are compiled authoritatively by the
CLI. No model tempfile or socket is required.

The child process receives a minimal environment rather than the Python
service environment, so application credentials are not inherited. The Docker
image also enables Node's permission model without filesystem writes, child
processes, workers, native add-ons, or WASI. Protocol lines and startup/trial
times are bounded, stderr is continuously drained, and shutdown terminates the
entire CLI process group.

## Security boundary

Petrinaut scenarios contain user-authored JavaScript. The CLI subprocess and
Node permission flags are defense-in-depth; they are not a sandbox for hostile
code, and Node's permission model does not restrict network access. Production
deployment must provide the actual isolation boundary:

- run this image as a separate service rather than a Node API sidecar;
- provide no secrets, cloud task role, or other ambient credentials;
- deny outbound traffic, including cloud metadata and internal services;
- allow inbound traffic only from the HASH Node API;
- use a read-only root filesystem, drop all capabilities, and enable
  `no-new-privileges`;
- set CPU, memory, and PID/thread limits and use an init/reaper.

If those controls are unavailable, expose optimization only to explicitly
trusted internal users. The image itself runs as a non-root user and needs no
writable mount or `/tmp` tmpfs for stdio.

## Development

From `apps/petrinaut-opt`:

```bash
uv sync
uv run pytest
uv run uvicorn src.optimization_api:app --reload
```

Generate the checked-in OpenAPI document with:

```bash
uv run python -m scripts.generate_openapi
```

`HASH_PETRINAUT_OPT_HOST` and `HASH_PETRINAUT_OPT_PORT` are used by `uv run
python -m src.optimization_api`, defaulting to `127.0.0.1:4004` for local
development. Uvicorn CLI deployments should use `UVICORN_HOST` and
`UVICORN_PORT` (the Docker image sets these to `0.0.0.0:4004`).

Build and run the production image from the repository root:

```bash
docker build --file apps/petrinaut-opt/docker/Dockerfile --tag petrinaut-opt:local .
docker run --rm --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges --pids-limit=128 --memory=4g --cpus=2 \
  --publish 127.0.0.1:4004:4004 petrinaut-opt:local
```

The healthcheck uses Python's standard library, so the image does not need
curl, wget, or a healthcheck sidecar.
