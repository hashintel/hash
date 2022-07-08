use serde::{Deserialize, Serialize};

/// Will serialize as a constant field `"array"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    Array,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Array {
    r#type: ArrayTypeTag,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl Array {
    #[must_use]
    pub fn new(min_items: impl Into<Option<usize>>, max_items: impl Into<Option<usize>>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            min_items: min_items.into(),
            max_items: max_items.into(),
        }
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TypedArray<T> {
    items: T,
    #[serde(flatten)]
    array: Array,
}

impl<T> TypedArray<T> {
    #[must_use]
    pub fn new(
        items: T,
        min_items: impl Into<Option<usize>>,
        max_items: impl Into<Option<usize>>,
    ) -> Self {
        Self {
            items,
            array: Array::new(min_items, max_items),
        }
    }

    #[must_use]
    pub const fn items(&self) -> &T {
        &self.items
    }

    #[must_use]
    pub const fn min_items(&self) -> Option<usize> {
        self.array.min_items()
    }

    #[must_use]
    pub const fn max_items(&self) -> Option<usize> {
        self.array.max_items()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaybeOrderedArray {
    #[serde(default)]
    ordered: bool,
    #[serde(flatten)]
    array: Array,
}

impl MaybeOrderedArray {
    #[must_use]
    pub fn new(
        ordered: bool,
        min_items: impl Into<Option<usize>>,
        max_items: impl Into<Option<usize>>,
    ) -> Self {
        Self {
            ordered,
            array: Array::new(min_items, max_items),
        }
    }

    #[must_use]
    pub const fn ordered(&self) -> bool {
        self.ordered
    }

    #[must_use]
    pub const fn min_items(&self) -> Option<usize> {
        self.array.min_items()
    }

    #[must_use]
    pub const fn max_items(&self) -> Option<usize> {
        self.array.max_items()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::types::schema::tests::{check, check_deserialization, check_invalid_json};

    mod untyped {
        use super::*;

        #[test]
        fn unconstrained() -> Result<(), serde_json::Error> {
            check(
                &Array::new(None, None),
                json!({
                    "type": "array",
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &Array::new(10, None),
                json!({
                    "type": "array",
                    "minItems": 10,
                }),
            )?;

            check(
                &Array::new(None, 20),
                json!({
                    "type": "array",
                    "maxItems": 20,
                }),
            )?;

            check(
                &Array::new(10, 20),
                json!({
                    "type": "array",
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )?;

            Ok(())
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<Array>(json!({
                "type": "array",
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            }));
        }
    }

    mod typed {
        use super::*;

        #[test]
        fn unconstrained() -> Result<(), serde_json::Error> {
            check(
                &TypedArray::new("string".to_owned(), None, None),
                json!({
                    "type": "array",
                    "items": "string",
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &TypedArray::new("string".to_owned(), 10, None),
                json!({
                    "type": "array",
                    "items": "string",
                    "minItems": 10,
                }),
            )?;

            check(
                &TypedArray::new("string".to_owned(), None, 20),
                json!({
                    "type": "array",
                    "items": "string",
                    "maxItems": 20,
                }),
            )?;

            check(
                &TypedArray::new("string".to_owned(), 10, 20),
                json!({
                    "type": "array",
                    "items": "string",
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )?;

            Ok(())
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<TypedArray<String>>(json!({
                "type": "array",
                "items": "string",
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            }));
        }
    }

    mod maybe_ordered {
        use super::*;

        #[test]
        fn unordered() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(false, None, None),
                json!({
                    "type": "array",
                    "ordered": false,
                }),
            )?;

            check_deserialization(
                &MaybeOrderedArray::new(false, None, None),
                json!({
                    "type": "array"
                }),
            )?;

            Ok(())
        }

        #[test]
        fn ordered() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(true, None, None),
                json!({
                    "type": "array",
                    "ordered": true
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(false, 10, None),
                json!({
                    "type": "array",
                    "ordered": false,
                    "minItems": 10,
                }),
            )?;

            check(
                &MaybeOrderedArray::new(false, None, 20),
                json!({
                    "type": "array",
                    "ordered": false,
                    "maxItems": 20,
                }),
            )?;

            check(
                &MaybeOrderedArray::new(true, 10, 20),
                json!({
                    "type": "array",
                    "ordered": true,
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )?;

            Ok(())
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<MaybeOrderedArray>(json!({
                "type": "array",
                "ordered": false,
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            }));
        }
    }
}
