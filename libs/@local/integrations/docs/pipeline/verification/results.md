# Verification of unrun statements

- Date: 13 November 2026.
- Branch: `pe/be-1137-add-state-version-and-work-manifest-records`, uncommitted state of 13 November 2026.
- Toolchain: `rustc 1.101.0-nightly (c36f14571 2026-10-01)`, `cargo 1.101.0-nightly (f3865b2a4 2026-09-29)`, real binaries in `~/.cargo/bin`, debug profile.
- DuckDB: `SELECT version()` through `Workspace::query` returns `v2.0.0`. The `duckdb` crate is `1.20000.1`; arrow and parquet crates are `60.0.0`.
- Graph: local compose Postgres, database `graph_test`, user `postgres`. The dev database `graph` was not touched; the test asserts `HASH_GRAPH_PG_DATABASE=graph_test` before it seeds.

Test sources:

- `part-a-duckdb.rs.txt`: copy it to `libs/@local/integrations/engine/tests/zz_verify_specs.rs` and run
  `VERIFY_OUT=<dir> PATH="$HOME/.cargo/bin:$PATH" ~/.cargo/bin/cargo test --package hash-integrations-engine --test zz_verify_specs -- --nocapture --test-threads=1`.
- `part-b-graph.rs.txt`: copy it to `tests/graph/integration/postgres/zz_verify_resend.rs`, add `mod zz_verify_resend;` to `tests/graph/integration/postgres/lib.rs`, and run
  `HASH_GRAPH_PG_DATABASE=graph_test HASH_GRAPH_PG_USER=postgres HASH_GRAPH_PG_PASSWORD=postgres PATH="$HOME/.cargo/bin:$PATH" ~/.cargo/bin/cargo-nextest nextest run --package hash-graph-integration --all-features --no-capture zz_verify_resend`.

Both files were removed from the source tree after the runs.

Totals: 24 statements hold, 3 do not hold, 0 not run.

## Part A: DuckDB and the workspace

All statements ran through the engine's own `Workspace`, so every SQL text passed `Select::check` (`engine/src/workspace/select.rs`).

| Statement | Result | Evidence | Change needed |
| --- | --- | --- | --- |
| A1a. A table made with `create_table` has a `rowid` that is unique per row. | holds | 300,000 rows from `range`: `count, count(DISTINCT rowid), min, max` = `300000\|300000\|0\|299999`. | None. |
| A1b. The `rowid` stays the same across queries while the table is not replaced. | holds | `SELECT rowid, id … ORDER BY rowid` before and after creating another table and running another query: `mapping equal across queries: true`. | None. |
| A1c. `SELECT rowid, col FROM t WHERE rowid >= a AND rowid < b ORDER BY rowid` reads a range; `row_keys` and `read_range` give the variants the spec reads. | holds | Five ranges of 65,536 read 300,000 rows. `row_keys` returns `[BigInt(300000), BigInt(0), BigInt(299999)]`; `read_range` returns `[BigInt(0), Text("v0")]`. A4 repeats this on a hashed table of 150,000 rows. | None. |
| A1d. A source column named `rowid`. | holds (it hides `rowid`) | `create_table` with `VALUES (7,'x'),(9,'y') AS v(rowid, col)` succeeds. `SELECT rowid …` returns the column values `7`, `9`; `SELECT *` returns `rowid` as a column; the range query `rowid >= 0 AND rowid < 2` returns no row. `SELECT source.*, md5('') …` over that table also succeeds. A table without such a column returns only its own columns for `SELECT *`. | None. The spec's `check_reserved` for `rowid` is required: without it the range queries would read the column, not the row key. |
| A2. `UNION ALL` passes the `SELECT` check and runs. | holds | `query("SELECT 1 AS a UNION ALL SELECT 2 AS a")` returns 2 rows; `create_table` with three parts returns `Ok(())` and rows `1, 2, 3`. | None. |
| A3. Every SQL statement of `stage-2-diff.md` passes the check and runs; fixture F gives the listed labels and hash table. | holds | `empty_sql` (three forms), `resend_sql`, `carried_sql`, `union_sql`, `DUPLICATES_SQL`, `label_sql` with `protected_sql`, `TOTALS_SQL`, `HASHES_SQL`, `ARCHIVES_SQL`, the `store_issues` SQL, `key_column` and both `changes_sql` examples all ran. `labels_every_line`, `labels_when_resending_everything`, `labels_without_protection`, `labels_without_base`, `labels_without_rows`: `MATCH` each. `totals_of_fixture`: `MATCH`. The `hashes` file, captured and loaded back: `MATCH` with the first six columns of `labels_every_line`. `archives`: `e08, e10, e12, e13` in that order. `resend_sql`: `a, b, c, d, x`. `carried_sql`: `a\|h0a`, `b\|h1b` (the later run wins), `d\|h1d`; `c` (in base) and `z` (not in writes) are left out. Duplicates: `e1\|2\|entity/a\|entity/b\|2`, `e2\|3\|entity/a\|entity/a\|2`; the capped case returns 5 rows with `duplicates` 7. Value variants are those the spec destructures: `Text`, `Boolean`, `UBigInt`. `key_column` returns `UBigInt(1)`. `changes` files have the columns `_row, _entity_id, _change, _source_id, _key, FIELD_NAME` (entity) and `… _left_entity_id, _right_entity_id` (link), with `_row` as `UBigInt(0)` after load. | None. |
| A4. The SQL of `assign_ids` (row keys, ranges, `final_select`), `missing_select` and `issues_table` passes and runs. | holds | Hashed table of 150,000 rows, 150 without an ID. Ranges read 150,000 rows. The ID file written with arrow/parquet (`_row` UInt64, IDs Utf8) loads as `_row:UBIGINT, _entity_id:VARCHAR, _source_id:VARCHAR`. `final_select` gives `149850` rows with `0` mismatches between `TAIL` and `_source_id`; columns `_key, TAIL, _content_hash, _entity_id, _source_id`. `issues_table` alone: 0 rows, seven `VARCHAR` columns. With both `missing_select` forms: `entity\|sink-aircraft\|missing_id\|150` and `link\|joined\|missing_endpoint\|1`. The `issues` store query captures 151 rows. | None. |
| A5. The content hash of `fallback-hash.json` equals the five recorded struct hashes. | holds | Staged with `stage_table`, sink prepared with `prepare_pipeline` (so the engine's `hash_expression` ran). All five `MATCH`: `9527f1d3…`, `e8bca8a3…`, `b9bf8f67…`, `0a5f9546…`, `f3594de3…`. Struct texts are as the spec lists, for example `{'p0': 2026-01-02, 'p1': 'NULL', 'p2': 0.1}`. The labs `canonicalSql` run as raw SQL gives the same five. DuckDB is `v2.0.0`. | Optional: `stage-2-rows.md` 7.2 names the crate version `1.20000.1`; it may add that the bundled DuckDB reports `v2.0.0`. |
| A6a. `Workspace::capture` of the same query twice gives byte-identical files. | holds | 200,000 rows, 5 columns: both captures `0c5cd3e2…cf5e9`; a capture of the same rows in a second, new workspace has the same sha256. | None. |
| A6b. A `RowFile`-style writer (Snappy, row groups of 65,536, no extra metadata; Utf8 with nulls, UInt64, Boolean) gives byte-identical files. | holds | 140,000 rows in batches of 1,024, twice: both `d5fb3d5f…c3bfb`; 3 row groups. Two empty files are identical too (0 row groups). Footer: `created_by "parquet-rs version 60.0.0"`, key-value metadata only `ARROW:schema` (written by `ArrowWriter` by default). No writer property puts a time or other varying value into the file. Loaded back the columns are `VARCHAR, UBIGINT, BOOLEAN`. | None. |
| A7a. Round trip through `capture` and `load_capture` for VARCHAR, BIGINT, DECIMAL(18,2), DOUBLE, BOOLEAN, DATE, TIMESTAMP, TIMESTAMPTZ, each with a NULL row. | holds | Types unchanged. Arrow types: `Utf8`, `Int64`, `Decimal128(18, 2)`, `Float64`, `Boolean`, `Date32`, `Timestamp(Microsecond, None)`, `Timestamp(Microsecond, Some("UTC"))`. `Workspace::query` variants, before and after: `Text`, `BigInt`, `Decimal`, `Double`, `Boolean`, `Date32`, `Timestamp(Microsecond, …)` for both TIMESTAMP and TIMESTAMPTZ, and `Null` for the NULL row. Both rows compare equal after the round trip. | None. Note: `Value` does not tell TIMESTAMP from TIMESTAMPTZ; both arrive as `Timestamp(Microsecond, …)`. |
| A7b. HUGEINT round trip. | does not hold | The type changes from `HUGEINT` to `DECIMAL(38,0)` (Arrow `Decimal128(38, 0)`); `Workspace::query` gives `HugeInt(…)` before and `Decimal(Decimal { width: 38, scale: 0, … })` after. A value with 39 digits (`170141183460469231731687303715884105727` and the minimum) is captured, and then `load_capture` fails: `invalid Arrow decimal value at row 0: decimal value has 39 digits, exceeding width 38`. `99999999999999999999999999999999999999` (38 digits) round-trips. | `stage-3-plan.md`, section "P9: rows come from the `changes` files", step 2: state that a HUGEINT column arrives as `DECIMAL(38,0)` and `Value::Decimal`, and that a value of 39 digits makes `load_table` fail. Either `changes_sql` (`stage-2-diff.md`, `changes_sql`) casts HUGEINT and UHUGEINT columns, for example to `VARCHAR` or `DECIMAL(38,0)` with a check, or step 3 of `stage-2-rows.md` refuses such columns. The contract "Tables as files" in `01-contracts.md` should name the rule. |
| A8. The entity ID can be computed in plain DuckDB SQL through the workspace. | holds | `sha1` accepts a BLOB: `sha1(from_hex('00ff'))` returns hex text; `from_hex(…) \|\| encode('a')` is a `BLOB`. The expression below passes the `SELECT` check and matches all 8 vectors of `entity-ids-typescript.json` and 5 more names checked against `derive_entity_id` (non-ASCII namespace and ID, `::` as ID, `::` inside namespace and ID, trailing space, CJK): `matched 13 of 13`. One million rows through `create_table`: 3.27 s; `derive_entity_id` in Rust for one million: 2.41 s (both in a debug build; the SQL value of row 999,999 equals the Rust one). | None; this is a new finding for A2 of `00-overview.md` ("DuckDB has no UUID v5 function"): it can be written. The decimal and timestamp rendering argument of A2 still stands. |

The A8 expression, with `{name}` the text `"{namespace}::{entity type URL}::{source ID}"` and `h` the SHA-1 hex text (inline it, or compute `h` in a subquery):

```sql
-- h := sha1(from_hex('d6e2c7a1f84b4e3a9c0d5b7f1e3a2d4c') || encode({name}))
substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-5' || substr(h, 14, 3) || '-'
  || substr('89ab89ab89ab89ab', position(substr(h, 17, 1) IN '0123456789abcdef'), 1)
  || substr(h, 18, 3) || '-' || substr(h, 21, 12)
```

The version digit is the 13th hex digit, replaced by `5`. The 17th hex digit `d` becomes `(d & 3) | 8`, which the lookup string gives.

Two further facts checked on the way: `count(*)` arrives as `Value::BigInt`, as `stage-2-rows.md` (`row_keys`) and `stage-3-plan.md` (`open`) expect; and `information_schema.columns` finds tables whose names contain `/`.

## Part B: the Graph (store level, Postgres `graph_test`)

Entities were created with a client-chosen UUID and `read_only: false`, with property metadata holding only `dataTypeId`. Every patch below is one `Replace` at the empty path with `PropertyWithMetadata::Object`, with an edition provenance whose actor type differs from the create. "Same edition" means equal `record_id.edition_id`. Output lines come from `--no-capture`; all six tests passed.

The test data has no entity type with two optional plain text properties. B1 and B2 use `book/v/1`: `blurb` and `published-on` are the two text properties under test; `name` is a required array of text and is sent unchanged in every patch.

| Statement | Result | Evidence | Change needed |
| --- | --- | --- | --- |
| B1a. Resend of identical values, metadata with only the data type ID, gives the same edition. | holds | `B1 resend, metadata with data type ID only: SAME EDITION`. The stored metadata holds `dataTypeId`, `originalDataTypeId` and `canonical`, which the patch did not send; the comparison still finds no change. | None. |
| B1b. The same with no explicit metadata. | holds | `B1 resend, no explicit metadata: SAME EDITION`. | None. |
| B2a. One changed value gives a new edition. | holds | `B2 one value changed: NEW EDITION`. | None. |
| B2b. Leaving one property out removes it. | holds | `B2 one property left out: NEW EDITION`; `published-on removed: true`. | None. |
| B3a. Number 12.5: resend gives the same edition. | holds | `B3 12.5 resend: SAME EDITION`. | None. |
| B3b. Number 8030: resend gives the same edition. | holds | Stored as `8030.0`; `B3 8030 resend: SAME EDITION`. | None. |
| B3c. Number 9007199254740993: resend gives the same edition. | does not hold | Stored as `9007199254740992.0`; `B3 9007199254740993 resend: NEW EDITION`. Every resend writes a new edition. | `00-overview.md`, "What the review found", bullet "Numbers": replace "probably … inferred from the code" with the observed result. The stage that maps values (`stage-3-plan.md`, property issues) should either refuse integers above 2^53 in magnitude, or send them as the float the Graph stores, so that a resend compares equal. |
| B4. A property with a data type that has a conversion (centimeter, with a conversion to meter): resend gives the same edition. | holds | Stored metadata has `canonical {meter: 2.5}` for 250 cm. `B4 centimeter resend: SAME EDITION`; `B4 meter resend: SAME EDITION`. | None. |
| B5a. `archived: true` on an archived entity, no property change, gives the same edition. | holds | `B5 archived:true on an archived entity: SAME EDITION`. With an identical replace added: also `SAME EDITION`. | None. |
| B5b. `archived: false` on a live entity, no property change, gives the same edition. | holds | `B5 archived:false on a live entity: SAME EDITION`. | None. |
| B6. `archived: false` on an archived entity brings it back. | holds | `B6 archived:false on an archived entity: NEW EDITION … archived false`. | None. |
| B7. A link without properties: a replace with an empty object gives the same edition. | holds | `friend-of` link between two persons: `B7 link, replace with empty object: SAME EDITION`. | None. |
| B8a. Creating an entity whose UUID exists returns the "already exists" status. | does not hold (store level) | `create_entity` fails with `Could not create the entities: store operation failed`, caused by `ERROR: duplicate key value violates unique constraint "entity_ids_pkey"`. No `hash_status::StatusCode` is attached to the report. The REST status was not run. Reading `report_to_response` (`libs/@local/graph/api/src/rest/legacy/status.rs:97-117`) and the entity create handler, a report without a status code becomes `StatusCode::Unknown`, so the HTTP answer is probably 500, not 409. This is inferred from the code. | `00-overview.md`, "What the review found", bullet "Create with an existing ID returns 409", and the create-then-patch fallback of `stage-4-send.md` (lines 647-683, "On 409, send the patch"), which relies on it: treat a duplicate create as an unclassified failure until an HTTP test confirms the status, or attach `StatusCode::AlreadyExists` for `UNIQUE_VIOLATION` in the entity insert of `postgres-store` (as `update_web_shortname` does at `postgres-store/src/store/postgres/mod.rs:4114-4118`). |
| B8b. Patching an entity ID that does not exist returns "not found". | holds | `patch_entity` fails with `Could not update store` / `Entity does not exist`, with `StatusCode::NotFound` attached. | None. |

The store-level API expressed every statement. Nothing in Part B tested the HTTP layer, the bulk endpoints, or the read-only policy (the test entities are not read-only).
