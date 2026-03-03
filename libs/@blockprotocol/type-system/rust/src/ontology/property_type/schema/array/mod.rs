mod raw;
mod validation;

use serde::{Deserialize, Serialize, Serializer};

pub use self::validation::{ArraySchemaValidationError, ArraySchemaValidator};
use super::{PropertyType, PropertyValues};
use crate::ontology::json_schema::OneOfSchema;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(from = "raw::PropertyValueArray<T>")]
pub struct PropertyValueArray<T> {
    pub items: T,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
}

impl<T> Serialize for PropertyValueArray<T>
where
    T: Serialize,
{
    #[inline]
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::ArraySchemaRef::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(PropertyValueArray<T>),
}

pub trait PropertyArraySchema {
    fn possibilities(&self) -> &[PropertyValues];
    fn min_items(&self) -> Option<usize>;
    fn max_items(&self) -> Option<usize>;
}

impl PropertyArraySchema for PropertyValueArray<OneOfSchema<PropertyValues>> {
    fn possibilities(&self) -> &[PropertyValues] {
        &self.items.possibilities
    }

    fn min_items(&self) -> Option<usize> {
        self.min_items
    }

    fn max_items(&self) -> Option<usize> {
        self.max_items
    }
}

impl PropertyArraySchema for PropertyValueArray<&PropertyType> {
    fn possibilities(&self) -> &[PropertyValues] {
        &self.items.one_of
    }

    fn min_items(&self) -> Option<usize> {
        self.min_items
    }

    fn max_items(&self) -> Option<usize> {
        self.max_items
    }
}
