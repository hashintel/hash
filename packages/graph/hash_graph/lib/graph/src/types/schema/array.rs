use serde::{Deserialize, Serialize};

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
