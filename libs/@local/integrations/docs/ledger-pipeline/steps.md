# Ledger pipeline: steps

Each step below is one unit of work with its own issue: 18 steps in all. A step names what it delivers, the functions it adds, what it reads and writes, the code it reuses and the tests it ports. The functions exist in the skeleton crate [`ledger`](../../ledger/src) with empty bodies. The reuse and test references come from the [code inventory](inventory/).

## Status

All 18 steps are agreed (Paul, 2026-11-18).

| Step                       | State                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 to R5, C1               | Ready to become issues                                                                                                                            |
| T1, P1, P2, P4, S1, S2, S3 | Ready to become issues                                                                                                                            |
| T2                         | Blocked by "How the sync table is stored"                                                                                                         |
| P3, P5                     | Ready for entities. The link part is blocked by "Link changes in incremental runs"                                                                |
| P6                         | Ready for the issues file. The write is blocked by T2                                                                                             |
| S4                         | Ready for retries. A refused batch or write is blocked by "A bulk request that the Graph refuses" and "What happens to a write the Graph refuses" |
| S5                         | Ready except for the read, which is blocked by T2                                                                                                 |

The blocking questions are in [open-issues.md](open-issues.md).

Five choices were decided with the steps (Paul, 2026-11-18):

1. **Property conversion follows `engine`.** Labs differs in three cases: a blank boolean is `false` in labs and left out in `engine`; an unknown unit gives the bare amount in labs and a failure in `engine`; `01/15/2024` becomes `2024-15-01` in labs and is refused in `engine`. Labs tests are ported where the two agree.
2. **The text of a non-text id follows `engine`.** A `TIMESTAMP` id renders as `2026-11-09T10:30:00Z`, where labs renders `2026-11-09 10:30:00`. The two derive different entity ids for such a row.
3. **The Parquet row writer is the module `table.rs` in the ledger crate.** The issues file and the sync table both use it.
4. **`engine` exposes the create, update and archive bodies of a write separately.** Today it seals them in one `Payload`.
5. **The check "a target reads more than one source" runs after the pipelines,** with the source sets the existing code computes.

The steps need three changes to `engine`: the conditional write (R1), making the path check `CaptureStore::local_file` public (C1), and exposing the request bodies (S1).

## Run state

The module `run/` holds the state of a run and the two status files. Every stage builds on it.

### R1. Conditional write in `engine`

- **Delivers:** a read that returns a version, and a write that replaces a file only if the version still matches.
- **Functions:** `ArtifactStorage::read_versioned` and `ArtifactStorage::replace_if` in `engine`, and two key names on `ArtifactNamespace`: `runs/{run}/run.json` and `current.json`.
- **Reads and writes:** any small JSON file in the integration's storage. A file is limited to 1 MiB.
- **Reuses:** the `pipeline` crate's `storage/artifact/mutable/mod.rs` (238 lines) and the `local_root` field it adds to `ArtifactStorage`. On S3 the version is the object's ETag. On the local file system it is the SHA-256 of the file, guarded by a lock file per key.
- **Tests to port:** `conditional_local_process_races` and `conditional_local_crash` from the `pipeline` crate's `storage/artifact/mutable/tests.rs`, and `conditional_put_contract` from labs `tests/s3_contract_test.rs`, which needs a real bucket.
- **Depends on:** nothing. It changes `engine`.

### R2. `run.json`

- **Delivers:** the types of `run.json` and the one place that reads and changes the file.
- **Functions:** `store::read`, `store::create` and `store::update`. `update` takes a change to apply, writes the result, and on a conflicting write reads the file again and retries, up to eight times. A stage never sees a conflict.
- **Reads and writes:** `runs/{run}/run.json`.
- **Reuses:** the skeleton's `Run` types, the `pipeline` crate's `run/serde.rs`, and the retry loop of its `run/current.rs`.
- **Tests to port:** the cases of the `pipeline` crate's `run/tests/marker.rs` and `run/tests/current.rs` that cover a stored file being read back and a conflicting write.
- **Depends on:** R1.

### R3. Start and completion

- **Delivers:** the rule that one integration has one run at a time.
- **Functions:** `start` writes the first `run.json` and sets the run as active. It refuses with `run_active` when another run is active, and with `request_mismatch` when the run exists with another input. `current::complete` sets the run as the last completed run and clears the active run. `current::read` reads the file.
- **Reads and writes:** `runs/{run}/run.json` and `current.json`.
- **Reuses:** the checks of `start` in the `pipeline` crate's `run/mod.rs`, without the restore and reconcile operations.
- **Tests to port:** the cases of the `pipeline` crate's `run/tests/start.rs` for a repeated start and a mismatching request.
- **Depends on:** R2.

### R4. Errors and the failure part

- **Delivers:** the error codes, their retry class, and the failure part of `run.json`.
- **Functions:** `StageError`, `Code`, the helpers that map a storage, workspace or capture error to a code, and `store::fail`, which writes the failure part. A stage removes the failure part in the same `store::update` that writes its own part.
- **Reads and writes:** the failure part of `run.json`.
- **Reuses:** the `pipeline` crate's `run/error.rs`. Eight codes of the four-stage design are removed, and `run_active` is new.
- **Tests to port:** the `pipeline` crate's `run/tests/error.rs`.
- **Depends on:** R2.

### R5. Run context

- **Delivers:** the resources a stage runs with.
- **Functions:** `RunContext` with its constructor and its helpers to publish a file, fetch a file and open a workspace, and the clocks `SystemClock` and `FixedClock`.
- **Reads and writes:** nothing by itself.
- **Reuses:** the `pipeline` crate's `run/context.rs`. `RunContext` gains the local folder that Capture reads from.
- **Tests to port:** none of its own. Every stage test uses `FixedClock`.
- **Depends on:** nothing.

## Capture

### C1. Capture

- **Delivers:** the capture files in storage and the capture part of `run.json`.
- **Functions:** `capture(context, input) -> CaptureOutput`.
- **What it does:**
  1. It returns the capture part if `run.json` has one.
  2. For each source of the definition, it finds the Parquet file inside the local folder. A source that is not a local file, and a file that is missing, outside the folder or not readable Parquet, is a permanent error.
  3. It reads the row count from the Parquet footer.
  4. It uploads the file as it is. The file is read in place, once to compute its SHA-256 and once to upload it in parts. No local copy is made, and the upload fails if the file changes while it is read.
  5. It writes the capture part with `store::update`.
- **Reads and writes:** reads the local files. Writes one file per source under `artifacts/`, named by its SHA-256, and the capture part of `run.json`.
- **Reuses:** `SourceCapture::open` and `ArtifactStorage::publish` from `engine`. `engine`'s check that a file name stays inside the local folder (`CaptureStore::local_file`) is private and has to be made public.
- **Tests to port:** `local_root_invalid_key`, `local_root_symlink` and `overlapping_roots` from `engine`'s `sources/tests.rs`, and the cases of the `pipeline` crate's `stage/capture/tests.rs` for a completed capture that is returned without reading a file.
- **Depends on:** R2, R5.

## Row files and the sync table

### T1. Parquet row files

- **Delivers:** writing typed rows to a Parquet file in storage, and loading such a file into a workspace table.
- **Functions:** a row file writer with typed columns, and a loader, in a new module `table.rs`.
- **Reads and writes:** files under `artifacts/`, named by their SHA-256.
- **Reuses:** the `pipeline` crate's `run/table/mod.rs` (`RowFile`, `Column`, `Cell`, `load_table`) and `run/table/buffer.rs` (`BufferedFile`). It writes the file to the scratch folder and stores it with `ArtifactStorage::publish`.
- **Tests to port:** the `pipeline` crate's `run/tests/table.rs`.
- **Depends on:** R5.

### T2. Sync table

- **Delivers:** appending the changes of a run and reading them back in send order.
- **Functions:** `sync_table::write::append` and `sync_table::read::in_send_order`, with the row type `Change` and the `Operation`.
- **Reads and writes:** the sync table.
- **Reuses:** T1 for the column types. Nothing in labs, `engine` or the `pipeline` crate writes `Change` rows.
- **Tests:** the five rows of the walkthrough example, written and read back in send order: 0, 1, 2, 4, 3.
- **Depends on:** T1. **Blocked** by "How the sync table is stored".

## Prepare

`prepare(context, input, capture) -> PrepareOutput` runs the steps below in order. A run that has a prepare part returns it.

### P1. Stage the capture files

- **Delivers:** one table per source that the pipelines can read, with the internal columns `_op`, `_key` and `_seq`.
- **What it does:** it fetches each capture file and loads it into the workspace. It numbers the rows in file order as `_seq`. It stages the table with `engine`'s `stage_table`, which checks the primary key columns and adds `_key`. It then sets `_op` from `_change` and refuses a `_change` that is not `insert`, `update` or `delete`.
- **Reuses:** `Workspace::load_capture`, `stage_table` and `create_table` from `engine`, and `stage_sources` from the `pipeline` crate's `stage/diff/rows/mod.rs`.
- **Tests to port:** `staging_composite_keys`, `staging_invalid_columns` and `staging_empty_source` from `engine`'s `tests/pipeline.rs`. New tests: the three `_change` values, an invalid value, and that `_seq` follows the row order of the file.
- **Depends on:** R5, C1. This is the step a later variant such as hash and diff replaces.

### P2. Run the pipelines

- **Delivers:** one table per target, with the sources it reads.
- **What it does:** it runs the entity pipelines and the link pipelines of the definition in dependency order. It fails the run when a target reads more than one source, and when a target table has lost `_seq`.
- **Reuses:** `Workspace::prepare_pipeline` and `prepare_link_pipeline` from `engine`, and `prepare_rows` and `pipelines.rs` from the `pipeline` crate's `stage/diff/rows/`.
- **Tests to port:** `pipeline_metadata_loss`, `link_named_inputs` and `definition_aviation_tables` from `engine`'s `tests/pipeline.rs`; `rows_checkpoint_source_provenance` and `rows_aviation_empty_repeat` from the `pipeline` crate's `stage/diff/rows/tests.rs`.
- **Depends on:** P1.

### P3. Assign ids

- **Delivers:** the entity id of every row, the two endpoint ids of every link row, and an issue for every row that has none.
- **What it does:** it derives each id from the web, the namespace, the type and the source id. A row without a usable source id, and a link row without both endpoints, is left out and listed as an issue. Several rows may have the same entity id.
- **Reuses:** `derive_entity_id` and `LinkUpsert::new` from `engine`, and `ids.rs` from the `pipeline` crate's `stage/diff/rows/`.
- **Tests to port:** `uuids_match_the_ts_engine` from labs with `tests/golden/uuids.json`; `derive_entity_id_recorded_vectors`, `link_endpoints_match_entities` and `link_id_from_type_and_endpoints` from `engine`; `rows_missing_ids_and_endpoints`, `rows_typed_id_text` and `rows_id_range_boundaries` from the `pipeline` crate.
- **Depends on:** P2. Its link part is **blocked** by "Link changes in incremental runs".

### P4. Resolve properties

- **Delivers:** the properties of every row, and an issue for every value that cannot be converted.
- **What it does:** it reads each property through the definition's mapping. A blank value is left out. A value that fails conversion is left out and listed as an issue.
- **Reuses:** `SinkRow`, `SinkColumns`, `ResolvedProperties` and `ConversionFailure` from `engine`. They replace the skeleton's `prepare/properties/`.
- **Tests to port:** `engine`'s `graph/property/tests.rs`. From labs `src/coerce.rs`, the cases of `date_shapes`, `time_shapes`, `number_shapes_including_eu`, `boolean_and_integer_and_year` and `measure_tags_with_data_type` on which labs and `engine` agree.
- **Depends on:** P3.

### P5. Build the changes

- **Delivers:** the `Change` rows of the run.
- **What it does:** it maps `_op` to the operation: `insert` creates, `update` updates, `delete` archives. It assigns `order_id` from the rows sorted by target, in the order of the definition, and then by `_seq`.
- **Reuses:** nothing. This is new code.
- **Tests:** the walkthrough example. Its four captured rows give the changes with `order_id` 0 to 3 for the entities.
- **Depends on:** P4. The operation of a link row is **blocked** by "Link changes in incremental runs".

### P6. Write the result

- **Delivers:** the changes in the sync table, the issues file and the prepare part of `run.json`.
- **What it does:** it appends the changes, stores the issues file if there is an entry, and writes the prepare part last with `store::update`.
- **Reads and writes:** the sync table, one issues file under `artifacts/` with the seven columns, and the prepare part.
- **Reuses:** T1 for the issues file and T2 for the sync table. The seven issue columns are those of the `pipeline` crate's `stage/plan/write.rs`.
- **Tests to port:** `issues_omit_values_and_preserve_key` from the `pipeline` crate's `stage/plan/tests.rs`. New test: Prepare stops after the append and before `run.json`, and runs again.
- **Depends on:** P5, T1, T2, R2.

## Send

`send(context, input, batch, capture, prepare, progress, graph) -> SendOutput` runs the steps below. A run that has a send part returns it.

### S1. Request bodies

- **Delivers:** the body of the request for one change.
- **Functions:** `request::encode(change, provenance)`. A create carries the properties. An update carries one `add` per property. An archive carries none. The provenance is built from the run input and the capture time.
- **Reuses:** `EntityUpsert`, `LinkUpsert`, `Archive` and `integration_provenance` from `engine`, and the bodies of `engine`'s `graph/plan/request.rs`.
- **Tests to port:** `exact_entity_and_link_delivery_bytes_match_independent_golden` from labs with `tests/golden/graph-delivery-v1.json`, and the two labs tests on links without properties: `propertyless_link_patch_only_revives_like_typescript` and `all_null_link_properties_do_not_emit_an_empty_patch_array`.
- **Depends on:** nothing.

### S2. Batches

- **Delivers:** the batch index of every change, in send order.
- **Functions:** `Batcher::assign`. A new batch starts when the operation changes, when create switches to update, at the write limit, at the byte limit, or when the entity is already in the open batch.
- **Reuses:** the `Batcher` of the `pipeline` crate's `stage/plan/write.rs`. The last rule is new.
- **Tests to port:** `batch_exact_byte_boundary` and `batch_counter_limit` from the same file, and `operation_order_is_dependency_safe` from labs `src/graph/effects.rs`. New test: two changes to one entity land in two batches.
- **Depends on:** S1, for the size of a body.

### S3. Graph client

- **Delivers:** sending one bulk create or one bulk update to the Graph, and a fake Graph for tests.
- **Functions:** the `Graph` trait, `GraphClient` and `FakeGraph`.
- **Reuses:** the `pipeline` crate's `graph/client/mod.rs`, including its handling of `Retry-After`, and `graph/fake.rs`. `FakeGraph` has to learn `add` operations; today it answers 500 to them.
- **Tests to port:** the `pipeline` crate's `graph/client/tests.rs`; from labs `src/graph/client.rs`, `durable_effect_transport_authenticates_the_service_and_uses_the_run_owner` and `effect_transport_exposes_one_429_and_capped_retry_after_to_the_budget_owner`.
- **Depends on:** nothing.

### S4. Deliver a batch

- **Delivers:** the result of every write of one batch.
- **What it does:** it sends the batch and retries when the Graph is unreachable or answers 429, 502, 503 or 504, up to the attempts of `SendSettings`. A create that gets a conflict counts as done.
- **Reuses:** the retry loop of the `pipeline` crate's `stage/send/delivery.rs`, without the fallback between create and update.
- **Tests to port:** `transport_failure_yields_with_default_backoff_…` and `duplicate_words_in_a_non_409_response_never_trigger_patch` from labs `src/graph/executor.rs`.
- **Depends on:** S3. What happens to a refused batch and to a refused write is **blocked** by "A bulk request that the Graph refuses" and "What happens to a write the Graph refuses".

### S5. Send the run

- **Delivers:** the Graph holding the changes of the run, the send part of `run.json`, and the run as the last completed run.
- **What it does:** it reads the changes in send order and compares their number with the prepare part. It encodes and batches them, skips the batches the send progress counts as confirmed, and delivers the rest in order. After each confirmed batch it writes the batch count and the running counts. After the last batch it writes the send part and calls `current::complete`.
- **Reads and writes:** the sync table, the send progress and send parts of `run.json`, and `current.json`.
- **Reuses:** the counting of the `pipeline` crate's `stage/send/tally.rs`.
- **Tests to port:** from labs `src/graph/executor.rs`, `recovery_resumes_strictly_after_the_durable_exclusive_cursor`, `failed_cursor_commit_leaves_the_effect_replayable`, `a_rejected_full_batch_never_sends_or_advances_a_later_batch` and `empty_work_completes_the_turn_without_inventing_a_cursor`; from labs `tests/crash_replay_test.rs`, `process_death_mid_delivery_resumes_at_the_durable_cursor_…`. The walkthrough example is the end-to-end case: four batches and the counts 3 created, 1 patched, 1 archived.
- **Depends on:** S1, S2, S4, T2, R2, R3.

## Order

- **Run state and Capture:** R1 first, then R2 and R3. R4 and R5 can run alongside R2. C1 needs R2 and R5.
- **Prepare:** P1 to P6 in order. T1 can start with R5.
- **Send:** S1, S2 and S3 need nothing from Prepare and can start early. S4 follows S3, and S5 comes last.
