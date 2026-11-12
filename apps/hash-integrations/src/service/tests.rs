use core::future::{Future, ready};
use std::{collections::HashMap, sync::Mutex};

use error_stack::Report;
use hash_integrations_orchestration::{
    BackendError, RunId, RunPhase, RunStart, RunStatus, Runs, StartError,
};
use serde_json::{Value, json};
use similar_asserts::assert_eq;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use super::{
    IntegrationService, Invocation, Request, ServiceError, Submission,
    start::{FUNCTION_VERSION, RETRY_POLICY},
};

/// Records starts and cancels in memory, following the rules of [`Runs`]: a repeated start with
/// the same [`RunStart`] attaches, a different one is refused, and one run is active per
/// admission key until it is cancelled.
#[derive(Default)]
struct FakeRuns {
    runs: Mutex<HashMap<RunId, (RunStart, bool)>>,
}

impl FakeRuns {
    fn started(&self) -> HashMap<RunId, RunStart> {
        self.runs
            .lock()
            .expect("should lock the runs")
            .iter()
            .map(|(run, (start, _))| (run.clone(), start.clone()))
            .collect()
    }

    fn record_start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let mut runs = self.runs.lock().expect("should lock the runs");

        if let Some((recorded, _)) = runs.get(&run) {
            return if *recorded == start {
                Ok(())
            } else {
                Err(Report::new(StartError::StartMismatch))
            };
        }
        if let Some((active, _)) = runs
            .iter()
            .find(|(_, (recorded, cancelled))| recorded.admission == start.admission && !cancelled)
        {
            return Err(Report::new(StartError::AlreadyActive {
                active: active.clone(),
            }));
        }

        runs.insert(run, (start, false));
        drop(runs);
        Ok(())
    }
}

impl Runs for FakeRuns {
    fn start(
        &self,
        run: RunId,
        start: RunStart,
    ) -> impl Future<Output = Result<(), Report<StartError>>> + Send {
        ready(self.record_start(run, start))
    }

    fn status(
        &self,
        run: &RunId,
    ) -> impl Future<Output = Result<Option<RunStatus>, Report<BackendError>>> + Send {
        let cancelled = self
            .runs
            .lock()
            .expect("should lock the runs")
            .get(run)
            .map(|(_, cancelled)| *cancelled);

        ready(Ok(cancelled.map(|cancelled| RunStatus {
            phase: if cancelled {
                RunPhase::Cancelled
            } else {
                RunPhase::Pending
            },
            steps_recorded: 0,
        })))
    }

    fn cancel(&self, run: &RunId) -> impl Future<Output = Result<(), Report<BackendError>>> + Send {
        if let Some((_, cancelled)) = self.runs.lock().expect("should lock the runs").get_mut(run) {
            *cancelled = true;
        }

        ready(Ok(()))
    }
}

const DEFINITION: &str = "connector: demo\n";

/// A version 4 UUID ending in `n`. Web and actor IDs refuse a UUID without a version or the RFC
/// 4122 variant when a run input is decoded.
const fn uuid(n: u128) -> Uuid {
    Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0000 | n)
}

fn web() -> WebId {
    WebId::new(uuid(1))
}

fn request(id: u128) -> Request {
    Request {
        web: web(),
        actor: ActorEntityUuid::new(uuid(2)),
        id: uuid(id),
    }
}

fn submission(definition: &str) -> Submission {
    Submission {
        definition: definition.into(),
        invocation: Invocation { links_only: false },
    }
}

fn service() -> IntegrationService<FakeRuns> {
    IntegrationService::new(FakeRuns::default(), web())
}

/// The input is the stored format a worker decodes, so its JSON is pinned field by field.
#[tokio::test]
async fn submit_records_run_start() {
    let service = service();
    let submission = Submission {
        invocation: Invocation { links_only: true },
        ..submission(DEFINITION)
    };

    let run = service
        .submit(&request(10), submission)
        .await
        .expect("should start the run");

    let start = &service.runs.started()[&run];
    assert_eq!(
        start.admission.as_ref(),
        "00000000-0000-4000-8000-000000000001/demo"
    );
    assert_eq!(
        (start.version, start.policy),
        (FUNCTION_VERSION, RETRY_POLICY)
    );
    assert_eq!(
        start
            .input
            .decode::<Value>()
            .expect("should decode the input as JSON"),
        json!({
            "web": "00000000-0000-4000-8000-000000000001",
            "connector": "demo",
            "owner": "00000000-0000-4000-8000-000000000002",
            "definition": DEFINITION,
            "invocation": { "links_only": true },
        })
    );
}

#[tokio::test]
async fn submit_repeated_request() {
    let service = service();

    let first = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should start the run");
    let second = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should attach to the run");

    assert_eq!(first, second);
    assert_eq!(service.runs.started().len(), 1, "should start one run");
}

#[tokio::test]
async fn submit_reused_request_id() {
    let service = service();
    service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should start the run");

    let report = service
        .submit(&request(10), submission("connector: demo # changed\n"))
        .await
        .expect_err("should refuse another submission under the same request ID");

    assert_eq!(*report.current_context(), ServiceError::RequestMismatch);
}

/// One run is active per connector: a second request for it is refused, while a request for
/// another connector of the same web starts.
#[tokio::test]
async fn submit_active_connector() {
    let service = service();
    let active = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should start the run");

    let report = service
        .submit(&request(11), submission(DEFINITION))
        .await
        .expect_err("should refuse a second run of the connector");
    service
        .submit(&request(12), submission("connector: other\n"))
        .await
        .expect("should start a run of another connector");

    assert_eq!(
        *report.current_context(),
        ServiceError::AlreadyActive { active }
    );
}

#[tokio::test]
async fn submit_invalid_definition() {
    let service = service();

    let report = service
        .submit(&request(10), submission("connector: \"demo\n"))
        .await
        .expect_err("should refuse a definition that is not YAML");

    assert_eq!(*report.current_context(), ServiceError::InvalidDefinition);
    assert!(service.runs.started().is_empty(), "should start no run");
}

/// Every operation refuses a request for another web and leaves the node's runs alone.
#[tokio::test]
async fn requests_other_web() {
    let service = service();
    let run = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should start the run");
    let foreign = Request {
        web: WebId::new(uuid(3)),
        ..request(11)
    };

    let submit = service
        .submit(&foreign, submission("connector: other\n"))
        .await
        .expect_err("should refuse to submit");
    let status = service
        .status(foreign.web, &run)
        .await
        .expect_err("should refuse to read the status");
    let cancel = service
        .cancel(foreign.web, &run)
        .await
        .expect_err("should refuse to cancel");

    assert_eq!(
        [submit, status, cancel].map(|report| report.current_context().clone()),
        [
            ServiceError::WebMismatch,
            ServiceError::WebMismatch,
            ServiceError::WebMismatch,
        ]
    );
    assert_eq!(service.runs.started().len(), 1, "should start no run");
    assert_eq!(
        service
            .status(web(), &run)
            .await
            .expect("should read the status")
            .map(|status| status.phase),
        Some(RunPhase::Pending),
        "should leave the run running"
    );
}

#[tokio::test]
async fn status_after_cancel() {
    let service = service();
    let run = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("should start the run");

    service
        .cancel(web(), &run)
        .await
        .expect("should cancel the run");
    let status = service
        .status(web(), &run)
        .await
        .expect("should read the status");

    assert_eq!(status.map(|status| status.phase), Some(RunPhase::Cancelled));
}
