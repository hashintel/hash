use crate::{
    postgres::DatabaseTestWrapper,
    test_data::{data_type, entity_type, link_type, property_type},
};

#[test]
fn insert() {
    let person_et =
        serde_json::from_str(entity_type::PERSON_V1).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [],
        )
        .expect("Could not seed database");

    database
        .create_entity_type(person_et)
        .expect("could not create entity type");
}

#[test]
fn query() {
    let organization_et =
        serde_json::from_str(entity_type::ORGANIZATION_V1).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [], [])
        .expect("Could not seed database");

    let created_entity_type = database
        .create_entity_type(organization_et)
        .expect("could not create entity type");

    let entity_type = database
        .get_entity_type(created_entity_type.version_id())
        .expect("could not query entity type");

    assert_eq!(entity_type.inner(), created_entity_type.inner());
}

#[test]
fn update() {
    let page_et_v1 =
        serde_json::from_str(entity_type::PAGE_V1).expect("could not parse entity type");
    let page_et_v2 =
        serde_json::from_str(entity_type::PAGE_V2).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();
    database
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
        .expect("Could not seed database:");

    let created_entity_type = database
        .create_entity_type(page_et_v1)
        .expect("could not create entity type");

    let updated_entity_type = database
        .update_entity_type(page_et_v2)
        .expect("could not update entity type");

    assert_ne!(created_entity_type.inner(), updated_entity_type.inner());
    assert_ne!(
        created_entity_type.version_id(),
        updated_entity_type.version_id()
    );
}
