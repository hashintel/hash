use std::{collections::HashMap, fmt::Debug};

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{raw, url::BaseUrl, ParsePropertyTypeObjectError, PropertyTypeReference, ValueOrArray};

/// Will serialize as a constant value `"object"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ObjectTypeTag {
    Object,
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Object<T> {
    #[cfg_attr(target_arch = "wasm32", tsify(type = "'object'"))]
    r#type: ObjectTypeTag,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Record<BaseUrl, T>"))]
    pub properties: HashMap<String, T>,
    #[cfg_attr(target_arch = "wasm32", tsify(optional, type = "BaseUrl[]"))]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required: Vec<String>,
}

impl<const MIN: usize> TryFrom<Object<raw::ValueOrArray<raw::PropertyTypeReference>>>
    for super::Object<ValueOrArray<PropertyTypeReference>, MIN>
{
    type Error = ParsePropertyTypeObjectError;

    fn try_from(
        object_repr: Object<raw::ValueOrArray<raw::PropertyTypeReference>>,
    ) -> Result<Self, Self::Error> {
        let properties = object_repr
            .properties
            .into_iter()
            .map(|(base_url, val)| {
                Ok((
                    BaseUrl::new(base_url)
                        .map_err(ParsePropertyTypeObjectError::InvalidPropertyKey)?,
                    val.try_into()?,
                ))
            })
            .collect::<Result<HashMap<_, _>, Self::Error>>()?;

        let required = object_repr
            .required
            .into_iter()
            .map(|base_url| {
                BaseUrl::new(base_url).map_err(ParsePropertyTypeObjectError::InvalidRequiredKey)
            })
            .collect::<Result<Vec<_>, Self::Error>>()?;

        Self::new(properties, required).map_err(ParsePropertyTypeObjectError::ValidationError)
    }
}

impl<T, R, const MIN: usize> From<super::Object<T, MIN>> for Object<R>
where
    R: From<T>,
{
    fn from(object: super::Object<T, MIN>) -> Self {
        let properties = object
            .properties
            .into_iter()
            .map(|(url, val)| (url.to_string(), val.into()))
            .collect();
        let required = object
            .required
            .into_iter()
            .map(|url| url.to_string())
            .collect();
        Self {
            r#type: ObjectTypeTag::Object,
            properties,
            required,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{
        raw::PropertyTypeReference,
        url::VersionedUrl,
        utils::tests::{check_repr_serialization_from_value, ensure_repr_failed_deserialization},
    };

    mod unconstrained {
        use super::*;

        type Object = super::Object<PropertyTypeReference>;

        #[test]
        fn empty() {
            check_repr_serialization_from_value(
                json!({
                    "type": "object",
                    "properties": {}
                }),
                Some(Object {
                    r#type: ObjectTypeTag::Object,
                    properties: HashMap::new(),
                    required: vec![],
                }),
            );
        }

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
                Some(Object {
                    r#type: ObjectTypeTag::Object,
                    properties: HashMap::from([(
                        url.base_url.to_string(),
                        PropertyTypeReference::new(url.to_string()),
                    )]),
                    required: vec![],
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
                Some(Object {
                    r#type: ObjectTypeTag::Object,
                    properties: HashMap::from([
                        (
                            url_a.base_url.to_string(),
                            PropertyTypeReference::new(url_a.to_string()),
                        ),
                        (
                            url_b.base_url.to_string(),
                            PropertyTypeReference::new(url_b.to_string()),
                        ),
                    ]),
                    required: vec![],
                }),
            );
        }
    }

    mod constrained {
        use super::*;

        type Object = super::Object<PropertyTypeReference>;

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
                Some(Object {
                    r#type: ObjectTypeTag::Object,
                    properties: HashMap::from([(
                        url.base_url.to_string(),
                        PropertyTypeReference::new(url.to_string()),
                    )]),
                    required: vec![],
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
                Some(Object {
                    r#type: ObjectTypeTag::Object,
                    properties: HashMap::from([
                        (
                            url_a.base_url.to_string(),
                            PropertyTypeReference::new(url_a.to_string()),
                        ),
                        (
                            url_b.base_url.to_string(),
                            PropertyTypeReference::new(url_b.to_string()),
                        ),
                    ]),
                    required: vec![],
                }),
            );
        }
    }

    #[test]
    fn required() {
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
                },
                "required": [
                    "https://example.com/property_type_a/"
                ]
            }),
            Some(Object {
                r#type: ObjectTypeTag::Object,
                properties: HashMap::from([
                    (
                        url_a.base_url.to_string(),
                        PropertyTypeReference::new(url_a.to_string()),
                    ),
                    (
                        url_b.base_url.to_string(),
                        PropertyTypeReference::new(url_b.to_string()),
                    ),
                ]),
                required: vec![url_a.base_url.to_string()],
            }),
        );
    }

    #[test]
    fn additional_properties() {
        ensure_repr_failed_deserialization::<Object<PropertyTypeReference>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_a/v/1" },
                "https://example.com/property_type_b/": { "$ref": "https://example.com/property_type_b/v/1" },
            },
            "additional_properties": 10
        }));
    }
}
