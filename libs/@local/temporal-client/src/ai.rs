use std::collections::HashMap;

use error_stack::{Report, ResultExt};
use graph_types::{
    account::AccountId,
    knowledge::entity::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use serde::Serialize;
use temporal_io_client::{WorkflowClientTrait, WorkflowOptions};
use temporal_io_sdk_core_protos::{
    temporal::api::common::v1::Payload, ENCODING_PAYLOAD_KEY, JSON_ENCODING_VAL,
};
use uuid::Uuid;

use crate::{TemporalClient, WorkflowError};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticationContext {
    actor_id: AccountId,
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
        actor_id: AccountId,
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
        actor_id: AccountId,
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
        actor_id: AccountId,
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
        actor_id: AccountId,
        entities: &[Entity],
    ) -> Result<String, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateEntityEmbeddingsParams<'a> {
            authentication: AuthenticationContext,
            entities: &'a [Entity],
        }

        self.start_ai_workflow(
            "updateEntityEmbeddings",
            &UpdateEntityEmbeddingsParams {
                authentication: AuthenticationContext { actor_id },
                entities,
            },
        )
        .await
    }
}
