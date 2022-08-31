use std::str::FromStr;

use type_system::EntityType;

use crate::{
    postgres::DatabaseTestWrapper,
    test_data::{data_type, entity_type, link_type, property_type},
};

#[tokio::test]
async fn insert() {
    let person_et =
        EntityType::from_str(entity_type::PERSON_V1).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [],
        )
        .await
        .expect("could not seed database");

    api.create_entity_type(person_et)
        .await
        .expect("could not create entity type");
}

#[tokio::test]
async fn query() {
    let organization_et =
        EntityType::from_str(entity_type::ORGANIZATION_V1).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_entity_type(organization_et.clone())
        .await
        .expect("could not create entity type");

    let entity_type = api
        .get_entity_type(organization_et.id())
        .await
        .expect("could not get entity type");

    assert_eq!(entity_type.inner, organization_et);
}

#[tokio::test]
async fn update() {
    let page_et_v1 =
        EntityType::from_str(entity_type::PAGE_V1).expect("could not parse entity type");
    let page_et_v2 =
        EntityType::from_str(entity_type::PAGE_V2).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::TEXT_V1, property_type::NAME_V1],
            [
                link_type::WRITTEN_BY_V1,
                link_type::CONTAINS_V1,
                link_type::FRIEND_OF_V1,
            ],
            [entity_type::PERSON_V1, entity_type::BLOCK_V1],
        )
        .await
        .expect("could not seed database:");

    api.create_entity_type(page_et_v1.clone())
        .await
        .expect("could not create entity type");

    api.update_entity_type(page_et_v2.clone())
        .await
        .expect("could not update entity type");

    assert_ne!(page_et_v1, page_et_v2);
    assert_ne!(page_et_v1.id(), page_et_v2.id());
}
