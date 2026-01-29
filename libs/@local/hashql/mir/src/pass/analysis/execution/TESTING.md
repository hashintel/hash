# Execution Analysis Testing Plan

This document outlines the test strategy for the `execution` analysis module.

## Overview

The execution analysis module determines which MIR statements can execute on each target (Postgres, Embedding, Interpreter) and assigns costs. Tests verify:

1. Correct target identification and cost assignment
2. Statement placement rules per target
3. Entity projection path lookups
4. "Must" analysis semantics (all paths to return must support a local)

## Test Organization

```
libs/@local/hashql/mir/
├── src/pass/analysis/execution/
│   ├── cost/
│   │   └── tests.rs              # Unit tests + Miri tests
│   ├── target/
│   │   └── tests.rs              # Unit tests
│   └── statement_placement/
│       ├── tests.rs              # Shared tests (non-filter sources)
│       ├── postgres/
│       │   └── tests.rs          # Snapshot tests
│       ├── embedding/
│       │   └── tests.rs          # Snapshot tests
│       ├── interpret/
│       │   └── tests.rs          # Snapshot tests
│       └── lookup/
│           └── tests.rs          # Unit tests for trie lookup
└── tests/ui/pass/execution/
    ├── postgres/                 # Postgres placement snapshots
    ├── embedding/                # Embedding placement snapshots
    └── interpret/                # Interpreter placement snapshots
```

## Snapshot Format

Tests use the extended `TextFormat` with cost annotations:

```
[  4] _2 = load _0;
[  4] _3 = bin.== _2 42;
[  -] _4 = apply func;
[  0] let _5;

Traversals:
  _2: 4
```

- `[%3s]` prefix: cost value or `-` for `None`
- Traversals section appended after body

---

## Test Categories

### 1. `target/tests.rs` — Unit Tests (2 tests)

| Test | Description |
|------|-------------|
| `target_ids_are_distinct` | `POSTGRES`, `INTERPRETER`, `EMBEDDING` IDs don't collide |
| `target_names_derived_correctly` | `name()` returns expected strings |

### 2. `cost/tests.rs` — Unit Tests (4 tests)

| Test | Description |
|------|-------------|
| `cost_new_valid_values` | `Cost::new(0)` and `Cost::new(100)` succeed |
| `cost_new_max_returns_none` | `Cost::new(u32::MAX)` returns `None` (niche) |
| `statement_cost_vec_indexing` | Correct indexing by `Location` across blocks |
| `traversal_cost_vec_ignores_non_traversals` | Insert for non-traversal local is ignored |

### 3. `cost/tests.rs` — Miri Tests (4 tests)

These tests exercise unsafe code and should be added to the Miri test list.

| Test | Unsafe Code Exercised |
|------|----------------------|
| `cost_new_unchecked_valid` | `Cost::new_unchecked` with valid values |
| `statement_cost_vec_init_single_block` | `assume_init` with 1 block |
| `statement_cost_vec_init_multiple_blocks` | `assume_init` with varying block sizes (0, 1, 5 statements) |
| `statement_cost_vec_init_empty` | `assume_init` with 0 blocks |

**Miri test paths:**

```
hashql_mir::pass::analysis::execution::cost::tests::cost_new_unchecked_valid
hashql_mir::pass::analysis::execution::cost::tests::statement_cost_vec_init_single_block
hashql_mir::pass::analysis::execution::cost::tests::statement_cost_vec_init_multiple_blocks
hashql_mir::pass::analysis::execution::cost::tests::statement_cost_vec_init_empty
```

### 4. `statement_placement/tests.rs` — Shared Tests (1 test)

| Test | Description |
|------|-------------|
| `non_graph_read_filter_returns_empty` | All targets return empty costs for non-`GraphReadFilter` sources |

### 5. `statement_placement/interpret/tests.rs` — Snapshot Tests (2 tests)

| Test | Description |
|------|-------------|
| `all_statements_supported` | All statement kinds receive costs (universal fallback) |
| `storage_statements_zero_cost` | `StorageLive`/`StorageDead`/`Nop` get `cost!(0)`, assignments get `cost!(8)` |

### 6. `statement_placement/postgres/tests.rs` — Snapshot Tests (10 tests)

| Test | Description |
|------|-------------|
| `binary_unary_ops_supported` | Arithmetic/comparison operations work |
| `aggregate_tuple_supported` | Tuple/struct aggregates work (as JSONB) |
| `aggregate_closure_rejected` | `Closure` aggregate returns `None` |
| `apply_rejected` | Function calls (`Apply`) never supported |
| `input_supported` | `RValue::Input` (query params) works |
| `env_with_closure_type_rejected` | Env arg (local 0) containing closure type → excluded |
| `env_without_closure_accepted` | Env arg with simple types → included |
| `entity_projection_column` | `entity.metadata.record_id.entity_id.web_id` → Postgres |
| `entity_projection_jsonb` | `entity.properties.foo` → Postgres |
| `diamond_must_analysis` | If one branch has unsupported op, local excluded from dispatchable set |

### 7. `statement_placement/embedding/tests.rs` — Snapshot Tests (3 tests)

| Test | Description |
|------|-------------|
| `only_vectors_projection_supported` | Only `entity.encodings.vectors` projection works |
| `all_args_excluded` | Both env (local 0) and entity (local 1) excluded |
| `other_operations_rejected` | Binary/Unary/Aggregate/Apply/Input/constants all fail |

### 8. `statement_placement/lookup/tests.rs` — Unit Tests (6 tests)

| Test | Description |
|------|-------------|
| `properties_is_postgres` | `[.properties]` → `Access::Postgres(Direct)` |
| `properties_subpath_is_postgres` | `[.properties.foo.bar]` → Postgres (JSONB otherwise) |
| `vectors_is_embedding` | `[.encodings.vectors]` → `Access::Embedding(Direct)` |
| `metadata_columns_are_postgres` | Various metadata paths → Postgres |
| `link_data_synthesized_is_none` | `link_data.left_entity_id.draft_id` → `None` |
| `unknown_path_returns_none` | Invalid path like `[.unknown]` → `None` |

---

## Test Count Summary

| Category | Count |
|----------|-------|
| `target/` unit tests | 2 |
| `cost/` unit tests | 4 |
| `cost/` Miri tests | 4 |
| `statement_placement/` shared | 1 |
| `interpret/` snapshots | 2 |
| `postgres/` snapshots | 10 |
| `embedding/` snapshots | 3 |
| `lookup/` unit tests | 6 |
| **Total** | **32** |

Note: Miri tests overlap with unit tests (same functions, tagged for Miri). Unique test functions: **28**.

---

## Implementation Notes

### Entity Type for Projections

Tests involving entity projections require local 1 to have opaque type `Entity` (`sym::path::Entity`). Use the `[Opaque path; T]` syntax:

```rust
use hashql_core::symbol::sym;

let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
    decl env: (), vertex: [Opaque sym::path::Entity; ?];
    // Chain projections: vertex -> metadata -> archived
    @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

    bb0() {
        return archived;
    }
});
```

Each `@proj` supports only ONE field after the base. For deeper paths, chain through intermediate declarations. Named field projections produce `ProjectionKind::FieldByName`, which `entity_projection_access` uses for path lookup.

### GraphReadFilter Source

All placement tests (except the "non-filter returns empty" test) must use `[graph::read::filter]` source, since other sources return empty costs.

### Traversals

Use `TraversalExtraction` pass to produce `Traversals` rather than constructing manually:

```rust
let mut pass = TraversalExtraction::new_in(Global);
pass.run(&mut context, &mut body);
let traversals = pass.take_traversals().expect("GraphReadFilter body");
```

This keeps the `Traversals` API private and tests the actual integration path.

---

## Running Tests

```bash
# All execution analysis tests
cargo nextest run --package hashql-mir execution

# Specific category
cargo nextest run --package hashql-mir cost::tests
cargo nextest run --package hashql-mir postgres::tests

# Update snapshots
cargo insta test --package hashql-mir --accept

# Miri tests (add to CI Miri list)
cargo miri test --package hashql-mir cost::tests::cost_new_unchecked_valid
cargo miri test --package hashql-mir cost::tests::statement_cost_vec_init
```
