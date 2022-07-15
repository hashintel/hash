use crate::postgres::DatabaseTestWrapper;

#[test]
fn insert() {
    let person_et = serde_json::from_str(crate::test_data::entity_type::PERSON_V1)
        .expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();
    database
        .create_entity_type(person_et)
        .expect("could not create entity type");
}

#[test]
fn query() {
    let song_et = serde_json::from_str(crate::test_data::entity_type::SONG_V1)
        .expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();

    let created_entity_type = database
        .create_entity_type(song_et)
        .expect("could not create entity type");

    let entity_type = database
        .get_entity_type(created_entity_type.version_id())
        .expect("could not query entity type");

    assert_eq!(entity_type.inner(), created_entity_type.inner());
}

#[test]
fn update() {
    let book_et_v1 = serde_json::from_str(crate::test_data::entity_type::BOOK_V1)
        .expect("could not parse entity type");
    let book_et_v2 = serde_json::from_str(crate::test_data::entity_type::BOOK_V2)
        .expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new();

    let created_entity_type = database
        .create_entity_type(book_et_v1)
        .expect("could not create entity type");

    let updated_entity_type = database
        .update_entity_type(book_et_v2)
        .expect("could not update entity type");

    assert_ne!(created_entity_type.inner(), updated_entity_type.inner());
    assert_ne!(
        created_entity_type.version_id(),
        updated_entity_type.version_id()
    );
}
