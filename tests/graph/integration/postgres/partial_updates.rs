use core::{iter::once, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_codec::numeric::Real;
use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQuerySorting, EntityStore as _, PatchEntityParams,
        QueryEntitiesParams,
    },
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::provenance::ProvidedEntityEditionProvenance,
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
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

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn properties_add() {
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
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(age_property_type_id())).collect(),
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Number(Real::from(30)),
                        metadata: ValueMetadata {
                            confidence: None,
                            data_type_id: None,
                            original_data_type_id: None,
                            provenance: ValueProvenance::default(),
                            canonical: HashMap::default(),
                        },
                    }),
                },
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::String("Alice Allison".to_owned()),
                        metadata: ValueMetadata {
                            confidence: None,
                            data_type_id: None,
                            original_data_type_id: None,
                            provenance: ValueProvenance::default(),
                            canonical: HashMap::default(),
                        },
                    }),
                },
            ],
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 2);
    assert_eq!(
        properties[&name_property_type_id()],
        PropertyValue::String("Alice Allison".to_owned())
    );
    assert_eq!(
        properties[&age_property_type_id()],
        PropertyValue::Number(Real::from(30))
    );
}

#[tokio::test]
async fn properties_remove() {
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
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![PropertyPatchOperation::Remove {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
            }],
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
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
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![PropertyPatchOperation::Replace {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                    value: PropertyValue::String("Bob".to_owned()),
                    metadata: ValueMetadata {
                        confidence: None,
                        data_type_id: None,
                        original_data_type_id: None,
                        provenance: ValueProvenance::default(),
                        canonical: HashMap::default(),
                    },
                }),
            }],
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 1);
    assert_eq!(
        properties[&name_property_type_id()],
        PropertyValue::String("Bob".to_owned())
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
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
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
        .expect("could not create entity");
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();
    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id()),
        "Entity type ids changed even though none were provided in the patch operation"
    );

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
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
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        api.account_id,
        QueryEntitiesParams {
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
            conversions: Vec::new(),
            include_count: false,
            include_entity_types: None,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
            include_type_titles: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id())
    );
}
