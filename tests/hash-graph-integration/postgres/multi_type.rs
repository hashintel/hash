use std::str::FromStr;

use authorization::AuthorizationApi;
use graph::{
    store::{
        knowledge::{CreateEntityParams, GetEntitiesParams, PatchEntityParams},
        query::Filter,
        EntityQuerySorting, EntityStore,
    },
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{Entity, ProvidedEntityEditionProvenance},
        PropertyMetadataMap, PropertyObject,
    },
    owned_by_id::OwnedById,
};
use pretty_assertions::assert_eq;
use type_system::url::VersionedUrl;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed<A: AuthorizationApi>(
    database: &mut DatabaseTestWrapper<A>,
) -> DatabaseApi<'_, &mut A> {
    database
        .seed(
            [data_type::TEXT_V1, data_type::NUMBER_V1],
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

    let _ = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: vec![],
                properties: PropertyObject::empty(),
                confidence: None,
                property_metadata: PropertyMetadataMap::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect_err("created entity with no types");
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn initial_person() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id()],
                properties: alice(),
                confidence: None,
                property_metadata: PropertyMetadataMap::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(entity_metadata.entity_type_ids, [person_entity_type_id()]);

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    assert_eq!(
        entities,
        [Entity {
            metadata: entity_metadata.clone(),
            properties: alice(),
            link_data: None
        }]
    );

    let updated_entity_metadata = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id(), org_entity_type_id()],
                properties: vec![],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(
        updated_entity_metadata.entity_type_ids,
        [person_entity_type_id(), org_entity_type_id()]
    );

    let updated_person_entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    let updated_org_entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    assert_eq!(updated_person_entities, updated_org_entities);
    assert_eq!(
        updated_person_entities,
        [Entity {
            metadata: updated_entity_metadata,
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

    let entity_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id(), org_entity_type_id()],
                properties: alice(),
                confidence: None,
                property_metadata: PropertyMetadataMap::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(
        entity_metadata.entity_type_ids,
        [person_entity_type_id(), org_entity_type_id()]
    );

    let person_entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    let org_entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    assert_eq!(person_entities, org_entities);
    assert_eq!(
        person_entities,
        [Entity {
            metadata: entity_metadata.clone(),
            properties: alice(),
            link_data: None
        }]
    );

    let updated_entity_metadata = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id()],
                properties: vec![],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(
        updated_entity_metadata.entity_type_ids,
        [person_entity_type_id()]
    );

    let updated_person_entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_entity_type_id()),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: true,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    assert_eq!(
        updated_person_entities,
        [Entity {
            metadata: updated_entity_metadata,
            properties: alice(),
            link_data: None
        }]
    );
}
