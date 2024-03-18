use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::knowledge::entity::EntityProperties;
use pretty_assertions::assert_eq;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
                data_type::OBJECT_V2,
            ],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    }
}

fn alice() -> EntityProperties {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

fn bob() -> EntityProperties {
    serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity")
}

#[tokio::test]
async fn properties() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(alice(), vec![person_entity_type_id()], None, false)
        .await
        .expect("could not create entity");
}
