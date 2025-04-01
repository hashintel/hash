use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use serde::Serialize;
use temporal_client::{WorkflowClientTrait as _, WorkflowOptions};
use temporal_sdk_core_protos::{
    ENCODING_PAYLOAD_KEY, JSON_ENCODING_VAL, temporal::api::common::v1::Payload,
};
use type_system::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    provenance::ActorEntityUuid,
};
use uuid::Uuid;

use crate::{TemporalClient, WorkflowError};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticationContext {
    actor_id: ActorEntityUuid,
}

impl TemporalClient {
    async fn start_ai_workflow(
        &self,
        workflow: &'static str,
        payload: &(impl Serialize + Sync),
    ) -> Result<String, Report<WorkflowError>> {
        Ok(self
            .client
            .start_workflow(
                vec![Payload {
                    metadata: HashMap::from([(
                        ENCODING_PAYLOAD_KEY.to_owned(),
                        JSON_ENCODING_VAL.as_bytes().to_vec(),
                    )]),
                    data: serde_json::to_vec(payload).change_context(WorkflowError(workflow))?,
                }],
                "ai".to_owned(),
                Uuid::new_v4().to_string(),
                workflow.to_owned(),
                None,
                WorkflowOptions::default(),
            )
            .await
            .change_context(WorkflowError(workflow))?
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

    /// Starts a workflow to update the embeddings for the provided entity.
    ///
    /// Returns the run ID of the workflow.
    ///
    /// # Errors
    ///
    /// Returns an error if the workflow fails to start.
    pub async fn start_update_entity_embeddings_workflow(
        &self,
        actor_id: ActorEntityUuid,
        entities: &[Entity],
    ) -> Result<Vec<String>, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateEntityEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            entities: &'a [Entity],
        }

        // There is an upper limit on how many bytes can be sent in a single workflow invocation so
        // we need to split the entities into chunks.
        const CHUNK_SIZE: usize = 100;

        #[expect(
            clippy::integer_division,
            clippy::integer_division_remainder_used,
            reason = "The devision is only used to calculate vector capacity and is rounded up."
        )]
        let mut workflow_ids = Vec::with_capacity(entities.len() / CHUNK_SIZE + 1);
        for partial_entities in entities.chunks(CHUNK_SIZE) {
            workflow_ids.push(
                self.start_ai_workflow(
                    "updateEntityEmbeddings",
                    &UpdateEntityEmbeddingsParams {
                        authentication: AuthenticationContext { actor_id },
                        entities: partial_entities,
                    },
                )
                .await?,
            );
        }

        Ok(workflow_ids)
    }
}
