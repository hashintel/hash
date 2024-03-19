use graph::store::knowledge::PatchEntityParams;
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::knowledge::entity::EntityProperties;
use json_patch::{PatchOperation, ReplaceOperation};
use temporal_versioning::ClosedTemporalBound;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person: EntityProperties =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1, data_type::NUMBER_V1],
            [property_type::NAME_V1, property_type::AGE_V1],
            [
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("could not seed database");

    let metadata = api
        .create_entity(
            person.clone(),
            vec![VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }],
            None,
            false,
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
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [entity_type::ORGANIZATION_V1],
        )
        .await
        .expect("could not seed database");

    let metadata = api
        .create_entity(
            organization.clone(),
            vec![VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/organization/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }],
            None,
            false,
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
        .seed(
            [data_type::TEXT_V1],
            [property_type::TEXT_V1],
            [entity_type::PAGE_V1],
        )
        .await
        .expect("could not seed database:");

    let v1_metadata = api
        .create_entity(
            page_v1.clone(),
            vec![VersionedUrl {
                base_url: BaseUrl::new(
                    "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
                )
                .expect("couldn't construct Base URL"),
                version: OntologyTypeVersion::new(1),
            }],
            None,
            false,
        )
        .await
        .expect("could not create entity");

    let v2_metadata = api
        .patch_entity(PatchEntityParams {
            entity_id: v1_metadata.record_id.entity_id,
            properties: vec![PatchOperation::Replace(ReplaceOperation {
                path: String::new(),
                value: serde_json::to_value(&page_v2).expect("could not serialize entity"),
            })],
            entity_type_ids: vec![],
            archived: None,
            draft: None,
            decision_time: None,
        })
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

    let ClosedTemporalBound::Inclusive(entity_v1_timestamp) =
        *v1_metadata.temporal_versioning.decision_time.start();
    let entity_v1 = api
        .get_entity_by_timestamp(v1_metadata.record_id.entity_id, entity_v1_timestamp)
        .await
        .expect("could not get entity v1");
    assert_eq!(entity_v1.properties, page_v1);

    let ClosedTemporalBound::Inclusive(entity_v2_timestamp) =
        *v2_metadata.temporal_versioning.decision_time.start();
    let entity_v2 = api
        .get_entity_by_timestamp(v2_metadata.record_id.entity_id, entity_v2_timestamp)
        .await
        .expect("could not get entity v2");

    assert_eq!(entity_v2.properties, page_v2);
}
