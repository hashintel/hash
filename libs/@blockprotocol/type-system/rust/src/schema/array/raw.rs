use serde::{Deserialize, Serialize};

/// Will serialize as a constant value `"array"`
#[derive(Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    Array,
}

#[derive(Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ArraySchema<T> {
    #[serde(rename = "type")]
    _type: ArrayTypeTag,
    items: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<T> From<ArraySchema<T>> for super::ArraySchema<T> {
    fn from(object: ArraySchema<T>) -> Self {
        Self {
            items: object.items,
            min_items: object.min_items,
            max_items: object.max_items,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ArraySchemaRef<'a, T> {
    r#type: ArrayTypeTag,
    items: &'a T,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<'a, T> From<&'a super::ArraySchema<T>> for ArraySchemaRef<'a, T> {
    fn from(object: &'a super::ArraySchema<T>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            items: &object.items,
            min_items: object.min_items,
            max_items: object.max_items,
        }
    }
}
