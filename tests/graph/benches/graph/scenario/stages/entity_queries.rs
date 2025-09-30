use core::error::Error;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{EntityQuerySorting, EntityStore as _, QueryEntitiesParams},
    filter::Filter,
    pool::StorePool as _,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::seeding::producer::ontology::WebCatalog as _;
use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};

use super::Runner;

#[derive(Debug, derive_more::Display)]
pub enum QueryEntitiesError {
    #[display("Unknown user catalog: {name}")]
    UnknownUserCatalog { name: String },
    #[display("Catalog should not be empty")]
    EmptyCatalog,
    #[display("Failed to acquire database connection")]
    Acquire,
    #[display("Failed to query entities")]
    Query,
}

impl Error for QueryEntitiesError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesInputs {
    #[serde(default)]
    pub user_catalog: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesByUserStage {
    pub id: String,
    pub inputs: QueryEntitiesInputs,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntitiesByUserResult {
    pub num_entities: usize,
    pub actor: Option<ActorId>,
}

impl QueryEntitiesByUserStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<QueryEntitiesByUserResult, Report<QueryEntitiesError>> {
        let user_catalog = self
            .inputs
            .user_catalog
            .as_ref()
            .map(|key| {
                runner.resources.user_catalogs.get(key).ok_or_else(|| {
                    Report::new(QueryEntitiesError::UnknownUserCatalog { name: key.clone() })
                })
            })
            .transpose()?;

        let actor = user_catalog
            .map(|catalog| {
                let num_users = catalog.len();
                if num_users == 0 {
                    return Err(Report::new(QueryEntitiesError::EmptyCatalog));
                }
                // TODO: Add diverse user selection strategies (heavy/light users, random,
                //       permission-based)
                #[expect(
                    clippy::float_arithmetic,
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::cast_precision_loss,
                    reason = "https://linear.app/hashintel/issue/BE-31"
                )]
                let user_idx = ((num_users as f64 * 0.5) as usize).clamp(0, num_users - 1);
                Ok(ActorId::User(UserId::new(
                    catalog
                        .get_entry(user_idx)
                        .expect("catalog should not be empty")
                        .2,
                )))
            })
            .transpose()?;
        let actor_uuid = actor.map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);

        let pool = runner
            .ensure_db()
            .await
            .change_context(QueryEntitiesError::Acquire)?;

        let store = pool
            .acquire(None)
            .await
            .change_context(QueryEntitiesError::Acquire)?;

        let entities = store
            .query_entities(
                actor_uuid,
                QueryEntitiesParams {
                    filter: Filter::All(Vec::new()),
                    temporal_axes: QueryTemporalAxesUnresolved::default(),
                    sorting: EntityQuerySorting {
                        cursor: None,
                        paths: Vec::new(),
                    },
                    conversions: Vec::new(),
                    limit: self.inputs.limit,
                    include_drafts: false,
                    include_count: false,
                    include_entity_types: None,
                    include_web_ids: false,
                    include_created_by_ids: false,
                    include_edition_created_by_ids: false,
                    include_type_ids: false,
                    include_type_titles: false,
                    include_permissions: false,
                },
            )
            .await
            .change_context(QueryEntitiesError::Query)?;

        drop(store);

        Ok(QueryEntitiesByUserResult {
            num_entities: entities.entities.len(),
            actor,
        })
    }
}
