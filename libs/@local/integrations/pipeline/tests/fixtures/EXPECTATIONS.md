# Independent ingestion expectations

These files were prepared from the agreed specs before the replacement stages were implemented. No pipeline function produced their expected values. The coordinator owns this fixture set; a producer test must not replace these expectations with its current output.

The baseline is commit `feb96672c5`. The authoritative documents are `docs/pipeline/01-contracts.md`, `03-scenarios.md`, `shared-run.md`, and the stage specs beside them. The workflow requires one shared S1–S9 suite and independently executable checkpoint fixtures on fresh scratch.

## Files and origins

| File | Origin and use |
| --- | --- |
| `aviation.yaml` | Exact copy of the agreed `definition/examples/aviation.yaml` (D0). |
| `source-rows.json` | D0's literal source rows, source column order, and capture time from the scenarios' Fixture section. These are pre-staging rows: no `_op` or `_key`. |
| `entity-ids.json` | All thirteen literal UUIDs from the scenarios' Entities table; full entity IDs and link source IDs are expanded from its documented web/type/source strings. No production UUID routine was used. |
| `schemas.json` | Logical checkpoint schemas from the contracts and stage-2-diff's C1 fixture. `nullable` expresses whether the contract permits a null value. It is not an assertion about the Arrow field's physical nullable flag, which SQL exports may conservatively set even for non-null values. |
| `s1-checkpoints.json` | S1's capture/diff/plan/send/current expectations. Row arrays follow their named schema. The request cells contain exact compact JSON, not placeholders. |
| `requests.json` | Exact request bodies expanded from stage-3-plan's Test Notation and property tables. Includes all scenario entity identities and separate changed/blank-property variants. |
| `rejected-rows.json` | The two S6 run-1 rejection rows, including the null HTTP status for `endpoint_rejected`; also an empty schema-preserving fixture. A successful send marker uses a null reference, not an empty rejection artifact. |
| `scenarios.json` | Independently enumerated S1–S9 requests, definition variants, ordered writes/batches, hash relationships, send counts, current-state outcomes, and selected Graph observations. |
| `entity-ids-typescript.json` | Exact copy of the existing engine fixture containing eight independently supplied UUID vectors. Its empty-string vector tests the primitive derivation only; stage 2 must reject a blank row ID. |
| `fallback-hash.json` | Exact copy of labs `pocs/integrations_rs/tests/golden/fallback-hash.json` at `40a8d14`. Only `canonicalSql`/`canonicalRows` are the new pipeline's hash vectors; the older whole-row `fallbackRows` remain provenance, not requirements. |

The original engine regression assets already in this directory have their own `README.md` and remain unchanged.

## Constructing and comparing checkpoints

Build Parquet files deterministically from these literal schemas/rows, publish them through the shared fixture harness, and substitute the resulting references into output structs. Every consumer fixture must be constructible without calling its producer stage. Check decoded column names/types, ordered values, null handling, and exact request strings. Do not assert Parquet bytes, file sizes, or cross-attempt artifact hashes. Marker reuse separately asserts the exact winning references.

The non-link `content_hash` cells in `s1-checkpoints.json` are deliberately opaque **consumer seed hashes** (`111…`, `222…`, `333…`, `444…`). The specs require scenario comparisons by hash equality/change, not literal aircraft/airfield digest values. Producer tests must use `producer_hash_checks` and scenario relationships rather than comparing those seed cells. Both links' empty-property hash `d41d8cd98f00b204e9800998ecf8427e` is fixed by the documented `md5('')` rule. `fallback-hash.json` supplies the separate literal hash-conformance vectors. A fixture loader should preserve the seed values when constructing consumer input.

The canonical aircraft changes schema is `_row`, `_entity_id`, `_change`, `_source_id`, `_key`, `EMPTY_MASS`, `MASS_UNIT`, `FIRST_FLIGHT`, `MODEL`. Stage-2-rows' `TargetRows::columns` table and stage-2-diff's C1 table both specify that property traversal order. Stage-3-plan also describes a differently ordered hand-built consumer fixture; that tests named-column access and does not override the producer order.

`requests.json` is a body catalog at the fixed first capture time. JSON object keys are sorted recursively in byte order, whitespace is absent, numbers include the specified floating-point rendering (`8030.0`, `69000.0`), and loadedAt uses the Graph provenance representation `2026-11-06T12:00:00.000000000Z`. The capture marker itself uses `2026-11-06T12:00:00Z`. The spec independently fixes AC-SEXXX's create/patch lengths at **782/797 UTF-8 bytes**; both bodies meet those counts. Every patch replaces the whole object at `path: []`, including empty-property links. Property metadata has only `dataTypeId`; load time appears only in edition provenance.

The body shapes also agree with the reference planner snapshot at `c47a17eed3:libs/@local/integrations/engine/src/graph/plan/snapshots/hash_integrations_engine__graph__plan__tests__plan_aviation.snap`, after applying the agreed whole-object replacement and scenario values. That older snapshot's different web and SE-XXX flight date are not copied into these scenario fixtures. Labs' old add patches are likewise not the expected patch format.

## Scenario manifest conventions

Scenario runs are isolated from other scenarios. Every run numbered 1 starts from empty storage. Run numbers in the manifest are symbolic; the harness maps them to its fixed run UUIDs. `capture_run` identifies the capture timestamp, computed from the fixed first time plus one hour per later run. Restore and reconcile retain the adopted run's timestamp. Their source-read count is zero.

Each write group is `[operation, change, batch, entities]`. Expand its entities in the listed order, then assign consecutive `seq` values across groups. These lists and batch numbers were transcribed from the scenario tables rather than sorted from implementation output. Names resolve through `entity-ids.json`; S4 explicitly overrides the renamed target. Unlisted send counts are zero. Persisted `PlanOutput::counts` always includes all four operation keys, including zero values, as required by the stage-3 type contract. A rejected row can still leave the desired hash row live and the run committed.

Definition variants describe literal source rows or specific mapping edits to D0. An empty source must retain D0's column types by adding `WHERE false`, rather than constructing a zero-column table. For body assertions in later runs, substitute the scenario capture time in the catalog's provenance and apply only that run's explicitly listed property/mapping changes. S8 run 3 and S9 run 2 deliberately use run 1's original values.

S8 run 2's three batches follow the contract's operation/first-request order: create the new airfield, patch the aircraft, then archive the old airfield. S9 run 4's four batches separate entity upserts, link upserts, link archives, and entity archives. Both are consequences of the agreed batch rule, even though the scenario prose does not print their full writes tables.

These expectations do not claim runtime verification. Independent review checks their provenance and consistency; milestone tests must separately exercise production behavior and the required real storage/Graph services.
