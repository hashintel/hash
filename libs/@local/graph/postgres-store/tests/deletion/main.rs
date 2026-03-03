#![feature(assert_matches)]
#![expect(clippy::missing_panics_doc, clippy::missing_errors_doc)]

#[path = "../common/mod.rs"]
mod common;

mod drafts;
mod erase;
mod links;
mod purge;
mod validation;

use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{AsClient as _, PostgresStore};
use hash_graph_store::{
    account::{AccountStore as _, CreateUserActorParams},
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity::{CountEntitiesParams, CreateEntityParams, EntityStore as _},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    error::InsertionError,
    filter::Filter,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use tokio_postgres::Transaction;
use type_system::{
    knowledge::{
        Entity,
        entity::{
            EntityId, LinkData,
            id::{DraftId, EntityUuid},
            provenance::{
                EntityDeletionProvenance, InferredEntityProvenance, ProvidedEntityEditionProvenance,
            },
        },
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

pub use crate::common::DatabaseTestWrapper;

pub struct DatabaseApi<'pool> {
    pub store: PostgresStore<Transaction<'pool>>,
    pub account_id: ActorEntityUuid,
}

impl DatabaseTestWrapper {
    pub async fn seed<D, P, E>(
        &mut self,
        data_types: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, Report<InsertionError>>
    where
        D: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        P: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        E: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    {
        let mut store = self
            .connection
            .transaction()
            .await
            .expect("could not start test transaction");

        store
            .seed_system_policies()
            .await
            .expect("could not seed system policies");

        let system_account_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(InsertionError)?;
        let user_id = store
            .create_user_actor(
                system_account_id.into(),
                CreateUserActorParams {
                    user_id: None,
                    shortname: Some("test-user".to_owned()),
                    registration_complete: true,
                },
            )
            .await
            .change_context(InsertionError)?
            .user_id;

        let ontology_provenance = ProvidedOntologyEditionProvenance {
            actor_type: ActorType::User,
            origin: OriginProvenance::from_empty_type(OriginType::Api),
            sources: Vec::new(),
        };

        store
            .create_data_types(
                user_id.into(),
                data_types.into_iter().map(|json| CreateDataTypeParams {
                    schema: serde_json::from_str::<DataType>(json)
                        .expect("could not parse data type"),
                    ownership: OntologyOwnership::Local {
                        web_id: user_id.into(),
                    },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance.clone(),
                    conversions: HashMap::new(),
                }),
            )
            .await?;

        store
            .create_property_types(
                user_id.into(),
                property_types
                    .into_iter()
                    .map(|json| CreatePropertyTypeParams {
                        schema: serde_json::from_str::<PropertyType>(json)
                            .expect("could not parse property type"),
                        ownership: OntologyOwnership::Local {
                            web_id: user_id.into(),
                        },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ontology_provenance.clone(),
                    }),
            )
            .await?;

        store
            .create_entity_types(
                user_id.into(),
                entity_types.into_iter().map(|json| CreateEntityTypeParams {
                    schema: serde_json::from_str::<EntityType>(json)
                        .expect("could not parse entity type"),
                    ownership: OntologyOwnership::Local {
                        web_id: user_id.into(),
                    },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance.clone(),
                }),
            )
            .await?;

        Ok(DatabaseApi {
            store,
            account_id: user_id.into(),
        })
    }
}

/// Counts rows in `table` for the given `(web_id, entity_uuid)` pair via raw SQL.
pub(crate) async fn raw_count(
    api: &DatabaseApi<'_>,
    table: &str,
    web_id: WebId,
    entity_uuid: EntityUuid,
) -> i64 {
    api.store
        .as_client()
        .query_one(
            &format!("SELECT COUNT(*) FROM {table} WHERE web_id = $1 AND entity_uuid = $2"),
            &[&web_id, &entity_uuid],
        )
        .await
        .expect("raw count query failed")
        .get(0)
}

/// Returns the [`EntityDeletionProvenance`] from the `entity_ids` provenance column, or `None`
/// if the row is missing or the entity has not been deleted.
///
/// Deserializes the full [`InferredEntityProvenance`] to validate the JSONB structure, then
/// extracts only the `deletion` field.
pub(crate) async fn get_deletion_provenance(
    api: &DatabaseApi<'_>,
    web_id: WebId,
    entity_uuid: EntityUuid,
) -> Option<EntityDeletionProvenance> {
    api.store
        .as_client()
        .query_opt(
            "SELECT provenance FROM entity_ids WHERE web_id = $1 AND entity_uuid = $2",
            &[&web_id, &entity_uuid],
        )
        .await
        .expect("provenance query failed")
        .and_then(|row| {
            let prov: InferredEntityProvenance = row.get(0);
            prov.deletion
        })
}

/// Returns the full [`InferredEntityProvenance`] from `entity_ids`, or `None` if the row is
/// missing.
pub(crate) async fn get_inferred_provenance(
    api: &DatabaseApi<'_>,
    web_id: WebId,
    entity_uuid: EntityUuid,
) -> Option<InferredEntityProvenance> {
    api.store
        .as_client()
        .query_opt(
            "SELECT provenance FROM entity_ids WHERE web_id = $1 AND entity_uuid = $2",
            &[&web_id, &entity_uuid],
        )
        .await
        .expect("provenance query failed")
        .map(|row| row.get(0))
}

// ---------------------------------------------------------------------------
// Shared test helpers — used by purge, erase, links, drafts, and validation
// ---------------------------------------------------------------------------

pub(crate) fn person_type_id() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    }
}

pub(crate) fn friend_of_type_id() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    }
}

pub(crate) fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

pub(crate) fn bob() -> PropertyObject {
    serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity")
}

pub(crate) const fn provenance() -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

pub(crate) async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

pub(crate) async fn count_entity(
    api: &DatabaseApi<'_>,
    entity_id: EntityId,
    include_drafts: bool,
) -> usize {
    api.store
        .count_entities(
            api.account_id,
            CountEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
                include_drafts,
            },
        )
        .await
        .expect("could not count entities")
}

pub(crate) async fn create_person(
    api: &mut DatabaseApi<'_>,
    properties: PropertyObject,
    draft: bool,
) -> Entity {
    api.store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(properties, None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft,
                policies: Vec::new(),
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create entity")
}

pub(crate) async fn create_link(
    api: &mut DatabaseApi<'_>,
    source: EntityId,
    target: EntityId,
) -> Entity {
    api.store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([friend_of_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: Some(LinkData {
                    left_entity_id: source,
                    right_entity_id: target,
                    left_entity_confidence: None,
                    left_entity_provenance: PropertyProvenance::default(),
                    right_entity_confidence: None,
                    right_entity_provenance: PropertyProvenance::default(),
                }),
                draft: false,
                policies: Vec::new(),
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create link entity")
}

pub(crate) async fn create_second_user(api: &mut DatabaseApi<'_>) -> ActorEntityUuid {
    let system_account_id = api
        .store
        .get_or_create_system_machine("h")
        .await
        .expect("could not get system machine");
    let response = api
        .store
        .create_user_actor(
            system_account_id.into(),
            CreateUserActorParams {
                user_id: None,
                shortname: Some("test-user-2".to_owned()),
                registration_complete: true,
            },
        )
        .await
        .expect("could not create second user");
    response.user_id.into()
}

pub(crate) async fn raw_count_by_draft_id(
    api: &DatabaseApi<'_>,
    table: &str,
    draft_id: DraftId,
) -> i64 {
    api.store
        .as_client()
        .query_one(
            &format!("SELECT COUNT(*) FROM {table} WHERE draft_id = $1"),
            &[&draft_id],
        )
        .await
        .expect("raw count by draft_id query failed")
        .get(0)
}

/// Counts `entity_edge` rows where the entity is the **source**.
pub(crate) async fn raw_count_entity_edge(
    api: &DatabaseApi<'_>,
    source_web_id: WebId,
    source_entity_uuid: EntityUuid,
) -> i64 {
    api.store
        .as_client()
        .query_one(
            "SELECT COUNT(*) FROM entity_edge WHERE source_web_id = $1 AND source_entity_uuid = $2",
            &[&source_web_id, &source_entity_uuid],
        )
        .await
        .expect("raw count entity_edge query failed")
        .get(0)
}

/// Counts ALL `entity_edge` rows where the entity appears as **either** source or target.
///
/// Useful for link entity tests: `entity_edge` stores bidirectional rows (outgoing +
/// incoming/reversed), so a link entity L between A and B has 4 rows total (2 as source, 2 as
/// target).
pub(crate) async fn raw_count_entity_edge_any(
    api: &DatabaseApi<'_>,
    web_id: WebId,
    entity_uuid: EntityUuid,
) -> i64 {
    api.store
        .as_client()
        .query_one(
            "SELECT COUNT(*) FROM entity_edge WHERE (source_web_id = $1 AND source_entity_uuid = \
             $2) OR (target_web_id = $1 AND target_entity_uuid = $2)",
            &[&web_id, &entity_uuid],
        )
        .await
        .expect("raw count entity_edge (any) query failed")
        .get(0)
}

pub(crate) async fn raw_entity_ids_exists(
    api: &DatabaseApi<'_>,
    web_id: WebId,
    entity_uuid: EntityUuid,
) -> bool {
    api.store
        .as_client()
        .query_one(
            "SELECT EXISTS(SELECT 1 FROM entity_ids WHERE web_id = $1 AND entity_uuid = $2)",
            &[&web_id, &entity_uuid],
        )
        .await
        .expect("raw entity_ids exists query failed")
        .get(0)
}
