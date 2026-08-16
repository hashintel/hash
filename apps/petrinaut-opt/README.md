# Petrinaut optimization

This service uses Optuna to optimize the flat, non-fixed parameters of one
Petrinaut scenario. It owns the Server-Sent Events API and the study lifecycle,
and delegates every Petrinaut-specific concern to the
[`petrinaut` Python bindings](../../libs/@local/petrinaut-python/README.md).
Which process the bindings run, and how, is theirs to decide.

The Python service treats the optimization manifest as opaque JSON. It does not
read Petrinaut models, scenario bindings, metrics, or the Petrinaut type system.

## API

Run creation accepts the complete optimization manifest as its JSON request
body. The manifest is produced by the Petrinaut UI/Node API and is forwarded
unchanged to the bindings.

- `POST /optimize/runs` starts a detached run and returns its id. Attach or
  reattach to its replayable event stream with
  `GET /optimize/runs/{run_id}/events`; `DELETE /optimize/runs/{run_id}`
  cancels it.

When run creation carries an `x-hash-account-id` header (the authenticated
NodeAPI proxy stamps it), the run is owned: the account may drive only one
live run at a time (429 otherwise), and attach/cancel answer 404 unless the
same tag is presented — identical to an unknown run, so foreign run ids
cannot be probed. Requests without the header (local development, the
website demo) create ownerless, openly attachable runs.

The response is `text/event-stream`. Existing frame bodies are preserved:

```text
data: {"step": 0, "params": {"rate": 1.2}, "init_state": {}, "metric": 14.5, "state": "COMPLETE"}

event: done
data: {}

```

`params` contains the flat values proposed by Optuna. Fixed parameter values
are applied behind the bindings and are not echoed by Python. `init_state` is
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

The streaming endpoints are not resumable: disconnecting stops that study and
closes its session. Detached-run event streams are resumable: every frame has an
event id, buffered frames can be replayed using `Last-Event-ID` (or `cursor`),
and disconnecting an attachment does not stop the run.

Each response has an `X-Optimization-Run-ID` header for status queries:

- `GET /status` returns every run status.
- `GET /status/{run_id}` returns one run status.
- `GET /` returns a welcome message.

### Correlation and logs

One optimization can be followed across the HTTP service boundary:

1. NodeAPI forwards its request id in `x-hash-request-id`; Python attaches it
   to lifecycle log records as `request_id`.
2. Python creates a `run_id`, returns it in `X-Optimization-Run-ID`, and
   attaches it to lifecycle log records.

This service emits normal Python log records with bounded structured fields
such as `event`, `request_id`, and `run_id`. When OTLP is configured,
`src/telemetry.py` exports those records and the service's traces and metrics.

The bindings drain their child's diagnostics so it cannot block, and none of
that output is copied into service logs. Lifecycle logs never intentionally include
optimization manifests, user-authored code, or raw request bodies.

The process admits at most four active optimizations. Additional requests
receive HTTP 429, and slots are released after initialization failures, stream
failures, completion, disconnect, or detached-run cancellation/reaping.
`GET /status` retains the 100 most recent runs so process memory cannot grow
without bound.

Detached runs reject descriptions above 1,000 trials and, by default, stop
after 900 seconds (`HASH_PETRINAUT_OPT_MAX_STUDY_SECONDS`); invalid values use
the default and zero disables the wall-clock limit. Their event log is retained
for the detach-grace period and an attachment cursor is clamped to the current
log, so malformed resume requests cannot suppress later terminal events.

Optimization request bodies are limited to 8 MiB, including chunked bodies.

## Optimization backend

Each run gets one session from the [`petrinaut` Python
bindings](../../libs/@local/petrinaut-python/README.md), created with the
manifest as opaque JSON. This service starts the session, describes the study,
evaluates one trial at a time, and closes the session.

`describe_optimization()` returns the direction, the study settings, and the
flat parameters that are not fixed, each one a descriptor such as:

```json
{
  "identifier": "rate",
  "type": "float",
  "minimum": 0.1,
  "maximum": 10,
  "scale": "log"
}
```

`float`, `int`, and `boolean` map onto `suggest_float`, `suggest_int`, and
`suggest_categorical`, and the study seed seeds the sampler. The bindings'
[usage manual](../../libs/@local/petrinaut-python/README.md) documents the full
response.

`objective(parameter_values)` evaluates one trial and returns one finite number.
Fixed-value injection, scenario compilation, initial-state materialization,
simulation, and metric evaluation all happen behind that call, and fixed values
are never echoed back through this service. When the manifest sets
`execution.seedsPerTrial` above 1, one trial runs that many seeded simulations
with the same derived seed sequence every time, and the objective is their mean.
The per-seed values come back alongside it, and this service ignores them.

`close()` ends the session. The bindings bound every wait and clean up after
themselves: a startup deadline, a per-response deadline that scales with the
`seedsPerTrial` the study reports, since one evaluation may run that many
simulations, a line-size limit, and termination of the process they started on
timeout, failure, or client disconnect. Their README documents the current
values.

## Observability

The service is instrumented with OpenTelemetry. When `OTEL_EXPORTER_OTLP_ENDPOINT` is
set it exports traces, metrics, and logs over OTLP to that collector — the
same `otel-collector` target the rest of the HASH stack uses.
When the variable is unset (a plain `uv run` with no collector) telemetry is
skipped and the service runs normally, matching the Node workers.

- Traces: incoming HTTP requests are auto-instrumented. Each study runs under an
  `optimization.study` span (a child of the request span), and every Optuna trial
  is an `optimization.trial` span beneath it, carrying the trial number, value,
  and whether it was pruned. The study runs on a worker thread that inherits the
  request's trace context, so the request → study → trial hierarchy is preserved.
  The `/status` health probe is excluded from HTTP instrumentation.
- Metrics and logs: the FastAPI/Optuna default metrics and stdlib log records are
  exported to the collector (Mimir/Loki in the stack).

Configuration (standard OTLP environment variables):

- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector URL, e.g.
  `http://otel-collector:4317`. A `http://` scheme selects a plaintext
  (insecure) channel.
- Per-signal endpoint overrides and `OTEL_EXPORTER_OTLP_INSECURE` are read
  directly by the standard OTLP exporters.
- `OTEL_EXPORTER_OTLP_PROTOCOL` — `grpc` (default, the collector's `:4317`
  port) or `http/protobuf` (its `:4318` port).
- `OTEL_SERVICE_NAME` — service name shown in Tempo/Grafana. Defaults to
  `Petrinaut Optimizer`.

Bootstrap lives in `src/telemetry.py` and runs once when the app is created. A
misconfigured collector is logged and swallowed so it never stops the API from
serving.

## Development

From `apps/petrinaut-opt`:

```bash
uv sync
uv run pytest
uv run uvicorn src.optimization_api:app --reload
```

Outside the Docker image, the bindings need their executable on `PATH`; their
[README](../../libs/@local/petrinaut-python/README.md) covers how to provide it.
The production image installs it at `/usr/local/bin/petrinaut`.

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
