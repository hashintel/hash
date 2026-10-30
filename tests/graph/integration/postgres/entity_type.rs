use core::assert_matches;

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
use serde_json::json;
use type_system::{
    ontology::{
        VersionedUrl,
        entity_type::EntityType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorType, actor_group::WebId},
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

fn provenance() -> ProvidedOntologyEditionProvenance {
    ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
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
