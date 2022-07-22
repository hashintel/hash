use graph::ontology::types::uri::VersionedUri;

use crate::{
    postgres::DatabaseTestWrapper,
    test_data::{data_type, entity, entity_type, link_type, property_type},
};

#[test]
fn insert() {
    let person = serde_json::from_str(entity::PERSON_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [entity_type::PERSON_V1],
        )
        .expect("Could not seed database");

    let entity_id = database
        .create_entity(
            &person,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/person".to_owned(),
                1,
            ),
        )
        .expect("could not create entity");

    let entity = database
        .get_entity(entity_id)
        .expect("Could not query entity");

    assert_eq!(entity, person);
}

#[test]
fn query() {
    let organization =
        serde_json::from_str(entity::ORGANIZATION_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [], [
            entity_type::ORGANIZATION_V1,
        ])
        .expect("Could not seed database");

    let entity_id = database
        .create_entity(
            &organization,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/organization".to_owned(),
                1,
            ),
        )
        .expect("could not create entity");

    let queried_organization = database
        .get_entity(entity_id)
        .expect("Could not query entity");
    assert_eq!(organization, queried_organization);
}

#[test]
fn update() {
    let page_v1 = serde_json::from_str(entity::PAGE_V1).expect("could not parse entity");
    let page_v2 = serde_json::from_str(entity::PAGE_V2).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::TEXT_V1], [property_type::TEXT_V1], [], [
            entity_type::PAGE_V1,
        ])
        .expect("Could not seed database:");

    let created_entity_id = database
        .create_entity(
            &page_v1,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/page".to_owned(),
                1,
            ),
        )
        .expect("could not create entity");

    database
        .update_entity(
            created_entity_id,
            &page_v2,
            VersionedUri::new(
                "https://blockprotocol.org/@alice/types/entity-type/page".to_owned(),
                1,
            ),
        )
        .expect("could not update entity");

    let entity = database
        .get_entity(created_entity_id)
        .expect("Could not query entity");

    assert_eq!(entity, page_v2);
}
