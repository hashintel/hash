//! A request already authorized before takeover can finish late; reconcile repairs its effect.

use core::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, value::RawValue};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use tokio::sync::Notify;
use type_system::{knowledge::entity::id::EntityId, principal::actor::ActorEntityUuid};

use super::{apply, context, reader, run_id};
use crate::{
    Code, OperationRequest, StageError,
    graph::{FakeGraph, Graph, GraphResponse},
    run::{current, marker, run},
    sources::tests::NoSecrets,
    stage::send::SendOutput,
};

const DEFINITION: &str = include_str!("../../../tests/fixtures/aviation.yaml");

struct DelayedGraph<'graph> {
    graph: &'graph FakeGraph,
    entered: Notify,
    release: Notify,
    attempts: AtomicUsize,
}

impl DelayedGraph<'_> {
    async fn pause(&self) {
        self.attempts.fetch_add(1, Ordering::SeqCst);
        self.entered.notify_one();
        self.release.notified().await;
    }
}

impl Graph for DelayedGraph<'_> {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.pause().await;
        self.graph.create(actor, bodies).await
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.pause().await;
        self.graph.patch(actor, bodies).await
    }
}

fn aircraft(graph: &FakeGraph) -> (Value, u64) {
    let identity: EntityId = serde_json::from_value(serde_json::json!(
        "00000000-0000-4000-8000-000000000001~e0db547f-47bc-5587-a517-7b9eb11d952c"
    ))
    .expect("should decode the independently specified AC-N100 identity");
    let entity = graph.entity(identity).expect("should contain AC-N100");
    let properties =
        serde_json::to_value(entity.properties).expect("should inspect the stored properties");
    (
        properties["value"]["https://example.com/@demo/types/property-type/model/"]["value"]
            .clone(),
        entity.editions,
    )
}

#[tokio::test]
async fn reconcile_repairs_authorized_late_call() {
    let directory = TempDir::new().expect("should isolate the competing runs");
    let base = context(directory.path());
    let sources = reader(&base, directory.path());
    let graph = FakeGraph::default();
    run(
        &base,
        apply(run_id(1), DEFINITION),
        &sources,
        &NoSecrets,
        &graph,
    )
    .await
    .expect("should commit the initial desired state");
    assert_eq!(aircraft(&graph), (Value::String("L-1049".into()), 1));

    let delayed = DelayedGraph {
        graph: &graph,
        entered: Notify::new(),
        release: Notify::new(),
        attempts: AtomicUsize::new(0),
    };
    let older = context(directory.path());
    let changed = DEFINITION.replace("'L-1049'", "'L-1049G'");
    let sending = run(
        &older,
        apply(run_id(2), &changed),
        &sources,
        &NoSecrets,
        &delayed,
    );
    tokio::pin!(sending);
    tokio::select! {
        () = delayed.entered.notified() => {},
        result = &mut sending => panic!("should pause the authorized request before application: {result:?}"),
    }
    assert_eq!(
        current::read(&older)
            .await
            .expect("should observe sender A")
            .sending,
        [run_id(2)]
    );

    let newer = context(directory.path());
    let replacement = run(
        &newer,
        apply(run_id(3), DEFINITION),
        &sources,
        &NoSecrets,
        &graph,
    )
    .await
    .expect("should take over and commit the original desired state");
    assert_eq!(replacement.counts.patched, 1);
    assert_eq!(aircraft(&graph), (Value::String("L-1049".into()), 1));
    delayed.release.notify_one();
    let stopped = sending
        .await
        .expect_err("should prevent the old run from committing");
    assert_eq!(*stopped.current_context(), StageError::Permanent);
    assert_eq!(Code::of(&stopped), Some(Code::BaseMoved));
    assert_eq!(delayed.attempts.load(Ordering::SeqCst), 1);
    assert_eq!(aircraft(&graph), (Value::String("L-1049G".into()), 2));
    assert_eq!(
        marker::finished::<SendOutput>(&older, &older.namespace.send_output(run_id(2).into()))
            .await
            .expect("should inspect the stopped sender marker"),
        None
    );
    let state = current::read(&newer)
        .await
        .expect("should retain the newer commit");
    assert_eq!(state.committed, Some(run_id(3)));
    assert!(
        state.sending.is_empty(),
        "should preserve the newer sender state"
    );

    let reconciler = context(directory.path());
    let mut request = apply(run_id(4), DEFINITION);
    request.operation = OperationRequest::Reconcile;
    let repaired = run(&reconciler, request, &sources, &NoSecrets, &graph)
        .await
        .expect("should repair the permitted late effect through explicit reconcile");
    assert_eq!(repaired.counts.patched, 6);
    assert_eq!(aircraft(&graph), (Value::String("L-1049".into()), 3));
    assert_eq!(
        current::read(&reconciler)
            .await
            .expect("should commit reconcile")
            .committed,
        Some(run_id(4))
    );
}
