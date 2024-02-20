pub(crate) mod error;
pub(in crate::ontology) mod raw;

use crate::{url::BaseUrl, ValidateUrl, ValidationError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Array<T> {
    items: T,
    min_items: Option<usize>,
    max_items: Option<usize>,
}

impl<T> Array<T> {
    #[must_use]
    pub const fn new(items: T, min_items: Option<usize>, max_items: Option<usize>) -> Self {
        Self {
            items,
            min_items,
            max_items,
        }
    }

    #[must_use]
    pub const fn items(&self) -> &T {
        &self.items
    }

    #[must_use]
    pub const fn min_items(&self) -> Option<usize> {
        self.min_items
    }

    #[must_use]
    pub const fn max_items(&self) -> Option<usize> {
        self.max_items
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(Array<T>),
}

impl<T: ValidateUrl> ValidateUrl for ValueOrArray<T> {
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError> {
        match self {
            Self::Value(value) => value.validate_url(base_url),
            Self::Array(array) => array.items().validate_url(base_url),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{raw, url::VersionedUrl, PropertyTypeReference};

    fn get_test_value_or_array(url: &VersionedUrl) -> ValueOrArray<PropertyTypeReference> {
        let json_repr = json!({
            "type": "array",
            "items": {
                "$ref": url.to_string()
            },
            "minItems": 10,
            "maxItems": 20,
        });
        let array_repr: raw::ValueOrArray<raw::PropertyTypeReference> =
            serde_json::from_value(json_repr).expect("failed to deserialize ValueOrArray");

        array_repr.try_into().expect("failed to convert array repr")
    }

    #[test]
    fn valid_url() {
        let url =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/age/v/2")
                .expect("failed to parse VersionedUrl");
        let array = get_test_value_or_array(&url);

        array
            .validate_url(&url.base_url)
            .expect("failed to validate against base URL");
    }

    #[test]
    fn invalid_url() {
        let url_a =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/age/v/2")
                .expect("failed to parse VersionedUrl");
        let url_b =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/name/v/1")
                .expect("failed to parse VersionedUrl");

        let array = get_test_value_or_array(&url_a);

        array
            .validate_url(&url_b.base_url)
            .expect_err("expected validation against base URL to fail but it didn't");
    }
}
