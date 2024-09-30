#![cfg(test)]

use core::str::FromStr as _;
use std::collections::HashMap;

use graph_types::knowledge::property::{PropertyMetadata, PropertyProvenance, ValueMetadata};
use serde_json::json;
use type_system::url::VersionedUrl;

use crate::{ValidateEntityComponents, tests::validate_property};

#[tokio::test]
async fn address_line_1() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("123 Fake Street"),
        None,
        graph_test_data::property_type::ADDRESS_LINE_1_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn age() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::NUMBER_V1];

    validate_property(
        json!(42),
        None,
        graph_test_data::property_type::AGE_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn blurb() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("blurb"),
        None,
        graph_test_data::property_type::BLURB_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn city() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("Bielefeld"),
        None,
        graph_test_data::property_type::CITY_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn contact_information() {
    let property_types = [
        graph_test_data::property_type::EMAIL_V1,
        graph_test_data::property_type::PHONE_NUMBER_V1,
    ];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json! ({
            "https://blockprotocol.org/@alice/types/property-type/email/": "alice@example",
            "https://blockprotocol.org/@alice/types/property-type/phone-number/": "+0123456789",
        }),
        None,
        graph_test_data::property_type::CONTACT_INFORMATION_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn contrived_information() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::NUMBER_V1];

    validate_property(
        json!([12, 34, 56, 78]),
        None,
        graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");

    validate_property(
        json!(12_34_56_78),
        None,
        graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");

    _ = validate_property(
        json!([10, 20, 30, 40, 50]),
        None,
        graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect_err("validation succeeded");
}

#[tokio::test]
async fn email() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("alice@example.com"),
        None,
        graph_test_data::property_type::EMAIL_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn favorite_film() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("Teletubbies"),
        None,
        graph_test_data::property_type::FAVORITE_FILM_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn favorite_quote() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("hold my beer"),
        None,
        graph_test_data::property_type::FAVORITE_QUOTE_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn favorite_song() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("Never gonna give you up"),
        None,
        graph_test_data::property_type::FAVORITE_SONG_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn favorite_hobby() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("Programming in Rust"),
        None,
        graph_test_data::property_type::HOBBY_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn numbers() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::NUMBER_V1];

    validate_property(
        json!([1, 2, 3, 4, 5]),
        None,
        graph_test_data::property_type::NUMBERS_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn phone_number() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("+0123456789"),
        None,
        graph_test_data::property_type::PHONE_NUMBER_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn postcode() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("12345"),
        None,
        graph_test_data::property_type::POSTCODE_NUMBER_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn published_on() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("2021-01-01T00:00:00Z"),
        None,
        graph_test_data::property_type::PUBLISHED_ON_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn text() {
    let property_types = [];
    let data_types = [graph_test_data::data_type::TEXT_V1];

    validate_property(
        json!("lorem ipsum"),
        None,
        graph_test_data::property_type::TEXT_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}

#[tokio::test]
async fn user_id() {
    let property_types = [];
    let data_types = [
        graph_test_data::data_type::TEXT_V1,
        graph_test_data::data_type::NUMBER_V1,
    ];

    validate_property(
        json!("1"),
        None,
        graph_test_data::property_type::USER_ID_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");

    _ = validate_property(
        json!(1),
        None,
        graph_test_data::property_type::USER_ID_V1,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect_err("validation succeeded");

    let text_data_type_id =
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1")
            .expect("invalid data type ID");

    validate_property(
        json!("1"),
        Some(PropertyMetadata::Value {
            metadata: ValueMetadata {
                provenance: PropertyProvenance::default(),
                confidence: None,
                data_type_id: Some(text_data_type_id.clone()),
                original_data_type_id: Some(text_data_type_id),
                canonical: HashMap::default(),
            },
        }),
        graph_test_data::property_type::USER_ID_V2,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");

    let number_data_type_id = VersionedUrl::from_str(
        "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    )
    .expect("invalid data type ID");

    validate_property(
        json!(1),
        Some(PropertyMetadata::Value {
            metadata: ValueMetadata {
                provenance: PropertyProvenance::default(),
                confidence: None,
                data_type_id: Some(number_data_type_id.clone()),
                original_data_type_id: Some(number_data_type_id),
                canonical: HashMap::default(),
            },
        }),
        graph_test_data::property_type::USER_ID_V2,
        property_types,
        data_types,
        ValidateEntityComponents::full(),
    )
    .await
    .expect("validation failed");
}
