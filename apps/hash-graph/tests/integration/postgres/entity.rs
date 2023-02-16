use graph::knowledge::{EntityLinkOrder, EntityProperties};
use graph_test_data::{data_type, entity, entity_type, property_type};
use type_system::uri::{BaseUri, VersionedUri};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person: EntityProperties =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::PERSON_V1,
        ])
        .await
        .expect("could not seed database");

    let metadata = api
        .create_entity(
            person.clone(),
            VersionedUri {
                base_uri: BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                version: 1,
            },
            None,
        )
        .await
        .expect("could not create entity");

    let entities = api
        .get_entities(metadata.record_id.entity_id)
        .await
        .expect("could not get entity");
    assert_eq!(entities.len(), 1);

    assert_eq!(entities[0].properties, person);
}

#[tokio::test]
async fn query() {
    let organization: EntityProperties =
        serde_json::from_str(entity::ORGANIZATION_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::ORGANIZATION_V1,
        ])
        .await
        .expect("could not seed database");

    let metadata = api
        .create_entity(
            organization.clone(),
            VersionedUri {
                base_uri: BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/organization/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                version: 1,
            },
            None,
        )
        .await
        .expect("could not create entity");

    let queried_organizations = api
        .get_entities(metadata.record_id.entity_id)
        .await
        .expect("could not get entity");
    assert_eq!(queried_organizations.len(), 1);

    assert_eq!(queried_organizations[0].properties, organization);
}

#[tokio::test]
async fn update() {
    let page_v1: EntityProperties =
        serde_json::from_str(entity::PAGE_V1).expect("could not parse entity");
    let page_v2: EntityProperties =
        serde_json::from_str(entity::PAGE_V2).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::TEXT_V1], [
            entity_type::PAGE_V1,
        ])
        .await
        .expect("could not seed database:");

    let v1_metadata = api
        .create_entity(
            page_v1.clone(),
            VersionedUri {
                base_uri: BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                version: 1,
            },
            None,
        )
        .await
        .expect("could not create entity");

    let v2_metadata = api
        .update_entity(
            v1_metadata.record_id.entity_id,
            page_v2.clone(),
            VersionedUri {
                base_uri: BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                version: 1,
            },
            EntityLinkOrder {
                left_to_right: None,
                right_to_left: None,
            },
        )
        .await
        .expect("could not update entity");

    let entities = api
        .get_entities(v2_metadata.record_id.entity_id)
        .await
        .expect("could not get entity");

    assert_eq!(entities.len(), 2);

    let entity_v2 = api
        .get_latest_entity(v2_metadata.record_id.entity_id)
        .await
        .expect("could not get entity");

    assert_eq!(entity_v2.properties, page_v2);

    let entity_v1 = api
        .get_entity_by_timestamp(
            v1_metadata.record_id.entity_id,
            (*v1_metadata.version.decision_time.start()).into(),
        )
        .await
        .expect("could not get entity");
    assert_eq!(entity_v1.properties, page_v1);

    let entity_v2 = api
        .get_entity_by_timestamp(
            v2_metadata.record_id.entity_id,
            (*v2_metadata.version.decision_time.start()).into(),
        )
        .await
        .expect("could not get entity");

    assert_eq!(entity_v2.properties, page_v2);
}
