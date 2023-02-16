use graph::knowledge::{EntityLinkOrder, EntityProperties};
use graph_test_data::{data_type, entity, entity_type, property_type};
use type_system::uri::{BaseUri, VersionedUri};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
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

    let person_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let alice_metadata = api
        .create_entity(alice, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let bob_metadata = api
        .create_entity(bob, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let friend_of_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    api.create_link_entity(
        friend_of,
        friend_of_type_id.clone(),
        None,
        alice_metadata.record_id.entity_id,
        bob_metadata.record_id.entity_id,
    )
    .await
    .expect("could not create link");

    let link_entity = api
        .get_link_entity_target(alice_metadata.record_id.entity_id, friend_of_type_id)
        .await
        .expect("could not fetch entity");
    let link_data = link_entity.link_data.expect("entity is not a link");

    assert_eq!(
        link_data.left_entity_id(),
        alice_metadata.record_id.entity_id
    );
    assert_eq!(
        link_data.right_entity_id(),
        bob_metadata.record_id.entity_id
    );
}

#[tokio::test]
async fn get_entity_links() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
    let charles = serde_json::from_str(entity::PERSON_CHARLES_V1).expect("could not parse entity");

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

    let person_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let friend_link_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let acquaintance_entity_link_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/acquaintance-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let alice_metadata = api
        .create_entity(alice, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let bob_metadata = api
        .create_entity(bob, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let charles_metadata = api
        .create_entity(charles, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    api.create_link_entity(
        EntityProperties::empty(),
        friend_link_type_id.clone(),
        None,
        alice_metadata.record_id.entity_id,
        bob_metadata.record_id.entity_id,
    )
    .await
    .expect("could not create link");

    api.create_link_entity(
        EntityProperties::empty(),
        acquaintance_entity_link_type_id.clone(),
        None,
        alice_metadata.record_id.entity_id,
        charles_metadata.record_id.entity_id,
    )
    .await
    .expect("could not create link");

    let links_from_source = api
        .get_latest_entity_links(alice_metadata.record_id.entity_id)
        .await
        .expect("could not fetch link");

    assert!(
        links_from_source
            .iter()
            .any(|link_entity| { link_entity.metadata.entity_type_id == friend_link_type_id })
    );
    assert!(links_from_source.iter().any(|link_entity| {
        link_entity.metadata.entity_type_id == acquaintance_entity_link_type_id
    }));

    let link_datas = links_from_source
        .iter()
        .map(|entity| entity.link_data.expect("entity is not a link"))
        .collect::<Vec<_>>();
    assert!(
        link_datas
            .iter()
            .any(|link_data| link_data.left_entity_id() == alice_metadata.record_id.entity_id)
    );
    assert!(
        link_datas
            .iter()
            .any(|link_data| link_data.right_entity_id() == bob_metadata.record_id.entity_id)
    );
    assert!(
        link_datas
            .iter()
            .any(|link_data| link_data.right_entity_id() == charles_metadata.record_id.entity_id)
    );
}

#[tokio::test]
async fn remove_link() {
    let alice = serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob = serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::PERSON_V1,
        ])
        .await
        .expect("could not seed database");

    let person_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let friend_link_type_id = VersionedUri {
        base_uri: BaseUri::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("couldn't construct Base URI"),
        version: 1,
    };

    let alice_metadata = api
        .create_entity(alice, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let bob_metadata = api
        .create_entity(bob, person_type_id.clone(), None)
        .await
        .expect("could not create entity");

    let link_entity_metadata = api
        .create_link_entity(
            EntityProperties::empty(),
            friend_link_type_id.clone(),
            None,
            alice_metadata.record_id.entity_id,
            bob_metadata.record_id.entity_id,
        )
        .await
        .expect("could not create link");

    assert!(
        !api.get_latest_entity_links(alice_metadata.record_id.entity_id)
            .await
            .expect("could not fetch links")
            .is_empty()
    );

    api.archive_entity(
        link_entity_metadata.record_id.entity_id,
        EntityProperties::empty(),
        friend_link_type_id,
        EntityLinkOrder::new(None, None),
    )
    .await
    .expect("could not remove link");

    assert!(
        api.get_latest_entity_links(alice_metadata.record_id.entity_id)
            .await
            .expect("could not fetch links")
            .is_empty()
    );
}
