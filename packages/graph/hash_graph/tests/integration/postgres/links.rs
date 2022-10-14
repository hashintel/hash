use graph_test_data::{data_type, entity, entity_type, link_type, property_type};
use type_system::uri::{BaseUri, VersionedUri};

use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [entity_type::PERSON_V1],
        )
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/link-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_a_identifier = person_a_metadata.identifier();

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_identifier = person_b_metadata.identifier();

    api.create_link(
        person_a_identifier.entity_id(),
        person_b_identifier.entity_id(),
        link_type_id.clone(),
    )
    .await
    .expect("could not create link");

    let link_target = api
        .get_link_target(person_a_identifier.entity_id(), link_type_id.clone())
        .await
        .expect("could not fetch link");

    assert_eq!(
        link_target.inner().target_entity(),
        person_b_identifier.entity_id()
    );
}

#[tokio::test]
async fn get_entity_links() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");
    let person_c = serde_json::from_str(entity::PERSON_C_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1, link_type::ACQUAINTANCE_OF_V1],
            [entity_type::PERSON_V1],
        )
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let friend_link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/link-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let acquaintance_link_type_id = VersionedUri::new(
        BaseUri::new(
            "https://blockprotocol.org/@alice/types/link-type/acquaintance-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_a_identifier = person_a_metadata.identifier();

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_identifier = person_b_metadata.identifier();

    let person_c_metadata = api
        .create_entity(person_c, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_c_identifier = person_c_metadata.identifier();

    let _a_b_link = api
        .create_link(
            person_a_identifier.entity_id(),
            person_b_identifier.entity_id(),
            friend_link_type_id.clone(),
        )
        .await
        .expect("could not create link");

    let _a_c_link = api
        .create_link(
            person_a_identifier.entity_id(),
            person_c_identifier.entity_id(),
            acquaintance_link_type_id.clone(),
        )
        .await
        .expect("could not create link");

    let links_from_source = api
        .get_entity_links(person_a_identifier.entity_id())
        .await
        .expect("could not fetch link");

    assert!(
        links_from_source
            .iter()
            .find(|link| link.inner().link_type_id() == &acquaintance_link_type_id)
            .is_some()
    );
    assert!(
        links_from_source
            .iter()
            .find(|link| link.inner().link_type_id() == &friend_link_type_id)
            .is_some()
    );
}

#[tokio::test]
async fn remove_link() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [entity_type::PERSON_V1],
        )
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/link-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_a_identifier = person_a_metadata.identifier();

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_identifier = person_b_metadata.identifier();

    let _a_b_link = api
        .create_link(
            person_a_identifier.entity_id(),
            person_b_identifier.entity_id(),
            link_type_id.clone(),
        )
        .await
        .expect("could not create link");

    api.remove_link(
        person_a_identifier.entity_id(),
        person_b_identifier.entity_id(),
        link_type_id.clone(),
    )
    .await
    .expect("could not remove link");

    let _ = api
        .get_link_target(person_a_identifier.entity_id(), link_type_id)
        .await
        .expect_err("found link that should have been deleted");
}

#[tokio::test]
async fn ordered_links() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");
    let person_c = serde_json::from_str(entity::PERSON_C_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::NAME_V1],
            [link_type::FRIEND_OF_V1],
            [entity_type::PERSON_V1],
        )
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let friend_link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/link-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_a_identifier = person_a_metadata.identifier();

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_identifier = person_b_metadata.identifier();

    let person_c_metadata = api
        .create_entity(person_c, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_c_identifier = person_c_metadata.identifier();

    let _a_b_link = api
        .create_ordered_link(
            person_a_identifier.entity_id(),
            person_b_identifier.entity_id(),
            friend_link_type_id.clone(),
            2,
        )
        .await
        .expect("could not create link");

    let _a_c_link = api
        .create_ordered_link(
            person_a_identifier.entity_id(),
            person_c_identifier.entity_id(),
            friend_link_type_id.clone(),
            1,
        )
        .await
        .expect("could not create link");

    let links_from_source = api
        .get_entity_links(person_a_identifier.entity_id())
        .await
        .expect("could not fetch link");

    assert_eq!(
        [
            person_c_identifier.entity_id(),
            person_b_identifier.entity_id(),
        ][..],
        links_from_source
            .iter()
            .map(|link| link.inner().target_entity())
            .collect::<Vec<_>>()[..]
    )
}
