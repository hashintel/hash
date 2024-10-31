mod raw;
mod validation;

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize, Serializer};

pub use self::validation::{ObjectSchemaValidationError, ObjectSchemaValidator};
use crate::{
    schema::{ClosedMultiEntityType, EntityType, PropertyTypeReference, ValueOrArray},
    url::BaseUrl,
};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(from = "raw::PropertyValueObject<T>")]
pub struct PropertyValueObject<T> {
    pub properties: HashMap<BaseUrl, T>,
    pub required: HashSet<BaseUrl>,
}

impl<T> Serialize for PropertyValueObject<T>
where
    for<'a> raw::ObjectSchemaRef<'a, T>: Serialize,
{
    #[inline]
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::ObjectSchemaRef::from(self).serialize(serializer)
    }
}

pub trait PropertyObjectSchema {
    type Value;
    fn properties(&self) -> &HashMap<BaseUrl, Self::Value>;
    fn required(&self) -> &HashSet<BaseUrl>;
}

impl<T> PropertyObjectSchema for PropertyValueObject<T> {
    type Value = T;

    fn properties(&self) -> &HashMap<BaseUrl, Self::Value> {
        &self.properties
    }

    fn required(&self) -> &HashSet<BaseUrl> {
        &self.required
    }
}

impl PropertyObjectSchema for EntityType {
    type Value = ValueOrArray<PropertyTypeReference>;

    fn properties(&self) -> &HashMap<BaseUrl, Self::Value> {
        &self.constraints.properties
    }

    fn required(&self) -> &HashSet<BaseUrl> {
        &self.constraints.required
    }
}

impl PropertyObjectSchema for ClosedMultiEntityType {
    type Value = ValueOrArray<PropertyTypeReference>;

    fn properties(&self) -> &HashMap<BaseUrl, Self::Value> {
        &self.constraints.properties
    }

    fn required(&self) -> &HashSet<BaseUrl> {
        &self.constraints.required
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{
        schema::{PropertyTypeReference, object::validation::ObjectSchemaValidator},
        url::VersionedUrl,
        utils::tests::{
            JsonEqualityCheck, check_repr_serialization_from_value, ensure_failed_deserialization,
            ensure_failed_validation, ensure_validation,
        },
    };

    #[test]
    fn one() {
        let url = VersionedUrl::from_str("https://example.com/property_type/v/1")
            .expect("invalid Versioned URL");

        check_repr_serialization_from_value(
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type/": { "$ref": "https://example.com/property_type/v/1" },
                }
            }),
            Some(PropertyValueObject {
                properties: HashMap::from([(url.base_url.clone(), PropertyTypeReference { url })]),
                required: HashSet::new(),
            }),
        );
    }

    #[test]
    fn multiple() {
        let url_a = VersionedUrl::from_str("https://example.com/property_type_a/v/1")
            .expect("invalid Versioned URL");
        let url_b = VersionedUrl::from_str("https://example.com/property_type_b/v/1")
            .expect("invalid Versioned URL");

        check_repr_serialization_from_value(
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_a/v/1" },
                    "https://example.com/property_type_b/": { "$ref": "https://example.com/property_type_b/v/1" },
                }
            }),
            Some(PropertyValueObject {
                properties: HashMap::from([
                    (url_a.base_url.clone(), PropertyTypeReference { url: url_a }),
                    (url_b.base_url.clone(), PropertyTypeReference { url: url_b }),
                ]),
                required: HashSet::new(),
            }),
        );
    }

    #[tokio::test]
    async fn required() {
        let url_a = VersionedUrl::from_str("https://example.com/property_type_a/v/1")
            .expect("invalid Versioned URL");
        let url_b = VersionedUrl::from_str("https://example.com/property_type_b/v/1")
            .expect("invalid Versioned URL");

        let object_from_json = ensure_validation::<PropertyValueObject<PropertyTypeReference>, _>(
            json!({
                "type": "object",
                "properties": {
                    url_a.base_url.to_string(): { "$ref": url_a },
                    url_b.base_url.to_string(): { "$ref": url_b },
                },
                "required": [
                    url_a.base_url
                ]
            }),
            ObjectSchemaValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        assert_eq!(*object_from_json, PropertyValueObject {
            properties: HashMap::from([
                (url_a.base_url.clone(), PropertyTypeReference {
                    url: url_a.clone()
                },),
                (url_b.base_url.clone(), PropertyTypeReference { url: url_b }),
            ]),
            required: HashSet::from([url_a.base_url]),
        },);
    }

    #[test]
    fn additional_properties() {
        ensure_failed_deserialization::<PropertyValueObject<PropertyTypeReference>>(
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_a/v/1" },
                    "https://example.com/property_type_b/": { "$ref": "https://example.com/property_type_b/v/1" },
                },
                "additional_properties": 10
            }),
            &"unknown field `additional_properties`, expected one of `type`, `properties`, \
              `required`",
        );
    }

    #[tokio::test]
    async fn invalid_required() {
        let url_c = BaseUrl::new("https://example.com/property_type_c/".to_owned())
            .expect("failed to create BaseURI");
        matches!(
            ensure_failed_validation::<PropertyValueObject<PropertyTypeReference>, _>(
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_a/v/1" },
                        "https://example.com/property_type_b/": { "$ref": "https://example.com/property_type_b/v/1" },
                    },
                    "required": [
                        url_c
                    ]
                }),
                ObjectSchemaValidator,
                JsonEqualityCheck::No,
            ).await,
            ObjectSchemaValidationError::InvalidRequiredKey(required) if url_c == required,
        );
    }
}
