---
layer: cli.runtime
role: Protocol dispatch and request handling — run requests and manifest-driven optimization studies.
---

The runtime interprets one protocol line at a time: parse and validate the
request, execute it against the compiled model, write exactly one response
line. A request line looks like:

```json
{
  "id": 2,
  "method": "run",
  "params": {
    "scenario": { "id": "baseline", "parameterValues": { "rate": 1.5 } },
    "metrics": ["Profit"],
    "maxTime": 100
  }
}
```

The response shapes are documented in the usage manual attached to the `cli`
layer. Run requests resolve parameter and place aliases and compile scenarios;
the optimization module owns the manifest-driven describe/evaluate protocol,
deriving each trial's seed sequence and aggregating per-seed objectives.

Seeded runs within a trial execute sequentially against the compiled model.
