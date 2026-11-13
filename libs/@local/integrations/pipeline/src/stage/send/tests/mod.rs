mod takeover;
mod writes;

use alloc::collections::BTreeMap;
use core::time::Duration;
use std::sync::Mutex;

use duckdb::types::Value;
use hash_integrations_definition::Variables;
use rstest::rstest;
use serde_json::{Value as JsonValue, json, value::RawValue};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use type_system::{knowledge::entity::id::EntityId, principal::actor::ActorEntityUuid};

use super::{SendCounts, send};
use crate::{
    Code, RunContext, RunInput, StageError,
    graph::{FakeGraph, Graph, GraphResponse, OperationKind, RequestKind},
    run::{
        current, marker,
        table::load_table,
        tests::{apply, context, fixtures, run_id},
    },
    stage::{diff::DiffOutput, plan::PlanOutput},
    start,
};

#[derive(Default)]
struct Scripted {
    answers: Mutex<alloc::collections::VecDeque<GraphResponse>>,
    calls: Mutex<Vec<RequestKind>>,
}

impl Scripted {
    fn new(answers: &[u16]) -> Self {
        Self {
            answers: Mutex::new(
                answers
                    .iter()
                    .map(|status| {
                        if *status == 0 {
                            GraphResponse::Applied
                        } else {
                            GraphResponse::Status(*status)
                        }
                    })
                    .collect(),
            ),
            calls: Mutex::default(),
        }
    }

    fn handle(&self, kind: RequestKind) -> GraphResponse {
        self.calls
            .lock()
            .expect("should not poison calls")
            .push(kind);
        self.answers
            .lock()
            .expect("should not poison answers")
            .pop_front()
            .unwrap_or(GraphResponse::Applied)
    }
}
#[expect(
    clippy::unused_async_trait_impl,
    reason = "scripted effects occur only when the Graph future is polled"
)]
impl Graph for Scripted {
    async fn create(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.handle(RequestKind::Create)
    }

    async fn patch(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.handle(RequestKind::Patch)
    }
}

fn rows() -> Vec<JsonValue> {
    fixtures::first_run()["run_1"]["plan"]["writes"]["rows"]
        .as_array()
        .expect("should supply independent writes")
        .clone()
}

fn identity(row: &JsonValue) -> EntityId {
    serde_json::from_value(row[4].clone()).expect("should parse supplied identity")
}

async fn setup(directory: &TempDir) -> (RunContext, RunInput, DiffOutput, PlanOutput) {
    let mut context = context(directory.path());
    context.send.first_wait = Duration::ZERO;
    context.send.longest_wait = Duration::ZERO;
    let input = start(
        &context,
        apply(
            run_id(1),
            include_str!("../../../../tests/fixtures/aviation.yaml"),
        ),
    )
    .await
    .expect("should start fixture run");
    let checkpoints = fixtures::checkpoints(&context).await;
    (context, input, checkpoints.diff, checkpoints.plan)
}

async fn plan_rows(context: &RunContext, rows: Vec<JsonValue>) -> PlanOutput {
    let mut counts = BTreeMap::from([
        (OperationKind::UpsertEntity, 0),
        (OperationKind::UpsertLink, 0),
        (OperationKind::ArchiveLink, 0),
        (OperationKind::ArchiveEntity, 0),
    ]);
    for row in &rows {
        let operation: OperationKind =
            serde_json::from_value(row[2].clone()).expect("should specify operation");
        *counts.get_mut(&operation).expect("should have every count") += 1;
    }
    let batches = rows.last().map_or(0, |row| {
        u32::try_from(row[1].as_u64().expect("should specify batch") + 1).expect("should fit batch")
    });
    let writes = fixtures::store_expected(context, &json!({"schema":"writes","rows":rows})).await;
    let issues =
        fixtures::store_expected(context, &fixtures::first_run()["run_1"]["plan"]["issues"]).await;
    PlanOutput {
        writes,
        issues,
        batches,
        counts,
    }
}

async fn single_plan(context: &RunContext, change: &str) -> PlanOutput {
    let mut row = rows().remove(0);
    row[3] = json!(change);
    if change == "archive" {
        row[2] = json!("archive_entity");
        row[9] = JsonValue::Null;
        let bodies: JsonValue =
            serde_json::from_str(include_str!("../../../../tests/fixtures/requests.json"))
                .expect("should decode independent body catalog");
        row[10] = bodies["bodies"]["AC-SEXXX"]["archive"].clone();
    }
    plan_rows(context, vec![row]).await
}

async fn rejected(context: &RunContext, output: &super::SendOutput) -> Vec<Vec<Value>> {
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open rejection reader");
    load_table(
        context,
        &workspace,
        output.rejected.as_ref().expect("should have rejections"),
        "rejected".into(),
    )
    .await
    .expect("should load rejected rows");
    let rows = workspace
        .query("SELECT * FROM rejected ORDER BY rowid".into())
        .await
        .expect("should read rejection order");
    assert_eq!(
        rows.columns()
            .iter()
            .map(AsRef::as_ref)
            .collect::<Vec<&str>>(),
        [
            "entity_id",
            "operation",
            "change",
            "target",
            "source_id",
            "status",
            "reason"
        ]
    );
    let rows = rows.iter().map(<[_]>::to_vec).collect();
    workspace.close().await.expect("should close reader");
    rows
}

#[rstest]
#[case("insert", vec![0], vec![RequestKind::Create], [1,0,0,0,0], None)]
#[case("insert", vec![409,0], vec![RequestKind::Create,RequestKind::Patch], [0,1,0,0,0], None)]
#[case("update", vec![404,0], vec![RequestKind::Patch,RequestKind::Create], [1,0,0,0,0], None)]
#[case("insert", vec![409,404], vec![RequestKind::Create,RequestKind::Patch], [0,0,0,0,1], Some("not_found_after_conflict"))]
#[case("resend", vec![404,409], vec![RequestKind::Patch,RequestKind::Create], [0,0,0,0,1], Some("conflict_after_not_found"))]
#[case("insert", vec![404], vec![RequestKind::Create], [0,0,0,0,1], Some("graph_status"))]
#[case("update", vec![409], vec![RequestKind::Patch], [0,0,0,0,1], Some("graph_status"))]
#[case("archive", vec![404], vec![RequestKind::Patch], [0,0,0,1,0], None)]
#[case("archive", vec![409], vec![RequestKind::Patch], [0,0,0,0,1], Some("graph_status"))]
#[case("archive", vec![0], vec![RequestKind::Patch], [0,0,1,0,0], None)]
#[case("insert", vec![500,500,500,500,500], vec![RequestKind::Create;5], [0,0,0,0,1], Some("graph_status"))]
#[case("insert", vec![500,409,429,0], vec![RequestKind::Create,RequestKind::Create,RequestKind::Patch,RequestKind::Patch], [0,1,0,0,0], None)]
#[tokio::test]
async fn single_response_table(
    #[case] change: &str,
    #[case] answers: Vec<u16>,
    #[case] calls: Vec<RequestKind>,
    #[case] counts: [u64; 5],
    #[case] reason: Option<&str>,
) {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, _) = setup(&directory).await;
    let plan = single_plan(&context, change).await;
    let graph = Scripted::new(&answers);
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should complete the response table");
    let [created, patched, archived, absent, rejected_count] = counts;
    assert_eq!(
        output.counts,
        SendCounts {
            created,
            patched,
            archived,
            absent,
            rejected: rejected_count
        }
    );
    assert_eq!(*graph.calls.lock().expect("should read calls"), calls);
    assert_eq!(
        current::read(&context)
            .await
            .expect("should read current")
            .committed,
        Some(input.run)
    );
    if let Some(reason) = reason {
        let rows = rejected(&context, &output).await;
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][6], Value::Text(reason.into()));
        assert_eq!(
            rows[0][5],
            Value::USmallInt(*answers.last().expect("should contain a response"))
        );
    } else {
        assert_eq!(output.rejected, None);
    }
}

#[rstest]
#[case(429)]
#[case(499)]
#[case(502)]
#[case(503)]
#[case(504)]
#[tokio::test]
async fn request_unavailable_preserves_sender(#[case] status: u16) {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, _) = setup(&directory).await;
    let plan = single_plan(&context, "update").await;
    let graph = Scripted::new(&[status; 5]);
    let error = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect_err("should stop unavailable delivery");
    assert_eq!(Code::of(&error), Some(Code::GraphUnavailable));
    assert_eq!(*error.current_context(), StageError::Retryable);
    assert_eq!(graph.calls.lock().expect("should read calls").len(), 5);
    let current = current::read(&context).await.expect("should read current");
    assert_eq!(current.committed, None);
    assert_eq!(current.sending, [input.run]);
    assert_eq!(
        marker::finished::<super::SendOutput>(
            &context,
            &context.namespace.send_output(input.run.into())
        )
        .await
        .expect("should read marker"),
        None
    );
}

#[tokio::test]
async fn bulk_rejection_suppresses_links_and_preserves_order() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, plan) = setup(&directory).await;
    let graph = FakeGraph::default();
    let fixture_rows = rows();
    graph.answer(RequestKind::Create, identity(&fixture_rows[1]), 400);
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should commit rejected writes");
    assert_eq!(
        output.counts,
        SendCounts {
            created: 4,
            rejected: 2,
            ..SendCounts::default()
        }
    );
    let requests = graph.requests();
    assert_eq!(
        requests
            .iter()
            .map(|request| request.entity_ids.len())
            .collect::<Vec<_>>(),
        [4, 1, 1, 1, 1, 1]
    );
    assert_eq!(
        requests
            .last()
            .expect("should send one permitted link")
            .entity_ids,
        [identity(&fixture_rows[5])]
    );
    let rejected = rejected(&context, &output).await;
    assert_eq!(
        rejected
            .iter()
            .map(|row| (&row[0], &row[5], &row[6]))
            .collect::<Vec<_>>(),
        [
            (
                &Value::Text(
                    fixture_rows[1][4]
                        .as_str()
                        .expect("should contain ID")
                        .into()
                ),
                &Value::USmallInt(400),
                &Value::Text("graph_status".into())
            ),
            (
                &Value::Text(
                    fixture_rows[4][4]
                        .as_str()
                        .expect("should contain ID")
                        .into()
                ),
                &Value::Null,
                &Value::Text("endpoint_rejected".into())
            ),
        ]
    );
    assert!(
        !format!("{rejected:?}").contains("L-1049"),
        "should not record property values"
    );
}

#[tokio::test]
async fn completed_marker_replays_without_requests() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, plan) = setup(&directory).await;
    let graph = FakeGraph::default();
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should complete first send");
    assert_eq!(graph.requests().len(), 2);
    assert_eq!(
        send(&context, &input, &diff, &plan, &graph)
            .await
            .expect("should recover lost commit acknowledgement"),
        output
    );
    assert_eq!(graph.requests(), []);
    current::mark_sending(&context, run_id(2), Some(input.run), &[])
        .await
        .expect("should start a later run");
    current::commit(&context, run_id(2), Some(input.run), &[])
        .await
        .expect("should commit a later run");
    let error = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect_err("should refuse stale commit despite marker");
    assert_eq!(Code::of(&error), Some(Code::BaseMoved));
    assert_eq!(graph.requests(), []);
    assert_eq!(
        current::read(&context)
            .await
            .expect("should read current")
            .committed,
        Some(run_id(2))
    );
}

#[rstest]
#[case(499)]
#[case(500)]
#[tokio::test]
async fn bulk_status_uses_single_fallbacks(#[case] status: u16) {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, _) = setup(&directory).await;
    let plan = plan_rows(&context, rows()[..2].to_vec()).await;
    let graph = Scripted::new(&[status, 0, 0]);
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should apply both single fallbacks");
    assert_eq!(output.counts.created, 2);
    assert_eq!(
        *graph.calls.lock().expect("should read calls"),
        [RequestKind::Create; 3]
    );
}

#[tokio::test(start_paused = true)]
async fn retries_share_attempt_budget_and_backoff() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (mut context, input, diff, _) = setup(&directory).await;
    context.send = crate::SendSettings {
        max_attempts: 3,
        ..crate::SendSettings::default()
    };
    let plan = single_plan(&context, "update").await;
    let graph = Scripted::new(&[503, 500, 503]);
    let started = tokio::time::Instant::now();
    let error = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect_err("should exhaust one shared request budget");
    assert_eq!(Code::of(&error), Some(Code::GraphUnavailable));
    assert_eq!(graph.calls.lock().expect("should read calls").len(), 3);
    assert_eq!(started.elapsed(), Duration::from_millis(1500));
}

#[tokio::test(start_paused = true)]
async fn retry_wait_saturates_at_cap() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (mut context, input, diff, _) = setup(&directory).await;
    context.send = crate::SendSettings {
        max_attempts: 9,
        ..crate::SendSettings::default()
    };
    let plan = single_plan(&context, "insert").await;
    let graph = Scripted::new(&[500; 9]);
    let started = tokio::time::Instant::now();
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should reject after capped retry waits");
    assert_eq!(output.counts.rejected, 1);
    assert_eq!(graph.calls.lock().expect("should read calls").len(), 9);
    assert_eq!(started.elapsed(), Duration::from_millis(91_500));
}
