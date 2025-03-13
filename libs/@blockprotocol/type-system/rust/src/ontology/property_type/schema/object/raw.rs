use std::collections::{HashMap, HashSet};

use crate::ontology::{BaseUrl, json_schema::ObjectTypeTag};

#[derive(serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyValueObject<T> {
    #[serde(rename = "type")]
    _type: ObjectTypeTag,
    properties: HashMap<BaseUrl, T>,
    #[serde(default)]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[BaseUrl, ...BaseUrl[]]"))]
    required: HashSet<BaseUrl>,
}

impl<T> From<PropertyValueObject<T>> for super::PropertyValueObject<T> {
    fn from(object: PropertyValueObject<T>) -> Self {
        Self {
            properties: object.properties,
            required: object.required,
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ObjectSchemaRef<'a, T> {
    r#type: ObjectTypeTag,
    properties: &'a HashMap<BaseUrl, T>,
    #[serde(skip_serializing_if = "HashSet::is_empty")]
    required: &'a HashSet<BaseUrl>,
}

impl<'a, T> From<&'a super::PropertyValueObject<T>> for ObjectSchemaRef<'a, T> {
    fn from(object: &'a super::PropertyValueObject<T>) -> Self {
        Self {
            r#type: ObjectTypeTag::Object,
            properties: &object.properties,
            required: &object.required,
        }
    }
}
