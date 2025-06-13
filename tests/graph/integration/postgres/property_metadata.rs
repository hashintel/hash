use alloc::borrow::Cow;
use core::{iter::once, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_codec::numeric::Real;
use hash_graph_authorization::AuthorizationApi;
use hash_graph_store::entity::{CreateEntityParams, EntityStore as _, PatchEntityParams};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use serde::de::DeserializeOwned;
use serde_json::json;
use type_system::{
    knowledge::{
        Confidence, PropertyValue,
        entity::provenance::ProvidedEntityEditionProvenance,
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::{
                ObjectMetadata, PropertyMetadata, PropertyObjectMetadata, PropertyProvenance,
                PropertyValueMetadata,
            },
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper, assert_equal_entities};

async fn seed<A: AuthorizationApi>(
    database: &mut DatabaseTestWrapper<A>,
) -> DatabaseApi<'_, &mut A> {
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
fn text_data_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1")
        .expect("couldn't construct data type id")
}
fn number_data_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1")
        .expect("couldn't construct data type id")
}

fn property_provenance_a<P: DeserializeOwned>() -> P {
    serde_json::from_value(json!({
        "sources": [
            {
                "type": "webpage",
                "authors": ["Alice"],
                "location": {
                    "name": "Alice's blog",
                    "uri": "https://alice.com",
                    "description": "Alice's blog"
                }
            }
        ]
    }))
    .expect("could not parse provenance")
}

fn property_provenance_b<P: DeserializeOwned>() -> P {
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
        "actorType": "user",
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

    let entity_property_metadata = PropertyObjectMetadata {
        value: HashMap::from([(
            name_property_type_id(),
            PropertyMetadata::Value(PropertyValueMetadata {
                metadata: ValueMetadata {
                    provenance: property_provenance_a(),
                    confidence: Confidence::new(0.5),
                    data_type_id: None,
                    original_data_type_id: None,
                    canonical: HashMap::default(),
                },
            }),
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
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(
                    alice(),
                    Some(entity_property_metadata.clone()),
                )
                .expect("could not create property with metadata object"),
                confidence: Confidence::new(0.5),
                link_data: None,
                draft: true,
                relationships: [],
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

    assert_eq!(entity.metadata.confidence, Confidence::new(0.5));
    assert_eq!(
        entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: property_provenance_a(),
                        confidence: Confidence::new(0.5),
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
            )]),
            metadata: ObjectMetadata {
                provenance: PropertyProvenance::default(),
                confidence: Confidence::new(0.8),
            },
        }
    );

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
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::String("Bob".to_owned()),
                        metadata: ValueMetadata {
                            provenance: property_provenance_a(),
                            confidence: Confidence::new(0.6),
                            data_type_id: None,
                            original_data_type_id: None,
                            canonical: HashMap::new(),
                        },
                    }),
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
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: property_provenance_a(),
                        confidence: Confidence::new(0.6),
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Bob".to_owned())
                        )]),
                    },
                }),
            )]),
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
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
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

    assert!(entity.metadata.confidence.is_none());
    assert_eq!(
        entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: None,
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
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
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not update entity");

    assert_equal_entities(&entity, &updated_entity);

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
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.metadata.confidence, Confidence::new(0.5));
    assert_eq!(
        entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: None,
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
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
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::String("Alice".to_owned()),
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
                            data_type_id: None,
                            original_data_type_id: None,
                            provenance: ValueProvenance::default(),
                            canonical: HashMap::default(),
                        },
                    }),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not update entity");

    assert!(updated_entity.metadata.confidence.is_none());
    assert_eq!(
        updated_entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: Confidence::new(0.5),
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
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
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: Confidence::new(0.5),
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
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
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
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
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Number(Real::from(30)),
                        metadata: ValueMetadata {
                            confidence: Confidence::new(0.5),
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

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([
                (
                    name_property_type_id(),
                    PropertyMetadata::Value(PropertyValueMetadata {
                        metadata: ValueMetadata {
                            provenance: ValueProvenance::default(),
                            confidence: None,
                            data_type_id: Some(text_data_type_id()),
                            original_data_type_id: Some(text_data_type_id()),
                            canonical: HashMap::from([(
                                text_data_type_id().base_url,
                                PropertyValue::String("Alice".to_owned())
                            )]),
                        },
                    }),
                ),
                (
                    age_property_type_id(),
                    PropertyMetadata::Value(PropertyValueMetadata {
                        metadata: ValueMetadata {
                            provenance: ValueProvenance::default(),
                            confidence: Confidence::new(0.5),
                            data_type_id: Some(number_data_type_id()),
                            original_data_type_id: Some(number_data_type_id()),
                            canonical: HashMap::from([(
                                number_data_type_id().base_url,
                                PropertyValue::Number(Real::from(30))
                            )]),
                        },
                    }),
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
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
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
                        property: PropertyWithMetadata::Object(PropertyObjectWithMetadata {
                            value: HashMap::new(),
                            metadata: ObjectMetadata {
                                confidence: Confidence::new(0.4),
                                provenance: property_provenance_a(),
                            },
                        }),
                    },
                    PropertyPatchOperation::Add {
                        path: film_path.clone(),
                        property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                            value: PropertyValue::String("Fight Club".to_owned()),
                            metadata: ValueMetadata {
                                confidence: Confidence::new(0.5),
                                data_type_id: None,
                                original_data_type_id: None,
                                provenance: property_provenance_b(),
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

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([
                (
                    name_property_type_id(),
                    PropertyMetadata::Value(PropertyValueMetadata {
                        metadata: ValueMetadata {
                            provenance: ValueProvenance::default(),
                            confidence: None,
                            data_type_id: Some(text_data_type_id()),
                            original_data_type_id: Some(text_data_type_id()),
                            canonical: HashMap::from([(
                                text_data_type_id().base_url,
                                PropertyValue::String("Alice".to_owned())
                            )]),
                        },
                    }),
                ),
                (
                    interests_property_type_id(),
                    PropertyMetadata::Object(PropertyObjectMetadata {
                        value: HashMap::from([(
                            film_property_type_id(),
                            PropertyMetadata::Value(PropertyValueMetadata {
                                metadata: ValueMetadata {
                                    provenance: property_provenance_b(),
                                    confidence: Confidence::new(0.5),
                                    data_type_id: Some(text_data_type_id()),
                                    original_data_type_id: Some(text_data_type_id()),
                                    canonical: HashMap::from([(
                                        text_data_type_id().base_url,
                                        PropertyValue::String("Fight Club".to_owned())
                                    )]),
                                },
                            }),
                        )]),
                        metadata: ObjectMetadata {
                            provenance: property_provenance_a(),
                            confidence: Confidence::new(0.4),
                        },
                    }),
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
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not patch entity");

    assert_eq!(
        updated_entity.metadata.properties,
        PropertyObjectMetadata {
            value: HashMap::from([(
                name_property_type_id(),
                PropertyMetadata::Value(PropertyValueMetadata {
                    metadata: ValueMetadata {
                        provenance: ValueProvenance::default(),
                        confidence: None,
                        data_type_id: Some(text_data_type_id()),
                        original_data_type_id: Some(text_data_type_id()),
                        canonical: HashMap::from([(
                            text_data_type_id().base_url,
                            PropertyValue::String("Alice".to_owned())
                        )]),
                    },
                }),
            )]),
            metadata: ObjectMetadata::default(),
        }
    );
}
