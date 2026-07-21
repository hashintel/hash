# Petrinaut optimization

This service uses Optuna to optimize the flat, non-fixed parameters of one
Petrinaut scenario. It keeps Yannis's Server-Sent Events API and study
lifecycle, while delegating all Petrinaut-specific interpretation to
`petrinaut-cli`.

The Python service treats the optimization manifest as opaque JSON. It does not
read Petrinaut models, scenario bindings, metrics, or the Petrinaut type system.

## API

Both optimization endpoints accept the complete optimization manifest as their
JSON request body. The manifest is produced by the Petrinaut UI/Node API and is
forwarded unchanged to the CLI.

- `POST /optimize/all` streams every finished trial.
- `POST /optimize/best` streams the best-so-far result after each finished
  trial. No data frame is emitted until at least one trial completes.

The response is `text/event-stream`. Existing frame bodies are preserved:

```text
data: {"step": 0, "params": {"rate": 1.2}, "init_state": {}, "metric": 14.5, "state": "COMPLETE"}

event: done
data: {}

```

`params` contains the flat values proposed by Optuna. Fixed parameter values
remain the CLI's responsibility and are not echoed by Python. `init_state` is
retained as an empty object for response compatibility. Failed evaluations are
reported with Optuna's existing state and a null metric. Study failures retain
the existing error data frame and terminate the stream without a subsequent
`done` frame. A second stream on the same optimizer retains the existing
`event: error` frame.

While waiting for a trial, the service sends an SSE comment heartbeat roughly
every 30 seconds:

```text
: heartbeat

```

SSE clients ignore comment frames, while load balancers and proxies see traffic
before their idle timeout.

Streams are not resumable: they do not emit event IDs or replay missed trials.
If the caller disconnects, the service stops that study and releases its CLI;
the caller must submit a new optimization request rather than reconnect with
`Last-Event-ID`.

Each response has an `X-Optimization-Run-ID` header for status queries:

- `GET /status` returns every run status.
- `GET /status/{run_id}` returns one run status.
- `GET /` returns a welcome message.

The process admits at most four active optimizations. Additional requests
receive HTTP 429, and slots are released after initialization failures, stream
failures, completion, or disconnect. `GET /status` retains the 100 most recent
runs so process memory cannot grow without bound.

Optimization request bodies are limited to 8 MiB, including chunked bodies.

## CLI protocol

For each request, Python starts one long-lived CLI process:

```text
petrinaut serve --optimization-stdin --stdio
```

It writes the manifest as the first JSON line. After the CLI reports readiness,
Python asks it to describe the generic Optuna search space:

```json
{
  "id": 1,
  "method": "optimization.describe"
}
```

The result supplies the direction, study settings, and only the non-fixed flat
parameters:

```json
{
  "direction": "maximize",
  "study": { "trials": 100, "sampler": "tpe", "seed": 42 },
  "parameters": [
    {
      "identifier": "rate",
      "type": "float",
      "default": 1,
      "minimum": 0.1,
      "maximum": 10,
      "scale": "log"
    },
    {
      "identifier": "workers",
      "type": "int",
      "default": 4,
      "minimum": 1,
      "maximum": 16,
      "step": 1,
      "scale": "linear"
    },
    {
      "identifier": "enabled",
      "type": "boolean",
      "default": true
    }
  ]
}
```

Python maps those descriptors directly to `suggest_float`, `suggest_int`, and
`suggest_categorical`, and seeds the sampler with the CLI-provided execution
seed. For every trial it sends only the suggestions back:

```json
{
  "id": 2,
  "method": "optimization.evaluate",
  "params": {
    "parameterValues": {
      "rate": 1.25,
      "workers": 6,
      "enabled": true
    }
  }
}
```

The CLI owns fixed-value injection, scenario compilation, initial-state
materialization, simulation, and metric evaluation. It returns one finite
number as `{ "objective": 42.5 }`.

For an end-to-end local request, use the checked-in
`libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-optimization.json`
manifest. It defines the supply-chain `Profit` study used for an end-to-end
optimization test.

CLI startup is limited to 25 seconds and each protocol response to 240 seconds.
Protocol lines are limited to 8 MiB. Python continuously drains CLI stderr once
startup completes and terminates the CLI's isolated process group on timeout,
failure, or client disconnect.

## Development

From `apps/petrinaut-opt`:

```bash
uv sync
uv run pytest
uv run uvicorn src.optimization_api:app --reload
```

When running outside the Docker image, build Petrinaut CLI first and make a
`petrinaut` executable available on `PATH`. The production image installs that
command at `/usr/local/bin/petrinaut`.

Generate the checked-in OpenAPI document with:

```bash
uv run python -m scripts.generate_openapi
```

Running `python -m src.optimization_api` reads
`HASH_PETRINAUT_OPT_HOST`/`HASH_PETRINAUT_OPT_PORT`, defaulting to
`localhost:4004`. The Docker image passes `0.0.0.0:4004` explicitly to Uvicorn.

Build and run the image from the repository root:

```bash
docker build --file apps/petrinaut-opt/docker/Dockerfile --tag petrinaut-opt:local .
docker run --rm --read-only --publish 127.0.0.1:4004:4004 petrinaut-opt:local
```
