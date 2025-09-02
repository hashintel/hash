use core::error::Error;

use error_stack::{Report, ResultExt as _};
use serde_json::{Value as JsonValue, json};

use self::{
    data_type::{BuildDataTypeCatalogStage, GenerateDataTypesStage, PersistDataTypesStage},
    entity::{GenerateEntitiesStage, PersistEntitiesStage},
    entity_queries::QueryEntitiesByUserStage,
    entity_type::{
        BuildEntityTypeCatalogStage, BuildEntityTypeRegistryStage, GenerateEntityTypesStage,
        PersistEntityTypesStage,
    },
    property_type::{
        BuildPropertyTypeCatalogStage, GeneratePropertyTypesStage, PersistPropertyTypesStage,
    },
    reset_db::ResetDbStage,
    user::{GenerateUsersStage, PersistUsersStage},
    web_catalog::WebCatalogStage,
};
use super::runner::Runner;

pub mod data_type;
pub mod entity;
pub mod entity_queries;
pub mod entity_type;
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
    BuildPropertyTypeCatalog(BuildPropertyTypeCatalogStage),
    GenerateEntityTypes(GenerateEntityTypesStage),
    PersistEntityTypes(PersistEntityTypesStage),
    BuildEntityTypeCatalog(BuildEntityTypeCatalogStage),
    BuildEntityObjectRegistry(BuildEntityTypeRegistryStage),
    GenerateEntities(GenerateEntitiesStage),
    PersistEntities(PersistEntitiesStage),
    QueryEntitiesByUser(QueryEntitiesByUserStage),
}

impl Stage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<JsonValue, Report<StageError>> {
        match self {
            Self::ResetDb(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::GenerateUsers(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::PersistUsers(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::WebCatalog(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::GenerateDataTypes(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::PersistDataTypes(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::BuildDataTypeCatalog(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::GeneratePropertyTypes(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::PersistPropertyTypes(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::BuildPropertyTypeCatalog(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::GenerateEntityTypes(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::PersistEntityTypes(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::BuildEntityTypeCatalog(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::BuildEntityObjectRegistry(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::GenerateEntities(stage) => stage
                .execute(runner)
                .map(|result| json!(result))
                .change_context(StageError),
            Self::PersistEntities(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
            Self::QueryEntitiesByUser(stage) => stage
                .execute(runner)
                .await
                .map(|result| json!(result))
                .change_context(StageError),
        }
    }

    pub fn id(&self) -> &str {
        match self {
            Self::ResetDb(stage) => &stage.id,
            Self::GenerateUsers(stage) => &stage.id,
            Self::PersistUsers(stage) => &stage.id,
            Self::WebCatalog(stage) => &stage.id,
            Self::GenerateDataTypes(stage) => &stage.id,
            Self::PersistDataTypes(stage) => &stage.id,
            Self::BuildDataTypeCatalog(stage) => &stage.id,
            Self::GeneratePropertyTypes(stage) => &stage.id,
            Self::PersistPropertyTypes(stage) => &stage.id,
            Self::BuildPropertyTypeCatalog(stage) => &stage.id,
            Self::GenerateEntityTypes(stage) => &stage.id,
            Self::PersistEntityTypes(stage) => &stage.id,
            Self::BuildEntityTypeCatalog(stage) => &stage.id,
            Self::BuildEntityObjectRegistry(stage) => &stage.id,
            Self::GenerateEntities(stage) => &stage.id,
            Self::PersistEntities(stage) => &stage.id,
            Self::QueryEntitiesByUser(stage) => &stage.id,
        }
    }
}
