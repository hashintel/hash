#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{future::poll_fn, task::Poll, time::Duration};

use duckdb::types::Value;
use hash_integrations_definition::{Definition, EntityPipeline, PrimaryKey};
use hash_integrations_engine::{
    AssertionFailure, PreparationError, TableAssertions, Workspace, WorkspaceConfig,
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("the workspace should open")
}

fn key(columns: &[&str]) -> PrimaryKey {
    PrimaryKey::new(
        columns
            .iter()
            .map(|column| column.parse().expect("the column name should be valid")),
    )
    .expect("the key should be valid")
}

fn pipeline(steps: &str) -> EntityPipeline {
    let mut indented = String::new();
    for line in steps.lines() {
        indented.push_str("        ");
        indented.push_str(line);
        indented.push('\n');
    }
    let definition = Definition::from_yaml(&format!(
        "connector: demo\nsources:\n  source:\n    primaryKey: [ID]\n    sql: SELECT 1 AS \
         ID\npipelines:\n  entities:\n    - source: source\n      steps:\n{indented}"
    ))
    .expect("the definition should parse");
    definition
        .entity_pipelines()
        .first()
        .expect("the definition should contain a pipeline")
        .clone()
}

async fn stage(workspace: &Workspace, sql: &str) {
    workspace
        .stage_table(
            "source".into(),
            sql.into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect("the source should be staged");
}

async fn values(workspace: &Workspace, table: &str) -> Vec<Value> {
    let rows = workspace
        .query(format!("SELECT VALUE FROM \"{table}\" ORDER BY ID").into_boxed_str())
        .await
        .expect("the values should be readable");
    rows.iter()
        .map(|row| row.first().expect("the row should have a value").clone())
        .collect()
}

#[tokio::test]
async fn staging_composite_keys() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let count = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID, 'a\"b' AS NAME; -- trailing comment".into(),
            key(&["NAME", "ID"]),
            TableAssertions::default(),
        )
        .await
        .expect("the source should be staged");
    assert_eq!(count, 1, "staging should return the source row count");
    let rows = workspace
        .query("SELECT _op, _key, ID FROM source".into())
        .await
        .expect("the metadata should be readable");
    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::Text("snapshot".to_owned()),
                Value::Text("{\"NAME\":\"a\\\"b\",\"ID\":1}".to_owned()),
                Value::Int(1)
            ]
            .as_slice()
        ),
        "keys should retain field order and escape source text"
    );
}

#[tokio::test]
async fn staging_assertion_failures() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let report = workspace
        .stage_table(
            "source".into(),
            "SELECT * FROM (VALUES (1, ''), (1, NULL), (2, 'x')) AS source(ID, NAME)".into(),
            key(&["ID"]),
            TableAssertions {
                min_rows: Some(4),
                max_rows: None,
                not_null: vec!["NAME".parse().expect("the name should be valid")],
                unique: vec![key(&["ID"])],
            },
        )
        .await
        .expect_err("the source should fail all three assertions");
    let PreparationError::Assertions { failures } = report.current_context() else {
        panic!("the error should report assertions: {report:?}");
    };
    assert!(
        matches!(
            failures.as_slice(),
            [
                AssertionFailure::RowCount { actual: 3, .. },
                AssertionFailure::NotNull { rows: 2, .. },
                AssertionFailure::Unique { groups: 1, .. }
            ]
        ),
        "all failed constraints should be retained: {failures:?}"
    );
    assert_eq!(
        report.to_string(),
        "source table failed its assertions: row count is 3, expected at least 4 rows; column \
         `NAME` has 2 null or blank rows; duplicate value groups for columns `ID`: 1",
        "the error should display every failed constraint"
    );
    let diagnostic = format!("{report:?}");
    for failure in failures {
        assert!(
            diagnostic.contains(&failure.to_string()),
            "the diagnostic should include each failure: {diagnostic}"
        );
    }
}

#[tokio::test]
async fn staging_assertion_row_bounds() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    for (min_rows, max_rows, expected) in [
        (None, Some(2), "at most 2 rows"),
        (Some(4), Some(5), "between 4 and 5 rows"),
    ] {
        let report = workspace
            .stage_table(
                "source".into(),
                "SELECT * FROM (VALUES (1), (2), (3)) AS source(ID)".into(),
                key(&["ID"]),
                TableAssertions {
                    min_rows,
                    max_rows,
                    ..TableAssertions::default()
                },
            )
            .await
            .expect_err("the source should fail the row-count assertion");
        assert_eq!(
            report.to_string(),
            format!("source table failed its assertions: row count is 3, expected {expected}"),
            "the error should display the actual count and configured bounds"
        );
    }
}

#[tokio::test]
async fn staging_invalid_columns() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let report = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID, 2 AS _KeY".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect_err("metadata collisions should be refused");
    assert!(
        matches!(report.current_context(), PreparationError::ReservedColumn { column } if column.as_ref() == "_KeY"),
        "metadata collisions should be case insensitive: {report:?}"
    );
    let report = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS OTHER".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect_err("missing key columns should be refused");
    assert!(
        matches!(report.current_context(), PreparationError::MissingColumn { column } if column.as_ref() == "ID"),
        "the missing key should be named: {report:?}"
    );
}

#[tokio::test]
async fn pipeline_branch_isolation() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    stage(&workspace, "SELECT 1 AS ID, 10 AS VALUE").await;
    let pipeline = pipeline(include_str!("fixtures/pipeline-branches.yaml"));
    let prepared = workspace
        .prepare_pipeline(pipeline, "source".into(), BTreeMap::new())
        .await
        .expect("the branches should run");
    let [first, second, main] = prepared.sinks.as_slice() else {
        panic!("three sink tables should be produced");
    };
    assert_eq!(
        values(&workspace, &first.table).await,
        [Value::Int(110)],
        "the first branch should use the source"
    );
    assert_eq!(
        values(&workspace, &second.table).await,
        [Value::Int(210)],
        "the second branch should use the same source"
    );
    assert_eq!(
        values(&workspace, &main.table).await,
        [Value::Int(11)],
        "the main pipeline should retain its input across branches"
    );
    stage(&workspace, "SELECT 2 AS ID, 99 AS VALUE").await;
    let checkpoint = prepared
        .checkpoints
        .values()
        .next()
        .expect("the checkpoint should exist");
    assert_eq!(
        values(&workspace, checkpoint).await,
        [Value::Int(10)],
        "checkpoints should retain their rows after the source is replaced"
    );
    assert_eq!(
        values(&workspace, &first.table).await,
        [Value::Int(110)],
        "sink tables should retain their rows after the source is replaced"
    );
}

#[tokio::test]
async fn pipeline_metadata_loss() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    stage(&workspace, "SELECT 1 AS ID").await;
    let report = workspace
        .prepare_pipeline(
            pipeline("- id: lose-metadata\n  sql: SELECT ID FROM input\n"),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect_err("steps should preserve metadata");
    assert!(
        matches!(report.current_context(), PreparationError::Step { step } if step.as_ref() == "lose-metadata"),
        "the failing step should be named: {report:?}"
    );
    assert!(
        report.frames().any(|frame| matches!(
            frame.downcast_ref::<PreparationError>(),
            Some(PreparationError::Metadata { .. })
        )),
        "the report should retain the metadata failure: {report:?}"
    );
}

#[tokio::test]
async fn pipeline_content_hashes() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let pipeline = pipeline(include_str!("fixtures/pipeline-sink.yaml"));
    let mut hashes = Vec::new();
    for sql in [
        "SELECT 1 AS ID, ' a ' AS NAME, 1 AS NOISE",
        "SELECT 2 AS ID, 'a' AS NAME, 99 AS NOISE",
        "SELECT 2 AS ID, 'b' AS NAME, 99 AS NOISE",
    ] {
        stage(&workspace, sql).await;
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), "source".into(), BTreeMap::new())
            .await
            .expect("the sink should be prepared");
        let table = &prepared.sinks.first().expect("the sink should exist").table;
        let rows = workspace
            .query(format!("SELECT _content_hash FROM \"{table}\"").into_boxed_str())
            .await
            .expect("the hash should be readable");
        hashes.push(
            rows.iter()
                .next()
                .and_then(|row| row.first())
                .expect("the hash should exist")
                .clone(),
        );
    }
    let [first, second, third] = hashes.as_slice() else {
        panic!("three hashes should exist");
    };
    assert_eq!(
        first, second,
        "hashes should normalize mapped text and exclude IDs and unmapped columns"
    );
    assert_ne!(
        second, third,
        "a changed property should change its content hash"
    );
}

#[tokio::test]
async fn pipeline_named_inputs() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    stage(&workspace, "SELECT 1 AS ID, 10 AS VALUE").await;
    workspace
        .create_table("lookup".into(), "SELECT 1 AS ID, 5 AS VALUE".into())
        .await
        .expect("the lookup table should be created");
    let mut pipeline = pipeline(
        "- id: join\n  sql: SELECT input._op, input._key, input.ID, input.VALUE + other.VALUE AS \
         VALUE FROM input JOIN other USING (ID)\n",
    );
    let checkpoint = "upstream"
        .parse()
        .expect("the checkpoint name should be valid");
    pipeline.inputs.insert(
        "other".parse().expect("the alias should be valid"),
        checkpoint,
    );
    let report = workspace
        .prepare_pipeline(pipeline.clone(), "source".into(), BTreeMap::new())
        .await
        .expect_err("a missing input should be reported");
    assert!(
        matches!(
            report.current_context(),
            PreparationError::MissingCheckpoint { .. }
        ),
        "the missing checkpoint should be reported: {report:?}"
    );
    let checkpoints = BTreeMap::from([(
        "upstream"
            .parse()
            .expect("the checkpoint name should be valid"),
        Box::from("lookup"),
    )]);
    let prepared = workspace
        .prepare_pipeline(pipeline, "source".into(), checkpoints)
        .await
        .expect("the input alias should resolve");
    assert_eq!(
        values(&workspace, &prepared.table).await,
        [Value::Int(15)],
        "SQL should read the bound checkpoint"
    );
    let aliases = workspace
        .query(
            "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('input', 'other')"
                .into(),
        )
        .await
        .expect("the catalog should be readable");
    assert_eq!(
        aliases.iter().next(),
        Some([Value::BigInt(0)].as_slice()),
        "input aliases should not leave catalog objects behind"
    );
}

#[tokio::test]
async fn pipeline_sql_sandbox() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    stage(&workspace, "SELECT 1 AS ID").await;
    let report = workspace
        .prepare_pipeline(
            pipeline("- id: unsafe\n  sql: SELECT * FROM read_csv('secrets.csv')\n"),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect_err("pipeline SQL should obey the workspace sandbox");
    assert!(
        matches!(report.downcast_ref::<hash_integrations_engine::StatementError>(), Some(hash_integrations_engine::StatementError::TableFunction { name }) if name.as_ref() == "read_csv"),
        "the forbidden table function should be reported: {report:?}"
    );
    let prepared = workspace
        .prepare_pipeline(
            pipeline("- id: valid\n  sql: SELECT * FROM input\n"),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect("a failed step should leave the workspace usable");
    let rows = workspace
        .query(format!("SELECT ID FROM \"{}\"", prepared.table).into_boxed_str())
        .await
        .expect("the output should be readable");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1)].as_slice()),
        "the next pipeline should retain source values"
    );
}

#[tokio::test]
async fn staging_empty_source() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let count = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID WHERE false".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect("empty sources should be staged");
    assert_eq!(count, 0, "an empty source should report no rows");
    let prepared = workspace
        .prepare_pipeline(
            pipeline("- id: empty\n  sql: SELECT * FROM input\n"),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect("empty tables should retain their metadata schema");
    let rows = workspace
        .query(format!("SELECT * FROM \"{}\"", prepared.table).into_boxed_str())
        .await
        .expect("the output schema should be readable");
    assert_eq!(
        rows.columns(),
        [Box::from("_op"), Box::from("_key"), Box::from("ID")],
        "empty staging tables should retain metadata and data columns"
    );
}

#[tokio::test]
async fn link_named_inputs() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let definition = Definition::from_yaml(include_str!("fixtures/pipeline-links.yaml"))
        .expect("the definition should parse");
    workspace
        .create_table("left_data".into(), "SELECT 1 AS ID".into())
        .await
        .expect("the left table should be created");
    workspace
        .create_table("right_data".into(), "SELECT 2 AS ID".into())
        .await
        .expect("the right table should be created");
    let checkpoints = BTreeMap::from([
        (
            "left".parse().expect("the checkpoint should be valid"),
            Box::from("left_data"),
        ),
        (
            "right".parse().expect("the checkpoint should be valid"),
            Box::from("right_data"),
        ),
    ]);
    let pipeline = definition
        .link_pipelines()
        .first()
        .expect("the link pipeline should exist");
    let prepared = workspace
        .prepare_link_pipeline(pipeline.clone(), checkpoints)
        .await
        .expect("the named inputs should combine");
    let rows = workspace
        .query(format!("SELECT FROM_ID, TO_ID FROM \"{}\"", prepared.table).into_boxed_str())
        .await
        .expect("the link rows should be readable");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1), Value::Int(2)].as_slice()),
        "the next step should see the previous join as input"
    );
}

#[tokio::test]
async fn definition_aviation_tables() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let definition = Definition::from_yaml(include_str!("../../definition/examples/aviation.yaml"))
        .expect("the aviation definition should parse");
    let mut checkpoints = BTreeMap::new();
    let mut sinks = Vec::new();
    for pipeline in definition.entity_pipelines() {
        let source = definition
            .sources()
            .get(&pipeline.source)
            .expect("the pipeline source should exist");
        let table = match &source.kind {
            hash_integrations_definition::SourceKind::Sql { query, primary_key } => {
                let table = format!("source/{}", pipeline.source).into_boxed_str();
                workspace
                    .stage_table(
                        table.clone(),
                        query.as_ref().into(),
                        primary_key.clone(),
                        TableAssertions::default(),
                    )
                    .await
                    .expect("the SQL source should be staged");
                table
            }
            hash_integrations_definition::SourceKind::Checkpoint { checkpoint } => checkpoints
                .get(checkpoint)
                .cloned()
                .expect("the checkpoint source should exist"),
        };
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), table, checkpoints.clone())
            .await
            .expect("the aviation pipeline should be prepared");
        checkpoints.extend(prepared.checkpoints);
        sinks.extend(prepared.sinks);
    }
    assert_eq!(
        sinks.len(),
        2,
        "airfields and aircraft should each produce an entity sink"
    );
    for sink in &sinks {
        let rows = workspace
            .query(
                format!(
                    "SELECT count(*), count(_content_hash) FROM \"{}\"",
                    sink.table
                )
                .into_boxed_str(),
            )
            .await
            .expect("the prepared sink should be readable");
        assert_eq!(
            rows.iter().next(),
            Some([Value::BigInt(2), Value::BigInt(2)].as_slice()),
            "each sink should contain two rows with content hashes"
        );
    }
    let link = definition
        .link_pipelines()
        .first()
        .expect("the aviation link should exist");
    let prepared = workspace
        .prepare_link_pipeline(link.clone(), checkpoints)
        .await
        .expect("the aviation links should be prepared");
    let rows = workspace
        .query(
            format!(
                "SELECT TAIL, HOME_BASE FROM \"{}\" ORDER BY TAIL",
                prepared.table
            )
            .into_boxed_str(),
        )
        .await
        .expect("the link endpoints should be readable");
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [
            [
                Value::Text("N100".to_owned()),
                Value::Text("ESSA".to_owned())
            ],
            [
                Value::Text("SE-XXX".to_owned()),
                Value::Text("ESSA".to_owned())
            ],
        ],
        "both aircraft should link to their home airfield"
    );
}

#[tokio::test]
async fn pipeline_converted_hashes() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let steps = include_str!("fixtures/pipeline-sink.yaml")
        .replace(": NAME", ": { column: NAME, coerce: trim }");
    let pipeline = pipeline(&steps);
    let mut hashes = Vec::new();
    for sql in [
        "SELECT 1 AS ID, 'a' AS NAME, 1 AS NOISE",
        "SELECT 2 AS ID, 'a' AS NAME, 2 AS NOISE",
        "SELECT 2 AS ID, 'b' AS NAME, 2 AS NOISE",
    ] {
        stage(&workspace, sql).await;
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), "source".into(), BTreeMap::new())
            .await
            .expect("the sink should be prepared");
        let table = &prepared.sinks.first().expect("the sink should exist").table;
        let rows = workspace
            .query(format!("SELECT _content_hash FROM \"{table}\"").into_boxed_str())
            .await
            .expect("the hash should be readable");
        hashes.push(
            rows.iter()
                .next()
                .and_then(|row| row.first())
                .expect("the hash should exist")
                .clone(),
        );
    }
    let [first, second, third] = hashes.as_slice() else {
        panic!("three hashes should exist");
    };
    assert_eq!(
        first, second,
        "converted accessors should exclude IDs and unmapped columns from the hash"
    );
    assert_ne!(
        second, third,
        "a changed coercion input should change the hash"
    );
    stage(&workspace, "SELECT 1 AS ID").await;
    let report = workspace
        .prepare_pipeline(pipeline, "source".into(), BTreeMap::new())
        .await
        .expect_err("converted accessors should require their columns");
    assert!(report.frames().any(|frame| matches!(frame.downcast_ref::<PreparationError>(), Some(PreparationError::MissingColumn { column }) if column.as_ref() == "NAME")), "the missing accessor column should be reported: {report:?}");
}

#[tokio::test]
async fn pipeline_measured_hashes() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let definition = Definition::from_yaml(include_str!("fixtures/pipeline-measured.yaml"))
        .expect("the measured property definition should parse");
    let pipeline = definition
        .entity_pipelines()
        .first()
        .expect("the definition should contain a pipeline");
    let mut hashes = Vec::new();
    for sql in [
        "SELECT 1 AS ID, 10 AS AMOUNT, 'KG' AS UNIT, 1 AS NOISE",
        "SELECT 2 AS ID, 10 AS AMOUNT, 'KG' AS UNIT, 2 AS NOISE",
        "SELECT 2 AS ID, 11 AS AMOUNT, 'KG' AS UNIT, 2 AS NOISE",
        "SELECT 2 AS ID, 11 AS AMOUNT, 'LB' AS UNIT, 2 AS NOISE",
    ] {
        stage(&workspace, sql).await;
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), "source".into(), BTreeMap::new())
            .await
            .expect("the sink should be prepared");
        let table = &prepared.sinks.first().expect("the sink should exist").table;
        let rows = workspace
            .query(format!("SELECT _content_hash FROM \"{table}\"").into_boxed_str())
            .await
            .expect("the hash should be readable");
        hashes.push(
            rows.iter()
                .next()
                .and_then(|row| row.first())
                .expect("the hash should exist")
                .clone(),
        );
    }
    let [first, second, third, fourth] = hashes.as_slice() else {
        panic!("four hashes should exist");
    };
    assert_eq!(
        first, second,
        "measured accessors should exclude IDs and unmapped columns from the hash"
    );
    assert_ne!(second, third, "a changed amount should change the hash");
    assert_ne!(third, fourth, "a changed unit should change the hash");
}

#[tokio::test]
async fn pipeline_cancellation() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    stage(&workspace, "SELECT 1 AS ID").await;
    let pipeline = pipeline(
        "- id: long-query\n  sql: SELECT input.*, (SELECT count(*) FROM range(1000000000000)) AS \
         VALUE FROM input\n- id: after\n  checkpoint: after\n",
    );
    let mut pending =
        Box::pin(workspace.prepare_pipeline(pipeline, "source".into(), BTreeMap::new()));
    assert!(
        poll_fn(|context| Poll::Ready(pending.as_mut().poll(context).is_pending())).await,
        "the long pipeline should still be pending"
    );
    tokio::time::sleep(Duration::from_millis(100)).await;
    drop(pending);
    let rows = tokio::time::timeout(Duration::from_secs(10), workspace.query("SELECT 1".into()))
        .await
        .expect("the cancelled pipeline should release the worker")
        .expect("the next query should run");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1)].as_slice()),
        "cancelling preparation should leave the workspace usable"
    );
}

#[tokio::test]
async fn pipeline_bound_parameters() {
    let directory = TempDir::new().expect("the directory should be created");
    let variables = hash_integrations_definition::Variables::try_from(BTreeMap::from([(
        "INCREMENT"
            .parse()
            .expect("the variable name should be valid"),
        Box::from("7"),
    )]))
    .expect("the variables should be valid");
    let workspace = Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig {
            variables,
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect("the workspace should open");
    stage(
        &workspace,
        "SELECT $increment::INTEGER AS ID, 10 AS VALUE; -- source terminator",
    )
    .await;
    let prepared = workspace
        .prepare_pipeline(
            pipeline(
                "- id: add\n  sql: SELECT _op, _key, ID, VALUE + $Increment::INTEGER AS VALUE \
                 FROM input; -- step terminator\n",
            ),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect("canonicalized SQL should retain named parameters");
    assert_eq!(
        values(&workspace, &prepared.table).await,
        [Value::Int(17)],
        "both source and step parameters should bind by name"
    );
}
