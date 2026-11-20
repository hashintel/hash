# Spike results

Facts collected by two throwaway spikes on 2026-11-19, before the interfaces in `../plan.md`, step 3, were decided. The spike code is not in the repository.

## How the Graph answers entity writes

Read from the code on 2026-11-19. Nothing was written to a Graph. Five of the claims were checked a second time against the code; the store-level tests named below exist and were not run. Paths: `pg/` is `libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/`, `api/` is `libs/@local/graph/api/src/rest/legacy/`, `it/` is `tests/graph/integration/postgres/`.

**The routes**

- `POST /entities`, `POST /entities/bulk`, `PATCH /entities` and `PATCH /entities/bulk` exist. The running local image has the bulk patch route (seen in its OpenAPI document).
- The Graph has no upsert: no route, no parameter, no store method. `engine` builds its upsert in the client: a create, and a patch when the create gets a 409 (`engine/src/graph/client/mod.rs:122-128`).
- A client sends `Authorization: HASH-Service <secret>` and `X-Authenticated-User-Actor-Id`. `engine`'s client sends both.

**A bulk create** runs in one transaction and applies all entities or none (`pg/mod.rs:1211`, `:1815`; test `it/multi_type.rs:336`).

| Case                                    | Status | Does the answer say which entity?                       |
| --------------------------------------- | ------ | ------------------------------------------------------- |
| All entities are fine                   | 200    | Returns the entities in input order                     |
| One id exists already                   | 409    | No                                                      |
| One or more entities fail validation    | 400    | Yes: `contents[0].validation` lists every failing index |
| A link names an end that does not exist | 500    | No                                                      |

- A batch with both an existing id and an invalid entity gets 409, because the inserts run before the validation result is checked (`pg/mod.rs:1705-1741`, `:1805`).
- The two ends of a link can be created earlier in the same batch.
- A create without an `entityUuid` gets a new id each time. The pipeline derives every id, so a create that is sent twice gets a 409.

**A bulk patch** also runs in one transaction, and applies its items in order (`pg/mod.rs:2178`, `:2234`; tests `it/partial_updates.rs:672`, `:952`).

| Case                              | Status | Does the answer say which entity? |
| --------------------------------- | ------ | --------------------------------- |
| One entity does not exist         | 404    | The entity id, not the index      |
| An entity fails validation        | 400    | Only the first failing index      |
| Another request patches an entity | 499    | No                                |

- A patch that changes nothing writes no new edition and returns 200. The check covers the properties, their metadata, the draft and archived flags, the types and the confidence (`pg/patch.rs:414-425`). Archiving an archived entity is such a patch. The edition's provenance is not compared.
- A patch that leaves out `confidence` on an entity that has one counts as a change (`pg/patch.rs:423`).
- A bulk patch can return an error after it has committed, when starting the embeddings workflow fails (`pg/mod.rs:2236-2250`). A bulk create only logs that failure.

**Single writes** behave like a bulk request with one item: a create of an existing id gets 409, a patch or an archive of a missing entity gets 404.

**Limits**

- The largest request body is 2 MiB (2,097,152 bytes), the default of the web framework. No other limit is configured. A larger body gets 400.
- The number of entities in a bulk request is not limited.
- The server has no request timeout. `engine`'s client gives up after 30 seconds, and the Graph may still commit the request after that.
- Requests with the service secret skip the rate limits.

**What a client can tell from the status alone:** an existing id (409), a missing entity on a patch (404), a concurrent patch (499), a missing permission (403). A 400 is either a malformed request or failed validation; the body has `validation` only in the second case. A 500 is either a missing link end or a server fault.

## Iceberg from Rust

Run on 2026-11-19 as a standalone project against the local MinIO, with the Apache `iceberg` crate 0.11.0. "Observed" means the spike ran it. The rest is read from the crate's source and the DuckDB documentation. The table had the columns of the sync table and was partitioned by `run_id`.

**What works (observed)**

- A run of 10,000 rows is appended as one Parquet file, under `data/run_id=<run>/`. Writing took about 60 ms and the commit about 20 ms.
- A read with a filter on `run_id` opens only that run's file. The files of other runs are skipped before anything is read.
- The rows of one file come back in the order they were written. When a run has several files, the reader merges them in no fixed order, so a reader has to sort by `order_id`. A file is split at 512 MB by default.
- The write path took 76 lines, the read path 31, and the setup about 45.

**A catalog is needed, and none works with S3 alone**

- An Iceberg table needs a catalog: the place that holds the pointer to the table's current metadata file. An append writes new files and then moves that pointer in one atomic step.
- The crate has catalogs for REST, Glue, Hive, S3 Tables and SQL, and one that lives in memory. All but the SQL and memory catalogs need a running service. S3 Tables is an AWS service with its own API, not a plain bucket.
- The crate has no catalog that keeps the pointer in a plain S3 bucket. The second spike below shows that a pointer object and the memory catalog do the same job.
- The spike used the SQL catalog on a local SQLite file. That catalog cannot be added to the hash workspace: it needs `libsqlite3-sys 0.30`, the workspace has `0.35` through `rusqlite`, and cargo refuses two versions of a crate that links the same native library (observed). A SQL catalog on Postgres would not have this problem.
- DuckDB's Iceberg extension can append since DuckDB 1.4, and only through an attached REST catalog. The workspace's `duckdb` crate bundles DuckDB 2.0.0. The extension is not compiled in and would be downloaded when it is first loaded. This was not tried.

**A pointer kept in S3 works without a database (observed, second spike on 2026-11-19)**

- The pointer is one line of text: the location of the table's current metadata file. The spike kept it in an object `sync/pointer.json` in the bucket.
- To append, a process reads the pointer, opens the table from it with the crate's memory catalog (`register_table`), appends, and writes the new location to the pointer. The memory catalog writes the new metadata file to S3 itself. A second run of the program, with nothing in memory, continued the table this way.
- To read, no catalog is needed: `StaticTable::from_metadata_file` with the location from the pointer gives a read-only table, and a filter on `run_id` opens one file.
- The pointer code took 40 lines. No catalog of our own is needed. One would have to implement 15 methods, of which the append path calls two.
- A crash after the append and before the pointer is written: the pointer still names the old state, so the table does not have the run. The retry appends again, and the run's rows are in the table exactly once. This was tested with the same file name and with a new one. Each such crash leaves three small metadata objects behind that nothing refers to, and the old data file if the retry uses a new name.
- In that case the check for the run id in the snapshots does not see the first attempt, and does not need to: the first attempt is not part of the table.
- The pointer can be written with "create if absent" and "replace if the version matches". MinIO honours both and answers a lost write with 412. The crate's own file interface has no such write, so the pointer is written with a storage client directly.
- Finding the current metadata file by listing, without a pointer, is not safe. The files are numbered, and after a crash several files have the same number.

**What a second append of the same run does (observed)**

- With a new file name, the commit succeeds and the run has every row twice. Nothing stops it.
- With the same file name, the commit is refused as a duplicate. By then the writer has already overwritten the stored file.
- A guard works: each append stores the run id in the snapshot's summary, and before an append the writer checks whether a snapshot with that run id exists. About six lines. It stops working for a run whose snapshot has been expired.
- Of two appends that race, one wins and the other gets an error marked as retryable. The loser's files stay in the bucket.

**What it adds to the workspace**

- Version 0.11.0 needs `arrow` and `parquet` 58.4. The workspace has version 60, so it would bring a second copy of both. The crate's `main` branch already uses version 60, and that is not released.
- It uses `opendal` for storage, not the `object_store` crate the workspace has.
- 48 crates that the workspace does not have today.

**The unreleased crate fits the workspace's `arrow` version (observed, third check on 2026-11-19)**

- The `main` branch of iceberg-rust, pinned to commit `641f590`, builds with `arrow` and `parquet` 60.0.0. The build has one copy of each.
- The whole pointer flow works on it: create, append, a new process that opens the table from the pointer, a second append, filtered reads, and a read without a catalog.
- Two calls changed against 0.11.0, both small: how a partition field is declared, and one more argument when a scan is read.
- Version 0.12.0 has a tracking issue (apache/iceberg-rust#3628), open since 2026-11-04, with no date. The issue for 0.11.0 was open for ten weeks before that release.

**Conditional writes with the workspace's own storage crate (observed)**

- `object_store` 0.12.5 against MinIO: "create if absent" succeeds on a new key and is refused with `AlreadyExists` on an existing one. "Replace if the version matches" succeeds with the current tag and is refused with `Precondition` with an old one.
- So `current.json` and the pointer of the sync table can both be written through the storage code we port, without a second storage client of our own.

**What accumulates in the bucket (observed)**

- Each append leaves four objects: the data file, a manifest of about 4 KB, a manifest list, and a new copy of the table's metadata file.
- The metadata file grows by about 850 bytes per run and is written in full on every append. Old copies are never deleted. After 1,000 runs it would be about 850 KB.
- The crate has no operation that removes files nothing refers to.
