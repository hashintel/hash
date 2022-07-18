use serde::{Deserialize, Serialize};

/// Will serialize as a constant value `"array"`
#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    #[default]
    Array,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Array<T> {
    r#type: ArrayTypeTag,
    items: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<T> Array<T> {
    #[must_use]
    pub const fn new(items: T, min_items: Option<usize>, max_items: Option<usize>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::types::schema::tests::{check, check_invalid_json, StringTypeStruct};

    #[test]
    fn unconstrained() -> Result<(), serde_json::Error> {
        check(
            &Array::new(StringTypeStruct::default(), None, None),
            json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
            }),
        )
    }

    #[test]
    fn constrained() -> Result<(), serde_json::Error> {
        check(
            &Array::new(StringTypeStruct::default(), Some(10), Some(20)),
            json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "minItems": 10,
                "maxItems": 20,
            }),
        )
    }

    #[test]
    fn additional_properties() {
        check_invalid_json::<Array<StringTypeStruct>>(json!({
            "type": "array",
            "items": {
                "type": "string"
            },
            "minItems": 10,
            "maxItems": 20,
            "additional": 30,
        }));
    }
}
