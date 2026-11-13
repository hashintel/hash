//! Behavioral planning checks use independently constructed predecessor files.
use alloc::collections::BTreeMap;
use std::fs;

use duckdb::types::Value;
use hash_integrations_definition::Variables;
use rstest::rstest;
use serde_json::{Value as JsonValue, json};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::{OffsetDateTime, macros::datetime};

use super::{PlanOutput, plan};
use crate::{
    ArtifactRef, Clock, Code, Rows, RunContext, RunInput, StageError, Target, Workspace,
    graph::OperationKind,
    run::{
        marker::finished,
        table::{load_table, store_query},
        tests::{apply, context, run_id},
    },
    stage::{
        capture::CaptureOutput,
        diff::{DiffCounts, DiffOutput, TargetDiff},
    },
    start,
};

const DEFINITION: &str = include_str!("../../../tests/fixtures/aviation.yaml");
const WEB: &str = "00000000-0000-4000-8000-000000000001";
const EMPTY_ARCHIVES: &str = "SELECT NULL::VARCHAR AS entity_id, NULL::VARCHAR AS kind, \
                              NULL::VARCHAR AS target, NULL::VARCHAR AS source_id WHERE false";

#[derive(Debug)]
struct NoClock;
impl Clock for NoClock {
    fn now(&self) -> OffsetDateTime {
        panic!("planning must use capture time without reading the clock")
    }
}

async fn input(context: &RunContext) -> RunInput {
    start(context, apply(run_id(1), DEFINITION))
        .await
        .expect("should pin definition")
}

fn capture() -> CaptureOutput {
    CaptureOutput {
        captured_at: datetime!(2026-11-06 12:00 UTC),
        adopted_from: None,
        sources: BTreeMap::new(),
    }
}

fn entity(number: u64) -> String {
    format!("{WEB}~00000000-0000-4000-8000-{number:012}")
}

fn changes(values: &str, properties: &str) -> String {
    format!(
        "SELECT number::UBIGINT AS _row, '{WEB}~00000000-0000-4000-8000-' || \
         lpad(identity::VARCHAR, 12, '0') AS _entity_id, change AS _change, 'source-' || identity \
         AS _source_id {properties} FROM ({values}) rows(number, identity, change)"
    )
}

async fn checkpoint(
    context: &RunContext,
    changes: &[(&str, String)],
    archives: Option<&str>,
) -> DiffOutput {
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture workspace");
    let archives = store_query(
        context,
        &workspace,
        archives.unwrap_or(EMPTY_ARCHIVES).into(),
    )
    .await
    .expect("should store independent archives");
    let mut targets = BTreeMap::new();
    for (target, sql) in changes {
        let changes = store_query(context, &workspace, sql.clone().into_boxed_str())
            .await
            .expect("should store independent changes");
        targets.insert(
            target
                .parse::<Target>()
                .expect("should parse fixture target"),
            TargetDiff {
                changes: Some(changes),
                counts: DiffCounts::default(),
            },
        );
    }
    workspace
        .close()
        .await
        .expect("should close fixture workspace");
    DiffOutput {
        base: None,
        resent: vec![],
        hashes: archives.clone(),
        issues: archives.clone(),
        archives,
        targets,
    }
}

async fn read(context: &RunContext, artifact: &ArtifactRef) -> Rows {
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open consumer workspace");
    load_table(context, &workspace, artifact, "result".into())
        .await
        .expect("should load planned artifact");
    let rows = workspace
        .query("SELECT * FROM result ORDER BY rowid".into())
        .await
        .expect("should read rows in persisted order");
    workspace
        .close()
        .await
        .expect("should close consumer workspace");
    rows
}

fn text(row: &[Value], index: usize) -> &str {
    let Some(Value::Text(value)) = row.get(index) else {
        panic!("should have a text cell at {index}")
    };
    value
}

fn bodies(rows: &Rows, index: usize) -> Vec<JsonValue> {
    rows.iter()
        .map(|row| serde_json::from_str(text(row, index)).expect("should encode JSON body"))
        .collect()
}

#[tokio::test]
async fn groups_cross_target_boundaries() {
    let directory = TempDir::new().expect("should create fixture directory");
    let mut context = context(directory.path());
    context.clock = Box::new(NoClock);
    let input = input(&context).await;
    let diff = checkpoint(
        &context,
        &[
            (
                "entity/sink-aircraft",
                changes(
                    "VALUES (0, 1, 'insert'), (1, 3, 'update'), (2, 4, 'insert')",
                    ", 'DC-3' AS MODEL",
                ),
            ),
            (
                "entity/sink-airfields",
                changes(
                    "VALUES (0, 2, 'insert'), (1, 5, 'resend')",
                    ", 'Arlanda' AS FIELD_NAME",
                ),
            ),
            (
                "link/aircraft-based-at",
                changes(
                    "VALUES (0, 6, 'insert'), (1, 7, 'update')",
                    &format!(
                        ", '{}' AS _left_entity_id, '{}' AS _right_entity_id",
                        entity(1),
                        entity(2)
                    ),
                ),
            ),
        ],
        Some(&format!(
            "SELECT * FROM (VALUES ('{}', 'entity', 'sink-airfields', 'removed'), ('{}', 'link', \
             'aircraft-based-at', 'removed'), ('{}', 'entity', 'sink-aircraft', 'removed')) \
             rows(entity_id, kind, target, source_id)",
            entity(8),
            entity(9),
            entity(10)
        )),
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should plan all groups");
    let rows = read(&context, &output.writes).await;
    let actual: Vec<_> = rows
        .iter()
        .map(|row| {
            (
                text(row, 4).to_owned(),
                row[1].clone(),
                text(row, 2).to_owned(),
                text(row, 3).to_owned(),
            )
        })
        .collect();
    let expected: Vec<_> = [
        (1, 0, "upsert_entity", "insert"),
        (4, 0, "upsert_entity", "insert"),
        (2, 0, "upsert_entity", "insert"),
        (3, 1, "upsert_entity", "update"),
        (5, 1, "upsert_entity", "resend"),
        (6, 2, "upsert_link", "insert"),
        (7, 3, "upsert_link", "update"),
        (9, 4, "archive_link", "archive"),
        (10, 5, "archive_entity", "archive"),
        (8, 5, "archive_entity", "archive"),
    ]
    .into_iter()
    .map(|(id, batch, operation, change)| {
        (
            entity(id),
            Value::UInt(batch),
            operation.to_owned(),
            change.to_owned(),
        )
    })
    .collect();
    assert_eq!(actual, expected);
    assert_eq!(output.batches, 6);
    assert_eq!(
        output.counts,
        BTreeMap::from([
            (OperationKind::UpsertEntity, 5),
            (OperationKind::UpsertLink, 2),
            (OperationKind::ArchiveLink, 1),
            (OperationKind::ArchiveEntity, 2)
        ])
    );
    for body in bodies(&rows, 10) {
        assert_eq!(
            body["provenance"],
            json!({"actorType":"machine","origin":{"type":"api"},"sources":[{"type":"integration","loadedAt":"2026-11-06T12:00:00.000000000Z","location":{"name":"aviation"}}]})
        );
    }
    assert_eq!(read(&context, &output.issues).await.iter().len(), 0);
}

#[tokio::test]
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the fixture groups contain 128 writes per batch"
)]
async fn ranges_preserve_groups_and_count_batches() {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    let diff = checkpoint(
        &context,
        &[(
            "entity/sink-aircraft",
            changes(
                "SELECT number, number, CASE WHEN number % 2 = 0 THEN 'insert' ELSE 'update' END \
                 FROM range(4100) rows(number)",
                ", 'DC-3' AS MODEL",
            ),
        )],
        None,
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should plan three pages of both groups");
    let rows = read(&context, &output.writes).await;
    assert_eq!(rows.iter().len(), 4_100);
    for (seq, row) in rows.iter().enumerate() {
        let seq = seq as u64;
        let (identity, batch) = if seq < 2050 {
            (seq * 2, seq / 128)
        } else {
            ((seq - 2050) * 2 + 1, 17 + (seq - 2050) / 128)
        };
        assert_eq!(row.len(), 11);
        assert_eq!(row.first(), Some(&Value::UBigInt(seq)));
        assert_eq!(
            row.get(1),
            Some(&Value::UInt(
                u32::try_from(batch).expect("should fit batch")
            ))
        );
        assert_eq!(text(row, 4), entity(identity));
    }
    assert_eq!(output.batches, 34);
    assert_eq!(output.counts[&OperationKind::UpsertEntity], 4100);
}

#[rstest]
#[case(700_000, vec![0, 0, 1])]
#[case(1_600_000, vec![0, 1, 2])]
#[case(2_200_000, vec![0, 1, 2])]
#[tokio::test]
async fn bodies_respect_batch_bytes(#[case] size: u64, #[case] batches: Vec<u32>) {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    let model = if size == 700_000 {
        format!(", repeat('x', {size}) AS MODEL")
    } else {
        format!(", CASE WHEN identity = 2 THEN repeat('x', {size}) ELSE 'DC-3' END AS MODEL")
    };
    let diff = checkpoint(
        &context,
        &[(
            "entity/sink-aircraft",
            changes(
                "VALUES (0, 1, 'insert'), (1, 2, 'insert'), (2, 3, 'insert')",
                &model,
            ),
        )],
        None,
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should keep oversized bodies as singleton writes");
    let rows = read(&context, &output.writes).await;
    assert_eq!(
        rows.iter().map(|row| row[1].clone()).collect::<Vec<_>>(),
        batches.into_iter().map(Value::UInt).collect::<Vec<_>>()
    );
    assert_eq!(
        bodies(&rows, 9)[1]["properties"]["value"]
            ["https://example.com/@demo/types/property-type/model/"]["value"]
            .as_str()
            .expect("should hold model text")
            .len(),
        usize::try_from(size).expect("should fit length")
    );
}

#[rstest]
#[case(true)]
#[case(false)]
#[tokio::test]
async fn issues_omit_values_and_preserve_key(#[case] keyed: bool) {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    let key = if keyed {
        ", '[\"sensitive-key\"]' AS _KEY"
    } else {
        ""
    };
    let diff = checkpoint(
        &context,
        &[(
            "entity/sink-aircraft",
            changes(
                "VALUES (0, 1, 'insert')",
                &format!(
                    ", '  DC-3  ' AS model, 'private-invalid-date' AS first_flight, '' AS \
                     empty_mass, 'KG' AS mass_unit{key}"
                ),
            ),
        )],
        None,
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should omit unconvertible property");
    let issues = read(&context, &output.issues).await;
    assert_eq!(
        issues.iter().map(<[Value]>::to_vec).collect::<Vec<_>>(),
        vec![vec![
            Value::Text("entity".into()),
            Value::Text("sink-aircraft".into()),
            Value::Text(entity(1)),
            if keyed {
                Value::Text("[\"sensitive-key\"]".into())
            } else {
                Value::Null
            },
            Value::Text("property_unconverted".into()),
            Value::Text("https://example.com/@demo/types/property-type/first-flight/v/1".into()),
            Value::Text("coercion".into()),
        ]]
    );
    let rows = read(&context, &output.writes).await;
    let expected = json!({"value":{"https://example.com/@demo/types/property-type/model/":{"metadata":{"dataTypeId":null},"value":"DC-3"}}});
    assert_eq!(bodies(&rows, 9)[0]["properties"], expected);
    assert_eq!(
        bodies(&rows, 10)[0]["properties"],
        json!([{"op":"replace","path":[],"property":expected}])
    );
    assert!(!format!("{rows:?}{issues:?}").contains("private-invalid-date"));
}

#[tokio::test]
async fn properties_resume_typed_and_remove_blank() {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    let diff = checkpoint(
        &context,
        &[(
            "entity/sink-aircraft",
            changes(
                "VALUES (0, 1, 'update')",
                ", 8030.00::DECIMAL(10,2) AS EMPTY_MASS, DATE '1946-04-02' AS FIRST_FLIGHT, 'KG' \
                 AS MASS_UNIT, NULL::VARCHAR AS MODEL",
            ),
        )],
        None,
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should consume typed checkpoint cells");
    let rows = read(&context, &output.writes).await;
    assert_eq!(
        bodies(&rows, 10)[0]["properties"],
        json!([{"op":"replace","path":[],"property":{"value":{
            "https://example.com/@demo/types/property-type/empty-mass/":{"metadata":{"dataTypeId":"https://example.com/@demo/types/data-type/kilogram/v/1"},"value":8030.0},
            "https://example.com/@demo/types/property-type/first-flight/":{"metadata":{"dataTypeId":null},"value":"1946-04-02"}
        }}}])
    );
    assert_eq!(read(&context, &output.issues).await.iter().len(), 0);
}

#[rstest]
#[case(
    "SELECT 0::UBIGINT AS _row, 'not-an-id' AS _entity_id, 'insert' AS _change, 'source' AS \
     _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 0::UBIGINT AS _row, \
     '00000000-0000-4000-8000-000000000001~AAAAAAAA-0000-4000-8000-000000000001' AS _entity_id, \
     'insert' AS _change, 'source' AS _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 0::UBIGINT AS _row, 'id' AS _entity_id, 'insert' AS _change",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 0::UBIGINT AS _row, 'id' AS _entity_id, NULL::VARCHAR AS _change, 'source' AS \
     _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 0::UBIGINT AS _row, 'id' AS _entity_id, 'archive' AS _change, 'source' AS _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 0::UBIGINT AS _row, 'id' AS _entity_id, 'insert' AS _change, 1::BIGINT AS _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 1::UBIGINT AS _row, 'id' AS _entity_id, 'insert' AS _change, 'source' AS _source_id",
    Code::InvalidCheckpoint
)]
#[case(
    "SELECT 'id' AS _entity_id, 'insert' AS _change, 'source' AS _source_id",
    Code::QueryInvalid
)]
#[tokio::test]
async fn checkpoint_invalid_rows(#[case] sql: &str, #[case] code: Code) {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    let diff = checkpoint(&context, &[("entity/sink-aircraft", sql.into())], None).await;
    let error = plan(&context, &input, &capture(), &diff)
        .await
        .expect_err("should reject invalid checkpoint");
    assert_eq!(Code::of(&error), Some(code));
    assert_eq!(*error.current_context(), StageError::Permanent);
    assert_eq!(
        finished::<PlanOutput>(&context, &context.namespace.plan_output(input.run.into()))
            .await
            .expect("should inspect plan marker"),
        None
    );
    for entry in fs::read_dir(&context.scratch).expect("should list scratch databases") {
        let path = entry.expect("should read scratch entry").path();
        if path
            .extension()
            .is_some_and(|extension| extension == "duckdb")
        {
            Workspace::open(path, context.workspace.clone())
                .await
                .expect("should reopen failed stage workspace")
                .close()
                .await
                .expect("should close reopened workspace");
        }
    }
}

#[tokio::test]
async fn checkpoint_unordered_across_groups() {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let input = input(&context).await;
    // Each group alone is increasing, but the persisted file violates the cross-group order.
    let diff = checkpoint(
        &context,
        &[(
            "entity/sink-aircraft",
            changes("VALUES (0, 2, 'insert'), (1, 1, 'update')", ""),
        )],
        None,
    )
    .await;
    let error = plan(&context, &input, &capture(), &diff)
        .await
        .expect_err("should reject unordered checkpoint");
    assert_eq!(Code::of(&error), Some(Code::InvalidCheckpoint));
    assert_eq!(
        finished::<PlanOutput>(&context, &context.namespace.plan_output(input.run.into()))
            .await
            .expect("should inspect marker"),
        None
    );
}

#[tokio::test]
async fn replay_empty_marker_precedes_inputs() {
    let directory = TempDir::new().expect("should create fixture directory");
    let mut context = context(directory.path());
    context.clock = Box::new(NoClock);
    let mut input = input(&context).await;
    input.definition = None;
    let mut diff = checkpoint(&context, &[], None).await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should publish valid empty output");
    assert_eq!(output.batches, 0);
    assert_eq!(output.counts.len(), 4);
    assert!(output.counts.values().all(|count| *count == 0));
    assert_eq!(
        read(&context, &output.writes).await.columns(),
        [
            "seq",
            "batch",
            "operation",
            "change",
            "entity_id",
            "target",
            "source_id",
            "left_entity_id",
            "right_entity_id",
            "create",
            "patch"
        ]
        .map(Box::<str>::from)
    );
    assert_eq!(read(&context, &output.writes).await.iter().len(), 0);
    assert_eq!(read(&context, &output.issues).await.iter().len(), 0);
    input.definition = Some("invalid definition".into());
    diff.targets.insert(
        "entity/unknown".parse().expect("should parse target"),
        TargetDiff {
            changes: Some(diff.archives.clone()),
            counts: DiffCounts::default(),
        },
    );
    assert_eq!(
        plan(&context, &input, &capture(), &diff)
            .await
            .expect("should replay marker without reading inputs"),
        output
    );
}

#[tokio::test]
async fn marker_race_returns_one_winner() {
    let directory = TempDir::new().expect("should create fixture directory");
    let first = context(directory.path());
    let second = context(directory.path());
    let input = input(&first).await;
    let diff = checkpoint(
        &first,
        &[(
            "entity/sink-aircraft",
            changes("VALUES (0, 1, 'insert')", ", 'DC-3' AS MODEL"),
        )],
        None,
    )
    .await;
    let captured = capture();
    let (left, right) = tokio::join!(
        plan(&first, &input, &captured, &diff),
        plan(&second, &input, &captured, &diff)
    );
    let left = left.expect("should return winning plan");
    assert_eq!(left, right.expect("should reuse winning plan"));
    assert_eq!(read(&first, &left.writes).await.iter().len(), 1);
}

#[tokio::test]
async fn archives_without_definition() {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let mut input = input(&context).await;
    input.definition = None;
    let diff = checkpoint(
        &context,
        &[],
        Some(&format!(
            "SELECT * FROM (VALUES ('{}', 'entity', 'sink-airfields', 'gone'), ('{}', 'entity', \
             'sink-aircraft', 'gone'), ('{}', 'link', 'aircraft-based-at', 'gone')) \
             rows(entity_id, kind, target, source_id)",
            entity(1),
            entity(2),
            entity(3)
        )),
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should archive targets absent from definition");
    let rows = read(&context, &output.writes).await;
    assert_eq!(
        rows.iter()
            .map(|row| text(row, 4).to_owned())
            .collect::<Vec<_>>(),
        [entity(3), entity(2), entity(1)]
    );
    for row in rows.iter() {
        assert_eq!(&row[7..10], [Value::Null, Value::Null, Value::Null]);
        assert_eq!(
            serde_json::from_str::<JsonValue>(text(row, 10)).expect("should parse archive")
                ["archived"],
            true
        );
    }
}

#[rstest]
#[case("entity/not-a-sink", false)]
#[case("entity/sink-aircraft", true)]
#[case("link/aircraft-based-at", false)]
#[tokio::test]
async fn checkpoint_target_or_endpoints_missing(#[case] target: &str, #[case] no_definition: bool) {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let mut input = input(&context).await;
    if no_definition {
        input.definition = None;
    }
    let diff = checkpoint(
        &context,
        &[(target, changes("VALUES (0, 1, 'insert')", ""))],
        None,
    )
    .await;
    let error = plan(&context, &input, &capture(), &diff)
        .await
        .expect_err("should reject an unmapped target or link without endpoints");
    assert_eq!(Code::of(&error), Some(Code::InvalidCheckpoint));
    assert_eq!(
        finished::<PlanOutput>(&context, &context.namespace.plan_output(input.run.into()))
            .await
            .expect("should inspect marker"),
        None
    );
}

#[tokio::test]
async fn target_sink_inside_branch() {
    let directory = TempDir::new().expect("should create fixture directory");
    let context = context(directory.path());
    let definition = "connector: aviation\nsources:\n  items:\n    primaryKey: [id]\n    sql: SELECT 1 AS id\npipelines:\n  entities:\n    - source: items\n      steps:\n        - id: fork\n          branches:\n            - - id: sink-branch\n                sink:\n                  entityType: https://example.com/type/v/1\n                  entityId: id\n";
    let input = start(&context, apply(run_id(1), definition))
        .await
        .expect("should pin branched definition");
    let diff = checkpoint(
        &context,
        &[("entity/sink-branch", changes("VALUES (0, 1, 'insert')", ""))],
        None,
    )
    .await;
    let output = plan(&context, &input, &capture(), &diff)
        .await
        .expect("should map the branch sink");
    let rows = read(&context, &output.writes).await;
    assert_eq!(rows.iter().len(), 1);
    let row = rows.get(0).expect("should contain branch write");
    assert_eq!(text(row, 4), entity(1));
    assert_eq!(text(row, 5), "sink-branch");
}
