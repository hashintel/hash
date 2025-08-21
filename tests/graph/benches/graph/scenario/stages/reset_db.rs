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

impl ResetDbStage {
    #[expect(
        clippy::significant_drop_tightening,
        reason = "We intentionally scope connection and store for clarity; merging acquire+store \
                  would borrow a temporary and trigger E0716"
    )]
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<ResetDbError>> {
        let pool = runner
            .ensure_db()
            .await
            .change_context(ResetDbError::EnsureDb)?;

        let mut deleted = 0_usize;
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
                deleted += 1;
            }
            if self.entity_types {
                store
                    .delete_entity_types()
                    .await
                    .change_context(ResetDbError::DeleteEntityTypes)?;
                deleted += 1;
            }
            if self.property_types {
                store
                    .delete_property_types()
                    .await
                    .change_context(ResetDbError::DeletePropertyTypes)?;
                deleted += 1;
            }
            if self.data_types {
                store
                    .delete_data_types()
                    .await
                    .change_context(ResetDbError::DeleteDataTypes)?;
                deleted += 1;
            }
            if self.principals {
                store
                    .delete_principals(ActorEntityUuid::new(uuid::Uuid::nil()))
                    .await
                    .change_context(ResetDbError::DeletePrincipals)?;
                deleted += 1;
            }

            store
                .seed_system_policies()
                .await
                .change_context(ResetDbError::SeedPolicies)?;
        }

        Ok(deleted)
    }
}
