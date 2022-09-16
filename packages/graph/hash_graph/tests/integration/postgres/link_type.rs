use std::str::FromStr;

use type_system::LinkType;

use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let owns_lt =
        LinkType::from_str(graph_test_data::link_type::OWNS_V1).expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_link_type(owns_lt)
        .await
        .expect("could not create link type");
}

#[tokio::test]
async fn query() {
    let submitted_by_lt = LinkType::from_str(graph_test_data::link_type::SUBMITTED_BY_V1)
        .expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_link_type(submitted_by_lt.clone())
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
    let owns_lt_v1 =
        LinkType::from_str(graph_test_data::link_type::OWNS_V1).expect("could not parse link type");
    let owns_lt_v2 =
        LinkType::from_str(graph_test_data::link_type::OWNS_V2).expect("could not parse link type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [], [])
        .await
        .expect("could not seed database");

    api.create_link_type(owns_lt_v1.clone())
        .await
        .expect("could not create link type");

    api.update_link_type(owns_lt_v2.clone())
        .await
        .expect("could not update link type");

    let returned_owns_lt_v1 = api
        .get_link_type(owns_lt_v1.id())
        .await
        .expect("could not get property type");

    let returned_owns_lt_v2 = api
        .get_link_type(owns_lt_v2.id())
        .await
        .expect("could not get property type");

    // TODO: we probably want to be testing more interesting queries, checking an update should
    //  probably use getLatestVersion
    //  https://app.asana.com/0/0/1202884883200974/f
    assert_eq!(owns_lt_v1, returned_owns_lt_v1.inner);
    assert_eq!(owns_lt_v2, returned_owns_lt_v2.inner);
}
