use core::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

use rstest::rstest;
use serde_json::value::RawValue;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use tokio::sync::Notify;
use type_system::principal::actor::ActorEntityUuid;

use super::{setup, single_plan};
use crate::{
    Code,
    graph::{Graph, GraphResponse},
    run::{current, marker, tests::run_id},
    stage::send::{SendOutput, send},
};

struct PausedAttempt {
    response: GraphResponse,
    calls: AtomicUsize,
    reached: Notify,
    released: Notify,
    wait: bool,
}

impl PausedAttempt {
    async fn answer(&self) -> GraphResponse {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.reached.notify_one();
        if self.wait {
            self.released.notified().await;
        }
        self.response
    }
}

impl Graph for PausedAttempt {
    async fn create(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.answer().await
    }

    async fn patch(&self, _: ActorEntityUuid, _: &[&RawValue]) -> GraphResponse {
        self.answer().await
    }
}

#[rstest]
#[case::next_batch(false, GraphResponse::Applied, true)]
#[case::bulk_fallback(false, GraphResponse::Status(400), true)]
#[case::conflict_fallback(true, GraphResponse::Status(409), true)]
#[case::before_publication(true, GraphResponse::Applied, true)]
#[case::retry_backoff(true, GraphResponse::Status(503), false)]
#[tokio::test(start_paused = true)]
async fn takeover_stops_next_effect(
    #[case] single: bool,
    #[case] response: GraphResponse,
    #[case] wait: bool,
) {
    let directory = TempDir::new().expect("should create fixture directory");
    let (mut context, input, diff, mut plan) = setup(&directory).await;
    context.send.first_wait = Duration::from_secs(10);
    context.send.longest_wait = Duration::from_secs(10);
    if single {
        plan = single_plan(&context, "insert").await;
    }
    let graph = PausedAttempt {
        response,
        calls: AtomicUsize::new(0),
        reached: Notify::new(),
        released: Notify::new(),
        wait,
    };
    let sending = send(&context, &input, &diff, &plan, &graph);
    tokio::pin!(sending);
    tokio::select! {
        result = &mut sending => panic!("should pause the first authorized request: {result:?}"),
        () = graph.reached.notified() => {}
    }
    // The sender future remains unpolled while the successor takes authority. In the backoff
    // case the first response has returned synchronously and the retry timer is already pending.
    current::mark_sending(&context, run_id(2), None, &[input.run])
        .await
        .expect("should take over the paused sender");
    graph.released.notify_one();
    tokio::time::advance(Duration::from_secs(10)).await;
    let error = sending
        .await
        .expect_err("should stop the superseded sender");
    assert_eq!(Code::of(&error), Some(Code::Superseded));
    assert_eq!(graph.calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        marker::finished::<SendOutput>(&context, &context.namespace.send_output(input.run.into()))
            .await
            .expect("should read marker"),
        None
    );
    assert_eq!(
        Code::of(
            &current::commit(&context, input.run, diff.base, &diff.resent)
                .await
                .expect_err("should refuse stale commit")
        ),
        Some(Code::Superseded)
    );
    let current = current::read(&context)
        .await
        .expect("should preserve successor authority");
    assert_eq!(current.committed, None);
    assert_eq!(current.sending, [input.run, run_id(2)]);
}

#[tokio::test]
async fn marker_cannot_commit_over_takeover() {
    let directory = TempDir::new().expect("should create fixture directory");
    let (context, input, diff, plan) = setup(&directory).await;
    current::mark_sending(&context, input.run, None, &[])
        .await
        .expect("should start sender");
    let output = SendOutput {
        rejected: None,
        counts: super::SendCounts {
            created: 6,
            ..super::SendCounts::default()
        },
    };
    current::mark_sending(&context, run_id(2), None, &[input.run])
        .await
        .expect("should take over before the old marker binds");
    marker::finish(
        &context,
        &context.namespace.send_output(input.run.into()),
        &output,
    )
    .await
    .expect("should model an old marker winning after its final authority read");
    let graph = super::Scripted::default();
    let error = send(&context, &input, &diff, &plan, &graph)
        .await
        .expect_err("should revalidate after the old marker");
    assert_eq!(Code::of(&error), Some(Code::Superseded));
    assert_eq!(graph.calls.lock().expect("should read calls").len(), 0);
    assert_eq!(
        current::read(&context)
            .await
            .expect("should read successor state")
            .sending,
        [input.run, run_id(2)]
    );
}
