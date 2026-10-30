use core::{assert_matches, fmt::Debug};

use error_stack::Report;
use hash_graph_postgres_store::store::error::LinkToLinkConstraint;
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
        VersionedUrl,
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

fn provenance() -> ProvidedOntologyEditionProvenance {
    ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
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

/// Machines may instantiate [`ACTOR_V1`], so they may create this type extending it.
const AGENT_V1: &str = "https://example.com/@alice/types/entity-type/agent/v/1";

async fn create_agent_type(api: &mut DatabaseApi<'_>, web_id: WebId) {
    let machine = ActorId::from(api.create_machine("test-machine").await);
    api.assign_web_administrator(ActorEntityUuid::from(machine), web_id)
        .await;
    api.create_entity_type(
        machine,
        create_params(entity_type_schema(AGENT_V1, &[ACTOR_V1]), web_id, machine),
    )
    .await
    .expect("machines should be able to extend a type they can instantiate");
}

#[tokio::test]
async fn create_grandparent_not_instantiable() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_actor_type(&mut database).await;
    let user = api.account_id;
    let web_id = WebId::new(user);
    create_agent_type(&mut api, web_id).await;

    let result = api
        .create_entity_type(
            user,
            create_params(
                entity_type_schema(
                    "https://example.com/@alice/types/entity-type/child/v/1",
                    &[AGENT_V1],
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

#[tokio::test]
async fn update_grandparent_not_instantiable() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_actor_type(&mut database).await;
    let user = api.account_id;
    let web_id = WebId::new(user);
    create_agent_type(&mut api, web_id).await;

    api.create_entity_type(
        user,
        create_params(
            entity_type_schema(
                "https://example.com/@alice/types/entity-type/child/v/1",
                &[],
            ),
            web_id,
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
                    &[AGENT_V1],
                ),
                provenance: api_provenance(user),
            },
        )
        .await;

    assert_instantiation_denied(result, ACTOR_V1);
}

fn befriending_type_id(version: u32) -> VersionedUrl {
    format!("https://blockprotocol.org/@alice/types/entity-type/befriending/v/{version}")
        .parse()
        .expect("should be a valid versioned URL")
}

/// An entity type whose friend-of links may end at `destination`.
fn befriending_type(version: u32, destination: &VersionedUrl) -> EntityType {
    let friend_of: EntityType = serde_json::from_str(entity_type::link::FRIEND_OF_V1)
        .expect("should be a valid entity type");

    serde_json::from_value(json!({
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
        "kind": "entityType",
        "$id": befriending_type_id(version),
        "type": "object",
        "title": "Befriending",
        "description": "An entity with friends.",
        "properties": {},
        "links": {
            friend_of.id.to_string(): {
                "type": "array",
                "items": { "oneOf": [{ "$ref": destination }] }
            }
        }
    }))
    .expect("should be a valid entity type")
}

async fn seed_link_types(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [],
            [],
            [entity_type::LINK_V1, entity_type::link::FRIEND_OF_V1],
        )
        .await
        .expect("should seed the link types")
}

/// Creating an entity type rejects a link type as a link destination.
#[tokio::test]
async fn insert_link_destination_link() {
    let friend_of: EntityType = serde_json::from_str(entity_type::link::FRIEND_OF_V1)
        .expect("should be a valid entity type");
    let befriending = befriending_type(1, &friend_of.id);

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_link_types(&mut database).await;

    let report = api
        .create_entity_type(
            api.account_id,
            CreateEntityTypeParams {
                schema: befriending.clone(),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: provenance(),
            },
        )
        .await
        .expect_err("should reject a link type as a link destination");

    assert_matches!(
        report.downcast_ref::<LinkToLinkConstraint>(),
        Some(LinkToLinkConstraint::Destination { entity_type_id, destination_id })
            if *entity_type_id == befriending.id && *destination_id == friend_of.id,
        "should name the entity type and its link destination"
    );
}

/// Creating an entity type rejects the link entity type itself as a link destination.
#[tokio::test]
async fn insert_link_destination_link_root() {
    let link: EntityType =
        serde_json::from_str(entity_type::LINK_V1).expect("should be a valid entity type");
    let befriending = befriending_type(1, &link.id);

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_link_types(&mut database).await;

    let report = api
        .create_entity_type(
            api.account_id,
            CreateEntityTypeParams {
                schema: befriending.clone(),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: provenance(),
            },
        )
        .await
        .expect_err("should reject the link entity type as a link destination");

    assert_matches!(
        report.downcast_ref::<LinkToLinkConstraint>(),
        Some(LinkToLinkConstraint::Destination { entity_type_id, destination_id })
            if *entity_type_id == befriending.id && *destination_id == link.id,
        "should name the entity type and its link destination"
    );
}

/// Creating entity types in one request rejects a link destination created in the same request,
/// which inherits from the link entity type through another link type.
#[tokio::test]
async fn insert_link_destination_link_batch() {
    let friend_of: EntityType = serde_json::from_str(entity_type::link::FRIEND_OF_V1)
        .expect("should be a valid entity type");
    let best_friend_of: EntityType = serde_json::from_value(json!({
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
        "kind": "entityType",
        "$id": "https://blockprotocol.org/@alice/types/entity-type/best-friend-of/v/1",
        "type": "object",
        "title": "Best friend of",
        "description": "Someone who is the closest friend of another.",
        "allOf": [{ "$ref": friend_of.id }],
        "properties": {}
    }))
    .expect("should be a valid entity type");
    let befriending = befriending_type(1, &best_friend_of.id);

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_link_types(&mut database).await;

    let report = api
        .create_entity_types(
            api.account_id,
            [befriending.clone(), best_friend_of.clone()].map(|schema| CreateEntityTypeParams {
                schema,
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: provenance(),
            }),
        )
        .await
        .expect_err("should reject a link type from the same request as a link destination");

    assert_matches!(
        report.downcast_ref::<LinkToLinkConstraint>(),
        Some(LinkToLinkConstraint::Destination { entity_type_id, destination_id })
            if *entity_type_id == befriending.id && *destination_id == best_friend_of.id,
        "should name the entity type and its link destination"
    );
}

/// Creating a link type rejects the links it declares.
#[tokio::test]
async fn insert_link_type_links() {
    let link: EntityType =
        serde_json::from_str(entity_type::LINK_V1).expect("should be a valid entity type");
    let friend_of: EntityType = serde_json::from_str(entity_type::link::FRIEND_OF_V1)
        .expect("should be a valid entity type");
    let introduced_by: EntityType = serde_json::from_value(json!({
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
        "kind": "entityType",
        "$id": "https://blockprotocol.org/@alice/types/entity-type/introduced-by/v/1",
        "type": "object",
        "title": "Introduced by",
        "description": "Someone who introduced two people to each other.",
        "allOf": [{ "$ref": link.id }],
        "properties": {},
        "links": {
            friend_of.id.to_string(): { "type": "array", "items": {} }
        }
    }))
    .expect("should be a valid entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_link_types(&mut database).await;

    let report = api
        .create_entity_type(
            api.account_id,
            CreateEntityTypeParams {
                schema: introduced_by.clone(),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: provenance(),
            },
        )
        .await
        .expect_err("should reject a link type that declares links");

    assert_matches!(
        report.downcast_ref::<LinkToLinkConstraint>(),
        Some(LinkToLinkConstraint::Source { entity_type_id, link_type_id })
            if *entity_type_id == introduced_by.id && *link_type_id == friend_of.id,
        "should name the link type and the link it declares"
    );
}

/// Updating an entity type rejects a link type as a link destination.
#[tokio::test]
async fn update_link_destination_link() {
    let friend_of: EntityType = serde_json::from_str(entity_type::link::FRIEND_OF_V1)
        .expect("should be a valid entity type");
    let befriending_v2 = befriending_type(2, &friend_of.id);

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_link_types(&mut database).await;

    api.create_entity_type(
        api.account_id,
        CreateEntityTypeParams {
            schema: befriending_type(1, &befriending_type_id(1)),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: provenance(),
        },
    )
    .await
    .expect("should create an entity type that links to itself");

    let report = api
        .update_entity_type(
            api.account_id,
            UpdateEntityTypesParams {
                schema: befriending_v2.clone(),
                provenance: provenance(),
            },
        )
        .await
        .expect_err("should reject a link type as a link destination");

    assert_matches!(
        report.downcast_ref::<LinkToLinkConstraint>(),
        Some(LinkToLinkConstraint::Destination { entity_type_id, destination_id })
            if *entity_type_id == befriending_v2.id && *destination_id == friend_of.id,
        "should name the entity type and its link destination"
    );
}
