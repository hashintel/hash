# Orchestrator Integration Test Harness

Integration tests for the hashql-eval orchestrator module. Tests exercise the
full path from compiled queries through database execution, row hydration, filter
evaluation, and value assembly against a real PostgreSQL instance.

## Test categories

Two categories share a single harness binary:

1. **J-Expr tests** (`.jsonc` files): full pipeline from HashQL source through
   parsing, HIR, MIR, execution analysis, SQL lowering, and orchestrator
   execution. Output is blessed/compared like compiletest.

2. **Programmatic tests** (`body!` macro): construct MIR directly, skip
   parsing/HIR, exercise specific orchestrator scenarios (particular CFG shapes,
   island boundaries, continuation patterns). Same blessing/comparison pattern
   with expected output in sibling `.stdout` files. Registered as an iterator
   of named function pointers that produce a `Body`.

Error cases (all `Severity::Bug` paths, unreachable from valid input) are
registered as manual trials when needed. No special `.stderr` infrastructure.

## Harness structure

```
libs/@local/hashql/eval/
  tests/
    orchestrator.rs          # entry point (libtest-mimic, harness = false)
    ui/
      orchestrator/
        jsonc/               # J-Expr test files
          simple-read.jsonc
          simple-read.stdout
          ...
        programmatic/        # body! expected output
          hydrate-link-data.stdout
          continuation-round-trip.stdout
          ...
```

The harness binary:

- Discovers `.jsonc` files from `tests/ui/orchestrator/jsonc/`
- Iterates programmatic test function pointers, each named to map to its
  `.stdout` file in `tests/ui/orchestrator/programmatic/`
- Each test becomes a `libtest_mimic::Trial`
- nextest discovers and runs them via `--list` / `--exact`

### Blessing

```bash
cargo run -p hashql-eval --test orchestrator -- --bless
```

### Inputs

Converting arbitrary per-test inputs to typed `Value`s requires the type
environment, which depends on the query's input declarations. That makes
per-test input specification non-trivial.

Instead, the harness provides a fixed set of pre-built inputs that are always
available to every test. These are constructed once during setup as typed
`Value`s in the interpreter's format. Tests reference them by name via
`input.load!`. The set covers common needs:

- String values (e.g. `"name"` -> `"Alice"`, `"city"` -> `"London"`)
- Numeric values (e.g. `"age"` -> `42`, `"count"` -> `0`)
- Boolean values (e.g. `"flag"` -> `true`)
- Null

If a test needs an input not in the fixed set, add it to the shared set rather
than introducing per-test input specification.

### Temporal axes

Specified via `//@ axis` directives using standard interval notation. Each
axis is configured independently; omitted axes default to unbounded.

```jsonc
//@ axis[transaction] = (946684800000)
//@ axis[decision] = [946684800000, 978307200000)
```

Syntax:

- `(T)` : point interval, pinned to timestamp T (ms since Unix epoch)
- `[a, b)` : included start, excluded end
- `(a, b]` : excluded start, included end
- `[a, b]` : both included
- `(a, b)` : both excluded
- `(, b]` : unbounded start, included end
- `[a,)` : included start, unbounded end

Maps directly to `Bound<Timestamp>` in `TemporalInterval`. The directive
scanner parses these before handing the source to the compilation pipeline.

## Database lifecycle

### Container

Uses `testcontainers` with `TESTCONTAINERS_REUSE=true`. Each test process:

1. Starts (or reuses) a PostgreSQL container
2. Connects via `tokio_postgres`
3. Runs migrations via `PostgresStore::run_migrations()` (idempotent)
4. Seeds system policies via `seed_system_policies()` (idempotent)
5. Seeds ontology types and test entities (`ConflictBehavior::Skip`)

Steps 3-5 are no-ops on reused containers.

### Connections

Two connections to the same container:

- **Setup connection**: `PostgresStore<Client>` for migrations, policy seeding,
  ontology insertion, entity creation.
- **Test connection**: raw `tokio_postgres::Client` for the `Orchestrator`.

## Seed dataset

### Ontology types

From `hash-graph-test-data` static fixtures:

- Data types: standard primitives
- Property types: name, age, email, address-line-1, city, postcode, blurb,
  published-on, interests
- Entity types: Person, Organization, Book, Address, Building
- Link types: friend-of, acquaintance-of, contains, located-at, written-by

### Entities

Static fixtures:

- Alice (Person, `{name: "Alice"}`)
- Bob (Person, `{name: "Bob", age: 42}`)
- Charles (Person)
- Organization (`{name: "HASH, Ltd"}`)
- Book (`{name: ["The Time Machine"], blurb: "brulb", published-on: "1895-05"}`)
- Address (`{address-line-1: ..., postcode: ..., city: ...}`)

Purpose-built (created programmatically during setup):

- Friend-of link between Alice and Bob with confidence values set
- A draft entity
- An entity with nested property objects

### EntityPath coverage

| Path variant             | Source                                        |
| ------------------------ | --------------------------------------------- |
| Properties               | All entities (string, number, array, object)   |
| RecordId                 | All entities (automatic)                       |
| EntityId                 | All entities (automatic)                       |
| WebId                    | All entities (automatic)                       |
| EntityUuid               | All entities (automatic)                       |
| DraftId                  | Draft entity (purpose-built)                   |
| EditionId                | All entities (automatic)                       |
| TemporalVersioning       | All entities (automatic)                       |
| DecisionTime             | All entities (automatic)                       |
| TransactionTime          | All entities (automatic)                       |
| EntityTypeIds            | All entities (automatic)                       |
| Archived                 | All entities (automatic)                       |
| Confidence               | Link with confidence (purpose-built)           |
| ProvenanceInferred       | All entities (automatic)                       |
| ProvenanceEdition        | All entities (automatic)                       |
| PropertyMetadata         | All entities (automatic)                       |
| LeftEntity*              | Link entity (purpose-built)                    |
| RightEntity*             | Link entity (purpose-built)                    |
| Vectors                  | Unreachable (placement rejects)                |

## Test execution flow

### J-Expr tests

1. Parse `//@ axes:` directives from `.jsonc` file
2. Full compilation pipeline (parse, HIR, MIR, execution analysis, SQL lowering)
3. Assert no diagnostics
4. Execute via `Orchestrator::run_in()` with the shared input set
5. Serialize returned `Value` to stable text
6. Compare against `.stdout` (or bless)

### Programmatic tests

1. Call the test's function pointer to construct a `Body` via `body!` macro
2. Execution analysis, SQL lowering
3. Assert no diagnostics
4. Execute via `Orchestrator::run_in()` or `Orchestrator::fulfill_in()`
5. Serialize returned `Value` to stable text
6. Compare against `.stdout` (or bless)

## Output format

The returned `Value` needs a deterministic text representation for blessing.

**Problem**: entity metadata contains UUIDs and timestamps that differ per seed.

**Approach**: normalize non-deterministic fields in the serialized output.
Replace UUIDs with positional placeholders (`<uuid:0>`, `<uuid:1>`, ...),
timestamps with `<timestamp>`. The normalizer maintains a mapping so the same
UUID always gets the same placeholder within a single test output. This
preserves structural assertions (two fields reference the same entity) without
depending on specific values.

## Dependencies (dev)

- `testcontainers` + `testcontainers-modules` (postgres feature)
- `libtest-mimic`
- `hash-graph-test-data` (static fixtures)
- `hash-graph-postgres-store` (already a dep; migrations, seeding)

## Notes

- Inputs are declared by the query itself (`["input", "name", "String"]`). The
  harness provides a `HashMap<Symbol, Value>` of pre-built values. The query's
  declarations determine which ones get bound. The harness does not need to know
  the types; the query does.
- Temporal axes use `["input", "temporal_axis", "_"]` in test queries, not
  `["::graph::tmp::decision_time_now"]`.
