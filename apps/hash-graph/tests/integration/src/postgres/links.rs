use graph::knowledge::{EntityLinkOrder, EntityProperties};
use graph_test_data::{data_type, entity, entity_type, property_type};
use type_system::uri::{BaseUri, VersionedUri};

use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");
    let friend_of = EntityProperties::empty();

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::PERSON_V1,
        ])
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let friend_of_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    api.create_link_entity(
        friend_of,
        friend_of_type_id.clone(),
        None,
        person_a_metadata.record_id().entity_id(),
        person_b_metadata.record_id().entity_id(),
    )
    .await
    .expect("could not create link");

    let link_entity = api
        .get_link_entity_target(person_a_metadata.record_id().entity_id(), friend_of_type_id)
        .await
        .expect("could not fetch entity");
    let link_data = link_entity.link_data().expect("entity is not a link");

    assert_eq!(
        link_data.left_entity_id(),
        person_a_metadata.record_id().entity_id()
    );
    assert_eq!(
        link_data.right_entity_id(),
        person_b_metadata.record_id().entity_id()
    );
}

#[tokio::test]
async fn get_entity_links() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");
    let person_c = serde_json::from_str(entity::PERSON_C_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::link::ACQUAINTANCE_OF_V1,
            entity_type::PERSON_V1,
        ])
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let friend_link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let acquaintance_entity_link_type_id = VersionedUri::new(
        BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_c_metadata = api
        .create_entity(person_c, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    api.create_link_entity(
        EntityProperties::empty(),
        friend_link_type_id.clone(),
        None,
        person_a_metadata.record_id().entity_id(),
        person_b_metadata.record_id().entity_id(),
    )
    .await
    .expect("could not create link");

    api.create_link_entity(
        EntityProperties::empty(),
        acquaintance_entity_link_type_id.clone(),
        None,
        person_a_metadata.record_id().entity_id(),
        person_c_metadata.record_id().entity_id(),
    )
    .await
    .expect("could not create link");

    let links_from_source = api
        .get_latest_entity_links(person_a_metadata.record_id().entity_id())
        .await
        .expect("could not fetch link");

    assert!(
        links_from_source
            .iter()
            .find(|link_entity| link_entity.metadata().entity_type_id() == &friend_link_type_id)
            .is_some()
    );
    assert!(
        links_from_source
            .iter()
            .find(|link_entity| link_entity.metadata().entity_type_id()
                == &acquaintance_entity_link_type_id)
            .is_some()
    );

    let link_datas = links_from_source
        .iter()
        .map(|entity| entity.link_data().expect("entity is not a link"))
        .collect::<Vec<_>>();
    assert!(
        link_datas
            .iter()
            .find(
                |link_data| link_data.left_entity_id() == person_a_metadata.record_id().entity_id()
            )
            .is_some()
    );
    assert!(
        link_datas
            .iter()
            .find(|link_data| link_data.right_entity_id()
                == person_b_metadata.record_id().entity_id())
            .is_some()
    );
    assert!(
        link_datas
            .iter()
            .find(|link_data| link_data.right_entity_id()
                == person_c_metadata.record_id().entity_id())
            .is_some()
    );
}

#[tokio::test]
async fn remove_link() {
    let person_a = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_b = serde_json::from_str(entity::PERSON_B_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::PERSON_V1,
        ])
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let friend_link_type_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    let person_a_metadata = api
        .create_entity(person_a, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let person_b_metadata = api
        .create_entity(person_b, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let link_entity_metadata = api
        .create_link_entity(
            EntityProperties::empty(),
            friend_link_type_id.clone(),
            None,
            person_a_metadata.record_id().entity_id(),
            person_b_metadata.record_id().entity_id(),
        )
        .await
        .expect("could not create link");

    assert!(
        !api.get_latest_entity_links(person_a_metadata.record_id().entity_id())
            .await
            .expect("could not fetch links")
            .is_empty()
    );

    api.archive_entity(
        link_entity_metadata.record_id().entity_id(),
        EntityProperties::empty(),
        friend_link_type_id,
        EntityLinkOrder::new(None, None),
    )
    .await
    .expect("could not remove link");

    assert!(
        api.get_latest_entity_links(person_a_metadata.record_id().entity_id())
            .await
            .expect("could not fetch links")
            .is_empty()
    );
}
