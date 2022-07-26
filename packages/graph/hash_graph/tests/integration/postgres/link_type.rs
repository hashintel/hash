use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let owns_lt = serde_json::from_str(crate::test_data::link_type::OWNS_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("Could not seed database");

    api.create_link_type(owns_lt)
        .await
        .expect("could not create link type");
}

#[tokio::test]
async fn query() {
    let submitted_by_lt = serde_json::from_str(crate::test_data::link_type::SUBMITTED_BY_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("Could not seed database");

    let created_link_type = api
        .create_link_type(submitted_by_lt)
        .await
        .expect("could not create link type");

    let link_type = api
        .get_link_type(created_link_type.version_id())
        .await
        .expect("could not query link type");

    assert_eq!(link_type.inner(), created_link_type.inner());
}

#[tokio::test]
async fn update() {
    let owns_lt_v1 = serde_json::from_str(crate::test_data::link_type::OWNS_V1)
        .expect("could not parse link type");
    let owns_lt_v2 = serde_json::from_str(crate::test_data::link_type::OWNS_V2)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("Could not seed database");

    let created_link_type = api
        .create_link_type(owns_lt_v1)
        .await
        .expect("could not create link type");

    let updated_link_type = api
        .update_link_type(owns_lt_v2)
        .await
        .expect("could not update link type");

    assert_ne!(created_link_type.inner(), updated_link_type.inner());
    assert_ne!(
        created_link_type.version_id(),
        updated_link_type.version_id()
    );
}
