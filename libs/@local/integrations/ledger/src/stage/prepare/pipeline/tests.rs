// From `engine/tests/pipeline.rs:1-73`
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

// From `engine/tests/pipeline.rs:215-285`
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

// From `engine/tests/pipeline.rs:329-423`
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

// From `engine/tests/pipeline.rs:458-599`
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
            hash_integrations_definition::SourceKind::Local { .. }
            | hash_integrations_definition::SourceKind::Postgres { .. }
            | hash_integrations_definition::SourceKind::Rest { .. } => {
                panic!("the aviation fixture should use SQL and checkpoint sources")
            }
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

// From `engine/tests/pipeline.rs:725-765`
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
