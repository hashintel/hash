use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    raw, EntityTypeReference, OneOfSchema, ParseEntityTypeReferenceArrayError,
    ParseOneOfArrayError, ParsePropertyTypeObjectError, ParsePropertyTypeReferenceArrayError,
    PropertyTypeReference, PropertyValues,
};

/// Will serialize as a constant value `"array"`
#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    #[default]
    Array,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
// TODO: Add `deny_unknown_fields` once `ordered` is removed from the production database
//   see https://linear.app/hash/issue/H-3058/add-deny-unknown-field-to-arrayschema
#[serde(rename_all = "camelCase")]
pub struct ArraySchema<T> {
    r#type: ArrayTypeTag,
    pub items: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_items: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_items: Option<usize>,
}

impl<T> ArraySchema<T> {
    pub const fn new(items: T, min_items: Option<usize>, max_items: Option<usize>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            items,
            min_items,
            max_items,
        }
    }
}

impl TryFrom<ArraySchema<raw::OneOfSchema<raw::PropertyValues>>>
    for super::ArraySchema<OneOfSchema<PropertyValues>>
{
    type Error = ParseOneOfArrayError;

    fn try_from(
        array_repr: ArraySchema<raw::OneOfSchema<raw::PropertyValues>>,
    ) -> Result<Self, Self::Error> {
        Ok(Self {
            items: array_repr
                .items
                .try_into()
                .map_err(ParseOneOfArrayError::InvalidItems)?,
            min_items: array_repr.min_items,
            max_items: array_repr.max_items,
        })
    }
}

impl TryFrom<ArraySchema<raw::PropertyTypeReference>>
    for super::ArraySchema<PropertyTypeReference>
{
    type Error = ParsePropertyTypeReferenceArrayError;

    fn try_from(array_repr: ArraySchema<raw::PropertyTypeReference>) -> Result<Self, Self::Error> {
        Ok(Self {
            items: array_repr
                .items
                .try_into()
                .map_err(ParsePropertyTypeReferenceArrayError::InvalidReference)?,
            min_items: array_repr.min_items,
            max_items: array_repr.max_items,
        })
    }
}

impl TryFrom<ArraySchema<raw::MaybeOneOfEntityTypeReference>>
    for super::ArraySchema<Option<OneOfSchema<EntityTypeReference>>>
{
    type Error = ParseEntityTypeReferenceArrayError;

    fn try_from(
        array_repr: ArraySchema<raw::MaybeOneOfEntityTypeReference>,
    ) -> Result<Self, Self::Error> {
        let items = match array_repr.items.into_inner() {
            None => None,
            Some(one_of) => Some(
                one_of
                    .try_into()
                    .map_err(ParseEntityTypeReferenceArrayError::InvalidReference)?,
            ),
        };

        Ok(Self {
            items,
            min_items: array_repr.min_items,
            max_items: array_repr.max_items,
        })
    }
}

impl<T, R> From<super::ArraySchema<T>> for ArraySchema<R>
where
    R: From<T>,
{
    fn from(array: super::ArraySchema<T>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            items: array.items.into(),
            min_items: array.min_items,
            max_items: array.max_items,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(untagged, deny_unknown_fields)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(ArraySchema<T>),
}

impl TryFrom<ValueOrArray<raw::PropertyTypeReference>>
    for super::ValueOrArray<PropertyTypeReference>
{
    type Error = ParsePropertyTypeObjectError;

    fn try_from(
        value_or_array_repr: ValueOrArray<raw::PropertyTypeReference>,
    ) -> Result<Self, Self::Error> {
        Ok(match value_or_array_repr {
            ValueOrArray::Value(val) => Self::Value(
                val.try_into()
                    .map_err(ParsePropertyTypeObjectError::InvalidPropertyTypeReference)?,
            ),
            ValueOrArray::Array(array) => Self::Array(
                array
                    .try_into()
                    .map_err(ParsePropertyTypeObjectError::InvalidArray)?,
            ),
        })
    }
}

impl<T, R> From<super::ValueOrArray<T>> for ValueOrArray<R>
where
    R: From<T>,
    ArraySchema<R>: From<super::ArraySchema<T>>,
{
    fn from(value_or_array: super::ValueOrArray<T>) -> Self {
        match value_or_array {
            super::ValueOrArray::Value(val) => Self::Value(val.into()),
            super::ValueOrArray::Array(array) => Self::Array(array.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        check_repr_serialization_from_value, ensure_repr_failed_deserialization, StringTypeStruct,
    };

    #[test]
    fn unconstrained() {
        check_repr_serialization_from_value(
            json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
            }),
            Some(ArraySchema {
                r#type: ArrayTypeTag::Array,
                items: StringTypeStruct::default(),
                max_items: None,
                min_items: None,
            }),
        );
    }

    #[test]
    fn constrained() {
        check_repr_serialization_from_value(
            json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "minItems": 10,
                "maxItems": 20,
            }),
            Some(ArraySchema {
                r#type: ArrayTypeTag::Array,
                items: StringTypeStruct::default(),
                min_items: Some(10),
                max_items: Some(20),
            }),
        );
    }

    #[test]
    fn additional_properties() {
        ensure_repr_failed_deserialization::<ArraySchema<StringTypeStruct>>(json!({
            "type": "array",
            "items": {
                "type": "string"
            },
            "minItems": 10,
            "maxItems": 20,
            "additional": 30,
        }));
    }

    mod value_or_array {
        use serde_json::json;

        use super::*;

        #[test]
        fn value() {
            check_repr_serialization_from_value(
                json!("value"),
                Some(ValueOrArray::Value("value".to_owned())),
            );
        }

        #[test]
        fn array() {
            let expected: ArraySchema<StringTypeStruct> = ArraySchema {
                r#type: ArrayTypeTag::Array,
                items: StringTypeStruct::default(),
                min_items: None,
                max_items: None,
            };

            check_repr_serialization_from_value(
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                }),
                Some(ValueOrArray::Array(expected)),
            );
        }

        #[test]
        fn additional_properties() {
            let as_json = json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            });

            ensure_repr_failed_deserialization::<ArraySchema<StringTypeStruct>>(as_json);
        }
    }
}
