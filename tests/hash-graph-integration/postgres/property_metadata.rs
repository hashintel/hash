use alloc::borrow::Cow;
use core::{iter::once, str::FromStr};
use std::collections::{HashMap, HashSet};

use authorization::AuthorizationApi;
use graph::store::{
    knowledge::{CreateEntityParams, PatchEntityParams},
    EntityStore,
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{Location, ProvidedEntityEditionProvenance, SourceProvenance, SourceType},
        Confidence, ObjectMetadata, Property, PropertyMetadata, PropertyMetadataObject,
        PropertyObject, PropertyPatchOperation, PropertyPath, PropertyPathElement,
        PropertyProvenance, PropertyWithMetadata, PropertyWithMetadataObject, ValueMetadata,
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

fn property_provenance_a() -> PropertyProvenance {
    PropertyProvenance {
        sources: vec![SourceProvenance {
            ty: SourceType::Webpage,
            authors: vec!["Alice".to_owned()],
            location: Some(Location {
                name: Some("Alice's blog".to_owned()),
                uri: Some("https://alice.com".try_into().expect("could not parse URI")),
                description: Some("Alice's blog".to_owned()),
            }),
            first_published: None,
            last_updated: None,
            loaded_at: None,
        }],
    }
}

fn property_provenance_b() -> PropertyProvenance {
    serde_json::from_value(json!({
        "sources": [
            {
                "type": "webpage",
                "authors": ["Bob"],
                "location": {
                    "name": "Bob's blog",
                    "uri": "https://bob.com",
                    "description": "Bob's blog"
                }
            }
        ]
    }))
    .expect("could not parse provenance")
}

fn edition_provenance() -> ProvidedEntityEditionProvenance {
    serde_json::from_value(json!({
        "origin": {
            "type": "web-app",
            "id": "HASH",
        },
        "actorType": "human",
        "sources": [
            {
                "type": "webpage",
                "authors": ["Charles"],
                "location": {
                    "name": "Charles' blog",
                    "uri": "https://charles.com",
                    "description": "Charles' blog"
                }
            }
        ]
    }))
    .expect("could not parse provenance")
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn initial_metadata() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_property_metadata = PropertyMetadataObject {
        value: HashMap::from([(
            name_property_type_id(),
            PropertyMetadata::Value {
                metadata: ValueMetadata {
                    provenance: property_provenance_a(),
                    confidence: Confidence::new(0.5),
                    data_type_id: None,
                },
            },
        )]),
        metadata: ObjectMetadata {
            provenance: PropertyProvenance::default(),
            confidence: Confidence::new(0.8),
        },
    };

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(
                    alice(),
                    Some(entity_property_metadata.clone()),
                )
                .expect("could not create property with metadata object"),
                confidence: Confidence::new(0.5),
                link_data: None,
                draft: true,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(entity.metadata.confidence, Confidence::new(0.5));
    assert_eq!(entity.metadata.properties, entity_property_metadata);

    let name_property_metadata = PropertyMetadata::Value {
        metadata: ValueMetadata {
            provenance: property_provenance_a(),
            confidence: Confidence::new(0.6),
            data_type_id: None,
        },
    };
    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: once(PropertyPathElement::Property(Cow::Owned(
                        name_property_type_id(),
                    )))
                    .collect(),
                    property: PropertyWithMetadata::from_parts(Property::Value(json!("Bob")), None)
                        .expect("could not create property with metadata"),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: Confidence::new(0.5),
                provenance: edition_provenance(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(name_property_type_id(), name_property_metadata)]),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.8),
            },
        }
    );

    let new_updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: edition_provenance(),
            },
        )
        .await
        .expect("could not update entity");

    assert!(new_updated_entity.metadata.confidence.is_none());
    assert_eq!(
        new_updated_entity.metadata.properties,
        updated_entity.metadata.properties
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn no_initial_metadata() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
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

    assert!(entity.metadata.confidence.is_none());
    assert_eq!(
        entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value {
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
                        confidence: None,
                        data_type_id: None,
                    },
                },
            )]),
            metadata: ObjectMetadata::default(),
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(entity, updated_entity);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: Confidence::new(0.5),
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.metadata.confidence, Confidence::new(0.5));
    assert_eq!(
        entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value {
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
                        confidence: None,
                        data_type_id: None,
                    },
                },
            )]),
            metadata: ObjectMetadata::default(),
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    property: PropertyWithMetadata::Value {
                        value: json!("Alice"),
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                            provenance: PropertyProvenance::default(),
                        },
                    },
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert!(updated_entity.metadata.confidence.is_none());
    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value {
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
                        confidence: Confidence::new(0.5),
                        data_type_id: None,
                    },
                },
            )]),
            metadata: ObjectMetadata::default(),
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: Confidence::new(0.5),
                provenance: edition_provenance(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.metadata.confidence, Confidence::new(0.5));
    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value {
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
                        confidence: Confidence::new(0.5),
                        data_type_id: None,
                    },
                },
            )]),
            metadata: ObjectMetadata::default(),
        }
    );
    assert_eq!(
        updated_entity.metadata.provenance.edition.provided,
        edition_provenance()
    );
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
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
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
    let entity_id = entity.metadata.record_id.entity_id;

    let path: PropertyPath = once(PropertyPathElement::from(age_property_type_id())).collect();
    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: vec![PropertyPatchOperation::Add {
                    path: path.clone(),
                    property: PropertyWithMetadata::Value {
                        value: json!(30),
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                            provenance: PropertyProvenance::default(),
                        },
                    },
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not patch entity");

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([
                (
                    name_property_type_id(),
                    PropertyMetadata::Value {
                        metadata: ValueMetadata {
                            provenance: PropertyProvenance::default(),
                            confidence: None,
                            data_type_id: None,
                        },
                    },
                ),
                (
                    age_property_type_id(),
                    PropertyMetadata::Value {
                        metadata: ValueMetadata {
                            provenance: PropertyProvenance::default(),
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                        },
                    },
                )
            ]),
            metadata: ObjectMetadata::default(),
        }
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
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
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
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
    let entity_id = entity.metadata.record_id.entity_id;

    let interests_path: PropertyPath =
        once(PropertyPathElement::from(interests_property_type_id())).collect();
    let film_path = [
        PropertyPathElement::Property(Cow::Owned(interests_property_type_id())),
        PropertyPathElement::Property(Cow::Owned(film_property_type_id())),
    ]
    .into_iter()
    .collect::<PropertyPath>();

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: vec![
                    PropertyPatchOperation::Add {
                        path: once(PropertyPathElement::from(interests_property_type_id()))
                            .collect(),
                        property: PropertyWithMetadata::Object {
                            value: HashMap::new(),
                            metadata: ObjectMetadata {
                                confidence: Confidence::new(0.4),
                                provenance: property_provenance_a(),
                            },
                        },
                    },
                    PropertyPatchOperation::Add {
                        path: film_path.clone(),
                        property: PropertyWithMetadata::Value {
                            value: json!("Fight Club"),
                            metadata: ValueMetadata {
                                confidence: Confidence::new(0.5),
                                data_type_id: None,
                                provenance: property_provenance_b(),
                            },
                        },
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

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([
                (
                    name_property_type_id(),
                    PropertyMetadata::Value {
                        metadata: ValueMetadata {
                            provenance: PropertyProvenance::default(),
                            confidence: None,
                            data_type_id: None,
                        },
                    },
                ),
                (
                    interests_property_type_id(),
                    PropertyMetadata::Object {
                        value: HashMap::from([(
                            film_property_type_id(),
                            PropertyMetadata::Value {
                                metadata: ValueMetadata {
                                    provenance: property_provenance_b(),
                                    confidence: Confidence::new(0.5),
                                    data_type_id: None,
                                },
                            },
                        )]),
                        metadata: ObjectMetadata {
                            provenance: property_provenance_a(),
                            confidence: Confidence::new(0.4),
                        },
                    }
                ),
            ]),
            metadata: ObjectMetadata::default(),
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: vec![PropertyPatchOperation::Remove {
                    path: interests_path,
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not patch entity");

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyMetadataObject {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value {
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
                        confidence: None,
                        data_type_id: None,
                    },
                },
            )]),
            metadata: ObjectMetadata::default(),
        }
    );
}
