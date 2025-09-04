use core::error::Error;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{
        EntityQueryCursor, EntityQuerySorting, EntityStore as _, GetEntitiesParams,
        GetEntitySubgraphParams,
    },
    filter::Filter,
    pool::StorePool as _,
    subgraph::{edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
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
    pub resolve_depths: Option<GraphResolveDepths>,
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
    pub entities: usize,
    pub actor: Option<ActorId>,
    #[serde(flatten)]
    pub subgraph: Option<EntitySubgraphInfo>,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntitySubgraphInfo {
    roots: usize,
    entity_types: usize,
    property_types: usize,
    data_types: usize,
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

        if let Some(graph_resolve_depths) = self.inputs.resolve_depths {
            let response: hash_graph_store::entity::GetEntitySubgraphResponse<'static> = store
                .get_entity_subgraph(
                    actor_uuid,
                    GetEntitySubgraphParams {
                        filter: Filter::All(Vec::new()),
                        temporal_axes: QueryTemporalAxesUnresolved::default(),
                        graph_resolve_depths,
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
                    },
                )
                .await
                .change_context(QueryEntitiesError::Query)?;

            drop(store);

            let query_result = QueryEntitiesByUserResult {
                actor,
                entities: response.subgraph.vertices.entities.len(),
                subgraph: Some(EntitySubgraphInfo {
                    roots: response.subgraph.roots.len(),
                    entity_types: response.subgraph.vertices.entity_types.len(),
                    property_types: response.subgraph.vertices.property_types.len(),
                    data_types: response.subgraph.vertices.data_types.len(),
                }),
            };

            let response = hash_graph_api::rest::entity::GetEntitySubgraphResponse {
                subgraph: response.subgraph.into(),
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                web_ids: response.web_ids,
                created_by_ids: response.created_by_ids,
                edition_created_by_ids: response.edition_created_by_ids,
                type_ids: response.type_ids,
                type_titles: response.type_titles,
            };

            let response_json =
                serde_json::to_vec(&response).expect("Failed to serialize response");
            core::hint::black_box(response_json);

            Ok(query_result)
        } else {
            let response = store
                .get_entities(
                    actor_uuid,
                    GetEntitiesParams {
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
                    },
                )
                .await
                .change_context(QueryEntitiesError::Query)?;

            drop(store);

            core::hint::black_box(
                serde_json::to_vec(&response).expect("Failed to serialize response"),
            );

            Ok(QueryEntitiesByUserResult {
                actor,
                entities: response.entities.len(),
                subgraph: None,
            })
        }
    }
}
