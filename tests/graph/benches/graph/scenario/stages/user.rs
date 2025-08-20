use core::error::Error;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{account::AccountStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::context::StageId;

use super::Runner;
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum UserError {
    #[display("Missing user config: {name}")]
    MissingConfig { name: String },
    #[display("Failed to create user producer")]
    CreateProducer,
}

impl Error for UserError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateUsersStage {
    pub id: String,
    pub config_ref: String,
    pub count: usize,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

impl GenerateUsersStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<UserError>> {
        let cfg = config::USER_PRODUCER_CONFIGS
            .get(&self.config_ref)
            .ok_or_else(|| {
                Report::new(UserError::MissingConfig {
                    name: self.config_ref.clone(),
                })
            })?;

        let stage_id = self
            .stage_id
            .map_or_else(|| StageId::from_name(&self.id), StageId::new);

        let params = runner
            .run_producer(|| cfg.create_producer(), self.count, stage_id)
            .change_context(UserError::CreateProducer)?
            .collect::<Vec<_>>();

        let len = params.len();
        runner.resources.users.insert(self.id.clone(), params);

        Ok(len)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistUsersStage {
    pub id: String,
    pub from: Vec<String>,
}

#[derive(Debug, derive_more::Display)]
pub enum PersistUsersError {
    #[display("Missing users for persist stage: {name}")]
    MissingUsers { name: String },
    #[display("Failed to initialize database")]
    EnsureDb,
    #[display("Failed to acquire store")]
    Acquire,
    #[display("Failed to get or create system machine")]
    GetSystemMachine,
    #[display("Failed to create user actor")]
    CreateUserActor,
}

impl Error for PersistUsersError {}

impl PersistUsersStage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<PersistUsersError>> {
        // Concatenate users from multiple sources; no dedupe, idempotency via DB check
        let mut users = Vec::new();
        for key in &self.from {
            let creations = runner.resources.users.get(key).ok_or_else(|| {
                Report::new(PersistUsersError::MissingUsers { name: key.clone() })
            })?;
            users.extend_from_slice(creations);
        }

        let pool = runner
            .ensure_db()
            .await
            .change_context(PersistUsersError::EnsureDb)?;
        let mut store = pool
            .acquire(None)
            .await
            .change_context(PersistUsersError::Acquire)?;
        let system_machine = store
            .get_or_create_system_machine("h")
            .await
            .change_context(PersistUsersError::GetSystemMachine)?;

        for user in &users {
            let _resp = store
                .create_user_actor(system_machine.into(), user.clone().into())
                .await
                .change_context(PersistUsersError::CreateUserActor)?;
        }
        drop(store);

        Ok(users.len())
    }
}
