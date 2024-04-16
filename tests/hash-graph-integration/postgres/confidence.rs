use std::{borrow::Cow, collections::HashMap, iter::once, str::FromStr};

use graph::store::knowledge::PatchEntityParams;
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::knowledge::{
    entity::ProvidedEntityEditionProvenanceMetadata, Confidence, Property, PropertyConfidence,
    PropertyObject, PropertyPatchOperation, PropertyPath, PropertyPathElement,
};
use pretty_assertions::assert_eq;
use serde_json::json;
use type_system::url::{BaseUrl, VersionedUrl};

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
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

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

fn confidence(value: f64) -> Confidence {
    serde_json::from_str(&value.to_string()).expect("could not parse confidence")
}

fn property_confidence<'a>(value: &'a [(&'a str, f64)]) -> PropertyConfidence<'a> {
    let mut map = HashMap::new();
    for (key, value) in value {
        map.insert(
            PropertyPath::from_json_pointer(key).expect("could not parse path"),
            confidence(*value),
        );
    }
    PropertyConfidence::new(map)
}

#[tokio::test]
async fn initial_confidence() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_property_confidence = property_confidence(&[("", 0.5)]);
    let entity = api
        .create_entity(
            alice(),
            vec![person_entity_type_id()],
            None,
            true,
            Some(confidence(0.5)),
            entity_property_confidence.clone(),
        )
        .await
        .expect("could not create entity");

    assert_eq!(entity.confidence, Some(confidence(0.5)));
    assert_eq!(entity.property_confidence, entity_property_confidence);

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: Vec::new(),
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: Some(confidence(0.5)),
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity, entity);

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: Vec::new(),
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert!(updated_entity.confidence.is_none());
    assert_eq!(
        updated_entity.property_confidence,
        entity_property_confidence
    );
}

#[tokio::test]
async fn no_initial_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            alice(),
            vec![person_entity_type_id()],
            None,
            false,
            None,
            PropertyConfidence::default(),
        )
        .await
        .expect("could not create entity");

    assert!(entity.confidence.is_none());
    assert!(entity.property_confidence.is_empty());

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: Vec::new(),
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert_eq!(entity, updated_entity);

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: Vec::new(),
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: Some(confidence(0.5)),
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.confidence, Some(confidence(0.5)));
    assert!(updated_entity.property_confidence.is_empty());

    let path: PropertyPath = once(PropertyPathElement::from(name_property_type_id())).collect();
    let path_pointer = path.to_json_pointer();
    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: vec![PropertyPatchOperation::Replace {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                value: Property::Value(json!("Alice")),
                confidence: Some(confidence(0.5)),
            }],
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert!(updated_entity.confidence.is_none());
    assert_eq!(
        updated_entity.property_confidence,
        property_confidence(&[(path_pointer.as_str(), 0.5)])
    );

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id: entity.record_id.entity_id,
            properties: Vec::new(),
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
            confidence: Some(confidence(0.5)),
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not update entity");

    assert_eq!(updated_entity.confidence, Some(confidence(0.5)));
    assert_eq!(
        updated_entity.property_confidence,
        property_confidence(&[(path_pointer.as_str(), 0.5)])
    );
}

#[tokio::test]
async fn properties_add() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            alice(),
            vec![person_entity_type_id()],
            None,
            false,
            None,
            PropertyConfidence::default(),
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.record_id.entity_id;

    let path: PropertyPath = once(PropertyPathElement::from(age_property_type_id())).collect();
    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![PropertyPatchOperation::Add {
                path: path.clone(),
                value: Property::Value(json!(30)),
                confidence: Some(confidence(0.5)),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not patch entity");

    assert_eq!(
        updated_entity.property_confidence,
        once((path, confidence(0.5))).collect()
    );
}

#[tokio::test]
async fn properties_remove() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            alice(),
            vec![person_entity_type_id()],
            None,
            false,
            None,
            PropertyConfidence::default(),
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
        .patch_entity(PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(interests_property_type_id())).collect(),
                    value: Property::Value(json!({})),
                    confidence: Some(confidence(0.5)),
                },
                PropertyPatchOperation::Add {
                    path: film_path.clone(),
                    value: Property::Value(json!("Fight Club")),
                    confidence: Some(confidence(0.5)),
                },
            ],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not patch entity");

    let film_path_pointer = film_path.to_json_pointer();
    let interests_path_pointer = interests_path.to_json_pointer();
    assert_eq!(
        updated_entity.property_confidence,
        property_confidence(&[
            (interests_path_pointer.as_str(), 0.5),
            (film_path_pointer.as_str(), 0.5)
        ])
    );

    let updated_entity = api
        .patch_entity(PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: vec![],
            properties: vec![PropertyPatchOperation::Remove {
                path: interests_path,
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenanceMetadata::default(),
        })
        .await
        .expect("could not patch entity");

    assert!(updated_entity.property_confidence.is_empty());
}
