use core::{assert_matches, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQuerySorting, EntityStore as _, PatchEntityParams,
        QueryEntitiesParams, SummarizeEntitiesParams,
    },
    error::InsertionError,
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        Entity,
        entity::provenance::ProvidedEntityEditionProvenance,
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::VersionedUrl,
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

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
            },
        )
        .await
        .expect_err("created entity with no types")
        .current_context(),
        InsertionError
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        api.account_id,
        QueryEntitiesParams {
            filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
        Some(HashMap::from([(api.account_id, 2)]))
    );
    assert_eq!(
        response.edition_created_by_ids,
        Some(HashMap::from([(api.account_id, 2)]))
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
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(None, None),
            },
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
