//! Roundtrip test against a running Temporal server.
//!
//! Requires a Temporal server with a `HASH` namespace, as provided by the
//! `infra/compose` external services used for integration testing. The server
//! address is read from `HASH_TEMPORAL_SERVER_HOST` / `HASH_TEMPORAL_SERVER_PORT`
//! and falls back to `http://localhost:7233`.

use core::time::Duration;

use hash_temporal_client::TemporalClientConfig;
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
use tokio::time::timeout;
use url::Url;
use uuid::Uuid;

const NAMESPACE: &str = "HASH";
const WORKER_IDENTITY: &str = "hash-temporal-client-integration-test";

fn server_url() -> Url {
    let host = std::env::var("HASH_TEMPORAL_SERVER_HOST")
        .unwrap_or_else(|_| "http://localhost".to_owned());
    let port = std::env::var("HASH_TEMPORAL_SERVER_PORT").map_or(7233, |port| {
        port.parse::<u16>().expect("could not parse port")
    });

    Url::parse(&format!("{host}:{port}")).expect("could not parse Temporal server URL")
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
    assert!(
        !task.task_token.is_empty(),
        "did not receive a workflow task"
    );

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

/// Starts an `echo` workflow, completes it with a stand-in worker, and awaits
/// its result, asserting that the payload made it through the entire
/// client → server → worker → server → client roundtrip unchanged.
#[tokio::test]
async fn echo() {
    let client = TemporalClientConfig::new(server_url())
        .await
        .expect("should be able to connect to the Temporal server");

    // A fresh task queue per test run so runs cannot interfere with each
    // other or with any real workers.
    let task_queue = format!("hash-temporal-client-test-{}", Uuid::new_v4());
    let payload = json!({ "message": "hello from the HASH graph" });

    let run = client
        .start_workflow(&task_queue, "echo", &payload)
        .await
        .expect("should be able to start the echo workflow");

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
