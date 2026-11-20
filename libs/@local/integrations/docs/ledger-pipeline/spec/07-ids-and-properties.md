# Milestone 7: Ids and properties

## What it adds

Two modules of Prepare in `libs/@local/integrations/ledger`: `stage/prepare/entity_id.rs`, which derives the id of an entity and of a link from a source record, and `stage/prepare/property/`, which turns the column values of a row into properties. Nothing is looked up. The same record gives the same id in every run.

```text
Prepare (8), changes.rs
   ├── row.text(column)        ──► source id ──► derive_entity_id, derive_link_id ──► EntityId
   └── row.resolve(properties) ──► PropertyObjectWithMetadata, and the values that failed
```

Almost all of it is `engine` code that moves unchanged. The one piece of new shape is `derive_link_id`, the id rule of `LinkUpsert::new` as a function of its own.

**Decided in:** `../plan.md`, step 2, "Prepare"; `../background/flow-map.md`, sections 4 and 5.

## Size

|           | Lines   |                                                                          |
| --------- | ------- | ------------------------------------------------------------------------ |
| Moved     | 681     | `entity_id.rs`, `property/` with its three files, `LinkEndpoint`         |
| Adapted   | 20      | `derive_link_id`, taken out of `LinkUpsert::new`                         |
| New       | 4       | `mod` lines in `stage/prepare/mod.rs`, `extern crate alloc;` in `lib.rs` |
| **Total** | **705** | **reused 99%**                                                           |

The plan has 705 (675 moved, 30 adapted). `LinkEndpoint` moves as it is, so it counts as moved, and the function is smaller than estimated.

## Interface

`contracts.md`, "Ids and properties", with `pub(crate)` for `pub` (see Open points):

```rust
// stage/prepare/entity_id.rs
pub(crate) fn derive_entity_id(web_id: WebId, namespace: &str, entity_type: &VersionedUrl, source_id: &str) -> EntityId;
pub(crate) fn derive_link_id(web_id: WebId, namespace: &str, link_type: &VersionedUrl, left: LinkEndpoint<'_>, right: LinkEndpoint<'_>) -> EntityId;
pub(crate) struct LinkEndpoint<'a> { pub(crate) entity_type: &'a VersionedUrl, pub(crate) source_id: &'a str }

// stage/prepare/property/mod.rs
pub(crate) struct SinkColumns(HashMap<Box<str>, usize>);      // FromIterator<S: AsRef<str>>
impl<'a> SinkRow<'a> { pub(crate) const fn new(columns: &'a SinkColumns, values: &'a [Value]) -> Self; }
impl SinkRow<'_> {
    pub(crate) fn text(&self, column: &ColumnName) -> Option<String>;
    pub(crate) fn resolve(&self, properties: &Properties, unit_maps: &BTreeMap<UnitMapName, UnitMap>) -> ResolvedProperties;
}
pub(crate) struct ResolvedProperties { pub(crate) properties: PropertyObjectWithMetadata, pub(crate) failures: Vec<ConversionFailure> }
pub(crate) struct ConversionFailure { pub(crate) property: VersionedUrl, pub(crate) value: Option<String>, pub(crate) reason: FailureReason }
pub(crate) enum FailureReason { Coercion(Coercion), MeasureAmount, MeasureUnit, Unsupported(UnsupportedValue) }
```

- **Fact:** every signature of the contracts block matches `engine`: `derive_entity_id` (`entity_id.rs:12-17`), `LinkEndpoint` (`graph/mod.rs:68-71`), `SinkColumns` with `FromIterator` (`graph/property/mod.rs:41-54`), `SinkRow::new` (`:66`), `text` (`:116`), `resolve` (`:74-78`), `ResolvedProperties` (`:211-216`). Only the visibility differs: `text` is `pub(in crate::graph)` there, the rest `pub`.
  `ConversionFailure` and `FailureReason` are in `contracts.md`. Milestone 8 turns them into issues.

## Pseudo code

**`derive_entity_id`** (moved): a UUID v5 of `{namespace}::{entity type}::{source id}` under a fixed namespace UUID, live (no draft id). `entity_id.rs:8-24`.

**`derive_link_id`** (adapted, 20 lines), in `entity_id.rs` beside `derive_entity_id`:

```rust
/// The id of the link of `link_type` from `left` to `right`.
/// The same pair linked the other way round is a different link.
#[must_use]
pub(crate) fn derive_link_id(web_id, namespace, link_type: &VersionedUrl, left, right) -> EntityId {
    let link_source_id = format!(
        "{}::{}::{}::{}",
        left.entity_type, left.source_id, right.entity_type, right.source_id
    );
    derive_entity_id(web_id, namespace, link_type, &link_source_id)
}
```

This is `graph/mod.rs:100-105`. `LinkUpsert::new` took the link type by value, because it kept it. The function borrows it, as the contracts page has it. The ids of the two ends (`:106-112`) are not part of it: milestone 8 calls `derive_entity_id` for each end.

**`SinkRow::text`, `SinkRow::resolve`, the conversions** (moved): `graph/property/mod.rs`, `coerce.rs`, `value.rs`. A blank value is left out. A value that cannot be converted is left out and returned as a `ConversionFailure`. `text` returns the value untrimmed, because it identifies a record.

## Source table

`engine/` is `libs/@local/integrations/engine/src/` on `pe/ledger-pipeline-planning`. Lines without tests.

| New file                           | Item                                                                                                                             | Comes from                                           | Kind    | Lines |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- | ----- |
| `stage/prepare/entity_id.rs`       | `NAMESPACE`, `derive_entity_id`                                                                                                  | `engine/entity_id.rs:1-24` (24)                      | moved   | 24    |
| `stage/prepare/entity_id.rs`       | `LinkEndpoint`                                                                                                                   | `engine/graph/mod.rs:66-71` (6)                      | moved   | 6     |
| `stage/prepare/entity_id.rs`       | `derive_link_id`                                                                                                                 | `engine/graph/mod.rs:85-117`, `LinkUpsert::new` (33) | adapted | 20    |
| `stage/prepare/property/mod.rs`    | `SinkColumns`, `SinkRow`, `FailureReason`, `ConversionFailure`, `ResolvedProperties`, `ResolvedValue`, `Unconverted`, `is_blank` | `engine/graph/property/mod.rs:1-272` (270)           | moved   | 270   |
| `stage/prepare/property/coerce.rs` | `apply`, `number` and the date, time and number parsers                                                                          | `engine/graph/property/coerce.rs:1-162` (162)        | moved   | 162   |
| `stage/prepare/property/value.rs`  | `UnsupportedValue`, `ColumnValue`, `text`, `as_number`, `finite`, `clock`                                                        | `engine/graph/property/value.rs:1-219` (219)         | moved   | 219   |
| `stage/prepare/mod.rs`             | `mod entity_id;`, `mod property;`                                                                                                | none                                                 | new     | 3     |
| `lib.rs`                           | `extern crate alloc;` (`property/mod.rs:17` uses `alloc::collections::BTreeMap`)                                                 | `engine/lib.rs:17`                                   | new     | 1     |

Moved 681, adapted 20, new 4: 705 lines.

**What changes in the moved files.** Paths and visibility only:

- `entity_id.rs:12`: `pub fn` becomes `pub(crate) fn`. Its imports already cover `derive_link_id`. `LinkEndpoint` and its fields become `pub(crate)`.
- `property/mod.rs`: `pub` becomes `pub(crate)` at `:34`, `:41`, `:58`, `:66`, `:74`, `:181`, `:201-206`, `:211-215`. `text` at `:116` goes from `pub(in crate::graph)` to `pub(crate)`. The module doc and the imports stay.
- `value.rs:16`: `UnsupportedValue` becomes `pub(crate)`. Its `pub(super)` items stay.
- `coerce.rs`: no change. Its only import in the crate is `super::value`.

**Dependencies these files need** (each with the features `engine/Cargo.toml` gives it; add those not yet in the crate):

```toml
[dependencies]
hash-codec                   = { workspace = true, features = ["numeric"] }    # Real
hash-integrations-definition = { workspace = true }
type-system                  = { workspace = true }
derive_more = { workspace = true, features = ["display", "error", "from", "into"] }
duckdb      = { workspace = true, features = ["appender-arrow", "bundled", "json"] }   # the line of milestone 5
time        = { workspace = true, features = ["formatting", "macros", "parsing"] }
uuid        = { workspace = true, features = ["v5"] }

[dev-dependencies]
pretty_assertions = { workspace = true }
rstest            = { workspace = true }
serde             = { workspace = true, features = ["derive"] }                # the fixture's cases
serde_json        = { workspace = true }
```

From `definition`: `Accessor`, `Coercion`, `ColumnName`, `Properties`, `UnitCode`, `UnitMap`, `UnitMapName` (`property/mod.rs:21-23`, `coerce.rs:6`). All are exported at `definition/src/lib.rs:37-50`. `UnitMap::units` and `fallback` and `&Properties: IntoIterator` exist (`unit_map.rs:37`, `:43`, `step.rs:133`).

## Tests

**Moved unchanged:** `graph/property/tests.rs`, 409 lines, as `stage/prepare/property/tests.rs`. Its imports are relative (`super::…`, `alloc::…`) and need no change. It has 12 test functions with 64 cases. No snapshot, no fixture file, nothing from `hash-graph-store`.

**Moved, imports changed:** `tests/entity_id.rs`, `derive_entity_id_recorded_vectors` (46 lines), with `tests/fixtures/entity-ids-typescript.json` (8 cases) and its `README.md`. It becomes the test module at the end of `entity_id.rs`, because `derive_entity_id` is no longer public to an integration test. `use hash_integrations_engine::derive_entity_id` becomes `use super::derive_entity_id`, and the fixture is read with `include_str!("../../../tests/fixtures/entity-ids-typescript.json")`.

**Adapted, from `graph/tests.rs`:** they build `EntityUpsert` and `LinkUpsert`, which no longer exist, with a provenance from `integration_provenance`, which goes to milestone 9.

- `entity_id_from_source_record` (`:78-91`): calls `derive_entity_id` and checks the recorded UUID `0x119A…B3B1`. Its first assertion compared the upsert with `derive_entity_id` and is dropped.
- `link_id_from_type_and_endpoints` (`:108-146`): `stationed_at` returns `derive_link_id(…)` instead of a `LinkUpsert`. The four assertions stay: the recorded UUID `0x4AB1…D6CF`, the same id twice, another end, the reversed link.
- `link_endpoints_match_entities` (`:93-106`) is left behind. It checks the end ids that `LinkUpsert::new` derived, which `derive_link_id` does not. That the ends of a link row are the ids of its entities belongs in milestone 8, test 2.

Test lines: 455 moved (409 and 46), about 55 adapted from 82 (`:1-29`, `:60-91`, `:108-146`, without `source` and `aircraft`). No new test: `derive_link_id` is covered by `link_id_from_type_and_endpoints` with the recorded UUID.

## What was stripped

- From `graph/mod.rs` (172 lines without tests), all but `LinkEndpoint` and the id rule: the module doc and re-exports (`:1-35`, 35), `EntityUpsert` (`:37-64`, 28), the `LinkUpsert` struct and the rest of `new` (`:73-99`, `:106-117`, about 25), `Archive` (`:120-125`, 6), `GraphOperation` with `kind` (`:127-146`, 20), `OperationKind` (`:148-158`, 11). About 125 lines. The sync table row replaces the operations, and `Op` replaces `OperationKind`.
- `integration_provenance` (`:160-174`, 15) goes to milestone 9.
- Tests: `link_endpoints_match_entities` (14) and the helper `aircraft` are left behind. Not this milestone's: `operations_sort_into_application_order` (`:148-171`) is adapted by milestone 10, and the helper `source` (`:31-47`) and `integration_provenance_wire_shape` move with milestone 9.
- Nothing in `property/` is left: every item is reached from `resolve` or `text`.

## Open points

- **Fact:** the workspace warns on `unreachable_pub` (`Cargo.toml:413`) and allows `redundant_pub_crate` (`:474`). An item that is `pub` inside the private module `stage::prepare` warns, so `pub` becomes `pub(crate)`, as in milestone 1.
- **Fact:** the workspace enables clippy's `restriction` group (`Cargo.toml:423`) and allows only `mod_module_files` (`:468`). A folder `entity_id/` beside `entity_id.rs` would warn, so the id tests are an inline module, as in `engine/sql.rs:30`.
- **Fact:** three types are named `LinkEndpoint`: this one, `definition`'s (`link.rs:69`, a type and a column) and `type_system`'s (`knowledge::entity`). Milestone 8 uses the first two and imports one by path.
- **Fact:** `SinkRow` has no `op()` or `seq()`. Milestone 8 reads `_op` and `_seq` from the row's values by their position, before it wraps the values in a `SinkRow`, so `SinkRow` stays as it is.
- **Chosen:** the fixture stays in `tests/fixtures/`, where milestone 6 puts its fixtures too.
- **Chosen:** the `duckdb` line is that of `engine` and milestone 5, so the crate gets one line whichever milestone comes first. `Value` alone needs only `bundled`, to link.
- **Settled in `contracts.md`:** every item of the page that is not one of the crate's public functions and their types is `pub(crate)`. The page says so at its top.
- **Settled in `contracts.md`:** `ConversionFailure` and `FailureReason` are on the page. Milestone 8 turns them into issues.
- **Settled in `README.md`, as a rule for every milestone:** code whose caller comes in a later milestone is declared with `#[cfg_attr(not(test), expect(dead_code, reason = "…"))]` on its module, and the milestone that adds the caller removes the line. Here that is `entity_id` and `property`, until milestone 8.
