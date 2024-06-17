use alloc::borrow::Cow;
use core::{iter::once, str::FromStr};
use std::collections::HashMap;

use authorization::AuthorizationApi;
use graph::store::{
    knowledge::{CreateEntityParams, PatchEntityParams},
    EntityStore,
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{Location, ProvidedEntityEditionProvenance, SourceProvenance, SourceType},
        Confidence, ObjectMetadata, Property, PropertyMetadataElement, PropertyMetadataObject,
        PropertyObject, PropertyPatchOperation, PropertyPath, PropertyPathElement,
        PropertyProvenance, ValueMetadata,
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
async fn initial_metadata() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_property_metadata = PropertyMetadataObject {
        properties: HashMap::from([(
            name_property_type_id(),
            PropertyMetadataElement::Value {
                metadata: ValueMetadata {
                    provenance: property_provenance_a(),
                    confidence: Confidence::new(0.5),
                    data_type_id: None,
                },
            },
        )]),
        metadata: ObjectMetadata::default(),
    };

    let entity_metadata = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: vec![person_entity_type_id()],
                properties: alice(),
                confidence: Confidence::new(0.5),
                property_metadata: entity_property_metadata.clone(),
                link_data: None,
                draft: true,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert_eq!(entity_metadata.confidence, Confidence::new(0.5));
    assert_eq!(entity_metadata.properties, entity_property_metadata);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: vec![],
                archived: None,
                draft: None,
                decision_time: None,
                confidence: Confidence::new(0.5),
                provenance: edition_provenance(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.metadata, entity_metadata);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: vec![],
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: edition_provenance(),
            },
        )
        .await
        .expect("could not update entity");

    assert!(updated_entity.metadata.confidence.is_none());
    assert_eq!(updated_entity.metadata.properties, entity_property_metadata);
    assert_eq!(
        updated_entity.metadata.provenance.edition.provided,
        edition_provenance()
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn no_initial_metadata() {
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
                property_metadata: PropertyMetadataObject::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");

    assert!(entity_metadata.confidence.is_none());
    assert!(entity_metadata.properties.is_empty());

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: vec![],
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(entity_metadata, updated_entity.metadata);

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: vec![],
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
    assert!(updated_entity.metadata.properties.is_empty());

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    value: Property::Value(json!("Alice")),
                    metadata: Some(PropertyMetadataElement::Value {
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                            provenance: PropertyProvenance::default(),
                        },
                    }),
                }],
                entity_type_ids: vec![],
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
            properties: HashMap::new(),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.5),
            },
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity_metadata.record_id.entity_id,
                properties: Vec::new(),
                entity_type_ids: vec![],
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
            properties: HashMap::new(),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.5),
            },
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
                entity_type_ids: vec![person_entity_type_id()],
                properties: alice(),
                confidence: None,
                property_metadata: PropertyMetadataObject::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.record_id.entity_id;

    let path: PropertyPath = once(PropertyPathElement::from(age_property_type_id())).collect();
    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: vec![],
                properties: vec![PropertyPatchOperation::Add {
                    path: path.clone(),
                    value: Property::Value(json!(30)),
                    metadata: Some(PropertyMetadataElement::Value {
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                            provenance: PropertyProvenance::default(),
                        },
                    }),
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
            properties: HashMap::new(),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.5),
            },
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
                entity_type_ids: vec![person_entity_type_id()],
                properties: alice(),
                confidence: None,
                property_metadata: PropertyMetadataObject::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.record_id.entity_id;

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
                entity_type_ids: vec![],
                properties: vec![
                    PropertyPatchOperation::Add {
                        path: once(PropertyPathElement::from(interests_property_type_id()))
                            .collect(),
                        value: Property::Value(json!({})),
                        metadata: Some(PropertyMetadataElement::Value {
                            metadata: ValueMetadata {
                                confidence: Confidence::new(0.5),
                                data_type_id: None,
                                provenance: property_provenance_a(),
                            },
                        }),
                    },
                    PropertyPatchOperation::Add {
                        path: film_path.clone(),
                        value: Property::Value(json!("Fight Club")),
                        metadata: Some(PropertyMetadataElement::Value {
                            metadata: ValueMetadata {
                                confidence: Confidence::new(0.5),
                                data_type_id: None,
                                provenance: property_provenance_b(),
                            },
                        }),
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
            properties: HashMap::new(),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.5),
            },
        }
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: vec![],
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
        PropertyMetadataObject::default()
    );
}
