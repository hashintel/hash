use alloc::borrow::Cow;

use serde::{Deserialize, Serialize};

use super::PropertyValues;
use crate::ontology::VersionedUrl;

#[derive(Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
enum PropertyTypeSchemaTag {
    #[serde(rename = "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type")]
    V3,
}

#[derive(Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
enum PropertyTypeTag {
    PropertyType,
}

#[derive(Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyType<'a> {
    #[serde(rename = "$schema")]
    schema: PropertyTypeSchemaTag,
    kind: PropertyTypeTag,
    #[serde(rename = "$id")]
    id: Cow<'a, VersionedUrl>,
    title: Cow<'a, str>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title_plural: Option<Cow<'a, str>>,
    description: Cow<'a, str>,
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[PropertyValues, ...PropertyValues[]]")
    )]
    one_of: Cow<'a, [PropertyValues]>,
}

impl From<PropertyType<'_>> for super::PropertyType {
    fn from(property_type: PropertyType<'_>) -> Self {
        Self {
            id: property_type.id.into_owned(),
            title: property_type.title.into_owned(),
            title_plural: property_type.title_plural.map(Cow::into_owned),
            description: property_type.description.into_owned(),
            one_of: property_type.one_of.into_owned(),
        }
    }
}

impl<'a> From<&'a super::PropertyType> for PropertyType<'a> {
    fn from(property_type: &'a super::PropertyType) -> Self {
        Self {
            schema: PropertyTypeSchemaTag::V3,
            kind: PropertyTypeTag::PropertyType,
            id: Cow::Borrowed(&property_type.id),
            title: Cow::Borrowed(&property_type.title),
            title_plural: property_type.title_plural.as_deref().map(Cow::Borrowed),
            description: Cow::Borrowed(&property_type.description),
            one_of: Cow::Borrowed(&property_type.one_of),
        }
    }
}
