use alloc::borrow::Cow;
use core::{assert_matches, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQueryPath, EntityQuerySorting, EntityStore as _,
        EntityValidationReport, EntityValidationType, LinkedEntityError, PatchEntityParams,
        QueryEntitiesParams, SummarizeEntitiesParams, ValidateEntityComponents,
        ValidateEntityParams,
    },
    entity_type::EntityTypeQueryPath,
    filter::{Filter, FilterExpression, Parameter},
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use type_system::{
    knowledge::{
        entity::{EntityId, Link, LinkEndpoint, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::id::{BaseUrl, OntologyTypeMajorVersion, OntologyTypeVersion, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn insert() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
    let friend_of = PropertyObject::empty();

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
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let friend_of_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_of_type_id.clone()]),
            properties: PropertyObjectWithMetadata::from_parts(friend_of, None)
                .expect("could not create property with metadata object"),
            link_data: Some(Link::Directed {
                source: LinkEndpoint {
                    entity_id: alice_entity.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
                target: LinkEndpoint {
                    entity_id: bob_entity.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
            }),
            draft: false,
            policies: Vec::new(),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("could not create link");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::All(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::Uuid),
                            direction: EdgeDirection::Outgoing,
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(
                            alice_entity.metadata.record_id.entity_id.entity_uuid.into(),
                        ),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityEdge {
                            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            path: Box::new(EntityQueryPath::WebId),
                            direction: EdgeDirection::Outgoing,
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(
                            alice_entity.metadata.record_id.entity_id.web_id.into(),
                        ),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::BaseUrl,
                            inheritance_depth: Some(0),
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            friend_of_type_id.base_url.as_str(),
                        )),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::Version,
                            inheritance_depth: Some(0),
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(
                            &friend_of_type_id.version,
                        )),
                        convert: None,
                    },
                ),
            ]),
            temporal_axes: QueryTemporalAxesUnresolved::all(),
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
    .expect("could not get entity")
    .entities;

    let link_entity = match entities.len() {
        1 => entities.into_iter().next().unwrap(),
        len => panic!("unexpected number of entities found, expected 1 but received {len}"),
    };

    let Link::Directed { source, target } = link_entity.link_data.expect("entity is not a link");

    assert_eq!(source.entity_id, alice_entity.metadata.record_id.entity_id);
    assert_eq!(target.entity_id, bob_entity.metadata.record_id.entity_id);
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
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let friend_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let acquaintance_entity_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let charles_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(charles, None)
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

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_link_type_id.clone()]),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("could not create property with metadata object"),
            link_data: Some(Link::Directed {
                source: LinkEndpoint {
                    entity_id: alice_entity.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
                target: LinkEndpoint {
                    entity_id: bob_entity.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
            }),
            draft: false,
            policies: Vec::new(),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("could not create link");

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([acquaintance_entity_link_type_id.clone()]),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("could not create property with metadata object"),
            link_data: Some(Link::Directed {
                source: LinkEndpoint {
                    entity_id: alice_entity.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
                target: LinkEndpoint {
                    entity_id: charles_metadata.metadata.record_id.entity_id,
                    confidence: None,
                    provenance: PropertyProvenance::default(),
                },
            }),
            draft: false,
            policies: Vec::new(),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("could not create link");

    let links_from_source = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::EntityEdge {
                        edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                        path: Box::new(EntityQueryPath::Uuid),
                        direction: EdgeDirection::Outgoing,
                    },
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid(
                        alice_entity.metadata.record_id.entity_id.entity_uuid.into(),
                    ),
                    convert: None,
                },
            ),
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

    let endpoints = links_from_source
        .iter()
        .map(|entity| {
            let Link::Directed { source, target } =
                entity.link_data.as_ref().expect("entity is not a link");
            (source, target)
        })
        .collect::<Vec<_>>();
    assert!(
        endpoints
            .iter()
            .any(|(source, _)| source.entity_id == alice_entity.metadata.record_id.entity_id)
    );
    assert!(
        endpoints
            .iter()
            .any(|(_, target)| target.entity_id == bob_entity.metadata.record_id.entity_id)
    );
    assert!(
        endpoints
            .iter()
            .any(|(_, target)| target.entity_id == charles_metadata.metadata.record_id.entity_id)
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn remove_link() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");

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
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let friend_link_type_id = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: OntologyTypeMajorVersion::MIN,
            pre_release: None,
        },
    };

    let alice_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(alice, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let bob_entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(bob, None)
                    .expect("could not create property with metadata object"),
                link_data: None,
                draft: false,
                policies: Vec::new(),
                confidence: None,
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

    let link_entity_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([friend_link_type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not create property with metadata object"),
                link_data: Some(Link::Directed {
                    source: LinkEndpoint {
                        entity_id: alice_entity.metadata.record_id.entity_id,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                    target: LinkEndpoint {
                        entity_id: bob_entity.metadata.record_id.entity_id,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                    },
                }),
                draft: false,
                policies: Vec::new(),
                confidence: None,
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                read_only: false,
            },
        )
        .await
        .expect("could not create link");

    let has_link = api
        .summarize_entities(
            api.account_id,
            SummarizeEntitiesParams {
                filter: Filter::All(vec![
                    Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::EntityEdge {
                                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                                path: Box::new(EntityQueryPath::Uuid),
                                direction: EdgeDirection::Outgoing,
                            },
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid(
                                alice_entity.metadata.record_id.entity_id.entity_uuid.into(),
                            ),
                            convert: None,
                        },
                    ),
                    Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::Archived,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Boolean(false),
                            convert: None,
                        },
                    ),
                ]),
                temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                include_drafts: false,
                include_count: true,
                include_web_ids: false,
                include_created_by_ids: false,
                include_edition_created_by_ids: false,
                include_type_ids: false,
                include_type_titles: false,
            },
        )
        .await
        .expect("could not count entities")
        .count
        .expect("summarize_entities should include `count` when `include_count` is true")
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
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not remove link");

    let has_link = api
        .summarize_entities(
            api.account_id,
            SummarizeEntitiesParams {
                filter: Filter::All(vec![
                    Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::EntityEdge {
                                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                                path: Box::new(EntityQueryPath::Uuid),
                                direction: EdgeDirection::Outgoing,
                            },
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid(
                                alice_entity.metadata.record_id.entity_id.entity_uuid.into(),
                            ),
                            convert: None,
                        },
                    ),
                    Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::Archived,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Boolean(false),
                            convert: None,
                        },
                    ),
                ]),
                temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                include_drafts: false,
                include_count: true,
                include_web_ids: false,
                include_created_by_ids: false,
                include_edition_created_by_ids: false,
                include_type_ids: false,
                include_type_titles: false,
            },
        )
        .await
        .expect("could not count entities")
        .count
        .expect("summarize_entities should include `count` when `include_count` is true")
        > 0;
    assert!(!has_link);
}

fn person_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/person/v/1")
        .expect("should be a valid entity type ID")
}

fn friend_of_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1")
        .expect("should be a valid entity type ID")
}

fn link_data(source: EntityId, target: EntityId) -> Link {
    Link::Directed {
        source: LinkEndpoint {
            entity_id: source,
            confidence: None,
            provenance: PropertyProvenance::default(),
        },
        target: LinkEndpoint {
            entity_id: target,
            confidence: None,
            provenance: PropertyProvenance::default(),
        },
    }
}

fn entity_params(
    api: &DatabaseApi<'_>,
    entity_type_id: VersionedUrl,
    properties: PropertyObject,
    link_data: Option<Link>,
) -> CreateEntityParams {
    CreateEntityParams {
        web_id: WebId::new(api.account_id),
        entity_uuid: None,
        decision_time: None,
        entity_type_ids: HashSet::from([entity_type_id]),
        properties: PropertyObjectWithMetadata::from_parts(properties, None)
            .expect("should create a property object with metadata"),
        link_data,
        draft: false,
        policies: Vec::new(),
        confidence: None,
        provenance: ProvidedEntityEditionProvenance {
            actor_type: ActorType::User,
            origin: OriginProvenance::from_empty_type(OriginType::Api),
            sources: Vec::new(),
        },
        read_only: false,
    }
}

/// Alice, Bob, and a link from Alice to Bob.
async fn seed_friends(database: &mut DatabaseTestWrapper) -> (DatabaseApi<'_>, [EntityId; 3]) {
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
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("should seed the database");

    let mut create = async |entity_type_id, properties, link_data| {
        let params = entity_params(&api, entity_type_id, properties, link_data);
        api.create_entity(api.account_id, params)
            .await
            .expect("should create the entity")
            .metadata
            .record_id
            .entity_id
    };
    let alice = create(
        person_type_id(),
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("should parse Alice"),
        None,
    )
    .await;
    let bob = create(
        person_type_id(),
        serde_json::from_str(entity::PERSON_BOB_V1).expect("should parse Bob"),
        None,
    )
    .await;
    let link = create(
        friend_of_type_id(),
        PropertyObject::empty(),
        Some(link_data(alice, bob)),
    )
    .await;

    (api, [alice, bob, link])
}

/// The validation report of a friend-of link with `link_data`.
async fn validate_friend_of(
    api: &DatabaseApi<'_>,
    link_data: Link,
) -> HashMap<usize, EntityValidationReport> {
    api.validate_entities(
        api.account_id,
        vec![ValidateEntityParams {
            entity_types: EntityValidationType::Id(Cow::Owned(HashSet::from(
                [friend_of_type_id()],
            ))),
            properties: Cow::Owned(
                PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("should create a property object with metadata"),
            ),
            link_data: Some(Cow::Owned(link_data)),
            components: ValidateEntityComponents::full(),
        }],
    )
    .await
    .expect("should validate the link")
}

#[tokio::test]
async fn link_to_link_left() {
    let mut database = DatabaseTestWrapper::new().await;
    let (api, [alice, _, link]) = seed_friends(&mut database).await;

    let reports = validate_friend_of(&api, link_data(link, alice)).await;

    assert_matches!(
        reports
            .get(&0)
            .and_then(|report| report.link.link_data_validation.left_entity.as_ref()),
        Some(LinkedEntityError::Link(_)),
        "should reject a link whose left entity is a link"
    );
}

#[tokio::test]
async fn link_to_link_create() {
    let mut database = DatabaseTestWrapper::new().await;
    let (mut api, [alice, _, link]) = seed_friends(&mut database).await;

    let params = entity_params(
        &api,
        friend_of_type_id(),
        PropertyObject::empty(),
        Some(link_data(alice, link)),
    );
    let error = api
        .create_entity(api.account_id, params)
        .await
        .expect_err("should not create a link to a link");

    assert_matches!(
        error
            .downcast_ref::<HashMap<usize, EntityValidationReport>>()
            .and_then(|reports| reports.get(&0))
            .and_then(|report| report.link.link_data_validation.right_entity.as_ref()),
        Some(LinkedEntityError::Link(_)),
        "should report the link the new link points to"
    );
}
