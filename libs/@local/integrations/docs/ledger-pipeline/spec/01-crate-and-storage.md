# Milestone 1: Crate and storage

## What it adds

The crate `ledger` at `libs/@local/integrations/ledger`, named `hash-integrations-ledger`, and the two modules through which every other milestone reads and writes one integration's place in the S3 bucket:

- `storage/` reads and writes files through the `object_store` crate: `run.json`, `current.json` and the issues file.
- `lake/` reads and writes Delta tables through DuckDB: the capture tables and the sync table (D18).

```text
run (2), stage (3), Prepare (8)            Capture (3), sync_table (4), Prepare (8)
              │                                          │
              ▼                                          ▼
   [ storage: Storage ]                      [ lake: LakeSettings, Lake, Table ]
     upload, download                          append_run, read_run, copy_run
     read_versioned, replace_if                DuckDB with `httpfs` and `delta`
              │                                          │
              ▼                                          ▼
   run.json, current.json, issues file       capture/{table}/, sync/  (Delta tables)
```

It has no local-folder backend (D6). Tests of other milestones use `object_store`'s in-memory store through a test-only constructor. That store has no bucket, so it holds no Delta table: every test that touches a table runs against a MinIO container, as the storage tests do.

**Decided in:** `../plan.md`, step 2, "Storage and run state", and step 3, "What a run leaves in the bucket" and "How a stage writes". The lake: D18.

## Size

|           | Lines     |                                                                                                                 |
| --------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Moved     | 51        | the S3 settings and opening the bucket                                                                          |
| Adapted   | 237       | the storage type, upload and download without the content hash, the conditional writes without the local folder |
| New       | 783       | `lib.rs`, the in-memory constructor for tests, the lake, `Literal`                                              |
| **Total** | **1,071** | **reused 27%**                                                                                                  |

The plan has 515 (65 moved, 420 adapted, 30 new). The difference is the local folder: `local.rs` (13), its constructor, and the lock-file emulation of conditional writes in `versioned.rs` (about 130). The storage type also loses its staging directories (23). The lake (730) and `Literal` (25) are not in the plan. They came with D18.

## Interface

`contracts.md`, "Storage":

```rust
// storage/mod.rs
pub struct Storage { store: Arc<dyn ObjectStore>, bucket: Option<S3Bucket> }
pub enum StorageError { InvalidBucket, InvalidKey, TooLarge, LocalFile, Read, Write }

impl Storage {
    pub fn s3(bucket: S3Bucket, namespace: &IntegrationNamespace) -> Result<Self, Report<StorageError>>;
    pub(crate) fn bucket(&self) -> Option<&S3Bucket>;    // the lake opens its own connection with it
    #[cfg(test)]
    pub(crate) fn memory() -> Self;                      // the in-memory store, no bucket
}

// storage/file.rs:      upload, download
// storage/versioned.rs: CasVersion, read_versioned, replace_if
// storage/s3.rs:        S3Bucket
pub struct S3Bucket {
    pub uri: Box<str>,                                   // s3://bucket/prefix
    pub region: Box<str>,
    pub endpoint: Option<Box<str>>,
    pub use_ssl: bool,
    pub key_id: Box<str>,
    pub secret: Pin<Box<Secret<[u8]>>>,
}
```

`upload`, `download`, `read_versioned`, `replace_if` and `CasVersion` keep the signatures of `contracts.md`. `lib.rs` re-exports `Storage`, `StorageError`, `S3Bucket` and `IntegrationNamespace`. The four functions and `CasVersion` are `pub(crate)`: only the crate calls them. No stage downloads a file, so only tests call `download`.

The lake, in `contracts.md`, "Lake":

```rust
// lake/mod.rs
pub(crate) enum LakeError { Storage, Invalid, Unconfigured }
pub(crate) struct LakeSettings { .. }                  // the bucket's settings, owned
pub(crate) struct Lake { .. }                          // an in-memory DuckDB that reaches the bucket
pub(crate) struct Table<'lake> { .. }                  // a Delta table attached to a lake
pub(crate) struct Staged<'lake> { .. }                 // rows in a temporary table, ready to append
pub(crate) struct Columns(Vec<Column>);                // the columns of a table, without `run`
pub(crate) struct Database<'lake> { .. }               // a DuckDB file attached to a lake, to copy rows into

// sql.rs
pub(crate) struct Identifier<'name>(&'name str);       // a quoted table or column name (milestone 5)
pub(crate) struct Literal<'text>(&'text str);          // a quoted string, for a statement without bound parameters
```

**The crate's files**

| File                          | Content                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cargo.toml`                  | as `engine/Cargo.toml`: the workspace fields, `[lints] workspace = true`, and the dependencies below                                                 |
| `turbo.json`                  | a copy of `engine/turbo.json` with `hash-integrations-ledger` as the root of `doc:dependency-diagram` and the package of `test:unit`                 |
| `README.md`                   | what the crate does, and that the storage tests need a Docker daemon for MinIO                                                                       |
| `LICENSE.md`                  | a copy of `engine/LICENSE.md` (AGPL 3)                                                                                                               |
| `docs/dependency-diagram.mmd` | generated by `doc:dependency-diagram`, included by `lib.rs`                                                                                          |
| `docs/task-dependencies.json` | generated by `turbo run //#doc:task-dependencies` (`.lefthook.yml:46`)                                                                               |
| root `Cargo.toml`             | the member `libs/@local/integrations/ledger`, `hash-integrations-ledger.path`, and `object_store = { version = "0.12.5", default-features = false }` |

Dependencies for this milestone only:

```toml
[dependencies]
error-stack = { workspace = true, public = true, features = ["std"] }
hash-crypto = { workspace = true, public = true }              # Secret in S3Bucket

derive_more    = { workspace = true, features = ["display", "error"] }
futures-util   = { workspace = true }                           # the download stream
object_store   = { workspace = true, features = ["aws"] }
simple-mermaid = { workspace = true }
tempfile       = { workspace = true }                           # the partial download
tokio          = { workspace = true, features = ["fs", "io-util"] }

[dev-dependencies]
rstest                 = { workspace = true }
testcontainers         = { workspace = true }
testcontainers-modules = { workspace = true, features = ["minio"] }
tokio                  = { workspace = true, features = ["macros", "rt"] }
```

## Pseudo code

**`storage/mod.rs`: the storage type** (adapted, 32 lines; `memory` new, 8)

```rust
pub enum StorageError { InvalidBucket, InvalidKey, TooLarge, LocalFile, Read, Write }

pub struct Storage { store: Arc<dyn ObjectStore>, bucket: Option<S3Bucket> }

impl Storage {
    pub fn s3(bucket: S3Bucket) -> Result<Self, Report<StorageError>> {
        // the namespace's root is appended to the bucket's URI first
        Ok(Self { store: s3::open(&bucket)?, bucket: Some(bucket) })   // InvalidBucket: not `s3://`, or a secret that is not UTF-8
    }

    #[cfg(test)]
    pub(crate) fn memory() -> Self {
        Self { store: Arc::new(InMemory::new()), bucket: None }
    }
}
```

`Storage` keeps the bucket's settings, because the lake opens a connection of its own with them. This is the one addition to the ported type.

**`storage/s3.rs`: the bucket settings and opening it** (moved, 51 lines)

`S3Bucket` and `open` as they are, in one file. `open` strips `s3://`, splits the bucket name from the prefix, builds an `AmazonS3Builder` with path-style URLs for an endpoint such as MinIO, and wraps the store in a `PrefixStore` when there is a prefix.

**`storage/file.rs`: a file into the bucket and back** (adapted, 100 lines)

```rust
const CHUNK_SIZE: usize = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY: usize = 4;

pub async fn upload(&self, file: &Path, key: &str) -> Result<u64, Report<StorageError>> {
    let upload = self.store.put_multipart(&Location::from(key))?;          // Write
    let mut upload = WriteMultipart::new_with_chunk_size(upload, CHUNK_SIZE);
    let mut file = tokio::fs::File::open(file)?;                          // Read
    let mut size = 0;
    let copied = async {
        loop {
            let chunk = read up to CHUNK_SIZE from file else { return Ok(()) };
            size += chunk.len();
            upload.wait_for_capacity(UPLOAD_CONCURRENCY)?;
            upload.write(chunk);
        }
    };
    // An aborted upload stores nothing.
    if let Err(error) = copied { upload.abort(); return Err(error) }
    upload.finish()?;
    Ok(size)
}

pub async fn download(&self, key: &str, directory: &Path) -> Result<PathBuf, Report<StorageError>> {
    let target = directory.join(key);
    create_dir_all(target.parent())?;                                     // Write
    let partial = NamedTempFile::new_in(target.parent())?;
    let mut stream = self.store.get(&Location::from(key))?.into_stream(); // Read, also if missing
    while let Some(chunk) = stream.next() { partial.write_all(chunk?)? }
    partial.sync_all()?;
    partial.persist(&target)?;                                            // replaces an earlier download
    Ok(target)
}
```

This is `upload` and `materialize` of hashintel/hash#10392 without the SHA-256 digest, the check against an `ArtifactRef`, and the size check before an upload. `upload` takes a key and returns the size it counted.

**`storage/versioned.rs`: small files with conditional writes** (adapted, 105 lines)

```rust
const MAX_VERSIONED_BYTES: usize = 16 * 1024 * 1024;        // 1 MiB in the ported code (D8)

pub struct CasVersion { pub e_tag: Option<String>, pub provider_version: Option<String> }

pub async fn read_versioned(&self, key: &str) -> Result<Option<(Vec<u8>, CasVersion)>, _> {
    let result = match self.store.get(&Location::from(key)) {
        Ok(result) => result,
        Err(NotFound) => return Ok(None),
        Err(error) => return Err(Read),
    };
    if result.meta.size > MAX_VERSIONED_BYTES { return Err(Read) }        // before the bytes are read
    Ok(Some((result.bytes()?, CasVersion { e_tag: meta.e_tag, provider_version: meta.version })))
}

pub async fn replace_if(&self, key: &str, expected: Option<&CasVersion>, bytes: Vec<u8>) -> Result<bool, _> {
    if bytes.len() > MAX_VERSIONED_BYTES { return Err(Write) }
    let mode = match expected {
        None => PutMode::Create,
        Some(version) => PutMode::Update(UpdateVersion { e_tag, version }),
    };
    match self.store.put_opts(&Location::from(key), bytes, mode) {
        Ok(_) => Ok(true),
        Err(AlreadyExists | Precondition) => Ok(false),
        Err(error) => Err(Write),
    }
}
```

The branch `pe/ledger-r1-conditional-write` as it is, with three changes: a key is a `&str` and not an `ArtifactKey`, the `local_root` branches go, and so do the helpers for the local folder.

**`lake/mod.rs`: Delta tables through DuckDB** (new, 730 lines)

```rust
impl LakeSettings {
    pub(crate) fn of(storage: &Storage) -> Result<Self, Report<LakeError>>;   // Unconfigured: no bucket, or a secret that is not text
    /// Opens a lake on a blocking thread, as DuckDB blocks, and runs `work` with it there.
    pub(crate) async fn run<T, C>(self, from_lake: fn(Report<LakeError>) -> Report<C>,
                                  work: impl FnOnce(&Lake) -> Result<T, Report<C>>) -> Result<T, Report<C>>;
    pub(crate) fn open(&self) -> Result<Lake, Report<LakeError>> {
        let connection = Connection::open_in_memory()?;
        connection.execute_batch("INSTALL httpfs; LOAD httpfs; INSTALL delta; LOAD delta;")?;   // Storage
        // KEY_ID, SECRET, REGION, USE_SSL, SCOPE '{root}', and ENDPOINT with URL_STYLE 'path' for MinIO
        connection.execute_batch("CREATE SECRET lake (TYPE s3, …)")?;   // the values as `Literal`s
        Ok(Lake { connection, root })
    }
}

impl Lake {
    pub(crate) fn table(&self, key: &str) -> Result<Table<'_>, _>;            // ATTACH '{root}/{key}' (TYPE delta)
    pub(crate) fn stage_query(&self, query: &str) -> Result<Staged<'_>, _>;   // CREATE TEMPORARY TABLE … AS {query}
    pub(crate) fn stage_rows(&self, columns: &Columns) -> Result<Staged<'_>, _>;   // an empty one, for an `Appender`
    pub(crate) fn attach_database(&self, path: &Path) -> Result<Database<'_>, _>;
}

impl Table<'_> {
    pub(crate) fn exists(&self) -> Result<bool, _>;
    pub(crate) fn has_run(&self, run: RunId) -> Result<bool, _>;   // delta_get_transaction_version(table, run)
    pub(crate) fn rows(&self, run: RunId) -> Result<u64, _>;
    pub(crate) fn read_run<T, C>(&self, run, columns: &Columns, from_lake, read: impl FnMut(&Row) -> Result<T, Report<C>>)
        -> Result<Vec<T>, Report<C>>;
    /// CREATE TABLE {database}.{into} AS SELECT * EXCLUDE (run, {order}) … WHERE run = ? ORDER BY {order}
    pub(crate) fn copy_run(&self, run, database: &Database, into: &str, order: &str) -> Result<(), _>;

    pub(crate) fn append_run(&self, run: RunId, staged: &Staged) -> Result<u64, _> {
        if self.has_run(run)? { self.checkpoint(); return self.rows(run); }
        self.ensure(&staged.columns()?)?;     // creates the table, partitioned by `run`, or compares the names
        BEGIN TRANSACTION;
        CALL delta_set_transaction_version(table, run, 1, NULL);      // tags the commit with the run
        INSERT INTO table BY NAME SELECT ? AS run, * FROM staged;
        COMMIT;                               // on an error: ROLLBACK, then `has_run` again (`recover`)
        self.checkpoint();
        self.rows(run)
    }
}
```

A table is a Delta table at `{root}/{key}`, where the root is the integration's place in the bucket. Every table has the text column `run` first and is partitioned by it. The first append creates the table, with the columns of its rows. A later append must give columns of the same names, in any order, and its rows are inserted by name. DuckDB compares names without regard to case. Rows with other names, or with a column `run`, are `Invalid`, and nothing is written.

A run's rows are one append, in one commit tagged with the run id as Delta's application transaction id. An append of a run that is in the table commits nothing and returns the number of rows the run has. Two processes that append the same run at once both return that number: the one whose commit fails rolls back, finds the run, and counts its rows. An append without rows commits nothing, so its run does not count as appended.

DuckDB writes no Delta checkpoint on its own, and without one every read replays the whole log. An append therefore writes a checkpoint when the number of runs in the table is a multiple of 100. A checkpoint that fails is logged, and the append still succeeds.

duckdb-rs gives no kind for an error that DuckDB raises, so `LakeError` reads it from the start of the message, such as `Binder Error: …`. Thirteen kinds that fail the same way every time are `Invalid`, as are a file or table that a query names and that does not exist, and every error of duckdb-rs itself. Every other error is `Storage`, including errors of the bucket and a commit that another process won. `Unconfigured` is a storage without a bucket. A stage turns `Storage` into a retryable error, `Invalid` into its own failure code, and `Unconfigured` into the code `storage_unconfigured` (`stage/failure.rs`, `from_lake`).

The secret's scope is the integration's place, so DuckDB uses the bucket's credentials only for paths below it. `CREATE SECRET` takes no bound parameters, so its values are written as `Literal`s. If DuckDB refuses the statement, its message repeats the secret, and the report drops it.

**`sql.rs`** holds `Identifier`, which milestone 5 ports, and `Literal`, which quotes a string with each `'` doubled. The file is at the crate root because the lake and the workspace both use it.

## Source table

`933/` is `libs/@local/integrations/engine/src/storage/` on the branch `pe/be-933-store-integration-artifacts-and-run-records-in-the-object` (hashintel/hash#10392). `r1/` is the same folder on `pe/ledger-r1-conditional-write`.

| New file               | Item                                                                          | Comes from                                                                                         | Kind    | Lines |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- | ----- |
| `storage/s3.rs`        | `S3Bucket`                                                                    | `933/bucket.rs:1-14` (14)                                                                          | moved   | 14    |
| `storage/s3.rs`        | `open`                                                                        | `933/artifact/s3.rs:1-37` (37), from labs `blob.rs:565`, `ArtifactStore::from_url`                 | moved   | 37    |
| `storage/mod.rs`       | `StorageError`                                                                | `933/mod.rs:14-23`, `ArtifactError` (10)                                                           | adapted | 8     |
| `storage/mod.rs`       | `Storage`, `Storage::s3`, the module's declarations                           | `933/artifact/mod.rs:30-73`, `ArtifactStorage` with `local` and `s3` (44)                          | adapted | 24    |
| `storage/mod.rs`       | `Storage::memory`                                                             | none                                                                                               | new     | 8     |
| `storage/file.rs`      | imports, `CHUNK_SIZE`, `UPLOAD_CONCURRENCY`                                   | `933/artifact/mod.rs:1-28` (28)                                                                    | adapted | 15    |
| `storage/file.rs`      | `upload`                                                                      | `933/artifact/mod.rs:190-240`, `upload` (51), from labs `blob.rs:738`, `publish`                   | adapted | 45    |
| `storage/file.rs`      | `download`                                                                    | `933/artifact/mod.rs:131-188`, `materialize` (58), from labs `blob.rs:1151`, `materialize_guarded` | adapted | 40    |
| `storage/versioned.rs` | `CasVersion`, `read_versioned`, `replace_if`, `cas_version`                   | `r1/artifact/versioned.rs:1-124` (124), from labs `blob.rs:318`, `:1540`, `:1621`, `:1706`         | adapted | 105   |
| `lib.rs`               | crate doc, the diagram, `mod storage`, re-exports                             | none                                                                                               | new     | 20    |
| `lake/mod.rs`          | `LakeError`, `LakeSettings`, `Lake`, `Table`, `Staged`, `Columns`, `Database` | none                                                                                               | new     | 730   |
| `sql.rs`               | `Literal`                                                                     | none                                                                                               | new     | 25    |

Moved 51, adapted 237, new 783: 1,071 lines.

## Tests

**Moved with the code, adapted where the code is** (from `r1/tests.rs`):

- The fixtures `minio` (`:23`) and `bucket` (`:49`), as they are.
- `artifacts_round_trip_through_new_staging` (`:220`), renamed `files_round_trip`. A file of two parts and a shorter third goes up under a fixed key and comes back. It checks the size `upload` returns, not a digest. Its cases are `memory` and `s3`, so the store that other milestones test with is checked against S3.
- `s3_errors_are_not_missing_bindings` (`:191`) and `s3_errors_are_not_missing_or_mismatching_artifacts` (`:426`), as one test `s3_errors_are_not_missing_files`: with a wrong secret, `read_versioned` fails with `Read` and does not return `None`, and `download` fails with `Read`.
- `replace_if_conditional_put` (`:569`), with the cases `memory` and `s3` instead of `local` and `s3`. It already holds the two new tests of `../plan.md`, step 5: a second create is refused, and a replace with an old version is refused.
- `versioned_size_limit` (`:616`), on `memory`. The oversized file is put straight into the store instead of into a folder.

**New, two tests,** both on MinIO:

1. A second upload to the same key replaces the first, and a download returns the second file. A stage that runs again stores its files again under the same names.
2. Downloading a missing key fails with `Read` and leaves no file in the directory.

**The lake, new, in `lake/tests.rs`.** All but the first three run against MinIO.

1. A query that names a missing table or file, or fails to convert a value, is `Invalid`. Four cases of one test.
2. An error of duckdb-rs itself is `Invalid`.
3. A storage without a bucket is `Unconfigured`.
4. A bucket that cannot be reached is `Storage`.
5. A second append of a run leaves the rows of the first and returns their number.
6. An append with the table's columns in another order and case puts each value in the column of its name.
7. An append with a renamed, missing or added column, or a column `run`, is `Invalid` and does not mark the run as appended. Four cases of one test.
8. A query that fails creates no table, so a fixed query creates it with its own columns.
9. `copy_run` keeps the order of the query's rows, for 1,000 rows.
10. Two processes that append one run at once both return the rows of one append. Three runs.
11. The log is compacted into a checkpoint at the set number of runs, and not before.

`sql.rs` has the property test `literal_round_trips`, beside `identifier_round_trips`.

Not tested on their own: `s3::open` and `Storage::memory`. Every test goes through one of them.

## What was stripped

- The local folder: `933/artifact/local.rs` (13), `ArtifactStorage::local` (`933/artifact/mod.rs:45-58`, 14), and in `r1/artifact/versioned.rs` the `local_root` branches (`:55-59`, `:83-92`, 15) and `local_cas_version`, `local_replace_if`, `fsync_ancestors`, `cas_temp_name` and `cas_temp_prefix` (`:126-238`, 113). With imports, about 145 lines, and the `hex` dependency.
- Naming files by content: `publish` with its existence check (`933/artifact/mod.rs:99-129`, 31), `digest` (`:243-258`, 16), the hash in `upload` and `materialize`, and `ArtifactError::Mismatch`.
- `ArtifactRef`, `ArtifactRefV1` and `Format` (`933/artifact/reference.rs`, 135), `bind` and `bound` (`933/artifact/binding.rs`, 68), `ArtifactNamespace` (`933/namespace.rs`, 44) and `ArtifactKey` (`933/mod.rs:25-30`, 6).
- Staging directories: the fields `staging` and `directory`, `stage`, `directory` and `staging_file` (`933/artifact/mod.rs:75-97`, 23). `download` takes its directory from the caller.
- Tests left behind: `replace_if_compare_and_swap` (`:497`, the `local` case of `replace_if_conditional_put`), `replace_if_local_handles` (`:534`), `staging_files_are_unique` (`:469`), and the eight tests of content names, references, namespaces and bindings that `../plan.md`, step 5, already leaves behind.

## Open points

- **Fact:** `object_store`'s local file system refuses `PutMode::Update` with `NotImplemented` (`object_store-0.12.5/src/local.rs:327`). Its in-memory store supports `Create` and `Update` and compares the entity tag (`memory.rs:151-172`). The module `memory` needs no feature, `local` needs `fs` (`lib.rs:522-524`), so the crate takes `object_store` with `aws` only.
- **Fact:** the secret in `S3Bucket` is `SecretValue`, defined as `pub type SecretValue = Pin<Box<Secret<[u8]>>>` in `engine/src/sources/secrets/mod.rs:36` on the storage branch. `Secret` is `hash-crypto`'s (`libs/@local/crypto/src/secret.rs:61`). The new crate writes the same type without the alias.
- **Fact:** the root `Cargo.toml` on this branch has no `object_store`. The storage branch adds it as `{ version = "0.12.5", default-features = false }` (its `Cargo.toml:253`). `Cargo.lock` already has 0.12.5.
- **Chosen:** `S3Bucket` and `open` share `storage/s3.rs`, as in the module tree, instead of `bucket.rs` and `artifact/s3.rs`.
- **Chosen:** `download` always downloads and replaces a file at the target. Without a digest, a file found there cannot be checked, which is why `materialize` could skip the download.
- **Chosen:** the storage tests use byte strings, not JSON. The crate needs no `serde_json` for this milestone.
- **Decided:** D6, no local-folder backend.
- **Decided:** D8. The size limit of small files is 16 MiB, not the 1 MiB of the ported code, so that `run.json` can hold the failed entities of a large run.
- **Decided:** D18, the stages pass their data as Delta tables through DuckDB. D19, a run is written to a table once.
- **Fact:** the lake installs the DuckDB extensions `httpfs` and `delta` from the network each time it opens (`lake/mod.rs`, `LakeSettings::open`). The workspace turns automatic installs off; the lake installs them by name.
- **Fact:** DuckDB's Delta extension breaks the next insert after `CREATE TABLE IF NOT EXISTS` on a Delta table. `ensure` therefore checks `exists` first, and after a failed `CREATE TABLE` checks again, because another process may have created the table.
- **Chosen:** each lake is an in-memory DuckDB, opened per stage, with no memory or temporary-directory limit.
- **Chosen:** a lake hands out names for its attached tables and databases from a counter, so that two attachments never share a name.
