use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use opentelemetry::{global, propagation::Injector};
use serde::Serialize;
use temporalio_client::{NamespacedClient, WorkflowService, tonic::IntoRequest as _};
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
use type_system::{
    knowledge::entity::EntityId,
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata, id::BaseUrl,
    },
    principal::actor::ActorEntityUuid,
};
use uuid::Uuid;

use crate::{TemporalClient, WorkflowError};

/// Header key used by `@temporalio/interceptors-opentelemetry` to carry the
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticationContext {
    actor_id: ActorEntityUuid,
}

impl TemporalClient {
    /// Start a workflow on the `ai` task queue, injecting the active
    /// OTEL trace context into the workflow start headers so the
    /// worker-side interceptors can parent the workflow + activity
    /// spans off the caller's trace.
    ///
    /// Goes via the low-level `WorkflowService::start_workflow_execution`
    /// because `WorkflowClientTrait::start_workflow` does not expose the
    /// proto `header` field. The span is annotated with `otel.kind =
    /// "producer"` for the asynchronous fire-and-forget shape (the value
    /// is case-sensitive; `tracing-opentelemetry` falls back to
    /// `Internal` on typos).
    #[instrument(
        skip(self, payload),
        fields(workflow_type = workflow, otel.kind = "producer"),
    )]
    async fn start_ai_workflow(
        &self,
        workflow: &'static str,
        payload: &(impl Serialize + Sync),
    ) -> Result<String, Report<WorkflowError>> {
        let mut client = self.client.clone();
        // `WorkflowClientTrait::start_workflow` auto-populates `identity` from
        // `ClientOptions` (typically `pid@hostname`). The low-level
        // `StartWorkflowExecutionRequest` defaults it to an empty string,
        // which makes Temporal Server / UI unable to attribute starts to a
        // client. Read it back from the configured client.
        let identity = client.get_client().identity();
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
            workflow_id: Uuid::new_v4().to_string(),
            workflow_type: Some(WorkflowType {
                name: workflow.to_owned(),
            }),
            task_queue: Some(TaskQueue {
                name: "ai".to_owned(),
                kind: TaskQueueKind::Unspecified as i32,
                normal_name: String::new(),
            }),
            identity,
            request_id: Uuid::new_v4().to_string(),
            header: build_otel_header(),
            ..Default::default()
        };

        let response =
            WorkflowService::start_workflow_execution(&mut client, request.into_request())
                .await
                .change_context(WorkflowError(workflow))?
                .into_inner();

        Ok(response.run_id)
    }

    /// Starts a workflow to update the embeddings for the provided data type.
    ///
    /// Returns the run ID of the workflow.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start.
    pub async fn start_update_data_type_embeddings_workflow(
        &self,
        actor_id: ActorEntityUuid,
        data_types: &[DataTypeWithMetadata],
    ) -> Result<String, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateDataTypeEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            data_types: &'a [DataTypeWithMetadata],
        }

        self.start_ai_workflow(
            "updateDataTypeEmbeddings",
            &UpdateDataTypeEmbeddingsParams {
                authentication: AuthenticationContext { actor_id },
                data_types,
            },
        )
        .await
    }

    /// Starts a workflow to update the embeddings for the provided property type.
    ///
    /// Returns the run ID of the workflow.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start.
    pub async fn start_update_property_type_embeddings_workflow(
        &self,
        actor_id: ActorEntityUuid,
        property_types: &[PropertyTypeWithMetadata],
    ) -> Result<String, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdatePropertyTypeEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            property_types: &'a [PropertyTypeWithMetadata],
        }

        self.start_ai_workflow(
            "updatePropertyTypeEmbeddings",
            &UpdatePropertyTypeEmbeddingsParams {
                authentication: AuthenticationContext { actor_id },
                property_types,
            },
        )
        .await
    }

    /// Starts a workflow to update the embeddings for the provided entity type.
    ///
    /// Returns the run ID of the workflow.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start.
    pub async fn start_update_entity_type_embeddings_workflow(
        &self,
        actor_id: ActorEntityUuid,
        entity_types: &[EntityTypeWithMetadata],
    ) -> Result<String, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateEntityTypeEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            entity_types: &'a [EntityTypeWithMetadata],
        }

        self.start_ai_workflow(
            "updateEntityTypeEmbeddings",
            &UpdateEntityTypeEmbeddingsParams {
                authentication: AuthenticationContext { actor_id },
                entity_types,
            },
        )
        .await
    }

    /// Starts workflows to update the embeddings for the provided entities.
    ///
    /// Returns the run IDs of the workflows.
    ///
    /// # Errors
    ///
    /// Returns an error if any workflow fails to start.
    pub async fn start_update_entity_embeddings_workflow(
        &self,
        actor_id: ActorEntityUuid,
        entity_ids: &[EntityId],
        embedding_exclusions: &HashMap<BaseUrl, Vec<BaseUrl>>,
    ) -> Result<Vec<String>, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateEntityEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            entity_ids: &'a [EntityId],
            embedding_exclusions: &'a HashMap<BaseUrl, Vec<BaseUrl>>,
        }

        // EntityIDs are small (~100 bytes each), but we still chunk to avoid hitting
        // Temporal's payload size limits when dealing with very large batches.
        const CHUNK_SIZE: usize = 10_000;

        #[expect(
            clippy::integer_division,
            clippy::integer_division_remainder_used,
            reason = "The division is only used to calculate vector capacity and is rounded up."
        )]
        let mut workflow_ids = Vec::with_capacity(entity_ids.len() / CHUNK_SIZE + 1);
        for chunk in entity_ids.chunks(CHUNK_SIZE) {
            workflow_ids.push(
                self.start_ai_workflow(
                    "updateEntityEmbeddings",
                    &UpdateEntityEmbeddingsParams {
                        authentication: AuthenticationContext { actor_id },
                        entity_ids: chunk,
                        embedding_exclusions,
                    },
                )
                .await?,
            );
        }

        Ok(workflow_ids)
    }
}
