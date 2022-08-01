use crate::{
    postgres::DatabaseTestWrapper,
    test_data::{data_type, property_type},
};

#[tokio::test]
async fn insert() {
    let age_pt =
        serde_json::from_str(property_type::AGE_V1).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::NUMBER_V1], [], [], [])
        .await
        .expect("Could not seed database");

    api.create_property_type(&age_pt)
        .await
        .expect("could not create property type");
}

#[tokio::test]
async fn query() {
    let favorite_quote_pt = serde_json::from_str(property_type::FAVORITE_QUOTE_V1)
        .expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [], [], [])
        .await
        .expect("Could not seed database");

    api.create_property_type(&favorite_quote_pt)
        .await
        .expect("could not create property type");

    let property_type = api
        .get_property_type(favorite_quote_pt.id())
        .await
        .expect("could not get property type");

    assert_eq!(property_type, favorite_quote_pt);
}

#[tokio::test]
async fn update() {
    let user_id_pt_v1 =
        serde_json::from_str(property_type::USER_ID_V1).expect("could not parse property type");
    let user_id_pt_v2 =
        serde_json::from_str(property_type::USER_ID_V2).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::NUMBER_V1, data_type::TEXT_V1], [], [], [])
        .await
        .expect("Could not seed database");

    api.create_property_type(&user_id_pt_v1)
        .await
        .expect("could not create property type");

    api.update_property_type(&user_id_pt_v2)
        .await
        .expect("could not update property type");

    assert_ne!(user_id_pt_v1, user_id_pt_v2);
    assert_ne!(user_id_pt_v1.id(), user_id_pt_v2.id());
}
