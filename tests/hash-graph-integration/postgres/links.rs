use alloc::borrow::Cow;
use std::collections::HashSet;

use graph::{
    knowledge::EntityQueryPath,
    ontology::EntityTypeQueryPath,
    store::{
        knowledge::{
            CountEntitiesParams, CreateEntityParams, GetEntitiesParams, PatchEntityParams,
        },
        query::{Filter, FilterExpression, Parameter},
        EntityQuerySorting, EntityStore,
    },
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::ProvidedEntityEditionProvenance,
        link::LinkData,
        property::{PropertyObject, PropertyProvenance, PropertyWithMetadataObject},
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::subgraph::{
    edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
    temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use temporal_versioning::TemporalBound;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::DatabaseTestWrapper;

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn insert() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
    let friend_of = PropertyObject::empty();

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

    let person_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let friend_of_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_of_type_id.clone()]),
            properties: PropertyWithMetadataObject::from_parts(friend_of, None)
                .expect("could not create property with metadata object"),
            link_data: Some(LinkData {
                left_entity_id: alice_entity.metadata.record_id.entity_id,
                right_entity_id: bob_entity.metadata.record_id.entity_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            }),
            draft: false,
            relationships: [],
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create link");

    let entities = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::All(vec![
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::Uuid),
                            direction: EdgeDirection::Outgoing,
                        })),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            alice_entity
                                .metadata
                                .record_id
                                .entity_id
                                .entity_uuid
                                .into_uuid(),
                        ))),
                    ),
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::OwnedById),
                            direction: EdgeDirection::Outgoing,
                        })),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            alice_entity
                                .metadata
                                .record_id
                                .entity_id
                                .owned_by_id
                                .into_uuid(),
                        ))),
                    ),
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::BaseUrl,
                            inheritance_depth: Some(0),
                        })),
                        Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                            friend_of_type_id.base_url.as_str(),
                        )))),
                    ),
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::Version,
                            inheritance_depth: Some(0),
                        })),
                        Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                            friend_of_type_id.version,
                        ))),
                    ),
                ]),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
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
            },
        )
        .await
        .expect("could not get entity")
        .entities;

    let link_entity = match entities.len() {
        1 => entities.into_iter().next().unwrap(),
        len => panic!("unexpected number of entities found, expected 1 but received {len}"),
    };

    let link_data = link_entity.link_data.expect("entity is not a link");

    assert_eq!(
        link_data.left_entity_id,
        alice_entity.metadata.record_id.entity_id
    );
    assert_eq!(
        link_data.right_entity_id,
        bob_entity.metadata.record_id.entity_id
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn get_entity_links() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
    let charles = serde_json::from_str(entity::PERSON_CHARLES_V1).expect("could not parse entity");

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

    let person_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let friend_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let acquaintance_entity_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let charles_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(charles, None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_link_type_id.clone()]),
            properties: PropertyWithMetadataObject::from_parts(PropertyObject::empty(), None)
                .expect("could not create property with metadata object"),
            link_data: Some(LinkData {
                left_entity_id: alice_entity.metadata.record_id.entity_id,
                right_entity_id: bob_entity.metadata.record_id.entity_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            }),
            draft: false,
            relationships: [],
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create link");

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([acquaintance_entity_link_type_id.clone()]),
            properties: PropertyWithMetadataObject::from_parts(PropertyObject::empty(), None)
                .expect("could not create property with metadata object"),
            link_data: Some(LinkData {
                left_entity_id: alice_entity.metadata.record_id.entity_id,
                right_entity_id: charles_metadata.metadata.record_id.entity_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            }),
            draft: false,
            relationships: [],
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create link");

    let links_from_source = api
        .get_entities(
            api.account_id,
            GetEntitiesParams {
                filter: Filter::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                        edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                        path: Box::new(EntityQueryPath::Uuid),
                        direction: EdgeDirection::Outgoing,
                    })),
                    Some(FilterExpression::Parameter(Parameter::Uuid(
                        alice_entity
                            .metadata
                            .record_id
                            .entity_id
                            .entity_uuid
                            .into_uuid(),
                    ))),
                ),
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
            },
        )
        .await
        .expect("could not get entities")
        .entities;

    assert!(links_from_source.iter().any(|link_entity| {
        link_entity
            .metadata
            .entity_type_ids
            .contains(&friend_link_type_id)
    }));
    assert!(links_from_source.iter().any(|link_entity| {
        link_entity
            .metadata
            .entity_type_ids
            .contains(&acquaintance_entity_link_type_id)
    }));

    let link_datas = links_from_source
        .iter()
        .map(|entity| entity.link_data.as_ref().expect("entity is not a link"))
        .collect::<Vec<_>>();
    assert!(
        link_datas
            .iter()
            .any(|link_data| link_data.left_entity_id == alice_entity.metadata.record_id.entity_id)
    );
    assert!(
        link_datas
            .iter()
            .any(|link_data| link_data.right_entity_id == bob_entity.metadata.record_id.entity_id)
    );
    assert!(link_datas.iter().any(
        |link_data| link_data.right_entity_id == charles_metadata.metadata.record_id.entity_id
    ));
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn remove_link() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");

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

    let person_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let friend_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    let link_entity_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([friend_link_type_id.clone()]),
                properties: PropertyWithMetadataObject::from_parts(PropertyObject::empty(), None)
                    .expect("could not create property with metadata object"),
                link_data: Some(LinkData {
                    left_entity_id: alice_entity.metadata.record_id.entity_id,
                    right_entity_id: bob_entity.metadata.record_id.entity_id,
                    left_entity_confidence: None,
                    left_entity_provenance: PropertyProvenance::default(),
                    right_entity_confidence: None,
                    right_entity_provenance: PropertyProvenance::default(),
                }),
                draft: false,
                relationships: [],
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create link");

    let has_link = api
        .count_entities(
            api.account_id,
            CountEntitiesParams {
                filter: Filter::All(vec![
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::Uuid),
                            direction: EdgeDirection::Outgoing,
                        })),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            alice_entity
                                .metadata
                                .record_id
                                .entity_id
                                .entity_uuid
                                .into_uuid(),
                        ))),
                    ),
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::Archived)),
                        Some(FilterExpression::Parameter(Parameter::Boolean(false))),
                    ),
                ]),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                include_drafts: false,
            },
        )
        .await
        .expect("could not count entities")
        > 0;
    assert!(has_link);

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id: link_entity_metadata.metadata.record_id.entity_id,
            decision_time: None,
            archived: Some(true),
            draft: None,
            entity_type_ids: HashSet::new(),
            properties: vec![],
            confidence: None,
            provenance: ProvidedEntityEditionProvenance::default(),
        },
    )
    .await
    .expect("could not remove link");

    let has_link = api
        .count_entities(
            api.account_id,
            CountEntitiesParams {
                filter: Filter::All(vec![
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::Uuid),
                            direction: EdgeDirection::Outgoing,
                        })),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            alice_entity
                                .metadata
                                .record_id
                                .entity_id
                                .entity_uuid
                                .into_uuid(),
                        ))),
                    ),
                    Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::Archived)),
                        Some(FilterExpression::Parameter(Parameter::Boolean(false))),
                    ),
                ]),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                include_drafts: false,
            },
        )
        .await
        .expect("could not count entities")
        > 0;
    assert!(!has_link);
}
