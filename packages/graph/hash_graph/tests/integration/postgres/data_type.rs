use crate::postgres::DatabaseTestWrapper;

#[test]
fn insert() {
    let boolean_dt = serde_json::from_str(crate::test_data::data_type::BOOLEAN_V1)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new();
    database
        .create_data_type(boolean_dt)
        .expect("could not create data type");
}

#[test]
fn query() {
    let empty_list_dt = serde_json::from_str(crate::test_data::data_type::EMPTY_LIST_V1)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new();

    let created_data_type = database
        .create_data_type(empty_list_dt)
        .expect("could not create data type");

    let data_type = database
        .get_data_type(*created_data_type.version_id())
        .expect("could not query data type");

    assert_eq!(data_type.inner(), created_data_type.inner());
}

#[test]
fn update() {
    let object_dt_v1 = serde_json::from_str(crate::test_data::data_type::OBJECT_V1)
        .expect("could not parse data type");
    let object_dt_v2 = serde_json::from_str(crate::test_data::data_type::OBJECT_V2)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new();

    let created_data_type = database
        .create_data_type(object_dt_v1)
        .expect("could not create data type");

    let updated_data_type = database
        .update_data_type(object_dt_v2)
        .expect("could not update data type");

    assert_ne!(created_data_type.inner(), updated_data_type.inner());
    assert_ne!(
        created_data_type.version_id(),
        updated_data_type.version_id()
    );
}
