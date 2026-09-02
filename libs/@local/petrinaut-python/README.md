# `@local/petrinaut-python`

Python bindings for the [Petrinaut CLI](../../@hashintel/petrinaut-cli): run
simulations and drive optimization studies against a compiled Petrinaut model
from Python, over the CLI's JSON-lines stdio protocol.

The package is internal to this monorepo and is consumed as a uv path
dependency (`apps/petrinaut-opt` is the reference consumer). Its one runtime
dependency is pydantic, which validates optimization responses against the
CLI's published protocol schema. It is **POSIX-only**: it relies on process
groups and descriptor polling.

Each session owns one long-lived `petrinaut serve` child process for one
model. The child runs with a scrubbed environment, its own process group, and
size- and time-bounded reads; protocol errors close the session, while
per-request error frames raise `PetrinautRunError` and leave it usable.

## Running a model

Model and manifest files may be YAML (the editor's default export format) or
JSON; the CLI detects the format from the content.

```python
from petrinaut import PetrinautSession

with PetrinautSession.from_model_file("./sir-model.json") as session:
    metadata = session.metadata()
    result = session.run(
        {
            "parameters": {"infection_rate": 1.5, "recovery_rate": 0.8},
            "initialState": {"Susceptible": 990, "Infected": 10, "Recovered": 0},
            "metrics": ["Infected Fraction"],
            "maxSteps": 100,
            "dt": 0.1,
            "seed": 4242,
        }
    )
    print(result["metrics"]["Infected Fraction"])
```

`PetrinautSession.from_model(model_dict)` sends a model object over stdin
instead of a file path, useful for read-only containers. The generic
`session.request(method, params)` escape hatch reaches any protocol method.

By default the child command is `petrinaut` on the child's fixed `PATH`
(`/usr/local/bin:/usr/bin:/bin`), which is how the deployed image provides it.
In a checkout, build the CLI (`turbo --filter @hashintel/petrinaut-cli build`)
and either link its `bin` onto that `PATH` or point at the built bundle
explicitly:

```python
import shutil

session = PetrinautSession.from_model_file(
    "./sir-model.json",
    command=(shutil.which("node"), "libs/@hashintel/petrinaut-cli/dist/cli.js"),
)
```

## Running an optimization study

```python
from petrinaut import OptimizationSession

# `OptimizationSession.from_manifest_file(path)` reads the manifest from disk instead.
with OptimizationSession(manifest) as session:
    description = session.describe()
    value = session.objective({"production_rate": 112.5, "enabled": True})
    full = session.evaluate({"production_rate": 112.5, "enabled": True})
    # full.replicates carries per-seed objectives when the manifest
    # sets execution.seedsPerTrial above 1.
```

`describe()` and `evaluate()` return pydantic models
(`OptimizationDescribeResult`, `OptimizationEvaluateResult`) generated from the
CLI's protocol schema — `src/petrinaut/models.py` is written by `codegen` from
`@hashintel/petrinaut-cli`'s `schemas/optimization-protocol.schema.json`, and CI
fails when it drifts. A response outside the schema raises
`PetrinautProtocolError` and closes the session.

The manifest itself stays opaque to Python: the CLI owns scenario compilation,
fixed-value injection, simulation, and metric evaluation. The manifest
contract, protocol, and seeded-runs semantics are documented in the
[CLI usage manual](../petrinaut-arch-docs/content/cli/usage-manual.mdx).

## Constraints

A study's constraints come back from `describe()` as `{code, hir}` pairs, and
the binding evaluates the `hir` side itself: no TypeScript toolchain, and the
whole tree is validated node by node against the grammar's pydantic models
before anything runs. Two shapes, told apart by `space`:

```python
from petrinaut import parse_constraints, violations

constraints = parse_constraints(description.constraints)
for constraint in constraints:
    print(constraint.space, constraint.code)

ordering = constraints[0]  # a ParameterConstraint
ordering({"min_load": 2, "max_load": 8})  # True
ordering.margin({"min_load": 2, "max_load": 8})  # 6.0, >= 0 iff satisfied
ordering.violation({"min_load": 8, "max_load": 2})  # 6.0, <= 0 iff satisfied
ordering.check({"min_load": 8, "max_load": 2})  # raises ConstraintViolation
```

- `ParameterConstraint` ranges over the parameter space and takes a `scenario`
  mapping plus the net `parameters`. It is checkable before a run starts.
- `StateConstraint` ranges over the simulation state and takes a `state`
  record (places keyed by name, each with `count` and `tokens`) plus the net
  `parameters`.

Both give four readings of the condition: the boolean (call it), the signed
`margin`, the `violation` in the sign Optuna's `constraints_func` expects, and
`check`, which raises. `violations(constraints, scenario=..., state=...)`
returns one violation per constraint for a sampler. `validator()` packages the
check for pydantic:

```python
from typing import Annotated
from pydantic import AfterValidator, BaseModel


class Study(BaseModel):
    scenario: Annotated[dict[str, float], AfterValidator(ordering.validator())]
```

A parameter constraint over plain arithmetic also has a symbolic reading with
the `sympy` extra (`petrinaut-python[sympy]`): `ordering.to_sympy()` returns
the relation over one real symbol per parameter, ready for
`sympy.solve_univariate_inequality` or `simplify`. Arrays, records, strings
and `Math.random()` have no symbolic form and raise `NotSymbolicError`.

## Timeouts and limits

- Bootstrap (spawn to readiness) and each protocol response have deadlines,
  `BOOTSTRAP_TIMEOUT_SECONDS` and `PROTOCOL_READ_TIMEOUT_SECONDS`. Both are
  constructor options. For optimization sessions the per-response deadline is
  multiplied by the `seedsPerTrial` the study reports, since one evaluate may
  run that many simulations.
- Bootstrap and protocol lines are capped at `MAX_BOOTSTRAP_LINE_BYTES` and
  `MAX_PROTOCOL_LINE_BYTES`.
- A session serves one request at a time and is not synchronized: issue requests
  from one thread. `close()` may be called from another.
- `close(graceful=False)` signals the child's process group immediately;
  the graceful default first waits for an EOF-driven exit.

## Tests

`turbo run test:unit --filter @local/petrinaut-python` builds the CLI bundle
first, so the end-to-end tests run; a plain `uv run pytest` skips them when the
bundle is missing.
