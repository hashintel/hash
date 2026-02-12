use core::error::Error;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PolicyStore as _;
use hash_graph_store::pool::StorePool as _;
use type_system::principal::actor::ActorEntityUuid;

use crate::scenario::runner::Runner;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct with independent flags"
)]
pub struct ResetDbStage {
    pub id: String,
    #[serde(default)]
    pub principals: bool,
    #[serde(default)]
    pub data_types: bool,
    #[serde(default)]
    pub property_types: bool,
    #[serde(default)]
    pub entity_types: bool,
    #[serde(default)]
    pub entities: bool,
}

#[derive(Debug, derive_more::Display)]
pub enum ResetDbError {
    #[display("Failed to initialize database")]
    EnsureDb,
    #[display("Failed to acquire store")]
    Acquire,
    #[display("Failed to delete principals")]
    DeletePrincipals,
    #[display("Failed to delete data types")]
    DeleteDataTypes,
    #[display("Failed to delete property types")]
    DeletePropertyTypes,
    #[display("Failed to delete entity types")]
    DeleteEntityTypes,
    #[display("Failed to delete entities")]
    DeleteEntities,
    #[display("Failed to seed system policies")]
    SeedPolicies,
}

impl Error for ResetDbError {}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(clippy::struct_excessive_bools, reason = "This holds flags operation")]
pub struct ResetDbResult {
    pub deleted_entities: bool,
    pub deleted_entity_types: bool,
    pub deleted_property_types: bool,
    pub deleted_data_types: bool,
    pub deleted_principals: bool,
}

impl ResetDbStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<ResetDbResult, Report<ResetDbError>> {
        let pool = runner
            .ensure_db()
            .await
            .change_context(ResetDbError::EnsureDb)?;

        let mut reset_db_result = ResetDbResult::default();

        {
            let mut conn = pool
                .acquire(None)
                .await
                .change_context(ResetDbError::Acquire)?;
            let store = conn.store();

            if self.entities {
                store
                    .delete_entities()
                    .await
                    .change_context(ResetDbError::DeleteEntities)?;
                reset_db_result.deleted_entities = true;
            }
            if self.entity_types {
                store
                    .delete_entity_types()
                    .await
                    .change_context(ResetDbError::DeleteEntityTypes)?;
                reset_db_result.deleted_entity_types = true;
            }
            if self.property_types {
                store
                    .delete_property_types()
                    .await
                    .change_context(ResetDbError::DeletePropertyTypes)?;
                reset_db_result.deleted_property_types = true;
            }
            if self.data_types {
                store
                    .delete_data_types()
                    .await
                    .change_context(ResetDbError::DeleteDataTypes)?;
                reset_db_result.deleted_data_types = true;
            }
            if self.principals {
                store
                    .delete_principals(ActorEntityUuid::new(uuid::Uuid::nil()))
                    .await
                    .change_context(ResetDbError::DeletePrincipals)?;
                reset_db_result.deleted_principals = true;
            }

            store
                .seed_system_policies()
                .await
                .change_context(ResetDbError::SeedPolicies)?;
        }

        Ok(reset_db_result)
    }
}
