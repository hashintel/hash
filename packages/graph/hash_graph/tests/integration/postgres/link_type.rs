use crate::postgres::DatabaseTestWrapper;

#[test]
fn insert() {
    let owns_lt = serde_json::from_str(crate::test_data::link_type::OWNS_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new();
    database
        .create_link_type(owns_lt)
        .expect("could not create link type");
}

#[test]
fn query() {
    let submitted_by_lt = serde_json::from_str(crate::test_data::link_type::SUBMITTED_BY_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new();

    let created_link_type = database
        .create_link_type(submitted_by_lt)
        .expect("could not create link type");

    let link_type = database
        .get_link_type(*created_link_type.version_id())
        .expect("could not query link type");

    assert_eq!(link_type.inner(), created_link_type.inner());
}

#[test]
fn update() {
    let owns_lt_v1 = serde_json::from_str(crate::test_data::link_type::OWNS_V1)
        .expect("could not parse link type");
    let owns_lt_v2 = serde_json::from_str(crate::test_data::link_type::OWNS_V2)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new();

    let created_link_type = database
        .create_link_type(owns_lt_v1)
        .expect("could not create link type");

    let updated_link_type = database
        .update_link_type(owns_lt_v2)
        .expect("could not update link type");

    assert_ne!(created_link_type.inner(), updated_link_type.inner());
    assert_ne!(
        created_link_type.version_id(),
        updated_link_type.version_id()
    );
}
