use crate::ontology::json_schema::ArrayTypeTag;

#[derive(serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyValueArray<T> {
    #[serde(rename = "type")]
    _type: ArrayTypeTag,
    items: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<T> From<PropertyValueArray<T>> for super::PropertyValueArray<T> {
    fn from(object: PropertyValueArray<T>) -> Self {
        Self {
            items: object.items,
            min_items: object.min_items,
            max_items: object.max_items,
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ArraySchemaRef<'a, T> {
    r#type: ArrayTypeTag,
    items: &'a T,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<'a, T> From<&'a super::PropertyValueArray<T>> for ArraySchemaRef<'a, T> {
    fn from(object: &'a super::PropertyValueArray<T>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            items: &object.items,
            min_items: object.min_items,
            max_items: object.max_items,
        }
    }
}
