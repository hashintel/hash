use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::url::BaseUrl;

#[derive(Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
enum ObjectTypeTag {
    Object,
}

#[derive(Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ObjectSchema<T> {
    #[serde(rename = "type")]
    _type: ObjectTypeTag,
    properties: HashMap<BaseUrl, T>,
    #[serde(default)]
    required: HashSet<BaseUrl>,
}

impl<T> From<ObjectSchema<T>> for super::ObjectSchema<T> {
    fn from(object: ObjectSchema<T>) -> Self {
        Self {
            properties: object.properties,
            required: object.required,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ObjectSchemaRef<'a, T> {
    r#type: ObjectTypeTag,
    properties: &'a HashMap<BaseUrl, T>,
    #[serde(skip_serializing_if = "HashSet::is_empty")]
    required: &'a HashSet<BaseUrl>,
}

impl<'a, T> From<&'a super::ObjectSchema<T>> for ObjectSchemaRef<'a, T> {
    fn from(object: &'a super::ObjectSchema<T>) -> Self {
        Self {
            r#type: ObjectTypeTag::Object,
            properties: &object.properties,
            required: &object.required,
        }
    }
}
