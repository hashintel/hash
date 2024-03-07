use std::str::FromStr;

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use {tsify::Tsify, wasm_bindgen::prelude::*};

use crate::{
    raw,
    url::{ParseVersionedUrlError, VersionedUrl},
    ParsePropertyTypeError,
};

const META_SCHEMA_ID: &str =
    "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type";

/// Will serialize as a constant value `"propertyType"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum PropertyTypeTag {
    PropertyType,
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyType {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "'https://blockprotocol.org/types/modules/graph/0.3/schema/property-type'")
    )]
    #[serde(rename = "$schema")]
    schema: String,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "'propertyType'"))]
    kind: PropertyTypeTag,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "VersionedUrl"))]
    #[serde(rename = "$id")]
    id: String,
    title: String,
    #[cfg_attr(target_arch = "wasm32", tsify(optional))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(flatten)]
    one_of: raw::OneOf<PropertyValues>,
}

impl TryFrom<PropertyType> for super::PropertyType {
    type Error = ParsePropertyTypeError;

    fn try_from(property_type_repr: PropertyType) -> Result<Self, Self::Error> {
        let id = VersionedUrl::from_str(&property_type_repr.id)
            .map_err(ParsePropertyTypeError::InvalidVersionedUrl)?;

        if property_type_repr.schema != META_SCHEMA_ID {
            return Err(ParsePropertyTypeError::InvalidMetaSchema(
                property_type_repr.schema,
            ));
        }

        Ok(Self::new(
            id,
            property_type_repr.title,
            property_type_repr.description,
            property_type_repr
                .one_of
                .try_into()
                .map_err(|err| ParsePropertyTypeError::InvalidOneOf(Box::new(err)))?,
        ))
    }
}

impl From<super::PropertyType> for PropertyType {
    fn from(property_type: super::PropertyType) -> Self {
        Self {
            schema: META_SCHEMA_ID.to_owned(),
            kind: PropertyTypeTag::PropertyType,
            id: property_type.id.to_string(),
            title: property_type.title,
            description: property_type.description,
            one_of: property_type.one_of.into(),
        }
    }
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PropertyTypeReference {
    #[cfg_attr(target_arch = "wasm32", tsify(type = "VersionedUrl"))]
    #[serde(rename = "$ref")]
    pub url: String,
}

impl PropertyTypeReference {
    #[must_use]
    pub const fn new(url: String) -> Self {
        Self { url }
    }
}

impl TryFrom<PropertyTypeReference> for super::PropertyTypeReference {
    type Error = ParseVersionedUrlError;

    fn try_from(property_type_ref_repr: PropertyTypeReference) -> Result<Self, Self::Error> {
        let url = VersionedUrl::from_str(&property_type_ref_repr.url)?;
        Ok(Self::new(url))
    }
}

impl From<super::PropertyTypeReference> for PropertyTypeReference {
    fn from(property_type_ref: super::PropertyTypeReference) -> Self {
        Self {
            url: property_type_ref.url.to_string(),
        }
    }
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyValues {
    DataTypeReference(raw::DataTypeReference),
    PropertyTypeObject(raw::Object<raw::ValueOrArray<PropertyTypeReference>>),
    ArrayOfPropertyValues(
        // This is a hack, currently recursive enums seem to break tsify
        // https://github.com/madonoharu/tsify/issues/5
        #[cfg_attr(target_arch = "wasm32", tsify(type = "Array<OneOf<PropertyValues>>"))]
        raw::Array<raw::OneOf<PropertyValues>>,
    ),
}

impl TryFrom<PropertyValues> for super::PropertyValues {
    type Error = ParsePropertyTypeError;

    fn try_from(property_values_repr: PropertyValues) -> Result<Self, Self::Error> {
        Ok(match property_values_repr {
            PropertyValues::DataTypeReference(data_type_ref_repr) => Self::DataTypeReference(
                data_type_ref_repr
                    .try_into()
                    .map_err(ParsePropertyTypeError::InvalidDataTypeReference)?,
            ),
            PropertyValues::PropertyTypeObject(property_type_object_repr) => {
                Self::PropertyTypeObject(
                    property_type_object_repr
                        .try_into()
                        .map_err(ParsePropertyTypeError::InvalidPropertyTypeObject)?,
                )
            }
            PropertyValues::ArrayOfPropertyValues(array_repr) => Self::ArrayOfPropertyValues(
                array_repr
                    .try_into()
                    .map_err(|err| ParsePropertyTypeError::InvalidArrayItems(Box::new(err)))?,
            ),
        })
    }
}

impl From<super::PropertyValues> for PropertyValues {
    fn from(property_values: super::PropertyValues) -> Self {
        match property_values {
            super::PropertyValues::DataTypeReference(data_type_ref) => {
                Self::DataTypeReference(data_type_ref.into())
            }
            super::PropertyValues::PropertyTypeObject(property_type_object) => {
                Self::PropertyTypeObject(property_type_object.into())
            }
            super::PropertyValues::ArrayOfPropertyValues(array) => {
                Self::ArrayOfPropertyValues(array.into())
            }
        }
    }
}
