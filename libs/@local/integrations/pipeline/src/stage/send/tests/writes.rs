use core::sync::atomic::{AtomicUsize, Ordering};

use rstest::rstest;
use serde_json::{Value as JsonValue, json, value::RawValue};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{Scripted, plan_rows, rejected, rows, setup};
use crate::{
    Code,
    graph::{FakeGraph, Graph, GraphResponse, OperationKind},
    run::{current, marker},
    stage::send::{SendGuard, SendOutput, deliver, send},
};

#[rstest]
#[case("sequence")]
#[case("batch")]
#[case("mixed_operation")]
#[case("mixed_first_request")]
#[case("missing_create")]
#[case("invalid_json")]
#[case("invalid_change")]
#[case("row_count")]
#[case("oversized_batch")]
#[case("zero_batches")]
#[tokio::test]
async fn checkpoint_invalid(#[case] defect: &str) {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, _) = setup(&directory).await;
    let mut fixture = rows()[..2].to_vec();
    match defect {
        "sequence" => fixture[1][0] = json!(3),
        "batch" => {
            fixture[0][1] = json!(1);
            fixture[1][1] = json!(1);
        }
        "mixed_operation" => {
            fixture[1][2] = json!("upsert_link");
            fixture[1][7] = fixture[0][4].clone();
            fixture[1][8] = fixture[0][4].clone();
        }
        "mixed_first_request" => fixture[1][3] = json!("update"),
        "missing_create" => fixture[0][9] = JsonValue::Null,
        "invalid_json" => fixture[0][10] = json!("invalid"),
        "invalid_change" => fixture[0][3] = json!("archive"),
        "row_count" | "zero_batches" => {}
        "oversized_batch" => {
            fixture = (0..129)
                .map(|seq| {
                    let mut row = fixture[0].clone();
                    row[0] = json!(seq);
                    row
                })
                .collect();
        }
        _ => panic!("should select a known checkpoint defect"),
    }
    let mut plan = plan_rows(&context, fixture).await;
    if defect == "row_count" {
        *plan
            .counts
            .get_mut(&OperationKind::UpsertEntity)
            .expect("should have count") += 1;
    }
    if defect == "zero_batches" {
        plan.batches = 0;
    }
    let graph = Scripted::default();
    let error = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect_err("should reject malformed writes before delivery");
    assert_eq!(Code::of(&error), Some(Code::InvalidWrites));
    assert_eq!(graph.calls.lock().expect("should read attempts").len(), 0);
    assert_eq!(
        marker::finished::<SendOutput>(&context, &context.namespace.send_output(input.run.into()))
            .await
            .expect("should read marker"),
        None
    );
}

#[tokio::test]
async fn delivery_replay_before_marker() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, plan) = setup(&directory).await;
    let graph = FakeGraph::default();
    current::mark_sending(&context, input.run, diff.base, &diff.resent)
        .await
        .expect("should begin sending");
    let first = deliver(
        &SendGuard {
            context: &context,
            input: &input,
            diff: &diff,
        },
        &plan,
        &graph,
    )
    .await
    .expect("should deliver before simulated interruption");
    assert_eq!(first.counts.created, 6);
    assert_eq!(graph.requests().len(), 2);
    let replay = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should replay without a completion marker");
    assert_eq!(replay.counts.patched, 6);
    assert_eq!(graph.requests().len(), 14);
    for row in rows() {
        assert_eq!(
            graph
                .entity(super::identity(&row))
                .expect("should retain entity")
                .editions,
            1
        );
    }
}

struct RejectAll(AtomicUsize);
#[expect(
    clippy::unused_async_trait_impl,
    reason = "scripted effects occur only when the Graph future is polled"
)]
impl Graph for RejectAll {
    async fn create(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.0.fetch_add(1, Ordering::SeqCst);
        GraphResponse::Status(400)
    }

    async fn patch(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.0.fetch_add(1, Ordering::SeqCst);
        GraphResponse::Status(400)
    }
}

#[tokio::test]
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "independent batch fixtures use the specified 128-write limit"
)]
async fn rejected_volume_crosses_buffers_and_record_batches() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, _) = setup(&directory).await;
    let template = rows().remove(0);
    let original_id = template[4].as_str().expect("should have fixture ID");
    let original_uuid = original_id
        .split_once('~')
        .expect("should have fixture UUID")
        .1;
    let fixture: Vec<_> = (0_u64..2500)
        .map(|seq| {
            let mut row = template.clone();
            let uuid = Uuid::from_u128(u128::from(seq) + 1).to_string();
            row[0] = json!(seq);
            // The first batch has one row so the following batch straddles Arrow record batches.
            row[1] = json!(if seq == 0 { 0 } else { 1 + (seq - 1) / 128 });
            row[4] = json!(original_id.replace(original_uuid, &uuid));
            row[6] = json!(format!("{seq:06}:{}", "x".repeat(4096)));
            row[9] = json!(
                template[9]
                    .as_str()
                    .expect("should contain create")
                    .replace(original_uuid, &uuid)
            );
            row[10] = json!(
                template[10]
                    .as_str()
                    .expect("should contain patch")
                    .replace(original_uuid, &uuid)
            );
            row
        })
        .collect();
    let plan = plan_rows(&context, fixture).await;
    assert_eq!(plan.batches, 21);
    let graph = RejectAll(AtomicUsize::new(0));
    let output = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect("should publish bounded rejection output");
    assert_eq!(output.counts.rejected, 2500);
    assert_eq!(graph.0.load(Ordering::SeqCst), 2520);
    let rows = rejected(&context, &output).await;
    assert_eq!(rows.len(), 2500);
    for (seq, row) in rows.iter().enumerate() {
        assert_eq!(
            row[4],
            duckdb::types::Value::Text(format!("{seq:06}:{}", "x".repeat(4096)))
        );
        assert_eq!(row[5], duckdb::types::Value::USmallInt(400));
    }
}
