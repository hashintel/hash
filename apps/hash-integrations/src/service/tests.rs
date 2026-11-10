use core::future::{Future, ready};
use std::{collections::HashMap, sync::Mutex};

use error_stack::Report;
use hash_integrations_orchestration::{
    BackendError, RunId, RunPhase, RunStart, RunStatus, Runs, StartError,
};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use super::{
    IntegrationService, Invocation, Request, RunInput, ServiceError, Submission,
    start::{FUNCTION_VERSION, RETRY_POLICY},
};

/// Records starts and cancels in memory, following the rules of [`Runs`].
#[derive(Default)]
struct FakeRuns {
    runs: Mutex<HashMap<RunId, (RunStart, bool)>>,
}

impl FakeRuns {
    fn started(&self) -> HashMap<RunId, RunStart> {
        self.runs
            .lock()
            .expect("the lock should not be poisoned")
            .iter()
            .map(|(run, (start, _))| (run.clone(), start.clone()))
            .collect()
    }
}

impl FakeRuns {
    fn record_start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let mut runs = self.runs.lock().expect("the lock should not be poisoned");

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
            .expect("the lock should not be poisoned")
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
        if let Some((_, cancelled)) = self
            .runs
            .lock()
            .expect("the lock should not be poisoned")
            .get_mut(run)
        {
            *cancelled = true;
        }

        ready(Ok(()))
    }
}

const DEFINITION: &str = "connector: demo\n";

/// A version 4 UUID ending in `n`. Web and actor IDs refuse UUIDs without a version.
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

#[tokio::test]
async fn submit_starts_a_run_with_the_input_and_the_admission_key() {
    let service = service();

    let run = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("the run should start");

    let started = service.runs.started();
    let start = started.get(&run).expect("the run should be started");
    assert_eq!(
        start.admission.as_ref(),
        "00000000-0000-4000-8000-000000000001/demo"
    );
    assert_eq!(start.version, FUNCTION_VERSION);
    assert_eq!(start.policy, RETRY_POLICY);
    assert_eq!(
        start
            .input
            .decode::<RunInput>()
            .expect("the input should decode"),
        RunInput {
            web: web(),
            connector: "demo".into(),
            owner: ActorEntityUuid::new(uuid(2)),
            definition: DEFINITION.into(),
            invocation: Invocation { links_only: false },
        }
    );
}

#[tokio::test]
async fn submit_attaches_a_repeated_request_to_its_run() {
    let service = service();

    let first = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("the run should start");
    let second = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("the repeated request should attach");

    assert_eq!(first, second);
    assert_eq!(service.runs.started().len(), 1);
}

#[tokio::test]
async fn submit_rejects_a_request_id_used_with_another_submission() {
    let service = service();

    service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("the run should start");
    let report = service
        .submit(&request(10), submission("connector: demo # changed\n"))
        .await
        .expect_err("another submission under the same request ID should be rejected");

    assert_eq!(*report.current_context(), ServiceError::RequestMismatch);
}

#[tokio::test]
async fn submit_rejects_a_second_run_while_one_is_active() {
    let service = service();

    let active = service
        .submit(&request(10), submission(DEFINITION))
        .await
        .expect("the run should start");
    let report = service
        .submit(&request(11), submission(DEFINITION))
        .await
        .expect_err("a second run of the integration should be rejected");

    assert_eq!(
        *report.current_context(),
        ServiceError::AlreadyActive { active }
    );
}

#[tokio::test]
async fn submit_rejects_another_web_before_starting() {
    let service = service();
    let request = Request {
        web: WebId::new(uuid(3)),
        ..request(10)
    };

    let report = service
        .submit(&request, submission(DEFINITION))
        .await
        .expect_err("another web should be rejected");

    assert_eq!(*report.current_context(), ServiceError::WebMismatch);
    assert!(service.runs.started().is_empty());
}

#[tokio::test]
async fn submit_rejects_an_invalid_definition_before_starting() {
    let service = service();

    let report = service
        .submit(&request(10), submission("connector: \"demo\n"))
        .await
        .expect_err("the definition should not parse");

    assert_eq!(*report.current_context(), ServiceError::InvalidDefinition);
    assert!(service.runs.started().is_empty());
}
