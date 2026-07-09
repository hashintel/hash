use core::time::Duration;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use opentelemetry::{global, propagation::Injector};
use serde::{Serialize, de::DeserializeOwned};
use temporalio_client::{
    NamespacedClient, UntypedWorkflowHandle, WorkflowExecutionInfo, WorkflowGetResultOptions,
    grpc::WorkflowService, tonic::IntoRequest as _,
};
use temporalio_common::protos::{
    ENCODING_PAYLOAD_KEY, JSON_ENCODING_VAL,
    coresdk::IntoPayloadsExt as _,
    temporal::api::{
        common::v1::{Header, Payload, WorkflowType},
        enums::v1::TaskQueueKind,
        taskqueue::v1::TaskQueue,
        workflowservice::v1::StartWorkflowExecutionRequest,
    },
};
use tracing::{Span, instrument};
use tracing_opentelemetry::OpenTelemetrySpanExt as _;
use uuid::Uuid;

use crate::{TemporalClient, WorkflowError, WorkflowResultError};

/// Header key used by `@temporalio/interceptors-opentelemetry-v2` to carry the
/// trace-context payload across workflow boundaries. Must stay in sync with
/// `TRACE_HEADER` in that package's `instrumentation.ts`; if it drifts,
/// workflows started from Rust will ship correct headers that the TypeScript
/// inbound interceptor silently ignores, and every resulting span renders
/// parent-less in Tempo.
const TRACE_HEADER: &str = "_tracer-data";

/// Adapter so `opentelemetry`'s text-map propagator can write into a plain
/// `HashMap` carrier.
struct CarrierWriter<'a>(&'a mut HashMap<String, String>);

impl Injector for CarrierWriter<'_> {
    fn set(&mut self, key: &str, value: String) {
        self.0.insert(key.to_owned(), value);
    }
}

/// Build a Temporal `Header` containing the active OTEL trace context as
/// a JSON-encoded text-map under the `_tracer-data` field.
///
/// Returns `None` if no propagator wrote anything into the carrier (e.g.
/// no active span, or no propagator registered) — the caller should leave
/// the request `header` field empty in that case rather than send an
/// empty payload.
fn build_otel_header() -> Option<Header> {
    let context = Span::current().context();
    let mut carrier = HashMap::<String, String>::new();
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(&context, &mut CarrierWriter(&mut carrier));
    });
    if carrier.is_empty() {
        // Surface this once per process: an empty carrier means either no
        // active tracing span (caller missing `#[instrument]`) or no
        // global propagator registered (telemetry bootstrap missing
        // `set_text_map_propagator`). Either way the workflow will start
        // with no parent context and the worker-side span renders detached
        // from the caller's trace.
        static WARNED: std::sync::OnceLock<()> = std::sync::OnceLock::new();
        WARNED.get_or_init(|| {
            tracing::warn!(
                "OpenTelemetry text-map propagator wrote no headers when starting workflow; \
                 workflow spans will be parent-less. Verify the global propagator is installed \
                 and the calling fn carries an active tracing span."
            );
        });
        return None;
    }

    let payload = Payload {
        metadata: HashMap::from([(
            ENCODING_PAYLOAD_KEY.to_owned(),
            JSON_ENCODING_VAL.as_bytes().to_vec(),
        )]),
        // `HashMap<String, String>` cannot fail to serialise — fail loud
        // rather than silently dropping the trace context (which would
        // produce a parent-less workflow span on every start).
        data: serde_json::to_vec(&carrier).expect("HashMap<String, String> serialises"),
        ..Default::default()
    };

    Some(Header {
        fields: HashMap::from([(TRACE_HEADER.to_owned(), payload)]),
    })
}

/// Identifiers of a workflow execution started through [`TemporalClient`].
#[derive(Debug, Clone)]
pub struct WorkflowRun {
    /// The workflow ID the execution was started under.
    pub workflow_id: String,
    /// The run ID assigned to the execution by the Temporal server.
    pub run_id: String,
}

impl TemporalClient {
    /// Starts a workflow of the given type on the given task queue, injecting
    /// the active OTEL trace context into the workflow start headers so the
    /// worker-side interceptors can parent the workflow + activity spans off
    /// the caller's trace.
    ///
    /// The payload is JSON-serialized into a single workflow argument, which
    /// matches how the TypeScript workers deserialize their inputs.
    ///
    /// If `execution_timeout` is set it is applied as the server-side
    /// `workflow_execution_timeout`, after which the server terminates the
    /// execution. Production callers pass `None` (no server-side limit);
    /// tests set it so abandoned executions cannot linger forever.
    ///
    /// Goes via the low-level `WorkflowService::start_workflow_execution`
    /// because the high-level `Client::start_workflow` does not expose the
    /// proto `header` field. The span is annotated with `otel.kind = "producer"` for the
    /// asynchronous fire-and-forget shape (the value is case-sensitive;
    /// `tracing-opentelemetry` falls back to `Internal` on typos).
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start.
    #[instrument(
        skip(self, payload, execution_timeout),
        fields(workflow_type = workflow, task_queue = task_queue, otel.kind = "producer"),
    )]
    pub async fn start_workflow(
        &self,
        task_queue: &str,
        workflow: &'static str,
        payload: &(impl Serialize + Sync),
        execution_timeout: Option<Duration>,
    ) -> Result<WorkflowRun, Report<WorkflowError>> {
        let mut client = self.client.clone();
        // `identity` is read back from the client's connection options, where
        // `TemporalClientConfig::new` sets it to `pid@hostname` (matching the
        // Temporal SDK convention), so workflow starts are attributed to this
        // client in the Temporal server / UI.
        let identity = client.identity();
        let workflow_id = Uuid::new_v4().to_string();
        let request = StartWorkflowExecutionRequest {
            namespace: <_ as NamespacedClient>::namespace(&client),
            input: vec![Payload {
                metadata: HashMap::from([(
                    ENCODING_PAYLOAD_KEY.to_owned(),
                    JSON_ENCODING_VAL.as_bytes().to_vec(),
                )]),
                data: serde_json::to_vec(payload).change_context(WorkflowError(workflow))?,
                ..Default::default()
            }]
            .into_payloads(),
            workflow_id: workflow_id.clone(),
            workflow_type: Some(WorkflowType {
                name: workflow.to_owned(),
            }),
            task_queue: Some(TaskQueue {
                name: task_queue.to_owned(),
                kind: TaskQueueKind::Unspecified as i32,
                normal_name: String::new(),
            }),
            identity,
            request_id: Uuid::new_v4().to_string(),
            // Same conversion the high-level `Client::start_workflow` uses:
            // a `Duration` too large for the proto representation is treated
            // as "no timeout" rather than failing the start.
            workflow_execution_timeout: execution_timeout
                .and_then(|timeout| timeout.try_into().ok()),
            header: build_otel_header(),
            ..Default::default()
        };

        let response =
            WorkflowService::start_workflow_execution(&mut client, request.into_request())
                .await
                .change_context(WorkflowError(workflow))?
                .into_inner();

        Ok(WorkflowRun {
            workflow_id,
            run_id: response.run_id,
        })
    }

    /// Waits until the given workflow execution reaches a terminal state and
    /// returns its deserialized result.
    ///
    /// The call itself has no client-side deadline — it long-polls the server
    /// until the workflow reaches a terminal state — so callers that need a
    /// bound should wrap it in `tokio::time::timeout`.
    ///
    /// The result payload is expected to be JSON-encoded, which is how both
    /// this client and the TypeScript workers encode payloads. A workflow
    /// completing without a result payload is treated as JSON `null`, so
    /// waiting for a void workflow can be expressed as
    /// `wait_for_workflow_result::<()>`.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow does not complete successfully (it
    /// fails, times out, or is cancelled or terminated), if the result cannot
    /// be fetched from the server, or if the result payload cannot be
    /// deserialized into `T`.
    pub async fn wait_for_workflow_result<T: DeserializeOwned>(
        &self,
        workflow_id: &str,
        run_id: &str,
    ) -> Result<T, Report<WorkflowResultError>> {
        let handle = UntypedWorkflowHandle::new(
            self.client.clone(),
            WorkflowExecutionInfo {
                namespace: <_ as NamespacedClient>::namespace(&self.client),
                workflow_id: workflow_id.to_owned(),
                run_id: Some(run_id.to_owned()),
                first_execution_run_id: None,
            },
        );

        let result = handle
            .get_result(WorkflowGetResultOptions::default())
            .await
            .change_context_lazy(|| WorkflowResultError {
                workflow_id: workflow_id.to_owned(),
                run_id: run_id.to_owned(),
            })?;

        let payload = result.payloads.into_iter().next().unwrap_or_default();
        serde_json::from_slice(if payload.data.is_empty() {
            b"null"
        } else {
            payload.data.as_slice()
        })
        .change_context_lazy(|| WorkflowResultError {
            workflow_id: workflow_id.to_owned(),
            run_id: run_id.to_owned(),
        })
    }
}
