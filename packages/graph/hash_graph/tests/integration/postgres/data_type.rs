use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let boolean_dt = serde_json::from_str(crate::test_data::data_type::BOOLEAN_V1)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(&boolean_dt)
        .await
        .expect("could not create data type");
}

#[tokio::test]
async fn query() {
    let empty_list_dt = serde_json::from_str(crate::test_data::data_type::EMPTY_LIST_V1)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(&empty_list_dt)
        .await
        .expect("could not create data type");

    let data_type = api
        .get_data_type(empty_list_dt.id())
        .await
        .expect("could not get data type");

    assert_eq!(data_type, empty_list_dt);
}

#[tokio::test]
async fn update() {
    let object_dt_v1 = serde_json::from_str(crate::test_data::data_type::OBJECT_V1)
        .expect("could not parse data type");
    let object_dt_v2 = serde_json::from_str(crate::test_data::data_type::OBJECT_V2)
        .expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(&object_dt_v1)
        .await
        .expect("could not create data type");

    api.update_data_type(&object_dt_v2)
        .await
        .expect("could not update data type");

    assert_ne!(object_dt_v1, object_dt_v2);
    assert_ne!(object_dt_v1.id(), object_dt_v2.id());
}
