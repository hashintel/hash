use core::str::FromStr;
use std::collections::HashSet;

use graph::store::{EntityStore, knowledge::CreateEntityParams};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{EntityId, EntityUuid, ProvidedEntityEditionProvenance},
        link::LinkData,
        property::{PropertyObject, PropertyProvenance, PropertyWithMetadataObject},
    },
    owned_by_id::OwnedById,
};
use type_system::url::VersionedUrl;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn insert() {
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

    let owned_by_id = OwnedById::new(api.account_id.into_uuid());

    let alice_id = EntityUuid::new(Uuid::new_v4());
    let alice_entity = CreateEntityParams {
        owned_by_id,
        entity_uuid: Some(alice_id),
        decision_time: None,
        entity_type_ids: HashSet::from([VersionedUrl::from_str(
            "https://blockprotocol.org/@alice/types/entity-type/person/v/1",
        )
        .expect("couldn't construct Versioned URL")]),
        properties: PropertyWithMetadataObject::from_parts(
            serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity"),
            None,
        )
        .expect("could not create property with metadata object"),
        confidence: None,
        link_data: None,
        draft: false,
        relationships: [],
        provenance: ProvidedEntityEditionProvenance::default(),
    };

    let bob_id = EntityUuid::new(Uuid::new_v4());
    let bob_entity = CreateEntityParams {
        owned_by_id,
        entity_uuid: Some(bob_id),
        decision_time: None,
        entity_type_ids: HashSet::from([VersionedUrl::from_str(
            "https://blockprotocol.org/@alice/types/entity-type/person/v/1",
        )
        .expect("couldn't construct Versioned URL")]),
        properties: PropertyWithMetadataObject::from_parts(
            serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity"),
            None,
        )
        .expect("could not create property with metadata object"),
        confidence: None,
        link_data: None,
        draft: false,
        relationships: [],
        provenance: ProvidedEntityEditionProvenance::default(),
    };

    let friendship_entity = CreateEntityParams {
        owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        entity_uuid: None,
        decision_time: None,
        entity_type_ids: HashSet::from([VersionedUrl::from_str(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1",
        )
        .expect("couldn't construct Versioned URL")]),
        properties: PropertyWithMetadataObject::from_parts(PropertyObject::empty(), None)
            .expect("could not create property with metadata object"),
        confidence: None,
        link_data: Some(LinkData {
            left_entity_id: EntityId {
                owned_by_id,
                entity_uuid: alice_id,
                draft_id: None,
            },
            right_entity_id: EntityId {
                owned_by_id,
                entity_uuid: bob_id,
                draft_id: None,
            },
            left_entity_confidence: None,
            left_entity_provenance: PropertyProvenance::default(),
            right_entity_confidence: None,
            right_entity_provenance: PropertyProvenance::default(),
        }),
        draft: false,
        relationships: [],
        provenance: ProvidedEntityEditionProvenance::default(),
    };

    let entities = api
        .create_entities(api.account_id, vec![
            alice_entity,
            friendship_entity,
            bob_entity,
        ])
        .await
        .expect("could not create entity");

    assert_eq!(
        entities[0].metadata.record_id.entity_id.entity_uuid,
        alice_id
    );
    assert_eq!(entities[2].metadata.record_id.entity_id.entity_uuid, bob_id);
}
