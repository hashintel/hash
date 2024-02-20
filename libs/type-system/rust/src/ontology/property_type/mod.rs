use std::{collections::HashSet, ptr};

pub use error::ParsePropertyTypeError;
use serde::{Deserialize, Serialize};

use crate::{
    url::{BaseUrl, VersionedUrl},
    Array, DataTypeReference, Object, OneOf, ValidateUrl, ValidationError, ValueOrArray,
};

mod error;
pub(in crate::ontology) mod raw;
#[cfg(target_arch = "wasm32")]
mod wasm;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "raw::PropertyType", into = "raw::PropertyType")]
pub struct PropertyType {
    id: VersionedUrl,
    title: String,
    description: Option<String>,
    one_of: OneOf<PropertyValues>,
}

impl PropertyType {
    /// Creates a new `PropertyType`.
    #[must_use]
    pub const fn new(
        id: VersionedUrl,
        title: String,
        description: Option<String>,
        one_of: OneOf<PropertyValues>,
    ) -> Self {
        Self {
            id,
            title,
            description,
            one_of,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUrl {
        &self.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[must_use]
    pub fn one_of(&self) -> &[PropertyValues] {
        self.one_of.one_of()
    }

    #[must_use]
    pub fn data_type_references(&self) -> HashSet<&DataTypeReference> {
        self.one_of
            .one_of()
            .iter()
            .flat_map(|value| value.data_type_references().into_iter())
            .collect()
    }

    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.one_of
            .one_of()
            .iter()
            .flat_map(|value| value.property_type_references().into_iter())
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct PropertyTypeReference {
    url: VersionedUrl,
}

impl PropertyTypeReference {
    /// Creates a new `PropertyTypeReference` from the given [`VersionedUrl`].
    #[must_use]
    pub const fn new(url: VersionedUrl) -> Self {
        Self { url }
    }

    #[must_use]
    pub const fn url(&self) -> &VersionedUrl {
        &self.url
    }
}

impl From<&VersionedUrl> for &PropertyTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<PropertyTypeReference>() }
    }
}

impl ValidateUrl for PropertyTypeReference {
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError> {
        if base_url == &self.url().base_url {
            Ok(())
        } else {
            Err(ValidationError::BaseUrlMismatch {
                base_url: base_url.clone(),
                versioned_url: self.url().clone(),
            })
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyValues {
    DataTypeReference(DataTypeReference),
    PropertyTypeObject(Object<ValueOrArray<PropertyTypeReference>, 1>),
    ArrayOfPropertyValues(Array<OneOf<PropertyValues>>),
}

impl PropertyValues {
    #[must_use]
    fn data_type_references(&self) -> Vec<&DataTypeReference> {
        match self {
            Self::DataTypeReference(reference) => vec![reference],
            Self::ArrayOfPropertyValues(values) => values
                .items()
                .one_of()
                .iter()
                .flat_map(|value| value.data_type_references().into_iter())
                .collect(),
            Self::PropertyTypeObject(_) => vec![],
        }
    }

    #[must_use]
    fn property_type_references(&self) -> Vec<&PropertyTypeReference> {
        match self {
            Self::DataTypeReference(_) => vec![],
            Self::ArrayOfPropertyValues(values) => values
                .items()
                .one_of()
                .iter()
                .flat_map(|value| value.property_type_references().into_iter())
                .collect(),
            Self::PropertyTypeObject(object) => object
                .properties()
                .values()
                .map(|value| match value {
                    ValueOrArray::Value(one) => one,
                    ValueOrArray::Array(array) => array.items(),
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{
        url::ParseVersionedUrlError,
        utils::tests::{check_serialization_from_str, ensure_failed_validation},
        ParseOneOfError,
    };

    fn test_property_type_data_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_data_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let data_type_references = property_type
            .data_type_references()
            .into_iter()
            .map(DataTypeReference::url)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(data_type_references, expected_data_type_references);
    }

    fn test_property_type_property_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let property_type_references = property_type
            .property_type_references()
            .into_iter()
            .map(PropertyTypeReference::url)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(property_type_references, expected_property_type_references);
    }

    #[test]
    fn favorite_quote() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::FAVORITE_QUOTE_V1,
            None,
        );

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn age() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::AGE_V1,
            None,
        );

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn user_id() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::USER_ID_V2,
            None,
        );

        test_property_type_data_refs(
            &property_type,
            [
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            ],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn contact_information() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::CONTACT_INFORMATION_V1,
            None,
        );

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/email/v/1",
                "https://blockprotocol.org/@alice/types/property-type/phone-number/v/1",
            ],
        );
    }

    #[test]
    fn interests() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::INTERESTS_V1,
            None,
        );

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/favorite-film/v/1",
                "https://blockprotocol.org/@alice/types/property-type/favorite-song/v/1",
                "https://blockprotocol.org/@alice/types/property-type/hobby/v/1",
            ],
        );
    }

    #[test]
    fn numbers() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::NUMBERS_V1,
            None,
        );

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn contrived_property() {
        let property_type = check_serialization_from_str::<PropertyType, raw::PropertyType>(
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            None,
        );

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn invalid_metaschema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";
        ensure_failed_validation::<raw::PropertyType, PropertyType>(
            &json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            ParsePropertyTypeError::InvalidMetaSchema(invalid_schema_url.to_owned()),
        );
    }

    #[test]
    fn invalid_id() {
        ensure_failed_validation::<raw::PropertyType, PropertyType>(
            &json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/",
                  "title": "Age",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            ParsePropertyTypeError::InvalidVersionedUrl(ParseVersionedUrlError::MissingVersion),
        );
    }

    #[test]
    fn empty_one_of() {
        ensure_failed_validation::<raw::PropertyType, PropertyType>(
            &json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "oneOf": []
                }
            ),
            ParsePropertyTypeError::InvalidOneOf(Box::new(ParseOneOfError::ValidationError(
                ValidationError::EmptyOneOf,
            ))),
        );
    }

    #[test]
    fn invalid_reference() {
        ensure_failed_validation::<raw::PropertyType, PropertyType>(
            &json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number"
                    }
                  ]
                }
            ),
            ParsePropertyTypeError::InvalidOneOf(Box::new(ParseOneOfError::PropertyValuesError(
                ParsePropertyTypeError::InvalidDataTypeReference(
                    ParseVersionedUrlError::IncorrectFormatting,
                ),
            ))),
        );
    }

    #[test]
    fn validate_property_type_ref_valid() {
        let url = VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        )
        .expect("failed to create VersionedUrl");

        let property_type_ref = PropertyTypeReference::new(url.clone());

        property_type_ref
            .validate_url(&url.base_url)
            .expect("failed to validate against base URL");
    }

    #[test]
    fn validate_property_type_ref_invalid() {
        let url_a =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/age/v/2")
                .expect("failed to parse VersionedUrl");
        let url_b =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/name/v/1")
                .expect("failed to parse VersionedUrl");

        let property_type_ref = PropertyTypeReference::new(url_a);

        property_type_ref
            .validate_url(&url_b.base_url)
            .expect_err("expected validation against base URL to fail but it didn't");
    }
}
