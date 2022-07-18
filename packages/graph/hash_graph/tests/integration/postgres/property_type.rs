use crate::postgres::DatabaseTestWrapper;
pub use crate::test_data::{data_type, property_type};

#[test]
fn insert() {
    let age_pt =
        serde_json::from_str(property_type::AGE_V1).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::NUMBER_V1], [])
        .expect("Could not seed database");

    database
        .create_property_type(age_pt)
        .expect("could not create property type");
}

#[test]
fn query() {
    let favourite_quote_pt = serde_json::from_str(property_type::FAVOURITE_QUOTE_V1)
        .expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::TEXT_V1], [])
        .expect("Could not seed database");

    let created_property_type = database
        .create_property_type(favourite_quote_pt)
        .expect("could not create property type");

    let property_type = database
        .get_property_type(created_property_type.version_id())
        .expect("could not query property type");

    assert_eq!(property_type.inner(), created_property_type.inner());
}

#[test]
fn update() {
    let user_id_pt_v1 =
        serde_json::from_str(property_type::USER_ID_V1).expect("could not parse property type");
    let user_id_pt_v2 =
        serde_json::from_str(property_type::USER_ID_V2).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new();
    database
        .seed([data_type::NUMBER_V1, data_type::TEXT_V1], [])
        .expect("Could not seed database");

    let created_property_type = database
        .create_property_type(user_id_pt_v1)
        .expect("could not create property type");

    let updated_property_type = database
        .update_property_type(user_id_pt_v2)
        .expect("could not update property type");

    assert_ne!(created_property_type.inner(), updated_property_type.inner());
    assert_ne!(
        created_property_type.version_id(),
        updated_property_type.version_id()
    );
}
