use std::collections::HashMap;

use error_stack::{Report, ResultExt};
use graph_types::{account::AccountId, knowledge::entity::Entity};
use serde::Serialize;
use temporal_io_client::{WorkflowClientTrait, WorkflowOptions};
use temporal_io_sdk_core_protos::{
    temporal::api::common::v1::Payload, ENCODING_PAYLOAD_KEY, JSON_ENCODING_VAL,
};
use uuid::Uuid;

use crate::{TemporalClient, WorkflowError};

impl TemporalClient {
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
        entity: Entity,
    ) -> Result<String, Report<WorkflowError>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AuthenticationContext {
            actor_id: AccountId,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct UpdateEntityEmbeddingsParams {
            authentication: AuthenticationContext,
            entity: Entity,
        }

        Ok(self
            .client
            .start_workflow(
                vec![Payload {
                    metadata: HashMap::from([(
                        ENCODING_PAYLOAD_KEY.to_owned(),
                        JSON_ENCODING_VAL.as_bytes().to_vec(),
                    )]),
                    data: serde_json::to_vec(&UpdateEntityEmbeddingsParams {
                        authentication: AuthenticationContext { actor_id },
                        entity,
                    })
                    .change_context(WorkflowError("updateEntityEmbeddings"))?,
                }],
                "ai".to_owned(),
                Uuid::new_v4().to_string(),
                "updateEntityEmbeddings".to_owned(),
                None,
                WorkflowOptions::default(),
            )
            .await
            .change_context(WorkflowError("updateEntityEmbeddings"))?
            .run_id)
    }
}
