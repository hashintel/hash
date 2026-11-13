use alloc::sync::Arc;
use std::fs::File;

use arrow_array::{ArrayRef, RecordBatch, StringArray};
use hash_integrations_definition::Variables;
use parquet::{arrow::ArrowWriter, file::properties::WriterProperties};
use serde::{Deserialize, Serialize};
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{context, run_id};
use crate::{
    ArtifactRef, Code, Format, RunContext,
    run::{marker, table::load_table},
};

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Output {
    file: ArtifactRef,
}

async fn encoded(context: &RunContext, group_rows: usize) -> ArtifactRef {
    let path = context.scratch_file(Format::Parquet);
    let values: ArrayRef = Arc::new(StringArray::from(vec![Some("alpha"), None, Some("beta")]));
    let batch = RecordBatch::try_from_iter_with_nullable([("value", values, true)])
        .expect("should construct expected rows");
    let mut writer = ArrowWriter::try_new(
        File::create(&path).expect("should create Parquet file"),
        batch.schema(),
        Some(
            WriterProperties::builder()
                .set_max_row_group_row_count(Some(group_rows))
                .build(),
        ),
    )
    .expect("should open writer");
    writer.write(&batch).expect("should write expected rows");
    writer.close().expect("should finish file");
    context
        .publish(&path, Format::Parquet)
        .await
        .expect("should publish artifact")
}

#[tokio::test]
async fn marker_selects_complete_equivalent_output() {
    let directory = TempDir::new().expect("should create directory");
    let first = context(directory.path());
    let second = context(directory.path());
    let first_file = encoded(&first, 1).await;
    let second_file = encoded(&second, 3).await;
    assert_ne!(
        first_file, second_file,
        "should test distinct Parquet encodings"
    );
    let key = first.namespace.diff_output(run_id(1).into());
    assert!(
        marker::finished::<Output>(&first, &key)
            .await
            .expect("should read unbound marker")
            .is_none(),
        "should not bind artifacts before completion"
    );
    let first_output = Output { file: first_file };
    let second_output = Output { file: second_file };
    let (first_result, second_result) = tokio::join!(
        marker::finish(&first, &key, &first_output),
        marker::finish(&second, &key, &second_output)
    );
    let winner = first_result.expect("should return winning marker");
    assert_eq!(
        second_result.expect("should return same winning marker"),
        winner
    );
    let fresh = context(directory.path());
    assert_eq!(
        marker::finished::<Output>(&fresh, &key)
            .await
            .expect("should read stored marker"),
        Some(Output {
            file: winner.file.clone()
        })
    );
    let workspace = fresh
        .open_workspace(Variables::default())
        .await
        .expect("should open fresh workspace");
    load_table(&fresh, &workspace, &winner.file, "winner".into())
        .await
        .expect("should load winning artifact from fresh scratch");
    let rows = workspace
        .query("SELECT value FROM winner".into())
        .await
        .expect("should read expected rows");
    assert_eq!(
        rows.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        vec![
            vec![duckdb::types::Value::Text("alpha".into())],
            vec![duckdb::types::Value::Null],
            vec![duckdb::types::Value::Text("beta".into())]
        ]
    );
    workspace.close().await.expect("should close workspace");
}

#[tokio::test]
async fn marker_missing_body_is_storage_failure() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    let key = context.namespace.capture_output(run_id(1).into());
    marker::finish(&context, &key, &3_u64)
        .await
        .expect("should finish marker");
    let artifact = context
        .storage
        .bound(&key)
        .await
        .expect("should read binding")
        .expect("should be bound");
    std::fs::remove_file(directory.path().join("artifacts").join(artifact.key()))
        .expect("should remove body");
    let fresh = super::context(directory.path());
    let error = marker::finished::<u64>(&fresh, &key)
        .await
        .expect_err("should not treat missing marker body as unfinished");
    assert_eq!(Code::of(&error), Some(Code::StorageUnavailable));
}
