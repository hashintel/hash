use core::{assert_matches, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    resource::{EntityTypeId, EntityTypeResourceConstraint, ResourceConstraint},
    store::PolicyCreationParams,
};
use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQuerySorting, EntityStore as _, PatchEntityParams,
        QueryEntitiesParams, SummarizeEntitiesParams,
    },
    error::EntityCreationError,
    filter::Filter,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use serde_json::json;
use type_system::{
    knowledge::{
        Entity,
        entity::{EntityId, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::VersionedUrl,
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
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
                property_type::TEXT_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::ORGANIZATION_V1,
                entity_type::PERSON_V1,
                entity_type::PAGE_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/person/v/1")
        .expect("couldn't construct entity type id")
}

fn org_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/organization/v/1")
        .expect("couldn't construct entity type id")
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

#[tokio::test]
async fn empty_entity() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    assert_matches!(
        api.create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: false,
            },
        )
        .await
        .expect_err("created entity with no types")
        .current_context(),
        EntityCreationError::Store
    );
}

fn entity_params(
    web_id: WebId,
    entity_type_ids: HashSet<VersionedUrl>,
    properties: PropertyObject,
) -> CreateEntityParams {
    CreateEntityParams {
        web_id,
        entity_uuid: None,
        decision_time: None,
        entity_type_ids,
        properties: PropertyObjectWithMetadata::from_parts(properties, None)
            .expect("should create a property object with metadata"),
        confidence: None,
        link_data: None,
        draft: false,
        policies: Vec::new(),
        provenance: ProvidedEntityEditionProvenance {
            actor_type: ActorType::User,
            origin: OriginProvenance::from_empty_type(OriginType::Api),
            sources: Vec::new(),
        },
        read_only: false,
    }
}

async fn forbid(
    api: &DatabaseApi<'_>,
    actions: Vec<ActionName>,
    resource: Option<ResourceConstraint>,
) {
    api.store
        .insert_policies_into_database([&PolicyCreationParams {
            name: Some("test-forbid".to_owned()),
            effect: Effect::Forbid,
            principal: None,
            actions,
            resource,
        }])
        .await
        .expect("should insert the forbid policy");
}

fn person_resource() -> ResourceConstraint {
    ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact {
        id: EntityTypeId::new(person_entity_type_id()),
    })
}

#[tokio::test]
async fn unknown_entity_type() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let unknown_entity_type_id =
        VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/unknown/v/1")
            .expect("should be a valid entity type id");
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id(), unknown_entity_type_id.clone()]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of an unknown entity type")
            .current_context(),
        EntityCreationError::UnknownEntityTypes { entity_type_ids }
            if *entity_type_ids == HashSet::from([unknown_entity_type_id])
    );
}

#[tokio::test]
async fn invisible_entity_type() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // The actor may not instantiate the entity type either, so the error shows that the
    // visibility check runs first.
    forbid(
        &api,
        vec![ActionName::ViewEntityType, ActionName::Instantiate],
        Some(person_resource()),
    )
    .await;
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id(), org_entity_type_id()]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of an entity type the actor may not view")
            .current_context(),
        EntityCreationError::UnknownEntityTypes { entity_type_ids }
            if *entity_type_ids == HashSet::from([person_entity_type_id()])
    );
}

#[tokio::test]
async fn unknown_and_invisible_entity_types() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    forbid(
        &api,
        vec![ActionName::ViewEntityType, ActionName::Instantiate],
        Some(person_resource()),
    )
    .await;
    let unknown_entity_type_id =
        VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/unknown/v/1")
            .expect("should be a valid entity type id");
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([
            person_entity_type_id(),
            org_entity_type_id(),
            unknown_entity_type_id.clone(),
        ]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of an unknown entity type")
            .current_context(),
        EntityCreationError::UnknownEntityTypes { entity_type_ids }
            if *entity_type_ids == HashSet::from([unknown_entity_type_id, person_entity_type_id()])
    );
}

#[tokio::test]
async fn archived_entity_type() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // The test runs in one transaction, in which archiving the entity type would leave it an empty
    // transaction time. Its transaction time ends in the past instead.
    let person = person_entity_type_id();
    api.store
        .as_client()
        .execute(
            "UPDATE ontology_temporal_metadata
             SET transaction_time = tstzrange(
                 lower(transaction_time) - interval '1 hour',
                 lower(transaction_time) - interval '1 minute'
             )
             WHERE ontology_id = (
                 SELECT ontology_id FROM ontology_ids WHERE base_url = $1 AND version = $2
             )",
            &[&person.base_url, &person.version],
        )
        .await
        .expect("should archive the entity type");
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id(), org_entity_type_id()]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of an archived entity type")
            .current_context(),
        EntityCreationError::ArchivedEntityTypes { entity_type_ids }
            if *entity_type_ids == HashSet::from([person_entity_type_id()])
    );
}

#[tokio::test]
async fn instantiation_forbidden() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    forbid(&api, vec![ActionName::Instantiate], Some(person_resource())).await;
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id()]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of an entity type the actor may not instantiate")
            .current_context(),
        EntityCreationError::InstantiationForbidden { entity_type_ids }
            if *entity_type_ids == HashSet::from([person_entity_type_id()])
    );
}

#[tokio::test]
async fn creation_forbidden() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    forbid(&api, vec![ActionName::CreateEntity], None).await;
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id()]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity the actor may not create")
            .current_context(),
        EntityCreationError::CreationForbidden { entity_ids } if entity_ids.len() == 1
    );
}

#[tokio::test]
async fn invalid_entities_batch() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let web_id = WebId::new(api.account_id);
    let valid_entity_uuid = EntityUuid::new(Uuid::new_v4());
    let mut valid = entity_params(web_id, HashSet::from([person_entity_type_id()]), alice());
    valid.entity_uuid = Some(valid_entity_uuid);
    let invalid = entity_params(
        web_id,
        HashSet::from([person_entity_type_id()]),
        serde_json::from_value(json!({
            "https://blockprotocol.org/@alice/types/property-type/name/": 5,
        }))
        .expect("should be a property object"),
    );

    assert_matches!(
        api.create_entities(api.account_id, vec![valid, invalid])
            .await
            .expect_err("should not create entities of which one does not match its entity types")
            .current_context(),
        EntityCreationError::InvalidEntities
    );
    assert!(
        api.get_entity_by_id(
            Some(api.account_id),
            EntityId {
                web_id,
                entity_uuid: valid_entity_uuid,
                draft_id: None,
            },
            None,
            None,
        )
        .await
        .expect("should read the store")
        .is_none(),
        "the valid entity should not be created when another entity of the request is invalid"
    );
}

#[tokio::test]
async fn incompatible_entity_types() {
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
                property_type::TEXT_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
                property_type::BLURB_V1,
                property_type::PUBLISHED_ON_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::BOOK_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::link::WRITTEN_BY_V1,
            ],
        )
        .await
        .expect("should seed the database");

    // A book has a list of names, a person has one.
    let book_entity_type_id =
        VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/book/v/1")
            .expect("should be a valid entity type id");
    let params = entity_params(
        WebId::new(api.account_id),
        HashSet::from([person_entity_type_id(), book_entity_type_id]),
        alice(),
    );

    assert_matches!(
        api.create_entity(api.account_id, params)
            .await
            .expect_err("should not create an entity of entity types that define a property differently")
            .current_context(),
        EntityCreationError::IncompatibleEntityTypes { property_type }
            if property_type.as_str() == "https://blockprotocol.org/@alice/types/property-type/name/"
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn initial_person() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");

    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id())
    );

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    assert_eq!(&entities[0], &entity);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id(), org_entity_type_id()]),
                properties: vec![],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create entity");

    assert!(
        updated_entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id()),
    );
    assert!(
        updated_entity
            .metadata
            .entity_type_ids
            .contains(&org_entity_type_id()),
    );

    let updated_person_entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    let updated_org_entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    assert_eq!(updated_person_entities, updated_org_entities);
    assert_eq!(
        updated_person_entities,
        [Entity {
            metadata: updated_entity.metadata,
            properties: alice(),
            link_data: None
        }]
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn create_multi() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id(), org_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");

    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id()),
    );
    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&org_entity_type_id()),
    );

    let person_entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    let org_entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    assert_eq!(person_entities, org_entities);
    assert_eq!(&person_entities[0], &entity);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: vec![],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create entity");

    assert!(
        updated_entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id())
    );

    let updated_person_entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entities")
    .entities;

    assert_eq!(
        updated_person_entities,
        [Entity {
            metadata: updated_entity.metadata,
            properties: alice(),
            link_data: None
        }]
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn summary_aggregations() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let account_id = api.account_id;
    let create_params = |entity_type_ids, properties: &str| CreateEntityParams {
        web_id: WebId::new(account_id),
        entity_uuid: None,
        decision_time: None,
        entity_type_ids,
        properties: PropertyObjectWithMetadata::from_parts(
            serde_json::from_str(properties).expect("could not parse entity"),
            None,
        )
        .expect("could not create property with metadata object"),
        confidence: None,
        link_data: None,
        draft: false,
        policies: Vec::new(),
        provenance: ProvidedEntityEditionProvenance {
            actor_type: ActorType::User,
            origin: OriginProvenance::from_empty_type(OriginType::Api),
            sources: Vec::new(),
        },
        read_only: false,
    };

    api.create_entity(
        api.account_id,
        create_params(
            HashSet::from([person_entity_type_id()]),
            entity::PERSON_ALICE_V1,
        ),
    )
    .await
    .expect("could not create entity");
    api.create_entity(
        api.account_id,
        create_params(
            HashSet::from([person_entity_type_id(), org_entity_type_id()]),
            entity::PERSON_BOB_V1,
        ),
    )
    .await
    .expect("could not create entity");

    let response = Box::pin(api.summarize_entities(
        api.account_id,
        SummarizeEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            include_count: true,
            include_drafts: false,
            include_web_ids: true,
            include_created_by_ids: true,
            include_edition_created_by_ids: true,
            include_type_ids: true,
            include_type_titles: true,
        },
    ))
    .await
    .expect("could not get entities");

    assert_eq!(response.count, Some(2));
    assert_eq!(
        response.web_ids,
        Some(HashMap::from([(WebId::new(api.account_id), 2)]))
    );
    assert_eq!(
        response.created_by_ids,
        Some(HashMap::from([(ActorEntityUuid::from(api.account_id), 2)]))
    );
    assert_eq!(
        response.edition_created_by_ids,
        Some(HashMap::from([(ActorEntityUuid::from(api.account_id), 2)]))
    );
    assert_eq!(
        response.type_ids,
        Some(HashMap::from([
            (person_entity_type_id(), 2),
            (org_entity_type_id(), 1),
        ]))
    );
    assert_eq!(
        response.type_titles,
        Some(HashMap::from([
            (person_entity_type_id(), "Person".to_owned()),
            (org_entity_type_id(), "Organization".to_owned()),
        ]))
    );

    let titles_only = Box::pin(api.summarize_entities(
        api.account_id,
        SummarizeEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            include_count: false,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: true,
        },
    ))
    .await
    .expect("could not get entities");

    assert_eq!(titles_only.count, None);
    assert_eq!(titles_only.type_ids, None);
    assert_eq!(
        titles_only.type_titles,
        Some(HashMap::from([
            (person_entity_type_id(), "Person".to_owned()),
            (org_entity_type_id(), "Organization".to_owned()),
        ]))
    );
}
