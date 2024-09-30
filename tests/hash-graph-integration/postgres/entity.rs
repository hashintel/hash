use std::collections::HashSet;

use graph::store::{
    EntityQuerySorting, EntityStore as _,
    knowledge::{CountEntitiesParams, CreateEntityParams, GetEntitiesParams, PatchEntityParams},
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::ProvidedEntityEditionProvenance,
        property::{
            Property, PropertyObject, PropertyPatchOperation, PropertyPath, PropertyWithMetadata,
            PropertyWithMetadataObject,
        },
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use temporal_versioning::{ClosedTemporalBound, LimitedTemporalBound, TemporalBound};
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
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
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("could not seed database");

    let entity = api
        .create_entity(api.account_id, CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }]),
            properties: PropertyWithMetadataObject::from_parts(person.clone(), None)
                .expect("could not create property with metadata object"),
            confidence: None,
            link_data: None,
            draft: false,
            relationships: [],
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect("could not create entity");

    let entities = api
        .get_entities(api.account_id, GetEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity.metadata.record_id.entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: None,
            conversions: Vec::new(),
            include_count: true,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
        })
        .await
        .expect("could not get entity")
        .entities;

    assert_eq!(entities.len(), 1);
    assert_eq!(entities[0].properties, person);
}

#[tokio::test]
async fn query() {
    let organization: PropertyObject =
        serde_json::from_str(entity::ORGANIZATION_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::ORGANIZATION_V1,
        ])
        .await
        .expect("could not seed database");

    let entity = api
        .create_entity(api.account_id, CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/organization/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }]),
            properties: PropertyWithMetadataObject::from_parts(organization.clone(), None)
                .expect("could not create property with metadata object"),
            confidence: None,
            link_data: None,
            draft: false,
            relationships: [],
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect("could not create entity");

    let queried_organizations = api
        .get_entities(api.account_id, GetEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity.metadata.record_id.entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: None,
            conversions: Vec::new(),
            include_count: true,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
        })
        .await
        .expect("could not get entity")
        .entities;

    assert_eq!(queried_organizations.len(), 1);
    assert_eq!(queried_organizations[0].properties, organization);
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn update() {
    let page_v1: PropertyObject =
        serde_json::from_str(entity::PAGE_V1).expect("could not parse entity");
    let page_v2: PropertyObject =
        serde_json::from_str(entity::PAGE_V2).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::TEXT_V1], [
            entity_type::PAGE_V1,
        ])
        .await
        .expect("could not seed database:");

    let v1_entity = api
        .create_entity(api.account_id, CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }]),
            properties: PropertyWithMetadataObject::from_parts(page_v1.clone(), None)
                .expect("could not create property with metadata object"),
            confidence: None,
            link_data: None,
            draft: false,
            relationships: [],
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect("could not create entity");

    let v2_entity = api
        .patch_entity(api.account_id, PatchEntityParams {
            entity_id: v1_entity.metadata.record_id.entity_id,
            properties: vec![PropertyPatchOperation::Replace {
                path: PropertyPath::default(),
                property: PropertyWithMetadata::from_parts(Property::Object(page_v2.clone()), None)
                    .expect("could not create property with metadata"),
            }],
            entity_type_ids: HashSet::new(),
            archived: None,
            draft: None,
            decision_time: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect("could not update entity");

    let num_entities = api
        .count_entities(api.account_id, CountEntitiesParams {
            filter: Filter::for_entity_by_entity_id(v2_entity.metadata.record_id.entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            include_drafts: false,
        })
        .await
        .expect("could not count entities");
    assert_eq!(num_entities, 2);

    let entities = api
        .get_entities(api.account_id, GetEntitiesParams {
            filter: Filter::for_entity_by_entity_id(v2_entity.metadata.record_id.entity_id),
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
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
        })
        .await
        .expect("could not get entity")
        .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity_v2 = entities.into_iter().next().unwrap();

    assert_eq!(entity_v2.properties.properties(), page_v2.properties());

    let ClosedTemporalBound::Inclusive(entity_v1_timestamp) =
        *v1_entity.metadata.temporal_versioning.decision_time.start();

    let mut response_v1 = api
        .get_entities(api.account_id, GetEntitiesParams {
            filter: Filter::for_entity_by_entity_id(v1_entity.metadata.record_id.entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(
                    Some(TemporalBound::Inclusive(entity_v1_timestamp)),
                    Some(LimitedTemporalBound::Inclusive(entity_v1_timestamp)),
                ),
            },
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: None,
            conversions: Vec::new(),
            include_count: true,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
        })
        .await
        .expect("could not get entities");
    assert_eq!(response_v1.count, Some(1));
    let entity_v1 = response_v1.entities.pop().expect("no entity found");
    assert_eq!(entity_v1.properties.properties(), page_v1.properties());

    let ClosedTemporalBound::Inclusive(entity_v2_timestamp) =
        *v2_entity.metadata.temporal_versioning.decision_time.start();
    let mut response_v2 = api
        .get_entities(api.account_id, GetEntitiesParams {
            filter: Filter::for_entity_by_entity_id(v2_entity.metadata.record_id.entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(
                    Some(TemporalBound::Inclusive(entity_v2_timestamp)),
                    Some(LimitedTemporalBound::Inclusive(entity_v2_timestamp)),
                ),
            },
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: None,
            conversions: Vec::new(),
            include_count: true,
            include_drafts: false,
            include_web_ids: false,
            include_created_by_ids: false,
            include_edition_created_by_ids: false,
            include_type_ids: false,
        })
        .await
        .expect("could not get entities");
    assert_eq!(response_v2.count, Some(1));
    let entity_v2 = response_v2.entities.pop().expect("no entity found");
    assert_eq!(entity_v2.properties.properties(), page_v2.properties());
}
