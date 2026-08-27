use std::collections::HashMap;

use error_stack::Report;
use serde::Serialize;
use type_system::{
    knowledge::entity::EntityId,
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata, id::BaseUrl,
    },
    principal::actor::ActorEntityUuid,
};

use crate::{TemporalClient, WorkflowError, WorkflowStart};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticationContext {
    actor_id: ActorEntityUuid,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityEmbeddingsParams<'a> {
    authentication: AuthenticationContext,
    entity_ids: &'a [EntityId],
    embedding_exclusions: &'a HashMap<BaseUrl, Vec<BaseUrl>>,
}

impl TemporalClient {
    /// Start a workflow on the `ai` task queue.
    ///
    /// Returns the run ID of the workflow.
    async fn start_ai_workflow(
        &self,
        workflow: &'static str,
        payload: &(impl Serialize + Sync),
    ) -> Result<String, Report<WorkflowError>> {
        Ok(self
            .start_workflow("ai", workflow, payload, None)
            .await?
            .run_id)
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

    /// Starts a caller-identified `updateEntityEmbeddings` workflow for one entity.
    ///
    /// The supplied workflow ID is the deduplication key. While an execution with this ID runs,
    /// the server refuses a second start and the call returns
    /// [`WorkflowStart::AlreadyStarted`], and the refusal counts as a successful ensure.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start for any reason other than an execution
    /// already running under the supplied ID.
    pub async fn ensure_update_entity_embeddings_workflow(
        &self,
        workflow_id: String,
        actor_id: ActorEntityUuid,
        entity_id: EntityId,
        embedding_exclusions: &HashMap<BaseUrl, Vec<BaseUrl>>,
    ) -> Result<WorkflowStart, Report<WorkflowError>> {
        self.start_workflow_with_id(
            workflow_id,
            "ai",
            "updateEntityEmbeddings",
            &UpdateEntityEmbeddingsParams {
                authentication: AuthenticationContext { actor_id },
                entity_ids: &[entity_id],
                embedding_exclusions,
            },
            None,
        )
        .await
    }
}
