use graph::ontology::types::uri::VersionedUri;

use crate::{
    postgres::DatabaseTestWrapper,
    test_data::{data_type, entity, entity_type, link_type, property_type},
};

#[tokio::test]
async fn insert() {
    let person = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [entity_type::PERSON_V1],
        )
        .await
        .expect("Could not seed database");

    let entity_id = api
        .create_entity(
            &person,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/person".to_owned(),
                1,
            ),
        )
        .await
        .expect("could not create entity");

    let entity = api
        .get_entity(entity_id)
        .await
        .expect("could not get entity");

    assert_eq!(entity, person);
}

#[tokio::test]
async fn query() {
    let organization =
        serde_json::from_str(entity::ORGANIZATION_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [], [
            entity_type::ORGANIZATION_V1,
        ])
        .await
        .expect("Could not seed database");

    let entity_id = api
        .create_entity(
            &organization,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/organization".to_owned(),
                1,
            ),
        )
        .await
        .expect("could not create entity");

    let queried_organization = api
        .get_entity(entity_id)
        .await
        .expect("could not get entity");
    assert_eq!(organization, queried_organization);
}

#[tokio::test]
async fn update() {
    let page_v1 = serde_json::from_str(entity::PAGE_V1).expect("could not parse entity");
    let page_v2 = serde_json::from_str(entity::PAGE_V2).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::TEXT_V1], [], [
            entity_type::PAGE_V1,
        ])
        .await
        .expect("Could not seed database:");

    let created_entity_id = api
        .create_entity(
            &page_v1,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/page".to_owned(),
                1,
            ),
        )
        .await
        .expect("could not create entity");

    api.update_entity(
        created_entity_id,
        &page_v2,
        VersionedUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/page".to_owned(),
            1,
        ),
    )
    .await
    .expect("could not update entity");

    let entity = api
        .get_entity(created_entity_id)
        .await
        .expect("could not get entity");

    assert_eq!(entity, page_v2);
}
