//! Roundtrip test against a running Temporal server.
//!
//! Requires a Temporal server with a `HASH` namespace, as provided by the
//! `infra/compose` external services used for integration testing. The server
//! address is read from `HASH_TEMPORAL_SERVER_HOST` / `HASH_TEMPORAL_SERVER_PORT`
//! and falls back to `http://localhost:7233`.

use core::time::Duration;

use hash_temporal_client::{TemporalClient, TemporalClientConfig, WorkflowRun};
use serde_json::json;
use temporalio_client::{
    Client, ClientOptions, Connection, ConnectionOptions, grpc::WorkflowService,
    tonic::IntoRequest as _,
};
use temporalio_common::protos::temporal::api::{
    command::v1::{Command, CompleteWorkflowExecutionCommandAttributes, command},
    enums::v1::{CommandType, TaskQueueKind},
    history::v1::history_event,
    taskqueue::v1::TaskQueue,
    workflowservice::v1::{PollWorkflowTaskQueueRequest, RespondWorkflowTaskCompletedRequest},
};
use tokio::time::{Instant, sleep, timeout};
use url::Url;
use uuid::Uuid;

const NAMESPACE: &str = "HASH";
const WORKER_IDENTITY: &str = "hash-temporal-client-integration-test";

/// Total time budget for the initial connect + workflow start.
///
/// In CI `docker compose up -d` returns before the one-shot `temporal-setup`
/// container has created the `HASH` namespace, and the connection retries
/// inside `Connection::connect` cap out after roughly ten seconds, so a
/// single attempt can race the server (and its namespace) coming up.
const STARTUP_DEADLINE: Duration = Duration::from_secs(90);

/// Pause between startup attempts.
const STARTUP_RETRY_INTERVAL: Duration = Duration::from_secs(2);

/// Server-side execution timeout for the test workflow, so failed test runs
/// cannot leave workflow executions running forever on a local dev server.
const WORKFLOW_EXECUTION_TIMEOUT: Duration = Duration::from_mins(5);

fn server_url() -> Url {
    let host = std::env::var("HASH_TEMPORAL_SERVER_HOST")
        .unwrap_or_else(|_| "http://localhost".to_owned());
    let mut url = Url::parse(&host).expect("could not parse Temporal server URL");

    // A port already present in `HASH_TEMPORAL_SERVER_HOST` wins; only fall
    // back to `HASH_TEMPORAL_SERVER_PORT` (default 7233) when the host does
    // not carry one.
    if url.port().is_none() {
        let port = std::env::var("HASH_TEMPORAL_SERVER_PORT").map_or(7233, |port| {
            port.parse::<u16>().expect("could not parse port")
        });
        url.set_port(Some(port))
            .expect("could not set Temporal server port");
    }

    url
}

/// Completes the next workflow task on the given task queue by echoing the
/// workflow input back as the workflow result.
///
/// This stands in for a real worker so the roundtrip test does not depend on
/// any of the TypeScript workers running.
async fn echo_next_workflow_task(task_queue: &str) {
    let connection = Connection::connect(
        ConnectionOptions::new(server_url())
            .client_name("HASH Temporal test worker")
            .client_version(env!("CARGO_PKG_VERSION"))
            .build(),
    )
    .await
    .expect("test worker should be able to connect to the Temporal server");
    let mut worker = Client::new(connection, ClientOptions::new(NAMESPACE).build())
        .expect("should be able to create the test worker client");

    // A long poll may legally return an empty response (no task became
    // available before the server's poll timeout expired), so re-poll until
    // a real task arrives or the timeout wrapped around this function trips.
    let task = loop {
        let task = WorkflowService::poll_workflow_task_queue(
            &mut worker,
            PollWorkflowTaskQueueRequest {
                namespace: NAMESPACE.to_owned(),
                task_queue: Some(TaskQueue {
                    name: task_queue.to_owned(),
                    kind: TaskQueueKind::Normal as i32,
                    normal_name: String::new(),
                }),
                identity: WORKER_IDENTITY.to_owned(),
                ..Default::default()
            }
            .into_request(),
        )
        .await
        .expect("should be able to poll the task queue")
        .into_inner();

        if !task.task_token.is_empty() {
            break task;
        }
    };

    let input = task
        .history
        .expect("workflow task should include the workflow history")
        .events
        .into_iter()
        .find_map(|event| match event.attributes {
            Some(history_event::Attributes::WorkflowExecutionStartedEventAttributes(
                attributes,
            )) => attributes.input,
            _ => None,
        })
        .expect("workflow history should contain the workflow input");

    WorkflowService::respond_workflow_task_completed(
        &mut worker,
        RespondWorkflowTaskCompletedRequest {
            task_token: task.task_token,
            commands: vec![Command {
                command_type: CommandType::CompleteWorkflowExecution as i32,
                attributes: Some(
                    command::Attributes::CompleteWorkflowExecutionCommandAttributes(
                        CompleteWorkflowExecutionCommandAttributes {
                            result: Some(input),
                        },
                    ),
                ),
                ..Default::default()
            }],
            identity: WORKER_IDENTITY.to_owned(),
            namespace: NAMESPACE.to_owned(),
            ..Default::default()
        }
        .into_request(),
    )
    .await
    .expect("should be able to complete the workflow task");
}

/// Connects to the Temporal server and starts the `echo` workflow, retrying
/// until [`STARTUP_DEADLINE`] so the test does not race the server — and the
/// `temporal-setup` one-shot that creates the `HASH` namespace — coming up.
async fn connect_and_start_workflow(
    task_queue: &str,
    payload: &serde_json::Value,
) -> (TemporalClient, WorkflowRun) {
    let deadline = Instant::now() + STARTUP_DEADLINE;
    loop {
        let error = match TemporalClientConfig::new(server_url()).await {
            Ok(client) => match client
                .start_workflow(
                    task_queue,
                    "echo",
                    payload,
                    Some(WORKFLOW_EXECUTION_TIMEOUT),
                )
                .await
            {
                Ok(run) => return (client, run),
                Err(error) => format!("{error:?}"),
            },
            Err(error) => format!("{error:?}"),
        };
        assert!(
            Instant::now() + STARTUP_RETRY_INTERVAL < deadline,
            "could not connect to the Temporal server and start the echo workflow within \
             {STARTUP_DEADLINE:?}: {error}"
        );
        sleep(STARTUP_RETRY_INTERVAL).await;
    }
}

/// Starts an `echo` workflow, completes it with a stand-in worker, and awaits
/// its result, asserting that the payload made it through the entire
/// client → server → worker → server → client roundtrip unchanged.
#[tokio::test]
async fn echo() {
    // A fresh task queue per test run so runs cannot interfere with each
    // other or with any real workers.
    let task_queue = format!("hash-temporal-client-test-{}", Uuid::new_v4());
    let payload = json!({ "message": "hello from the HASH graph" });

    let (client, run) = connect_and_start_workflow(&task_queue, &payload).await;

    timeout(
        Duration::from_secs(30),
        echo_next_workflow_task(&task_queue),
    )
    .await
    .expect("the workflow task should be picked up before timing out");

    let echoed = timeout(
        Duration::from_secs(30),
        client.wait_for_workflow_result::<serde_json::Value>(&run.workflow_id, &run.run_id),
    )
    .await
    .expect("the workflow result should arrive before timing out")
    .expect("should be able to await the workflow result");

    assert_eq!(echoed, payload);
}
