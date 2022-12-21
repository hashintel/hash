use graph::ontology::OntologyTypeWithMetadata;
use graph_test_data::{data_type, property_type};
use type_system::{repr, PropertyType};

use crate::postgres::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let age_pt_repr: repr::PropertyType = serde_json::from_str(property_type::AGE_V1)
        .expect("could not parse property type representation");
    let age_pt = PropertyType::try_from(age_pt_repr).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::NUMBER_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(age_pt)
        .await
        .expect("could not create property type");
}

#[tokio::test]
async fn query() {
    let favorite_quote_pt_repr: repr::PropertyType =
        serde_json::from_str(property_type::FAVORITE_QUOTE_V1)
            .expect("could not parse property type representation");
    let favorite_quote_pt =
        PropertyType::try_from(favorite_quote_pt_repr).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(favorite_quote_pt.clone())
        .await
        .expect("could not create property type");

    let property_type = api
        .get_property_type(favorite_quote_pt.id())
        .await
        .expect("could not get property type");

    assert_eq!(property_type.inner(), &favorite_quote_pt);
}

#[tokio::test]
async fn update() {
    let user_id_pt_v1_repr: repr::PropertyType = serde_json::from_str(property_type::USER_ID_V1)
        .expect("could not parse property type representation");
    let user_id_pt_v1 =
        PropertyType::try_from(user_id_pt_v1_repr).expect("could not parse property type");

    let user_id_pt_v2_repr: repr::PropertyType = serde_json::from_str(property_type::USER_ID_V2)
        .expect("could not parse property type representation");
    let user_id_pt_v2 =
        PropertyType::try_from(user_id_pt_v2_repr).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::NUMBER_V1, data_type::TEXT_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(user_id_pt_v1.clone())
        .await
        .expect("could not create property type");

    api.update_property_type(user_id_pt_v2.clone())
        .await
        .expect("could not update property type");

    let returned_user_id_pt_v1 = api
        .get_property_type(user_id_pt_v1.id())
        .await
        .expect("could not get property type");

    let returned_user_id_pt_v2 = api
        .get_property_type(user_id_pt_v2.id())
        .await
        .expect("could not get property type");

    // TODO: we probably want to be testing more interesting queries, checking an update should
    //  probably use getLatestVersion
    //  https://app.asana.com/0/0/1202884883200974/f
    assert_eq!(&user_id_pt_v1, returned_user_id_pt_v1.inner());
    assert_eq!(&user_id_pt_v2, returned_user_id_pt_v2.inner());
}
