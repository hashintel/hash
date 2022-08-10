use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let owns_lt = serde_json::from_str(crate::test_data::link_type::OWNS_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_link_type(&owns_lt)
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
        .expect("could not seed database");

    api.create_link_type(&submitted_by_lt)
        .await
        .expect("could not create link type");

    let link_type = api
        .get_link_type(submitted_by_lt.id())
        .await
        .expect("could not get link type");

    assert_eq!(link_type.inner, submitted_by_lt);
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
        .expect("could not seed database");

    api.create_link_type(&owns_lt_v1)
        .await
        .expect("could not create link type");

    api.update_link_type(&owns_lt_v2)
        .await
        .expect("could not update link type");

    assert_ne!(owns_lt_v1, owns_lt_v2);
    assert_ne!(owns_lt_v1.id(), owns_lt_v2.id());
}
