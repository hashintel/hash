use serde::{Deserialize, Serialize};

/// Will serialize as a constant value `"array"`
#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    #[default]
    Array,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Array {
    r#type: ArrayTypeTag,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl Array {
    #[must_use]
    pub const fn new(min_items: Option<usize>, max_items: Option<usize>) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            min_items,
            max_items,
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
pub struct Itemized<A, T> {
    #[serde(flatten)]
    array: A,
    items: T,
}

impl<A, T> Itemized<A, T> {
    #[must_use]
    pub const fn new(array: A, items: T) -> Self {
        Self { array, items }
    }

    #[must_use]
    pub const fn array(&self) -> &A {
        &self.array
    }

    #[must_use]
    pub const fn items(&self) -> &T {
        &self.items
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaybeOrderedItemizedArray<T> {
    #[serde(flatten)]
    array: Itemized<Array, T>,
    // By default, this will not be ordered.
    #[serde(default)]
    ordered: bool,
}

impl<T> MaybeOrderedItemizedArray<T> {
    #[must_use]
    pub const fn new(
        items: T,
        ordered: bool,
        min_items: Option<usize>,
        max_items: Option<usize>,
    ) -> Self {
        Self {
            array: Itemized::new(Array::new(min_items, max_items), items),
            ordered,
        }
    }

    #[must_use]
    pub const fn array(&self) -> &Itemized<Array, T> {
        &self.array
    }

    #[must_use]
    pub const fn ordered(&self) -> bool {
        self.ordered
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
                &Array::default(),
                json!({
                    "type": "array",
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &Array::new(Some(10), None),
                json!({
                    "type": "array",
                    "minItems": 10,
                }),
            )?;

            check(
                &Array::new(None, Some(20)),
                json!({
                    "type": "array",
                    "maxItems": 20,
                }),
            )?;

            check(
                &Array::new(Some(10), Some(20)),
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
                &Itemized::new(Array::default(), "string".to_owned()),
                json!({
                    "type": "array",
                    "items": "string",
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &Itemized::new(Array::new(Some(10), Some(20)), "string".to_owned()),
                json!({
                    "type": "array",
                    "items": "string",
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<Itemized<Array, String>>(json!({
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
                &MaybeOrderedItemizedArray::new("string".to_owned(), false, None, None),
                json!({
                    "type": "array",
                    "items": "string",
                    "ordered": false,
                }),
            )?;

            check_deserialization(
                &MaybeOrderedItemizedArray::new("string".to_owned(), false, None, None),
                json!({
                    "type": "array",
                    "items": "string"
                }),
            )?;

            Ok(())
        }

        #[test]
        fn ordered() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedItemizedArray::new("string".to_owned(), true, None, None),
                json!({
                    "type": "array",
                    "items": "string",
                    "ordered": true
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedItemizedArray::new("string".to_owned(), false, Some(10), Some(20)),
                json!({
                    "type": "array",
                    "items": "string",
                    "ordered": false,
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<MaybeOrderedItemizedArray<Array>>(json!({
                "type": "array",
                "ordered": false,
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            }));
        }
    }
}
