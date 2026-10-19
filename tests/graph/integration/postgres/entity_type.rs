use core::fmt::Debug;

use error_stack::Report;
use hash_graph_store::{
    entity_type::{
        CommonQueryEntityTypesParams, CreateEntityTypeParams, EntityTypeStore as _,
        QueryEntityTypesParams, UpdateEntityTypesParams,
    },
    filter::Filter,
    query::ConflictBehavior,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::{data_type, entity_type, property_type};
use hash_status::StatusCode;
use serde_json::json;
use type_system::{
    ontology::{
        entity_type::EntityType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

#[tokio::test]
async fn insert() {
    let person_et: EntityType = serde_json::from_str(entity_type::PERSON_V1)
        .expect("could not parse entity type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
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
            ],
        )
        .await
        .expect("could not seed database");

    api.create_entity_type(
        api.account_id,
        CreateEntityTypeParams {
            schema: person_et,
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not create entity type");
}

#[tokio::test]
async fn query() {
    let organization_et: EntityType = serde_json::from_str(entity_type::ORGANIZATION_V1)
        .expect("could not parse entity type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [property_type::NAME_V1],
            [],
        )
        .await
        .expect("could not seed database");

    api.create_entity_type(
        api.account_id,
        CreateEntityTypeParams {
            schema: organization_et.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not create entity type");

    let entity_type = api
        .query_entity_types(
            Some(api.account_id),
            QueryEntityTypesParams {
                request: CommonQueryEntityTypesParams {
                    filter: Filter::for_versioned_url(&organization_et.id),
                    temporal_axes: QueryTemporalAxesUnresolved::all(),
                    after: None,
                    limit: None,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
                include_entity_types: None,
            },
        )
        .await
        .expect("could not get entity type")
        .entity_types
        .pop()
        .expect("no entity type found");

    assert_eq!(entity_type.schema.id, organization_et.id);
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn update() {
    let page_et_v1: EntityType = serde_json::from_str(entity_type::PAGE_V1)
        .expect("could not parse entity type representation");

    let page_et_v2: EntityType = serde_json::from_str(entity_type::PAGE_V2)
        .expect("could not parse entity type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [
                property_type::TEXT_V1,
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::LINK_V1,
                entity_type::link::WRITTEN_BY_V1,
                entity_type::link::CONTAINS_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
                entity_type::BLOCK_V1,
            ],
        )
        .await
        .expect("could not seed database:");

    api.create_entity_type(
        api.account_id,
        CreateEntityTypeParams {
            schema: page_et_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not create entity type");

    api.update_entity_type(
        api.account_id,
        UpdateEntityTypesParams {
            schema: page_et_v2.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not update entity type");

    let returned_page_et_v1 = api
        .query_entity_types(
            Some(api.account_id),
            QueryEntityTypesParams {
                request: CommonQueryEntityTypesParams {
                    filter: Filter::for_versioned_url(&page_et_v1.id),
                    temporal_axes: QueryTemporalAxesUnresolved::all(),
                    after: None,
                    limit: None,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
                include_entity_types: None,
            },
        )
        .await
        .expect("could not get entity type")
        .entity_types
        .pop()
        .expect("no entity type found");

    let returned_page_et_v2 = api
        .query_entity_types(
            Some(api.account_id),
            QueryEntityTypesParams {
                request: CommonQueryEntityTypesParams {
                    filter: Filter::for_versioned_url(&page_et_v2.id),
                    temporal_axes: QueryTemporalAxesUnresolved::all(),
                    after: None,
                    limit: None,
                    include_count: false,
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
                include_entity_types: None,
            },
        )
        .await
        .expect("could not get entity type")
        .entity_types
        .pop()
        .expect("no entity type found");

    assert_eq!(page_et_v1.id, returned_page_et_v1.schema.id);
    assert_eq!(page_et_v2.id, returned_page_et_v2.schema.id);
}

/// The seeded policies do not allow users to instantiate this type.
const ACTOR_V1: &str = "https://hash.ai/@h/types/entity-type/actor/v/1";

fn entity_type_schema(id: &str, parents: &[&str]) -> EntityType {
    serde_json::from_value(json!({
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
        "kind": "entityType",
        "$id": id,
        "type": "object",
        "title": id,
        "description": "An entity type used to test inheritance permissions",
        "allOf": parents
            .iter()
            .map(|parent| json!({ "$ref": parent }))
            .collect::<Vec<_>>(),
        "properties": {},
    }))
    .expect("should be a valid entity type")
}

fn api_provenance(actor: ActorId) -> ProvidedOntologyEditionProvenance {
    ProvidedOntologyEditionProvenance {
        actor_type: actor.actor_type(),
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

fn create_params(schema: EntityType, web_id: WebId, actor: ActorId) -> CreateEntityTypeParams {
    CreateEntityTypeParams {
        schema,
        ownership: OntologyOwnership::Local { web_id },
        conflict_behavior: ConflictBehavior::Fail,
        provenance: api_provenance(actor),
    }
}

fn assert_instantiation_denied<T: Debug, C>(result: Result<T, Report<C>>, ancestor: &str) {
    let error = result.expect_err("extending a type the actor cannot instantiate should fail");
    assert_eq!(
        error.request_ref::<StatusCode>().next(),
        Some(&StatusCode::PermissionDenied),
        "the error should carry a `PermissionDenied` status",
    );
    assert!(
        format!("{error:?}").contains(ancestor),
        "the error should name `{ancestor}`: {error:?}",
    );
}

async fn seed_with_actor_type(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    let mut api = database
        .seed([], [], [])
        .await
        .expect("should be able to seed the database");
    let user = api.account_id;
    api.create_entity_type(
        user,
        create_params(entity_type_schema(ACTOR_V1, &[]), WebId::new(user), user),
    )
    .await
    .expect("users should be able to create a type they cannot instantiate");
    api
}

#[tokio::test]
async fn create_parent_not_instantiable() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_actor_type(&mut database).await;
    let user = api.account_id;

    let result = api
        .create_entity_type(
            user,
            create_params(
                entity_type_schema(
                    "https://example.com/@alice/types/entity-type/child/v/1",
                    &[ACTOR_V1],
                ),
                WebId::new(user),
                user,
            ),
        )
        .await;

    assert_instantiation_denied(result, ACTOR_V1);
}

#[tokio::test]
async fn create_ancestor_not_instantiable() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_actor_type(&mut database).await;
    let user = api.account_id;
    let web_id = WebId::new(user);

    // Machines may instantiate `Actor`, so they may extend it.
    let machine = ActorId::from(api.create_machine("test-machine").await);
    api.assign_web_administrator(ActorEntityUuid::from(machine), web_id)
        .await;
    let agent_v1 = "https://example.com/@alice/types/entity-type/agent/v/1";
    api.create_entity_type(
        machine,
        create_params(entity_type_schema(agent_v1, &[ACTOR_V1]), web_id, machine),
    )
    .await
    .expect("machines should be able to extend a type they can instantiate");

    let result = api
        .create_entity_type(
            user,
            create_params(
                entity_type_schema(
                    "https://example.com/@alice/types/entity-type/child/v/1",
                    &[agent_v1],
                ),
                web_id,
                user,
            ),
        )
        .await;

    assert_instantiation_denied(result, ACTOR_V1);
}

#[tokio::test]
async fn create_parent_not_instantiable_same_batch() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("should be able to seed the database");
    let user = api.account_id;
    let web_id = WebId::new(user);

    let result = api
        .create_entity_types(
            user,
            [
                create_params(entity_type_schema(ACTOR_V1, &[]), web_id, user),
                create_params(
                    entity_type_schema(
                        "https://example.com/@alice/types/entity-type/child/v/1",
                        &[ACTOR_V1],
                    ),
                    web_id,
                    user,
                ),
            ],
        )
        .await;

    assert_instantiation_denied(result, ACTOR_V1);
}

#[tokio::test]
async fn update_parent_not_instantiable() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_actor_type(&mut database).await;
    let user = api.account_id;

    api.create_entity_type(
        user,
        create_params(
            entity_type_schema(
                "https://example.com/@alice/types/entity-type/child/v/1",
                &[],
            ),
            WebId::new(user),
            user,
        ),
    )
    .await
    .expect("should be able to create an entity type without parents");

    let result = api
        .update_entity_type(
            user,
            UpdateEntityTypesParams {
                schema: entity_type_schema(
                    "https://example.com/@alice/types/entity-type/child/v/2",
                    &[ACTOR_V1],
                ),
                provenance: api_provenance(user),
            },
        )
        .await;

    assert_instantiation_denied(result, ACTOR_V1);
}
