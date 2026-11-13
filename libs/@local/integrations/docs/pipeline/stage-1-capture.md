# Integration pipeline: stage 1, Capture

This spec implements the stage function `capture` of [`01-contracts.md`](01-contracts.md). It names a contract by its section title and does not repeat it. Decision IDs are those of [`00-overview.md`](00-overview.md).

Paths are relative to `libs/@local/integrations/` unless they start with `libs/`, `apps/` or `tests/`. Lines in `engine/src/sources` and `engine/src/storage` are those of the checkout (the BE-933 branch). All other monorepo lines are those of `origin/main` at `c47a17eed3`. Labs paths are relative to `pocs/integrations_rs` at `40a8d14`. Every signature below was read in the source.

Three terms are used in this file:

- A **readable source** is a source of the definition whose kind is not `SourceKind::Checkpoint` (`definition/src/source/mod.rs:116`).
- An **attempt** is one call of the stage function for a run. A run can have several attempts.
- To **adopt** a run is to store that run's `CaptureOutput` as the output of the current run.

## 1. Purpose

Stage 1 gives a run its `CaptureOutput`: the capture time and, for every readable source, a stored Parquet file with its row count. An apply run reads every readable source. A restore to a run and a reconcile adopt the target run and read no source, and a restore to empty stores an output without sources. The stage loads no capture into a table and runs no SQL step of a pipeline.

## 2. Module layout

New files, under `engine/src/`:

| File | Content | Visibility |
| --- | --- | --- |
| `stage/mod.rs` | The line `pub mod capture;`. The other stage specs add their lines. | `pub` |
| `stage/capture/mod.rs` | `CaptureOutput`, the re-export of `CapturedSource`, the stage function `capture`, and `empty`. | `CaptureOutput`, `CapturedSource` and `capture` are `pub`. `empty` is private. |
| `stage/capture/apply.rs` | `apply`, which captures the sources of an apply run, and its helper `reads_sql`. | `apply` is `pub(super)`. `reads_sql` is private. |
| `stage/capture/adopt.rs` | `adopt`, which reads the target run's output for a restore or a reconcile. | `pub(super)` |
| `stage/capture/error.rs` | `source_error`, which turns a `SourceError` into `StageError`, and its helpers `source_code`, `frame_code` and `temporary`. | `source_error` is `pub(super)`. The helpers are private. |
| `stage/capture/tests.rs` | The unit tests of section 7. | `#[cfg(test)]` |

Changed files, under `engine/`:

| File | Change |
| --- | --- |
| `src/sources/mod.rs` | `CapturedSource` is defined here. `capture_sources` and `stage_sources` get new signatures. `read_source`, `CaptureStore::store` and `capture_table` are new. `SourceCaptures` is removed. |
| `src/sources/http/mod.rs` | One error context changes (section 5). |
| `src/storage/namespace.rs` | The capture binding key moves (C5). A key builder for the capture marker is new. `shared-run.md` section 4.3 specifies both builders. |
| `src/run/error.rs` | `Code` gets the five variants of stage 1 (4.11). |
| `src/lib.rs` | The export list changes (section 5). |
| `Cargo.toml` | `time` moves to the public dependencies and gets the features `formatting` and `serde` beside `parsing` (`engine/Cargo.toml:40`). |
| `src/capture.rs` | No change. |

## 3. Types

The contract "Checkpoint 1: `CaptureOutput`" fixes the fields, and the contract "JSON form" fixes the stored form. This section adds the derives, the serde attributes and the place of each type.

```rust
// engine/src/stage/capture/mod.rs

pub use crate::sources::CapturedSource;

/// What stage 1 stored for a run: the capture time and one file per readable source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptureOutput {
    /// The time the stage started in the attempt that stored this output, or the adopted run's
    /// capture time.
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
    /// The stored capture of every readable source.
    pub sources: BTreeMap<SourceName, CapturedSource>,
    /// The run this run adopted, for a restore to a run or a reconcile.
    pub adopted_from: Option<RunId>,
}
```

```rust
// engine/src/sources/mod.rs

/// The stored capture of one source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapturedSource {
    /// The Parquet file with the source's rows as fetched.
    pub file: ArtifactRef,
    /// The number of rows in `file`.
    pub rows: u64,
}
```

- `CapturedSource` is defined in `sources`, because `SourceReader::capture_sources` builds it and `sources` shall not depend on a stage module. `stage::capture` re-exports it, so the name of the contracts' module tree holds.
- Field names in JSON are the Rust names, as the contract "JSON form" requires. A marker with an unknown field fails to read with `stored_json_invalid`, as `RunInput` and `Current` do (`shared-run.md` section 3.1).
- `captured_at` is written as RFC 3339 text with as many fraction digits as the value has. The round trip through the marker keeps the value.
- `sources` is a JSON object keyed by source name. It uses the serde form of `SourceName` as text, which the contracts add to the definition crate.
- `adopted_from` is the text form of `RunId`, or `null`.

The body of `runs/{run}/capture/_done.json` for S1 run 1 has this shape:

```json
{
  "captured_at": "2026-11-06T12:00:00Z",
  "sources": {
    "aircraft": {
      "file": { "version": "v1", "value": { "key": "tenants/…/artifacts/sha256/ab/ab….parquet", "sha256": "ab…", "size": 1042, "format": "parquet" } },
      "rows": 2
    },
    "airfields": { "file": { "version": "v1", "value": { "…": "…" } }, "rows": 2 }
  },
  "adopted_from": null
}
```

No other new type exists. `CaptureRun` (`engine/src/sources/mod.rs:90`) stays as it is and is built by the stage.

## 4. Functions

Errors are built with the functions of `run/error.rs` (`shared-run.md` section 4.2). `Code::X.report()` is a new report of the code's kind that carries the code. `Code::X.wrap(report)` puts the code and its kind on top of an existing report. Tests read the code with `Code::of`. A report of an existing error type that more than one stage meets is mapped with `error::artifact`, `error::capture`, `error::statement`, `error::preparation`, `error::open`, `error::close`, `error::scratch` or `error::stored_json`.

### 4.1 `capture`

File `stage/capture/mod.rs`. The signature is the one in the contract "Stage functions".

```rust
pub async fn capture(
    context: &RunContext,
    input: &RunInput,
    sources: &SourceReader,
    secrets: &impl SecretStore,
) -> Result<CaptureOutput, Report<StageError>>;
```

Steps:

1. Build the marker key `{root}/runs/{input.run}/capture/_done.json` with `context.namespace.capture_output(Uuid::from(input.run))` (4.10).
2. Call `finished` with that key. If it returns an output, return it. Nothing else is read or written.
3. Build the output by operation:
   - `Operation::Apply`: call `apply` (4.2). `resend_all` is not read.
   - `Operation::Restore { target: Some(run) }` and `Operation::Reconcile { target: run }`: call `adopt` with `run` (4.4).
   - `Operation::Restore { target: None }`: call `empty` (4.5).
4. Call `finish` with the key and the output, and return what `finish` returns. When another attempt stored its output first, this is that attempt's output.

```rust
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %input.run))]
pub async fn capture(context, input, sources, secrets) -> Result<CaptureOutput, Report<StageError>> {
    let key = context.namespace.capture_output(Uuid::from(input.run));
    if let Some(output) = finished::<CaptureOutput>(context, &key).await? {
        return Ok(output);
    }
    let output = match input.operation {
        Operation::Apply { .. } => apply(context, input, sources, secrets).await?,
        Operation::Restore { target: Some(target) } | Operation::Reconcile { target } => {
            adopt(context, target).await?
        }
        Operation::Restore { target: None } => empty(context),
    };
    finish(context, &key, &output).await
}
```

Errors: the errors of `apply` and `adopt`. An error of `finished` or `finish` is returned unchanged.

The stage does not read `current.json`, `RunInput::namespace` or `RunInput::allow_mass_archive`.

### 4.2 `apply`

File `stage/capture/apply.rs`.

```rust
pub(super) async fn apply(
    context: &RunContext,
    input: &RunInput,
    sources: &SourceReader,
    secrets: &impl SecretStore,
) -> Result<CaptureOutput, Report<StageError>>;
```

Steps:

1. Read the clock once. This value becomes `captured_at`. It is read before any source, so it is earlier than every row read in this attempt.
2. Parse the definition with `input.parse_definition()` (`shared-run.md` section 4.9). It fails with `invalid_definition`. When it returns `None`, fail with `invalid_definition`: `start` stores a definition for every apply run, so this case does not occur.
3. Build the `CaptureRun` from `input.web`, `input.actor` and `input.run`. `Uuid::from` exists for `WebId` (`libs/@blockprotocol/type-system/rust/src/principal/actor_group/web.rs:58`), for `ActorEntityUuid` (`libs/@blockprotocol/type-system/rust/src/principal/actor/mod.rs:70`) and for `RunId`.
4. If the definition has a source of kind `SourceKind::Sql`, open a workspace with `context.open_workspace` (4.3). Otherwise open none.
5. Call `SourceReader::capture_sources` (4.6) with the workspace, the definition, `context.namespace`, the `CaptureRun` and `secrets`.
6. Close the workspace with `workspace.close().await.map_err(error::close)`, whether step 5 succeeded or failed.
7. If step 5 failed, return its error, mapped with `source_error` (4.11). Otherwise, if the close failed, return that error.
8. Return `CaptureOutput { captured_at, sources, adopted_from: None }`.

```rust
pub(super) async fn apply(context, input, sources, secrets) -> Result<CaptureOutput, Report<StageError>> {
    let captured_at = context.clock.now();
    let definition = input
        .parse_definition()?
        .ok_or_else(|| Code::InvalidDefinition.report())?;
    let run = CaptureRun {
        web: Uuid::from(input.web),
        actor: Uuid::from(input.actor),
        id: Uuid::from(input.run),
    };
    let workspace = if reads_sql(&definition) {
        Some(context.open_workspace(definition.variables().clone()).await?)
    } else {
        None
    };
    let captured = sources
        .capture_sources(workspace.as_ref(), &definition, &context.namespace, run, secrets)
        .await;
    let closed = match workspace {
        Some(workspace) => workspace.close().await.map_err(error::close),
        None => Ok(()),
    };
    let sources = captured.map_err(source_error)?;
    closed?;
    Ok(CaptureOutput { captured_at, sources, adopted_from: None })
}

fn reads_sql(definition: &Definition) -> bool {
    definition
        .sources()
        .values()
        .any(|source| matches!(source.kind, SourceKind::Sql { .. }))
}
```

Errors:

| Condition | Kind | Code |
| --- | --- | --- |
| `input.definition` is `None`, or the text does not parse. | Permanent | `invalid_definition` |
| The workspace cannot be opened or closed. | Retryable | `workspace_unavailable` |
| `capture_sources` fails. | Section 6 | Section 6 |

Facts about an apply run that follow from the called code:

- **Which sources are read.** `capture_sources` visits `Definition::sources()` (`definition/src/definition/mod.rs:97`) in name order and skips every source of kind `Checkpoint`. A definition with a source that no pipeline reads does not parse (`IssueKind::UnusedSource`, `definition/src/issue.rs:178`), so every readable source is read by a pipeline.
- **Sources are read one after another.** This is the existing behaviour.
- **A source bound to the run is not read again.** When an earlier attempt stored a capture for the same run, source name and source fingerprint, that capture is used. No source is read and no secret is resolved for it.
- **A new run reads every source again.** The binding key holds the run ID. Two runs that capture the same bytes store one object, because the file is stored under its sha256.
- **Secrets.** `secrets` is passed to `capture_sources` unchanged. A secret is resolved with `input.web` and `input.actor`, once per source and attempt, and only for a `Postgres` source and for a `Rest` source with `auth` (`engine/src/sources/mod.rs:240-256`). Nothing caches a secret between attempts, so a later attempt reads a rotated secret. The stage adds no text to a report from the secret store.
- **Local files.** The capture files are written to a directory that `ArtifactStorage::stage` creates (`engine/src/storage/artifact/mod.rs:80`). `capture_sources` deletes it before it returns. The stage itself stores and downloads no file outside the source reader, so it calls `RunContext::publish`, `RunContext::fetch` and `RunContext::scratch_file` only through `finished` and `finish`.
- **One storage root.** The capture files and bindings are written through the `ArtifactStorage` of the `SourceReader`, and the marker through `context.storage`. `ArtifactStorage` derives `Clone`, and the runner builds the `SourceReader` from a clone of `context.storage`, so both use one root. The bindings use `context.namespace`, which the runner builds from `RunRequest::connector`. `start` fails with `integration_mismatch` when the definition names another connector than the request, so the definition's connector and `context.namespace` agree.

### 4.3 The workspace of an apply run

An SQL source is captured with `Workspace::capture` (`engine/src/workspace/mod.rs:189`), so an apply run with an SQL source needs a workspace. No other source kind uses one.

`apply` opens it with `context.open_workspace(definition.variables().clone())` (`shared-run.md` section 4.5). The variables are the definition's `vars`, because an SQL source reads them as `$NAME` parameters (`definition/src/definition/mod.rs:92`). `open_workspace` places the database file at a new path in `context.scratch`, so two attempts of one run never open the same file. The file stays there until the caller deletes `scratch`. `apply` closes the workspace with `workspace.close().await.map_err(error::close)`.

Errors: `workspace_unavailable` from `error::open` and `error::close`.

The stage creates no table in this workspace. `Workspace::capture` runs one `SELECT` and writes its rows to a file outside the workspace.

### 4.4 `adopt`

File `stage/capture/adopt.rs`.

```rust
/// Returns the capture output of `target` as the output of the current run.
pub(super) async fn adopt(
    context: &RunContext,
    target: RunId,
) -> Result<CaptureOutput, Report<StageError>>;
```

Steps:

1. Build the marker key of the target run, `{root}/runs/{target}/capture/_done.json`.
2. Call `finished` with that key. If it returns nothing, fail with `target_missing`.
3. Return the target's `captured_at` and `sources` with `adopted_from: Some(target)`.

```rust
pub(super) async fn adopt(context, target) -> Result<CaptureOutput, Report<StageError>> {
    let key = context.namespace.capture_output(Uuid::from(target));
    let Some(adopted) = finished::<CaptureOutput>(context, &key).await? else {
        return Err(Code::TargetMissing.report());
    };
    Ok(CaptureOutput {
        captured_at: adopted.captured_at,
        sources: adopted.sources,
        adopted_from: Some(target),
    })
}
```

Errors:

| Condition | Kind | Code |
| --- | --- | --- |
| The target run has no `capture/_done.json`. | Permanent | `target_missing` |
| `finished` fails. | As returned | As returned |

Rules:

- `adopted_from` is always the run named in the operation. When that run adopted another run, `captured_at` and `sources` are still copied as they are stored, so they are those of the run that read the sources.
- The function reads one marker. It reads no source, resolves no secret, parses no definition, opens no workspace and writes no capture binding. The only object the run writes under `runs/{run}/capture/` is `_done.json`.
- The function does not check that the adopted files still exist. Nothing is deleted (D10). A missing file fails stage 2 when it loads the file.

### 4.5 `empty`

File `stage/capture/mod.rs`. A restore to empty has no definition and no sources.

```rust
/// Returns the output of a run that has no sources.
fn empty(context: &RunContext) -> CaptureOutput {
    CaptureOutput {
        captured_at: context.clock.now(),
        sources: BTreeMap::new(),
        adopted_from: None,
    }
}
```

The function has one step and returns no error. `input.definition` is not read.

### 4.6 `SourceReader::capture_sources`

File `engine/src/sources/mod.rs`, today at `:203`.

```rust
/// Captures every readable source of `definition`, or uses the capture already bound to this
/// run and source, and returns the stored file and the row count of each.
pub async fn capture_sources(
    &self,
    workspace: Option<&Workspace>,
    definition: &Definition,
    namespace: &ArtifactNamespace,
    run: CaptureRun,
    resolver: &impl SecretStore,
) -> Result<BTreeMap<SourceName, CapturedSource>, Report<SourceError>>;
```

Steps:

1. Create the staging directory with `ArtifactStorage::stage`, as today (`engine/src/sources/mod.rs:211-215`).
2. For each source in `definition.sources()`, skip a source of kind `Checkpoint` (`:218-220`).
3. Build the binding key with `namespace.capture(run.id, name, &fingerprint(source))`. `namespace` is the argument. The function no longer builds a namespace from `run.web` and the definition's connector (`:210`).
4. Call `CaptureStore::restore` with the key (4.8). If it returns a capture, use it and continue with the next source.
5. Otherwise call `read_source` (4.7) with a new file path from `ArtifactStorage::staging_file` (`engine/src/storage/artifact/mod.rs:95`), then `CaptureStore::store` (4.8).
6. Return the map. The staging directory is dropped here and its files are deleted.

```rust
pub async fn capture_sources(&self, workspace, definition, namespace, run, resolver)
    -> Result<BTreeMap<SourceName, CapturedSource>, Report<SourceError>>
{
    let staging = self.store.captures.stage().change_context(SourceError::Write)?;
    let mut captures = BTreeMap::new();
    for (name, source) in definition.sources() {
        if source.checkpoint().is_some() {
            continue;
        }
        let key = namespace.capture(run.id, name, &fingerprint(source));
        let captured = match self.store.restore(&key, staging.path()).await? {
            Some(captured) => captured,
            None => {
                let target = ArtifactStorage::staging_file(staging.path(), Format::Parquet);
                let capture = self.read_source(workspace, source, run, resolver, target).await?;
                self.store.store(namespace, &key, &capture, staging.path()).await?
            }
        };
        captures.insert(name.clone(), captured);
    }
    Ok(captures)
}
```

Errors: every `SourceError` the function returns today, with the same contexts. Section 6 gives the kind and code of each. The `#[tracing::instrument]` attribute stays (`:202`).

### 4.7 `SourceReader::read_source`

File `engine/src/sources/mod.rs`. New and private. It holds the `match` on the source kind that is inside `capture_sources` today (`:228-260`).

```rust
/// Reads the rows of `source` into a new Parquet file at `target`.
async fn read_source(
    &self,
    workspace: Option<&Workspace>,
    source: &Source,
    run: CaptureRun,
    resolver: &impl SecretStore,
    target: PathBuf,
) -> Result<SourceCapture, Report<SourceError>>;
```

Steps, by source kind:

1. `Sql`: fail with `SourceError::Configuration` when `workspace` is `None`. Otherwise call `Workspace::capture` with the query and `target`, and change the error context to `SourceError::Query`.
2. `Local`: resolve the file with `CaptureStore::local_file` (`:126`) and copy it with `SourceCapture::copy_from` (`engine/src/capture.rs:72`) on a blocking thread.
3. `Postgres`: read the secret named by `source.credentials`, then call `postgres::capture` (`engine/src/sources/postgres.rs:31`) with `self.limits`.
4. `Rest`: read the secret when `endpoint.auth` is set, then call `rest::capture` (`engine/src/sources/rest.rs:86`).
5. `Checkpoint`: not reached, as today (`:257-259`).

```rust
async fn read_source(&self, workspace, source, run, resolver, target)
    -> Result<SourceCapture, Report<SourceError>>
{
    match &source.kind {
        SourceKind::Sql { query, .. } => workspace
            .ok_or_else(|| Report::new(SourceError::Configuration))?
            .capture(query.as_ref().into(), target)
            .await
            .change_context(SourceError::Query),
        // The arms for `Local`, `Postgres`, `Rest` and `Checkpoint` are the lines 233-259 of today.
    }
}
```

Errors: as today. The one new case is `SourceError::Configuration` for an SQL source without a workspace. The stage never produces it, because `apply` opens a workspace when the definition has an SQL source.

### 4.8 `CaptureStore::restore` and `CaptureStore::store`

File `engine/src/sources/mod.rs`. Both are private.

```rust
/// Returns the capture bound at `key`, if there is one, after downloading it into `staging`
/// to read its row count.
async fn restore(
    &self,
    key: &ArtifactKey,
    staging: &Path,
) -> Result<Option<CapturedSource>, Report<SourceError>>;

/// Stores `capture` as an artifact and binds it at `key`. Returns the capture another attempt
/// bound first, if there is one.
async fn store(
    &self,
    namespace: &ArtifactNamespace,
    key: &ArtifactKey,
    capture: &SourceCapture,
    staging: &Path,
) -> Result<CapturedSource, Report<SourceError>>;
```

Steps of `restore` (today at `:146-167`):

1. Read the reference bound at `key` with `ArtifactStorage::bound` (`engine/src/storage/artifact/binding.rs:50`). Return `None` when there is none.
2. Download the file with `ArtifactStorage::materialize` (`engine/src/storage/artifact/mod.rs:142`) and open it with `SourceCapture::open` (`engine/src/capture.rs:51`).
3. Return `CapturedSource { file: artifact, rows: capture.rows() }`. Today the function returns the `SourceCapture` and drops the reference.

Steps of `store` (today inline at `:261-277`):

1. Store the file with `ArtifactStorage::publish` under `namespace.artifacts()` as `Format::Parquet` (`engine/src/storage/artifact/mod.rs:110`).
2. Bind the reference at `key` with `ArtifactStorage::bind` (`engine/src/storage/artifact/binding.rs:28`).
3. On `Bound::Created`, return `CapturedSource { file: artifact, rows: capture.rows() }`.
4. On `Bound::Exists`, call `restore` and return its capture. Fail with `SourceError::Read` when `restore` returns `None`.

```rust
async fn restore(&self, key, staging) -> Result<Option<CapturedSource>, Report<SourceError>> {
    let Some(artifact) = self.captures.bound(key).await.change_context(SourceError::Read)? else {
        return Ok(None);
    };
    let path = self.captures.materialize(&artifact, staging).await.change_context(SourceError::Read)?;
    let capture = SourceCapture::open(path).change_context(SourceError::Read)?;
    Ok(Some(CapturedSource { file: artifact, rows: capture.rows() }))
}

async fn store(&self, namespace, key, capture, staging) -> Result<CapturedSource, Report<SourceError>> {
    let artifact = self
        .captures
        .publish(&namespace.artifacts(), capture.path(), Format::Parquet)
        .await
        .change_context(SourceError::Write)?;
    match self.captures.bind(key, &artifact).await.change_context(SourceError::Write)? {
        Bound::Created => Ok(CapturedSource { file: artifact, rows: capture.rows() }),
        Bound::Exists => self
            .restore(key, staging)
            .await?
            .ok_or_else(|| Report::new(SourceError::Read)),
    }
}
```

Errors: `SourceError::Read` and `SourceError::Write`, with the `ArtifactError` or `CaptureError` kept below them, as today.

`rows` is the row count in the Parquet footer (`engine/src/capture.rs:88`). It is the count before any SQL step, which is what the source coverage rule of the contracts reads.

### 4.9 `SourceReader::capture_table` and `SourceReader::stage_sources`

File `engine/src/sources/mod.rs`. Today `stage_sources` takes `&SourceCaptures` (`:295-299`), a value that only `capture_sources` builds, and loads each local capture file itself (`:311-314`). Stage 2 has file references from `CaptureOutput`. The loading therefore leaves the function.

```rust
/// Returns the workspace table that the capture of `source` is loaded into before staging.
#[must_use]
pub fn capture_table(source: &SourceName) -> Box<str>;   // "_capture/{source}"

/// Stages the loaded capture of every readable source as `_source/{source}`.
///
/// The capture of each readable source must be loaded into its `capture_table` first.
pub async fn stage_sources(
    workspace: &Workspace,
    definition: &Definition,
) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>>;
```

Steps of `stage_sources`:

1. For each source with a primary key, call `Workspace::stage_table` with the table `_source/{name}`, the query `SELECT * FROM "_capture/{name}"`, the primary key and `TableAssertions::default()`, as today (`:315-323`).
2. Return the map from source name to `_source/{name}`.

```rust
pub async fn stage_sources(workspace, definition) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>> {
    let mut tables = BTreeMap::new();
    for (name, source) in definition.sources() {
        let Some(primary_key) = source.primary_key() else {
            continue;
        };
        let raw = Self::capture_table(name);
        let staged = format!("_source/{name}");
        workspace
            .stage_table(
                staged.clone().into_boxed_str(),
                format!("SELECT * FROM {}", Identifier::new(&raw)).into_boxed_str(),
                primary_key.clone(),
                TableAssertions::default(),
            )
            .await
            .change_context(SourceError::Load)?;
        tables.insert(name.clone(), staged.into_boxed_str());
    }
    Ok(tables)
}
```

Errors: `SourceError::Load`, also when the capture table does not exist.

Stage 1 calls neither function. Stage 2 calls, for each entry of `CaptureOutput::sources`, `load_table(context, workspace, &captured.file, SourceReader::capture_table(name))` (contract "Tables as files"), and then `SourceReader::stage_sources(workspace, &definition)` once. `stage-2-rows.md` covers that side.

### 4.10 `ArtifactNamespace::capture` and `ArtifactNamespace::capture_output`

File `engine/src/storage/namespace.rs`.

`shared-run.md` section 4.3 specifies both builders. Both take the run as a `Uuid`, and a caller passes `Uuid::from(run_id)`.

```rust
/// The key the capture of `source` in the run `run` is bound to.
pub(crate) fn capture(&self, run: Uuid, source: &SourceName, fingerprint: &str) -> ArtifactKey;

/// The key of the marker of stage 1 in the run `run`.
pub(crate) fn capture_output(&self, run: Uuid) -> ArtifactKey;
```

- `capture` keeps its signature (`:33`). Its key moves from `{root}/captures/{run}/{source}.{fingerprint}.json` to `{root}/runs/{run}/capture/{source}.{fingerprint}.json` (C5).
- `capture_output` returns `{root}/runs/{run}/capture/_done.json`. No binding key equals the marker key, because a source name starts with a letter or a digit.

Stage 1 calls `capture` inside `capture_sources` and `capture_output` in `capture` and `adopt`.

### 4.11 `source_error`

File `stage/capture/error.rs`. `SourceError` is the one error type that only stage 1 meets, so this is the one mapping function of the stage. Every other error type is mapped by the shared functions of `run/error.rs`.

```rust
pub(super) fn source_error(report: Report<SourceError>) -> Report<StageError>;

fn source_code(report: &Report<SourceError>) -> Code;
fn frame_code(report: &Report<SourceError>, fallback: Code) -> Code;
const fn temporary(status: u16) -> bool;
```

`source_error` follows the three steps of the shared mapping functions (`shared-run.md` section 4.2): it reads the report, picks a code with `source_code`, and returns `code.wrap(report)`. The frames below stay, so the cause is still printed. `source_code` reads the top context with `Report::current_context`. For `Query`, `Read`, `Write` and `Load` it calls `frame_code`, which reads the frame of a shared error type below the `SourceError` with `Report::downcast_ref` (`libs/error-stack/src/report.rs:443`, `:702`) and gives it the code of the shared table (`shared-run.md` section 6). Section 6 of this file is the table these functions implement.

```rust
pub(super) fn source_error(report: Report<SourceError>) -> Report<StageError> {
    let code = source_code(&report);
    code.wrap(report)
}

fn source_code(report: &Report<SourceError>) -> Code {
    use SourceError::*;

    match report.current_context() {
        Configuration | Destination => Code::SourceConfiguration,
        Query => frame_code(report, Code::WorkspaceUnavailable),
        Secret | SecretEntityCount { .. } | SecretEntity | SecretExpiry | SecretExpired
        | SecretPath | SecretValue => Code::SourceCredentials,
        SecretRequest { .. } => Code::SecretUnavailable,
        SecretStatus { status, .. } if temporary(*status) => Code::SecretUnavailable,
        SecretStatus { .. } => Code::SourceCredentials,
        SecretResponse { .. } if report.contains::<reqwest::Error>() => Code::SecretUnavailable,
        SecretResponse { .. } => Code::SourceCredentials,
        Postgres | Request => Code::SourceUnavailable,
        Status { status: 401 | 403 } => Code::SourceCredentials,
        Status { status } if temporary(*status) => Code::SourceUnavailable,
        Status { .. } | Response | Pagination => Code::SourceResponse,
        Read | Write | Load => frame_code(report, Code::StorageUnavailable),
    }
}

fn frame_code(report: &Report<SourceError>, fallback: Code) -> Code {
    if let Some(error) = report.downcast_ref::<ArtifactError>() {
        return match error {
            ArtifactError::Mismatch => Code::StorageMismatch,
            ArtifactError::Read | ArtifactError::Write => Code::StorageUnavailable,
        };
    }
    let statement = report.downcast_ref::<StatementError>().map(error::statement_code);
    match report.downcast_ref::<CaptureError>() {
        Some(CaptureError::Query) => statement.unwrap_or(Code::WorkspaceUnavailable),
        Some(
            CaptureError::Read | CaptureError::Write | CaptureError::SyncDirectory { .. }
            | CaptureError::Exists { .. } | CaptureError::WorkspaceFile { .. },
        ) => Code::ScratchUnavailable,
        Some(CaptureError::DiskUsage | CaptureError::Cancelled | CaptureError::Stopped) => {
            Code::WorkspaceUnavailable
        }
        None => statement.unwrap_or(fallback),
    }
}

const fn temporary(status: u16) -> bool {
    matches!(status, 408 | 429) || status >= 500
}
```

`frame_code` repeats the `ArtifactError` and `CaptureError` rows of the shared table and calls `error::statement_code` for a `StatementError`, because the shared mapping functions take a report whose top context is their own type (see "Contract problems").

These functions return no error of their own.

Stage 1 adds these variants to `Code` (`shared-run.md` section 3.3), with their entries in `Code::ALL`:

| Variant | Text | Kind | Condition |
| --- | --- | --- | --- |
| `SourceConfiguration` | `source_configuration` | Permanent | The definition describes a source that cannot be read: a local key outside the local root, a REST URL or header that is not valid, an address that is not public, or a next link to another origin. |
| `SourceCredentials` | `source_credentials` | Permanent | The secret of a source is missing, expired, of the wrong shape or not readable by the actor, or the source refuses the credentials. |
| `SourceResponse` | `source_response` | Permanent | A REST source answers with a status that is not temporary, or with a body the reader cannot use. |
| `SourceUnavailable` | `source_unavailable` | Retryable | A REST or Postgres source cannot be reached, or answers with a temporary status. |
| `SecretUnavailable` | `secret_unavailable` | Retryable | The Graph or Vault cannot be reached while a secret is read, or answers with a temporary status. |

## 5. Existing code

### Code the stage changes or uses

| Path:line | Item | Change |
| --- | --- | --- |
| `engine/src/sources/mod.rs:203` | `SourceReader::capture_sources` | Old: `(&self, workspace: &Workspace, definition: &Definition, run: CaptureRun, resolver: &impl SecretStore) -> Result<SourceCaptures, Report<SourceError>>`. New: `(&self, workspace: Option<&Workspace>, definition: &Definition, namespace: &ArtifactNamespace, run: CaptureRun, resolver: &impl SecretStore) -> Result<BTreeMap<SourceName, CapturedSource>, Report<SourceError>>`. |
| `engine/src/sources/mod.rs:228-260` | The `match` on the source kind | Moves to the new private `read_source` (4.7). The SQL arm reads the workspace from the option. |
| `engine/src/sources/mod.rs:261-277` | Publish, bind, and the case that another attempt bound first | Moves to the new private `CaptureStore::store` (4.8). |
| `engine/src/sources/mod.rs:146` | `CaptureStore::restore` | Old: `(&self, key: &ArtifactKey, staging: &Path) -> Result<Option<SourceCapture>, Report<SourceError>>`. New: the same parameters, `-> Result<Option<CapturedSource>, Report<SourceError>>`. |
| `engine/src/sources/mod.rs:172` | `SourceCaptures` | Removed. Nothing reads it after the change to `stage_sources`. |
| `engine/src/sources/mod.rs:295` | `SourceReader::stage_sources` | Old: `(workspace: &Workspace, definition: &Definition, captures: &SourceCaptures) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>>`. New: `(workspace: &Workspace, definition: &Definition) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>>`. The call of `load_capture` (`:311-314`) is removed. |
| `engine/src/sources/mod.rs` | `SourceReader::capture_table` | New: `pub fn capture_table(source: &SourceName) -> Box<str>`. |
| `engine/src/sources/mod.rs` | `CapturedSource` | New (section 3). |
| `engine/src/sources/mod.rs:90` | `CaptureRun` | Used as is. The stage builds it from the `RunInput`. |
| `engine/src/sources/mod.rs:35` | `SourceError` | Used as is. |
| `engine/src/sources/mod.rs:82`, `:98`, `:111`, `:126`, `:186` | `CaptureLimits`, `CaptureStore`, `CaptureStore::new`, `CaptureStore::local_file`, `SourceReader::new` | Used as is. |
| `engine/src/sources/fingerprint.rs:20` | `fingerprint` | Used as is. |
| `engine/src/sources/rest.rs:86`, `engine/src/sources/postgres.rs:31` | `rest::capture`, `postgres::capture` | Used as is. |
| `engine/src/sources/http/mod.rs:152-155` | The read of the response body in `fetch` | A failed read of a body chunk returns `SourceError::Request` in place of `SourceError::Response`. A body that is too large (`:157-159`) or is not JSON (`:162`) keeps `SourceError::Response`. With this change `Request` means the transport failed and `Response` means the content is invalid. |
| `engine/src/sources/secrets/mod.rs:50` | `SecretStore` | Used as is. |
| `engine/src/storage/namespace.rs:33` | `ArtifactNamespace::capture` | The signature stays. The key moves to `{root}/runs/{run}/capture/{source}.{fingerprint}.json` (C5). `shared-run.md` section 4.3 specifies the change. |
| `engine/src/storage/namespace.rs` | `ArtifactNamespace::capture_output` | New: `pub(crate) fn capture_output(&self, run: Uuid) -> ArtifactKey`, specified in `shared-run.md` section 4.3. |
| `engine/src/storage/artifact/mod.rs:80`, `:95`, `:110`, `:142` | `ArtifactStorage::stage`, `staging_file`, `publish`, `materialize` | Used as is. |
| `engine/src/storage/artifact/binding.rs:14`, `:28`, `:50` | `Bound`, `ArtifactStorage::bind`, `ArtifactStorage::bound` | Used as is. |
| `engine/src/storage/artifact/reference.rs:37` | `ArtifactRef` | Used as is. |
| `engine/src/capture.rs:39`, `:51`, `:72`, `:88` | `SourceCapture`, `open`, `copy_from`, `rows` | Used as is. The file does not change. |
| `engine/src/workspace/mod.rs:189`, `:455` | `Workspace::capture`, `Workspace::close` | Used as is. The stage opens the workspace with `RunContext::open_workspace`, which calls `Workspace::open`. |
| `engine/src/capture.rs:13`, `engine/src/storage/mod.rs:16`, `engine/src/workspace/error.rs:49`, `:175`, `:259` | `CaptureError`, `ArtifactError`, `OpenError`, `StatementError`, `CloseError` | Used as is. `shared-run.md` section 6 gives their codes. |
| `engine/src/run/` | `RunInput::parse_definition`, `RunContext::open_workspace`, `finished`, `finish`, `Code`, `error::close` | Used as `shared-run.md` specifies them. |
| `engine/src/lib.rs:39-42` | The exports of `sources` | `SourceCaptures` leaves the list and `CapturedSource` joins it. |
| `engine/src/lib.rs:19-28` | The module list | `mod stage;` is added. Open question 6 covers how the stage functions are exported. |

### Capture rules of labs

`reference/labs.md` Part C lists the capture rules of labs under "Capture". This table says where each rule is in the monorepo and what the stage does.

| Rule | Labs | Monorepo | This pipeline |
| --- | --- | --- | --- |
| A source column with a reserved name fails. | `_op`, `_key` and `_before` fail the capture (`src/snapshot.rs:45-55`). | `stage_table` refuses `_op`, `_key` and `_content_hash` in any letter case with `PreparationError::ReservedColumn` (`engine/src/workspace/connection/staging.rs:75-84`). It runs when a capture is staged. The capture itself checks no name. | The check stays in `stage_table`, so a run with such a column fails in stage 2. The capture file holds the rows as fetched, which is what the contract asks for. Open question 3 covers the new engine columns. |
| A primary key column that the source lacks fails. | It fails the capture (`src/snapshot.rs:57-68`). | `stage_table` returns `PreparationError::MissingColumn` (`engine/src/workspace/connection/staging.rs:85-94`). The REST reader starts with the primary key columns and replaces them with the columns of the first row (`engine/src/sources/rest.rs:120`, `:268-271`), so a response without the key column gives a file without it. | The check stays in `stage_table`. The run fails in stage 2. |
| A REST source with no rows gives an empty capture. | Not kept: the capture fails (`src/connectors/rest_api.rs:161-163`, Part D item 15). | The reader stops at the first empty page and writes a file with no rows and the primary key columns as text (`engine/src/sources/rest.rs:147-149`, `:353-355`; test `empty_response_preserves_key_schema`, `:673`). | Used as is. `CapturedSource::rows` is 0. |
| A REST read stopped by a page limit. | A read stopped by `maxPages` counts as a full read (`src/connectors/rest_api.rs:225-231`, Part D item 16). | The same: the reader stops after `maxPages` pages and writes the file (`engine/src/sources/rest.rs:170-175`). Without `maxPages` it fails with `SourceError::Pagination` after 10,000 pages (`:32`, `:130-135`). | The first version keeps this. Nothing in the file or in `CapturedSource` says that the read was cut. Open question 1 covers it. |
| REST columns are text and nested values are JSON text. | `src/connectors/rest_api.rs:293-305`, `:328-332`. | The same (`engine/src/sources/rest.rs:300-310`, `:329-335`). | Used as is. |
| A REST next link stays on the endpoint's origin. | `src/connectors/rest_api.rs:407-436`. | The same, with `SourceError::Destination` (`engine/src/sources/rest.rs:191-193`). | Used as is. |
| A capture bound to a run is used by every later attempt. | `src/engine/source_capture.rs:115-127`. | The same (`engine/src/sources/mod.rs:223-226`). | Kept (4.6, 4.8). |
| The load time is the submission time. | `src/engine/source_capture.rs:176-179`. | No capture time exists. Not found. | `captured_at` (P14). |

### Limits on a capture

The stage adds no limit. These exist:

- **SQL source.** The workspace has the memory, temporary directory, disk and thread limits of `context.workspace`. The disk limit is checked after the capture query (`engine/src/workspace/connection/capture.rs:85-86`).
- **Postgres source.** `CaptureLimits` of the `SourceReader` sets the memory, temporary directory and thread limits of the connector's own database (`engine/src/sources/mod.rs:82`, `engine/src/sources/postgres.rs:145-166`).
- **REST source.** A response body is at most 16 MiB (`engine/src/sources/http/mod.rs:157-159`). A source has at most 1,024 columns (`engine/src/sources/rest.rs:35`, `:289-294`). A request times out after 60 seconds (`engine/src/sources/http/mod.rs:26`). A 429 is sent again up to ten times (`:136-147`).
- **Rows and bytes of a capture file.** Not found. No code limits either.

## 6. Error mapping

"B below A" and "A over B" both mean that B is a frame under the context A in the report. Rows that name a frame of `ArtifactError`, `CaptureError` or `StatementError` use the code that `shared-run.md` section 6 gives that frame.

| Error | Case | Kind | Code |
| --- | --- | --- | --- |
| `SourceError::Configuration` | Bad definition: a local key that leaves the local root, a REST URL or header name that is not valid, a Postgres host that is not valid. | Permanent | `source_configuration` |
| `SourceError::Destination` | Bad definition: a REST or Postgres address that is not public, or a next link to another origin. | Permanent | `source_configuration` |
| `SourceError::Query` over a `CaptureError` or a `StatementError` | The query of an SQL source fails. The code is the one the shared table gives the frame: `query_invalid` when the query cannot run as written, `data_invalid` when a value in its rows fails, `scratch_unavailable` when the file cannot be written, and `workspace_unavailable` for any other case. A query over the disk limit or the memory limit is `workspace_unavailable`. | Shared table | Shared table |
| `SourceError::Query` with no such frame | The workspace failed for a reason the report does not name. | Retryable | `workspace_unavailable` |
| `SourceError::Secret`, `SecretEntityCount`, `SecretEntity`, `SecretExpiry`, `SecretExpired`, `SecretPath`, `SecretValue` | Bad credentials: the secret is missing, expired, of the wrong shape, or not readable by the actor. | Permanent | `source_credentials` |
| `SourceError::SecretRequest` | Network failure: the Graph or Vault was not reached. | Retryable | `secret_unavailable` |
| `SourceError::SecretStatus` with status 408, 429 or 500 and above | The Graph or Vault is unavailable or limits the rate. | Retryable | `secret_unavailable` |
| `SourceError::SecretStatus` with any other status | Bad credentials: the Graph or Vault refuses the read. | Permanent | `source_credentials` |
| `SourceError::SecretResponse` over a `reqwest::Error` | Network failure: the response body was not received. | Retryable | `secret_unavailable` |
| `SourceError::SecretResponse`, any other case | The response does not have the expected shape. | Permanent | `source_credentials` |
| `SourceError::Request` | Network failure: the REST request or the read of its body failed. A host name that resolves to an address that is not public also fails here, inside the HTTP client. | Retryable | `source_unavailable` |
| `SourceError::Status` with status 401 or 403 | Bad credentials for the REST source. | Permanent | `source_credentials` |
| `SourceError::Status` with status 408, 429 or 500 and above | The REST server is unavailable or still limits the rate after ten retries. | Retryable | `source_unavailable` |
| `SourceError::Status` with any other status | Bad definition: the REST server refuses the request. | Permanent | `source_response` |
| `SourceError::Response` | Bad definition or limit exceeded: the body is not JSON, is larger than 16 MiB, has no row list at `resultsField`, or has more than 1,024 columns. | Permanent | `source_response` |
| `SourceError::Pagination` | Bad definition or limit exceeded: a page repeats, a next link is not valid, or 10,000 pages were read without `maxPages`. | Permanent | `source_response` |
| `SourceError::Postgres` | Network failure, bad credentials, a missing table or a failed extension load. The reader removes the cause on purpose, because DuckDB's message holds the connection string (`engine/src/sources/postgres.rs:167-209`). | Retryable | `source_unavailable` |
| `SourceError::Read` or `Write` over an `ArtifactError` | `ArtifactError::Read` or `Write` from `bound`, `materialize`, `publish`, `bind` or `stage` gives `storage_unavailable`. `ArtifactError::Mismatch` gives `storage_mismatch`: a stored capture does not match its reference, or another object is stored under the file's sha256 key. | Shared table | Shared table |
| `SourceError::Read` or `Write` over a `CaptureError` | A local source file is not a Parquet file, the copy failed, or a stored capture has no readable footer. The shared table gives `CaptureError::Read`, `Write` and the other file variants `scratch_unavailable`. | Retryable | `scratch_unavailable` |
| `SourceError::Read` or `Write` with no such frame | A local source file that does not exist or cannot be resolved. | Retryable | `storage_unavailable` |
| `SourceError::Load` | Not returned by `capture_sources`. | Retryable | `storage_unavailable` |
| `OpenError`, `CloseError` | `error::open` and `error::close` map them. A close fails after the captures of the attempt are bound, so the next attempt reads no source. | Retryable | `workspace_unavailable` |
| `parse_definition` fails, or an apply run has no definition | Bad definition. | Permanent | `invalid_definition` |
| No marker at the target run's key | The target of a restore or a reconcile has no capture output. | Permanent | `target_missing` |

`CaptureError` and `ArtifactError` reach `source_error` only as frames below a `SourceError`. The stage calls no storage function itself except `finished` and `finish`, which return `StageError` with the codes of `shared-run.md` section 4.6.

Cancel by the engine drops the stage call. No error is returned then. A capture that was bound before the drop is used by the next attempt.

## 7. Tests

### Fixtures of the stage tests

File `engine/src/stage/capture/tests.rs`. Every test uses a new `TempDir` with three directories: `artifacts` for the storage root, `local` for the local source root and `scratch` for `RunContext::scratch`.

- `context(directory, time)` builds a `RunContext` with `RunContext::new`, from `ArtifactStorage::local(&directory.join("artifacts"))`, the web, the connector, the scratch directory, `WorkspaceConfig::default()`, `SendSettings::default()` and `Box::new(FixedClock(time))`.
- `reader(context, directory)` builds a `SourceReader` with a clone of `context.storage` and `CaptureLimits::default()`, as the runner does, so the reader and the context use one root. The local source root is the `local` directory, as `reader` has it today (`engine/src/sources/tests.rs:150`).
- `NoSecrets` is the secret store that fails every read with `SourceError::Secret` (`engine/src/sources/tests.rs:86`). It becomes `pub(crate)`, and `mod tests` in `engine/src/sources/mod.rs:6-7` becomes `pub(crate) mod tests`, as `storage` has it (`engine/src/storage/mod.rs:4-5`).
- `RunInput::definition` is YAML text, so every definition of a stage test is written as text in the test.
- The web is `00000000-0000-4000-8000-000000000001` and the connector is `aviation`, as in `03-scenarios.md`. The storage root is then `tenants/00000000-0000-4000-8000-000000000001/integrations/615b1c9940913ae65656b12d3e9936aba1e0fdbfb11754db10afd6bcb52e8f59` (computed as the sha256 of `{web}:aviation`).
- Run `n` has the ID `RunId::from(Uuid::from_u128(n))` and the clock time `Tn`. As in "What a test compares" of `03-scenarios.md`, `T1` is `2026-11-06T12:00:00Z` and each later run is one hour later: `T2` is `13:00:00Z`, `T9` is `20:00:00Z`. An adopted capture keeps the time of the run it adopts.
- D0 is `definition/examples/aviation.yaml`.

A test that checks a kind and a code reads the kind from `Report::current_context` and the code with `Code::of`.

### `capture`

| Test | Input | Expected |
| --- | --- | --- |
| `capture_stores_the_marker` | Apply D0, run 1, `T1`. | `storage.bound` of `{root}/runs/00000000-0000-0000-0000-000000000001/capture/_done.json` returns a reference of `Format::Json`. The returned output equals the output that `finished` reads at that key. |
| `capture_returns_the_stored_output` | Apply, run 1, a definition with one SQL source `SELECT 7 AS id, uuid()::VARCHAR AS value`. First call at `T1`, second call at `T2` with a new context and reader. | Both calls return the same output. `captured_at` is `T1`. The file reference of `items` is the same in both, which shows that the second call read no source. The number of Parquet files under `artifacts/` is the same after both calls. |
| `capture_concurrent_attempts_agree` | The same definition. Two calls for run 1 with `tokio::join!`, one context at `T1` and one at `T2`. | Both calls succeed and return equal outputs. `captured_at` is `T1` or `T2`. |
| `capture_restore_to_empty` | `Operation::Restore { target: None }`, `definition: None`, run 4, `T4`. | `captured_at` is `T4`, `sources` is empty, `adopted_from` is `None`. No Parquet file is under `artifacts/`. |

### `apply`

| Test | Input | Expected |
| --- | --- | --- |
| `apply_captures_every_source` | Apply D0, run 1, `T1`. | `captured_at` is `T1`. `sources` has the keys `aircraft` and `airfields`, each with `rows` 2 and a file of `Format::Parquet`. `adopted_from` is `None`. The file of `aircraft`, loaded with `load_table`, has the columns `TAIL`, `MODEL`, `FIRST_FLIGHT`, `EMPTY_MASS`, `MASS_UNIT`, `HOME_BASE` and no column `_op` or `_key`. |
| `apply_empty_source_keeps_the_schema` | Apply D0 with `WHERE false` added to the `aircraft` query. | `sources["aircraft"].rows` is 0 and `sources["airfields"].rows` is 2. The loaded `aircraft` table has the six columns and no rows. |
| `apply_reads_definition_variables` | Apply a definition with `vars: { START: "7" }` and the SQL source `SELECT $START::INTEGER AS id`. | The stage succeeds and the loaded table holds one row with `id` 7. |
| `apply_skips_checkpoint_sources` | Apply a definition with the SQL source `items`, a pipeline on `items` that ends with the definition checkpoint `test/items`, and a second source `derived` with `checkpoint: test/items` read by a second pipeline. | `sources` has the one key `items`. |
| `apply_uses_a_bound_capture` | Apply a definition with one local source `items` (`local: items.parquet`), whose file holds one row. The test first calls `reader.capture_sources(None, &definition, &context.namespace, run, &NoSecrets)`, which binds the capture and writes no marker. It then deletes `local/items.parquet` and calls `capture`. | The stage succeeds, so the deleted file was not read. `sources["items"]` equals the `CapturedSource` that the direct call returned, with `rows` 1. `captured_at` is the time of the stage call. |
| `apply_retry_uses_finished_captures` | Apply a definition with the SQL source `first` (`SELECT 1 AS id, uuid()::VARCHAR AS value`) and the local source `second` (`local: second.parquet`). Attempt 1 runs while the file does not exist. The test then writes a one-row Parquet file to `local/second.parquet` and runs attempt 2. | Attempt 1 fails as Retryable with `storage_unavailable` and writes no marker. One Parquet file is under `artifacts/` after it. Attempt 2 succeeds with `rows` 1 for both sources. Two Parquet files are under `artifacts/` after it, so `first` was not read again. |
| `apply_invalid_definition` | Apply with `definition: Some("connector: [")`, and apply with `definition: None`. | Both fail as Permanent with `invalid_definition`. No marker exists. |
| `apply_bad_query` | Apply a definition with the SQL source `SELECT missing FROM nowhere`. | Fails as Permanent with `query_invalid`. No marker exists. |
| `apply_missing_credentials` | Apply a definition with one REST source at `https://unavailable.invalid` with bearer auth, the YAML of `remote_definition` (`engine/src/sources/tests.rs:119-140`), and `NoSecrets`. | Fails as Permanent with `source_credentials`. No marker exists. |

### `adopt`

| Test | Input | Expected |
| --- | --- | --- |
| `adopt_copies_the_target_output` | Run 1 applies D0 at `T1`. Run 3 is `Restore { target: Some(run 1) }` at `T3`. | The output of run 3 equals the output of run 1 with `adopted_from: Some(run 1)`. `captured_at` is `T1`. Under `{root}/runs/{run 3}/capture/` the one object is `_done.json`. The number of Parquet files under `artifacts/` is the same before and after run 3. |
| `adopt_reads_no_source` | The test writes one Parquet file to `context.scratch_file(Format::Parquet)`, stores it with `context.publish`, and stores a `CaptureOutput` for run 1 with `finish`, with that file as the source `items` and `captured_at` `T1`. Run 2 is `Reconcile { target: run 1 }` at `T2`, with `definition: Some("connector: [")` and `NoSecrets`. | The stage succeeds, so it parsed no definition and read no source. It returns `T1` and run 1's `sources` with `adopted_from: Some(run 1)`. |
| `adopt_of_an_adopted_run` | Run 1 applies at `T1`, run 3 restores to run 1 at `T3`, run 5 restores to run 3 at `T5`. | Run 5 has `adopted_from: Some(run 3)`, `captured_at` `T1` and run 1's `sources`. |
| `adopt_missing_target` | `Restore { target: Some(run 9) }` where run 9 has no marker. | Fails as Permanent with `target_missing`. No marker is written for the run. |

### `source_error`

Each case of `source_error_cases` builds a report by hand, passes it to `source_error`, and compares the kind of the result and `Code::of` of it. The test builds "A over B" as `Report::new(B).change_context(A)`. The shared mapping functions have their own tests (`shared-run.md` section 7.2).

| Report | Expected |
| --- | --- |
| `SourceError::Query` over `CaptureError::Cancelled` | Retryable, `workspace_unavailable` |
| `SourceError::Read` over `ArtifactError::Mismatch` | Permanent, `storage_mismatch` |
| `SourceError::Configuration` | Permanent, `source_configuration` |
| `SourceError::Destination` | Permanent, `source_configuration` |
| `SourceError::Query` over `CaptureError::Query` over `StatementError::InvalidQuery { error_type: QueryErrorType::Binder }` | Permanent, `query_invalid` |
| `SourceError::Query` over `CaptureError::Query` over `StatementError::InvalidData { error_type: DataErrorType::Conversion }` | Permanent, `data_invalid` |
| `SourceError::Query` over `CaptureError::DiskUsage` over `StatementError::DiskLimit { used: 3 MiB, limit: 2 MiB }` | Retryable, `workspace_unavailable` |
| `SourceError::Query` over `CaptureError::Query` over `StatementError::Failed` | Retryable, `workspace_unavailable` |
| `SourceError::Query` over `CaptureError::Write` | Retryable, `scratch_unavailable` |
| `SourceError::Query` with no lower frame | Retryable, `workspace_unavailable` |
| `SourceError::Secret` | Permanent, `source_credentials` |
| `SourceError::SecretExpired` | Permanent, `source_credentials` |
| `SourceError::SecretRequest { service: Vault }` | Retryable, `secret_unavailable` |
| `SourceError::SecretStatus { service: Vault, status: 503 }` | Retryable, `secret_unavailable` |
| `SourceError::SecretStatus { service: Graph, status: 403 }` | Permanent, `source_credentials` |
| `SourceError::SecretResponse { service: Graph }` with no lower frame | Permanent, `source_credentials` |
| `SourceError::Request` | Retryable, `source_unavailable` |
| `SourceError::Status { status: 401 }` | Permanent, `source_credentials` |
| `SourceError::Status { status: 429 }` | Retryable, `source_unavailable` |
| `SourceError::Status { status: 503 }` | Retryable, `source_unavailable` |
| `SourceError::Status { status: 404 }` | Permanent, `source_response` |
| `SourceError::Response` | Permanent, `source_response` |
| `SourceError::Pagination` | Permanent, `source_response` |
| `SourceError::Postgres` | Retryable, `source_unavailable` |
| `SourceError::Write` over `CaptureError::Read` | Retryable, `scratch_unavailable` |
| `SourceError::Write` over `ArtifactError::Write` | Retryable, `storage_unavailable` |
| `SourceError::Read` over `ArtifactError::Read` | Retryable, `storage_unavailable` |
| `SourceError::Read` with no lower frame | Retryable, `storage_unavailable` |

`temporary` returns `true` for 408, 429, 500 and 599, and `false` for 200, 400, 404 and 499.

### Scenarios

The stage runs in every run of every scenario of `03-scenarios.md`. These are the outputs. The row counts are the lengths of the `VALUES` lists of the run's definition.

| Scenario and run | Operation | `sources` and `rows` | `captured_at` | `adopted_from` | Sources read |
| --- | --- | --- | --- | --- | --- |
| S1 run 1 | Apply D0 | `aircraft` 2, `airfields` 2 | `T1` | `None` | Both |
| S1 run 2 | Apply D0 | `aircraft` 2, `airfields` 2 | `T2` | `None` | Both. The binding key holds the run ID, so run 1's bindings are not used. |
| S3 run 2 | Apply | `aircraft` 1, `airfields` 2 | `T2` | `None` | Both |
| S3 run 4 | Apply, `aircraft` returns no rows | `aircraft` 0, `airfields` 2 | `T4` | `None` | Both. The `aircraft` file has the six columns and no rows. |
| S3 run 5 | Apply | `aircraft` 0, `airfields` 2 | `T5` | `None` | Both. The output does not hold the coverage. Stage 2 reads it from the definition. |
| S7 run 2 | Apply | `aircraft` 2, `airfields` 2 | `T2` | `None` | Both. The send stage fails later. The capture output stays stored. |
| S7 run 3 | Apply D0 | `aircraft` 2, `airfields` 2 | `T3` | `None` | Both. Roll forward does not change stage 1. |
| S8 run 2 | Apply | `aircraft` 2, `airfields` 2 | `T2` | `None` | Both |
| S8 run 3 | Restore to run 1 | Run 1's entries, with run 1's file references | `T1` | Run 1 | None |
| S8 run 4 | Restore to empty | Empty | `T4` | `None` | None |
| S9 run 2 | Reconcile, target run 1 | Run 1's entries | `T1` | Run 1 | None |
| S9 run 3 | Apply | `aircraft` 1, `airfields` 2 | `T3` | `None` | Both |
| S9 run 4 | Reconcile, target run 3 | Run 3's entries | `T3` | Run 3 | None |

Every run of S2, S4, S5 and S6, and every apply run not listed, has `aircraft` 2 and `airfields` 2, its own `Tn` and no adopted run.

The case "A stage runs twice with the same input" of `03-scenarios.md` is the test `capture_returns_the_stored_output`.

### Existing tests

| Test | Path | Change |
| --- | --- | --- |
| `capture_retry_and_restore` | `engine/src/sources/tests.rs:177` | Port. The call becomes `capture_sources(None, &definition, &namespace, run, &NoSecrets)`. `None` is correct, because the definition has no SQL source. New assertions: the map has `items` with `rows` 1 and the bound reference. The staging part downloads the file with `materialize`, opens it with `SourceCapture::open`, loads it with `load_capture` into `SourceReader::capture_table(name)` and calls `stage_sources(&restored, &definition)`. The assertion on the staged row stays. |
| `concurrent_attempts_share_the_bound_capture` | `engine/src/sources/tests.rs:266` | Port. Both attempts pass `Some(&workspace)` and the namespace. The assertion becomes: both maps hold the same `CapturedSource` for `items`, with `rows` 1. The staging and the query are removed. |
| `capture_isolation` | `engine/src/sources/tests.rs:326` | Port. The calls pass `Some(&workspace)` and a namespace built from the web of the changed identity. The assertion stays. |
| `overlapping_roots`, `local_root_invalid_key`, `local_root_symlink` | `engine/src/sources/tests.rs:355`, `:374`, `:393` | No change. |
| New: `capture_sources_returns_file_and_rows` | `engine/src/sources/tests.rs` | `sql_definition()` gives `items` with `rows` 1 and a file of `Format::Parquet`. `storage.bound(namespace.capture(run.id, name, &fingerprint(source)))` returns the same reference. |
| New: `capture_sources_sql_needs_a_workspace` | `engine/src/sources/tests.rs` | `capture_sources(None, &sql_definition(), …)` fails with `SourceError::Configuration`. |
| New: `stage_sources_needs_a_loaded_capture` | `engine/src/sources/tests.rs` | `stage_sources` on a workspace without the table `_capture/items` fails with `SourceError::Load`. |
| `namespace_keys_are_stable` | `engine/src/storage/tests.rs:390` | Extend. The expected capture key becomes `{root}/runs/00000000-0000-0000-0000-000000000002/capture/items.fingerprint.json`. A new assertion expects `{root}/runs/00000000-0000-0000-0000-000000000002/capture/_done.json` from `capture_output(Uuid::from_u128(2))`. `{root}` is unchanged. |
| `bound_returns_the_bound_reference`, `bind_keeps_the_first_reference` | `engine/src/storage/tests.rs:120`, `:160` | No change. They build the key with the helper `capture` (`:100`), which follows the moved key. |
| All tests | `engine/tests/capture.rs` | No change. They test `Workspace::capture`, `Workspace::load_capture` and `SourceCapture`, which the stage uses as they are. `capture_empty_schema` (`:258`) is the file-level form of S3 run 4. |
| `empty_response_preserves_key_schema`, `pagination_stops_at_the_page_ceiling`, `pagination_honours_max_pages_beyond_the_ceiling` | `engine/src/sources/rest.rs:673`, `:620`, `:642` | No change. They hold the REST rules of section 5. |
| `fetch_does_not_retry_other_failures` | `engine/src/sources/http/response_tests.rs:56` | No change. Its case with a body that is not JSON still expects `SourceError::Response`. No test covers a failed read of a body chunk. Not found. |
| `retry_reads_rotated_credentials_and_reuses_completed_captures` | Labs `tests/worker_e2e_test.rs:65` | Port in part, as `apply_retry_uses_finished_captures`. The ported rule is that a second attempt does not read a source whose capture the first attempt bound. The rotated credential is not ported: the REST reader refuses a local test server (`engine/src/sources/http/mod.rs:63-80`), and the reader that takes a test client is private (`engine/src/sources/rest.rs:96`), so a stage test cannot read a REST source. |
| `source_identity_is_durable_and_recovery_never_recaptures_it` | Labs `src/orchestrator/run_artifacts.rs:250` | Covered by `capture_retry_and_restore` and `bind_keeps_the_first_reference`. |
| `retry_uses_admitted_bronze_instead_of_changed_live_source` | Labs `src/engine/batch_sync.rs:865` | Covered by `capture_returns_the_stored_output`. |

## 8. Open questions and contract problems

### Open questions

1. **A REST read cut by `maxPages`.** The capture counts as a full read, as in labs. A run over a source with `coverage: complete` then archives every entity past the page limit, or fails with `archive_limit` when they are more than the limit allows. A check in the definition crate that requires `coverage: partial` on a source with `maxPages` would close this. The check does not exist. Not found in `definition/src`.
2. **Errors that hide their cause.** `SourceError::Postgres` covers a failed connection and a wrong password, so a wrong password is retried until the engine's retry policy ends. `SourceError::Read` covers a missing local file and a failed storage read. `StatementError::Failed` covers an exceeded memory limit and an IO error. `CaptureError::Read` covers a local source file that is not a Parquet file and a damaged local copy. Section 6 maps each of them to Retryable. A separate variant for each cause would let the stage return Permanent where it applies.
3. **Reserved column names.** `stage_table` refuses `_op`, `_key` and `_content_hash`. The contracts add `_entity_id`, `_source_id`, `_left_entity_id`, `_right_entity_id`, `_row` and `_change` as engine columns. Whether a source column with one of these names is refused belongs to `stage-2-rows.md`.
4. **The capture time of a bound capture.** When attempt 2 uses a capture that attempt 1 bound, `captured_at` is the start of attempt 2 and the rows were read during attempt 1. This follows the contract rule. `captured_at` is then later than the read.
5. **The row count of a bound capture.** `restore` downloads the whole file to read the row count from its footer. This happens only in an attempt that follows a failed attempt. A binding that held the row count would avoid the download and would change a stored format.
6. **Exports.** `engine/src/lib.rs` has private modules and one flat `pub use` list. A flat export of a function named `capture` sits beside the private module `capture` (`engine/src/lib.rs:20`). The app needs `capture`, `CaptureOutput` and `CapturedSource`. The pass over all specs should fix one export form for the four stage functions.

### Contract problems

1. **Where `CapturedSource` is defined.** The module tree puts it in `stage/capture/`. This spec defines it in `sources/mod.rs` and re-exports it from `stage::capture` (section 3), because `SourceReader::capture_sources` builds it and `sources` does not depend on a stage module.
2. **`time` as a public dependency.** `CaptureOutput::captured_at` and `Clock::now` put `OffsetDateTime` into the engine's public API. `time` is a private dependency today (`engine/Cargo.toml:40`). The contracts do not say that it becomes public.
3. **Shared codes for frames below a `SourceError`.** The shared mapping functions take a report whose top context is their own type. A `SourceError` report holds `ArtifactError`, `CaptureError` and `StatementError` as lower frames, so stage 1 cannot call `error::artifact`, `error::capture` or `error::statement` on it. `frame_code` (4.11) therefore repeats the `ArtifactError` and `CaptureError` rows of `shared-run.md` section 6 and calls `statement_code`, which `shared-run.md` section 4.2 makes private. Change needed: `run/error.rs` makes `statement_code` `pub(crate)` and gives one `pub(crate)` function that returns the shared code of the first shared frame in a report of any context.
