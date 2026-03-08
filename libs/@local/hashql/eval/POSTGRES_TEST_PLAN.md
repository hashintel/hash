# PostgreSQL Evaluator Test Plan

Comprehensive test plan for `libs/@local/hashql/eval/src/postgres/` — the CFG-to-SQL lowering
module that compiles MIR islands into PostgreSQL `SELECT` statements.

**Status:** Tier 1 compiletest coverage complete (21 tests); remaining Tier 1 tests blocked on
missing HIR features. Tier 3 MIR builder snapshot tests mostly complete (15/17 tests). Tier 2
unit tests not yet started.

**Legend:** ✅ done · ⏭ skipped (reason noted) · 📸 needs snapshot test · ❌ not started

---

## Tier 1: Compiletest Suite — `eval/postgres/entity`

End-to-end tests: J-Expr → AST → HIR → MIR → execution analysis → `PostgresCompiler::compile()`
→ transpiled SQL string.

### Suite implementation

New file: `compiletest/src/suite/eval_postgres_entity.rs`

Pipeline:

1. Reuse `mir_reify::mir_reify()` to get `(root_def, bodies)`
2. Run the standard MIR optimization pipeline (reuse whatever shared pipeline helper exists,
   or centralize one — do NOT manually list individual passes, as that will drift)
3. Run `ExecutionAnalysis` on graph read filter bodies → `IslandGraph`
4. Build `EvalContext::new_in()` (computes `LiveOut` automatically)
5. Walk root body to find `GraphRead` terminators
6. Call `PostgresCompiler::compile(graph_read)`
7. Output `statement.transpile_to_string()` + parameter summary

Test location: `eval/tests/ui/postgres/entity/`
Spec: `suite = "eval/postgres/entity"`

Output format (in `.stdout`):

```
════ SQL ════════════════════════════════════════════════════════════════════════

SELECT ...
FROM ...
WHERE ...

════ Parameters ════════════════════════════════════════════════════════════════

$1: TemporalAxis(Transaction)
$2: TemporalAxis(Decision)
$3: Symbol("entity_uuid")
...
```

**Harness note — parameter summary:** `Parameters`' internal `reverse` mapping uses a private
enum. To output the parameter summary, either add a `pub fn debug_summary(&self) -> String`
behind a `#[cfg(test)]` or a dedicated feature gate, or reduce output to just parameter count
and indices. Decide during implementation.

**Snapshot stability:** avoid asserting specific `DefId`/`IslandId` numbers in continuation
aliases (e.g. `continuation_0_0`). These depend on upstream lowering/inline decisions. Assert
patterns instead: aliases start with `continuation_`, SELECT includes `*_block`, `*_locals`,
`*_values` columns.

### Tests — basic control flow

Note: constant expressions (`if true then ...`) are folded away by the MIR optimization
pipeline (inst_simplify, forward_substitution, DCE, CFG simplification) before reaching the
postgres compiler. To test control flow, use `[input ...]` parameters — they're opaque to
the optimizer and force runtime branching.

#### `constant-true-filter` ✅

- **run:** pass
- **input:** filter body that returns literal `true` (after optimization, the entire filter
  body is a single-block `return true`)
- **tests:** simplest possible compilation — no branching, straight-line `Return` continuation,
  temporal conditions on base table, continuation LATERAL with OFFSET 0
- **verifies:** baseline SQL shape, continuation composite structure `(filter, NULL, NULL, NULL)::continuation`

#### `if-input-branches` ✅

- **run:** pass
- **input:** `if [input foo] then <expr_a> else <expr_b>` where `foo` is a boolean input
  parameter and both branches are distinct runtime expressions
- **tests:** `SwitchInt` → `CASE WHEN discriminant = <value> THEN ... ELSE ... END` structure,
  both branches produce continuations, input parameter appears as `$N`
- **verifies:** CASE tree generation, branch ordering matches `SwitchTargets`, input parameter
  compilation

#### `nested-if-input-branches` ✅

- **run:** pass
- **input:** nested `if` with input discriminants:
  `if [input foo] then (if [input bar] then <a> else <b>) else <c>`
- **tests:** nested `CASE WHEN` expressions — inner CASE as result of outer CASE branch
- **verifies:** stack-based compilation produces correctly nested SQL, snapshot/rollback of
  locals across branches

### Tests — entity path access & comparisons

#### `entity-uuid-equality` ✅

- **run:** pass
- **input:** `vertex.id.entity_id.entity_uuid == <uuid>`
- **tests:** entity path resolution for `EntityUuid`, equality comparison (no cast), primitive
  parameter for the UUID string
- **verifies:** `EntityPath::EntityUuid` → correct column reference on `entity_temporal_metadata`,
  comparison operators don't add unnecessary casts

#### `entity-web-id-equality` ✅

- **run:** pass
- **input:** `vertex.id.entity_id.web_id == <uuid>`
- **tests:** entity path resolution for `WebId`
- **verifies:** `EntityPath::WebId` → correct column reference

#### `entity-draft-id-equality` ✅

- **run:** pass
- **input:** `vertex.id.draft_id == <value>`
- **tests:** entity path resolution for `DraftId`
- **verifies:** `EntityPath::DraftId` → correct column reference
- **note:** execution analysis places the equality comparison in the interpreter, not in SQL.
  The test still exercises DraftId path resolution via the provides set (column appears in
  SELECT), but the `==` itself is an island exit, not an in-SQL comparison.

#### `entity-archived-check` ✅

- **run:** pass
- **input:** filter on `vertex.metadata.archived == false`
- **tests:** entity path resolution for `Archived`, which requires `entity_editions` join
- **verifies:** `EntityPath::Archived` triggers `entity_editions` JOIN in FROM clause
- **note:** optimizer simplifies `archived == false` to `NOT(archived)`, which is fine — still
  exercises the editions join and correct column reference.

### Tests — property access

#### `property-field-equality` ⏭ 📸

- **run:** skip
- **skip reason:** property subscript requires a concrete entity type; the type system cannot
  resolve unknown field access on `vertex.properties` yet
- **input:** `vertex.properties.<field> == "value"`
- **tests:** `EntityPath::Properties` → `entity_editions` join, property field access generates
  `json_extract_path(properties, $key::text)`, equality comparison on jsonb
- **verifies:** json_extract_path chain, property access triggers entity_editions join,
  parameter for field name symbol
- **covered by:** Tier 3 `property_field_equality` snapshot test

#### `nested-property-access` ⏭ 📸

- **run:** skip
- **skip reason:** property subscript requires a concrete entity type (same as
  `property-field-equality`)
- **input:** `vertex.properties.<field>.<subfield> == "value"`
- **tests:** multi-level property access → `json_extract_path(properties, $key1::text, $key2::text)`
- **verifies:** projection chain accumulates all indices into single json_extract_path call
- **covered by:** Tier 3 `nested_property_access` snapshot test

### Tests — arithmetic & type casts

The code casts differently depending on operator category:

- **Arithmetic** (`Add`, `Sub`): both operands cast to `::numeric`
- **Bitwise** (`BitAnd`, `BitOr`): both operands cast to `::bigint`
- **Comparison** (`Eq`, `Ne`, `Lt`, `Lte`, `Gt`, `Gte`): **no cast** — operates on jsonb directly

#### `comparison-no-cast` ✅

- **run:** pass
- **input:** `[input x] > [input y]` (input parameters, not properties — HIR lacks arithmetic
  intrinsics so property access isn't needed; inputs exercise the same cast logic)
- **tests:** `BinOp::Gt` → `BinaryOperator::Greater` with **no** type casts on either operand
- **verifies:** comparison operators do not add unnecessary casts

#### `arithmetic-addition-casts` ⏭ 📸

- **run:** skip
- **skip reason:** `::core::math::add` intrinsic not supported in HIR specialization yet
  (H-4728)
- **input:** `[input x] + [input y] > 0`
- **tests:** `BinOp::Add` → `BinaryOperator::Add` with `::numeric` casts on both operands,
  the result then compared with `>` (which itself does NOT cast)
- **verifies:** arithmetic ops cast to numeric, comparison on arithmetic result works,
  correct nesting of cast vs. non-cast expressions
- **note:** addition exists in MIR (`bin.+`) but cannot be produced from J-Expr. Needs a
  Tier 3 MIR builder snapshot test to exercise this code path.

### Tests — boolean logic

All boolean logic tests use input parameters as operands to prevent constant folding.

Note: `logical-and-inputs` primarily verifies that `&&` desugaring survives optimization and
produces a CASE in SQL. If `if-input-branches` already covers CASE generation sufficiently,
one of these two can be dropped. Keep at least one AND/OR test as a smoke test for the
desugaring → SQL path.

#### `logical-and-inputs` ✅

- **run:** pass
- **input:** `[input a] && [input b]` (two input parameters combined with AND)
- **tests:** `&&` desugars to `if a then b else false` — since `a` is a runtime input, the
  branch survives optimization and produces a `CASE WHEN` in SQL
- **verifies:** short-circuit AND compiles to correct CASE structure
- **note:** execution analysis places both branches as island exits (the `b` load and the
  literal `false` both transfer control to the interpreter). The test exercises island exit
  from a SwitchInt, but does not produce a CASE tree with filter return branches. The
  discriminant (`input a`) is evaluated in Postgres.

#### `logical-not-input` ⏭ 📸

- **run:** skip
- **skip reason:** `::core::bool::not` intrinsic not supported in HIR specialization yet
  (H-4729)
- **input:** `! [input a]` (negation of input parameter)
- **tests:** `UnOp::Not` → `UnaryOperator::Not` applied to an input parameter `$N`
- **verifies:** unary NOT in SQL output
- **note:** unary NOT exists in MIR (`un.!`) but cannot be produced from J-Expr. Needs a
  Tier 3 MIR builder snapshot test to exercise this code path.

### Tests — input parameters & environment

#### `input-parameter-load` ✅

- **run:** pass
- **input:** filter comparing entity field to a user-provided input parameter
- **tests:** `RValue::Input(InputOp::Load)` → parameter `$N`, parameter deduplication
  (same input referenced twice → same `$N`)
- **verifies:** input parameters allocated correctly, dedup works

#### `input-parameter-exists` ✅

- **run:** pass
- **input:** optional input parameter with default: `[input "optional_flag" Boolean true]`
- **tests:** optional input desugars to `if exists(flag) then load(flag) else default`
- **verifies:** `InputOp::Exists` appears in MIR; execution analysis places the SwitchInt
  and both branches in the interpreter via island exit
- **note:** the `InputOp::Exists` → `NOT IS NULL` SQL pattern is NOT exercised because the
  exists check is placed in the interpreter, not in the Postgres island. The test verifies
  optional input desugaring + island exit behavior. `NOT IS NULL` needs a Tier 3 test.

#### `env-captured-variable` ✅

- **run:** pass
- **input:** filter referencing an input from outer scope (captured in closure environment);
  wrapped in `if true then ... else ...` to prevent thunk conversion + subsequent inlining
  from eliminating the env access
- **tests:** environment field access → `env.<field>` → parameter `$N` via `db.parameters.env()`
- **verifies:** captured variables become `Env(#N)` parameters, field projection on env works

### Tests — aggregate construction

#### `struct-construction` ✅

- **run:** pass
- **input:** filter that constructs a struct value (may appear in intermediate computations)
- **tests:** `AggregateKind::Struct` → `jsonb_build_object(key1, val1, key2, val2)`
- **verifies:** struct field names become symbol parameters, values are compiled operands

#### `tuple-construction` ✅

- **run:** pass
- **input:** filter that constructs a tuple value
- **tests:** `AggregateKind::Tuple` → `jsonb_build_array(val1, val2, ...)`
- **verifies:** tuple elements become jsonb_build_array arguments

#### `list-construction` ✅

- **run:** pass
- **input:** filter that constructs a list value
- **tests:** `AggregateKind::List` → `jsonb_build_array(val1, val2, ...)`
- **verifies:** list and tuple use the same lowering (`jsonb_build_array`) but are distinct
  code paths — ensures the `List` match arm works

#### `dict-construction` ✅

- **run:** pass
- **input:** filter that constructs a dict/map value
- **tests:** `AggregateKind::Dict` → `jsonb_build_object(k1, v1, k2, v2)` with operands
  consumed in pairs via `array_chunks()`
- **verifies:** key-value pairing logic (the `operands.len() % 2 == 0` invariant and the
  chunked iteration)

#### `opaque-passthrough` ✅

- **run:** pass
- **input:** filter involving an opaque type wrapper (e.g. `EntityUuid(Uuid(...))`)
- **tests:** `AggregateKind::Opaque` → passes through the single inner operand unchanged
- **verifies:** opaque wrapper is transparent in SQL — no wrapping function, just the inner
  expression

#### `let-binding-propagation` ✅

- **run:** pass
- **input:** filter with let-bindings referencing input parameters, used in the filter condition
  (e.g. `let x = [input foo] in vertex.properties.field == x`)
- **tests:** locals map tracks intermediate values correctly through compilation — the let-bound
  local holds an input parameter expression, which is then used in a comparison
- **verifies:** let-bound values propagate correctly through the local → expression mapping,
  input parameter deduplication still works across let-bindings

### Tests — relationship / edge entity fields

#### `left-entity-filter` ⏭ 📸

- **run:** skip
- **skip reason:** `link_data` is `Option<LinkData>`; accessing fields through Option requires
  unwrap/pattern-match not yet expressible in filter J-Expr
- **input:** filter on `vertex.link_data.left_entity_id.entity_uuid == [input id]`
- **tests:** `EntityPath::LeftEntityUuid` → LEFT OUTER JOIN on `entity_has_left_entity`,
  correct column reference
- **verifies:** edge/relationship fields trigger the correct join type (LEFT OUTER, not INNER)
- **covered by:** Tier 3 `left_entity_filter` snapshot test

### Tests — multi-source "kitchen sink"

#### `mixed-sources-filter` ✅

- **run:** pass
- **input:** two-filter pipeline: first checks `vertex.metadata.archived == false` (editions
  join + primitive), second checks `vertex.entity_uuid == env_uuid` (env capture via
  `if true then ...` anti-inlining wrapper)
- **tests:** exercises multiple parameter categories simultaneously: `TemporalAxis` (always
  present), `Env` (captured variable); also exercises entity_editions join (archived),
  two continuation laterals, two WHERE conditions
- **verifies:** parameter categories coexist, multiple join types in one query, correct
  WHERE composition (temporal + continuation filters)

### Tests — join planning (provides-driven SELECT)

#### `minimal-select-no-extra-joins` ✅

- **run:** pass
- **input:** filter that only accesses temporal metadata fields (web_id, entity_uuid)
- **tests:** only base table (`entity_temporal_metadata`) in FROM, no unnecessary joins
- **verifies:** lazy join planning: unused tables are not joined

#### `properties-triggers-editions-join` ⏭ 📸

- **run:** skip
- **skip reason:** `vertex.properties` is generic `T` and requires a concrete entity type;
  same fundamental limitation as `property-field-equality`. The editions join IS tested
  indirectly by `entity-archived-check` which accesses `EntityPath::Archived`.
- **input:** filter accessing `vertex.properties`
- **tests:** `entity_editions` JOIN appears in FROM clause
- **verifies:** `EntityPath::Properties` correctly triggers the editions join
- **covered by:** Tier 3 `property_field_equality` snapshot test (editions join visible in
  the `entity_editions_0_0_1` table alias)

#### `entity-type-ids-lateral` ✅

- **run:** pass
- **input:** query that requires entity type IDs in output
- **tests:** LEFT JOIN LATERAL subquery for `entity_is_of_type_ids` with unnest + jsonb_agg
- **verifies:** computed column via lateral join, correct correlation condition on edition_id

### Tests — query structure

Note: temporal conditions (`&&` overlap on transaction_time and decision_time) are unconditional
— they appear in every compiled query. Rather than a standalone test, verify their presence in
the baseline `constant-true-filter` snapshot and spot-check in others.

#### `property-mask` ❌ 📸

- **run:** pass (requires suite directive to inject mask, since mask comes from permission
  system, not the query)
- **input:** query where `Properties` and `PropertyMetadata` are in the provides set (i.e.
  they appear in SELECT because the interpreter needs them back, not just because the filter
  references them)
- **suite directive:** `property_mask = true` (or similar) to inject a mask expression
- **tests:** `properties` and `property_metadata` SELECT expressions wrapped as `(col - mask)`,
  other JSON expressions (e.g. `RecordId`'s `jsonb_build_object`) are NOT masked
- **verifies:** property mask applies only to property columns in the SELECT list, not to
  filter-internal property references
- **covered by:** Tier 3 `property_mask` snapshot test (calls `with_property_mask()` directly)

#### `multiple-filters` ✅

- **run:** pass
- **input:** graph read with two separate filter bodies
- **tests:** two CROSS JOIN LATERAL subqueries in FROM, each with OFFSET 0, two continuation
  aliases (names start with `continuation_`), WHERE includes both `IS NOT FALSE` conditions,
  SELECT decomposes both continuations with `*_block`, `*_locals`, `*_values` columns
- **verifies:** multi-filter compilation, correct SELECT column decomposition for both;
  assert alias patterns rather than specific numeric ids

### Non-goal: error diagnostics via compiletest

All postgres diagnostics are `Severity::Bug` — they represent internal invariant violations
(closures, nested graph reads, function pointers, etc. placed into a Postgres island). The
placement pass would never produce these MIR shapes, so there is no valid J-Expr input that
triggers them through the full pipeline. These are tested as unit tests in Tier 2 (`error.rs`)
and optionally via hand-crafted MIR in Tier 3.

---

## Tier 2: Unit Tests

Standard `#[cfg(test)] mod tests` in the source files. Tests that would be tautological
(restating match arms, asserting structural constants) were dropped.

### `parameters.rs` — deduplication ✅ (6 tests)

Tests parameter deduplication and category isolation: same input → same index, different
inputs → different indices, cross-category isolation (`Input("x")` vs `Symbol("x")`),
temporal axis stability, and env field dedup.

### `continuation.rs` — naming ✅ (2 tests)

Tests continuation alias naming and field identifier construction.

### `traverse.rs`, `projections.rs`, `error.rs` ⏭

Dropped — the entity path → SQL column mapping, lazy join planning, and diagnostic
constructors are exercised transitively through the Tier 1 compiletest suite and Tier 3
snapshot tests with sufficient coverage. Standalone unit tests for these would either restate
match arms (traverse), assert structural constants (continuation column names), or test
unreachable error paths (diagnostics).

---

## Tier 3: MIR Builder Snapshot Tests

Programmatic MIR via `body!` macro, compiled through the real execution analysis pipeline.
These test MIR constructs that exist in the compiler but cannot yet be produced from J-Expr —
either because the HIR specialization phase doesn't support the intrinsic (e.g. arithmetic,
unary NOT) or because the type system can't resolve the access yet (e.g. property field
subscripts on generic entity types).

Test location: `eval/src/postgres/filter/tests.rs`
Snapshots: `eval/tests/ui/postgres/filter/`

### Shared test harness

A `Fixture` struct that:

1. Takes a `body!`-constructed MIR body with `Source::GraphReadFilter`
2. Runs `SizeEstimationAnalysis` + `ExecutionAnalysis::run_all_in` (the public API) to
   compute island boundaries via the real solver
3. Stores bodies and execution residuals for compilation

Two compile helpers:

- `compile_filter_islands()` — compiles each Postgres exec island via
  `GraphReadFilterCompiler::compile_body()`, returns per-island SQL expressions
- `compile_full_query()` — synthesizes a `GraphRead` and calls
  `PostgresCompiler::compile()`, returns full SELECT + parameters

**Island boundary control:** the solver decides placement based on cost. To force a
Postgres→Interpreter boundary, bb0 must accumulate enough transfer cost to exceed the P→I
switch cost (8). Use heavy entity path loads (properties, composites like RecordId,
TemporalVersioning) in bb0, and an `apply` in bb1 to force Interpreter. Lightweight paths
(single UUIDs) are insufficient because block splitting fragments the body.

### Tests — data islands & provides integration

#### `data_island_provides_without_lateral` ✅

- **body:** island graph where a non-Postgres island requires Postgres-origin traversal paths,
  causing the resolver to insert a Postgres `IslandKind::Data` island
- **tests:** the data island contributes output columns to `provides` (so they appear in the
  SELECT list with correct joins) but does NOT generate a continuation LATERAL subquery
- **verifies:** `compile_graph_read_filter_island()` returns `None` for data islands,
  `provides.insert(island.provides())` still runs, no spurious CROSS JOIN LATERAL

#### `provides_drives_select_and_joins` ✅

- **body:** entity path loads (EntityUuid, Archived) in bb0, apply in bb1 forces Interpreter;
  uses `compile_full_query()` to exercise the full `PostgresCompiler::compile()` path
- **tests:** SELECT list includes provided paths with correct joins, continuation LATERAL
  appears, parameter summary shows temporal axes and symbols
- **verifies:** end-to-end provides → traverse → projections → build_from integration

### Tests — control flow edge cases

#### `island_exit_goto` ✅

- **body:** heavy entity path loads (properties, composites) in bb0, apply in bb1
- **tests:** `Goto` crossing island boundary → `Continuation::IslandExit`
- **verifies:** continuation has correct `block` id, `locals` array, `values` array, all
  cast to `::continuation`

#### `island_exit_with_live_out` ✅

- **body:** heavy entity path loads + input in bb0, apply in bb1; input is live-out
- **tests:** island exit captures both block parameters AND remaining live-out locals
- **verifies:** `locals` array contains block param ids first, then live-out local ids;
  `values` array has corresponding expressions in same order

#### `island_exit_switch_int` ✅

- **body:** heavy entity path loads + SwitchInt in bb0; bb1 returns, bb2 has apply
- **tests:** one CASE branch produces a `Return` continuation, the other produces an
  `IslandExit` continuation
- **verifies:** mixed continuation types within a single CASE tree — one branch has
  `(filter, NULL, NULL, NULL)`, the other has `(NULL, block, locals[], values[])`

#### `diamond_cfg_merge` ✅

- **body:** bb0 branches (SwitchInt on input) to bb1 and bb2, both goto bb3 which returns;
  all blocks in Postgres island
- **tests:** diamond CFG entirely within one island — both branches converge
- **verifies:** CASE with two branches, locals snapshot/rollback works correctly across
  the diamond (bb1's local changes don't leak into bb2's compilation)

#### `switch_int_many_branches` ✅

- **body:** SwitchInt on input with 4 value targets + otherwise
- **tests:** multi-way branch → CASE with 4 WHEN clauses + ELSE
- **verifies:** correct number of WHEN clauses in correct order, otherwise maps to ELSE

#### `straight_line_goto_chain` ✅

- **body:** bb0 → bb1 → bb2 → return, all within Postgres island, with block parameters
  passed at each goto via inputs
- **tests:** goto fast-path (no snapshot/rollback needed for linear chains), block parameter
  assignment at each step
- **verifies:** gotos within island are followed directly without CASE, locals accumulate
  correctly through the chain

#### `island_exit_empty_arrays` ✅

- **body:** heavy entity path loads in bb0, apply in bb1; no locals from bb0 used by bb1
- **tests:** continuation with empty `locals` and `values` arrays
- **verifies:** `ARRAY[]::int[]` and `ARRAY[]::jsonb[]` transpile correctly (edge case for
  empty array literals with type cast)

### Tests — projection kinds

#### `field_index_projection` ✅

- **body:** tuple aggregate followed by `.0` numeric field projection
- **tests:** `ProjectionKind::Field(FieldIndex)` → `json_extract_path(base, (0)::text)`
- **verifies:** numeric field indices are cast to `::text` for json_extract_path

#### `dynamic_index_projection` ✅

- **body:** list with Index projection where the key comes from an input (uses fluent builder
  since `body!` doesn't support `ProjectionKind::Index`)
- **tests:** `ProjectionKind::Index(local)` → `json_extract_path(base, (local_expr)::text)`
- **verifies:** dynamic index expression is grouped and cast to `::text`, not confused with
  static field names

#### `field_by_name_projection` ✅

- **body:** struct field access using `ProjectionKind::FieldByName(symbol)`
- **tests:** symbol allocated as parameter, cast to `::text` for json_extract_path
- **verifies:** named field access uses `db.parameters.symbol()` and correct text cast

### Tests — operator coverage

These ensure all operator branches produce correct SQL with correct casts.

**Priority:** these are the primary path for testing arithmetic and unary operators, since the
HIR specialization phase does not yet support `::core::math::*` (H-4728) or
`::core::bool::not` (H-4729) intrinsics. The Tier 1 compiletest tests for these operators are
skipped until the HIR catches up.

#### `unary_neg` ✅

- **body:** `UnOp::Neg` applied to an input local
- **tests:** `UnaryOperator::Negate` in SQL output
- **verifies:** negation operator emits correctly

#### `unary_not` ✅

- **body:** `UnOp::Not` applied to an input local
- **tests:** `UnaryOperator::Not` in SQL output
- **verifies:** logical NOT emits correctly

#### `unary_bitnot` ✅

- **body:** `UnOp::BitNot` applied to a local
- **tests:** `UnaryOperator::BitwiseNot` in SQL output
- **verifies:** bitwise NOT emits correctly

#### `binary_sub_numeric_cast` ✅

- **body:** `BinOp::Sub` on two input locals
- **tests:** `BinaryOperator::Subtract` with `::numeric` casts on both operands
- **verifies:** subtraction uses same cast logic as addition

#### `binary_bitand_bigint_cast` ✅

- **body:** `BinOp::BitAnd` on two input locals
- **tests:** `BinaryOperator::BitwiseAnd` with `::bigint` casts on both operands
- **verifies:** bitwise ops use `bigint` cast (not `numeric`)

### Tests — error diagnostics ⏭

All postgres diagnostics are `Severity::Bug` — internal invariant violations (closures, nested
graph reads, function pointers, etc. placed into a Postgres island). The public API
(`ExecutionAnalysis`) prevents invalid MIR from reaching the compiler: the placement solver
never assigns `Apply`, `Closure`, `FnPtr`, `GraphRead`, or projected assignments to Postgres
islands. These code paths are unreachable by construction, so testing them would require
bypassing the public API to hand-construct invalid island contents — which tests the test
harness, not the compiler.

---

## Remaining Work

1. **Tier 1 blocked on HIR:** `arithmetic-addition-casts` (H-4728). All other blocked Tier 1
   tests (`property-field-equality`, `nested-property-access`, `properties-triggers-editions-join`,
   `logical-not-input`, `left-entity-filter`, `property-mask`) are now covered by snapshot tests.
