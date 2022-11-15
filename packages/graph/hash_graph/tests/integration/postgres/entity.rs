use graph::knowledge::EntityProperties;
use graph_test_data::{data_type, entity, entity_type, property_type};
use type_system::uri::{BaseUri, VersionedUri};

use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person: EntityProperties =
        serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");

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
            VersionedUri::new(
                BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                1,
            ),
            None,
        )
        .await
        .expect("could not create entity");

    let entity = api
        .get_entity(metadata.edition_id())
        .await
        .expect("could not get entity");

    assert_eq!(entity.properties(), &person);
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
            VersionedUri::new(
                BaseUri::new(
                    "https://blockprotocol.org/@alice/types/entity-type/organization/".to_owned(),
                )
                .expect("couldn't construct Base URI"),
                1,
            ),
            None,
        )
        .await
        .expect("could not create entity");

    let queried_organization = api
        .get_entity(metadata.edition_id())
        .await
        .expect("could not get entity");

    assert_eq!(&organization, queried_organization.properties());
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

    let metadata = api
        .create_entity(
            page_v1.clone(),
            VersionedUri::new(
                BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/page/".to_owned())
                    .expect("couldn't construct Base URI"),
                1,
            ),
            None,
        )
        .await
        .expect("could not create entity");

    let v2_metadata = api
        .update_entity(
            metadata.edition_id().base_id(),
            page_v2.clone(),
            VersionedUri::new(
                BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/page/".to_owned())
                    .expect("couldn't construct Base URI"),
                1,
            ),
        )
        .await
        .expect("could not update entity");

    let entity_v2 = api
        .get_entity(v2_metadata.edition_id())
        .await
        .expect("could not get entity");

    assert_eq!(entity_v2.properties(), &page_v2);
}
