use alloc::sync::Arc;
use core::{
    future::ready,
    sync::atomic::{AtomicUsize, Ordering},
};
use std::{
    fs,
    path::{Path, PathBuf},
};

use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{SecretReference, SourceName, Variables};
use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::{OffsetDateTime, macros::datetime};
use uuid::Uuid;

use super::{CaptureOutput, capture, source_error};
use crate::{
    ArtifactError, CaptureError, CaptureLimits, CaptureRun, CaptureStore, Clock, Code, FixedClock,
    Operation, RunContext, RunInput, SecretStore, SecretValue, SourceError, SourceReader,
    StageError,
    run::{
        marker,
        table::load_table,
        tests::{apply, context, run_id},
    },
    sources::tests::NoSecrets,
    start,
};

struct CountingClock(Arc<AtomicUsize>);

impl Clock for CountingClock {
    fn now(&self) -> OffsetDateTime {
        self.0.fetch_add(1, Ordering::SeqCst);
        datetime!(2026-11-06 12:00 UTC)
    }
}

fn reader(context: &RunContext, directory: &Path) -> SourceReader {
    let local = directory.join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    SourceReader::new(
        CaptureStore::new(&local, context.storage.clone()).expect("should open capture storage"),
        CaptureLimits::default(),
    )
}

fn definition(query: &str) -> String {
    format!(
        "connector: aviation
sources:
  items:
    sql: |
      {}
    primaryKey: [id]
pipelines:
  entities:
    - source: items
      steps: []
",
        query.replace('\n', "\n      ")
    )
}

async fn input(context: &RunContext, definition: &str) -> RunInput {
    start(context, apply(run_id(1), definition))
        .await
        .expect("should pin the input")
}

fn source(output: &CaptureOutput) -> &super::CapturedSource {
    output
        .sources
        .get(
            &"items"
                .parse::<SourceName>()
                .expect("should parse source name"),
        )
        .expect("should capture items")
}

async fn assert_unfinished(context: &RunContext, input: &RunInput) {
    assert!(
        context
            .storage
            .bound(&context.namespace.capture_output(input.run.into()))
            .await
            .expect("should read the capture marker")
            .is_none(),
        "should leave no completion marker"
    );
}

fn files(directory: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for entry in fs::read_dir(directory).expect("should read fixture directory") {
        let path = entry.expect("should read fixture entry").path();
        if path.is_dir() {
            found.extend(files(&path));
        } else {
            found.push(path);
        }
    }
    found
}

#[tokio::test]
async fn capture_marker_preempts_inputs() {
    let directory = TempDir::new().expect("should create test directory");
    let mut context = context(directory.path());
    let reads = Arc::new(AtomicUsize::new(0));
    context.clock = Box::new(CountingClock(Arc::clone(&reads)));
    let reader = reader(&context, directory.path());
    let mut input = input(
        &context,
        &definition("SELECT 7 AS id, uuid()::VARCHAR AS value"),
    )
    .await;
    let first = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should capture sources");
    assert_eq!(reads.load(Ordering::SeqCst), 1);
    let before = files(&directory.path().join("artifacts")).len();
    input.definition = Some("connector: [".into());
    input.operation = Operation::Reconcile { target: run_id(99) };
    assert_eq!(
        capture(&context, &input, &reader, &NoSecrets)
            .await
            .expect("should use the winning marker"),
        first
    );
    assert_eq!(
        reads.load(Ordering::SeqCst),
        1,
        "should not read the clock on marker replay"
    );
    assert_eq!(files(&directory.path().join("artifacts")).len(), before);
}

#[tokio::test]
async fn capture_concurrent_attempts_agree() {
    let directory = TempDir::new().expect("should create test directory");
    let first = context(directory.path());
    let mut second = context(directory.path());
    second.clock = Box::new(FixedClock(datetime!(2026-11-06 13:00 UTC)));
    let reader = reader(&first, directory.path());
    let input = input(
        &first,
        &definition("SELECT 7 AS id, uuid()::VARCHAR AS value"),
    )
    .await;
    let (left, right) = tokio::join!(
        capture(&first, &input, &reader, &NoSecrets),
        capture(&second, &input, &reader, &NoSecrets)
    );
    let output = left.expect("should complete the first attempt");
    assert_eq!(right.expect("should complete the second attempt"), output);
    assert_eq!(source(&output).rows, 1);
    assert_eq!(
        marker::finished::<CaptureOutput>(
            &first,
            &first.namespace.capture_output(input.run.into())
        )
        .await
        .expect("should read winner"),
        Some(output)
    );
}

#[tokio::test]
async fn capture_variables_and_checkpoints() {
    let directory = TempDir::new().expect("should create test directory");
    let context = context(directory.path());
    let reader = reader(&context, directory.path());
    let input = input(
        &context,
        "connector: aviation
vars: { START: '7' }
sources:
  items:
    sql: SELECT $START::INTEGER AS id
    primaryKey: [id]
  derived:
    checkpoint: test/items
pipelines:
  entities:
    - source: items
      steps:
        - id: saved
          checkpoint: test/items
    - source: derived
      steps: []
",
    )
    .await;
    let output = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should capture the SQL source");
    assert_eq!(
        output.sources.len(),
        1,
        "should omit pipeline-produced checkpoints"
    );
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open a consumer");
    load_table(&context, &workspace, &source(&output).file, "items".into())
        .await
        .expect("should load captured rows");
    let rows = workspace
        .query("SELECT id FROM items".into())
        .await
        .expect("should query captured rows");
    assert_eq!(rows.iter().collect::<Vec<_>>(), vec![&[Value::Int(7)][..]]);
    workspace.close().await.expect("should close the consumer");
}

#[tokio::test]
async fn capture_empty_schema() {
    let directory = TempDir::new().expect("should create test directory");
    let context = context(directory.path());
    let reader = reader(&context, directory.path());
    let input = input(
        &context,
        &definition("SELECT 7 AS id, NULL::VARCHAR AS value WHERE false"),
    )
    .await;
    let output = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should capture an empty source");
    assert_eq!(source(&output).rows, 0);
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open a consumer");
    load_table(&context, &workspace, &source(&output).file, "items".into())
        .await
        .expect("should load an empty capture");
    let rows = workspace
        .query("SELECT * FROM items".into())
        .await
        .expect("should query the empty capture");
    assert_eq!(
        rows.columns(),
        &[Box::<str>::from("id"), Box::<str>::from("value")]
    );
    assert_eq!(rows.iter().len(), 0);
    workspace.close().await.expect("should close the consumer");
}

#[tokio::test]
async fn capture_partial_retry_preserves_binding() {
    let directory = TempDir::new().expect("should create test directory");
    let mut context = context(directory.path());
    let reader = reader(&context, directory.path());
    let input = input(
        &context,
        "connector: aviation
sources:
  first:
    sql: SELECT 7 AS id, uuid()::VARCHAR AS value
    primaryKey: [id]
  second:
    local: second.parquet
    primaryKey: [id]
pipelines:
  entities:
    - source: first
      steps: []
    - source: second
      steps: []
",
    )
    .await;
    let failure = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect_err("should fail on the absent local source");
    assert_eq!(Code::of(&failure), Some(Code::StorageUnavailable));
    assert_eq!(*failure.current_context(), StageError::Retryable);
    assert_unfinished(&context, &input).await;
    let before: Vec<_> = files(&directory.path().join("artifacts"))
        .into_iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "parquet")
        })
        .collect();
    assert_eq!(
        before.len(),
        1,
        "should publish and bind the earlier source"
    );
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture writer");
    workspace
        .capture(
            "SELECT 11 AS id".into(),
            directory.path().join("local/second.parquet"),
        )
        .await
        .expect("should create the late local source");
    workspace
        .close()
        .await
        .expect("should close fixture writer");
    context.clock = Box::new(FixedClock(datetime!(2026-11-06 13:00 UTC)));
    let output = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should resume after repairing the source");
    assert_eq!(output.captured_at, datetime!(2026-11-06 13:00 UTC));
    assert_eq!(output.sources.len(), 2);
    assert!(output.sources.values().all(|captured| captured.rows == 1));
    let first = output
        .sources
        .get(
            &"first"
                .parse::<SourceName>()
                .expect("should parse source name"),
        )
        .expect("should retain first source");
    assert_eq!(
        directory.path().join("artifacts").join(first.file.key()),
        before[0]
    );
    assert_eq!(
        files(&directory.path().join("artifacts"))
            .iter()
            .filter(|path| path
                .extension()
                .is_some_and(|extension| extension == "parquet"))
            .count(),
        2
    );
    assert_eq!(
        fs::read_dir(directory.path().join("artifacts/.staging"))
            .expect("should inspect staging")
            .count(),
        0
    );
}

#[tokio::test]
async fn capture_local_retry_without_workspace() {
    let directory = TempDir::new().expect("should create test directory");
    let context = context(directory.path());
    let reader = reader(&context, directory.path());
    let input = input(
        &context,
        &definition("SELECT 7 AS id")
            .replace("sql: |\n      SELECT 7 AS id", "local: items.parquet"),
    )
    .await;
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture writer");
    workspace
        .capture(
            "SELECT 7 AS id".into(),
            directory.path().join("local/items.parquet"),
        )
        .await
        .expect("should write local capture");
    workspace
        .close()
        .await
        .expect("should close fixture writer");
    let captured = reader
        .capture_sources(
            None,
            &input
                .parse_definition()
                .expect("should parse definition")
                .expect("should have definition"),
            &context.namespace,
            CaptureRun {
                web: input.web.into(),
                actor: input.actor.into(),
                id: input.run.into(),
            },
            &NoSecrets,
        )
        .await
        .expect("should bind the local source");
    fs::remove_file(directory.path().join("local/items.parquet"))
        .expect("should remove the live source");
    let output = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should restore the bound source");
    assert_eq!(output.sources, captured);
}

#[tokio::test]
async fn capture_adoption_and_empty_restore() {
    let directory = TempDir::new().expect("should create test directory");
    let mut context = context(directory.path());
    let reader = reader(&context, directory.path());
    let mut input = input(&context, &definition("SELECT 7 AS id")).await;
    let original = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should capture target");
    let original_run = input.run;
    let reads = Arc::new(AtomicUsize::new(0));
    context.clock = Box::new(CountingClock(Arc::clone(&reads)));
    input.definition = Some("connector: [".into());
    input.run = run_id(2);
    input.operation = Operation::Reconcile {
        target: original_run,
    };
    let adopted = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should adopt without parsing or reading sources");
    assert_eq!(
        adopted,
        CaptureOutput {
            adopted_from: Some(original_run),
            ..original.clone()
        }
    );
    input.operation = Operation::Restore {
        target: Some(input.run),
    };
    input.run = run_id(3);
    let twice = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should adopt the immediate target");
    assert_eq!(
        twice,
        CaptureOutput {
            adopted_from: Some(run_id(2)),
            ..original
        }
    );
    assert_eq!(
        reads.load(Ordering::SeqCst),
        0,
        "should never read the clock during adoption"
    );
    let marker_path = directory.path().join("artifacts").join(
        context
            .namespace
            .capture_output(input.run.into())
            .to_string(),
    );
    assert_eq!(
        fs::read_dir(marker_path.parent().expect("should have marker directory"))
            .expect("should read adopted run directory")
            .count(),
        1,
        "should only bind the adopted completion marker"
    );
    input.run = run_id(4);
    input.operation = Operation::Restore { target: None };
    let empty = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect("should restore empty state without parsing");
    assert!(empty.sources.is_empty());
    assert_eq!(empty.adopted_from, None);
    assert_eq!(reads.load(Ordering::SeqCst), 1);
    input.run = run_id(5);
    input.operation = Operation::Restore {
        target: Some(run_id(99)),
    };
    let failure = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect_err("should require an existing target marker");
    assert_eq!(Code::of(&failure), Some(Code::TargetMissing));
    assert_unfinished(&context, &input).await;
}

#[rstest]
#[case::missing(None)]
#[case::malformed(Some("connector: ["))]
#[tokio::test]
async fn capture_invalid_definition(#[case] supplied: Option<&str>) {
    let directory = TempDir::new().expect("should create test directory");
    let context = context(directory.path());
    let reader = reader(&context, directory.path());
    let mut input = input(&context, &definition("SELECT 7 AS id")).await;
    input.definition = supplied.map(Box::from);
    let failure = capture(&context, &input, &reader, &NoSecrets)
        .await
        .expect_err("should reject invalid apply input");
    assert_eq!(Code::of(&failure), Some(Code::InvalidDefinition));
    assert_eq!(*failure.current_context(), StageError::Permanent);
    assert_unfinished(&context, &input).await;
}

#[rstest]
#[case::query("SELECT missing AS id FROM nowhere", Code::QueryInvalid)]
#[case::decimal_batches(
    "SELECT i AS id, CASE WHEN i < 70000 THEN 1::HUGEINT ELSE \
     '100000000000000000000000000000000000000'::HUGEINT END AS amount FROM range(70001) AS \
     source(i) ORDER BY i",
    Code::DataInvalid
)]
#[case::nested_decimal(
    "SELECT 7 AS id, {'amounts': ['100000000000000000000000000000000000000'::HUGEINT]} AS value",
    Code::DataInvalid
)]
#[case::nested_unsigned(
    "SELECT 7 AS id, {'amounts': [1::UHUGEINT]} AS value",
    Code::DataInvalid
)]
#[tokio::test]
async fn capture_invalid_source_unpublished(#[case] query: &str, #[case] code: Code) {
    let directory = TempDir::new().expect("should create test directory");
    let context = context(directory.path());
    let reader = reader(&context, directory.path());
    let input = input(&context, &definition(query)).await;
    for _ in 0..2 {
        let failure = capture(&context, &input, &reader, &NoSecrets)
            .await
            .expect_err("should fail before publication");
        assert_eq!(Code::of(&failure), Some(code));
        assert_eq!(*failure.current_context(), StageError::Permanent);
        assert_unfinished(&context, &input).await;
        assert!(
            !files(&directory.path().join("artifacts"))
                .iter()
                .any(|path| path
                    .extension()
                    .is_some_and(|extension| extension == "parquet")),
            "should publish neither complete nor partial capture files"
        );
        let marker_path = directory.path().join("artifacts").join(
            context
                .namespace
                .capture_output(input.run.into())
                .to_string(),
        );
        assert!(
            !marker_path
                .parent()
                .expect("should have capture directory")
                .exists(),
            "should publish no source binding"
        );
    }
}

struct ClockCheckedSecrets(Arc<AtomicUsize>);

impl SecretStore for ClockCheckedSecrets {
    fn read(
        &self,
        web_id: Uuid,
        actor_id: Uuid,
        _: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send {
        assert_eq!(
            self.0.load(Ordering::SeqCst),
            1,
            "should read capture time before resolving credentials"
        );
        assert_eq!(
            web_id,
            Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0001)
        );
        assert_eq!(
            actor_id,
            Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0002)
        );
        ready(Err(Report::new(SourceError::Secret)))
    }
}

#[tokio::test]
async fn capture_credentials_use_run_identity() {
    let directory = TempDir::new().expect("should create test directory");
    let mut context = context(directory.path());
    let reads = Arc::new(AtomicUsize::new(0));
    context.clock = Box::new(CountingClock(Arc::clone(&reads)));
    let reader = reader(&context, directory.path());
    let input = input(
        &context,
        "connector: aviation
sources:
  items:
    rest:
      url: https://unavailable.invalid
      auth:
        type: bearer
        secretEntityUuid: 00000000-0000-4000-8000-000000000003
    primaryKey: [id]
pipelines:
  entities:
    - source: items
      steps: []
",
    )
    .await;
    let failure = capture(&context, &input, &reader, &ClockCheckedSecrets(reads))
        .await
        .expect_err("should classify missing credentials");
    assert_eq!(Code::of(&failure), Some(Code::SourceCredentials));
    assert_eq!(*failure.current_context(), StageError::Permanent);
    assert_unfinished(&context, &input).await;
}

#[test]
fn source_failure_preserves_nested_causes() {
    let reports = [
        (
            Report::new(CaptureError::InvalidData)
                .change_context(CaptureError::Write)
                .change_context(SourceError::Postgres),
            Code::DataInvalid,
        ),
        (
            Report::new(ArtifactError::Mismatch).change_context(SourceError::Read),
            Code::StorageMismatch,
        ),
        (
            Report::new(CaptureError::Cancelled).change_context(SourceError::Query),
            Code::WorkspaceUnavailable,
        ),
        (
            Report::new(SourceError::Status { status: 503 }),
            Code::SourceUnavailable,
        ),
        (
            Report::new(SourceError::Status { status: 403 }),
            Code::SourceCredentials,
        ),
        (Report::new(SourceError::Response), Code::SourceResponse),
    ];
    for (report, code) in reports {
        let expected_frames = report.frames().count();
        let failure = source_error(report);
        assert_eq!(Code::of(&failure), Some(code));
        assert_eq!(*failure.current_context(), code.kind());
        assert!(
            failure.frames().count() > expected_frames,
            "should preserve the original cause frames"
        );
    }
}
