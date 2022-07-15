use crate::postgres::Database;

#[test]
fn insert() {
    let age_pt = serde_json::from_str(crate::test_data::property_type::AGE_V1)
        .expect("could not parse property type");

    let mut database = Database::new();
    database
        .create_property_type(age_pt)
        .expect("could not create property type");
}

#[test]
fn query() {
    let interests_pt = serde_json::from_str(crate::test_data::property_type::INTERESTS_V1)
        .expect("could not parse property type");

    let mut database = Database::new();

    let created_property_type = database
        .create_property_type(interests_pt)
        .expect("could not create property type");

    let property_type = database
        .get_property_type(created_property_type.version_id())
        .expect("could not query property type");

    assert_eq!(property_type.inner(), created_property_type.inner());
}

#[test]
fn update() {
    let contact_info_pt_v1 =
        serde_json::from_str(crate::test_data::property_type::CONTACT_INFORMATION_V1)
            .expect("could not parse property type");
    let contact_info_pt_v2 =
        serde_json::from_str(crate::test_data::property_type::CONTACT_INFORMATION_V2)
            .expect("could not parse property type");

    let mut database = Database::new();

    let created_property_type = database
        .create_property_type(contact_info_pt_v1)
        .expect("could not create property type");

    let updated_property_type = database
        .update_property_type(contact_info_pt_v2)
        .expect("could not update property type");

    assert_ne!(created_property_type.inner(), updated_property_type.inner());
    assert_ne!(
        created_property_type.version_id(),
        updated_property_type.version_id()
    );
}
