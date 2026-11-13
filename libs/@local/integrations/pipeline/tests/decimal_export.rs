#![expect(missing_docs, reason = "integration tests")]

use std::{fs, fs::File};

use duckdb::{arrow::datatypes::DataType, types::Value};
use hash_integrations_pipeline::{CaptureError, Workspace, WorkspaceConfig};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("should open the workspace")
}

#[tokio::test]
async fn hugeint_signed_boundary_round_trip() {
    let directory = TempDir::new().expect("should create scratch");
    let workspace = open(&directory).await;
    let capture = workspace
        .capture(
            "SELECT * FROM (VALUES
                (0, 0::HUGEINT),
                (1, -17::HUGEINT),
                (2, '99999999999999999999999999999999999999'::HUGEINT),
                (3, '-99999999999999999999999999999999999999'::HUGEINT),
                (4, NULL::HUGEINT)
             ) AS values_to_capture(position, amount) ORDER BY position"
                .into(),
            directory.path().join("valid.parquet"),
        )
        .await
        .expect("should export the signed decimal boundary");
    let reader = ParquetRecordBatchReaderBuilder::try_new(
        File::open(capture.path()).expect("should open the checkpoint"),
    )
    .expect("should read checkpoint schema");
    assert_eq!(
        reader
            .schema()
            .field_with_name("amount")
            .expect("should have amount")
            .data_type(),
        &DataType::Decimal128(38, 0),
        "should store HUGEINT in its contracted decimal representation"
    );
    workspace
        .load_capture(capture, "restored".into())
        .await
        .expect("should load the valid decimal checkpoint");
    let rows = workspace
        .query("SELECT amount::VARCHAR FROM restored ORDER BY position".into())
        .await
        .expect("should read restored values");
    assert_eq!(
        rows.iter().map(<[Value]>::to_vec).collect::<Vec<_>>(),
        vec![
            vec![Value::Text("0".into())],
            vec![Value::Text("-17".into())],
            vec![Value::Text("99999999999999999999999999999999999999".into())],
            vec![Value::Text(
                "-99999999999999999999999999999999999999".into()
            )],
            vec![Value::Null],
        ],
        "should preserve signed boundary values and null exactly"
    );
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::positive_overflow("100000000000000000000000000000000000000")]
#[case::negative_overflow("-100000000000000000000000000000000000000")]
#[case::signed_maximum("170141183460469231731687303715884105727")]
#[case::signed_minimum("-170141183460469231731687303715884105728")]
#[tokio::test]
async fn hugeint_invalid_after_valid_batches(#[case] value: &str) {
    let directory = TempDir::new().expect("should create scratch");
    let workspace = open(&directory).await;
    let target = directory.path().join("invalid.parquet");
    let query = format!(
        "SELECT CASE WHEN i < 70000 THEN 1::HUGEINT ELSE '{value}'::HUGEINT END AS amount
         FROM range(70001) AS source(i) ORDER BY i"
    );
    for _ in 0..2 {
        let error = workspace
            .capture(query.clone().into(), target.clone())
            .await
            .expect_err("should refuse the late invalid decimal on every attempt");
        assert!(
            matches!(error.current_context(), CaptureError::InvalidData),
            "should classify decimal precision failure independently of IO"
        );
        assert!(!target.exists(), "should never publish an invalid capture");
        assert!(
            !format!("{error:?}").contains(value),
            "should not expose the invalid source value in the report"
        );
        assert!(
            fs::read_dir(directory.path())
                .expect("should inspect scratch")
                .all(|entry| !entry
                    .expect("should read the scratch entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".tmp")),
            "should remove partial checkpoint files after failure"
        );
    }
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::list("[1::HUGEINT, '100000000000000000000000000000000000000'::HUGEINT]")]
#[case::structure("{'amount': '100000000000000000000000000000000000000'::HUGEINT}")]
#[case::nested("{'amounts': [1::HUGEINT, '100000000000000000000000000000000000000'::HUGEINT]}")]
#[tokio::test]
async fn decimal_nested_out_of_range(#[case] expression: &str) {
    assert_invalid_export(expression).await;
}

#[rstest]
#[case::scalar("1::UHUGEINT")]
#[case::unsigned_maximum("'340282366920938463463374607431768211455'::UHUGEINT")]
#[case::list("[1::UHUGEINT]")]
#[case::structure("{'amount': 1::UHUGEINT}")]
#[case::nested("{'amounts': [1::UHUGEINT]}")]
#[tokio::test]
async fn unsigned_checkpoint_type(#[case] expression: &str) {
    assert_invalid_export(expression).await;
}

async fn assert_invalid_export(expression: &str) {
    let directory = TempDir::new().expect("should create scratch");
    let workspace = open(&directory).await;
    let target = directory.path().join("invalid.parquet");
    let error = workspace
        .capture(
            format!("SELECT {expression} AS amount").into(),
            target.clone(),
        )
        .await
        .expect_err("should reject the unsupported checkpoint representation");
    assert!(
        matches!(error.current_context(), CaptureError::InvalidData),
        "should report an invalid numeric representation: {error:?}"
    );
    assert!(
        !target.exists(),
        "should fail before publishing the capture"
    );
    workspace.close().await.expect("should close the workspace");
}

#[tokio::test]
async fn decimal_nested_and_explicit_casts() {
    let directory = TempDir::new().expect("should create scratch");
    let workspace = open(&directory).await;
    let capture = workspace
        .capture(
            "SELECT {'amounts': [NULL::HUGEINT, -17::HUGEINT,
                        '99999999999999999999999999999999999999'::HUGEINT]} AS nested,
                    (17::UHUGEINT)::DECIMAL(38,0) AS cast_decimal,
                    ('340282366920938463463374607431768211455'::UHUGEINT)::VARCHAR AS cast_text"
                .into(),
            directory.path().join("valid.parquet"),
        )
        .await
        .expect("should export nested valid decimals and explicit unsigned casts");
    workspace
        .load_capture(capture, "restored".into())
        .await
        .expect("should load the checkpoint");
    let rows = workspace
        .query(
            "SELECT nested.amounts[1], nested.amounts[2]::VARCHAR, nested.amounts[3]::VARCHAR, \
             cast_decimal::VARCHAR, cast_text FROM restored"
                .into(),
        )
        .await
        .expect("should read nested decimal values");
    assert_eq!(
        rows.iter().next().expect("should contain one row"),
        &[
            Value::Null,
            Value::Text("-17".into()),
            Value::Text("99999999999999999999999999999999999999".into()),
            Value::Text("17".into()),
            Value::Text("340282366920938463463374607431768211455".into()),
        ],
        "should retain nested values and explicit cast representations"
    );
    workspace.close().await.expect("should close the workspace");
}
