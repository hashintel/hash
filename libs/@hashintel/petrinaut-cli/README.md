# `@hashintel/petrinaut-cli`

Internal CLI/server for running one Petrinaut model repeatedly from scripts,
Python optimization loops, or backend jobs.

## Start

Build first:

```bash
yarn workspace @hashintel/petrinaut-cli build
```

Serve over a Unix socket:

```bash
petrinaut serve --model ./model.sdcpn.json --socket /tmp/petrinaut.sock
```

Or over loopback HTTP:

```bash
petrinaut serve --model ./model.sdcpn.json --host 127.0.0.1 --port 8765
```

The server loads Petrinaut Core once, compiles the model once, then accepts many
run requests.

Example JSON models copied from Petrinaut Core live in `examples/`.

## Endpoints

`GET /healthz`

```json
{ "ok": true }
```

`GET /metadata`

Returns parameters, places and metrics. Use this from Python to discover:

- parameter variable names, ids, display names and types;
- place ids, display names and colour fields;
- metric ids and names.

`POST /runs`

```json
{
  "parameters": {
    "infection_rate": 1.5,
    "recovery_rate": 0.8
  },
  "initialState": {
    "Susceptible": 990,
    "Infected": 10,
    "Recovered": 0
  },
  "metrics": ["Infected Fraction", "Throughput"],
  "maxSteps": 100,
  "dt": 0.1,
  "seed": 4242
}
```

Fields:

- `parameters`: parameter values. Keys may be parameter variable name,
  parameter id, or display name.
- `initialState`: initial markings. Keys may be place id or display name.
- `metrics`: metric names/ids evaluated on the final frame.
- `maxSteps`: number of simulation steps. `dt` defaults to `1` if omitted.

Transition predicates are part of the model structure, not the run request. To
change predicate logic, edit the model; to change values used by predicate
logic, pass new `parameters`.

## Output

Metrics are evaluated only on the final frame and returned as scalar values:

```json
{
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
    "Infected Fraction": 0.04,
    "Throughput": 12.3
  }
}
```

The first version does not return metric distributions or full frame histories.
It is intentionally summary-first for optimization loops.
