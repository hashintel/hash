use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{EntityQuerySorting, EntityStore as _, GetEntitiesParams},
    filter::Filter,
    pool::StorePool as _,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::seeding::{context::StageId, producer::entity::EntityProducerDeps};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};

use super::{Runner, web_catalog::InMemoryWebCatalog};
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum QueryEntitiesError {
    #[display("Failed to acquire database connection")]
    Acquire,
    #[display("Failed to query entities")]
    Query,
}

impl Error for QueryEntitiesError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesInputs {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesStage {
    pub id: String,
    pub inputs: QueryEntitiesInputs,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesResult {
    pub num_entities: usize,
}

impl QueryEntitiesStage {
    #[tracing::instrument(name = "QueryEntities", skip_all, fields(id = %self.id))]
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<QueryEntitiesResult, Report<QueryEntitiesError>> {
        let pool = runner
            .ensure_db()
            .await
            .change_context(QueryEntitiesError::Acquire)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(QueryEntitiesError::Acquire)?;

        let entities = store
            .get_entities(
                ActorEntityUuid::public_actor(),
                GetEntitiesParams {
                    filter: Filter::All(Vec::new()),
                    temporal_axes: QueryTemporalAxesUnresolved::default(),
                    sorting: EntityQuerySorting {
                        cursor: None,
                        paths: Vec::new(),
                    },
                    conversions: Vec::new(),
                    limit: None,
                    include_drafts: false,
                    include_count: false,
                    include_entity_types: None,
                    include_web_ids: false,
                    include_created_by_ids: false,
                    include_edition_created_by_ids: false,
                    include_type_ids: false,
                    include_type_titles: false,
                },
            )
            .await
            .change_context(QueryEntitiesError::Query)?;

        Ok(QueryEntitiesResult {
            num_entities: entities.entities.len(),
        })
    }
}
