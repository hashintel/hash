//! Tests the workflow boundary with real stages and persisted checkpoints.

use alloc::sync::Arc;
use core::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use std::fs;

use error_stack::Report;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::value::RawValue;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use tokio::sync::Notify;
use type_system::principal::actor::ActorEntityUuid;

use super::PipelineFunction;
use crate::{
    Code, OperationRequest, RunRequest, SendSettings,
    graph::{FakeGraph, Graph, GraphResponse},
    orchestration::{
        FailureKind, Payload, RunError, RunFunction as _, StepContext, StepFailure, StepName,
    },
    run::{
        current::{self, Current},
        marker,
        tests::{apply, context, run_id},
    },
    sources::tests::NoSecrets,
    stage::{capture::CaptureOutput, diff::DiffOutput, plan::PlanOutput, send::SendOutput},
};

const DEFINITION: &str = include_str!("../../../tests/fixtures/aviation.yaml");
const STEP_NAMES: [&str; 5] = ["start", "capture", "diff", "plan", "send"];

#[derive(Default)]
struct Steps {
    recorded: Vec<(StepName, Payload)>,
    requested: Vec<StepName>,
    executed: Vec<StepName>,
    cursor: usize,
    repeat: bool,
    stop_before: Option<&'static str>,
    cancel_inside_send: Option<Arc<Notify>>,
    failure: Option<StepFailure>,
}

impl Steps {
    fn rewind(&mut self) {
        self.cursor = 0;
        self.requested.clear();
        self.executed.clear();
        self.failure = None;
    }

    fn output<T: DeserializeOwned>(&self, name: &str) -> T {
        self.recorded
            .iter()
            .find(|(step, _)| step.as_ref() == name)
            .expect("should record the named step")
            .1
            .decode()
            .expect("should decode the recorded checkpoint")
    }
}

impl StepContext for Steps {
    async fn run<T, F, Fut>(&mut self, name: StepName, mut step: F) -> Result<T, Report<RunError>>
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnMut() -> Fut + Send,
        Fut: Future<Output = Result<T, Report<StepFailure>>> + Send,
    {
        self.requested.push(name.clone());
        if let Some((recorded, payload)) = self.recorded.get(self.cursor) {
            assert_eq!(
                recorded, &name,
                "should request the recorded step at this position"
            );
            self.cursor += 1;
            return Ok(payload
                .decode()
                .expect("should replay the checkpoint without executing"));
        }
        if self.stop_before == Some(name.as_ref()) {
            return Err(Report::new(RunError::Stopped).attach("backend boundary cancellation"));
        }
        self.executed.push(name.clone());
        let result = if name.as_ref() == "send"
            && let Some(cancel) = self.cancel_inside_send.take()
        {
            tokio::select! {
                result = step() => result,
                () = cancel.notified() => return Err(Report::new(RunError::Stopped).attach("backend in-flight cancellation")),
            }
        } else {
            step().await
        };
        let output = match result {
            Ok(output) => output,
            Err(report) => {
                self.failure = Some(report.current_context().clone());
                return Err(report.change_context(RunError::Stopped));
            }
        };
        let payload = Payload::encode(&output).expect("should encode the checkpoint");
        if self.repeat {
            let repeated = step()
                .await
                .expect("should retry a successful step before recording");
            assert_eq!(
                Payload::encode(&repeated).expect("should encode retried checkpoint"),
                payload,
                "should return the winning marker on an unacknowledged step retry"
            );
        }
        self.recorded.push((name, payload));
        self.cursor += 1;
        Ok(output)
    }
}

struct Fixture<G> {
    directory: TempDir,
    function: PipelineFunction<NoSecrets, G>,
    request: RunRequest,
}

fn fixture<G: Graph>(graph: G) -> Fixture<G> {
    let directory = TempDir::new().expect("should isolate workflow artifacts");
    let setup = context(directory.path());
    let local = directory.path().join("local");
    let scratch = directory.path().join("workflow-scratch");
    fs::create_dir_all(&local).expect("should create local source root");
    fs::create_dir_all(&scratch).expect("should create scratch parent");
    let request = apply(run_id(1), DEFINITION);
    let mut function = PipelineFunction::new(
        request.web,
        setup.storage,
        &local,
        scratch,
        NoSecrets,
        graph,
    )
    .expect("should configure the workflow");
    function.send = SendSettings {
        max_attempts: 1,
        first_wait: Duration::ZERO,
        longest_wait: Duration::ZERO,
    };
    Fixture {
        directory,
        function,
        request,
    }
}

fn assert_scratch_clean<G>(fixture: &Fixture<G>) {
    assert_eq!(
        fs::read_dir(&fixture.function.scratch)
            .expect("should inspect scratch parent")
            .count(),
        0,
        "should remove each invocation's scratch on every exit"
    );
}

fn assert_step_names(steps: &Steps) {
    let names: Vec<_> = steps.requested.iter().map(AsRef::as_ref).collect();
    assert_eq!(
        names, STEP_NAMES,
        "should preserve the five durable step names and order"
    );
}

#[tokio::test]
async fn workflow_retries_and_replays() {
    let fixture = fixture(FakeGraph::default());
    let mut steps = Steps {
        repeat: true,
        ..Steps::default()
    };
    fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect("should commit all five steps");
    assert_step_names(&steps);
    let captured: CaptureOutput = steps.output("capture");
    assert_eq!(
        captured.sources.len(),
        2,
        "should record both canonical source artifacts"
    );
    assert!(
        captured.sources.values().all(|source| source.rows == 2),
        "should preserve independent source counts"
    );
    let diffed: DiffOutput = steps.output("diff");
    assert_eq!(diffed.base, None);
    assert!(
        diffed.resent.is_empty(),
        "should start without interrupted predecessors"
    );
    let planned: PlanOutput = steps.output("plan");
    assert_eq!(
        planned.batches, 2,
        "should separate entity and link creates"
    );
    let sent: SendOutput = steps.output("send");
    assert_eq!(
        sent.counts.created, 6,
        "should create the six canonical entities and links"
    );
    assert_eq!(sent.counts.rejected, 0);
    assert_eq!(
        fixture.function.graph.requests().len(),
        2,
        "step retries should not resend completed delivery"
    );
    assert_scratch_clean(&fixture);

    let observed = context(fixture.directory.path());
    let before = observed
        .storage
        .read_versioned(&observed.namespace.current())
        .await
        .expect("should read committed state")
        .expect("should commit")
        .bytes;
    steps.rewind();
    fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect("should replay recorded steps on new scratch");
    assert_step_names(&steps);
    assert!(
        steps.executed.is_empty(),
        "recorded steps should never execute their closures"
    );
    assert!(
        fixture.function.graph.requests().is_empty(),
        "recorded replay should issue no additional Graph requests"
    );
    let after = observed
        .storage
        .read_versioned(&observed.namespace.current())
        .await
        .expect("should reread current")
        .expect("should retain committed state")
        .bytes;
    assert_eq!(
        after, before,
        "workflow replay should leave exact current bytes unchanged"
    );
    assert_scratch_clean(&fixture);
}

#[tokio::test]
async fn workflow_failed_send_resumes() {
    let fixture = fixture(FakeGraph::default());
    fixture.function.graph.unreachable_after(0);
    let mut steps = Steps::default();
    let report = fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect_err("should stop at retryable send failure");
    assert_eq!(*report.current_context(), RunError::Stopped);
    let failure = steps
        .failure
        .as_ref()
        .expect("should retain classified failure");
    assert_eq!(failure.kind, FailureKind::Retryable);
    assert_eq!(failure.code.as_ref(), "graph_unavailable");
    assert_eq!(
        report.downcast_ref::<Code>(),
        Some(&Code::GraphUnavailable),
        "should preserve lower error frames"
    );
    assert_eq!(
        steps.recorded.len(),
        4,
        "should record only completed predecessors"
    );
    let recorded = steps.recorded.clone();
    let observed = context(fixture.directory.path());
    assert_eq!(
        current::read(&observed)
            .await
            .expect("should read interrupted current"),
        Current {
            committed: None,
            sending: vec![fixture.request.run]
        }
    );
    assert_scratch_clean(&fixture);

    fixture.function.graph.reachable();
    steps.rewind();
    fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect("should resume the same run from recorded checkpoints");
    assert_eq!(&steps.recorded[..4], recorded);
    assert_eq!(
        steps.executed.iter().map(AsRef::as_ref).collect::<Vec<_>>(),
        ["send"]
    );
    assert_eq!(
        current::read(&observed)
            .await
            .expect("should read completed current"),
        Current {
            committed: Some(fixture.request.run),
            sending: vec![]
        }
    );
    assert_eq!(steps.output::<SendOutput>("send").counts.created, 6);
    assert_scratch_clean(&fixture);
}

#[tokio::test]
async fn workflow_cancel_between_steps() {
    let fixture = fixture(FakeGraph::default());
    let mut steps = Steps {
        stop_before: Some("plan"),
        ..Steps::default()
    };
    let report = fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect_err("should propagate the backend stop");
    assert_eq!(*report.current_context(), RunError::Stopped);
    assert!(
        format!("{report:?}").contains("backend boundary cancellation"),
        "should retain the backend's report unchanged"
    );
    assert_eq!(steps.recorded.len(), 3);
    assert!(
        fixture.function.graph.requests().is_empty(),
        "should not start delivery after cancellation"
    );
    let observed = context(fixture.directory.path());
    assert_eq!(
        current::read(&observed)
            .await
            .expect("should inspect current"),
        Current::default()
    );
    assert!(
        marker::finished::<PlanOutput>(
            &observed,
            &observed.namespace.plan_output(fixture.request.run.into())
        )
        .await
        .expect("should inspect plan marker")
        .is_none()
    );
    assert_scratch_clean(&fixture);
}

struct PausedGraph {
    graph: FakeGraph,
    pause: AtomicBool,
    entered: Arc<Notify>,
}

impl Graph for PausedGraph {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        if self.pause.swap(false, Ordering::SeqCst) {
            self.entered.notify_one();
            core::future::pending::<()>().await;
        }
        self.graph.create(actor, bodies).await
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.graph.patch(actor, bodies).await
    }
}

#[tokio::test]
async fn workflow_cancel_during_send() {
    let entered = Arc::new(Notify::new());
    let fixture = fixture(PausedGraph {
        graph: FakeGraph::default(),
        pause: AtomicBool::new(true),
        entered: Arc::clone(&entered),
    });
    let mut steps = Steps {
        cancel_inside_send: Some(entered),
        ..Steps::default()
    };
    let report = fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect_err("should cancel the in-flight step");
    assert_eq!(*report.current_context(), RunError::Stopped);
    assert!(format!("{report:?}").contains("backend in-flight cancellation"));
    let observed = context(fixture.directory.path());
    assert_eq!(
        current::read(&observed)
            .await
            .expect("should inspect interrupted current"),
        Current {
            committed: None,
            sending: vec![fixture.request.run]
        }
    );
    assert!(
        marker::finished::<SendOutput>(
            &observed,
            &observed.namespace.send_output(fixture.request.run.into())
        )
        .await
        .expect("should inspect send marker")
        .is_none(),
        "cancellation should not publish delivery completion"
    );
    assert_scratch_clean(&fixture);

    steps.rewind();
    fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect("should recover cancelled sender on fresh scratch");
    assert_eq!(
        steps.executed.iter().map(AsRef::as_ref).collect::<Vec<_>>(),
        ["send"]
    );
    assert_eq!(steps.output::<SendOutput>("send").counts.created, 6);
    assert_eq!(fixture.function.graph.graph.requests().len(), 2);
    assert_eq!(
        current::read(&observed)
            .await
            .expect("should inspect committed current")
            .sending,
        []
    );
    assert_scratch_clean(&fixture);
}

#[tokio::test]
async fn workflow_invalid_definition() {
    let mut fixture = fixture(FakeGraph::default());
    fixture.request.operation = OperationRequest::Apply {
        definition: "connector: [\n".into(),
        namespace: "aviation".into(),
        resend_all: false,
    };
    let mut steps = Steps::default();
    let report = fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect_err("should stop an invalid definition");
    assert_eq!(*report.current_context(), RunError::Stopped);
    let failure = steps.failure.expect("should classify the stage failure");
    assert_eq!(failure.kind, FailureKind::Permanent);
    assert_eq!(failure.code.as_ref(), "invalid_definition");
    assert!(steps.recorded.is_empty(), "should not record failed start");
    assert_eq!(
        fixture.function.graph.requests(),
        [],
        "should send no Graph requests"
    );
    assert_scratch_clean(&fixture);
}

#[tokio::test]
async fn workflow_setup_before_steps() {
    let mut fixture = fixture(FakeGraph::default());
    let mut other_web = fixture.request.clone();
    other_web.web = type_system::principal::actor_group::WebId::new(uuid::Uuid::new_v4());
    let mut steps = Steps::default();
    let report = fixture
        .function
        .run(&mut steps, other_web)
        .await
        .expect_err("should reject another web before steps");
    assert!(
        matches!(report.current_context(), RunError::Failed { code } if code.as_ref() == "web_mismatch")
    );
    assert_eq!(
        steps.requested,
        [],
        "should request no steps for another web"
    );
    assert_scratch_clean(&fixture);
    fs::remove_dir(&fixture.function.scratch).expect("should make scratch unavailable");
    fixture.function.scratch = fixture.function.scratch.join("missing");
    let report = fixture
        .function
        .run(&mut steps, fixture.request.clone())
        .await
        .expect_err("should report unavailable scratch before steps");
    assert!(
        matches!(report.current_context(), RunError::Failed { code } if code.as_ref() == "scratch_unavailable")
    );
    assert_eq!(
        steps.requested,
        [],
        "should request no steps without scratch"
    );
    assert_eq!(
        fixture.function.graph.requests(),
        [],
        "should send no Graph requests"
    );
}
