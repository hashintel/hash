use core::error::Error;

use error_stack::{Report, ResultExt as _};

use self::{
    data_type::{GenerateDataTypesStage, PersistDataTypesStage},
    user::GenerateUsersStage,
    web_catalog::WebCatalogStage,
};
use super::runner::Runner;

pub mod data_type;
pub mod reset_db;
pub mod user;
pub mod web_catalog;

#[derive(Debug, derive_more::Display)]
#[display("Failed to execute stage")]
pub struct StageError;

impl Error for StageError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Stage {
    ResetDb(super::stages::reset_db::ResetDbStage),
    GenerateUsers(GenerateUsersStage),
    PersistUsers(super::stages::user::PersistUsersStage),
    WebCatalog(WebCatalogStage),
    GenerateDataTypes(GenerateDataTypesStage),
    PersistDataTypes(PersistDataTypesStage),
}

impl Stage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<StageError>> {
        match self {
            Self::ResetDb(stage) => stage.execute(runner).await.change_context(StageError),
            Self::GenerateUsers(stage) => stage.execute(runner).change_context(StageError),
            Self::PersistUsers(stage) => stage.execute(runner).await.change_context(StageError),
            Self::WebCatalog(stage) => stage.execute(runner).change_context(StageError),
            Self::GenerateDataTypes(stage) => stage.execute(runner).change_context(StageError),
            Self::PersistDataTypes(stage) => stage.execute(runner).await.change_context(StageError),
        }
    }
}
