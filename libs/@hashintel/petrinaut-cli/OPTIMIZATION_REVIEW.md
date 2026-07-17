# Petrinaut CLI optimization review

This review covers the Petrinaut CLI boundary and its manifest-driven
optimization flow. It separates behavior-preserving fixes that were safe to
apply immediately from proposals that would change a manifest, protocol, or
existing CLI surface.

## Current flow

The responsibilities are coherent:

1. The caller creates one versioned manifest containing a complete model
   snapshot, exactly one scenario, exactly one custom metric, fixed and
   optimized scenario-parameter bindings, execution settings, and study
   settings.
2. `petrinaut serve --optimization-stdin --stdio` reads that manifest once,
   validates it, compiles the model once, and reports readiness.
3. `optimization.describe` returns the direction, study settings, and a flat
   list containing only parameters Optuna should suggest.
4. Python maps `float`, `int`, and `boolean` descriptors to Optuna without
   reading Petrinaut model types.
5. `optimization.evaluate` accepts every and only those suggested values. The
   CLI injects fixed values, compiles the selected scenario, runs the metric,
   and returns one finite scalar objective.

This is a useful separation: the Python service remains generic, while all
Petrinaut-specific interpretation stays in TypeScript.

## Safe improvements applied

- Manifest validation now uses own-property checks for parameter bindings. A
  legacy-compatible identifier such as `constructor` can no longer make
  `safeParse()` throw by resolving an inherited `Object.prototype` property.
- The stdin bootstrap-size error now distinguishes an oversized optimization
  manifest from an oversized bare model.
- The CLI runtime now builds one ordered optimized-parameter collection and a
  membership set instead of building an identifier-to-parameter map and then
  looking every parameter up again.
- The generic Python guide now points readers to the separate manifest-driven
  optimization guide.

## Proposals that change contracts

### 1. Decide whether the CLI is a general runner or an optimizer boundary

The only application integration currently found in the repository uses:

```text
--optimization-stdin --stdio
optimization.describe
optimization.evaluate
```

The Unix-socket transport, bare `--model` modes, `metadata`, and generic `run`
API are currently referenced only by this package's documentation, examples,
and tests. They account for most of the CLI implementation, especially the
manual request normalization in `runtime/run-request.ts`.

Proposal:

- If the generic runner is still a supported product capability, retain it but
  treat it as an explicit second surface with its own command and ownership.
- If Petrinaut CLI exists only to support the optimizer, remove the socket,
  bare-model sources, generic methods, generic Python client, and their tests.

This would be the largest code reduction, but it breaks documented CLI usage
and should be an explicit product decision.

### 2. Remove redundant fields in a version 2 manifest

Version 1 requires exactly one scenario and one metric, but also repeats their
IDs in `scenario.id` and `objective.metricId`. It also embeds a model as
`{ title, definition }`, then reconstructs a normal Petrinaut file for parsing.

A smaller version 2 shape could:

- embed the normal Petrinaut file shape directly;
- place `parameterBindings` directly under `scenario` or at the manifest root;
- derive the scenario and metric IDs from the sole embedded entries;
- keep only the objective direction alongside the sole metric.

The repeated IDs currently provide useful consistency checks, so this should
be done only if reducing manifest construction and validation is worth a
versioned migration.

### 3. Either use or remove parameter defaults from `describe`

The CLI returns each scenario parameter's `default`, but the Python optimizer
does not use it. Two coherent options exist:

- remove `default` from the protocol; or
- enqueue one baseline Optuna trial using defaults that lie inside every
  selected domain.

Enqueuing a baseline changes study behavior and consumes a trial. Removing the
field changes the protocol. Until one behavior is wanted, retaining the field
is harmless but redundant.

### 4. Add structured protocol errors

Protocol errors currently contain only `{ message }`. Python consequently
treats every CLI evaluation error as a pruned trial, including failures that
may indicate invalid model code or an internal defect.

Add a stable error code and category, for example:

```json
{
  "error": {
    "code": "evaluation_failed",
    "category": "model",
    "message": "..."
  }
}
```

Python could then prune expected trial-level failures, fail invalid requests,
and terminate the study for internal or transport failures. This is a protocol
change, but it would make failure semantics substantially clearer.

### 5. Use one bounded JSON-lines implementation and one limit

The CLI currently uses `readline` for stdio and a separate buffered parser for
Unix sockets. The manifest limit is 8 MiB, CLI request lines are 10 MiB, and
the Python client limits protocol response lines to 8 MiB. `readline` also has
to receive a complete line before the CLI can reject it by size.

Use one byte-bounded JSON-lines reader for every retained transport and choose
one documented limit shared with Python. Lowering the existing 10 MiB request
limit would technically reject previously accepted inputs, so this should be
coordinated as a protocol limit change.

### 6. Version the stdio protocol independently of the manifest

The manifest is versioned, but the JSON-lines methods and readiness message are
not. Python currently recognizes readiness through a stderr string prefix.

If more consumers or methods are expected, add a small structured handshake
that reports a protocol version and capabilities. If the optimizer remains the
only tightly coupled consumer, the current string and two-method protocol are
simpler and can remain as-is.

## Deferred optimization semantics

Every trial currently uses the same simulation seed, which makes comparisons
reproducible. It also means a stochastic model is optimized against one random
realization. Supporting repeated runs and an aggregation rule (for example,
mean or percentile objective) is a future semantic decision rather than a CLI
cleanup and should not be added implicitly.
