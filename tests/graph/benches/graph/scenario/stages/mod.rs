use core::error::Error;

use error_stack::{Report, ResultExt as _};

use self::{
    data_type::{GenerateDataTypesStage, PersistDataTypesStage},
    property_type::{
        BuildDataTypeCatalogStage, GeneratePropertyTypesStage, PersistPropertyTypesStage,
    },
    reset_db::ResetDbStage,
    user::{GenerateUsersStage, PersistUsersStage},
    web_catalog::WebCatalogStage,
};
use super::runner::Runner;

pub mod data_type;
pub mod property_type;
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
    ResetDb(ResetDbStage),
    GenerateUsers(GenerateUsersStage),
    PersistUsers(PersistUsersStage),
    WebCatalog(WebCatalogStage),
    GenerateDataTypes(GenerateDataTypesStage),
    PersistDataTypes(PersistDataTypesStage),
    BuildDataTypeCatalog(BuildDataTypeCatalogStage),
    GeneratePropertyTypes(GeneratePropertyTypesStage),
    PersistPropertyTypes(PersistPropertyTypesStage),
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
            Self::BuildDataTypeCatalog(stage) => stage.execute(runner).change_context(StageError),
            Self::GeneratePropertyTypes(stage) => stage.execute(runner).change_context(StageError),
            Self::PersistPropertyTypes(stage) => {
                stage.execute(runner).await.change_context(StageError)
            }
        }
    }
}
