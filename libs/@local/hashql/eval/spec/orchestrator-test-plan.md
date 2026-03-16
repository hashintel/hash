# Orchestrator Test Plan

## Progress

| ID  | Name                                    | Status | File |
| --- | --------------------------------------- | ------ | ---- |
| 1.1 | Simple entity read, no filter           | done   | `jsonc/simple-read.jsonc` |
| 1.2 | Property access                         | skip   | needs MIR builder (properties are un-narrowed `?`) |
| 1.3 | Individual metadata leaf fields         | skip   | needs MIR builder (metadata behind `List`/`Option`) |
| 1.4 | Equality filter                         | done   | `jsonc/filter-by-uuid.jsonc` |
| 1.5 | Input-driven filter                     | done   | `jsonc/filter-by-entity-id.jsonc` |
| 1.6 | Link entity read                        | done   | `jsonc/has-link-data.jsonc` |
| 1.7 | Non-link entity (null link_data)        | done   | `jsonc/null-link-data.jsonc` |
| 1.8 | Organization type                       | skip   | needs MIR builder (entity_type_ids behind `List`) |
| 1.9 | Pinned temporal axis                    | done   | `jsonc/pinned-decision-time.jsonc` |
| 1.A | Inequality filter                       | done   | `jsonc/filter-not-equal.jsonc` |
| 1.B | Let binding propagation                 | done   | `jsonc/let-binding.jsonc` |
| 1.C | Empty result set                        | done   | `jsonc/filter-false.jsonc` |
| 2.1 | Interpreter-only filter                 | todo   | programmatic |
| 2.2 | Postgres-only filter                    | todo   | programmatic |
| 2.3 | Mixed island filter (continuation)      | todo   | programmatic |
| 2.4 | Multiple sequential filters             | todo   | programmatic |
| 2.5 | Diamond CFG in filter                   | todo   | programmatic |
| 3.1 | Metadata only, no properties            | todo   | unit test (hydration) |
| 3.2 | Full metadata population                | todo   | unit test (hydration) |
| 3.3 | Composite path: RecordId                | todo   | unit test (hydration) |
| 3.4 | Composite path: TemporalVersioning      | todo   | unit test (hydration) |
| 3.5 | Draft entity (non-null draft_id)        | done   | `jsonc/draft-entity.jsonc` |
| 4.* | Decoder unit tests (23 tests)           | done   | `src/orchestrator/codec/decode/tests.rs` |
| 5.* | Encoder unit tests (16 tests)           | done   | `src/orchestrator/codec/encode/tests.rs` |

## Structure

Two test locations:

- **Integration tests** (orchestrator harness, `tests/orchestrator/`): need a
  real database, test the full path from compiled query through execution,
  hydration, filtering, and result assembly.
- **Unit tests** (`src/orchestrator/codec/`, `#[cfg(test)]`): pure in-memory,
  test the decoder and encoder with concrete inputs and hand-computed expected
  outputs.

### Boundary with existing tests

`postgres/filter/tests.rs` already covers SQL compilation output: generated SQL
text for filter islands, continuation column layout, CASE expressions, JOIN
triggers, property paths, operators, island exits. Those are snapshot tests of
the compiler's SQL output.

Orchestrator tests do not re-test SQL generation. They test what happens after
the SQL executes: row hydration, value assembly, continuation decoding, filter
evaluation against real data, and final result correctness.

## Integration tests

### 1. End-to-end reads (J-Expr, full pipeline)

Tests 1.1 through 1.9 use J-Expr source files. Tests 1.2, 1.3, 1.6, 1.7, and
1.8 need the MIR builder because they touch types behind `List`, `Option`, or
un-narrowed `?` that cannot typecheck through the HIR.

| ID  | Name | Justification |
| --- | ---- | ------------- |
| 1.1 | Simple entity read, no filter | Baseline: proves the full pipeline produces a hydrated entity list from a real database. No existing test executes a query. |
| 1.2 | Property access | Verifies `EntityPath::Properties` hydration produces a correctly typed `Value` from a real JSONB column. SQL compilation is tested elsewhere; the JSON-to-Value decode against real data is not. |
| 1.3 | Individual metadata leaf fields | Verifies leaf `EntityPath` hydration (entity_uuid, web_id, archived) from real TEXT/BOOL columns. The column types differ from the JSONB path in 1.2. |
| 1.4 | Equality filter | Verifies that a server-side WHERE clause actually filters rows. SQL shape is tested; row-level filtering against real data is not. |
| 1.5 | Input-driven filter | Verifies `Parameter::Input` encoding produces a value that PostgreSQL accepts and matches against. The parameter binding path is untested by SQL snapshot tests. |
| 1.6 | Link entity read | Verifies `PartialLinkData` hydration from real LEFT JOIN columns: entity IDs, confidence, provenance. Exercises `Optional::Value` paths that only exist for link entities. |
| 1.7 | Non-link entity (null link_data) | Verifies NULL link columns from LEFT JOIN produce `Optional::Null`, not a hydration error. The NULL handling path in `hydrate_from_postgres` (early return on `None`) is untested without real NULL data. |
| 1.8 | Organization type | Verifies entity_type_id filtering works for a different type. Would catch bugs where type ID binding is hard-coded to Person. |
| 1.9 | Pinned temporal axis | Verifies `Postgres<TemporalInterval>` wire encoding is accepted by PostgreSQL and produces correct temporal filtering. The `ToSql` impl is untested against a real database. |
| 1.A | Inequality filter | Verifies `!=` exclusion against real data. Complements 1.4. |
| 1.B | Let binding propagation | Verifies let-bound values propagate into filter bodies correctly through the full pipeline. |
| 1.C | Empty result set | Verifies the orchestrator handles zero matching rows without error. |

**1.1 Simple entity read, no filter**
Query all entities with unbounded axes and a trivial `true` filter. Output is
a list of hydrated entities with properties and metadata.

**1.2 Entity read with property access** (MIR builder)
Query accessing `entity.properties` (the name field). Verifies JSON property
decoding through the `Decoder` against real JSONB data.

**1.3 Entity read with individual metadata fields** (MIR builder)
Query accessing entity_uuid, web_id, archived as individual leaf columns.
Verifies `EntityPath` leaf hydration from real TEXT/BOOL column types.

**1.4 Entity read with equality filter**
Filter entities where `entity_uuid == alice_uuid`. Only Alice should appear.

**1.5 Entity read with input-driven filter**
Filter using a full `EntityId` struct input. Verifies the `Parameter::Input`
encoding and binding path end-to-end for composite types.

**1.6 Read returning link entities**
Filter entities where `link_data != [None]`. Returns only link entities.
Verifies `PartialLinkData` hydration including confidence values and
left/right entity IDs from real LEFT JOIN columns.

**1.7 Read of non-link entity (null link_data columns)**
Filter entities where `link_data == [None]`. Returns only non-link entities.
Verifies NULL link columns from LEFT JOIN produce `Optional::Null`, not a
hydration error.

**1.8 Read for Organization type** (MIR builder)
Query entities filtered by `entity_type_ids`. Different entity type, different
property schema. Verifies entity type ID matching against real data.

**1.9 Read with pinned temporal axis**
Query with `//@ axis[decision] = (T)` directive. Verifies temporal parameter
wire encoding against a real PostgreSQL instance.

**1.A Inequality filter**
Filter entities where `entity_uuid != alice_uuid`. Should exclude Alice and
return all other seeded entities.

**1.B Let binding propagation**
Bind `alice_uuid` via `let`, reference it in the filter. Verifies the let
desugaring produces correct MIR through the full pipeline.

**1.C Empty result set**
Filter with literal `false`. Verifies the orchestrator returns an empty list
without error.

### 2. Filter chain tests (programmatic, `body!` macro)

All filter tests use `input.load!` for discriminants so control flow survives
MIR optimization.

| ID  | Name | Justification |
| --- | ---- | ------------- |
| 2.1 | Interpreter-only filter | Exercises the `TargetId::Interpreter` loop in `process_row_filter_in` where no postgres continuation exists. The implicit `true` path (no `PostgresState` found) is only reachable at runtime. |
| 2.2 | Postgres-only filter | Verifies that server-side filtering actually excludes rows from the hydrated result set. SQL generation is tested; row exclusion against real data is not. |
| 2.3 | Mixed island filter (continuation) | Exercises `PartialPostgresState` hydration, `finish_in` decoding, and `flush` into the callstack. The entire continuation round-trip path is untested by SQL snapshot tests. |
| 2.4 | Multiple sequential filters | Verifies short-circuit AND behavior: second filter does not run on rejected rows. Composition semantics are only observable at runtime. |
| 2.5 | Diamond CFG in filter | Verifies continuation column decode when different branches carry different local sets. The CASE SQL is snapshot-tested; decoding the result back into locals is not. |

**2.1 Interpreter-only filter**
Filter body where a closure application forces `TargetId::Interpreter`. No
continuation columns. Tests the interpreter evaluation path and the implicit
`true` when no `PostgresState` is found for the body.

**2.2 Postgres-only filter**
Filter body that compiles entirely to SQL. Verifies rows passing the WHERE
clause appear in the output and rejected rows do not.

**2.3 Mixed island filter (postgres to interpreter continuation)**
Filter with postgres exec island exiting to interpreter. Verifies
`PartialPostgresState` hydration of block/locals/values, `finish_in` decoding,
and `flush` writing locals into the callstack for resumed interpretation.

**2.4 Multiple sequential filters**
Two filter bodies on the same graph read. First rejects some rows, second runs
only on survivors. Verifies short-circuit AND behavior.

**2.5 Diamond CFG in filter**
Filter with diamond control flow (branch on input, converge). Verifies
continuation decode when different branches produce different local sets.

### 3. Hydration edge cases

Tests 3.1 through 3.4 are unit tests of the hydration internals (partial struct
assembly, column decomposition, skipped field handling). They do not need a
database. Test 3.5 is an integration test (J-Expr) that verifies draft entity
hydration against real data.

| ID  | Name | Justification |
| --- | ---- | ------------- |
| 3.1 | Metadata only, no properties | Verifies `StructBuilder` correctly omits `Required::Skipped` fields. If `finish_in` mishandles skipped fields, the struct shape is wrong. |
| 3.2 | Full metadata population | Verifies complete `PartialMetadata` assembly. If any field's `finish_in` has a bug, this catches it. Complements 3.1 (partial) with the full case. |
| 3.3 | Composite path: RecordId | Verifies JSON decomposition where one column populates multiple partial fields. The decomposition logic in `hydrate_from_postgres` has no unit-level test. |
| 3.4 | Composite path: TemporalVersioning | Same decomposition pattern as 3.3 but for a different column type (tstzrange vs JSONB). |
| 3.5 | Draft entity (non-null draft_id) | Verifies the `Optional::Value` path for draft_id. All other test entities have null draft_id, so without this the `Some` path is never exercised. |

**3.1 Partial provides: metadata only** (unit test)
Construct a `StructBuilder` with only metadata fields populated, properties
as `Required::Skipped`. Call `finish_in` and assert the resulting struct omits
the skipped field.

**3.2 Full metadata population** (unit test)
Construct a complete `PartialMetadata` with all subfields populated. Call
`finish_in` and assert every nested field is present and correctly typed.

**3.3 Composite path: RecordId** (unit test)
Feed a single JSON column value through the RecordId decomposition path.
Assert it produces a `PartialRecordId` with correctly nested `PartialEntityId`
fields.

**3.4 Composite path: TemporalVersioning** (unit test)
Feed a tstzrange column value through the TemporalVersioning decomposition.
Assert it produces correctly split `decision_time` and `transaction_time`
fields.

**3.5 Draft entity** (J-Expr integration test)
Select a draft entity by UUID. Verifies `EntityPath::DraftId` produces
`Optional::Value` rather than the default `Optional::Skipped`.

## Unit tests

### 4. Decoder (`src/orchestrator/codec/decode.rs`)

Each test constructs a `Decoder` with a `Heap`, `Environment`, and `Interner`,
registers types, calls `decode` with a `JsonValueRef`, and asserts the `Value`.

| ID   | Name | Justification |
| ---- | ---- | ------------- |
| 4.1  | String primitive | Covers `PrimitiveType::String` match arm. |
| 4.2  | Integer primitive | Covers `PrimitiveType::Integer` match arm. |
| 4.3  | Float primitive | Covers `PrimitiveType::Number` match arm. |
| 4.4  | Boolean primitive | Covers `PrimitiveType::Boolean` match arm. Verifies `Int` size-aware encoding (bool, not integer). |
| 4.5  | Null primitive | Covers `PrimitiveType::Null` match arm. |
| 4.6  | Primitive type mismatch | Covers the mismatch fallthrough producing `DecodeError::TypeMismatch`. |
| 4.7  | Struct: matching fields | Covers `StructType` decode with field name matching and sorted output. |
| 4.8  | Struct: missing field | Covers `DecodeError::MissingField` path. |
| 4.9  | Struct: length mismatch | Covers `DecodeError::StructLengthMismatch` path. |
| 4.10 | Tuple: correct length | Covers `TupleType` decode. |
| 4.11 | Tuple: length mismatch | Covers `DecodeError::TupleLengthMismatch` path. |
| 4.12 | Union: first variant | Covers union try-each with first-match success. |
| 4.13 | Union: fallthrough | Covers union try-each with second-match success. |
| 4.14 | Union: no match | Covers `DecodeError::NoMatchingVariant` path. |
| 4.15 | Opaque wrapping | Covers `OpaqueType` decode: inner repr + name wrap. |
| 4.16 | List intrinsic | Covers `IntrinsicType::List` decode. |
| 4.17 | Dict intrinsic | Covers `IntrinsicType::Dict` decode. |
| 4.18 | Apply/Generic delegation | Covers `Apply`/`Generic` pass-through to base type. |
| 4.19 | Intersection error | Covers `DecodeError::IntersectionType`. |
| 4.20 | Closure error | Covers `DecodeError::ClosureType`. |
| 4.21 | Never error | Covers `DecodeError::NeverType`. |
| 4.22 | Unknown fallback | Covers `decode_unknown`: URL-key objects become structs, others become dicts, arrays become lists, numbers try int then float. |
| 4.23 | Number out of range | Covers `DecodeError::NumberOutOfRange` for overflowing f64. |

### 5. Encoder (`src/orchestrator/codec/encode.rs`)

| ID  | Name | Justification |
| --- | ---- | ------------- |
| 5.1 | Boolean serialization | Verifies `Int` with `as_bool() == Some(true)` serializes as JSON `true`, not `1`. Tests the size-aware dispatch in `Serde<&Value>`. |
| 5.2 | Integer serialization | Verifies `Value::Integer(42)` serializes as `42`. |
| 5.3 | Opaque unwrapping | Verifies `Value::Opaque` serializes as inner value. |
| 5.4 | Struct as map | Verifies `Value::Struct` serializes with field names as keys. |
| 5.5 | Tuple as array | Verifies `Value::Tuple` serializes as JSON array. |
| 5.6 | Pointer error | Verifies `Value::Pointer` produces serialization error. |
| 5.7 | Timestamp encoding | Verifies ms-since-epoch to pg-microseconds-since-2000 conversion with known values. |
| 5.8 | Temporal interval encoding | Verifies `tstzrange` wire format for included, excluded, unbounded bounds. |
| 5.9 | serialize_value | Verifies full `Value` to `Json<Box<RawValue>>` round-trip. |
