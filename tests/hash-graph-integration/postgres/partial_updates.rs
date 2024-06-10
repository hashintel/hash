use core::{iter::once, str::FromStr};
use std::collections::HashSet;

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
        entity::ProvidedEntityEditionProvenance, Property, PropertyMetadataMap, PropertyObject,
        PropertyPatchOperation, PropertyPathElement, PropertyProvenance,
    },
    owned_by_id::OwnedById,
};
use pretty_assertions::assert_eq;
use serde_json::json;
use type_system::url::{BaseUrl, VersionedUrl};

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
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::ORGANIZATION_V1,
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

fn name_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/name/".to_owned())
        .expect("couldn't construct Base URL")
}
fn age_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/age/".to_owned())
        .expect("couldn't construct Base URL")
}
fn interests_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/interests/".to_owned())
        .expect("couldn't construct Base URL")
}
fn film_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/favorite-film/".to_owned())
        .expect("couldn't construct Base URL")
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

#[tokio::test]
async fn properties_add() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
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
    let entity_id = entity.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![PropertyPatchOperation::Add {
                path: once(PropertyPathElement::from(age_property_type_id())).collect(),
                value: Property::Value(json!(30)),
                confidence: None,
                provenance: PropertyProvenance::default(),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 2);
    assert_eq!(properties[&name_property_type_id()], json!("Alice"));
    assert_eq!(properties[&age_property_type_id()], json!(30));
}

#[tokio::test]
async fn properties_remove() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
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
    let entity_id = entity.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![PropertyPatchOperation::Remove {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 0);
}

#[tokio::test]
async fn properties_replace() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
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
    let entity_id = entity.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![PropertyPatchOperation::Replace {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                value: Property::Value(json!("Bob")),
                confidence: None,
                provenance: PropertyProvenance::default(),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 1);
    assert_eq!(properties[&name_property_type_id()], json!("Bob"));
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn properties_move() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
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
    let entity_id = entity.record_id.entity_id;

    let _ = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: vec![],
                properties: vec![PropertyPatchOperation::Move {
                    from: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    path: [
                        PropertyPathElement::from(interests_property_type_id()),
                        PropertyPathElement::from(film_property_type_id()),
                    ]
                    .into_iter()
                    .collect(),
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect_err("Could patch entity with invalid move operation");

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(interests_property_type_id())).collect(),
                    value: Property::Value(json!({})),
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
                PropertyPatchOperation::Move {
                    from: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    path: [
                        PropertyPathElement::from(interests_property_type_id()),
                        PropertyPathElement::from(film_property_type_id()),
                    ]
                    .into_iter()
                    .collect(),
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
            ],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 1);
    assert_eq!(
        properties[&interests_property_type_id()],
        json!({ film_property_type_id().as_str(): "Alice" })
    );
}

#[tokio::test]
async fn properties_copy() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
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
    let entity_id = entity.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(interests_property_type_id())).collect(),
                    value: Property::Value(json!({})),
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
                PropertyPatchOperation::Test {
                    path: once(PropertyPathElement::from(interests_property_type_id())).collect(),
                    value: Property::Value(json!({})),
                },
                PropertyPatchOperation::Copy {
                    from: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    path: [
                        PropertyPathElement::from(interests_property_type_id()),
                        PropertyPathElement::from(film_property_type_id()),
                    ]
                    .into_iter()
                    .collect(),
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
            ],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 2);
    assert_eq!(properties[&name_property_type_id()], json!("Alice"));
    assert_eq!(
        properties[&interests_property_type_id()],
        json!({ film_property_type_id().as_str(): "Alice" })
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn type_ids() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id()],
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
        .expect("could not create entity");
    let entity_id = entity.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();
    assert_eq!(
        entity.metadata.entity_type_ids,
        [person_entity_type_id()],
        "Entity type ids changed even though none were provided in the patch operation"
    );

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
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
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();
    assert_eq!(
        entity
            .metadata
            .entity_type_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>(),
        HashSet::from([person_entity_type_id(), org_entity_type_id()]),
    );

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
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
    .expect("could not patch entity");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: None,
                include_count: false,
                include_drafts: false,
            },
        )
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    assert_eq!(entity.metadata.entity_type_ids, [person_entity_type_id()],);
}
